/**
 * @fileoverview Normalizer Lulu-Berlu - Canonical Format B
 * @module domains/collectibles/normalizers/luluberlu
 * 
 * Transforme les données brutes de Lulu-Berlu au format canonical Format B
 */

import { logger } from '../../../shared/utils/logger.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrait le texte d'un champ qui peut être string ou objet de traduction
 * @param {string|Object} value - Valeur brute ou traduite
 * @returns {string|null} Texte extrait
 */
function extractText(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.text) return value.text;
  return String(value);
}

/**
 * Normalise la disponibilité
 * @param {string} availability - Statut brut
 * @returns {string} Statut normalisé
 */
function normalizeAvailability(availability) {
  if (!availability) return 'unknown';
  
  const status = String(availability).toLowerCase();
  
  if (status.includes('in_stock') || status.includes('instock')) return 'in_stock';
  if (status.includes('preorder') || status.includes('précommande')) return 'preorder';
  if (status.includes('out_of_stock') || status.includes('épuisé')) return 'out_of_stock';
  
  return 'unknown';
}

/**
 * Normalise la condition d'un item
 * @param {string} condition - Condition brute
 * @returns {string} Condition normalisée
 */
function normalizeCondition(condition) {
  if (!condition) return 'unknown';
  
  const cond = String(condition).toLowerCase();
  
  if (cond.includes('neuf') || cond.includes('new') || cond.includes('mint')) return 'new';
  if (cond.includes('bon état') || cond.includes('good')) return 'good';
  if (cond.includes('moyen') || cond.includes('fair')) return 'fair';
  if (cond.includes('mauvais') || cond.includes('poor')) return 'poor';
  if (cond.includes('occasion') || cond.includes('used')) return 'used';
  
  return 'unknown';
}

/**
 * Normalise les images (array ou string unique) vers format canonical
 * @param {string|Array<string>} images - Image(s) brute(s)
 * @returns {Object} Images normalisées { primary, thumbnail, gallery }
 */
function normalizeImages(images) {
  if (!images) {
    return {
      primary: null,
      thumbnail: null,
      gallery: []
    };
  }

  const imageArray = Array.isArray(images) ? images : [images];
  const validImages = imageArray.filter(img => img && typeof img === 'string');

  return {
    primary: validImages[0] || null,
    thumbnail: validImages[0] || null,
    gallery: validImages
  };
}

// ============================================================================
// ITEM NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalise un item de résultat de recherche Lulu-Berlu en Format B canonical
 * 
 * @param {Object} item - Item brut du provider
 * @returns {Object|null} Item normalisé Format B
 */
