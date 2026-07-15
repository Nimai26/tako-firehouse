/**
 * JeuxVideo.com (JVC) Normalizer — Format Canonique B
 *
 * Transforms raw JVC data into Tako_Api standard format.
 *
 * @module domains/videogames/normalizers/jvc
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalise une note JVC (échelle 0-20) vers 0-5 avec 1 décimale
 */
function normalizeRating(rating) {
  if (!rating) return null;
  return Math.round((rating / 20) * 5 * 10) / 10;
}

/**
 * Extrait l'année depuis une chaîne de date
 * Gère les formats courants : "2023-01-15", "15/01/2023", "January 2023", etc.
 */
function yearFromDateStr(dateStr) {
  if (!dateStr) return null;

  // Format ISO: YYYY-MM-DD
  if (/^\d{4}-/.test(dateStr)) {
    const y = parseInt(dateStr.split('-')[0], 10);
    return Number.isNaN(y) ? null : y;
  }

  // Tenter un Date.parse générique
  const ts = Date.parse(dateStr);
  if (!Number.isNaN(ts)) {
    return new Date(ts).getFullYear();
  }

  // Extraire 4 chiffres ressemblant à une année (1900-2099)
  const match = dateStr.match(/((?:19|20)\d{2})/);
  return match ? parseInt(match[1], 10) : null;
}

// ============================================================================
// ITEM NORMALIZERS
// ============================================================================

/**
 * Normalise un seul résultat de recherche JVC en item canonique
 * @param {Object} game - Un élément brut de résultat de recherche
 * @returns {Object} Item canonique Format B
 */
function normalizeSearchItem(game) {
  const sourceId = String(game.id);

  return {
    id: `jvc:${sourceId}`,
    type: 'videogame',
    source: 'jvc',
    sourceId,
    title: game.title || null,
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: game.coverUrl || null,
      thumbnail: game.coverUrl || null,
      gallery: []
    },
    urls: {
      source: game.url || null,
      detail: `/api/videogames/jvc/game/${sourceId}`
    },
    details: {
      platform: game.platform || null
    }
  };
}

/**
 * Normalise les résultats de recherche JVC (collection entière).
 *
 * IMPORTANT : La route jvc.routes.js appelle actuellement
 *   `jvcNormalizer.normalizeSearchResult(rawResults)`
 * Cette fonction conserve donc la même signature (accepte l'objet complet)
 * mais renvoie les items dans `data` (format canonique) ET dans `results`
 * (rétro-compatibilité avec la route existante, le temps de la migrer).
 *
 * @param {Object} rawData - Données brutes de recherche du provider
 * @returns {Object} Réponse canonique de recherche
 */
export function normalizeSearchResult(rawData) {
  if (!rawData || !rawData.results) {
    return {
      success: true,
      provider: 'jvc',
      domain: 'videogames',
      data: [],
      total: 0,
      count: 0,
      query: rawData?.query || null,
      pagination: null,
      meta: { fetchedAt: new Date().toISOString() }
    };
  }

  const items = rawData.results.map(game => normalizeSearchItem(game));

  return {
    success: true,
    provider: 'jvc',
    domain: 'videogames',
    data: items,
    total: rawData.total || items.length,
    count: items.length,
    query: rawData.query || null,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  };
}

/**
 * Normalise les détails d'un jeu JVC
 * @param {Object} rawGame - Données brutes du jeu
 * @returns {Object|null} Item canonique Format B
 */
export function normalizeGame(rawGame) {
  if (!rawGame) return null;

  const sourceId = String(rawGame.id);

  return {
    id: `jvc:${sourceId}`,
    type: 'videogame',
    source: 'jvc',
    sourceId,
    title: rawGame.title || null,
    titleOriginal: null,
    description: rawGame.description || null,
    year: yearFromDateStr(rawGame.releaseDate),
    images: {
      primary: rawGame.cover || null,
      thumbnail: rawGame.cover || null,
      gallery: []
    },
    urls: {
      source: rawGame.url || null,
      detail: `/api/videogames/jvc/game/${sourceId}`
    },
    details: {
      // Release
      releaseDate: rawGame.releaseDate || null,

      // Platforms
      platforms: rawGame.platforms || [],

      // Genres (noms FR d'origine, traduction gérée par la couche routes)
      genres: rawGame.genres || [],

      // Companies
      developers: rawGame.developer ? [rawGame.developer] : [],
      publishers: rawGame.publisher ? [rawGame.publisher] : [],

      // Age rating
      pegi: rawGame.pegi || null,
      minAge: rawGame.minAge || null,

      // Multiplayer info
      players: rawGame.nbPlayers || null,
      isMultiplayer: rawGame.isMultiplayer || false,

      // Media formats
      media: rawGame.media || [],

      // Ratings (normalized to 0-5 scale)
      rating: {
        critics: normalizeRating(rawGame.ratings?.test),
        users: normalizeRating(rawGame.ratings?.users)
      },

      // Links
      reviewUrl: rawGame.testUrl || null,

      // Langue native
      language: 'fr'
    }
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  normalizeSearchResult,
  normalizeGame
};
