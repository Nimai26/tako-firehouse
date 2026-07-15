/**
 * Carddass Normalizer
 * 
 * Normalise les données carddass au format Tako_Api standard.
 * Les données proviennent de PostgreSQL (archivées depuis animecollection.fr).
 * 
 * @module domains/collectibles/normalizers/carddass
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalise la pagination au format {page, limit, hasMore}
 * @param {Object|null} pagination - Pagination brute du provider
 * @returns {Object|null}
 */
function normalizePagination(pagination) {
  if (!pagination) return null;
  return {
    page: pagination.page,
    limit: pagination.limit,
    hasMore: pagination.hasMore || false
  };
}

/**
 * Extrait le texte d'une valeur string ou objet de traduction
 * @param {string|Object} value
 * @returns {string|null}
 */
function extractText(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.text) return value.text;
  return String(value);
}

/**
 * Normalise les images d'une carte
 * @param {Object} images - { thumbnail, hd }
 * @returns {Object} Images normalisées
 */
function normalizeCardImages(images) {
  if (!images) {
    return { primary: null, thumbnail: null, gallery: [] };
  }

  const gallery = [];
  if (images.hd) gallery.push(images.hd);
  if (images.thumbnail && images.thumbnail !== images.hd) gallery.push(images.thumbnail);

  return {
    primary: images.hd || images.thumbnail || null,
    thumbnail: images.thumbnail || images.hd || null,
    gallery
  };
}

// ============================================================================
// SEARCH NORMALIZATION
// ============================================================================

/**
 * Normalise un résultat de recherche individuel
 * @param {Object} item - Item brut du provider
 * @returns {Object} Item normalisé
 */
export function normalizeSearchItem(item) {
  if (!item) return null;

  // Utiliser item.id (clé primaire DB) comme identifiant fiable
  // item.sourceId est l'ID du site original, qui peut entrer en collision avec les PK d'autres cartes
  const sourceId = String(item.id || 'unknown');

  return {
    id: `carddass:${sourceId}`,
    type: 'collectible',
    source: 'carddass',
    sourceId: sourceId,
    title: `${item.license || 'Carddass'} - ${item.series || 'Unknown'} #${item.cardNumber || '?'}`,
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: item.hd || item.thumbnail || null,
      thumbnail: item.thumbnail || null,
      gallery: [item.hd, item.thumbnail].filter(Boolean)
    },
    urls: {
      source: null,
      detail: `/api/collectibles/carddass/cards/${sourceId}`
    },
    details: {
      cardNumber: item.cardNumber || null,
      rarity: item.rarity || null,
      rarityColor: item.rarityColor || null,
      license: item.license || null,
      collection: item.collection || null,
      series: item.series || null
    }
  };
}

/**
 * Normalise les résultats de recherche
 * @param {Object} response - Réponse brute du provider
 * @returns {Object} Résultats normalisés
 */
export function normalizeSearchResults(response) {
  if (!response) {
    return {
      success: true,
      provider: 'carddass',
      domain: 'collectibles',
      query: '',
      total: 0,
      count: 0,
      data: [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString() }
    };
  }

  const items = (response.items || []).map(normalizeSearchItem).filter(Boolean);

  return {
    success: true,
    provider: 'carddass',
    domain: 'collectibles',
    query: response.query || '',
    total: response.total || 0,
    count: items.length,
    data: items,
    pagination: normalizePagination(response.pagination),
    meta: { fetchedAt: new Date().toISOString() }
  };
}

// ============================================================================
// DETAIL NORMALIZATION
// ============================================================================

/**
 * Normalise les détails complets d'une carte Carddass
 * @param {Object} data - Données brutes du provider
 * @returns {Object|null} Détails normalisés
 */
export function normalizeDetails(data) {
  if (!data) return null;

  // Utiliser data.id (clé primaire DB) comme identifiant fiable
  const sourceId = String(data.id || 'unknown');

  return {
    id: `carddass:${sourceId}`,
    type: 'collectible',
    source: 'carddass',
    sourceId: sourceId,
    title: buildCardName(data),
    titleOriginal: null,
    description: null,
    year: null,
    images: normalizeCardImages(data.images),
    urls: {
      source: null,
      detail: `/api/collectibles/carddass/cards/${sourceId}`
    },
    details: {
      cardNumber: data.cardNumber || null,
      rarity: data.rarity || null,
      rarityColor: data.rarityColor || null,
      license: data.license || null,
      collection: data.collection || null,
      series: data.series || null,
      hierarchy: data.hierarchy || null,
      extraImages: (data.extraImages || []).map(img => ({
        id: img.id,
        sourceId: img.sourceId,
        label: img.label || null,
        thumbnail: img.thumbnail || null,
        hd: img.hd || null
      })),
      packagings: (data.packagings || []).map(pack => ({
        id: pack.id,
        sourceId: pack.sourceId,
        label: pack.label || null,
        image: pack.image || null
      })),
      dataSource: 'database',
      originalSite: data.sourceSite === 'dbzcollection' ? 'dbzcollection.fr' : 'animecollection.fr'
    }
  };
}

