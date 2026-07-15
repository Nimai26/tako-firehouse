/**
 * Paninimania Normalizer — Canonical Format B
 * 
 * Normalizes Paninimania data to canonical Format B.
 * Preserves ALL complex data: specialStickers, additionalImages, articles, checklist
 * 
 * @module domains/sticker-albums/normalizers/paninimania
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

/**
 * Extract a 4-digit year (integer) from a date string
 * Handles formats like "2024", "janvier 2024", "2024-03-15", etc.
 * @param {string|number|null} dateStr
 * @returns {number|null}
 */
function extractYearFromDate(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr === 'number') return dateStr;
  const match = String(dateStr).match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : null;
}

// ============================================================================
// ITEM NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalize a single Paninimania search item to canonical Format B
 * @param {object} item - Raw item from search results
 * @returns {object|null} Canonical Format B item
 */
export function normalizeSearchItem(item) {
  if (!item) return null;

  const sourceId = String(item.id || 'unknown');

  return {
    id: `paninimania:${sourceId}`,
    type: 'sticker_album',
    source: 'paninimania',
    sourceId,
    title: extractText(item.title) || '',
    titleOriginal: null,
    description: null,
    year: extractYearFromDate(item.year),
    images: {
      primary: item.image || null,
      thumbnail: item.thumbnail || item.image || null,
      gallery: [...new Set([item.image, item.thumbnail].filter(Boolean))]
    },
    urls: {
      source: item.url || null,
      detail: `/api/sticker-albums/paninimania/album/${sourceId}`
    },
    details: {}
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
      provider: 'paninimania',
      domain: 'sticker-albums',
      searchType: 'sticker_album',
      query: response?.query || '',
      total: 0,
      count: 0,
      data: [],
      pagination: { page: 1, limit: 0, hasMore: false },
      meta: {
        fetchedAt: new Date().toISOString(),
        formattedQuery: response?.formattedQuery || ''
      }
    };
  }

  const items = response.results.map(normalizeSearchItem).filter(Boolean);

  return {
    success: true,
    provider: 'paninimania',
    domain: 'sticker-albums',
    searchType: 'sticker_album',
    query: response.query || '',
    total: items.length,
    count: items.length,
    data: items,
    pagination: { page: 1, limit: items.length, hasMore: false },
    meta: {
      fetchedAt: new Date().toISOString(),
      formattedQuery: response.formattedQuery || ''
    }
  };
}

// ============================================================================
// DETAIL NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalize album details to canonical Format B
 * CRITICAL: Preserves ALL data including specialStickers, additionalImages, articles
 * @param {object} data - Raw album data from provider
 * @returns {object|null} Canonical Format B item
 */
export function normalizeDetails(data) {
  if (!data) {
    return null;
  }

  const sourceId = String(data.id || 'unknown');

  // Normalize checklist — preserve full structure
  let normalizedChecklist = null;
  if (data.checklist) {
    normalizedChecklist = {
      raw: data.checklist.raw,
      total: data.checklist.total,
      items: data.checklist.items,
      totalWithSpecials: data.checklist.totalWithSpecials || data.checklist.total
    };
  }

  // Normalize special stickers — CRITICAL: preserve ALL types
  let normalizedSpecialStickers = null;
  if (data.specialStickers && Array.isArray(data.specialStickers)) {
    normalizedSpecialStickers = data.specialStickers.map(special => ({
      name: special.name,
      raw: special.raw,
      total: special.total,
      list: special.list // Array of numbers, letters, or alphanumeric
    }));
  }

  // Normalize additional images — preserve captions
  let normalizedAdditionalImages = null;
  if (data.additionalImages && Array.isArray(data.additionalImages)) {
    normalizedAdditionalImages = data.additionalImages.map(img => ({
      url: img.url,
      caption: extractText(img.caption)
    }));
  }

  // Normalize categories
  let normalizedCategories = null;
  if (data.categories && Array.isArray(data.categories)) {
    normalizedCategories = data.categories.map(cat => extractText(cat));
  }

  // Normalize articles
  let normalizedArticles = null;
  if (data.articles && Array.isArray(data.articles)) {
    normalizedArticles = data.articles.map(art => extractText(art));
  }

  // Build images gallery from mainImage + additionalImages URLs
  const gallery = [];
  if (data.mainImage) gallery.push(data.mainImage);
  if (normalizedAdditionalImages) {
    for (const img of normalizedAdditionalImages) {
      if (img.url) gallery.push(img.url);
    }
  }

  return {
    id: `paninimania:${sourceId}`,
    type: 'sticker_album',
    source: 'paninimania',
    sourceId,
    title: extractText(data.title) || '',
    titleOriginal: null,
    description: extractText(data.description) || null,
    year: extractYearFromDate(data.releaseDate),
    images: {
      primary: data.mainImage || null,
      thumbnail: data.mainImage || null,
      gallery
    },
    urls: {
      source: data.url || null,
      detail: `/api/sticker-albums/paninimania/album/${sourceId}`
    },
    details: {
      barcode: data.barcode || null,
      copyright: data.copyright || null,
      releaseDate: data.releaseDate || null,
      editor: data.editor || null,
      categories: normalizedCategories,
      checklist: normalizedChecklist,
      specialStickers: normalizedSpecialStickers,
      additionalImages: normalizedAdditionalImages,
      articles: normalizedArticles
    }
  };
}
