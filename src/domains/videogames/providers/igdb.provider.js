/**
 * Provider IGDB (Twitch API)
 * 
 * API IGDB pour recherche et détails de jeux vidéo
 * Nécessite une authentification OAuth2 via Twitch
 * 
 * @module domains/videogames/providers/igdb
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('IGDBProvider');

const BASE_URL = 'https://api.igdb.com/v4';
const AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const IMAGE_URL = 'https://images.igdb.com/igdb/image/upload';

// Cache du token OAuth2
const tokenCache = {
  token: null,
  expiresAt: 0
};

/**
 * Récupère les credentials depuis l'environnement
 */
function getCredentials() {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('IGDB_CLIENT_ID et IGDB_CLIENT_SECRET sont requis');
  }
  
  return { clientId, clientSecret };
}

/**
 * Obtient un token OAuth2 valide
 */
async function getAccessToken() {
  // Vérifier le cache
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  
  const { clientId, clientSecret } = getCredentials();
  
  log.debug('Obtention d\'un nouveau token OAuth2...');
  
  const url = `${AUTH_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Accept': 'application/json' }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur OAuth2 IGDB ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  // Stocker en cache (avec marge de 1h)
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = Date.now() + ((data.expires_in - 3600) * 1000);
  
  log.debug(`Token obtenu, expire dans ${Math.floor(data.expires_in / 3600)}h`);
  return data.access_token;
}

/**
 * Effectue une requête à l'API IGDB
 */
async function igdbRequest(endpoint, body) {
  const { clientId } = getCredentials();
  const token = await getAccessToken();
  
  log.debug(`IGDB Request: ${endpoint}`);
  
  const response = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain'
    },
    body
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur IGDB API ${response.status}: ${errorText}`);
  }
  
  return response.json();
}

/**
 * Construit l'URL d'une image IGDB
 */
