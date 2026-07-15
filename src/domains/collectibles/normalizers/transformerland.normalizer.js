/**
 * Transformerland Normalizer
 * 
 * Normalizes Transformerland data to canonical Format B.
 * 
 * @module domains/collectibles/normalizers/transformerland
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract text from translation object or string
 * @param {string|object} value - String or translation object {text, translated, from, to}
 * @returns {string|null} Extracted text
 */
function extractText(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.text) return value.text;
  return String(value);
}

// ============================================================================
// ITEM NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalize a single Transformerland search item to canonical Format B
 * @param {object} item - Raw item from search results
 * @returns {object|null} Canonical Format B item
 */
export function normalizeSearchItem(item) {
  if (!item) return null;

  const sourceId = String(item.id || 'unknown');

  return {
    id: `transformerland:${sourceId}`,
    type: 'collectible',
    source: 'transformerland',
    sourceId,
    title: extractText(item.name) || '',
    titleOriginal: null,
    description: null,
    year: item.year || null,
    images: {
      primary: item.image || null,
      thumbnail: item.image || null,
      gallery: item.image ? [item.image] : []
    },
    urls: {
      source: item.url || null,
      detail: `/api/collectibles/transformerland/item/${sourceId}`
    },
    details: {
      price: item.price || null,
      currency: item.currency || null,
      availability: item.availability || null,
      series: extractText(item.series) || null,
      subgroup: extractText(item.subgroup) || null,
      allegiance: extractText(item.allegiance) || null,
      condition: item.condition || null
    }
  };
}

// ============================================================================
// SEARCH NORMALIZATION — Canonical Search Response
// ============================================================================

/**
 * Normalize search results to canonical search wrapper
 * @param {object} response - Raw response from provider
 * @returns {object} Canonical search response
 */
export function normalizeSearchResults(response) {
  if (!response || !response.results) {
    return {
      success: true,
      provider: 'transformerland',
      domain: 'collectibles',
      query: response?.query || '',
      total: 0,
      count: 0,
      data: [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString() }
    };
  }

  const items = response.results.map(normalizeSearchItem).filter(Boolean);

  return {
    success: true,
    provider: 'transformerland',
    domain: 'collectibles',
    searchType: 'collectible',
    query: response.query || '',
    total: items.length,
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
 * Normalize item details to canonical Format B
 * @param {object} data - Raw item data from provider
 * @returns {object|null} Canonical Format B item
 */
export function normalizeDetails(data) {
  if (!data) {
    return null;
  }

  const sourceId = String(data.id || 'unknown');

  // Build gallery from images array or single
  const rawImages = data.images || [];
  const imageArray = Array.isArray(rawImages) ? rawImages : [rawImages];
  const gallery = imageArray.filter(Boolean);

  return {
    id: `transformerland:${sourceId}`,
    type: 'collectible',
    source: 'transformerland',
    sourceId,
    title: extractText(data.name) || '',
    titleOriginal: null,
    description: extractText(data.description) || null,
    year: data.year || null,
    images: {
      primary: gallery[0] || null,
      thumbnail: gallery[0] || null,
      gallery
    },
    urls: {
      source: data.url || null,
      detail: `/api/collectibles/transformerland/item/${sourceId}`
    },
    details: {
      price: data.price || null,
      currency: data.currency || null,
      availability: data.availability || null,
      condition: data.condition || null,
      series: extractText(data.series) || null,
      subgroup: extractText(data.subgroup) || null,
      faction: extractText(data.faction) || null,
      size: data.size || null,
      manufacturer: data.manufacturer || null,
      instructions: data.instructions && data.instructions.length > 0 ? data.instructions : null,
      specs: data.specs && data.specs.length > 0 ? data.specs : null,
      attributes: data.attributes || {}
    }
  };
}
