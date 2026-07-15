/**
 * Routes IGDB
 * 
 * Endpoints pour accéder aux données de jeux via IGDB/Twitch
 * Paramètres communs :
 * - lang : Code langue (fr-FR, en-US, etc.)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 * 
 * @module domains/videogames/routes/igdb
 */

import express from 'express';
import * as igdbProvider from '../providers/igdb.provider.js';
import * as igdbNormalizer from '../normalizers/igdb.normalizer.js';
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

const log = logger.create('IGDBRoutes');
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
    
    // Traduire la description
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
 * GET /api/videogames/igdb/search?q=zelda&limit=20&lang=fr&autoTrad=1
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, query, limit = 20, lang, autoTrad } = req.query;
  const searchQuery = q || query;
  
  if (!searchQuery) {
    return res.status(400).json({
      success: false,
      error: 'Le paramètre q ou query est requis'
    });
  }
  
  const results = await igdbProvider.search(searchQuery, parseInt(limit));
  let normalized = results.map(game => igdbNormalizer.normalizeSearchResult(game));
  
  // Traduction automatique des genres si activée
  normalized = await translateGameGenres(normalized, autoTrad, lang);
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: searchQuery,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Recherche avancée avec filtres
 * POST /api/videogames/igdb/search/advanced
 */
router.post('/search/advanced', asyncHandler(async (req, res) => {
  const {
    query,
    platforms,
    genres,
    themes,
    gameModes,
    playerPerspectives,
    minRating,
    releaseYear,
    releaseDateFrom,
    releaseDateTo,
    limit = 20,
    offset = 0,
    lang,
    autoTrad
  } = req.body;
  
  const results = await igdbProvider.advancedSearch({
    query,
    platforms,
    genres,
    themes,
    gameModes,
    playerPerspectives,
    minRating,
    releaseYear,
    releaseDateFrom,
    releaseDateTo,
    limit,
    offset
  });
  
  let normalized = results.map(game => igdbNormalizer.normalizeSearchResult(game));
  
  // Traduction automatique des genres si activée
  normalized = await translateGameGenres(normalized, autoTrad, lang);
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: query || null,
    filters: { platforms, genres, themes, gameModes, minRating, releaseYear },
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// DÉTAILS
// ============================================================================

/**
 * Détails d'un jeu par ID
 * GET /api/videogames/igdb/game/:id
 */
/**
 * Détails d'un jeu par ID
 * GET /api/videogames/igdb/game/:id
 */
router.get('/game/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { autoTrad, lang } = req.query;
  
  const game = await igdbProvider.getGame(parseInt(id));
  
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Jeu non trouvé'
    });
  }
  
  let normalized = igdbNormalizer.normalizeGame(game);
  
  // Traduction si demandée  
  if (autoTrad && lang) {
    const translated = await translateGameGenres([normalized], autoTrad, lang);
    normalized = translated[0];
  }
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    id: normalized.id,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'un jeu par slug
 * GET /api/videogames/igdb/game/slug/:slug
 */
router.get('/game/slug/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { autoTrad, lang } = req.query;
  
  const game = await igdbProvider.getGameBySlug(slug);
  
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Jeu non trouvé'
    });
  }
  
  let normalized = igdbNormalizer.normalizeGame(game);
  
  // Traduction si demandée
  if (autoTrad && lang) {
    const translated = await translateGameGenres([normalized], autoTrad, lang);
    normalized = translated[0];
  }
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    id: normalized.id,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// MÉTADONNÉES
// ============================================================================

/**
 * Liste des genres
 * GET /api/videogames/igdb/genres
 */
