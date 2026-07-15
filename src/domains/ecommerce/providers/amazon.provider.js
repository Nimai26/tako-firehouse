/**
 * Provider Amazon - Version simplifiée pour Tako_Api
 * Utilise FlareSolverr pour contourner la protection Cloudflare
 * 
 * ⚠️ LIMITATIONS:
 * - Version simplifiée (sans Gluetun VPN + Puppeteer Stealth de toys_api)
 * - FlareSolverr uniquement
 * - Rate limiting manuel recommandé
 * - Amazon peut détecter et bloquer en cas d'usage intensif
 * 
 * @module domains/ecommerce/providers/amazon
 */

import { logger } from '../../../shared/utils/logger.js';
import { FlareSolverrClient } from '../../../infrastructure/scraping/FlareSolverrClient.js';
import { env } from '../../../config/env.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const AMAZON_CACHE_TTL = 600000; // 10 minutes

/**
 * Marketplaces Amazon supportés
 */
export const AMAZON_MARKETPLACES = {
  fr: {
    domain: "www.amazon.fr",
    baseUrl: "https://www.amazon.fr",
    locale: "fr_FR",
    currency: "EUR",
    name: "Amazon France"
  },
  us: {
    domain: "www.amazon.com",
    baseUrl: "https://www.amazon.com",
    locale: "en_US",
    currency: "USD",
    name: "Amazon US"
  },
  uk: {
    domain: "www.amazon.co.uk",
    baseUrl: "https://www.amazon.co.uk",
    locale: "en_GB",
    currency: "GBP",
    name: "Amazon UK"
  },
  de: {
    domain: "www.amazon.de",
    baseUrl: "https://www.amazon.de",
    locale: "de_DE",
    currency: "EUR",
    name: "Amazon Allemagne"
  },
  es: {
    domain: "www.amazon.es",
    baseUrl: "https://www.amazon.es",
    locale: "es_ES",
    currency: "EUR",
    name: "Amazon Espagne"
  },
  it: {
    domain: "www.amazon.it",
    baseUrl: "https://www.amazon.it",
    locale: "it_IT",
    currency: "EUR",
    name: "Amazon Italie"
  },
  ca: {
    domain: "www.amazon.ca",
    baseUrl: "https://www.amazon.ca",
    locale: "en_CA",
    currency: "CAD",
    name: "Amazon Canada"
  },
  jp: {
    domain: "www.amazon.co.jp",
    baseUrl: "https://www.amazon.co.jp",
    locale: "ja_JP",
    currency: "JPY",
    name: "Amazon Japon"
  }
};

/**
 * Catégories Amazon avec leurs search alias
 */
export const AMAZON_CATEGORIES = {
  all: { name: "Tous", searchAlias: "aps" },
  videogames: { name: "Jeux vidéo", searchAlias: "videogames" },
  toys: { name: "Jouets", searchAlias: "toys-and-games" },
  books: { name: "Livres", searchAlias: "stripbooks" },
  music: { name: "Musique", searchAlias: "popular" },
  movies: { name: "Films & Séries", searchAlias: "dvd" },
  electronics: { name: "High-Tech", searchAlias: "electronics" }
};

// Client FlareSolverr
let fsrClient = null;

/**
 * Récupère ou crée le client FlareSolverr
 * @returns {FlareSolverrClient}
 */
function getFsrClient() {
  if (!fsrClient) {
    fsrClient = new FlareSolverrClient('Amazon');
  }
  return fsrClient;
}

/**
 * Options FlareSolverr pour Amazon (inclut le proxy VPN si configuré)
 * @returns {Object} Options à passer à fsr.get()
 */
function getAmazonFsrOptions() {
  const options = {};
  if (env.vpn?.proxyUrl) {
    options.proxy = env.vpn.proxyUrl;
  }
  return options;
}

/**
 * Détecte si la réponse est une page de challenge AWS WAF
 * (page JS qui demande un token avant de rediriger)
 * @param {string} html - HTML de la réponse
 * @returns {boolean}
 */
