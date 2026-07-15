/**
 * ConsoleVariations Provider
 * 
 * Base de données des variations de consoles de jeux vidéo
 * Site: https://consolevariations.com
 * 
 * Fonctionnalités:
 * - Recherche de variations de consoles, controllers, accessories
 * - Détails complets (rareté, édition limitée, région, production)
 * - Liste des plateformes par marque (Nintendo, Sony, Microsoft, Sega...)
 * - Browse par plateforme
 * 
 * @module domains/videogames/providers/consolevariations
 */

import { FlareSolverrClient } from '../../../infrastructure/scraping/FlareSolverrClient.js';
import { logger } from '../../../shared/utils/logger.js';
import { translateText, extractLangCode } from '../../../shared/utils/translator.js';

const CONSOLEVARIATIONS_BASE_URL = 'https://consolevariations.com';
const DEFAULT_MAX_RESULTS = 20;
const MAX_RETRIES = 3;

// Client FlareSolverr partagé pour ConsoleVariations
let fsrClient = null;

/**
 * Obtenir le client FlareSolverr (singleton)
 * @returns {FlareSolverrClient}
 */
function getFsrClient() {
  if (!fsrClient) {
    fsrClient = new FlareSolverrClient('ConsoleVariations');
  }
  return fsrClient;
}

/**
 * Décoder les entités HTML
 * @param {string} text
 * @returns {string}
 */
function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche sur ConsoleVariations.com
 * @param {string} query - Terme de recherche
 * @param {Object} options
 * @param {number} [options.maxResults=20] - Nombre max de résultats
 * @param {string} [options.type='all'] - Type: 'all', 'consoles', 'controllers', 'accessories'
 * @returns {Promise<Object>} - Résultats de recherche
 */
