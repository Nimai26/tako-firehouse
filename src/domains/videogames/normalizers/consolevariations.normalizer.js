/**
 * ConsoleVariations Normalizer
 * 
 * Normalise les données ConsoleVariations au format Tako_Api standard
 * 
 * @module domains/videogames/normalizers/consolevariations
 */

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Mapping des types de release vers noms normalisés
 */
const RELEASE_TYPE_MAP = {
  'retail': 'retail',
  'promotional': 'promotional',
  'promo': 'promotional',
  'bundle': 'bundle',
  'prototype': 'prototype',
  'dev kit': 'prototype',
  'development': 'prototype',
  'test': 'prototype',
  'special': 'other',
  'limited': 'other'
};

/**
 * Normalise un type de release
 * @param {string} type - Type original
 * @returns {string|null}
 */
function normalizeReleaseType(type) {
  if (!type) return null;
  const normalized = type.toLowerCase().trim();
  return RELEASE_TYPE_MAP[normalized] || 'other';
}

/**
 * Détermine le type d'item depuis le contexte
 * @param {string} type - Type de filtre utilisé
 * @returns {string}
 */
function normalizeItemType(type) {
  if (!type) return 'unknown';
  
  const normalized = type.toLowerCase();
  
  if (normalized === 'consoles' || normalized === 'console') return 'console';
  if (normalized === 'controllers' || normalized === 'controller') return 'controller';
  if (normalized === 'accessories' || normalized === 'accessory') return 'accessory';
  
  return 'unknown';
}

// ============================================================================
// NORMALIZERS
// ============================================================================

/**
 * Normalise un résultat de recherche ConsoleVariations
 * @param {Object} item - Item brut de recherche
 * @param {string} searchType - Type de recherche
 * @returns {Object}
 */
export function normalizeSearchResult(item, searchType = 'all') {
  const sourceId = item.slug || item.id || 'unknown';
  const image = item.thumbnail || item.image || null;

  return {
    id: `consolevariations:${sourceId}`,
    type: 'console_variation',
    source: 'consolevariations',
    sourceId,
    title: item.name || null,
    titleOriginal: item.name || null,
    description: null,
    year: null,
    images: {
      primary: image,
      thumbnail: image,
      gallery: [image].filter(Boolean)
    },
    urls: {
      source: item.url || null,
      detail: sourceId !== 'unknown'
        ? `/api/videogames/consolevariations/item/${encodeURIComponent(sourceId)}`
        : null
    },
    details: {
      itemType: normalizeItemType(searchType)
    }
  };
}

/**
 * Normalise les résultats de recherche ConsoleVariations
 * @param {Object} rawData - Données brutes du provider
 * @returns {Object}
 */
export function normalizeSearchResults(rawData) {
  if (!rawData || !rawData.results) {
    return { data: [], total: 0 };
  }
  
  const searchType = rawData.type || 'all';
  const data = rawData.results.map(item => normalizeSearchResult(item, searchType));
  
  return { data, total: data.length };
}

/**
 * Normalise les détails d'un item ConsoleVariations
 * @param {Object} rawData - Données brutes du provider
 * @returns {Object}
 */
export function normalizeDetails(rawData) {
  if (!rawData) return null;
  
  // Helper pour extraire le texte (gère à la fois string et objet { text, translated })
  const extractText = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value.text) return value.text;
    return null;
  };
  
  const sourceId = rawData.slug || rawData.id || 'unknown';

  // Images
  const rawImages = rawData.images || [];
  const mainImage = rawImages.find(img => img.isMain) || rawImages[0];
  const gallery = rawImages.map(img => img.url).filter(Boolean);
  
  // Platform
  const platform = rawData.platform ? {
    id: rawData.platform.slug,
    name: rawData.platform.name
  } : null;
  
  // Rarity
  const rarity = {
    score: rawData.rarity?.score || null,
    level: rawData.rarity?.level || 'unknown'
  };
  
  // Community stats
  const community = {
    wantCount: rawData.community?.wantCount || 0,
    ownCount: rawData.community?.ownCount || 0
  };
  
  return {
    id: `consolevariations:${sourceId}`,
    type: 'console_variation',
    source: 'consolevariations',
    sourceId,
    title: extractText(rawData.name),
    titleOriginal: extractText(rawData.nameOriginal) || extractText(rawData.name),
    description: null,
    year: rawData.releaseYear || null,
    images: {
      primary: mainImage?.url || null,
      thumbnail: mainImage?.thumbnail || mainImage?.url || null,
      gallery
    },
    urls: {
      source: rawData.url || null,
      detail: `/api/videogames/consolevariations/item/${encodeURIComponent(sourceId)}`
    },
    details: {
      brand: rawData.brand || null,
      platform,
      releaseCountry: rawData.releaseCountry || null,
      releaseYear: rawData.releaseYear || null,
      releaseType: normalizeReleaseType(rawData.releaseType),
      regionCode: rawData.regionCode || null,
      productionQuantity: rawData.amountProduced || null,
      isLimitedEdition: rawData.isLimitedEdition === true,
      isBundle: rawData.isBundle === true,
      color: rawData.color || null,
      barcode: rawData.barcode || null,
      rarity,
      community
    }
  };
}

/**
 * Normalise la liste de plateformes/marques
 * @param {Object} rawData - Données brutes du provider
 * @returns {Object}
 */
export function normalizePlatforms(rawData) {
  if (!rawData || !rawData.results) {
    return {
      data: [],
      total: 0,
      type: rawData?.type || 'platforms',
      brand: null
    };
  }
  
  const data = rawData.results.map(item => ({
    id: item.id || item.slug,
    slug: item.slug,
    name: item.name,
    url: item.url,
    brand: item.brand || rawData.brand || null
  }));
  
  return {
    data,
    total: data.length,
    type: rawData.type || 'platforms',
    brand: rawData.brand || null
  };
}

/**
 * Normalise le browse d'une plateforme
 * @param {Object} rawData - Données brutes du provider
 * @returns {Object}
 */
export function normalizeBrowse(rawData) {
  if (!rawData || !rawData.results) {
    return { data: [], total: 0 };
  }
  
  const data = rawData.results.map(item => normalizeSearchResult(item, 'all'));
  
  return { data, total: data.length };
}