function isWafChallenge(html) {
  if (!html || html.length > 5000) return false;
  return html.includes('awsWafCookieDomainList') || html.includes('challenge.js');
}

/**
 * Détecte si Amazon a bloqué la requête (CAPTCHA, bot detection, etc.)
 * @param {string} html - HTML de la réponse
 * @returns {{ blocked: boolean, reason: string|null }}
 */
function detectAmazonBlock(html) {
  if (!html) return { blocked: true, reason: 'empty_response' };
  
  // Page "Toutes nos excuses" / "Sorry" (erreur 503 bot-detection)
  if (html.includes('api-services-support@amazon') || html.includes('automated access')) {
    return { blocked: true, reason: 'bot_detection' };
  }
  
  // CAPTCHA
  if (/captcha/i.test(html) && html.length < 10000) {
    return { blocked: true, reason: 'captcha' };
  }
  
  // Page "Toutes nos excuses" générique
  if (/<title>[^<]*excuses|<title>[^<]*sorry/i.test(html) && html.length < 5000) {
    return { blocked: true, reason: 'error_page' };
  }
  
  return { blocked: false, reason: null };
}

// Nombre max de tentatives pour résoudre un WAF challenge
const WAF_MAX_RETRIES = 2;
const WAF_RETRY_DELAY = 4000; // 4 secondes entre les tentatives

/**
 * Récupère une page Amazon via FlareSolverr avec gestion automatique
 * du challenge AWS WAF (warm-up session + retry).
 * 
 * Flux :
 * 1. Warm-up la session FlareSolverr sur le domaine Amazon (cookies WAF)
 * 2. Requête vers l'URL cible
 * 3. Si WAF challenge retourné → retry après délai (la session a résolu le JS)
 * 
 * @param {string} url - URL Amazon à charger
 * @param {string} baseUrl - URL de base du marketplace (pour le warm-up)
 * @returns {Promise<string>} - HTML de la page
 */