export async function searchConsoleVariations(query, options = {}) {
  const { maxResults = DEFAULT_MAX_RESULTS, type = 'all' } = options;
  
  logger.debug(`[ConsoleVariations] Recherche: "${query}" (type=${type}, max=${maxResults})`);
  
  const fsr = getFsrClient();
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    
    try {
      // Construire l'URL avec filtres
      let searchUrl = `${CONSOLEVARIATIONS_BASE_URL}/database?search=${encodeURIComponent(query)}`;
      
      if (type === 'consoles') {
        searchUrl += '&filters[type][0]=1';
      } else if (type === 'controllers') {
        searchUrl += '&filters[type][0]=3';
      } else if (type === 'accessories') {
        searchUrl += '&filters[type][0]=4';
      }
      
      // S'assurer qu'on a une session
      await fsr.ensureSession(CONSOLEVARIATIONS_BASE_URL);
      
      logger.debug(`[ConsoleVariations] GET ${searchUrl} (tentative ${attempt}/${MAX_RETRIES})`);
      const html = await fsr.get(searchUrl, { waitInSeconds: 3 });
      
      if (!html || html.length < 100) {
        throw new Error('Réponse vide ou invalide');
      }
      
      // Parser les résultats
      const results = [];
      const seenNames = new Set();
      
      // Pattern pour extraire les items: images + nom
      const imgPattern = /alt="([^"]{10,})" src="(https:\/\/cdn\.consolevariations\.com\/\d+\/[^"]+)"/gi;
      const itemCandidates = [];
      let imgMatch;
      
      while ((imgMatch = imgPattern.exec(html)) !== null) {
        const name = decodeHtmlEntities(imgMatch[1].trim());
        const thumbnail = imgMatch[2];
        
        // Filtrer les faux positifs
        if (name.toLowerCase().includes('consolevariations') || name.length < 10) {
          continue;
        }
        
        // Chercher le slug dans le contexte proche de l'image
        const imgPos = imgMatch.index;
        const contextStart = Math.max(0, imgPos - 1500);
        const contextEnd = Math.min(html.length, imgPos + 1500);
        const context = html.substring(contextStart, contextEnd);
        
        const slugPattern = /href="(?:https?:\/\/consolevariations\.com)?\/collectibles\/([a-z0-9][a-z0-9-]+[a-z0-9])"/gi;
        let slugMatch;
        let foundSlug = null;
        
        while ((slugMatch = slugPattern.exec(context)) !== null) {
          const candidateSlug = slugMatch[1];
          if (candidateSlug !== 'compare' && candidateSlug.length > 5) {
            foundSlug = candidateSlug;
            break;
          }
        }
        
        if (foundSlug && !seenNames.has(name)) {
          seenNames.add(name);
          itemCandidates.push({ name, thumbnail, slug: foundSlug });
        }
      }
      
      // Dédupliquer par slug et limiter
      const seenSlugs = new Set();
      for (const item of itemCandidates) {
        if (results.length >= maxResults) break;
        if (seenSlugs.has(item.slug)) continue;
        seenSlugs.add(item.slug);
        
        results.push({
          id: item.slug,
          slug: item.slug,
          name: item.name,
          url: `${CONSOLEVARIATIONS_BASE_URL}/collectibles/${item.slug}`,
          image: item.thumbnail,
          thumbnail: item.thumbnail,
          type: type !== 'all' ? type.slice(0, -1) : 'unknown' // consoles -> console
        });
      }
      
      logger.info(`[ConsoleVariations] Trouvé ${results.length} résultats pour "${query}"`);
      
      return {
        source: 'consolevariations',
        query,
        type,
        total: results.length,
        results
      };
      
    } catch (err) {
      lastError = err;
      logger.warn(`[ConsoleVariations] Erreur tentative ${attempt}: ${err.message}`);
      
      if (attempt >= MAX_RETRIES) break;
      
      // Attente progressive entre tentatives
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  
  // Toutes les tentatives ont échoué
  await fsr.destroySession();
  throw lastError || new Error('Échec de la recherche après toutes les tentatives');
}

// ============================================================================
// DÉTAILS ITEM
// ============================================================================

/**
 * Récupère les détails d'un item ConsoleVariations
 * @param {string} slug - Slug de l'item (ex: "sony-playstation-2-slim-limited-edition")
 * @param {Object} options
 * @param {string} [options.lang='fr'] - Langue pour traduction
 * @param {boolean} [options.autoTrad=false] - Activer la traduction automatique
 * @returns {Promise<Object>} - Détails de l'item
 */
export async function getConsoleVariationsDetails(slug, options = {}) {
  const { lang = 'fr', autoTrad = false } = options;
  const destLang = extractLangCode(lang);
  const shouldTranslate = autoTrad === true || autoTrad === 1 || autoTrad === '1';
  
  logger.debug(`[ConsoleVariations] Détails: "${slug}" (lang=${lang}, autoTrad=${autoTrad})`);
  
  const fsr = getFsrClient();
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    
    try {
      await fsr.ensureSession(CONSOLEVARIATIONS_BASE_URL);
      
      const itemUrl = `${CONSOLEVARIATIONS_BASE_URL}/collectibles/${slug}`;
      logger.debug(`[ConsoleVariations] GET ${itemUrl} (tentative ${attempt}/${MAX_RETRIES})`);
      
      const html = await fsr.get(itemUrl, { waitInSeconds: 2 });
      
      // Vérifier si l'item existe
      if (/<title>Not Found<\/title>/i.test(html)) {
        throw new Error(`Item non trouvé: ${slug}`);
      }
      
      // Extraire le titre
      const titleMatch = html.match(/<h1[^>]*class="[^"]*text-2xl[^"]*"[^>]*>\s*([^<]+)\s*<\/h1>/i);
      const name = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : slug.replace(/-/g, ' ');
      
      // Extraire les images
      const images = [];
      const imagesMatch = html.match(/images:\s*JSON\.parse\('(\[[\s\S]*?\])'\)/);
      
      if (imagesMatch) {
        try {
          const jsonStr = imagesMatch[1].replace(/\\u0022/g, '"').replace(/\\\//g, '/');
          const imagesData = JSON.parse(jsonStr);
          
          for (const img of imagesData) {
            // Nettoyer les \/ résiduels dans les URLs après JSON.parse
            const cleanUrl = (u) => u ? u.replace(/\\\//g, '/') : null;
            images.push({
              id: img.id,
              url: cleanUrl(img.original_url || img.preview_url),
              thumbnail: cleanUrl(img.preview_url),
              alt: img.alt_text || '',
              isMain: images.length === 0
            });
          }
        } catch (parseError) {
          logger.warn(`[ConsoleVariations] Erreur parsing images JSON: ${parseError.message}`);
          
          // Fallback: extraction regex
          const imgRegex = /src="(https:\/\/cdn\.consolevariations\.com\/[^"]+)"/gi;
          let imgMatch;
          const seenUrls = new Set();
          
          while ((imgMatch = imgRegex.exec(html)) !== null) {
            const url = imgMatch[1];
            if (!seenUrls.has(url) && !url.includes('profile-photos')) {
              seenUrls.add(url);
              images.push({
                url,
                thumbnail: url,
                alt: name,
                isMain: images.length === 0
              });
            }
          }
        }
      }
      
      // Extraire les détails du tableau
      const details = {};
      const tableRowRegex = /<tr>\s*<td[^>]*>\s*([^<]+)\s*<\/td>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>\s*<\/tr>/gi;
      let rowMatch;
      
      while ((rowMatch = tableRowRegex.exec(html)) !== null) {
        const label = decodeHtmlEntities(rowMatch[1].trim());
        let value = rowMatch[2].replace(/<[^>]+>/g, ' ').trim();
        value = decodeHtmlEntities(value);
        
        switch (label.toLowerCase()) {
          case 'releases':
            const releaseMatch = value.match(/([A-Za-z\s]+)\s*-?\s*(\d{4})?/);
            if (releaseMatch) {
              details.releaseCountry = releaseMatch[1].trim();
              details.releaseYear = releaseMatch[2] ? parseInt(releaseMatch[2]) : null;
            }
            break;
          case 'release type':
            details.releaseType = value;
            break;
          case 'amount produced estimate':
            details.amountProduced = value;
            break;
          case 'region code':
            details.regionCode = value;
            break;
          case 'limited edition':
            details.limitedEdition = value === 'Yes';
            break;
          case 'color':
            details.color = value || null;
            break;
          case 'is bundle':
            details.isBundle = value === 'Yes';
            break;
        }
      }
      
      // Extraire les stats de rareté/communauté
      const rarityMatch = html.match(/(\d+)\s*Rarity\s*Score/i);
      const wantMatch = html.match(/(\d+)\s*people\s*want\s*this/i);
      const ownMatch = html.match(/(\d+)\s*people\s*own\s*this/i);
      
      // Extraire la plateforme et marque
      const platformMatch = html.match(/href="\/database\/([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
      const brandMatch = html.match(/href="\/browse\/brand\/([^"\/]+)"/i);
      const barcodeMatch = html.match(/Barcode:\s*(\d+)/i);
      
      // Traduction si demandée
      let finalName = name;
      let nameTranslated = null;
      
      if (shouldTranslate && destLang && name) {
        try {
          const translated = await translateText(name, destLang, { enabled: true, sourceLang: 'en' });
          // translateText retourne { text, translated, from?, to? }
          if (translated && translated.translated === true && translated.text) {
            finalName = translated.text;
            nameTranslated = translated.text;
          }
        } catch (translationError) {
          logger.warn(`[ConsoleVariations] Erreur traduction: ${translationError.message}`);
        }
      }
      
      const result = {
        source: 'consolevariations',
        id: slug,
        slug,
        name: finalName,
        nameOriginal: name,
        nameTranslated,
        url: itemUrl,
        brand: brandMatch ? brandMatch[1].charAt(0).toUpperCase() + brandMatch[1].slice(1) : null,
        platform: platformMatch ? {
          slug: platformMatch[1],
          name: decodeHtmlEntities(platformMatch[2].trim())
        } : null,
        images,
        releaseCountry: details.releaseCountry || null,
        releaseYear: details.releaseYear || null,
        releaseType: details.releaseType || null,
        regionCode: details.regionCode || null,
        amountProduced: details.amountProduced || null,
        isLimitedEdition: details.limitedEdition || false,
        isBundle: details.isBundle || false,
        color: details.color || null,
        barcode: barcodeMatch ? barcodeMatch[1] : null,
        rarity: {
          score: rarityMatch ? parseInt(rarityMatch[1]) : null,
          level: getRarityLevel(rarityMatch ? parseInt(rarityMatch[1]) : null)
        },
        community: {
          wantCount: wantMatch ? parseInt(wantMatch[1]) : 0,
          ownCount: ownMatch ? parseInt(ownMatch[1]) : 0
        }
      };
      
      logger.info(`[ConsoleVariations] Détails récupérés: ${name}`);
      return result;
      
    } catch (err) {
      lastError = err;
      logger.warn(`[ConsoleVariations] Erreur tentative ${attempt}: ${err.message}`);
      
      if (attempt >= MAX_RETRIES) break;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  
  await fsr.destroySession();
  throw lastError || new Error('Échec de récupération des détails après toutes les tentatives');
}

// ============================================================================
// PLATEFORMES
// ============================================================================

/**
 * Liste les plateformes disponibles sur ConsoleVariations
 * @param {Object} options
 * @param {string} [options.brand] - Marque: 'nintendo', 'sony', 'microsoft', 'sega', etc.
 * @returns {Promise<Object>} - Liste des plateformes ou marques
 */
export async function listConsoleVariationsPlatforms(options = {}) {
  const { brand = null } = options;
  
  logger.debug(`[ConsoleVariations] Liste plateformes${brand ? ` (${brand})` : ''}`);
  
  const fsr = getFsrClient();
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    
    try {
      await fsr.ensureSession(CONSOLEVARIATIONS_BASE_URL);
      
      const url = brand
        ? `${CONSOLEVARIATIONS_BASE_URL}/browse/brand/${brand.toLowerCase()}/platforms`
        : `${CONSOLEVARIATIONS_BASE_URL}/browse/brand`;
      
      logger.debug(`[ConsoleVariations] GET ${url} (tentative ${attempt}/${MAX_RETRIES})`);
      const html = await fsr.get(url, { waitInSeconds: 2 });
      
      const platforms = [];
      const seen = new Set();
      
      if (brand) {
        // Liste des plateformes pour une marque spécifique
        const simpleRegex = /href="\/database\/([^"]+)"[^>]*>[^<]*<[^>]*>[^<]*([^<]+)/gi;
        let match;
        
        while ((match = simpleRegex.exec(html)) !== null) {
          const slug = match[1];
          if (!seen.has(slug) && !slug.includes('?')) {
            seen.add(slug);
            const name = decodeHtmlEntities(match[2].trim());
            if (name && name.length > 1) {
              platforms.push({
                id: slug,
                slug,
                name,
                url: `${CONSOLEVARIATIONS_BASE_URL}/database/${slug}`,
                brand
              });
            }
          }
        }
      } else {
        // Liste des marques
        const brandRegex = /href="\/browse\/brand\/([^"\/]+)(?:\/platforms)?"[^>]*>[\s\S]*?([A-Za-z0-9\s]+)<\/a>/gi;
        let match;
        
        while ((match = brandRegex.exec(html)) !== null) {
          const slug = match[1];
          if (!seen.has(slug)) {
            seen.add(slug);
            platforms.push({
              id: slug,
              slug,
              name: decodeHtmlEntities(match[2].trim()) || slug.charAt(0).toUpperCase() + slug.slice(1),
              url: `${CONSOLEVARIATIONS_BASE_URL}/browse/brand/${slug}/platforms`
            });
          }
        }
      }
      
      logger.info(`[ConsoleVariations] Trouvé ${platforms.length} ${brand ? 'plateformes' : 'marques'}`);
      
      return {
        source: 'consolevariations',
        type: brand ? 'platforms' : 'brands',
        brand: brand || null,
        total: platforms.length,
        results: platforms
      };
      
    } catch (err) {
      lastError = err;
      logger.warn(`[ConsoleVariations] Erreur tentative ${attempt}: ${err.message}`);
      
      if (attempt >= MAX_RETRIES) break;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  
  await fsr.destroySession();
  throw lastError || new Error('Échec de récupération des plateformes après toutes les tentatives');
}