router.get('/genres', asyncHandler(async (req, res) => {
  const genres = await igdbProvider.getGenres();
  const normalized = genres.map(g => igdbNormalizer.normalizeGenre(g));
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des plateformes
 * GET /api/videogames/igdb/platforms
 */
router.get('/platforms', asyncHandler(async (req, res) => {
  const platforms = await igdbProvider.getPlatforms();
  const normalized = platforms.map(p => igdbNormalizer.normalizePlatform(p));
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des thèmes
 * GET /api/videogames/igdb/themes
 */
router.get('/themes', asyncHandler(async (req, res) => {
  const themes = await igdbProvider.getThemes();
  
  const normalized = themes.map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug
  }));
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des modes de jeu
 * GET /api/videogames/igdb/game-modes
 */
router.get('/game-modes', asyncHandler(async (req, res) => {
  const gameModes = await igdbProvider.getGameModes();
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: null,
    total: gameModes.length,
    count: gameModes.length,
    data: gameModes,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Liste des perspectives de joueur
 * GET /api/videogames/igdb/player-perspectives
 */
router.get('/player-perspectives', asyncHandler(async (req, res) => {
  const perspectives = await igdbProvider.getPlayerPerspectives();
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: null,
    total: perspectives.length,
    count: perspectives.length,
    data: perspectives,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// ENTREPRISES
// ============================================================================

/**
 * Recherche d'entreprises (développeurs/éditeurs)
 * GET /api/videogames/igdb/companies/search?q=nintendo
 */
router.get('/companies/search', asyncHandler(async (req, res) => {
  const { q, query, limit = 20 } = req.query;
  const searchQuery = q || query;
  
  if (!searchQuery) {
    return res.status(400).json({
      success: false,
      error: 'Le paramètre q ou query est requis'
    });
  }
  
  const companies = await igdbProvider.searchCompanies(searchQuery, parseInt(limit));
  const normalized = companies.map(c => igdbNormalizer.normalizeCompany(c));
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: searchQuery,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'une entreprise
 * GET /api/videogames/igdb/company/:id
 */
router.get('/company/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const company = await igdbProvider.getCompany(parseInt(id));
  
  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'Entreprise non trouvée'
    });
  }
  
  const normalized = igdbNormalizer.normalizeCompany(company);
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    id: normalized.id || `igdb:${id}`,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Jeux d'un développeur
 * GET /api/videogames/igdb/developer/:id/games
 */
router.get('/developer/:id/games', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 20, lang, autoTrad } = req.query;
  
  const games = await igdbProvider.getGamesByDeveloper(parseInt(id), parseInt(limit));
  let normalized = games.map(g => igdbNormalizer.normalizeSearchResult(g));
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateSearchResults(normalized, targetLang, { enabled: true });
  }
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString(), developerId: parseInt(id) }
  });
}));

/**
 * Jeux d'un éditeur
 * GET /api/videogames/igdb/publisher/:id/games
 */
router.get('/publisher/:id/games', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 20, lang, autoTrad } = req.query;
  
  const games = await igdbProvider.getGamesByPublisher(parseInt(id), parseInt(limit));
  let normalized = games.map(g => igdbNormalizer.normalizeSearchResult(g));
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateSearchResults(normalized, targetLang, { enabled: true });
  }
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString(), publisherId: parseInt(id) }
  });
}));

// ============================================================================
// FRANCHISES & COLLECTIONS
// ============================================================================

/**
 * Recherche de franchises
 * GET /api/videogames/igdb/franchises/search?q=mario
 */
