/**
 * src/domains/collectibles/providers/coleka.provider.js - Provider Coleka
 * 
 * Site de référencement de figurines, LEGO, Funko Pop, et autres objets de collection
 * Utilise des requêtes HTTP directes avec User-Agent crawler pour contourner
 * la protection Cloudflare Turnstile (Coleka whitelist les crawlers search engine)
 * 
 * @module domains/collectibles/providers/coleka
 */

import { translateText, extractLangCode } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

const COLEKA_BASE_URL = 'https://www.coleka.com';
const MAX_RETRIES = 3;
const DEFAULT_NBPP = 20;

// Coleka whitelist les crawlers Google/Bing et ne leur impose pas le Turnstile
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const REQUEST_TIMEOUT = 15000;

/**
 * Effectue une requête HTTP directe vers Coleka avec le UA crawler
 * @param {string} url - URL à récupérer
 * @returns {Promise<string>} - HTML de la page
 */
async function fetchColeka(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': CRAWLER_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} pour ${url}`);
    }
    
    const html = await response.text();
    
    // Vérifier qu'on n'a pas été redirigé vers la page Turnstile
    if (html.includes('cf-turnstile') || html.includes('Vérification - COLEKA')) {
      throw new Error('Protection Cloudflare Turnstile active — le contournement crawler ne fonctionne plus');
    }
    
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Déduplique les images Coleka en gardant la meilleure qualité
 * Les URLs thumbs.coleka.com sont des miniatures avec suffixes de dimensions (ex: _470x246)
 * Les URLs www.coleka.com sont les originaux en pleine qualité
 * @param {string[]} images - Liste des URLs d'images
 * @returns {string[]} - Liste dédupliquée avec la meilleure qualité
 */
