/**
 * Transformerland Provider
 * 
 * Transformers collector's guide and online store
 * Requires FlareSolverr for scraping
 * 
 * @module domains/collectibles/providers/transformerland
 */

import { FlareSolverrClient } from '../../../infrastructure/scraping/FlareSolverrClient.js';
import { translateText } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

// Constants
const TRANSFORMERLAND_BASE_URL = 'https://www.transformerland.com';
const TRANSFORMERLAND_SEARCH_URL = `${TRANSFORMERLAND_BASE_URL}/show_parent_g12.php`;
const DEFAULT_MAX_RESULTS = 24;
const MAX_RETRIES = 3;

// Singleton FlareSolverr client
let fsrClient = null;

/**
 * Get or create FlareSolverr client instance
 * @returns {FlareSolverrClient}
 */
function getFsrClient() {
  if (!fsrClient) {
    fsrClient = new FlareSolverrClient();
  }
  return fsrClient;
}

/**
 * Decode HTML entities
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  if (!text) return '';
  
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&nbsp;': ' '
  };
  
  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

/**
 * Search on Transformerland
 * @param {string} query - Search term
 * @param {object} options - Search options
 * @param {number} options.maxResults - Maximum number of results
 * @param {string} options.lang - Target language code (ISO 639-1)
 * @param {boolean} options.autoTrad - Enable automatic translation
 * @returns {Promise<object>} Search results
 */
// Variantes de requête : titre complet, puis sans le 1er mot (souvent la marque/ligne : « GoBots »),
// puis sans le dernier, puis le mot le plus significatif — pour matcher les items rangés sous un
// parent (« GoBots Command Center » → « Command Center »). Renvoie la 1re variante non vide.
function _queryVariants(query) {
  const words = (query || '').trim().split(/\s+/).filter(Boolean);
  const v = [query];
  if (words.length >= 2) {
    v.push(words.slice(1).join(' '));      // sans le 1er mot
    v.push(words.slice(0, -1).join(' '));  // sans le dernier
  }
  if (words.length >= 3) v.push(words.slice(1, -1).join(' '));  // milieu
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length >= 4) v.push(longest);
  return [...new Set(v.filter(Boolean))];
}

export async function searchTransformerland(query, options = {}) {
  const variants = _queryVariants(query);
  let last = null;
  for (const q of variants) {
    const res = await _searchNames(q, options);
    if (res && res.count > 0) return { ...res, query, matchedTerm: q };
    last = res;
  }
  return last || { query, count: 0, results: [], source: 'transformerland' };
}