async function fetchAmazonPage(url, baseUrl) {
  const client = getFsrClient();
  const fsrOptions = getAmazonFsrOptions();

  // Warm-up : créer/réutiliser une session et visiter le domaine Amazon
  // → résout le WAF challenge en arrière-plan (JS + cookies)
  await client.ensureSession(baseUrl, fsrOptions);

  for (let attempt = 1; attempt <= WAF_MAX_RETRIES; attempt++) {
    const html = await client.get(url, fsrOptions);

    if (!html || html.length < 500) {
      throw new Error('Réponse Amazon vide ou invalide');
    }

    // Si c'est un WAF challenge et qu'on peut retry
    if (isWafChallenge(html)) {
      if (attempt < WAF_MAX_RETRIES) {
        logger.info(`[Amazon] WAF challenge détecté (${html.length} bytes), retry ${attempt}/${WAF_MAX_RETRIES} dans ${WAF_RETRY_DELAY / 1000}s...`);
        await new Promise(r => setTimeout(r, WAF_RETRY_DELAY));
        continue;
      }
      logger.warn(`[Amazon] WAF challenge non résolu après ${WAF_MAX_RETRIES} tentatives`);
      throw new Error('AWS WAF challenge non résolu. Réessayez dans quelques secondes.');
    }

    // Vérifier blocage Amazon (bot detection, CAPTCHA, etc.)
    const block = detectAmazonBlock(html);
    if (block.blocked) {
      logger.warn(`[Amazon] Requête bloquée par Amazon: ${block.reason} (proxy: ${fsrOptions.proxy || 'aucun'})`);
      throw new Error(`Amazon a bloqué la requête (${block.reason}). ${fsrOptions.proxy ? 'Le VPN est peut-être détecté.' : 'Configurez VPN_PROXY_URL pour utiliser un proxy.'}`);
    }

    return html;
  }

  throw new Error('Échec récupération page Amazon');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Décode les entités HTML
 */
function decodeHtmlEntities(text) {
  if (!text) return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Parse un prix Amazon
 */
function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr
    .replace(/[€$£¥CAD]/gi, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

/**
 * Extrait les résultats de recherche du HTML
 */
function parseSearchResults(html, country = "fr") {
  const marketplace = AMAZON_MARKETPLACES[country] || AMAZON_MARKETPLACES.fr;
  const results = [];
  const seenAsins = new Set();
  
  // Extraire tous les ASIN
  const asinPattern = /\/dp\/([A-Z0-9]{10})/g;
  let match;
  const asins = [];
  
  while ((match = asinPattern.exec(html)) !== null) {
    if (!seenAsins.has(match[1])) {
      seenAsins.add(match[1]);
      asins.push(match[1]);
    }
  }
  
  // Pour chaque ASIN, extraire les infos
  for (const asin of asins.slice(0, 30)) {
    const product = {
      asin,
      source: "amazon",
      marketplace: country,
      url: `${marketplace.baseUrl}/dp/${asin}`
    };
    
    // Titre depuis l'attribut alt de l'image
    const imgAltRegex = new RegExp(`data-asin="${asin}"[\\s\\S]*?<img[^>]*class="s-image"[^>]*alt="([^"]+)"`, 'i');
    const imgAltMatch = html.match(imgAltRegex);
    if (imgAltMatch) {
      product.title = decodeHtmlEntities(imgAltMatch[1].trim()).replace(/\.\.\.$/, '').trim();
    }
    
    // Fallback titre
    if (!product.title) {
      const titleRegex = new RegExp(`data-asin="${asin}"[^>]*>[\\s\\S]*?class="[^"]*a-text-normal[^"]*"[^>]*>([^<]+)<`, 'i');
      const titleMatch = html.match(titleRegex);
      if (titleMatch && titleMatch[1].trim().length > 10) {
        product.title = decodeHtmlEntities(titleMatch[1].trim());
      }
    }
    
    if (!product.title) continue;
    
    // Image
    const imgRegex = new RegExp(`data-asin="${asin}"[\\s\\S]*?<img[^>]*class="s-image"[^>]*src="([^"]+)"`, 'i');
    const imgMatch = html.match(imgRegex);
    if (imgMatch) {
      product.image = imgMatch[1].replace(/\._AC_[^.]*_\./, '._SL500_.');
    }
    
    // Prix depuis le bloc produit
    const asinIndex = html.indexOf(`data-asin="${asin}"`);
    if (asinIndex !== -1) {
      const nextAsinIndex = html.indexOf('data-asin="', asinIndex + 20);
      const blockEnd = nextAsinIndex !== -1 ? nextAsinIndex : asinIndex + 5000;
      const productBlock = html.substring(asinIndex, Math.min(blockEnd, html.length));
      
      // Prix
      const priceMatch = productBlock.match(/class="[^"]*a-price[^"]*"[^>]*>\s*<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([^<]+)</i);
      if (priceMatch) {
        product.price = decodeHtmlEntities(priceMatch[1].trim());
        product.priceValue = parsePrice(product.price);
        product.currency = marketplace.currency;
      }
      
      // Prime
      product.isPrime = productBlock.includes('a-icon-prime');
      
      // Rating
      const ratingMatch = productBlock.match(/class="[^"]*a-icon-alt[^"]*"[^>]*>([0-9,\.]+)\s*(?:sur|out of|von|de|di)\s*5/i);
      if (ratingMatch) {
        product.rating = parseFloat(ratingMatch[1].replace(",", "."));
      }
      
      // Reviews
      const reviewMatch = productBlock.match(/aria-label="[^"]*(\d[\d\s,.]*)\s*(?:évaluation|avis|review|bewertung)/i);
      if (reviewMatch) {
        product.reviewCount = parseInt(reviewMatch[1].replace(/[\s,\.]/g, ""));
      }
    }
    
    results.push(product);
  }
  
  return results;
}

/**
 * Extrait les détails d'un produit du HTML
 */
function parseProductDetails(html, asin, country = "fr") {
  const marketplace = AMAZON_MARKETPLACES[country] || AMAZON_MARKETPLACES.fr;
  
  const product = {
    asin,
    source: "amazon",
    marketplace: country,
    url: `${marketplace.baseUrl}/dp/${asin}`
  };
  
  // Titre
  const titleMatch = html.match(/id="productTitle"[^>]*>([^<]+)</i) ||
                     html.match(/property="og:title"[^>]*content="([^"]+)"/i);
  if (titleMatch) {
    product.title = decodeHtmlEntities(titleMatch[1].trim());
  }
  
  // Images
  const images = [];
  const imgPattern = /"hiRes"\s*:\s*"([^"]+)"/gi;
  let imgMatch;
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    if (!images.includes(imgMatch[1])) {
      images.push(imgMatch[1]);
    }
  }
  
  // Image principale
  const mainImgMatch = html.match(/id="landingImage"[^>]*src="([^"]+)"/i);
  if (mainImgMatch && !images.includes(mainImgMatch[1])) {
    images.unshift(mainImgMatch[1].replace(/\._[^.]+_\./, '._SL1500_.'));
  }
  
  if (images.length > 0) {
    product.images = images;
    product.image = images[0];
  }
  
  // Prix
  const priceMatch = html.match(/class="[^"]*priceToPay[^"]*"[^>]*>\s*<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([^<]+)</i) ||
                     html.match(/id="priceblock_ourprice"[^>]*>([^<]+)</i);
  if (priceMatch) {
    product.price = decodeHtmlEntities(priceMatch[1].trim());
    product.priceValue = parsePrice(product.price);
    product.currency = marketplace.currency;
  }
  
  // Rating
  const ratingMatch = html.match(/class="[^"]*a-icon-alt[^"]*"[^>]*>([0-9,\.]+)\s*(?:sur|out of|von|de|di)\s*5/i);
  if (ratingMatch) {
    product.rating = parseFloat(ratingMatch[1].replace(",", "."));
  }
  
  // Reviews
  const reviewsMatch = html.match(/id="acrCustomerReviewText"[^>]*>([0-9\s,.]+)/i);
  if (reviewsMatch) {
    product.reviewCount = parseInt(reviewsMatch[1].replace(/[\s,\.]/g, ""));
  }
  
  // Description
  const descMatch = html.match(/id="productDescription"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    let desc = descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    product.description = decodeHtmlEntities(desc).substring(0, 1000);
  }
  
  // Prime
  product.isPrime = html.includes('a-icon-prime');
  
  // Marque
  const brandMatch = html.match(/>\s*Marque\s*[:：]\s*<\/span>\s*<span[^>]*>([^<]+)</i) ||
                     html.match(/>\s*Brand\s*[:：]\s*<\/span>\s*<span[^>]*>([^<]+)</i);
  if (brandMatch) {
    product.brand = decodeHtmlEntities(brandMatch[1].trim());
  }
  
  return product;
}