router.get('/franchises/search', asyncHandler(async (req, res) => {
  const { q, query, limit = 20 } = req.query;
  const searchQuery = q || query;
  
  if (!searchQuery) {
    return res.status(400).json({
      success: false,
      error: 'Le paramètre q ou query est requis'
    });
  }
  
  const franchises = await igdbProvider.searchFranchises(searchQuery, parseInt(limit));
  const normalized = franchises.map(f => igdbNormalizer.normalizeFranchise(f));
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    query: searchQuery,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'une franchise
 * GET /api/videogames/igdb/franchise/:id
 */
router.get('/franchise/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const franchise = await igdbProvider.getFranchise(parseInt(id));
  
  if (!franchise) {
    return res.status(404).json({
      success: false,
      error: 'Franchise non trouvée'
    });
  }
  
  const normalized = igdbNormalizer.normalizeFranchise(franchise);
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    id: normalized.id || `igdb:${id}`,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Détails d'une collection
 * GET /api/videogames/igdb/collection/:id
 */
router.get('/collection/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const collection = await igdbProvider.getCollection(parseInt(id));
  
  if (!collection) {
    return res.status(404).json({
      success: false,
      error: 'Collection non trouvée'
    });
  }
  
  const normalized = igdbNormalizer.normalizeCollection(collection);
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    id: normalized.id || `igdb:${id}`,
    data: normalized,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// POPULAIRES / TENDANCES
// ============================================================================

/**
 * Jeux les mieux notés
 * GET /api/videogames/igdb/top-rated
 */
router.get('/top-rated', asyncHandler(async (req, res) => {
  const { limit = 20, lang, autoTrad } = req.query;
  
  const games = await igdbProvider.getTopRated(parseInt(limit));
  let normalized = games.map(g => igdbNormalizer.normalizeSearchResult(g));
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateSearchResults(normalized, targetLang, { enabled: true });
  }
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    endpoint: 'top-rated',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Jeux populaires (par follows/popularité)
 * GET /api/videogames/igdb/popular?limit=20&platforms=6,48,49&genres=4,5&lang=fr&autoTrad=1
 */
router.get('/popular', asyncHandler(async (req, res) => {
  const { 
    limit = 20, 
    offset = 0,
    platforms,
    genres,
    lang, 
    autoTrad 
  } = req.query;
  
  const { data: normalized, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'igdb',
    endpoint: 'popular',
    fetchFn: async () => {
      const games = await igdbProvider.getPopular({ 
        limit: Math.min(parseInt(limit), 100),
        offset: parseInt(offset),
        platforms,
        genres
      });
      
      let normalized = games.map(g => igdbNormalizer.normalizeSearchResult(g));
      normalized = await translateGameGenres(normalized, autoTrad, lang);
      
      return normalized;
    },
    cacheOptions: {
      category: platforms || 'all',
      page: parseInt(offset) > 0 ? Math.floor(parseInt(offset) / parseInt(limit)) + 1 : 1,
      ttl: getTTL('popular')
    }
  });
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    endpoint: 'popular',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      limit: parseInt(limit),
      offset: parseInt(offset),
      platforms: platforms || 'all',
      genres: genres || 'all',
      ordering: 'popularity',
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * Sorties récentes
 * GET /api/videogames/igdb/recent
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const { limit = 20, lang, autoTrad } = req.query;
  
  const games = await igdbProvider.getRecentReleases(parseInt(limit));
  let normalized = games.map(g => igdbNormalizer.normalizeSearchResult(g));
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateSearchResults(normalized, targetLang, { enabled: true });
  }
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    endpoint: 'recent',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * Jeux à venir
 * GET /api/videogames/igdb/upcoming
 */
router.get('/upcoming', asyncHandler(async (req, res) => {
  const { limit = 20, lang, autoTrad } = req.query;
  
  const games = await igdbProvider.getUpcoming(parseInt(limit));
  let normalized = games.map(g => igdbNormalizer.normalizeSearchResult(g));
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  if (autoTradEnabled && targetLang && normalized.length > 0) {
    normalized = await translateSearchResults(normalized, targetLang, { enabled: true });
  }
  
  res.json({
    success: true,
    provider: 'igdb',
    domain: 'videogames',
    endpoint: 'upcoming',
    query: null,
    total: normalized.length,
    count: normalized.length,
    data: normalized,
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * État de santé du provider
 * GET /api/videogames/igdb/health
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await igdbProvider.healthCheck();
  
  res.json({
    success: health.status === 'healthy',
    provider: 'igdb',
    ...health
  });
}));

export default router;
