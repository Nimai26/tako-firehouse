/**
 * Provider RAWG
 * 
 * API RAWG.io pour recherche et détails de jeux vidéo
 * Base de données de jeux très complète avec métadonnées détaillées
 * 
 * @module domains/videogames/providers/rawg
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('RAWGProvider');

const BASE_URL = 'https://api.rawg.io/api';

/**
 * Récupère la clé API depuis l'environnement
 */
function getApiKey() {
  const key = process.env.RAWG_API_KEY;
  if (!key) {
    throw new Error('RAWG_API_KEY est requis');
  }
  return key;
}

/**
 * Effectue une requête à l'API RAWG
 */
async function rawgRequest(endpoint, params = {}) {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}/${endpoint}`);
  
  // Ajouter la clé API
  url.searchParams.set('key', apiKey);
  
  // Ajouter les autres paramètres
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  
  log.debug(`RAWG Request: ${url.pathname}?${url.searchParams.toString().replace(apiKey, '***')}`);
  
  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'TakoAPI/1.0'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur RAWG API ${response.status}: ${errorText}`);
  }
  
  return response.json();
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche de jeux
 */
export async function search(query, options = {}) {
  const {
    page = 1,
    pageSize = 20,
    platforms,
    genres,
    tags,
    stores,
    developers,
    publishers,
    dates,
    metacritic,
    ordering,
    searchPrecise = false,
    searchExact = false
  } = options;
  
  const params = {
    search: query,
    page,
    page_size: Math.min(pageSize, 40),
    search_precise: searchPrecise,
    search_exact: searchExact
  };
  
  // Filtres optionnels
  if (platforms) params.platforms = platforms;
  if (genres) params.genres = genres;
  if (tags) params.tags = tags;
  if (stores) params.stores = stores;
  if (developers) params.developers = developers;
  if (publishers) params.publishers = publishers;
  if (dates) params.dates = dates;
  if (metacritic) params.metacritic = metacritic;
  if (ordering) params.ordering = ordering;
  
  return rawgRequest('games', params);
}

/**
 * Recherche avancée avec tous les filtres possibles
 */
export async function advancedSearch(options = {}) {
  const {
    query,
    page = 1,
    pageSize = 20,
    platforms,
    platformsExclude,
    genres,
    genresExclude,
    tags,
    tagsExclude,
    stores,
    developers,
    publishers,
    dates,
    updated,
    metacritic,
    ordering = '-rating',
    excludeCollection,
    excludeAdditions,
    excludeParents,
    excludeGameSeries,
    parentPlatforms
  } = options;
  
  const params = {
    page,
    page_size: Math.min(pageSize, 40)
  };
  
  if (query) params.search = query;
  if (platforms) params.platforms = platforms;
  if (platformsExclude) params.platforms_exclude = platformsExclude;
  if (genres) params.genres = genres;
  if (genresExclude) params.genres_exclude = genresExclude;
  if (tags) params.tags = tags;
  if (tagsExclude) params.tags_exclude = tagsExclude;
  if (stores) params.stores = stores;
  if (developers) params.developers = developers;
  if (publishers) params.publishers = publishers;
  if (dates) params.dates = dates;
  if (updated) params.updated = updated;
  if (metacritic) params.metacritic = metacritic;
  if (ordering) params.ordering = ordering;
  if (excludeCollection) params.exclude_collection = excludeCollection;
  if (excludeAdditions) params.exclude_additions = excludeAdditions;
  if (excludeParents) params.exclude_parents = excludeParents;
  if (excludeGameSeries) params.exclude_game_series = excludeGameSeries;
  if (parentPlatforms) params.parent_platforms = parentPlatforms;
  
  return rawgRequest('games', params);
}

// ============================================================================
// DÉTAILS
// ============================================================================

/**
 * Détails d'un jeu par ID ou slug
 */
export async function getGame(idOrSlug) {
  return rawgRequest(`games/${idOrSlug}`);
}

/**
 * Screenshots d'un jeu
 */
