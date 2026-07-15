/**
 * @fileoverview Provider Lulu-Berlu - Figurines vintage françaises
 * @module domains/collectibles/providers/luluberlu
 * 
 * Site de collectibles et figurines vintage françaises.
 * Utilise FlareSolverr pour le scraping (pas de challenge anti-bot comme Coleka).
 * 
 * @requires FlareSolverrClient
 * @requires translateText
 */

import { logger } from '../../../shared/utils/logger.js';
import { translateText } from '../../../shared/utils/translator.js';
import FlareSolverrClient from '../../../infrastructure/scraping/FlareSolverrClient.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LULUBERLU_BASE_URL = 'https://www.lulu-berlu.com';
const LULUBERLU_SEARCH_URL = 'https://www.lulu-berlu.com/dhtml/resultat_recherche.php';
const LULUBERLU_DEFAULT_MAX = 24;
const LULUBERLU_RESULTS_PER_PAGE = 12;
const MAX_RETRIES = 3;

// Instance FlareSolverr réutilisable (singleton)
let fsrClient = null;

/**
 * Récupère ou crée le client FlareSolverr
 * @returns {FlareSolverrClient}
 */
function getFsrClient() {
  if (!fsrClient) {
    fsrClient = new FlareSolverrClient();
  }
  return fsrClient;
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche de produits sur Lulu-Berlu via scraping
 * 
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options de recherche
 * @param {number} [options.maxResults=12] - Nombre max de résultats
 * @param {string} [options.lang='fr'] - Langue (pour traduction future)
 * @param {boolean} [options.autoTrad=false] - Activer traduction automatique
 * @returns {Promise<Object>} Résultats de recherche
 * 
 * @example
 * const results = await searchLuluBerlu('star wars', { maxResults: 10 });
 */
export async function searchLuluBerlu(query, options = {}) {
  const {
    maxResults = LULUBERLU_DEFAULT_MAX,
    lang = 'fr',
    autoTrad = false
  } = options;

  logger.debug(`[LuluBerlu] Recherche: "${query}" (max: ${maxResults})`);

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    
    try {
      logger.debug(`[LuluBerlu] Tentative ${attempt}/${MAX_RETRIES}`);

      // Assurer une session FlareSolverr active
      const client = getFsrClient();
      await client.ensureSession();

      const result = {
        query,
        products: [],
        total: 0,
        source: 'lulu-berlu',
        lang
      };

      const pagesNeeded = Math.ceil(maxResults / LULUBERLU_RESULTS_PER_PAGE);
      let allProducts = [];
      let totalFromSite = 0;

      // Parcourir les pages nécessaires
      for (let page = 1; page <= pagesNeeded; page++) {
        const searchUrl = `${LULUBERLU_SEARCH_URL}?keywords=${encodeURIComponent(query)}&ok=%A1&numPage=${page}`;
        logger.debug(`[LuluBerlu] Page ${page}/${pagesNeeded}: ${searchUrl}`);

        const html = await client.get(searchUrl, { waitInSeconds: 1 });

        // Extraire le total de résultats sur la première page
        if (page === 1) {
          const totalMatch = html.match(/(\d+)\s*articles?\s+sur\s+(\d+)/i);
          if (totalMatch) {
            totalFromSite = parseInt(totalMatch[2], 10);
            logger.debug(`[LuluBerlu] Total disponible: ${totalFromSite}`);
          }
        }

        // Extraire les produits via idproduit
        const idPattern = /idproduit="(\d+)"/gi;
        const idMatches = [...html.matchAll(idPattern)];
        const seenIds = new Set(allProducts.map(p => p.id));

        logger.debug(`[LuluBerlu] ${idMatches.length} produits trouvés sur la page ${page}`);

        for (const idMatch of idMatches) {
          const productId = idMatch[1];
          
          // Éviter les doublons
          if (seenIds.has(productId)) continue;
          seenIds.add(productId);

          // Extraire le contexte HTML autour du produit
          const idIndex = html.toLowerCase().indexOf(`idproduit="${productId}"`);
          if (idIndex === -1) continue;

          const contextStart = Math.max(0, idIndex - 200);
          const contextEnd = Math.min(html.length, idIndex + 3000);
          const context = html.substring(contextStart, contextEnd);

          const product = {
            id: productId,
            name: null,
            url: null,
            image: null,
            brand: null,
            availability: null,
            price: null
          };

          // Extraction URL
          const urlPattern = new RegExp(`href="([^"]+a${productId}\\.html)"`, 'i');
          const urlMatch = context.match(urlPattern);
          if (urlMatch) {
            product.url = urlMatch[1].startsWith('http') 
              ? urlMatch[1] 
              : LULUBERLU_BASE_URL + (urlMatch[1].startsWith('/') ? '' : '/') + urlMatch[1];
          }

          // Extraction nom (alt ou title)
          const nameMatch = context.match(/(?:alt|title)="([^"]{10,})"/i);
          if (nameMatch && !nameMatch[1].toLowerCase().includes('ajouter')) {
            product.name = nameMatch[1].trim();
          }

          // Extraction image
          const imgMatch = context.match(/(?:data-lazy|data-url-img)="([^"]+)"/i);
          if (imgMatch) {
            let imgUrl = imgMatch[1];
            if (!imgUrl.startsWith('http')) {
              imgUrl = LULUBERLU_BASE_URL + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
            }
            product.image = imgUrl;
          }

          // Extraction marque
          const brandMatch = context.match(/class="bp_marque"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
          if (brandMatch) {
            product.brand = brandMatch[1].trim();
          }

          // Extraction disponibilité
          const stockMatch = context.match(/<span class="articleDispo">[\s\S]*?>(En stock|Non disponible|Épuisé|Précommande)/i);
          if (stockMatch) {
            const status = stockMatch[1].toLowerCase();
            product.availability = status.includes('stock') ? 'in_stock' 
              : status.includes('précommande') ? 'preorder' 
              : 'out_of_stock';
          }

          // Extraction prix
          const priceMatch = context.match(/(\d+,\d+)\s*(?:€|&euro;)/i);
          if (priceMatch) {
            product.price = parseFloat(priceMatch[1].replace(',', '.'));
          }

          // Ajouter le produit si on a au moins un nom ou une URL
          if (product.name || product.url) {
            allProducts.push(product);
          }
        }

        // Arrêter si on a assez de résultats
        if (allProducts.length >= maxResults) break;
        if (totalFromSite > 0 && allProducts.length >= totalFromSite) break;
        
        // Vérifier s'il y a une page suivante
        if (!html.includes('numPage=' + (page + 1))) break;
      }

      // Limiter aux résultats demandés
      result.products = allProducts.slice(0, maxResults);
      result.total = totalFromSite || allProducts.length;

      logger.info(`[LuluBerlu] ✅ ${result.products.length}/${result.total} produits trouvés`);

      // Traduction automatique si demandée
      if (autoTrad && lang !== 'fr' && result.products.length > 0) {
        logger.debug(`[LuluBerlu] Traduction ${result.products.length} produits vers ${lang}`);
        
        for (const product of result.products) {
          if (product.name) {
            product.name = await translateText(product.name, 'fr', lang);
          }
        }
      }

      return result;

    } catch (err) {
      lastError = err;
      logger.warn(`[LuluBerlu] Erreur tentative ${attempt}/${MAX_RETRIES}: ${err.message}`);
      
      if (attempt >= MAX_RETRIES) break;
      
      // Attente progressive avant retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }

  throw lastError || new Error('[LuluBerlu] Échec après toutes les tentatives');
}

// ============================================================================
// DÉTAILS ITEM
// ============================================================================

/**
 * Récupère les détails complets d'un produit Lulu-Berlu
 * 
 * @param {string} itemId - ID du produit, URL complète ou chemin relatif
 * @param {Object} options - Options
 * @param {string} [options.lang='fr'] - Langue cible
 * @param {boolean} [options.autoTrad=false] - Activer traduction automatique
 * @returns {Promise<Object>} Détails du produit
 * 
 * @example
 * const details = await getLuluBerluDetails('12345');
 * const details = await getLuluBerluDetails('https://www.luluberlu.com/...a12345.html');
 */
export async function getLuluBerluDetails(itemId, options = {}) {
  const {
    lang = 'fr',
    autoTrad = false
  } = options;

  logger.debug(`[LuluBerlu] Détails item: ${itemId}`);

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      logger.debug(`[LuluBerlu] Tentative ${attempt}/${MAX_RETRIES}`);

      // Assurer une session FlareSolverr active
      const client = getFsrClient();
      await client.ensureSession();

      // Construction de l'URL du produit
      let itemUrl;

      if (itemId.startsWith('http')) {
        // URL complète
        itemUrl = itemId;
      } else if (itemId.includes('.html')) {
        // Chemin relatif avec .html
        itemUrl = itemId.startsWith('/') 
          ? `${LULUBERLU_BASE_URL}${itemId}` 
          : `${LULUBERLU_BASE_URL}/${itemId}`;
      } else if (/^\d+$/.test(itemId)) {
        // ID numérique - rechercher l'URL via recherche
        logger.debug(`[LuluBerlu] ID numérique détecté: ${itemId}, recherche de l'URL...`);

        const searchByIdUrl = `${LULUBERLU_SEARCH_URL}?keywords=a${itemId}&ok=%A1`;
        const searchHtml = await client.get(searchByIdUrl, { waitInSeconds: 1 });

        // Chercher l'URL du produit avec cet ID
        const urlPattern = new RegExp(`href="([^"]*a${itemId}\\.html)"`, 'i');
        const urlMatch = searchHtml.match(urlPattern);

        if (urlMatch) {
          itemUrl = urlMatch[1].startsWith('http') 
            ? urlMatch[1] 
            : LULUBERLU_BASE_URL + (urlMatch[1].startsWith('/') ? '' : '/') + urlMatch[1];
          logger.debug(`[LuluBerlu] URL trouvée: ${itemUrl}`);
        } else {
          throw new Error(`Produit avec l'ID ${itemId} non trouvé`);
        }
      } else {
        itemUrl = `${LULUBERLU_BASE_URL}/${itemId}`;
      }

      logger.debug(`[LuluBerlu] Visite de: ${itemUrl}`);

      const html = await client.get(itemUrl, { waitInSeconds: 1 });

      // Vérifier si la page existe
      if (html.includes('Page non trouvée') || html.includes('Error 404') || html.length < 5000) {
        throw new Error('Produit non trouvé');
      }

      const item = {
        id: itemId,
        name: null,
        url: itemUrl,
        images: [],
        description: null,
        brand: null,
        reference: null,
        price: null,
        availability: null,
        attributes: {},
        source: 'lulu-berlu',
        lang: 'fr'
      };

      // Extraire l'ID réel depuis le HTML
      const idMatch = html.match(/id_article"\s*value="(\d+)"/i);
      if (idMatch) item.id = idMatch[1];

      // Extraction du nom (plusieurs patterns)
      const namePatterns = [
        /<title>([^<]+)<\/title>/i,
        /<h1[^>]*>([^<]+)<\/h1>/i,
        /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
      ];
      
      for (const pattern of namePatterns) {
        const match = html.match(pattern);
        if (match) {
          item.name = match[1]
            .trim()
            .replace(/ - Lulu Berlu$/, '')
            .replace(/\s+/g, ' ');
          if (item.name.length > 0) break;
        }
      }

      // Extraction des images
      const mainImageSection = html.match(/<div[^>]*class="[^"]*fa_bloc-image[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*fa_bloc-details[^"]*"/i);
      const imageHtml = mainImageSection ? mainImageSection[1] : '';
      const seenImages = new Set();

      // Image Open Graph (principale)
      const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
      if (ogImageMatch) {
        let imgUrl = ogImageMatch[1].replace('-moyenne.', '-grande.');
        if (!seenImages.has(imgUrl)) {
          seenImages.add(imgUrl);
          item.images.push(imgUrl);
        }
      }

      // Images dans la galerie
      if (imageHtml) {
        const hrefPattern = /href="([^"]*p-image-\d+-grande\.[^"]+)"/gi;
        for (const m of [...imageHtml.matchAll(hrefPattern)]) {
          let imgUrl = m[1];
          if (!imgUrl.startsWith('http')) {
            imgUrl = LULUBERLU_BASE_URL + (imgUrl.startsWith('/') ? '' : '/') + imgUrl;
          }
          if (!seenImages.has(imgUrl)) {
            seenImages.add(imgUrl);
            item.images.push(imgUrl);
          }
        }
      }

      // Extraction du prix
      const pricePatterns = [
        /itemprop="price"[^>]*content="([^"]+)"/i,
        /(\d+[.,]\d+)\s*(?:€|&euro;|EUR)/i
      ];
      
      for (const pattern of pricePatterns) {
        const match = html.match(pattern);
        if (match) {
          item.price = parseFloat(match[1].replace(',', '.'));
          break;
        }
      }

      // Extraction de la référence (SKU)
      const skuMatch = html.match(/itemprop="sku"[^>]*content="([^"]+)"/i);
      if (skuMatch) item.reference = skuMatch[1];

      // Extraction de la marque
      const brandPatterns = [
        /itemprop="brand"[^>]*content="([^"]+)"/i,
        /<span[^>]*itemprop="brand"[^>]*>([^<]+)<\/span>/i
      ];
      
      for (const pattern of brandPatterns) {
        const match = html.match(pattern);
        if (match) {
          item.brand = match[1].trim();
          break;
        }
      }

      // Extraction de la disponibilité
      const availMatch = html.match(/itemprop="availability"[^>]*content="([^"]+)"/i);
      if (availMatch) {
        const status = availMatch[1].toLowerCase();
        item.availability = status.includes('instock') ? 'in_stock'
          : status.includes('preorder') ? 'preorder'
          : 'out_of_stock';
      }

      // Extraction de la description
      const descMatch = html.match(/<meta[^>]*(?:name="description"|property="og:description")[^>]*content="([^"]+)"/i);
      if (descMatch) {
        item.description = decodeHtmlEntities(descMatch[1]);
      }

      // Extraction des attributs depuis la description
      item.attributes = {};

      const attributePatterns = [
        { key: 'type', pattern: /Type\s*:\s*([^<\n]+?)(?=\s*(?:Matière|Taille|Origine|Année|Condition|$))/i },
        { key: 'material', pattern: /Mati[èe]re\s*:\s*([^<\n]+?)(?=\s*(?:Type|Taille|Origine|Année|Condition|$))/i },
        { key: 'size', pattern: /(?:Taille|Hauteur)\s*:\s*([^<\n]+?)(?=\s*(?:Type|Matière|Origine|Année|Condition|$))/i },
        { key: 'origin', pattern: /Origine\s*:\s*([^<\n]+?)(?=\s*(?:Type|Matière|Taille|Année|Condition|$))/i },
        { key: 'year', pattern: /Ann[ée]e\s*:\s*(\d{4})/i },
        { key: 'condition', pattern: /Condition\s*:\s*([^<\n]+?)(?=\s*(?:Type|Matière|Taille|Origine|Année|$|\.))/i }
      ];

      const descriptionText = item.description || '';
      const detailsBlockMatch = html.match(/<div[^>]*class="[^"]*(?:fa_bloc-details|product-details|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const detailsText = detailsBlockMatch 
        ? detailsBlockMatch[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ') 
        : '';

      const fullText = `${descriptionText} ${detailsText}`;

      for (const { key, pattern } of attributePatterns) {
        const match = fullText.match(pattern);
        if (match) {
          let value = match[1]
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/&nbsp;/g, '')
            .replace(/^\s*:\s*/, '')
            .trim();
          
          if (value && value.length > 0 && value.length < 100) {
            item.attributes[key] = value;
          }
        }
      }

      logger.info(`[LuluBerlu] ✅ Item récupéré: ${item.name || item.id}`);

      // Traduction automatique si demandée
      if (autoTrad && lang !== 'fr') {
        logger.debug(`[LuluBerlu] Traduction vers ${lang}`);

        if (item.name) {
          item.name = await translateText(item.name, 'fr', lang);
        }
        if (item.description) {
          item.description = await translateText(item.description, 'fr', lang);
        }
        if (item.brand) {
          item.brand = await translateText(item.brand, 'fr', lang);
        }

        item.lang = lang;
      }

      return item;

    } catch (err) {
      lastError = err;
      logger.warn(`[LuluBerlu] Erreur tentative ${attempt}/${MAX_RETRIES}: ${err.message}`);

      if (attempt >= MAX_RETRIES) break;

      // Attente progressive avant retry
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }

  throw lastError || new Error('[LuluBerlu] Échec après toutes les tentatives');
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Vérifie l'état du provider Lulu-Berlu
 * 
 * @returns {Promise<Object>} État du service
 */
export async function healthCheck() {
  try {
    const client = getFsrClient();
    const health = await client.healthCheck();
    
    return {
      status: health.healthy ? 'healthy' : 'unhealthy',
      flaresolverr: {
        healthy: health.healthy,
        latency: health.latency,
        message: health.message
      }
    };
  } catch (error) {
    logger.error(`[LuluBerlu] Health check failed: ${error.message}`);
    
    return {
      status: 'unhealthy',
      flaresolverr: {
        healthy: false,
        message: error.message
      }
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Décode les entités HTML
 * @param {string} text - Texte avec entités HTML
 * @returns {string} Texte décodé
 */
function decodeHtmlEntities(text) {
  if (!text) return text;
  
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&euro;': '€',
    '&copy;': '©',
    '&reg;': '®'
  };

  return text.replace(/&[a-z0-9#]+;/gi, match => entities[match] || match);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  searchLuluBerlu,
  getLuluBerluDetails,
  healthCheck
};
