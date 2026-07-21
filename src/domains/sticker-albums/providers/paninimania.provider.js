/**
 * Paninimania Provider
 * 
 * Panini sticker albums database
 * Requires FlareSolverr for scraping
 * Complex parsing: checklists, special stickers, multiple image types
 * 
 * @module domains/sticker-albums/providers/paninimania
 */

import FlareSolverrClient from '../../../infrastructure/scraping/FlareSolverrClient.js';
import { translateText } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

const PANINIMANIA_BASE_URL = 'https://www.paninimania.com';
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
    '&nbsp;': ' ',
    '&eacute;': 'é',
    '&egrave;': 'è',
    '&ecirc;': 'ê',
    '&agrave;': 'à',
    '&ccedil;': 'ç'
  };
  
  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

/**
 * Format search term for Paninimania
 * @param {string} term - Search term
 * @returns {string} Formatted term
 */
function formatPaninimaniaTerm(term) {
  // Le site construit la recherche via ids=111_<mots-cles> (JS changement_ids5 -> abcformat(kwd,"_")) :
  // minuscules, accents retires, non-alphanumeriques -> separateur, mots JOINTS par "_".
  // Ex: \u00ab Super Mario \u00bb -> \u00ab super_mario \u00bb (ni espace/%20, ni collage \u00ab supermario \u00bb : les deux cassent).
  return term
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse checklist to array of numbers
 * Supports: "1 à 100", "105", "110-120"
 * @param {string} raw - Raw string
 * @returns {Array<number>} Array of numbers
 */
function parseChecklistToArray(raw) {
  if (!raw) return [];
  
  const items = [];
  const parts = raw.split(/[,;]/);
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    // Pattern "X à Y" or "X - Y"
    const rangeMatch = trimmed.match(/(\d+)\s*(?:à|-)\s*(\d+)/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      for (let i = start; i <= end; i++) {
        items.push(i);
      }
    } else {
      // Simple number
      const numMatch = trimmed.match(/(\d+)/);
      if (numMatch) {
        items.push(parseInt(numMatch[1]));
      }
    }
  }
  
  return items;
}

/**
 * Parse special stickers list (letters, alphanumeric, etc.)
 * Supports: A, B, C or A1, B2, C3 or mixtures
 * @param {string} raw - Raw string
 * @returns {Array<string>} Array of identifiers
 */
function parseSpecialStickersToArray(raw) {
  if (!raw) return [];
  
  const items = [];
  const parts = raw.split(/[,;]/);
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    // Pattern for letters alone or alphanumeric combinations
    // Supports: A, B, C or A1, B2, C3 or I, II, III
    const itemMatch = trimmed.match(/^([A-Z]+\d*|[IVX]+)$/i);
    if (itemMatch) {
      items.push(itemMatch[1].toUpperCase());
    } else {
      // Try to capture "X à Y" for letters (e.g., "A à Z")
      const rangeMatch = trimmed.match(/^([A-Z])\s*(?:à|-)\s*([A-Z])$/i);
      if (rangeMatch) {
        const start = rangeMatch[1].toUpperCase().charCodeAt(0);
        const end = rangeMatch[2].toUpperCase().charCodeAt(0);
        for (let i = start; i <= end; i++) {
          items.push(String.fromCharCode(i));
        }
      }
    }
  }
  
  return items;
}

// Types de cartes « spéciales » (finitions / éditions) à distinguer de la base (Histoire/Normales).
const SPECIAL_CARD_KW = /(dor[ée]|argent|brillant|jedi|hologra|m[ée]tal|paillet|transparent|puzzle|relief|autocollant|tatouage|phosphor|lenticul|3d|fluo|[ée]dition|limit|foil|shiny|chrome|prism|arc.?en.?ciel|rainbow)/i;

/**
 * Développe une liste NUMÉRIQUE brute (« 161 à 168 », « 1-30, 45 ») en tableau d'entiers.
 */