/**
 * Browse les items d'une plateforme spécifique
 * @param {string} platformSlug - Slug de la plateforme (ex: "nes", "sony-playstation")
 * @param {Object} options
 * @param {number} [options.maxResults=20] - Nombre max de résultats
 * @returns {Promise<Object>} - Items de la plateforme
 */
export async function browseConsoleVariationsPlatform(platformSlug, options = {}) {
  const { maxResults = DEFAULT_MAX_RESULTS } = options;
  
  logger.debug(`[ConsoleVariations] Browse plateforme: "${platformSlug}" (max=${maxResults})`);
  
  const fsr = getFsrClient();
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    
    try {
      await fsr.ensureSession(CONSOLEVARIATIONS_BASE_URL);
      
      const url = `${CONSOLEVARIATIONS_BASE_URL}/database/${platformSlug}`;
      logger.debug(`[ConsoleVariations] GET ${url} (tentative ${attempt}/${MAX_RETRIES})`);
      
      const html = await fsr.get(url, { waitInSeconds: 3 });
      
      if (/<title>Not Found<\/title>/i.test(html)) {
        throw new Error(`Plateforme non trouvée: ${platformSlug}`);
      }
      
      const items = [];
      const seen = new Set();
      
      // Extraire les liens vers collectibles avec URLs complètes
      const fullLinkRegex = /href="https?:\/\/consolevariations\.com\/collectibles\/([^"]+)"[^>]*>\s*([^<]*)</gi;
      let match;
      
      while ((match = fullLinkRegex.exec(html)) !== null && items.length < maxResults) {
        const slug = match[1];
        let name = match[2] ? match[2].trim() : null;
        
        if (slug && !seen.has(slug) && name && name.length > 2) {
          seen.add(slug);
          
          // Chercher l'image dans le contexte proche
          const startIdx = Math.max(0, match.index - 2000);
          const context = html.substring(startIdx, match.index);
          const imgInContext = context.match(/src="(https:\/\/cdn\.consolevariations\.com\/\d+\/[^"]+)"/gi);
          const thumbnail = imgInContext && imgInContext.length > 0
            ? imgInContext[imgInContext.length - 1].match(/src="([^"]+)"/)[1]
            : null;
          
          items.push({
            id: slug,
            slug,
            name: decodeHtmlEntities(name),
            url: `${CONSOLEVARIATIONS_BASE_URL}/collectibles/${slug}`,
            thumbnail
          });
        }
      }
      
      // Fallback avec URLs relatives si pas assez de résultats
      if (items.length < maxResults) {
        const altRegex = /href="\/collectibles\/([^"]+)"/gi;
        while ((match = altRegex.exec(html)) !== null && items.length < maxResults) {
          const slug = match[1];
          if (!seen.has(slug)) {
            seen.add(slug);
            items.push({
              id: slug,
              slug,
              name: slug.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              url: `${CONSOLEVARIATIONS_BASE_URL}/collectibles/${slug}`,
              thumbnail: null
            });
          }
        }
      }
      
      logger.info(`[ConsoleVariations] Browse ${platformSlug}: ${items.length} items trouvés`);
      
      return {
        source: 'consolevariations',
        platform: platformSlug,
        total: items.length,
        results: items.slice(0, maxResults)
      };
      
    } catch (err) {
      lastError = err;
      logger.warn(`[ConsoleVariations] Erreur tentative ${attempt}: ${err.message}`);
      
      if (attempt >= MAX_RETRIES) break;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  
  await fsr.destroySession();
  throw lastError || new Error('Échec du browse après toutes les tentatives');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convertit un score de rareté (0-100) en niveau
 * @param {number|null} score
 * @returns {string}
 */
function getRarityLevel(score) {
  if (score === null || score === undefined) return 'unknown';
  if (score <= 20) return 'common';
  if (score <= 40) return 'uncommon';
  if (score <= 60) return 'rare';
  if (score <= 80) return 'very_rare';
  return 'extremely_rare';
}

/**
 * Détruire manuellement la session FlareSolverr
 * Utile pour les tests ou le nettoyage explicite
 */
export async function destroyFsrSession() {
  if (fsrClient) {
    await fsrClient.destroySession();
  }
}

/**
 * Health check du client FlareSolverr
 * @returns {Promise<Object>}
 */
export async function healthCheck() {
  const fsr = getFsrClient();
  return fsr.healthCheck();
}