// ============================================================================
// FONCTIONS PRINCIPALES
// ============================================================================

/**
 * Recherche de produits sur Amazon
 * 
 * @param {string} query - Terme de recherche
 * @param {object} options - Options de recherche
 * @param {string} options.country - Code pays (fr, us, uk, de, es, it, ca, jp)
 * @param {string} options.category - Catégorie (videogames, toys, books, etc.)
 * @param {number} options.page - Page de résultats
 * @param {number} options.limit - Limite de résultats
 * @returns {Promise<object>} - Résultats de recherche
 */
export async function searchAmazon(query, options = {}) {
  const {
    country = "fr",
    category = "all",
    page = 1,
    limit = 20
  } = options;
  
  const marketplace = AMAZON_MARKETPLACES[country];
  if (!marketplace) {
    throw new Error(`Marketplace non supporté: ${country}. Valides: ${Object.keys(AMAZON_MARKETPLACES).join(', ')}`);
  }
  
  const cat = AMAZON_CATEGORIES[category] || AMAZON_CATEGORIES.all;
  
  // Construire URL
  const params = new URLSearchParams({
    k: query,
    page: page.toString()
  });
  
  if (cat.searchAlias) {
    params.set("i", cat.searchAlias);
  }
  
  const searchUrl = `${marketplace.baseUrl}/s?${params.toString()}`;
  
  logger.info(`[Amazon] Recherche "${query}" sur ${marketplace.name}...`);
  
  try {
    const html = await fetchAmazonPage(searchUrl, marketplace.baseUrl);
    
    // Parser
    const products = parseSearchResults(html, country);
    
    const result = {
      query,
      country,
      marketplace: marketplace.name,
      category: cat.name,
      page,
      total: products.length,
      results: products.slice(0, limit)
    };
    
    logger.info(`[Amazon] ${result.results.length} produits trouvés`);
    
    return result;
    
  } catch (error) {
    logger.error(`[Amazon] Erreur recherche: ${error.message}`);
    throw error;
  }
}