function expandNumericList(raw) {
  const out = [];
  if (!raw) return out;
  for (const part of String(raw).split(/[,;]/)) {
    const t = part.trim();
    const range = t.match(/(\d+)\s*(?:à|-)\s*(\d+)/i);
    if (range) {
      const a = parseInt(range[1]), b = parseInt(range[2]);
      if (a <= b && b - a <= 5000) for (let i = a; i <= b; i++) out.push(i);
    } else if (/^\d+$/.test(t)) {
      out.push(parseInt(t));
    }
  }
  return out;
}

/**
 * Développe une liste de CARTES-LETTRES brute (« LESA, LEST », « A à Z ») en tableau de codes.
 */
function expandLetterList(raw) {
  const out = [];
  if (!raw) return out;
  for (const part of String(raw).split(/[,;]/)) {
    const t = part.trim();
    const range = t.match(/^([A-Z])\s*(?:à|-)\s*([A-Z])$/i);
    if (range) {
      for (let i = range[1].toUpperCase().charCodeAt(0); i <= range[2].toUpperCase().charCodeAt(0); i++) {
        out.push(String.fromCharCode(i));
      }
    } else {
      const c = t.match(/^([A-Z][A-Z0-9]*)$/i);
      if (c) out.push(c[1].toUpperCase());
    }
  }
  return out;
}

/**
 * Parse le format « Cartes <Type> [*marqueur] : <liste> » présent dans la DESCRIPTION de certains
 * albums (ex Topps « Voyage vers Star Wars ») — que le regex checklist standard ne capte pas.
 * → [{ type, marker, listRaw }].
 */
function parseCardSectionsFromText(text) {
  const out = [];
  if (!text) return out;
  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim();
    if (!/^cartes?\b/i.test(line)) continue;
    line = line.replace(/^cartes?\s+/i, '');
    const mk = line.match(/\*([A-Za-z]+)/);          // marqueur *dor / *bri / *briJ / *lim …
    const marker = mk ? mk[1].toLowerCase() : null;
    line = line.replace(/\*[A-Za-z]+/g, '').trim();
    let type, listRaw;
    const ci = line.indexOf(':');
    if (ci >= 0) {                                    // « Type : liste »
      type = line.slice(0, ci).trim();
      listRaw = line.slice(ci + 1).trim();
    } else {                                          // « Type 169 à 200 » (sans deux-points)
      const rm = line.match(/(\d+\s*(?:à|-)\s*\d+.*|\d+.*)$/i);
      if (!rm) continue;
      type = line.slice(0, rm.index).trim();
      listRaw = rm[0].trim();
    }
    if (type && listRaw) out.push({ type, marker, listRaw });
  }
  return out;
}

/**
 * Search Paninimania albums
 * @param {string} term - Search term
 * @param {object} options - Search options
 * @param {number} options.maxResults - Maximum results
 * @param {string} options.lang - Target language
 * @param {boolean} options.autoTrad - Enable translation
 * @returns {Promise<object>} Search results
 */
