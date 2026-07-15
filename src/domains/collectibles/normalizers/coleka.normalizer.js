/**
 * Coleka Normalizer
 * 
 * Normalizes Coleka data to canonical Format B.
 * 
 * @module domains/collectibles/normalizers/coleka
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrait le texte d'une valeur qui peut être une chaîne ou un objet de traduction
 * @param {string|Object} value - Valeur à extraire
 * @returns {string|null}
 */
const extractText = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.text) return value.text;
  return null;
};

/**
 * Parse une année depuis différents formats
 * @param {string|number} value - Valeur à parser
 * @returns {number|null}
 */
const parseYear = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const match = String(value).match(/\d{4}/);
  return match ? parseInt(match[0]) : null;
};

// ============================================================================
// ITEM NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalise un résultat de recherche individuel en Format B canonical
 * @param {Object} item - Item brut
 * @returns {Object|null} - Item normalisé Format B
 */
export function normalizeSearchItem(item) {
  if (!item) return null;

  const sourceId = String(item.id || item.path?.split('/').pop() || 'unknown');
  
  return {
    id: `coleka:${sourceId}`,
    type: 'collectible',
    source: 'coleka',
    sourceId,
    title: extractText(item.name_translated) || extractText(item.name) || '',
    titleOriginal: extractText(item.name) || null,
    description: null,
    year: null,
    images: {
      primary: item.image || null,
      thumbnail: item.image || null,
      gallery: item.image ? [item.image] : []
    },
    urls: {
      source: item.url || null,
      detail: `/api/collectibles/coleka/item/${sourceId}`
    },
    details: {
      nameTranslated: extractText(item.name_translated) || null,
      category: item.category || null,
      collection: item.collection || null
    }
  };
}

// Backward compatibility alias
export { normalizeSearchItem as normalizeSearchResult };

// ============================================================================
// SEARCH NORMALIZATION — Canonical Search Response
// ============================================================================

/**
 * Normalise une réponse de recherche Coleka en wrapper canonical
 * @param {Object} rawData - Données brutes de la recherche
 * @returns {Object} - Wrapper canonical
 */
export function normalizeSearchResults(rawData) {
  if (!rawData) {
    return {
      success: true,
      provider: 'coleka',
      domain: 'collectibles',
      query: '',
      total: 0,
      count: 0,
      data: [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString() }
    };
  }
  
  const items = (rawData.products || []).map(normalizeSearchItem).filter(Boolean);
  
  return {
    success: true,
    provider: 'coleka',
    domain: 'collectibles',
    searchType: 'collectible',
    query: rawData.query || '',
    total: rawData.total || items.length,
    count: items.length,
    data: items,
    pagination: {
      currentPage: 1,
      totalPages: 1,
      hasNext: false
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      category: rawData.category || null
    }
  };
}

// ============================================================================
// DETAIL NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalise les détails d'un item Coleka en Format B canonical
 * @param {Object} rawData - Données brutes de l'item
 * @returns {Object|null} - Détails normalisés Format B
 */
export function normalizeDetails(rawData) {
  if (!rawData) return null;
  
  const sourceId = String(rawData.id || rawData.url?.split('/').pop() || 'unknown');
  
  // Extraire le nombre de pièces depuis les attributs
  let piecesCount = null;
  if (rawData.attributes?.pièces) {
    piecesCount = parseInt(rawData.attributes.pièces, 10) || null;
  } else if (rawData.attributes?.pieces) {
    piecesCount = parseInt(rawData.attributes.pieces, 10) || null;
  }
  
  // Construire le tableau d'images avec déduplication
  const allImages = rawData.images || [];
  const primaryImage = allImages.length > 0 ? allImages[0] : null;
  
  return {
    id: `coleka:${sourceId}`,
    type: 'collectible',
    source: 'coleka',
    sourceId,
    title: extractText(rawData.name) || '',
    titleOriginal: extractText(rawData.name_original) || null,
    description: extractText(rawData.description) || null,
    year: parseYear(rawData.year),
    images: {
      primary: primaryImage,
      thumbnail: primaryImage,
      gallery: allImages
    },
    urls: {
      source: rawData.url || null,
      detail: `/api/collectibles/coleka/item/${sourceId}`
    },
    details: {
      nameTranslated: extractText(rawData.name_translated) || null,
      descriptionOriginal: extractText(rawData.description_original) || null,
      descriptionTranslated: extractText(rawData.description_translated) || null,
      brand: rawData.brand || (rawData.brands && rawData.brands[0]) || null,
      brands: rawData.brands || [],
      manufacturer: rawData.brand || null,
      series: rawData.series || null,
      subseries: rawData.collection || null,
      category: rawData.category || null,
      collectionHierarchy: rawData.collectionHierarchy || null,
      reference: rawData.reference || null,
      barcode: rawData.barcode || null,
      condition: 'unknown',
      availability: 'unknown',
      pricing: null,
      attributes: {
        pieces_count: piecesCount,
        ...rawData.attributes
      }
    }
  };
}

// ============================================================================
// CATEGORIES
// ============================================================================

/**
 * Normalise la liste des catégories
 * @param {Object} rawData - Données brutes des catégories
 * @returns {Object} - Catégories normalisées
 */
export function normalizeCategories(rawData) {
  if (!rawData || !rawData.categories) {
    return {
      success: true,
      provider: 'coleka',
      domain: 'collectibles',
      query: null,
      total: 0,
      count: 0,
      data: [],
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }
  
  return {
    success: true,
    provider: 'coleka',
    domain: 'collectibles',
    query: null,
    total: rawData.categories.length,
    count: rawData.categories.length,
    data: rawData.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || null
    })),
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang: rawData.lang || 'fr'
    }
  };
}