function deduplicateColekaImages(images) {
  if (!images || images.length === 0) return [];
  
  // Map pour stocker: clé normalisée -> meilleure URL
  const imageMap = new Map();
  
  for (const url of images) {
    if (!url) continue;
    
    // Extraire le nom de base de l'image (sans domaine ni dimensions)
    let baseName = url
      .replace(/^https?:\/\/(?:thumbs\.|www\.)?coleka\.com\//, '')
      .replace(/_\d+x\d+/, '')  // Retirer les dimensions
      .replace(/\.[^.]+$/, ''); // Retirer l'extension
    
    const existing = imageMap.get(baseName);
    
    if (!existing) {
      imageMap.set(baseName, url);
    } else {
      // Privilégier www.coleka.com sur thumbs.coleka.com
      const existingIsThumbnail = existing.includes('thumbs.coleka.com');
      const newIsThumbnail = url.includes('thumbs.coleka.com');
      
      if (existingIsThumbnail && !newIsThumbnail) {
        imageMap.set(baseName, url);
      } else if (existingIsThumbnail === newIsThumbnail) {
        const existingHasDimensions = /_\d+x\d+/.test(existing);
        const newHasDimensions = /_\d+x\d+/.test(url);
        if (existingHasDimensions && !newHasDimensions) {
          imageMap.set(baseName, url);
        }
      }
    }
  }
  
  return Array.from(imageMap.values());
}

/**
 * Recherche sur Coleka via requête HTTP directe
 * @param {string} searchTerm - Terme de recherche
 * @param {Object} options - Options de recherche
 * @param {number} options.maxResults - Nombre max de résultats (défaut: 20)
 * @param {string} options.lang - Langue (fr, en)
 * @param {string} options.category - Filtre par catégorie (lego, funko, figurines, etc.)
 * @param {boolean} options.autoTrad - Activer traduction automatique
 * @returns {Promise<Object>} - Résultats de recherche
 */
export async function searchColeka(searchTerm, options = {}) {
  const {
    maxResults = DEFAULT_NBPP,
    lang = 'fr',
    category = null,
    autoTrad = false
  } = options;
  
  const destLang = extractLangCode(lang);
  const shouldTranslate = autoTrad && destLang && destLang !== 'fr';
  
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    
    try {
      logger.debug(`[Coleka] Tentative ${attempt}/${MAX_RETRIES} pour recherche: "${searchTerm}"`);
      
      // Construire l'URL de recherche
      let searchUrl = `${COLEKA_BASE_URL}/fr/search?q=${encodeURIComponent(searchTerm)}&nbpp=${maxResults}`;
      
      // Ajouter le filtre de catégorie si spécifié
      if (category) {
        searchUrl += `&cat=${encodeURIComponent(category)}`;
      }
      
      logger.debug(`[Coleka] Requête: ${searchUrl}`);
      const html = await fetchColeka(searchUrl);
      
      const result = {
        query: searchTerm,
        products: [],
        total: 0,
        category: category,
        source: 'coleka'
      };
      
      // Parser les résultats — structure Coleka : <a class="lib_has..." data-id="N" href="...">
      const productBlockPattern = /<a[^>]*class="[^"]*lib_has[^"]*"[^>]*data-id="(\d+)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const allBlocks = [...html.matchAll(productBlockPattern)];
      
      for (const match of allBlocks) {
        const dataId = match[1];
        const url = match[2];
        const content = match[3];
        
        const fullUrl = url.startsWith('http') ? url : COLEKA_BASE_URL + url;
        
        // Extraire le titre depuis le premier <span>
        const titleMatch = content.match(/<span[^>]*>([^<]+)<\/span>/i);
        const name = titleMatch ? titleMatch[1].trim() : null;
        if (!name) continue;
        
        // Extraire l'image
        let imageUrl = null;
        const imgMatch = content.match(/(?:data-src|src)="(https?:\/\/[^"]+)"/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
        
        // Extraire la catégorie et collection depuis l'URL
        const segments = url.split('/').filter(s => s.length > 0);
        
        const productData = {
          id: segments[segments.length - 1],
          name,
          url: fullUrl,
          path: url,
          category: segments.length > 2 ? segments[1] : null,
          collection: segments.length > 3 ? segments.slice(2, -1).join('/') : null,
          image: imageUrl
        };
          
          // Traduction du nom si nécessaire
          if (shouldTranslate && name) {
            try {
              const translated = await translateText(name, destLang, { enabled: true, sourceLang: 'fr' });
              if (translated && translated.translated === true && translated.text) {
                productData.name_translated = translated.text;
              }
            } catch (translationError) {
              logger.warn(`[Coleka] Erreur traduction: ${translationError.message}`);
            }
          }
          
          result.products.push(productData);
      }
      
      result.total = result.products.length;
      logger.debug(`[Coleka] ✅ Trouvé ${result.total} produits`);
      
      return result;

    } catch (err) {
      lastError = err;
      logger.warn(`[Coleka] Erreur tentative ${attempt}: ${err.message}`);
      if (err.message.includes('Turnstile')) break;
      if (attempt >= MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  
  throw lastError || new Error('Échec après toutes les tentatives');
}

/**
 * Récupère les détails d'un item Coleka
 * @param {string} itemId - ID, URL ou chemin de l'item (ex: "fr/lego/star-wars/75192-millennium-falcon_i123")
 * @param {Object} options - Options
 * @param {string} options.lang - Langue (fr, en)
 * @param {boolean} options.autoTrad - Activer traduction automatique
 * @returns {Promise<Object>} - Détails de l'item
 */
export async function getColekaDetails(itemId, options = {}) {
  const {
    lang = 'fr',
    autoTrad = false
  } = options;
  
  const destLang = extractLangCode(lang);
  const shouldTranslate = autoTrad && destLang && destLang !== 'fr';
  
  // Construire l'URL
  let itemUrl;
  if (itemId.startsWith('http')) {
    itemUrl = itemId;
  } else if (itemId.startsWith('/')) {
    itemUrl = `${COLEKA_BASE_URL}${itemId}`;
  } else {
    // Si l'ID ne commence pas par la langue, l'ajouter
    const hasLangPrefix = itemId.match(/^[a-z]{2}\//);
    itemUrl = `${COLEKA_BASE_URL}/${hasLangPrefix ? '' : lang + '/'}${itemId}`;
  }
  
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    
    try {
      logger.debug(`[Coleka] Tentative ${attempt}/${MAX_RETRIES} pour item: "${itemId}"`);
      
      logger.debug(`[Coleka] Requête: ${itemUrl}`);
      const html = await fetchColeka(itemUrl);
      
      // Vérifier si page 404
      const hasValidTitle = html.includes('<h1') && !html.includes('Page introuvable') && !html.includes('Page non trouvée');
      const is404Page = html.includes('<title>404') || html.includes('Page introuvable') || html.includes('Page non trouvée');
      
      if (is404Page || (!hasValidTitle && html.length < 5000)) {
        throw new Error(`Item non trouvé: ${itemId}`);
      }
      
      const item = {
        id: itemId,
        url: itemUrl,
        name: null,
        name_original: null,
        name_translated: null,
        images: [],
        description: null,
        description_original: null,
        description_translated: null,
        brand: null,
        brands: [],
        series: null,
        category: null,
        collectionHierarchy: null,
        reference: null,
        year: null,
        barcode: null,
        attributes: {},
        source: 'coleka'
      };
      
      // Extraire le titre
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) {
        item.name = h1Match[1].trim();
        item.name_original = item.name;
      } else {
        const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
        if (ogTitleMatch) {
          item.name = ogTitleMatch[1].trim();
          item.name_original = item.name;
        }
      }
      
      // Extraire la description
      const descMatch = html.match(/<meta[^>]*(?:name="description"|property="og:description")[^>]*content="([^"]+)"/i);
      if (descMatch) {
        item.description = descMatch[1].trim();
        item.description_original = item.description;
      }
      
      // Traduction du nom si nécessaire
      if (shouldTranslate && item.name) {
        try {
          const translated = await translateText(item.name, destLang, { enabled: true, sourceLang: 'fr' });
          if (translated && translated.translated === true && translated.text) {
            item.name = translated.text;
            item.name_translated = translated.text;
          }
        } catch (translationError) {
          logger.warn(`[Coleka] Erreur traduction nom: ${translationError.message}`);
        }
      }
      
      // Traduction de la description si nécessaire
      if (shouldTranslate && item.description) {
        try {
          const translated = await translateText(item.description, destLang, { enabled: true, sourceLang: 'fr' });
          if (translated && translated.translated === true && translated.text) {
            item.description = translated.text;
            item.description_translated = translated.text;
          }
        } catch (translationError) {
          logger.warn(`[Coleka] Erreur traduction description: ${translationError.message}`);
        }
      }
      
      // Extraire l'image principale (og:image)
      const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
      const seenImages = new Set();
      if (ogImageMatch) {
        item.images.push(ogImageMatch[1]);
        seenImages.add(ogImageMatch[1]);
      }
      
      // Les images supplémentaires viendront du JSON-LD ci-dessous
      // On ne scrape PAS les <img> de la page car Coleka mélange :
      // - icônes de catégories (/media/rubrique/ 30x30)
      // - logos de tags (/media/tag/)
      // - images d'items recommandés/adjacents (/media/item/ d'autres produits)
      // Seuls og:image et JSON-LD sont fiables pour l'image du produit.
      
      // Extraire les données structurées JSON-LD
      const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd['@type'] === 'Product' || jsonLd.name) {
            item.name = item.name || jsonLd.name;
            item.description = item.description || jsonLd.description;
            item.brand = jsonLd.brand?.name || jsonLd.brand;
            if (jsonLd.image) {
              const images = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
              for (const img of images) {
                if (!seenImages.has(img)) {
                  seenImages.add(img);
                  item.images.push(img);
                }
              }
            }
            if (jsonLd.gtin13 || jsonLd.gtin || jsonLd.ean) {
              item.barcode = jsonLd.gtin13 || jsonLd.gtin || jsonLd.ean;
            }
            if (jsonLd.sku || jsonLd.productID) {
              item.reference = jsonLd.sku || jsonLd.productID;
            }
            // Extraire la hiérarchie Collection/Série depuis le champ category
            // Format: "Figurines de collection > Star Wars > Vintage Star Wars (Kenner)"
            if (jsonLd.category) {
              const parts = jsonLd.category.split(' > ').map(s => s.trim()).filter(Boolean);
              if (parts.length > 0) {
                item.collectionHierarchy = parts;
                item.category = parts[0];
                // Le dernier élément est la collection/série spécifique
                item.series = parts[parts.length - 1];
              }
            }
          }
        } catch (e) {
          logger.debug(`[Coleka] Erreur parsing JSON-LD: ${e.message}`);
        }
      }
      
      // Fallback: extraire Collection/Série depuis le label HTML
      if (!item.series) {
        const collectionLabelMatch = html.match(/Collection\s*\/\s*S[ée]rie[^<]*<\/[^>]+>\s*(?:<[^>]*>\s*)*(?:<a[^>]*>)?([^<]+)/i);
        if (collectionLabelMatch) {
          item.series = collectionLabelMatch[1].trim();
        }
      }
      
      // Extraire les attributs depuis les tables
      const attrPatterns = [
        /<(?:tr|li)[^>]*>\s*<(?:td|span)[^>]*>([^<]+)<\/(?:td|span)>\s*<(?:td|span)[^>]*>([^<]+)<\/(?:td|span)>/gi,
        /<(?:dt|label)[^>]*>([^<]+)<\/(?:dt|label)>\s*<(?:dd|span)[^>]*>([^<]+)<\/(?:dd|span)>/gi
      ];
      
      for (const pattern of attrPatterns) {
        let attrMatch;
        while ((attrMatch = pattern.exec(html)) !== null) {
          const key = attrMatch[1].replace(/:$/, '').trim().toLowerCase();
          const value = attrMatch[2].trim();
          
          if (key && value && value.length < 200) {
            if (key.includes('marque') || key.includes('brand')) {
              item.brand = item.brand || value;
            } else if (key.includes('série') || key.includes('series') || key.includes('collection')) {
              item.series = item.series || value;
            } else if (key.includes('référence') || key.includes('reference') || key.includes('sku')) {
              item.reference = item.reference || value;
            } else if (key.includes('année') || key.includes('year') || key.includes('date')) {
              const yearMatch = value.match(/\d{4}/);
              if (yearMatch) item.year = parseInt(yearMatch[0]);
            } else if (key.includes('ean') || key.includes('barcode') || key.includes('gtin')) {
              item.barcode = item.barcode || value;
            } else {
              item.attributes[key] = value;
            }
          }
        }
      }
      
      // Extraire les licences/marques
      const licenceMatch = html.match(/<dt>Licence<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
      if (licenceMatch) {
        const brands = [];
        const licencePattern = /<a[^>]*>(?:<span[^>]*>[^<]*<\/span>)?([^<]+)<\/a>/gi;
        let licMatch;
        while ((licMatch = licencePattern.exec(licenceMatch[1])) !== null) {
          const brand = licMatch[1].trim();
          if (brand && brand.length > 0) {
            brands.push(brand);
          }
        }
        if (brands.length > 0) {
          item.brand = item.brand || brands[0];
          item.brands = brands;
        }
      }
      
      // Extraire les catégories depuis le fil d'Ariane
      const breadcrumbMatch = html.match(/<(?:nav|ol|ul)[^>]*(?:class="[^"]*breadcrumb[^"]*"|aria-label="[^"]*breadcrumb[^"]*")[^>]*>([\s\S]*?)<\/(?:nav|ol|ul)>/i);
      if (breadcrumbMatch) {
        const crumbs = [];
        const crumbPattern = /<a[^>]*>([^<]+)<\/a>/gi;
        let crumbMatch;
        while ((crumbMatch = crumbPattern.exec(breadcrumbMatch[1])) !== null) {
          const crumb = crumbMatch[1].trim();
          if (crumb && crumb.toLowerCase() !== 'accueil' && crumb.toLowerCase() !== 'home') {
            crumbs.push(crumb);
          }
        }
        if (crumbs.length > 0) {
          item.attributes.categories = crumbs;
        }
      }
      
      if (!item.name) {
        throw new Error(`Impossible d'extraire les informations de l'item: ${itemUrl}`);
      }
      
      // Dédupliquer les images
      item.images = deduplicateColekaImages(item.images);
      
      logger.debug(`[Coleka] ✅ Item récupéré: ${item.name}`);
      
      return item;

    } catch (err) {
      lastError = err;
      logger.warn(`[Coleka] Erreur tentative ${attempt}: ${err.message}`);
      if (err.message.includes('Turnstile') || err.message.includes('contournement')) break;
      if (attempt >= MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  
  throw lastError || new Error('Échec après toutes les tentatives');
}

/**
 * Liste les catégories disponibles sur Coleka
 * @param {Object} options - Options
 * @param {string} options.lang - Langue (fr, en)
 * @returns {Promise<Object>} - Liste des catégories
 */
export async function browseColekaCategories(options = {}) {
  const { lang = 'fr' } = options;
  
  // Catégories principales de Coleka (basées sur l'observation du site)
  const categories = {
    lang,
    categories: [
      {
        id: 'lego',
        name: 'LEGO',
        slug: 'lego',
        description: 'Sets LEGO, minifigures et briques'
      },
      {
        id: 'funko',
        name: 'Funko Pop',
        slug: 'funko',
        description: 'Figurines Funko Pop de toutes licences'
      },
      {
        id: 'figurines',
        name: 'Figurines',
        slug: 'figurines',
        description: 'Figurines d\'action et de collection'
      },
      {
        id: 'playmobil',
        name: 'Playmobil',
        slug: 'playmobil',
        description: 'Sets et figurines Playmobil'
      },
      {
        id: 'jeux-societe',
        name: 'Jeux de société',
        slug: 'jeux-societe',
        description: 'Jeux de plateau et de cartes'
      },
      {
        id: 'cartes-collectionner',
        name: 'Cartes à collectionner',
        slug: 'cartes-collectionner',
        description: 'Cartes Pokemon, Magic, Yu-Gi-Oh, etc.'
      },
      {
        id: 'peluches',
        name: 'Peluches',
        slug: 'peluches',
        description: 'Peluches et jouets en tissu'
      },
      {
        id: 'comics',
        name: 'Comics & BD',
        slug: 'comics',
        description: 'Bandes dessinées et comics'
      }
    ],
    source: 'coleka'
  };
  
  return categories;
}

/**
 * Health check pour Coleka (vérifie l'accès au site)
 * @returns {Promise<Object>}
 */
export async function healthCheck() {
  const startTime = Date.now();
  try {
    const html = await fetchColeka(`${COLEKA_BASE_URL}/fr`);
    const latency = Date.now() - startTime;
    const isValid = html.length > 10000 && !html.includes('cf-turnstile');
    
    return {
      status: isValid ? 'healthy' : 'unhealthy',
      provider: 'coleka',
      latency,
      message: isValid ? 'Coleka accessible' : 'Page Coleka invalide ou Turnstile actif'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      provider: 'coleka',
      latency: Date.now() - startTime,
      error: error.message
    };
  }
}