export function getImageUrl(imageId, size = 'cover_big') {
  if (!imageId) return null;
  // Sizes: cover_small, cover_big, screenshot_med, screenshot_big, screenshot_huge, thumb, micro, 720p, 1080p
  return `${IMAGE_URL}/t_${size}/${imageId}.jpg`;
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche de jeux
 */
export async function search(query, options = {}) {
  const { limit = 20, offset = 0, platforms, genres, themes } = options;
  
  let body = `search "${query}";`;
  body += `fields id,name,slug,summary,rating,aggregated_rating,total_rating,total_rating_count,first_release_date,`;
  body += `cover.image_id,genres.id,genres.name,genres.slug,platforms.id,platforms.name,platforms.abbreviation,`;
  body += `involved_companies.company.id,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,`;
  body += `themes.id,themes.name,game_modes.id,game_modes.name,player_perspectives.id,player_perspectives.name,`;
  body += `screenshots.image_id,videos.video_id,age_ratings.category,age_ratings.rating;`;
  body += `limit ${Math.min(limit, 50)};`;
  body += `offset ${offset};`;
  
  // Filtres optionnels
  const filters = [];
  if (platforms) filters.push(`platforms = (${platforms})`);
  if (genres) filters.push(`genres = (${genres})`);
  if (themes) filters.push(`themes = (${themes})`);
  if (filters.length > 0) body += `where ${filters.join(' & ')};`;
  
  return igdbRequest('games', body);
}

/**
 * Recherche avancée avec filtres multiples
 */
export async function advancedSearch(options = {}) {
  const {
    query,
    limit = 20,
    offset = 0,
    platforms,
    genres,
    themes,
    gameModes,
    playerPerspectives,
    minRating,
    maxRating,
    releaseYear,
    releaseDateRange,
    sortBy = 'total_rating',
    sortOrder = 'desc'
  } = options;
  
  let body = '';
  if (query) {
    body += `search "${query}";`;
  }
  
  body += `fields id,name,slug,summary,rating,aggregated_rating,total_rating,total_rating_count,first_release_date,`;
  body += `cover.image_id,genres.id,genres.name,genres.slug,platforms.id,platforms.name,platforms.abbreviation,`;
  body += `involved_companies.company.id,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,`;
  body += `themes.id,themes.name,game_modes.id,game_modes.name,player_perspectives.id,player_perspectives.name,`;
  body += `franchises.id,franchises.name,collection.id,collection.name,`;
  body += `screenshots.image_id,videos.video_id,age_ratings.category,age_ratings.rating;`;
  body += `limit ${Math.min(limit, 50)};`;
  body += `offset ${offset};`;
  
  // Filtres
  const filters = [];
  if (platforms) filters.push(`platforms = (${platforms})`);
  if (genres) filters.push(`genres = (${genres})`);
  if (themes) filters.push(`themes = (${themes})`);
  if (gameModes) filters.push(`game_modes = (${gameModes})`);
  if (playerPerspectives) filters.push(`player_perspectives = (${playerPerspectives})`);
  if (minRating) filters.push(`total_rating >= ${minRating}`);
  if (maxRating) filters.push(`total_rating <= ${maxRating}`);
  if (releaseYear) {
    const startTs = Math.floor(new Date(`${releaseYear}-01-01`).getTime() / 1000);
    const endTs = Math.floor(new Date(`${releaseYear}-12-31`).getTime() / 1000);
    filters.push(`first_release_date >= ${startTs} & first_release_date <= ${endTs}`);
  }
  if (releaseDateRange) {
    const [start, end] = releaseDateRange.split(',');
    if (start) filters.push(`first_release_date >= ${Math.floor(new Date(start).getTime() / 1000)}`);
    if (end) filters.push(`first_release_date <= ${Math.floor(new Date(end).getTime() / 1000)}`);
  }
  
  if (filters.length > 0) body += `where ${filters.join(' & ')};`;
  
  // Tri (seulement si pas de recherche textuelle)
  if (!query && sortBy) {
    body += `sort ${sortBy} ${sortOrder};`;
  }
  
  return igdbRequest('games', body);
}

// ============================================================================
// DÉTAILS
// ============================================================================

/**
 * Détails d'un jeu par ID
 */
export async function getGame(id) {
  const body = `
    fields id,name,slug,summary,storyline,rating,aggregated_rating,total_rating,total_rating_count,
    first_release_date,created_at,updated_at,status,category,
    cover.image_id,cover.width,cover.height,
    artworks.image_id,artworks.width,artworks.height,
    screenshots.image_id,screenshots.width,screenshots.height,
    videos.video_id,videos.name,
    genres.id,genres.name,genres.slug,
    themes.id,themes.name,themes.slug,
    platforms.id,platforms.name,platforms.abbreviation,platforms.platform_logo.image_id,
    game_modes.id,game_modes.name,
    player_perspectives.id,player_perspectives.name,
    involved_companies.company.id,involved_companies.company.name,involved_companies.company.logo.image_id,
    involved_companies.developer,involved_companies.publisher,involved_companies.porting,involved_companies.supporting,
    franchises.id,franchises.name,
    franchise.id,franchise.name,
    collection.id,collection.name,collection.games.id,collection.games.name,collection.games.cover.image_id,
    age_ratings.category,age_ratings.rating,age_ratings.content_descriptions.description,
    websites.category,websites.url,
    similar_games.id,similar_games.name,similar_games.cover.image_id,similar_games.total_rating,
    dlcs.id,dlcs.name,dlcs.cover.image_id,
    expansions.id,expansions.name,expansions.cover.image_id,
    parent_game.id,parent_game.name,parent_game.cover.image_id,
    remakes.id,remakes.name,remakes.cover.image_id,
    remasters.id,remasters.name,remasters.cover.image_id,
    keywords.id,keywords.name,
    language_supports.language.name,language_supports.language.native_name,language_supports.language_support_type.name;
    where id = ${id};
  `;
  
  const results = await igdbRequest('games', body);
  if (!results || results.length === 0) {
    throw new Error(`Jeu ${id} non trouvé`);
  }
  return results[0];
}

/**
 * Détails d'un jeu par slug
 */
export async function getGameBySlug(slug) {
  const body = `
    fields id,name,slug,summary,storyline,rating,aggregated_rating,total_rating,total_rating_count,
    first_release_date,created_at,updated_at,status,category,
    cover.image_id,artworks.image_id,screenshots.image_id,videos.video_id,videos.name,
    genres.id,genres.name,genres.slug,themes.id,themes.name,
    platforms.id,platforms.name,platforms.abbreviation,
    game_modes.id,game_modes.name,player_perspectives.id,player_perspectives.name,
    involved_companies.company.id,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,
    franchises.id,franchises.name,collection.id,collection.name,
    age_ratings.category,age_ratings.rating,
    websites.category,websites.url,similar_games.id,similar_games.name,similar_games.cover.image_id;
    where slug = "${slug}";
  `;
  
  const results = await igdbRequest('games', body);
  if (!results || results.length === 0) {
    throw new Error(`Jeu "${slug}" non trouvé`);
  }
  return results[0];
}

// ============================================================================
// MÉTADONNÉES (Genres, Plateformes, etc.)
// ============================================================================

/**
 * Liste tous les genres
 */
export async function getGenres() {
  const body = `fields id,name,slug; limit 100; sort name asc;`;
  return igdbRequest('genres', body);
}

/**
 * Liste toutes les plateformes
 */
export async function getPlatforms(options = {}) {
  const { limit = 100, category } = options;
  let body = `fields id,name,slug,abbreviation,alternative_name,category,generation,platform_logo.image_id; limit ${limit}; sort name asc;`;
  if (category) body += ` where category = ${category};`;
  return igdbRequest('platforms', body);
}

/**
 * Liste tous les thèmes
 */
export async function getThemes() {
  const body = `fields id,name,slug; limit 100; sort name asc;`;
  return igdbRequest('themes', body);
}

/**
 * Liste des modes de jeu
 */
export async function getGameModes() {
  const body = `fields id,name,slug; limit 50; sort name asc;`;
  return igdbRequest('game_modes', body);
}

/**
 * Liste des perspectives de joueur
 */
export async function getPlayerPerspectives() {
  const body = `fields id,name,slug; limit 50; sort name asc;`;
  return igdbRequest('player_perspectives', body);
}

// ============================================================================
// ENTREPRISES
// ============================================================================

/**
 * Détails d'une entreprise (développeur/éditeur)
 */
export async function getCompany(id) {
  const body = `
    fields id,name,slug,description,country,start_date,
    logo.image_id,websites.category,websites.url,
    developed.id,developed.name,developed.cover.image_id,developed.first_release_date,
    published.id,published.name,published.cover.image_id,published.first_release_date;
    where id = ${id};
  `;
  
  const results = await igdbRequest('companies', body);
  if (!results || results.length === 0) {
    throw new Error(`Entreprise ${id} non trouvée`);
  }
  return results[0];
}

/**
 * Recherche d'entreprises
 */
export async function searchCompanies(query, options = {}) {
  const { limit = 20 } = options;
  const body = `search "${query}"; fields id,name,slug,description,logo.image_id,country; limit ${limit};`;
  return igdbRequest('companies', body);
}

/**
 * Jeux d'un développeur
 */
export async function getGamesByDeveloper(companyId, options = {}) {
  const { limit = 50, offset = 0 } = options;
  const body = `
    fields game.id,game.name,game.slug,game.cover.image_id,game.first_release_date,game.total_rating,
    game.genres.name,game.platforms.abbreviation;
    where developer = true & company = ${companyId};
    limit ${limit}; offset ${offset};
    sort game.first_release_date desc;
  `;
  return igdbRequest('involved_companies', body);
}

/**
 * Jeux d'un éditeur
 */
export async function getGamesByPublisher(companyId, options = {}) {
  const { limit = 50, offset = 0 } = options;
  const body = `
    fields game.id,game.name,game.slug,game.cover.image_id,game.first_release_date,game.total_rating,
    game.genres.name,game.platforms.abbreviation;
    where publisher = true & company = ${companyId};
    limit ${limit}; offset ${offset};
    sort game.first_release_date desc;
  `;
  return igdbRequest('involved_companies', body);
}

// ============================================================================
// FRANCHISES & COLLECTIONS
// ============================================================================

/**
 * Détails d'une franchise
 */
export async function getFranchise(id) {
  const body = `
    fields id,name,slug,
    games.id,games.name,games.slug,games.cover.image_id,games.first_release_date,games.total_rating;
    where id = ${id};
  `;
  
  const results = await igdbRequest('franchises', body);
  if (!results || results.length === 0) {
    throw new Error(`Franchise ${id} non trouvée`);
  }
  return results[0];
}

/**
 * Recherche de franchises
 */
export async function searchFranchises(query, options = {}) {
  const { limit = 20 } = options;
  const body = `search "${query}"; fields id,name,slug; limit ${limit};`;
  return igdbRequest('franchises', body);
}

/**
 * Détails d'une collection
 */
export async function getCollection(id) {
  const body = `
    fields id,name,slug,
    games.id,games.name,games.slug,games.cover.image_id,games.first_release_date,games.total_rating;
    where id = ${id};
  `;
  
  const results = await igdbRequest('collections', body);
  if (!results || results.length === 0) {
    throw new Error(`Collection ${id} non trouvée`);
  }
  return results[0];
}

// ============================================================================
// JEUX POPULAIRES / TENDANCES
// ============================================================================

/**
 * Jeux les mieux notés
 */
export async function getTopRated(options = {}) {
  const { limit = 20, offset = 0, platforms, genres, minRatings = 50 } = options;
  
  let body = `
    fields id,name,slug,cover.image_id,total_rating,total_rating_count,first_release_date,
    genres.name,platforms.abbreviation;
    where total_rating_count >= ${minRatings};
  `;
  if (platforms) body += ` & platforms = (${platforms})`;
  if (genres) body += ` & genres = (${genres})`;
  body += `; sort total_rating desc; limit ${limit}; offset ${offset};`;
  
  return igdbRequest('games', body);
}

/**
 * Jeux populaires (par popularité)
 * 
 * @param {Object} options Options de recherche
 * @param {number} options.limit Nombre de résultats (défaut: 20)
 * @param {number} options.offset Décalage pour pagination
 * @param {string} options.platforms IDs de plateformes (ex: "6,48,49" pour PC, PS4, Xbox One)
 * @param {string} options.genres IDs de genres (ex: "4,5,12" pour Fighting, Shooter, RPG)
 * @returns {Promise} Jeux populaires
 */
export async function getPopular(options = {}) {
  const { limit = 20, offset = 0, platforms, genres } = options;
  
  let body = `
    fields id,name,slug,summary,cover.image_id,total_rating,total_rating_count,follows,hypes,
    first_release_date,genres.id,genres.name,platforms.id,platforms.abbreviation;
    where total_rating_count >= 50;
  `;
  if (platforms) body += ` & platforms = (${platforms})`;
  if (genres) body += ` & genres = (${genres})`;
  body += `; sort total_rating_count desc; limit ${limit}; offset ${offset};`;
  
  return igdbRequest('games', body);
}

/**
 * Jeux récents
 */
export async function getRecentReleases(options = {}) {
  const { limit = 20, offset = 0, platforms } = options;
  const now = Math.floor(Date.now() / 1000);
  const threeMonthsAgo = now - (90 * 24 * 60 * 60);
  
  let body = `
    fields id,name,slug,cover.image_id,total_rating,first_release_date,
    genres.name,platforms.abbreviation;
    where first_release_date >= ${threeMonthsAgo} & first_release_date <= ${now};
  `;
  if (platforms) body += ` & platforms = (${platforms})`;
  body += `; sort first_release_date desc; limit ${limit}; offset ${offset};`;
  
  return igdbRequest('games', body);
}

/**
 * Jeux à venir
 */
export async function getUpcoming(options = {}) {
  const { limit = 20, offset = 0, platforms } = options;
  const now = Math.floor(Date.now() / 1000);
  
  let body = `
    fields id,name,slug,cover.image_id,first_release_date,hypes,
    genres.name,platforms.abbreviation;
    where first_release_date > ${now};
  `;
  if (platforms) body += ` & platforms = (${platforms})`;
  body += `; sort first_release_date asc; limit ${limit}; offset ${offset};`;
  
  return igdbRequest('games', body);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Vérifie la disponibilité de l'API
 */
export async function healthCheck() {
  const start = Date.now();
  
  try {
    await getAccessToken();
    const latency = Date.now() - start;
    
    return {
      status: 'healthy',
      latency,
      tokenCached: tokenCache.token !== null
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      latency: Date.now() - start
    };
  }
}
