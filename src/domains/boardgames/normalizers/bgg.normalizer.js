/**
 * BGG Normalizer
 * 
 * Normalizes BoardGameGeek API responses to canonical Format B.
 * 
 * @module normalizers/bgg
 */

// ============================================================================
// LANGUAGE PATTERNS
// ============================================================================

/**
 * Patterns de noms français courants dans BGG
 */
const FRENCH_NAME_PATTERNS = [
  /^Les .+/i,           // "Les Colons de Catane"
  /^Le .+/i,            // "Le Trône de Fer"
  /^La .+/i,            // "La Vallée des Vikings"
  /^L'.+/i,             // "L'Âge de Pierre"
  /^Un.+ /i,            // "Une Aventure..."
  /^Des .+/i,           // "Des Chiffres et des Lettres"
  /: Le Jeu$/i,         // "Monopoly: Le Jeu"
  /\(Version Française\)/i
];

const GERMAN_NAME_PATTERNS = [
  /^Die .+/i,           // "Die Siedler von Catan"
  /^Der .+/i,           // "Der Herr der Ringe"
  /^Das .+/i,           // "Das Spiel"
  /^Ein.+ /i,           // "Eine Reise..."
  /: Das Spiel$/i
];

const SPANISH_NAME_PATTERNS = [
  /^Los .+/i,           // "Los Colonos de Catán"
  /^Las .+/i,
  /^El .+/i,
  /^La .+/i,
  /: El Juego$/i
];

const ITALIAN_NAME_PATTERNS = [
  /^I Coloni/i,         // "I Coloni di Catan"
  /^Il .+/i,
  /^La .+/i,
  /^Gli .+/i,
  /: Il Gioco$/i
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Find localized game name in alternate names
 * @param {string[]} alternateNames - Array of alternate game names
 * @param {string} targetLang - Target language (fr, de, es, it)
 * @returns {string|null} Localized name or null
 */
export function findLocalizedName(alternateNames, targetLang = 'fr') {
  if (!alternateNames || alternateNames.length === 0) return null;
  
  let patterns;
  switch (targetLang) {
    case 'fr':
      patterns = FRENCH_NAME_PATTERNS;
      break;
    case 'de':
      patterns = GERMAN_NAME_PATTERNS;
      break;
    case 'es':
      patterns = SPANISH_NAME_PATTERNS;
      break;
    case 'it':
      patterns = ITALIAN_NAME_PATTERNS;
      break;
    default:
      return null;
  }
  
  // Cherche le premier nom qui correspond aux patterns de la langue
  for (const name of alternateNames) {
    for (const pattern of patterns) {
      if (pattern.test(name)) {
        return name;
      }
    }
  }
  
  return null;
}

// ============================================================================
// ITEM NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalize a single BGG search item to canonical Format B
 * @param {object} game - Raw game item from search results
 * @returns {object|null} Canonical Format B item
 */
export function normalizeSearchItem(game) {
  if (!game) return null;
  
  const sourceId = String(game.id || 'unknown');
  
  return {
    id: `bgg:${sourceId}`,
    type: game.type || 'boardgame',
    source: 'bgg',
    sourceId,
    title: game.name || '',
    titleOriginal: null,
    description: null,
    year: game.year || null,
    images: {
      primary: game.image || null,
      thumbnail: game.thumbnail || null,
      gallery: game.image ? [game.image] : []
    },
    urls: {
      source: game.url || null,
      detail: `/api/boardgames/bgg/game/${sourceId}`
    },
    details: {}
  };
}

// ============================================================================
// SEARCH NORMALIZATION — Canonical Search Response
// ============================================================================

/**
 * Normalize BGG search results to canonical search wrapper
 * @param {object} rawData - Raw BGG search data
 * @returns {object} Canonical search response
 */
export function normalizeSearchResults(rawData) {
  if (!rawData || !rawData.results) {
    return {
      success: true,
      provider: 'bgg',
      domain: 'boardgames',
      query: '',
      total: 0,
      count: 0,
      data: [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), lang: null, cached: false, cacheAge: null }
    };
  }
  
  const items = rawData.results.map(normalizeSearchItem).filter(Boolean);
  
  return {
    success: true,
    provider: 'bgg',
    domain: 'boardgames',
    query: rawData.query || '',
    total: rawData.total || items.length,
    count: items.length,
    data: items,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString(), lang: null, cached: false, cacheAge: null }
  };
}

// Backward compatibility alias
export { normalizeSearchResults as normalizeSearchResult };

// ============================================================================
// DETAIL NORMALIZATION — Canonical Format B
// ============================================================================

/**
 * Normalize BGG game details to canonical Format B
 * @param {object} rawGame - Raw BGG game data
 * @returns {object|null} Canonical Format B item
 */
export function normalizeDetails(rawGame) {
  if (!rawGame) {
    return null;
  }
  
  const sourceId = String(rawGame.id || 'unknown');
  
  // Build deduplicated gallery
  const gallery = [...new Set(
    [rawGame.image, rawGame.thumbnail].filter(Boolean)
  )];
  
  return {
    id: `bgg:${sourceId}`,
    type: rawGame.type || 'boardgame',
    source: 'bgg',
    sourceId,
    title: rawGame.name || '',
    titleOriginal: null,
    description: rawGame.description || null,
    year: rawGame.year || null,
    images: {
      primary: rawGame.image || null,
      thumbnail: rawGame.thumbnail || null,
      gallery
    },
    urls: {
      source: rawGame.url || null,
      detail: `/api/boardgames/bgg/game/${sourceId}`
    },
    details: {
      alternateNames: rawGame.alternateNames || [],
      players: {
        min: rawGame.players?.min ?? null,
        max: rawGame.players?.max ?? null
      },
      playTime: {
        min: rawGame.playTime?.min ?? null,
        max: rawGame.playTime?.max ?? null,
        average: rawGame.playTime?.average ?? null
      },
      minAge: rawGame.minAge ?? null,
      stats: {
        rating: rawGame.stats?.rating ?? null,
        numRatings: rawGame.stats?.numRatings ?? null,
        rank: rawGame.stats?.rank ?? null,
        complexity: rawGame.stats?.complexity ?? null
      },
      categories: rawGame.categories || [],
      mechanics: rawGame.mechanics || [],
      designers: rawGame.designers || [],
      artists: rawGame.artists || [],
      publishers: rawGame.publishers || [],
      files: rawGame.files && rawGame.files.length > 0 ? rawGame.files : null
    }
  };
}

// Backward compatibility alias
export { normalizeDetails as normalizeGame };