async function _searchNames(query, options = {}) {
  const {
    maxResults = DEFAULT_MAX_RESULTS,
    lang = 'en',
    autoTrad = false
  } = options;

  const shouldTranslate = autoTrad === true || autoTrad === 1 || autoTrad === '1';
  
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      logger.info(`Search attempt ${attempt}/${MAX_RETRIES} for: "${query}"`);
      
      const client = getFsrClient();
      const searchUrl = `${TRANSFORMERLAND_SEARCH_URL}?action=show_names&term=${encodeURIComponent(query)}`;
      
      logger.info(`Fetching: ${searchUrl}`);
      
      const html = await client.get(searchUrl, {
        maxTimeout: 60000
      });
      
      logger.info(`Received HTML: ${html.length} characters`);
      
      const results = [];

      // Parse results from show_parent_g12.php (table format)
      // Structure: <tr bgcolor="..."><td>image</td><td>Set Name: ... Series: ... Subgroup: ... Allegiance: ...</td></tr>
      const rowRegex = /<tr\s+bgcolor="[^"]*"[^>]*>[\s\S]*?<a\s+href="\?action=show_parent&(?:amp;)?toyid=(\d+)"[^>]*>[\s\S]*?<img\s+src="([^"]+)"[^>]*>[\s\S]*?Set Name:\s*<a[^>]*>([^<]+)<\/a>[\s\S]*?Series:\s*([^<]+)<br>[\s\S]*?Subgroup:\s*([^<]+)<br>[\s\S]*?Allegiance:\s*([^<]+)<\/td>/gi;
      
      let rowMatch;
      while ((rowMatch = rowRegex.exec(html)) !== null && results.length < maxResults) {
        try {
          const [, toyId, thumbnailPath, rawName, rawSeries, rawSubgroup, rawAllegiance] = rowMatch;
          
          const name = decodeHtmlEntities(rawName.trim());
          const series = decodeHtmlEntities(rawSeries.trim());
          const subgroup = decodeHtmlEntities(rawSubgroup.trim());
          const allegiance = decodeHtmlEntities(rawAllegiance.trim());
          
          // Extract year from subgroup (format "Leaders (1984)" or "(1984)")
          let year = null;
          const yearMatch = subgroup.match(/\((\d{4})\)/);
          if (yearMatch) {
            year = parseInt(yearMatch[1], 10);
          }
          
          // Detail URL
          const itemUrl = `${TRANSFORMERLAND_BASE_URL}/show_parent_g12.php?action=show_parent&toyid=${toyId}`;
          
          // Image - keep thumbnail, full size will be in details
          let image = thumbnailPath.startsWith('http') 
            ? thumbnailPath 
            : `${TRANSFORMERLAND_BASE_URL}${thumbnailPath}`;
          
          if (toyId && name) {
            results.push({
              id: toyId,
              name: name,
              url: itemUrl,
              image: image,
              price: null, // No prices in guide view
              currency: null,
              availability: null,
              series: series,
              subgroup: subgroup,
              allegiance: allegiance,
              year: year,
              condition: null
            });
          }
        } catch (parseErr) {
          logger.warn(`Error parsing row: ${parseErr.message}`);
        }
      }
      
      logger.info(`Parsed table: ${results.length} results found`);
      
      // Apply translation if requested
      if (shouldTranslate && lang && results.length > 0) {
        for (const result of results) {
          if (result.name) {
            const translated = await translateText(result.name, lang, { sourceLang: 'en' });
            result.name = translated;
          }
        }
      }
      
      logger.info(`✅ ${results.length} results found`);
      
      return {
        query,
        count: results.length,
        results,
        source: 'transformerland'
      };
      
    } catch (err) {
      lastError = err;
      logger.error(`Error on attempt ${attempt}: ${err.message}`);
      if (attempt >= MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  
  throw lastError || new Error('Failed after all retries');
}

/**
 * Get Transformerland item details
 * @param {string} itemId - Numeric toyId (for show_parent_g12.php) or full URL
 * @param {object} options - Options
 * @param {string} options.lang - Target language code (ISO 639-1)
 * @param {boolean} options.autoTrad - Enable automatic translation
 * @returns {Promise<object>} Item details
 */
export async function getTransformerlandDetails(itemId, options = {}) {
  const { lang = 'en', autoTrad = false } = options;
  const shouldTranslate = autoTrad === true || autoTrad === 1 || autoTrad === '1';
  
  // Build URL - supports:
  // 1. Numeric toyId (e.g., "14926") -> show_parent_g12.php?action=show_parent&toyid=14926
  // 2. Full URL (e.g., "https://...")
  // 3. Relative path (e.g., "/store/item/...")
  let itemUrl;
  const isNumericId = /^\d+$/.test(itemId);
  
  if (isNumericId) {
    // Collector's guide format with toyId
    itemUrl = `${TRANSFORMERLAND_BASE_URL}/show_parent_g12.php?action=show_parent&toyid=${itemId}`;
  } else if (itemId.startsWith('http')) {
    itemUrl = itemId;
  } else if (itemId.startsWith('/')) {
    itemUrl = `${TRANSFORMERLAND_BASE_URL}${itemId}`;
  } else {
    // Fallback: assume toyId
    itemUrl = `${TRANSFORMERLAND_BASE_URL}/show_parent_g12.php?action=show_parent&toyid=${itemId}`;
  }
  
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      logger.info(`Detail attempt ${attempt}/${MAX_RETRIES} for: "${itemId}"`);
      
      const client = getFsrClient();
      logger.info(`[Transformerland] Fetching: ${itemUrl}`);
      
      const html = await client.get(itemUrl, {
        maxTimeout: 45000
      });
      
      logger.info(`[Transformerland] Received detail HTML: ${html.length} characters`);
      
      // Check if Cloudflare challenge not resolved
      if (html.includes('Just a moment') || html.includes('challenge-platform')) {
        throw new Error(`Cloudflare challenge not resolved: ${itemId}`);
      }
      
      // Check if item not found
      if (html.includes('Item not found') || html.includes('Page not found') || 
          (html.length < 3000 && !html.includes('<meta itemprop="sku"'))) {
        throw new Error(`Item not found: ${itemId}`);
      }
      
      const item = {
        id: itemId,
        url: itemUrl,
        name: null,
        images: [],
        instructions: [],
        specs: [],
        description: null,
        price: null,
        currency: 'USD',
        availability: 'unknown',
        condition: null,
        series: null,
        subgroup: null,
        faction: null,
        size: null,
        year: null,
        manufacturer: null,
        attributes: {},
        source: 'transformerland'
      };
      
      // Detect if it's a guide page (show_parent_g12.php) or store page (/store/)
      const isGuidePage = itemUrl.includes('show_parent_g12.php') || html.includes("Collector's Guide Toy Info");
      
      if (isGuidePage) {
        // === PARSER FOR COLLECTOR'S GUIDE PAGES ===
        
        // Extract title from title tag
        // Format: "Leaders Optimus Prime (Transformers, G1, Autobot) | Transformerland.com"
        const titleMatch = html.match(/<title>([^|<]+)/i);
        if (titleMatch) {
          const fullTitle = decodeHtmlEntities(titleMatch[1].trim());
          // Extract: "Subgroup Name (ToyLine, Series, Allegiance)"
          const titleParts = fullTitle.match(/^(.+?)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
          if (titleParts) {
            const [, nameWithSubgroup, toyLine, series, allegiance] = titleParts;
            item.name = nameWithSubgroup.trim();
            item.series = series.trim();
            item.faction = allegiance.trim();
            item.attributes.toyLine = toyLine.trim();
          } else {
            item.name = fullTitle;
          }
        }
        
        // Extract info from table
        // Series
        const seriesMatch = html.match(/<th[^>]*>Series:<\/th>\s*<td><a[^>]*>([^<]+)<\/a>/i);
        if (seriesMatch) item.series = decodeHtmlEntities(seriesMatch[1].trim());
        
        // Subgroup
        const subgroupMatch = html.match(/<th[^>]*>Subgroup:<\/th>\s*<td><a[^>]*>([^<]+)<\/a>/i);
        if (subgroupMatch) item.subgroup = decodeHtmlEntities(subgroupMatch[1].trim());
        
        // Alliance/Allegiance/Faction
        const allianceMatch = html.match(/<th[^>]*>Alliance:<\/th>\s*<td>([^<]+)<\/td>/i);
        if (allianceMatch) item.faction = decodeHtmlEntities(allianceMatch[1].trim());
        
        // Toy Line
        const toyLineMatch = html.match(/<th[^>]*>Toy Line:<\/th>\s*<td><a[^>]*>([^<]+)<\/a>/i);
        if (toyLineMatch) item.attributes.toyLine = decodeHtmlEntities(toyLineMatch[1].trim());
        
        // Extract main image from og:image
        const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (ogImageMatch) {
          let mainImg = ogImageMatch[1];
          // Convert thumbnail to high resolution if possible
          mainImg = mainImg.replace('/thumbnails/', '/reference_images/');
          item.images.push(mainImg);
        }
        
        // Extract reference images
        const refImagePattern = /<a\s+href="(\/image\/reference_images\/[^"]+)"/gi;
        let refImgMatch;
        const seenImages = new Set(item.images);
        while ((refImgMatch = refImagePattern.exec(html)) !== null) {
          let imgUrl = `${TRANSFORMERLAND_BASE_URL}${refImgMatch[1]}`;
          if (!seenImages.has(imgUrl)) {
            seenImages.add(imgUrl);
            item.images.push(imgUrl);
          }
        }
        
        // Extract scans (instructions, specs) — into dedicated arrays
        const scanPattern = /<a\s+href="(\/image\/archive\/[^"]+\/full\/[^"]+)"/gi;
        let scanMatch;
        while ((scanMatch = scanPattern.exec(html)) !== null) {
          let imgUrl = `${TRANSFORMERLAND_BASE_URL}${scanMatch[1]}`;
          if (!seenImages.has(imgUrl)) {
            seenImages.add(imgUrl);
            if (imgUrl.includes('/instructionscans/')) {
              item.instructions.push(imgUrl);
            } else if (imgUrl.includes('/specscans/')) {
              item.specs.push(imgUrl);
            } else {
              item.images.push(imgUrl);
            }
          }
        }
        
        // Extract year from variants
        const yearMatch = html.match(/Year:\s*(\d{4})/i);
        if (yearMatch) item.year = parseInt(yearMatch[1]);
        
        // Extract description from meta description
        const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
        if (metaDescMatch) {
          item.description = decodeHtmlEntities(metaDescMatch[1].trim());
        }
        
        // Size from figures
        const sizeMatch = html.match(/Size:\s*([\d.]+)"\s*\(([\d.]+)cm\)/i);
        if (sizeMatch) {
          item.size = `${sizeMatch[1]}" (${sizeMatch[2]}cm)`;
        }
        
        // Availability - check if at least one "In Stock" exists
        if (html.includes('In Stock')) {
          item.availability = 'in_stock';
        } else if (html.includes('Sold Out')) {
          item.availability = 'out_of_stock';
        }
        
        // No prices for guide pages (these are references, not sales)
        item.price = null;
        
      } else {
        // === PARSER FOR STORE PAGES ===
        
        // Extract Schema.org/Product data from meta itemprop
        const skuMatch = html.match(/<meta\s+itemprop="sku"\s+content="([^"]+)"/i);
        if (skuMatch) item.id = skuMatch[1];
        
        const nameMatch = html.match(/<meta\s+itemprop="name"\s+content="([^"]+)"/i);
        if (nameMatch) item.name = decodeHtmlEntities(nameMatch[1]);
        
        const descMatch = html.match(/<meta\s+itemprop="description"\s+content="([^"]+)"/i);
        if (descMatch) item.description = decodeHtmlEntities(descMatch[1]);
        
        const priceMatch = html.match(/<meta\s+itemprop="price"\s+content="([^"]+)"/i);
        if (priceMatch) item.price = parseFloat(priceMatch[1]);
        
        const currencyMatch = html.match(/<meta\s+itemprop="priceCurrency"\s+content="([^"]+)"/i);
        if (currencyMatch) item.currency = currencyMatch[1];
        
        const availMatch = html.match(/<link\s+itemprop="availability"\s+href="([^"]+)"/i);
        if (availMatch) {
          item.availability = availMatch[1].includes('InStock') ? 'in_stock' : 'out_of_stock';
        }
        
        // Extract main image
        const mainImgMatch = html.match(/<img[^>]+id="mainphoto"[^>]+src="([^"]+)"/i);
        if (mainImgMatch) {
          let imgUrl = mainImgMatch[1];
          if (!imgUrl.startsWith('http')) {
            imgUrl = `${TRANSFORMERLAND_BASE_URL}${imgUrl}`;
          }
          // Use high resolution version
          imgUrl = imgUrl.replace('/thumbnails/', '/hires/');
          item.images.push(imgUrl);
        }
        
        // Extract gallery images
        const thumbPattern = /<a[^>]*href="([^"]*\/image\/inventory\/[^"]+)"/gi;
        let thumbMatch;
        const seenImages = new Set(item.images);
        while ((thumbMatch = thumbPattern.exec(html)) !== null) {
          let imgUrl = thumbMatch[1];
          if (!imgUrl.startsWith('http')) {
            imgUrl = `${TRANSFORMERLAND_BASE_URL}${imgUrl}`;
          }
          imgUrl = imgUrl.replace('/thumbnails/', '/hires/');
          if (!seenImages.has(imgUrl)) {
            seenImages.add(imgUrl);
            item.images.push(imgUrl);
          }
        }
        
        // Extract characteristics from desc-* divs
        const seriesMatch = html.match(/<div\s+class="desc-group"[^>]*>([^<]+)/i);
        if (seriesMatch) item.series = decodeHtmlEntities(seriesMatch[1].trim());
        
        const subgroupMatch = html.match(/<div\s+class="desc-subgroup"[^>]*>([^<]+)/i);
        if (subgroupMatch) item.subgroup = decodeHtmlEntities(subgroupMatch[1].trim());
        
        const condMatch = html.match(/<div\s+class="desc-cond"[^>]*>([^<]+)/i);
        if (condMatch) item.condition = decodeHtmlEntities(condMatch[1].trim());
        
        const factionMatch = html.match(/<div\s+class="desc-faction"[^>]*>([^<]+)/i);
        if (factionMatch) item.faction = decodeHtmlEntities(factionMatch[1].trim());
        
        const sizeMatch = html.match(/<div\s+class="desc-size"[^>]*>([^<]+)/i);
        if (sizeMatch) item.size = decodeHtmlEntities(sizeMatch[1].trim());
        
        // Extract year from series or description
        const yearMatch = (item.series || item.description || '').match(/\b(19[89]\d|20[0-2]\d)\b/);
        if (yearMatch) item.year = parseInt(yearMatch[1]);
        
        // Extract manufacturer (Hasbro, Takara, etc.)
        const mfgPatterns = [
          /(?:by|from|manufacturer[:\s]+)([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
          /(Hasbro|Takara|Tomy|TakaraTomy|Bandai|FansProject|MMC|DX9|TFC|Unique Toys)/i
        ];
        for (const pattern of mfgPatterns) {
          const mfgMatch = (item.description || html).match(pattern);
          if (mfgMatch) {
            item.manufacturer = mfgMatch[1].trim();
            break;
          }
        }
        
        // Extract additional attributes from tables
        const tableRowPattern = /<tr[^>]*>\s*<t[dh][^>]*>([^<]+)<\/t[dh]>\s*<t[dh][^>]*>([^<]+)<\/t[dh]>/gi;
        let rowMatch;
        while ((rowMatch = tableRowPattern.exec(html)) !== null) {
          const key = rowMatch[1].replace(/:$/, '').trim().toLowerCase();
          const value = decodeHtmlEntities(rowMatch[2].trim());
          
          if (key && value && !item.attributes[key]) {
            item.attributes[key] = value;
          }
        }
      }
      
      // Fallback: extract name from page title
      if (!item.name) {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          item.name = decodeHtmlEntities(titleMatch[1].replace(/\s*[-|]\s*Transformerland.*$/i, '').trim());
        }
      }
      
      if (!item.name) {
        throw new Error(`Unable to extract item information: ${itemUrl}`);
      }
      
      // Apply translation if requested
      if (shouldTranslate && lang) {
        // Transformerland is always in English
        if (item.description) {
          const translated = await translateText(item.description, lang, { sourceLang: 'en' });
          item.description = translated;
        }
        if (item.name) {
          const translated = await translateText(item.name, lang, { sourceLang: 'en' });
          item.name = translated;
        }
      }
      
      logger.info(`✅ Item retrieved: ${item.name}`);
      return item;

    } catch (err) {
      lastError = err;
      logger.error(`Error on attempt ${attempt}: ${err.message}`);
      if (attempt >= MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  
  throw lastError || new Error('Failed after all retries');
}

/**
 * Health check for Transformerland provider
 * @returns {Promise<object>} Health status
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
    logger.error(`Health check failed: ${error.message}`);
    return {
      status: 'unhealthy',
      flaresolverr: {
        healthy: false,
        latency: null,
        message: error.message
      }
    };
  }
}