/**
 * Récupère les détails d'un produit par ASIN
 * 
 * @param {string} asin - Identifiant produit Amazon
 * @param {string} country - Code pays
 * @returns {Promise<object>} - Détails produit
 */
export async function getAmazonProduct(asin, country = "fr") {
  const marketplace = AMAZON_MARKETPLACES[country];
  if (!marketplace) {
    throw new Error(`Marketplace non supporté: ${country}`);
  }
  
  const productUrl = `${marketplace.baseUrl}/dp/${asin}`;
  
  logger.info(`[Amazon] Détails produit ${asin} sur ${marketplace.name}...`);
  
  try {
    const html = await fetchAmazonPage(productUrl, marketplace.baseUrl);
    
    if (html.includes("Looking for something") || html.includes("Nous n'avons rien trouvé")) {
      throw new Error(`Produit ${asin} non trouvé`);
    }
    
    const product = parseProductDetails(html, asin, country);
    
    logger.info(`[Amazon] Produit ${asin} récupéré`);
    
    return product;
    
  } catch (error) {
    logger.error(`[Amazon] Erreur détails produit: ${error.message}`);
    throw error;
  }
}

/**
 * Compare les prix d'un produit sur plusieurs marketplaces
 * 
 * @param {string} asin - Identifiant produit
 * @param {string[]} countries - Codes pays à comparer
 * @returns {Promise<object>} - Comparaison de prix
 */
export async function comparePrices(asin, countries = ["fr", "us", "uk", "de"]) {
  logger.info(`[Amazon] Comparaison prix ${asin} sur ${countries.length} pays...`);
  
  const results = [];
  
  for (const country of countries) {
    try {
      const product = await getAmazonProduct(asin, country);
      results.push({
        country,
        marketplace: AMAZON_MARKETPLACES[country].name,
        available: true,
        price: product.priceValue,
        currency: product.currency,
        priceFormatted: product.price,
        url: product.url,
        isPrime: product.isPrime
      });
    } catch (error) {
      logger.warn(`[Amazon] ${country}: ${error.message}`);
      results.push({
        country,
        marketplace: AMAZON_MARKETPLACES[country].name,
        available: false,
        error: error.message
      });
    }
  }
  
  return {
    asin,
    comparison: results,
    total: results.length,
    available: results.filter(r => r.available).length
  };
}

/**
 * Health check Amazon
 */
export async function healthCheck() {
  try {
    const client = getFsrClient();
    await client.healthCheck();
    
    return {
      healthy: true,
      status: 200,
      message: "Amazon accessible via FlareSolverr"
    };
  } catch (error) {
    return {
      healthy: false,
      status: 0,
      message: `FlareSolverr error: ${error.message}`
    };
  }
}

/**
 * Retourne les marketplaces supportés
 */
export function getSupportedMarketplaces() {
  return Object.entries(AMAZON_MARKETPLACES).map(([code, info]) => ({
    code,
    ...info
  }));
}

/**
 * Retourne les catégories supportées
 */
export function getSupportedCategories() {
  return Object.entries(AMAZON_CATEGORIES).map(([code, info]) => ({
    code,
    ...info
  }));
}