export async function getGameScreenshots(idOrSlug, options = {}) {
  const { page = 1, pageSize = 20 } = options;
  return rawgRequest(`games/${idOrSlug}/screenshots`, { page, page_size: pageSize });
}

/**
 * Stores où acheter le jeu
 */
export async function getGameStores(idOrSlug) {
  return rawgRequest(`games/${idOrSlug}/stores`);
}

/**
 * Jeux similaires (de la même série)
 */
export async function getGameSeries(idOrSlug, options = {}) {
  const { page = 1, pageSize = 20 } = options;
  return rawgRequest(`games/${idOrSlug}/game-series`, { page, page_size: pageSize });
}

/**
 * DLC et additions
 */
export async function getGameAdditions(idOrSlug, options = {}) {
  const { page = 1, pageSize = 20 } = options;
  return rawgRequest(`games/${idOrSlug}/additions`, { page, page_size: pageSize });
}

/**
 * Jeu parent (si DLC)
 */
export async function getGameParent(idOrSlug) {
  return rawgRequest(`games/${idOrSlug}/parent-games`);
}

/**
 * Achievements du jeu
 */
export async function getGameAchievements(idOrSlug, options = {}) {
  const { page = 1, pageSize = 20 } = options;
  return rawgRequest(`games/${idOrSlug}/achievements`, { page, page_size: pageSize });
}

/**
 * Vidéos du jeu (trailers, gameplay)
 */
export async function getGameMovies(idOrSlug) {
  return rawgRequest(`games/${idOrSlug}/movies`);
}

/**
 * Suggestions Reddit pour le jeu
 */
export async function getGameReddit(idOrSlug) {
  return rawgRequest(`games/${idOrSlug}/reddit`);
}

/**
 * Twitch streams pour le jeu
 */
export async function getGameTwitch(idOrSlug) {
  return rawgRequest(`games/${idOrSlug}/twitch`);
}

// ============================================================================
// MÉTADONNÉES (Genres, Plateformes, etc.)
// ============================================================================

/**
 * Liste tous les genres
 */
export async function getGenres(options = {}) {
  const { page = 1, pageSize = 40, ordering } = options;
  return rawgRequest('genres', { page, page_size: pageSize, ordering });
}

/**
 * Détails d'un genre
 */
export async function getGenre(idOrSlug) {
  return rawgRequest(`genres/${idOrSlug}`);
}

/**
 * Liste toutes les plateformes
 */
export async function getPlatforms(options = {}) {
  const { page = 1, pageSize = 40, ordering } = options;
  return rawgRequest('platforms', { page, page_size: pageSize, ordering });
}

/**
 * Détails d'une plateforme
 */
export async function getPlatform(idOrSlug) {
  return rawgRequest(`platforms/${idOrSlug}`);
}

/**
 * Liste des plateformes parentes (PC, PlayStation, Xbox, Nintendo, etc.)
 */
export async function getParentPlatforms() {
  return rawgRequest('platforms/lists/parents');
}

/**
 * Liste tous les tags
 */
export async function getTags(options = {}) {
  const { page = 1, pageSize = 40, ordering } = options;
  return rawgRequest('tags', { page, page_size: pageSize, ordering });
}

/**
 * Détails d'un tag
 */
export async function getTag(idOrSlug) {
  return rawgRequest(`tags/${idOrSlug}`);
}

/**
 * Liste tous les stores
 */
export async function getStores(options = {}) {
  const { page = 1, pageSize = 40, ordering } = options;
  return rawgRequest('stores', { page, page_size: pageSize, ordering });
}

/**
 * Détails d'un store
 */
export async function getStore(idOrSlug) {
  return rawgRequest(`stores/${idOrSlug}`);
}

// ============================================================================
// DÉVELOPPEURS & ÉDITEURS
// ============================================================================

/**
 * Liste des développeurs
 */
export async function getDevelopers(options = {}) {
  const { page = 1, pageSize = 20 } = options;
  return rawgRequest('developers', { page, page_size: pageSize });
}