// ============================================================================
// HIERARCHY NORMALIZATION
// ============================================================================

/**
 * Normalise une liste de licences
 * @param {Object} response - Réponse brute
 * @returns {Object}
 */
export function normalizeLicenses(response) {
  if (!response) {
    return { success: true, provider: 'carddass', domain: 'collectibles', query: null, total: 0, count: 0, data: [], pagination: null, meta: { fetchedAt: new Date().toISOString() } };
  }

  const items = (response.items || []).map(item => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceSite: item.sourceSite || null,
    name: item.name,
    description: item.description || null,
    image: item.image || null,
    banner: item.banner || null,
    collectionCount: item.collectionCount || undefined,
    cardCount: item.cardCount || undefined,
    url: item.url || null
  }));

  return {
    success: true,
    provider: 'carddass',
    domain: 'collectibles',
    query: null,
    total: response.total || 0,
    count: items.length,
    data: items,
    pagination: normalizePagination(response.pagination),
    meta: { fetchedAt: new Date().toISOString() }
  };
}

/**
 * Normalise une liste de collections
 * @param {Object} response - Réponse brute
 * @returns {Object}
 */
export function normalizeCollections(response) {
  if (!response) {
    return { success: true, provider: 'carddass', domain: 'collectibles', query: null, total: 0, count: 0, data: [], pagination: null, meta: { fetchedAt: new Date().toISOString() } };
  }

  const items = (response.items || []).map(item => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceSite: item.sourceSite || null,
    name: item.name,
    seriesCount: item.seriesCount || 0,
    cardCount: item.cardCount || 0,
    url: item.url || null
  }));

  return {
    success: true,
    provider: 'carddass',
    domain: 'collectibles',
    query: null,
    total: response.total || 0,
    count: items.length,
    data: items,
    pagination: normalizePagination(response.pagination),
    meta: { fetchedAt: new Date().toISOString(), license: response.license || null }
  };
}

/**
 * Normalise une liste de séries
 * @param {Object} response - Réponse brute
 * @returns {Object}
 */
export function normalizeSeries(response) {
  if (!response) {
    return { success: true, provider: 'carddass', domain: 'collectibles', query: null, total: 0, count: 0, data: [], pagination: null, meta: { fetchedAt: new Date().toISOString() } };
  }

  const items = (response.items || []).map(item => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceSite: item.sourceSite || null,
    name: item.name,
    description: item.description || null,
    capsule: item.capsule || null,
    cardCount: item.cardCount || 0,
    packagingCount: item.packagingCount || 0,
    url: item.url || null
  }));

  return {
    success: true,
    provider: 'carddass',
    domain: 'collectibles',
    query: null,
    total: response.total || 0,
    count: items.length,
    data: items,
    pagination: normalizePagination(response.pagination),
    meta: { fetchedAt: new Date().toISOString(), license: response.license || null, collection: response.collection || null }
  };
}

/**
 * Normalise une liste de cartes
 * @param {Object} response - Réponse brute
 * @returns {Object}
 */
export function normalizeCards(response) {
  if (!response) {
    return { success: true, provider: 'carddass', domain: 'collectibles', query: null, total: 0, count: 0, data: [], pagination: null, meta: { fetchedAt: new Date().toISOString() } };
  }

  const items = (response.items || []).map(item => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceSite: item.sourceSite || null,
    cardNumber: item.cardNumber,
    rarity: item.rarity || null,
    rarityColor: item.rarityColor || null,
    images: item.images || null,
    license: item.license || null,
    collection: item.collection || null,
    series: item.series || null
  }));

  return {
    success: true,
    provider: 'carddass',
    domain: 'collectibles',
    query: null,
    total: response.total || 0,
    count: items.length,
    data: items,
    pagination: normalizePagination(response.pagination),
    meta: { fetchedAt: new Date().toISOString(), license: response.license || null, collection: response.collection || null, series: response.series || null }
  };
}

// ============================================================================
// HELPERS INTERNES
// ============================================================================

/**
 * Construit un nom lisible pour une carte
 * @param {Object} data - Données de la carte
 * @returns {string}
 */
function buildCardName(data) {
  const parts = [];
  if (data.license) parts.push(data.license);
  if (data.series) parts.push(data.series);
  if (data.cardNumber) parts.push(`#${data.cardNumber}`);
  if (data.rarity && data.rarity !== 'Regular') parts.push(`(${data.rarity})`);
  return parts.join(' - ') || `Carddass Card #${data.sourceId || data.id}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  normalizeSearchItem,
  normalizeSearchResults,
  normalizeDetails,
  normalizeLicenses,
  normalizeCollections,
  normalizeSeries,
  normalizeCards
};