export function normalizeSearchItem(item) {
  if (!item) return null;

  // Utiliser le slug de l'URL comme sourceId (pas l'ID numérique)
  // Ex: "https://www.lulu-berlu.com/goldorak-a3155.html" → "goldorak-a3155.html"
  // Ainsi sourceId fonctionne directement avec /item/:path
  let sourceId = String(item.id || 'unknown');
  if (item.url) {
    try {
      const urlObj = new URL(item.url);
      const slug = urlObj.pathname.replace(/^\//, '');
      if (slug) sourceId = slug;
    } catch {
      // Fallback sur l'ID numérique
    }
  }

  return {
    id: `luluberlu:${sourceId}`,
    type: 'collectible',
    source: 'luluberlu',
    sourceId,
    title: extractText(item.name) || '',
    titleOriginal: null,
    description: null,
    year: null,
    images: normalizeImages(item.image),
    urls: {
      source: item.url || null,
      detail: `/api/collectibles/luluberlu/item/${sourceId}`
    },
    details: {
      brand: extractText(item.brand) || null,
      condition: 'unknown',
      availability: normalizeAvailability(item.availability),
      pricing: item.price ? {
        price: item.price,
        currency: 'EUR'
      } : null
    }
  };
}

// ============================================================================
// SEARCH NORMALIZATION — Canonical Search Response
// ============================================================================

/**
 * Normalise les résultats de recherche Lulu-Berlu en wrapper canonical
 * 
 * @param {Object} response - Réponse brute du provider
 * @returns {Object} Wrapper canonical
 */
export function normalizeSearchResults(response) {
  if (!response) {
    return {
      success: true,
      provider: 'luluberlu',
      domain: 'collectibles',
      query: '',
      total: 0,
      count: 0,
      data: [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString() }
    };
  }

  const products = response.products || [];
  const items = products.map(normalizeSearchItem).filter(Boolean);
  
  return {
    success: true,
    provider: 'luluberlu',
    domain: 'collectibles',
    searchType: 'collectible',
    query: response.query || '',
    total: response.total || items.length,
    count: items.length,
    data: items,
    pagination: {
      currentPage: 1,
      totalPages: 1,
      hasNext: false
    },
    meta: { fetchedAt: new Date().toISOString() }
  };
}

// ============================================================================
// DETAIL NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalise les détails complets d'un item Lulu-Berlu en Format B canonical
 * 
 * @param {Object} data - Données brutes du provider
 * @returns {Object|null} Détails normalisés Format B
 */
export function normalizeDetails(data) {
  if (!data) return null;

  // Utiliser le slug de l'URL comme sourceId (cohérent avec la recherche)
  let sourceId = String(data.id || 'unknown');
  if (data.url) {
    try {
      const urlObj = new URL(data.url);
      const slug = urlObj.pathname.replace(/^\//, '');
      if (slug) sourceId = slug;
    } catch {
      // Fallback sur l'ID numérique
    }
  }
  const attrs = data.attributes || {};

  // Extraire l'année depuis les attributs si disponible
  const year = attrs.year ? parseInt(attrs.year, 10) : null;

  // Mapper la condition depuis les attributs
  const conditionFromAttrs = attrs.condition 
    ? normalizeCondition(attrs.condition) 
    : 'unknown';

  // Gérer les traductions (name peut être string ou objet {text, translated})
  const name = extractText(data.name);
  const nameOriginal = typeof data.name === 'object' && data.name.original 
    ? data.name.original 
    : (data.lang === 'fr' ? name : null);
  const nameTranslated = typeof data.name === 'object' && data.name.translated 
    ? data.name.translated 
    : (data.lang !== 'fr' ? name : null);

  const description = extractText(data.description);
  const descriptionOriginal = typeof data.description === 'object' && data.description.original
    ? data.description.original
    : (data.lang === 'fr' ? description : null);
  const descriptionTranslated = typeof data.description === 'object' && data.description.translated
    ? data.description.translated
    : (data.lang !== 'fr' ? description : null);

  return {
    id: `luluberlu:${sourceId}`,
    type: 'collectible',
    source: 'luluberlu',
    sourceId,
    title: name || '',
    titleOriginal: nameOriginal,
    description: description || null,
    year: year,
    images: normalizeImages(data.images),
    urls: {
      source: data.url || null,
      detail: `/api/collectibles/luluberlu/item/${sourceId}`
    },
    details: {
      nameTranslated: nameTranslated,
      descriptionOriginal: descriptionOriginal,
      descriptionTranslated: descriptionTranslated,
      brand: extractText(data.brand) || null,
      manufacturer: extractText(data.brand) || null,
      series: null,
      subseries: null,
      category: attrs.type || null,
      reference: data.reference || null,
      condition: conditionFromAttrs,
      availability: normalizeAvailability(data.availability),
      pricing: data.price ? {
        price: data.price,
        currency: 'EUR'
      } : null,
      attributes: {
        type: attrs.type || null,
        material: attrs.material || null,
        size: attrs.size || null,
        origin: attrs.origin || null,
        condition_details: attrs.condition || null
      }
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  normalizeSearchItem,
  normalizeSearchResults,
  normalizeDetails
};