/**
 * Détails d'un développeur
 */
export async function getDeveloper(idOrSlug) {
  return rawgRequest(`developers/${idOrSlug}`);
}

/**
 * Jeux d'un développeur
 */
export async function getGamesByDeveloper(idOrSlug, options = {}) {
  const { page = 1, pageSize = 20, ordering = '-released' } = options;
  return rawgRequest('games', {
    developers: idOrSlug,
    page,
    page_size: pageSize,
    ordering
  });
}

/**
 * Liste des éditeurs
 */
export async function getPublishers(options = {}) {
  const { page = 1, pageSize = 20 } = options;
  return rawgRequest('publishers', { page, page_size: pageSize });
}

/**
 * Détails d'un éditeur
 */
export async function getPublisher(idOrSlug) {
  return rawgRequest(`publishers/${idOrSlug}`);
}

/**
 * Jeux d'un éditeur
 */
export async function getGamesByPublisher(idOrSlug, options = {}) {
  const { page = 1, pageSize = 20, ordering = '-released' } = options;
  return rawgRequest('games', {
    publishers: idOrSlug,
    page,
    page_size: pageSize,
    ordering
  });
}

// ============================================================================
// CRÉATEURS
// ============================================================================

/**
 * Liste des créateurs (game designers, directors, etc.)
 */
export async function getCreators(options = {}) {
  const { page = 1, pageSize = 20 } = options;
  return rawgRequest('creators', { page, page_size: pageSize });
}

/**
 * Détails d'un créateur
 */
export async function getCreator(idOrSlug) {
  return rawgRequest(`creators/${idOrSlug}`);
}

// ============================================================================
// JEUX POPULAIRES / TENDANCES
// ============================================================================

/**
 * Jeux les mieux notés
 */
export async function getTopRated(options = {}) {
  return advancedSearch({
    ...options,
    ordering: '-rating',
    metacritic: '80,100'
  });
}

/**
 * Jeux populaires (par rating)
 * 
 * @param {Object} options Options de recherche
 * @param {number} options.page Numéro de page
 * @param {number} options.pageSize Nombre de résultats par page
 * @param {string} options.platforms IDs de plateformes (séparés par virgule)
 * @param {string} options.genres IDs de genres (séparés par virgule)
 * @param {string} options.tags IDs de tags (séparés par virgule)
 * @returns {Promise} Jeux populaires
 */
export async function getPopular(options = {}) {
  return advancedSearch({
    ...options,
    ordering: '-rating',
    metacritic: '70,100' // Jeux bien notés
  });
}

/**
 * Jeux trending (récemment ajoutés à la base)
 * 
 * @param {Object} options Options de recherche
 * @param {number} options.page Numéro de page
 * @param {number} options.pageSize Nombre de résultats par page
 * @param {string} options.platforms IDs de plateformes (séparés par virgule)
 * @param {string} options.genres IDs de genres (séparés par virgule)
 * @param {string} options.tags IDs de tags (séparés par virgule)
 * @returns {Promise} Jeux récemment ajoutés
 */
export async function getTrending(options = {}) {
  return advancedSearch({
    ...options,
    ordering: '-added' // Triés par date d'ajout (récents d'abord)
  });
}

/**
 * Jeux récents
 */
export async function getRecentReleases(options = {}) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3));
  const today = new Date().toISOString().split('T')[0];
  const past = threeMonthsAgo.toISOString().split('T')[0];
  
  return advancedSearch({
    ...options,
    dates: `${past},${today}`,
    ordering: '-released'
  });
}

/**
 * Jeux à venir
 */
export async function getUpcoming(options = {}) {
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const future = futureDate.toISOString().split('T')[0];
  
  return advancedSearch({
    ...options,
    dates: `${today},${future}`,
    ordering: 'released'
  });
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
    // Test simple avec les genres (léger)
    await getGenres({ pageSize: 1 });
    const latency = Date.now() - start;
    
    return {
      status: 'healthy',
      latency
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      latency: Date.now() - start
    };
  }
}