export async function searchPaninimania(term, options = {}) {
  const {
    maxResults = DEFAULT_MAX_RESULTS,
    lang = 'fr',
    autoTrad = false
  } = options;

  const formattedTerm = formatPaninimaniaTerm(term);
  const shouldTranslate = autoTrad === true || autoTrad === 1 || autoTrad === '1';

  // Build search terms: try concatenated first, fallback to individual words (longest first)
  const searchTerms = [formattedTerm];
  const words = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(w => w.length >= 3);
  if (words.length > 1) {
    const sorted = [...words].sort((a, b) => b.length - a.length);
    for (const w of sorted) {
      if (!searchTerms.includes(w)) searchTerms.push(w);
    }
  }
  
  for (const currentTerm of searchTerms) {
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      logger.info(`[Paninimania] Search attempt ${attempt}/${MAX_RETRIES}: "${term}" -> "${currentTerm}"`);
      
      const client = getFsrClient();
      const allResults = [];
      let currentPage = 1;
      let totalPages = 1;
      
      while (allResults.length < maxResults) {
        // currentTerm est déjà normalisé en [a-z0-9_] : PAS d'encodeURIComponent (l'espace→%20 casse ids=111_)
        let searchUrl = `${PANINIMANIA_BASE_URL}/?pag=cid508&idf=15&idd=all&ids=111_${currentTerm}`;
        if (currentPage > 1) {
          searchUrl += `&npa=${currentPage}`;
        }
        
        logger.info(`[Paninimania] Fetching page ${currentPage}`);

        const html = await client.get(searchUrl, {
          maxTimeout: 45000,
          waitInSeconds: 2
        });
        
        if (html.includes('Aucun album') || html.length < 5000) {
          break;
        }
        
        const pageMatch = html.match(/Page\s+(\d+)\/(\d+)/i);
        if (pageMatch) {
          currentPage = parseInt(pageMatch[1]);
          totalPages = parseInt(pageMatch[2]);
        }
        
        // Parse albums
        const albumBlockRegex = /<div\s+class="d2">\s*<div\s+class="y0"[^>]*style="gap:\s*10px\s+10px[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
        let albumMatch;
        let pageResults = 0;
        
        while ((albumMatch = albumBlockRegex.exec(html)) !== null) {
          if (allResults.length >= maxResults) break;
          
          const albumHtml = albumMatch[1];
          
          try {
            const idMatch = albumHtml.match(/href="[^"]*pag=cid508_alb[^"]*idm=(\d+)"/i);
            if (!idMatch) continue;
            const albumId = idMatch[1];
            
            const titleMatch = albumHtml.match(/<b><a\s+href="[^"]*"[^>]*>([^<]+)<\/a><\/b>/i);
            const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null;
            
            if (!title) continue;
            
            const imgMatch = albumHtml.match(/src="(files\/[^"]+\?n=\d+s\.jpg)"/i);
            const thumbnail = imgMatch ? `${PANINIMANIA_BASE_URL}/${imgMatch[1]}` : null;
            
            const yearMatch = albumHtml.match(/<b>\s*(\d{4}|[a-z]+\s+\d{4})\s*<\/b>/i);
            const year = yearMatch ? yearMatch[1].trim() : null;
            
            const albumUrl = `${PANINIMANIA_BASE_URL}/?pag=cid508_alb&idf=15&idm=${albumId}`;
            
            allResults.push({
              id: albumId,
              title: title,
              url: albumUrl,
              image: thumbnail,
              thumbnail: thumbnail,
              year: year
            });
            
            pageResults++;
          } catch (e) {
            logger.warn(`[Paninimania] Error parsing album: ${e.message}`);
          }
        }
        
        if (currentPage >= totalPages || pageResults === 0) {
          break;
        }
        
        currentPage++;
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Apply translation if requested
      if (shouldTranslate && lang && allResults.length > 0) {
        for (const result of allResults) {
          if (result.title) {
            const translated = await translateText(result.title, lang, { sourceLang: 'fr' });
            result.title = translated;
          }
        }
      }
      
      if (allResults.length > 0) {
        // When using fallback term, filter results that match original query words
        let finalResults = allResults;
        if (currentTerm !== formattedTerm && words.length > 1) {
          const minMatch = Math.max(1, Math.ceil(words.length / 2));
          finalResults = allResults.filter(r => {
            const titleNorm = r.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const matched = words.filter(w => titleNorm.includes(w)).length;
            return matched >= minMatch;
          });
          // No matching results after filter — try next search term
          if (finalResults.length === 0) {
            logger.info(`[Paninimania] ${allResults.length} results for "${currentTerm}" but none match enough query words, trying next term...`);
            break;
          }
        }

        logger.info(`[Paninimania] ✅ ${finalResults.length} results found (term: "${currentTerm}")`);
        
        return {
          source: 'paninimania',
          query: term,
          formattedQuery: currentTerm,
          total: finalResults.length,
          results: finalResults
        };
      }
      
      // 0 results: try next search term if available
      logger.info(`[Paninimania] 0 results for "${currentTerm}", trying next term...`);
      break;
      
    } catch (err) {
      lastError = err;
      logger.error(`[Paninimania] Error on attempt ${attempt}: ${err.message}`);
      if (attempt >= MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  } // end searchTerms loop
  
  // All terms exhausted with 0 results — return empty
  return {
    source: 'paninimania',
    query: term,
    formattedQuery: formattedTerm,
    total: 0,
    results: []
  };
}

/**
 * Get Paninimania album details
 * @param {string} albumId - Album ID or URL
 * @param {object} options - Options
 * @param {string} options.lang - Target language
 * @param {boolean} options.autoTrad - Enable translation
 * @returns {Promise<object>} Album details
 */
export async function getPaninimaniAlbumDetails(albumId, options = {}) {
  const { lang = 'fr', autoTrad = false } = options;
  const shouldTranslate = autoTrad === true || autoTrad === 1 || autoTrad === '1';
  
  // Extract ID from URL if needed
  let id = albumId;
  if (albumId.includes('paninimania.com')) {
    const match = albumId.match(/idm=(\d+)/i);
    if (match) {
      id = match[1];
    }
  }
  
  let attempt = 0;
  let lastError = null;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const albumUrl = `${PANINIMANIA_BASE_URL}/?pag=cid508_alb&idf=15&idm=${id}`;
      logger.info(`[Paninimania] Detail attempt ${attempt}/${MAX_RETRIES} for album: ${id}`);
      
      const client = getFsrClient();
      const html = await client.get(albumUrl, {
        maxTimeout: 45000,
        waitInSeconds: 2
      });
      
      logger.info(`[Paninimania] Received album page: ${html.length} characters`);
      
      // Check if album exists
      if (html.includes('page introuvable') || html.includes("n'existe pas") || html.length < 3000) {
        throw new Error(`Album ${id} not found`);
      }
      
      // Extract title from <h1>
      const titleMatch = html.match(/<h1>\s*([^<]+)\s*<\/h1>/i);
      const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null;
      
      // Extract detailed description from <div class="d2"> > <div class="g0">
      let description = null;
      const descMatch = html.match(/<div\s+class="d2">\s*<div\s+class="g0">([\s\S]*?)<\/div>\s*<\/div>/i);
      if (descMatch) {
        // Clean HTML (keep <br> as line breaks)
        description = descMatch[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/\n\n+/g, '\n\n')
          .trim();
        description = decodeHtmlEntities(description);
      }
      
      // Extract main image (format: files/15/{folder}/?n={id}b.jpg)
      const mainImgMatch = html.match(/src="(files\/[^"]+\?n=\d+b\.jpg)"/i);
      const mainImage = mainImgMatch ? `${PANINIMANIA_BASE_URL}/${mainImgMatch[1]}` : null;
      
      // Extract copyright
      const copyrightMatch = html.match(/Copyright\s*:\s*<\/b>([^<]+)/i);
      const copyright = copyrightMatch ? decodeHtmlEntities(copyrightMatch[1].trim()) : null;
      
      // Extract barcode (EAN/UPC)
      const barcodeMatch = html.match(/Code-barres\s*:\s*<\/b>([^<]+)/i);
      const barcode = barcodeMatch ? barcodeMatch[1].trim() : null;
      
      // Extract release date
      const dateMatch = html.match(/Premi[èe]re\s+parution\s*:\s*<\/b>([^<]+)/i);
      const releaseDate = dateMatch ? decodeHtmlEntities(dateMatch[1].trim()) : null;
      
      // Extract checklist (format: "Editor : 1 à 100")
      const checklistMatch = html.match(/<b>[^<]+<\/b><br>\s*([^<:]+:\s*[^<]+)<br>/i);
      let editor = null;
      let checklistRaw = null;
      let checklistParsed = [];
      
      if (checklistMatch) {
        const checklistText = decodeHtmlEntities(checklistMatch[1].trim());
        const colonIdx = checklistText.indexOf(':');
        if (colonIdx > 0) {
          editor = checklistText.substring(0, colonIdx).trim();
          checklistRaw = checklistText.substring(colonIdx + 1).trim();
        } else {
          checklistRaw = checklistText;
        }
        
        // Parse checklist (numbers only). Split aussi sur « + » : une checklist du type
        // « 1 à 216 + cartes éditions limitées » gardait sinon « 1 à 216 + … » d'un bloc, et
        // l'ancre $ du range match échouait → items vide (bug albums Topps « X à N + … »).
        const parts = checklistRaw.split(/[,;+]/);
        
        for (const part of parts) {
          // Strip parenthetical suffixes like "(sur 495)"
          const trimmed = part.replace(/\s*\([^)]*\)/g, '').trim();
          
          // Parse numbers only (letters are now in specialStickers)
          const numRangeMatch = trimmed.match(/^(\d+)\s*(?:à|-)\s*(\d+)$/i);
          if (numRangeMatch) {
            const start = parseInt(numRangeMatch[1]);
            const end = parseInt(numRangeMatch[2]);
            for (let i = start; i <= end; i++) {
              checklistParsed.push(i);
            }
          } else if (/^\d+$/.test(trimmed)) {
            // Simple number
            checklistParsed.push(parseInt(trimmed));
          }
        }
      }
      
      // Format « Cartes <Type> [*marqueur] : <liste> » logé dans les blocs g0 (ex albums Topps
      // « Voyage vers Star Wars ») : le regex checklist standard capte parfois la base (« 1 à 216 »)
      // mais JAMAIS les finitions (*dor/*bri/*briJ/*lim) ni les cartes-lettres (LESA/LEST). On lit donc
      // TOUJOURS les sections « Cartes … » de tous les g0 → base (si le standard n'a rien) + spéciales.
      const g0Text = [...html.matchAll(/<div\s+class="g0">([\s\S]*?)<\/div>/gi)]
        .map(m => decodeHtmlEntities(m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')))
        .join('\n');
      const cardSections = parseCardSectionsFromText(g0Text);
      if ((!checklistParsed || checklistParsed.length === 0) && cardSections.length) {
        const baseSet = new Set();
        for (const sec of cardSections) {
          for (const n of expandNumericList(sec.listRaw)) baseSet.add(n);
        }
        if (baseSet.size) {
          checklistParsed = [...baseSet].sort((a, b) => a - b);
          if (!checklistRaw) {
            checklistRaw = cardSections.map(s => `${s.type} : ${s.listRaw}`).join(' ; ');
          }
        }
      }

      // Build structured checklist
      const checklist = checklistRaw ? {
        raw: checklistRaw,
        total: checklistParsed.length,
        items: checklistParsed
      } : null;
      
      // Extract categories from breadcrumb
      const categories = [];
      const breadcrumbMatch = html.match(/<H2>([\s\S]*?)<\/H2>/i);
      if (breadcrumbMatch) {
        const catRegex = /<a\s+href="[^"]*"[^>]*>([^<]+)<\/a>/gi;
        let catMatch;
        while ((catMatch = catRegex.exec(breadcrumbMatch[1])) !== null) {
          const cat = decodeHtmlEntities(catMatch[1].trim());
          if (cat && cat !== 'Menu' && cat !== 'Tous les albums' && !categories.includes(cat)) {
            categories.push(cat);
          }
        }
      }
      
      // Extract additional images (examples, checklist images, etc.)
      const additionalImages = [];
      const addImgRegex = /<a\s+href="(files\/[^"]+\.jpg)"\s+target="_blank"[^>]*title="([^"]+)"/gi;
      let addImgMatch;
      while ((addImgMatch = addImgRegex.exec(html)) !== null) {
        additionalImages.push({
          url: `${PANINIMANIA_BASE_URL}/${addImgMatch[1]}`,
          caption: decodeHtmlEntities(addImgMatch[2])
        });
      }
      
      // Extract miscellaneous articles
      const articles = [];
      const articleMatch = html.match(/Articles\s+divers\s*:<\/b><br>([\s\S]*?)(?:<\/div>|<br>\s*<br>)/i);
      if (articleMatch) {
        const articleLines = articleMatch[1].split(/<br\s*\/?>/i);
        for (const line of articleLines) {
          const clean = line.replace(/<[^>]+>/g, '').trim();
          if (clean && clean.startsWith('-')) {
            articles.push(clean.substring(1).trim());
          }
        }
      }
      
      // Extract special stickers (Fluorescent, Shiny, Holograms, etc.)
      const specialStickers = [];
      
      // Pattern for different types of special stickers
      const specialPatternsRegex = /<b>Images?\s+(Fluorescentes?|Brillantes?|Hologrammes?|Métallisées?|Pailletées?|Transparentes?|Puzzle|Relief|Autocollantes?|Tatouages?|Phosphorescentes?|3D|Lenticulaires?|Dorées?|Argentées?)\s*<\/b>\s*(?:<em>[^<]*<\/em>)?\s*(?:<b>)?\s*:\s*<\/b>?\s*([^<]+)/gi;
      let specialMatch;
      
      while ((specialMatch = specialPatternsRegex.exec(html)) !== null) {
        const type = decodeHtmlEntities(specialMatch[1].trim());
        const rawList = specialMatch[2].trim();
        
        // Determine if it's a list of numbers or letters/alphanumeric
        const hasNumbers = /\d/.test(rawList.replace(/\d+\s*(?:à|-)\s*\d+/g, ''));
        const hasLetters = /[A-Z]/i.test(rawList);
        
        let parsedList = [];
        
        if (hasLetters && !hasNumbers) {
          // Only letters: A, B, C or A à X
          parsedList = parseSpecialStickersToArray(rawList);
        } else if (hasNumbers && !hasLetters) {
          // Only numbers: 1, 2, 3 or 1 à 10
          parsedList = parseChecklistToArray(rawList);
        } else {
          // Mixed: try to parse intelligently
          const parts = rawList.split(/[,;]/);
          for (const part of parts) {
            const trimmed = part.trim();
            // Alphanumeric (A1, B2) or letter alone
            if (/^[A-Z]+\d*$/i.test(trimmed)) {
              parsedList.push(trimmed.toUpperCase());
            } else if (/^\d+$/.test(trimmed)) {
              parsedList.push(parseInt(trimmed));
            } else {
              // Try range
              const numRange = trimmed.match(/^(\d+)\s*(?:à|-)\s*(\d+)$/i);
              if (numRange) {
                const start = parseInt(numRange[1]);
                const end = parseInt(numRange[2]);
                for (let i = start; i <= end; i++) {
                  parsedList.push(i);
                }
              } else {
                const letterRange = trimmed.match(/^([A-Z])\s*(?:à|-)\s*([A-Z])$/i);
                if (letterRange) {
                  const start = letterRange[1].toUpperCase().charCodeAt(0);
                  const end = letterRange[2].toUpperCase().charCodeAt(0);
                  for (let i = start; i <= end; i++) {
                    parsedList.push(String.fromCharCode(i));
                  }
                }
              }
            }
          }
        }
        
        if (parsedList.length > 0) {
          specialStickers.push({
            name: type,
            raw: rawList,
            total: parsedList.length,
            list: parsedList
          });
        }
      }
      
      // Fallback: search for any "Images X : ..." that might exist
      const genericSpecialRegex = /<b>Images?\s+([^<:]+)\s*<\/b>\s*(?:<em>[^<]*<\/em>)?\s*(?:<b>)?\s*:\s*<\/b>?\s*([^<]+)/gi;
      while ((specialMatch = genericSpecialRegex.exec(html)) !== null) {
        const type = decodeHtmlEntities(specialMatch[1].trim());
        
        // Avoid duplicates
        const alreadyExists = specialStickers.some(s => s.name.toLowerCase() === type.toLowerCase());
        
        if (!alreadyExists && type !== 'divers' && !type.includes('article')) {
          const rawList = specialMatch[2].trim();
          
          // Same parsing logic
          const hasNumbers = /\d/.test(rawList.replace(/\d+\s*(?:à|-)\s*\d+/g, ''));
          const hasLetters = /[A-Z]/i.test(rawList);
          
          let parsedList = [];
          
          if (hasLetters && !hasNumbers) {
            parsedList = parseSpecialStickersToArray(rawList);
          } else if (hasNumbers && !hasLetters) {
            parsedList = parseChecklistToArray(rawList);
          } else {
            const parts = rawList.split(/[,;]/);
            for (const part of parts) {
              const trimmed = part.trim();
              if (/^[A-Z]+\d*$/i.test(trimmed)) {
                parsedList.push(trimmed.toUpperCase());
              } else if (/^\d+$/.test(trimmed)) {
                parsedList.push(parseInt(trimmed));
              } else {
                const numRange = trimmed.match(/^(\d+)\s*(?:à|-)\s*(\d+)$/i);
                if (numRange) {
                  const start = parseInt(numRange[1]);
                  const end = parseInt(numRange[2]);
                  for (let i = start; i <= end; i++) {
                    parsedList.push(i);
                  }
                } else {
                  const letterRange = trimmed.match(/^([A-Z])\s*(?:à|-)\s*([A-Z])$/i);
                  if (letterRange) {
                    const start = letterRange[1].toUpperCase().charCodeAt(0);
                    const end = letterRange[2].toUpperCase().charCodeAt(0);
                    for (let i = start; i <= end; i++) {
                      parsedList.push(String.fromCharCode(i));
                    }
                  }
                }
              }
            }
          }
          
          if (parsedList.length > 0) {
            specialStickers.push({
              name: type,
              raw: rawList,
              total: parsedList.length,
              list: parsedList
            });
          }
        }
      }
      
      // Spéciales issues du format « Cartes <Type> : <liste> » (fallback description) : finitions
      // (*dor/*bri/*briJ/*lim…) et cartes-lettres (LESA/LEST). La base pure (Histoire/Normales) n'y
      // va pas — elle reste dans la checklist de base.
      for (const sec of cardSections) {
        const nums = expandNumericList(sec.listRaw);
        const letters = nums.length ? [] : expandLetterList(sec.listRaw);
        const list = nums.length ? nums : letters;
        if (!list.length) continue;
        const isSpecial = !!sec.marker || SPECIAL_CARD_KW.test(sec.type) || letters.length > 0;
        if (!isSpecial) continue;
        // retirer les « (1 sur 6) » / « (1 sur 2) » parasites du type puis normaliser
        const name = sec.type.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
          .replace(/^./, c => c.toUpperCase());
        if (!name) continue;
        if (specialStickers.some(s => s.name.toLowerCase() === name.toLowerCase())) continue;
        specialStickers.push({
          name, raw: sec.listRaw, total: list.length, list,
          ...(sec.marker ? { marker: sec.marker } : {})
        });
      }

      if (!title) {
        throw new Error(`Unable to extract album information: ${albumUrl}`);
      }

      // Calculate real total (normal + special stickers). Un spécial NUMÉRIQUE déjà dans la base
      // (ex Dorées 161-168 ⊂ 1-216) ne s'ajoute PAS ; seuls les EXTRA (cartes-lettres, n° hors base)
      // comptent — sinon double-comptage (bug format Topps).
      if (checklist) {
        const baseSet = new Set(checklist.items || []);
        let totalSpecials = 0;
        for (const special of (specialStickers || [])) {
          for (const it of (special.list || [])) {
            if (typeof it === 'number') { if (!baseSet.has(it)) totalSpecials++; }
            else totalSpecials++;
          }
        }
        checklist.totalWithSpecials = checklist.total + totalSpecials;
      }
      
      const result = {
        id: id,
        title: title,
        url: albumUrl,
        description: description,
        mainImage: mainImage,
        barcode: barcode,
        copyright: copyright,
        releaseDate: releaseDate,
        editor: editor,
        checklist: checklist,
        categories: categories,
        additionalImages: additionalImages,
        articles: articles,
        specialStickers: specialStickers.length > 0 ? specialStickers : null,
        source: 'paninimania'
      };
      
      // Apply translation if requested
      if (shouldTranslate && lang) {
        if (result.title) {
          const translated = await translateText(result.title, lang, { sourceLang: 'fr' });
          result.title = translated;
        }
        if (result.description) {
          const translated = await translateText(result.description, lang, { sourceLang: 'fr' });
          result.description = translated;
        }
      }
      
      logger.info(`[Paninimania] ✅ Album retrieved: ${result.title}`);
      return result;
      
    } catch (err) {
      lastError = err;
      logger.error(`[Paninimania] Error on attempt ${attempt}: ${err.message}`);
      if (attempt >= MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  
  throw lastError || new Error('Failed after all retries');
}

/**
 * Health check for Paninimania provider
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
    logger.error(`[Paninimania] Health check failed: ${error.message}`);
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
