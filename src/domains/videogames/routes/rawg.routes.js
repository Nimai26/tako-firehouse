/**
 * Routes RAWG
 * 
 * Endpoints pour accéder aux données de jeux via RAWG.io
 * Paramètres communs :
 * - lang : Code langue (fr-FR, en-US, etc.)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 * 
 * @module domains/videogames/routes/rawg
 */

import express from 'express';
import * as rawgProvider from '../providers/rawg.provider.js';
import * as rawgNormalizer from '../normalizers/rawg.normalizer.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { logger } from '../../../shared/utils/logger.js';
import {
  translateSearchResults,
  translateVideoGameGenres,
  translateText,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';
import { withDiscoveryCache, getTTL } from '../../../shared/utils/cache-wrapper.js';

const log = logger.create('RAWGRoutes');
const router = express.Router();

// Helper pour traduire les genres et descriptions dans les résultats de jeux
async function translateGameGenres(games, autoTrad, lang) {
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  
  if (!autoTradEnabled || !targetLang || !games || games.length === 0) {
    return games;
  }
  
  // Traduire les genres ET les descriptions
  return await Promise.all(games.map(async (game) => {
    const result = { ...game };
    
    // Traduire les genres (stored in details.genres)
    if (game.details?.genres && game.details.genres.length > 0) {
      const { terms: translatedGenres } = await translateVideoGameGenres(game.details.genres, targetLang);
      result.details = {
        ...result.details,
        genresOriginal: game.details.genres,
        genres: translatedGenres
      };
    }
    
    // Traduire la description (si présente)
    if (game.description && game.description.length > 20) {
      const translated = await translateText(game.description, targetLang, { enabled: true, sourceLang: 'en' });
      if (translated.translated) {
        result.details = { ...result.details, descriptionOriginal: game.description };
        result.description = translated.text;
      }
    }
    
    return result;
  }));
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche de jeux
 * GET /api/videogames/rawg/search?q=zelda&page=1&pageSize=20&lang=fr&autoTrad=1
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { 
    q, query, 
    page = 1, 
    limit,
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
    lang,
    autoTrad
  } = req.query;
  const searchQuery = q || query;
  
  if (!searchQuery) {
    return res.status(400).json({
      success: false,
      error: 'Le paramètre q ou query est requis'
    });
  }
  
  const effectivePageSize = parseInt(limit || pageSize) || 20;
  const results = await rawgProvider.search(searchQuery, {
    page: parseInt(page),
    limit: effectivePageSize,
    platforms,
    genres,
    tags,
    stores,
    developers,
    publishers,
    dates,
    metacritic,
    ordering
  });
  
  let normalized = results.results?.map(game => 
    rawgNormalizer.normalizeSearchResult(game)
  ) || [];
  
  // Traduction automatique si activée
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: searchQuery,
    total: results.count || 0,
    pagination: {
      page: parseInt(page),
      limit: effectivePageSize,
      hasMore: !!results.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Recherche avancée avec tous les filtres
 * POST /api/videogames/rawg/search/advanced
 */
router.post('/search/advanced', asyncHandler(async (req, res) => {
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
    ordering,
    excludeCollection,
    excludeAdditions,
    excludeParents,
    excludeGameSeries,
    parentPlatforms,
    lang,
    autoTrad
  } = req.body;
  
  const results = await rawgProvider.advancedSearch({
    query,
    page,
    pageSize,
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
    ordering,
    excludeCollection,
    excludeAdditions,
    excludeParents,
    excludeGameSeries,
    parentPlatforms
  });
  
  let normalized = results.results?.map(game => 
    rawgNormalizer.normalizeSearchResult(game)
  ) || [];
  
  // Traduction automatique si activée
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: query || null,
    total: results.count || 0,
    filters: { platforms, genres, tags, developers, publishers, metacritic, ordering },
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!results.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// DÉTAILS
// ============================================================================

/**
 * Détails d'un jeu par ID ou slug
 * GET /api/videogames/rawg/game/:idOrSlug
 */
router.get('/game/:idOrSlug', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const { autoTrad, lang } = req.query;
  
  const game = await rawgProvider.getGame(idOrSlug);
  
  if (!game || game.detail === 'Not found.') {
    return res.status(404).json({
      success: false,
      error: 'Jeu non trouvé'
    });
  }
  
  let normalized = rawgNormalizer.normalizeGame(game);
  
  // Traduction si demandée
  if (autoTrad && lang) {
    const translated = await translateGameGenres([normalized], autoTrad, lang);
    normalized = translated[0];
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    id: normalized.id,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Screenshots d'un jeu
 * GET /api/videogames/rawg/game/:idOrSlug/screenshots
 */
router.get('/game/:idOrSlug/screenshots', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  
  const data = await rawgProvider.getGameScreenshots(idOrSlug, { 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  const normalized = data.results?.map(s => rawgNormalizer.normalizeScreenshot(s)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { gameId: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Stores où acheter un jeu
 * GET /api/videogames/rawg/game/:idOrSlug/stores
 */
router.get('/game/:idOrSlug/stores', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  
  const data = await rawgProvider.getGameStores(idOrSlug);
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.results?.length || 0,
    count: data.results?.length || 0,
    data: data.results || [],
    pagination: null,
    meta: { gameId: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Jeux de la même série
 * GET /api/videogames/rawg/game/:idOrSlug/series
 */
router.get('/game/:idOrSlug/series', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const { page = 1, pageSize = 20, lang, autoTrad } = req.query;
  
  const data = await rawgProvider.getGameSeries(idOrSlug, { 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { gameId: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

/**
 * DLC et additions d'un jeu
 * GET /api/videogames/rawg/game/:idOrSlug/additions
 */
router.get('/game/:idOrSlug/additions', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const { page = 1, pageSize = 20, lang, autoTrad } = req.query;
  
  const data = await rawgProvider.getGameAdditions(idOrSlug, { 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { gameId: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Achievements d'un jeu
 * GET /api/videogames/rawg/game/:idOrSlug/achievements
 */
router.get('/game/:idOrSlug/achievements', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  
  const data = await rawgProvider.getGameAchievements(idOrSlug, { 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  const normalized = data.results?.map(a => rawgNormalizer.normalizeAchievement(a)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { gameId: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Vidéos/trailers d'un jeu
 * GET /api/videogames/rawg/game/:idOrSlug/movies
 */
router.get('/game/:idOrSlug/movies', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  
  const data = await rawgProvider.getGameMovies(idOrSlug);
  const normalized = data.results?.map(m => rawgNormalizer.normalizeMovie(m)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { gameId: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// MÉTADONNÉES
// ============================================================================

/**
 * Liste des genres
 * GET /api/videogames/rawg/genres
 */
router.get('/genres', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 40, ordering } = req.query;
  
  const data = await rawgProvider.getGenres({ 
    page: parseInt(page), 
    limit: parseInt(pageSize),
    ordering 
  });
  
  const normalized = data.results?.map(g => rawgNormalizer.normalizeGenre(g)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'un genre
 * GET /api/videogames/rawg/genre/:idOrSlug
 */
router.get('/genre/:idOrSlug', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  
  const genre = await rawgProvider.getGenre(idOrSlug);
  const normalized = rawgNormalizer.normalizeGenre(genre);
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    id: normalized.id,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des plateformes
 * GET /api/videogames/rawg/platforms
 */
router.get('/platforms', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 40, ordering } = req.query;
  
  const data = await rawgProvider.getPlatforms({ 
    page: parseInt(page), 
    limit: parseInt(pageSize),
    ordering 
  });
  
  const normalized = data.results?.map(p => rawgNormalizer.normalizePlatform(p)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Plateformes parentes (PC, PlayStation, Xbox, Nintendo, etc.)
 * GET /api/videogames/rawg/platforms/parents
 */
router.get('/platforms/parents', asyncHandler(async (req, res) => {
  const data = await rawgProvider.getParentPlatforms();
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.results?.length || 0,
    count: data.results?.length || 0,
    data: data.results || [],
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des tags
 * GET /api/videogames/rawg/tags
 */
router.get('/tags', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 40, ordering } = req.query;
  
  const data = await rawgProvider.getTags({ 
    page: parseInt(page), 
    limit: parseInt(pageSize),
    ordering 
  });
  
  const normalized = data.results?.map(t => rawgNormalizer.normalizeTag(t)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des stores
 * GET /api/videogames/rawg/stores
 */
router.get('/stores', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 40, ordering } = req.query;
  
  const data = await rawgProvider.getStores({ 
    page: parseInt(page), 
    limit: parseInt(pageSize),
    ordering 
  });
  
  const normalized = data.results?.map(s => rawgNormalizer.normalizeStore(s)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// DÉVELOPPEURS & ÉDITEURS
// ============================================================================

/**
 * Liste des développeurs
 * GET /api/videogames/rawg/developers
 */
router.get('/developers', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  
  const data = await rawgProvider.getDevelopers({ 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  const normalized = data.results?.map(d => rawgNormalizer.normalizeCompany(d)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'un développeur
 * GET /api/videogames/rawg/developer/:idOrSlug
 */
router.get('/developer/:idOrSlug', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  
  const developer = await rawgProvider.getDeveloper(idOrSlug);
  const normalized = rawgNormalizer.normalizeCompany(developer);
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    id: normalized.id,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Jeux d'un développeur
 * GET /api/videogames/rawg/developer/:idOrSlug/games
 */
router.get('/developer/:idOrSlug/games', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const { page = 1, pageSize = 20, ordering, lang, autoTrad } = req.query;
  
  const data = await rawgProvider.getGamesByDeveloper(idOrSlug, { 
    page: parseInt(page), 
    limit: parseInt(pageSize),
    ordering 
  });
  
  let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { developer: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des éditeurs
 * GET /api/videogames/rawg/publishers
 */
router.get('/publishers', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  
  const data = await rawgProvider.getPublishers({ 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  const normalized = data.results?.map(p => rawgNormalizer.normalizeCompany(p)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'un éditeur
 * GET /api/videogames/rawg/publisher/:idOrSlug
 */
router.get('/publisher/:idOrSlug', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  
  const publisher = await rawgProvider.getPublisher(idOrSlug);
  const normalized = rawgNormalizer.normalizeCompany(publisher);
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    id: normalized.id,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Jeux d'un éditeur
 * GET /api/videogames/rawg/publisher/:idOrSlug/games
 */
router.get('/publisher/:idOrSlug/games', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const { page = 1, pageSize = 20, ordering, lang, autoTrad } = req.query;
  
  const data = await rawgProvider.getGamesByPublisher(idOrSlug, { 
    page: parseInt(page), 
    limit: parseInt(pageSize),
    ordering 
  });
  
  let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { publisher: idOrSlug, fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// CRÉATEURS
// ============================================================================

/**
 * Liste des créateurs
 * GET /api/videogames/rawg/creators
 */
router.get('/creators', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  
  const data = await rawgProvider.getCreators({ 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  const normalized = data.results?.map(c => rawgNormalizer.normalizeCreator(c)) || [];
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'un créateur
 * GET /api/videogames/rawg/creator/:idOrSlug
 */
router.get('/creator/:idOrSlug', asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  
  const creator = await rawgProvider.getCreator(idOrSlug);
  const normalized = rawgNormalizer.normalizeCreator(creator);
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    id: normalized.id,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// POPULAIRES / TENDANCES
// ============================================================================

/**
 * Jeux les mieux notés
 * GET /api/videogames/rawg/top-rated
 */
router.get('/top-rated', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, lang, autoTrad } = req.query;
  
  const data = await rawgProvider.getTopRated({ 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    endpoint: 'top-rated',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Sorties récentes
 * GET /api/videogames/rawg/recent
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, lang, autoTrad } = req.query;
  
  const data = await rawgProvider.getRecentReleases({ 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    endpoint: 'recent',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Jeux populaires (bien notés)
 * GET /api/videogames/rawg/popular?page=1&pageSize=20&platforms=4,187&genres=4&lang=fr&autoTrad=1
 */
router.get('/popular', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 20,
    platforms,
    genres,
    tags,
    lang,
    autoTrad
  } = req.query;
  
  const limit = Math.min(parseInt(pageSize), 100);
  
  const { data: normalized, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'rawg',
    endpoint: 'popular',
    fetchFn: async () => {
      const data = await rawgProvider.getPopular({ 
        page: parseInt(page), 
        pageSize: limit,
        platforms,
        genres,
        tags
      });
      
      let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
      
      const autoTradEnabled = isAutoTradEnabled({ autoTrad });
      const targetLang = extractLangCode(lang);
      if (autoTradEnabled && targetLang && normalized.length > 0) {
        normalized = await translateGameGenres(normalized, autoTrad, lang);
      }
      
      // Retourner directement l'array pour que le cache compte les résultats
      return normalized;
    },
    cacheOptions: {
      category: platforms || 'all',
      page: parseInt(page),
      ttl: getTTL('popular')
    }
  });
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    endpoint: 'popular',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      page: parseInt(page),
      platforms: platforms || 'all',
      genres: genres || 'all',
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * Jeux trending (récemment ajoutés)
 * GET /api/videogames/rawg/trending?page=1&pageSize=20&platforms=4&genres=2&lang=fr&autoTrad=1
 */
router.get('/trending', asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    pageSize = 20,
    platforms,
    genres,
    tags,
    lang,
    autoTrad
  } = req.query;
  
  const limit = Math.min(parseInt(pageSize), 100);
  
  const { data: normalized, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'rawg',
    endpoint: 'trending',
    fetchFn: async () => {
      const data = await rawgProvider.getTrending({ 
        page: parseInt(page), 
        pageSize: limit,
        platforms,
        genres,
        tags
      });
      
      let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
      
      const autoTradEnabled = isAutoTradEnabled({ autoTrad });
      const targetLang = extractLangCode(lang);
      if (autoTradEnabled && targetLang && normalized.length > 0) {
        normalized = await translateGameGenres(normalized, autoTrad, lang);
      }
      
      // Retourner directement l'array pour que le cache compte les résultats
      return normalized;
    },
    cacheOptions: {
      category: platforms || 'all',
      page: parseInt(page),
      ttl: getTTL('trending')
    }
  });
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    endpoint: 'trending',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      page: parseInt(page),
      platforms: platforms || 'all',
      genres: genres || 'all',
      ordering: 'recently_added',
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * Jeux à venir
 * GET /api/videogames/rawg/upcoming
 */
router.get('/upcoming', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 20, lang, autoTrad } = req.query;
  
  const data = await rawgProvider.getUpcoming({ 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  });
  
  let normalized = data.results?.map(g => rawgNormalizer.normalizeSearchResult(g)) || [];
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateGameGenres(normalized, autoTrad, lang);
  }
  
  res.json({
    success: true,
    provider: 'rawg',
    domain: 'videogames',
    endpoint: 'upcoming',
    query: null,
    total: data.count || 0,
    pagination: {
      page: parseInt(page),
      limit: parseInt(pageSize),
      hasMore: !!data.next
    },
    count: normalized.length,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * État de santé du provider
 * GET /api/videogames/rawg/health
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await rawgProvider.healthCheck();
  
  res.json({
    success: health.status === 'healthy',
    provider: 'rawg',
    ...health
  });
}));

export default router;
