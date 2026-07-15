/**
 * French Title Service
 * 
 * Service pour récupérer les titres français des mangas via Nautiljon.
 * Utilise du scraping léger sur les pages de résultats de recherche.
 * 
 * NAUTILJON est la référence française pour les mangas/animes avec:
 * - Titres officiels français
 * - Dates de sortie FR
 * - Éditeurs français
 * 
 * RATE LIMIT : 1 req/seconde (respectueux du site)
 */

import { createLogger } from '../../../shared/utils/logger.js';

const NAUTILJON_BASE_URL = 'https://www.nautiljon.com';
const SEARCH_URL = `${NAUTILJON_BASE_URL}/mangas/`;
const USER_AGENT = 'Mozilla/5.0 (compatible; Tako-API/1.0; +https://github.com/tako-api)';

// Cache en mémoire pour les titres (évite de re-scraper)
const titleCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures

const log = createLogger('FrenchTitleService');

/**
 * Recherche le titre français d'un manga sur Nautiljon
 * 
 * @param {string} title - Titre original (japonais ou anglais)
 * @param {Object} options - Options
 * @param {boolean} [options.useCache=true] - Utiliser le cache
 * @returns {Promise<Object|null>} Informations FR ou null si non trouvé
 */
export async function findFrenchTitle(title, options = {}) {
  const { useCache = true } = options;

  if (!title || typeof title !== 'string') {
    return null;
  }

  const normalizedTitle = normalizeTitle(title);
  const cacheKey = `fr:${normalizedTitle}`;

  // Vérifier le cache
  if (useCache && titleCache.has(cacheKey)) {
    const cached = titleCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      log.debug(`Cache hit pour "${title}"`);
      return cached.data;
    }
    titleCache.delete(cacheKey);
  }

  try {
    // Construire l'URL de recherche
    const searchUrl = `${SEARCH_URL}?q=${encodeURIComponent(title)}`;

    log.debug(`Recherche Nautiljon: ${searchUrl}`);

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      log.warn(`Nautiljon HTTP ${response.status} pour "${title}"`);
      return null;
    }

    const html = await response.text();
    const result = parseSearchResults(html, title);

    // Mettre en cache
    if (useCache) {
      titleCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
    }

    return result;
  } catch (error) {
    log.error(`Erreur Nautiljon pour "${title}":`, error.message);
    return null;
  }
}

/**
 * Parse les résultats de recherche Nautiljon
 * 
 * @param {string} html - HTML de la page de recherche
 * @param {string} originalTitle - Titre recherché pour comparaison
 * @returns {Object|null}
 */
function parseSearchResults(html, originalTitle) {
  // Regex pour extraire les infos du premier résultat manga
  // Structure Nautiljon: <a class="elt" href="/mangas/SLUG.html"><span class="title">TITRE</span>...
  
  const normalizedSearch = normalizeTitle(originalTitle);
  
  // Chercher les éléments de résultat
  // Pattern: titre dans un lien vers /mangas/
  const resultPattern = /<a[^>]*href="\/mangas\/([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>/gi;
  
  let match;
  let bestMatch = null;
  let bestScore = 0;

  while ((match = resultPattern.exec(html)) !== null) {
    const slug = match[1];
    const title = decodeHtmlEntities(match[2].trim());
    
    // Calculer le score de similarité
    const score = calculateSimilarity(normalizedSearch, normalizeTitle(title));
    
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = {
        titleFrench: title,
        slug: slug.replace('.html', ''),
        url: `${NAUTILJON_BASE_URL}/mangas/${slug}`,
        confidence: score
      };
    }
  }

  // Si pas de match avec le pattern principal, essayer un pattern simplifié
  if (!bestMatch) {
    // Chercher directement les titres de manga
    const simplePattern = /\/mangas\/([^"]+)\.html"[^>]*>([^<]+)</gi;
    
    while ((match = simplePattern.exec(html)) !== null) {
      const slug = match[1];
      const title = decodeHtmlEntities(match[2].trim());
      
      // Ignorer les éléments de navigation
      if (title.length < 3 || title.match(/^(page|suivant|précédent)$/i)) {
        continue;
      }
      
      const score = calculateSimilarity(normalizedSearch, normalizeTitle(title));
      
      if (score > bestScore && score > 0.4) {
        bestScore = score;
        bestMatch = {
          titleFrench: title,
          slug: slug,
          url: `${NAUTILJON_BASE_URL}/mangas/${slug}.html`,
          confidence: score
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Récupère les détails français d'un manga depuis sa page Nautiljon
 * 
 * @param {string} url - URL de la page manga Nautiljon
 * @returns {Promise<Object|null>}
 */
export async function getFrenchDetails(url) {
  if (!url || !url.includes('nautiljon.com')) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return parseDetailPage(html);
  } catch (error) {
    log.error(`Erreur détails Nautiljon:`, error.message);
    return null;
  }
}

/**
 * Parse la page de détails d'un manga Nautiljon
 */
function parseDetailPage(html) {
  const details = {
    titleFrench: null,
    titleOriginal: null,
    publisherFrench: null,
    releaseDateFrench: null,
    volumes: null,
    status: null
  };

  // Titre français (h1 ou titre principal)
  const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i);
  if (titleMatch) {
    details.titleFrench = decodeHtmlEntities(titleMatch[1].trim());
  }

  // Titre original
  const originalMatch = html.match(/Titre original\s*:\s*<[^>]+>([^<]+)<\/[^>]+>/i);
  if (originalMatch) {
    details.titleOriginal = decodeHtmlEntities(originalMatch[1].trim());
  }

  // Éditeur français
  const publisherMatch = html.match(/Éditeur\s*:\s*<[^>]+>([^<]+)<\/[^>]+>/i);
  if (publisherMatch) {
    details.publisherFrench = decodeHtmlEntities(publisherMatch[1].trim());
  }

  // Nombre de volumes
  const volumesMatch = html.match(/(\d+)\s*(?:tome|volume)/i);
  if (volumesMatch) {
    details.volumes = parseInt(volumesMatch[1]);
  }

  return details;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalise un titre pour la comparaison
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
    .replace(/[^a-z0-9\s]/g, '') // Garder que alphanumériques
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcule la similarité entre deux chaînes (0-1)
 * Utilise l'algorithme de distance de Levenshtein normalisé
 */
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  // Si l'un contient l'autre, haute similarité
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.9;
  }

  // Distance de Levenshtein
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  
  return 1 - (distance / maxLen);
}

/**
 * Décode les entités HTML
 */
function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));
}

/**
 * Vide le cache des titres
 */
export function clearCache() {
  titleCache.clear();
  log.info('Cache des titres français vidé');
}

/**
 * Statistiques du cache
 */
export function getCacheStats() {
  return {
    size: titleCache.size,
    entries: Array.from(titleCache.keys())
  };
}

export default {
  findFrenchTitle,
  getFrenchDetails,
  clearCache,
  getCacheStats
};
