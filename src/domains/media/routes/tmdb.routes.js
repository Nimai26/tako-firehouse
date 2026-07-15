/**
 * Routes TMDB
 * 
 * Endpoints pour l'API The Movie Database (TMDB).
 * 
 * Routes disponibles :
 * - GET /health - Vérifier la disponibilité
 * - GET /search - Recherche multi (films, séries, personnes)
 * - GET /search/movies - Rechercher uniquement des films
 * - GET /search/series - Rechercher uniquement des séries
 * - GET /movies/:id - Détails d'un film
 * - GET /series/:id - Détails d'une série
 * - GET /series/:id/season/:season - Détails d'une saison
 * - GET /series/:id/season/:season/episode/:episode - Détails d'un épisode
 * - GET /collections/:id - Détails d'une collection/saga
 * - GET /persons/:id - Détails d'une personne
 * - GET /directors/:id/movies - Films d'un réalisateur
 * 
 * Support traduction :
 * - lang : Code langue (fr-FR, en-US, etc.)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */

import { Router } from 'express';
import { TmdbProvider } from '../providers/tmdb.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';
import {
  translateSearchResults,
  translateText,
  translateGenre,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';
import { withDiscoveryCache, getTTL } from '../../../shared/utils/cache-wrapper.js';

const router = Router();
const provider = new TmdbProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Traduit les champs description et genres d'un résultat détaillé (format canonique)
 * - description est au top-level
 * - genres est dans details.genres
 */
async function translateDetailResult(result, targetLang, autoTradEnabled) {
  if (!autoTradEnabled || !targetLang || !result) return result;

  const translated = { ...result };
  if (result.details) {
    translated.details = { ...result.details };
  }

  // Traduire description (top-level)
  if (result.description) {
    const { text, translated: wasTranslated } = await translateText(result.description, targetLang, { enabled: true });
    if (wasTranslated) {
      translated.details.descriptionOriginal = result.description;
      translated.description = text;
    }
  }

  // Traduire genres (dans details)
  const genres = result.details?.genres;
  if (Array.isArray(genres) && genres.length > 0) {
    const genreTranslations = await Promise.all(
      genres.map(genre => translateGenre(genre, targetLang))
    );
    const wasTranslated = genreTranslations.some((g, i) => g !== genres[i]);
    if (wasTranslated) {
      translated.details.genresOriginal = genres;
      translated.details.genres = genreTranslations;
    }
  }

  return translated;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/health', asyncHandler(async (req, res) => {
  const isConfigured = provider.isConfigured();

  res.status(isConfigured ? 200 : 503).json({
    provider: 'tmdb',
    status: isConfigured ? 'healthy' : 'unhealthy',
    message: isConfigured ? 'TMDB API configurée' : 'TMDB_API_KEY non configurée'
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/search
 * Recherche multi (films, séries, personnes)
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - type : Type (multi, movie, tv, person) - défaut: multi
 * - page : Numéro de page (défaut 1)
 * - pageSize : Résultats par page (max 20)
 * - lang : Langue (défaut fr-FR)
 * - year : Année de sortie
 * - adult : Inclure contenu adulte (true/false)
 * - autoTrad : Activer la traduction automatique
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { 
    q, 
    type = 'multi', 
    page = '1', 
    limit,
    pageSize = '20', 
    lang = 'fr-FR',
    year,
    adult = 'false',
    autoTrad 
  } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.search(q.trim(), {
    type,
    page: parseInt(page) || 1,
    pageSize: parseInt(limit || pageSize) || 20,
    lang,
    year: year ? parseInt(year) : null,
    includeAdult: adult === 'true'
  });

  // Traduction automatique si activée
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json(results);
}));

/**
 * GET /media/tmdb/search/movies
 * Rechercher uniquement des films
 */
router.get('/search/movies', asyncHandler(async (req, res) => {
  const { 
    q, 
    page = '1', 
    limit,
    pageSize = '20', 
    lang = 'fr-FR',
    year,
    autoTrad 
  } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchMovies(q.trim(), {
    page: parseInt(page) || 1,
    pageSize: parseInt(limit || pageSize) || 20,
    lang,
    year: year ? parseInt(year) : null
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json(results);
}));

/**
 * GET /media/tmdb/search/series
 * Rechercher uniquement des séries
 */
router.get('/search/series', asyncHandler(async (req, res) => {
  const { 
    q, 
    page = '1', 
    limit,
    pageSize = '20', 
    lang = 'fr-FR',
    year,
    autoTrad 
  } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchSeries(q.trim(), {
    page: parseInt(page) || 1,
    pageSize: parseInt(limit || pageSize) || 20,
    lang,
    year: year ? parseInt(year) : null
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS FILM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/movies/:id
 * Détails d'un film
 * 
 * Params :
 * - id (required) : ID TMDB du film
 * 
 * Query params :
 * - lang : Langue (défaut fr-FR)
 * - autoTrad : Activer la traduction automatique
 */
router.get('/movies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang = 'fr-FR', autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getMovie(id, { lang });

  // Traduction automatique si activée
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    type: 'movie',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS SÉRIE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/series/:id
 * Détails d'une série
 */
router.get('/series/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang = 'fr-FR', autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSeries(id, { lang });

  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    type: 'series',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// SAISON
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/series/:id/season/:season
 * Détails d'une saison
 */
router.get('/series/:id/season/:season', asyncHandler(async (req, res) => {
  const { id, season } = req.params;
  const { lang = 'fr-FR', autoTrad } = req.query;

  if (!id || !season) {
    throw new ValidationError('Les paramètres "id" et "season" sont requis');
  }

  const seasonNumber = parseInt(season);
  if (isNaN(seasonNumber)) {
    throw new ValidationError('Le numéro de saison doit être un nombre');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSeason(id, seasonNumber, { lang });

  // Traduire overview de la saison
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  // Traduire les descriptions des épisodes si autoTrad activé (format canonique)
  if (autoTradEnabled && targetLang && result.details?.episodes?.length > 0) {
    result = {
      ...result,
      details: {
        ...result.details,
        episodes: await Promise.all(
          result.details.episodes.map(async (ep) => {
            if (ep.description) {
              const { text, translated } = await translateText(ep.description, targetLang, { enabled: true });
              if (translated) {
                return { ...ep, description: text, details: { ...ep.details, descriptionOriginal: ep.description, descriptionTranslated: true } };
              }
            }
            return ep;
          })
        )
      }
    };
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    type: 'season',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled,
      seriesId: id,
      seasonNumber
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// ÉPISODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/series/:id/season/:season/episode/:episode
 * Détails d'un épisode
 */
router.get('/series/:id/season/:season/episode/:episode', asyncHandler(async (req, res) => {
  const { id, season, episode } = req.params;
  const { lang = 'fr-FR', autoTrad } = req.query;

  if (!id || !season || !episode) {
    throw new ValidationError('Les paramètres "id", "season" et "episode" sont requis');
  }

  const seasonNumber = parseInt(season);
  const episodeNumber = parseInt(episode);
  
  if (isNaN(seasonNumber) || isNaN(episodeNumber)) {
    throw new ValidationError('Les numéros de saison et épisode doivent être des nombres');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getEpisode(id, seasonNumber, episodeNumber, { lang });

  // Traduire description (format canonique)
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    type: 'episode',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled,
      seriesId: id,
      seasonNumber,
      episodeNumber
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// COLLECTION / SAGA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/collections/:id
 * Détails d'une collection/saga avec la liste des films
 */
router.get('/collections/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang = 'fr-FR', autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getCollection(id, { lang });

  // Traduire la description de la collection (format canonique)
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  // Traduire les descriptions des films de la collection
  if (autoTradEnabled && targetLang && result.details?.parts?.length > 0) {
    result = {
      ...result,
      details: {
        ...result.details,
        parts: await Promise.all(
          result.details.parts.map(async (movie) => {
            if (movie.description) {
              const { text, translated } = await translateText(movie.description, targetLang, { enabled: true });
              if (translated) {
                return { ...movie, descriptionOriginal: movie.description, description: text };
              }
            }
            return movie;
          })
        )
      }
    };
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    type: 'collection',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// PERSONNE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/persons/:id
 * Détails d'une personne (acteur, réalisateur, etc.)
 */
router.get('/persons/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang = 'fr-FR', autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getPerson(id, { lang });

  // Traduire la biographie (= description en format canonique)
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    type: 'person',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RÉALISATEUR -> FILMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/directors/:id/movies
 * Liste des films réalisés par une personne
 */
router.get('/directors/:id/movies', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang = 'fr-FR', autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const result = await provider.getDirectorMovies(id, { lang });

  // Traduire les overviews des films si autoTrad activé
  // Note: les films dans getDirectorMovies n'ont pas d'overview complet
  // On pourrait l'ajouter si nécessaire

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    type: 'director_filmography',
    query: null,
    total: result.total,
    count: result.movies.length,
    data: result.movies,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      directorId: id,
      director: result.person,
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVER (Bonus)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/discover/movies
 * Découvrir des films selon critères
 * 
 * Query params :
 * - page : Page (défaut 1)
 * - sortBy : Tri (popularity.desc, release_date.desc, vote_average.desc)
 * - year : Année de sortie
 * - genre : ID du genre
 * - lang : Langue (défaut fr-FR)
 */
router.get('/discover/movies', asyncHandler(async (req, res) => {
  const { 
    page = '1', 
    sortBy = 'popularity.desc',
    year,
    genre,
    lang = 'fr-FR',
    autoTrad
  } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.discoverMovies({
    page: parseInt(page) || 1,
    sortBy,
    year: year ? parseInt(year) : null,
    genre,
    lang
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// TRENDING / POPULAR / TOP RATED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/trending
 * Films ou séries trending (populaires du moment)
 * 
 * Query params :
 * - category : movie | tv (défaut movie)
 * - period : day | week (défaut week)
 * - limit : Nombre de résultats (défaut 20, max 100)
 * - page : Page (défaut 1)
 * - lang : Langue (défaut fr-FR)
 * - autoTrad : Activer traduction auto (1 ou true)
 * 
 * Exemples :
 * - /media/tmdb/trending?category=movie&period=week
 * - /media/tmdb/trending?category=tv&period=day&limit=10
 */
router.get('/trending', asyncHandler(async (req, res) => {
  const {
    category = 'movie',
    period = 'week',
    limit = '20',
    page = '1',
    lang = 'fr-FR',
    autoTrad
  } = req.query;

  // Validation
  if (!['movie', 'tv'].includes(category)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category',
      message: 'category must be "movie" or "tv"',
      hint: 'Example: /media/tmdb/trending?category=movie&period=week'
    });
  }

  if (!['day', 'week'].includes(period)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid period',
      message: 'period must be "day" or "week"',
      hint: 'Example: /media/tmdb/trending?category=movie&period=week'
    });
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 100);
  const pageNum = parseInt(page) || 1;

  // === CACHE INTEGRATION ===
  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'tmdb',
    endpoint: 'trending',
    fetchFn: async () => {
      return await provider.getTrending(category, period, {
        limit: limitNum,
        lang,
        page: pageNum
      });
    },
    cacheOptions: {
      category,
      period,
      page: pageNum,
      ttl: getTTL('trending')
    }
  });

  // Traduction automatique si activée
  let translatedResults = results;
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    translatedResults = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    endpoint: 'trending',
    ...translatedResults,
    meta: {
      fetchedAt: new Date().toISOString(),
      category,
      period,
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * GET /media/tmdb/popular
 * Films ou séries populaires
 * 
 * Query params :
 * - category : movie | tv (défaut movie)
 * - limit : Nombre de résultats (défaut 20, max 100)
 * - page : Page (défaut 1)
 * - lang : Langue (défaut fr-FR)
 * - autoTrad : Activer traduction auto (1 ou true)
 * 
 * Exemples :
 * - /media/tmdb/popular?category=movie
 * - /media/tmdb/popular?category=tv&limit=50
 */
router.get('/popular', asyncHandler(async (req, res) => {
  const {
    category = 'movie',
    limit = '20',
    page = '1',
    lang = 'fr-FR',
    autoTrad
  } = req.query;

  // Validation
  if (!['movie', 'tv'].includes(category)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category',
      message: 'category must be "movie" or "tv"',
      hint: 'Example: /media/tmdb/popular?category=movie'
    });
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 100);
  const pageNum = parseInt(page) || 1;

  // === CACHE INTEGRATION ===
  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'tmdb',
    endpoint: 'popular',
    fetchFn: async () => {
      return await provider.getPopular(category, {
        limit: limitNum,
        lang,
        page: pageNum
      });
    },
    cacheOptions: {
      category,
      page: pageNum,
      ttl: getTTL('popular')
    }
  });

  // Traduction automatique si activée
  let translatedResults = results;
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    translatedResults = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    endpoint: 'popular',
    ...translatedResults,
    meta: {
      fetchedAt: new Date().toISOString(),
      category,
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * GET /media/tmdb/top-rated
 * Films ou séries les mieux notés
 * 
 * Query params :
 * - category : movie | tv (défaut movie)
 * - limit : Nombre de résultats (défaut 20, max 100)
 * - page : Page (défaut 1)
 * - lang : Langue (défaut fr-FR)
 * - autoTrad : Activer traduction auto (1 ou true)
 * 
 * Exemples :
 * - /media/tmdb/top-rated?category=movie
 * - /media/tmdb/top-rated?category=tv&limit=30
 */
router.get('/top-rated', asyncHandler(async (req, res) => {
  const {
    category = 'movie',
    limit = '20',
    page = '1',
    lang = 'fr-FR',
    autoTrad
  } = req.query;

  // Validation
  if (!['movie', 'tv'].includes(category)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category',
      message: 'category must be "movie" or "tv"',
      hint: 'Example: /media/tmdb/top-rated?category=movie'
    });
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 100);
  const pageNum = parseInt(page) || 1;

  // === CACHE INTEGRATION ===
  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'tmdb',
    endpoint: 'top-rated',
    fetchFn: async () => {
      return await provider.getTopRated(category, {
        limit: limitNum,
        lang,
        page: pageNum
      });
    },
    cacheOptions: {
      category,
      page: pageNum,
      ttl: getTTL('top-rated')
    }
  });

  // Traduction automatique si activée
  let translatedResults = results;
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    translatedResults = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    endpoint: 'top-rated',
    ...translatedResults,
    meta: {
      fetchedAt: new Date().toISOString(),
      category,
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// UPCOMING / À VENIR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tmdb/upcoming
 * Contenus à venir (upcoming)
 * - Movies: Films à sortir au cinéma
 * - TV: Séries jamais diffusées (first_air_date >= today)
 * 
 * Query params:
 * - category: movie ou tv (défaut: movie)
 * - limit: Nombre de résultats (défaut: 20, max: 100)
 * - page: Page de résultats (défaut: 1)
 * - lang: Code langue (défaut: fr-FR)
 * - autoTrad: Activer traduction automatique (1 ou true)
 */
router.get('/upcoming', asyncHandler(async (req, res) => {
  const {
    category = 'movie',
    limit = '20',
    page = '1',
    lang = 'fr-FR',
    autoTrad
  } = req.query;

  // Validation
  if (!['movie', 'tv'].includes(category)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid category',
      message: 'category must be "movie" or "tv"',
      hint: 'Example: /media/tmdb/upcoming?category=movie'
    });
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 100);
  const pageNum = parseInt(page) || 1;

  // === CACHE INTEGRATION ===
  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'tmdb',
    endpoint: 'upcoming',
    fetchFn: async () => {
      return await provider.getUpcoming(category, {
        limit: limitNum,
        lang,
        page: pageNum
      });
    },
    cacheOptions: {
      category,
      page: pageNum,
      ttl: getTTL('upcoming')
    }
  });

  // Traduction automatique si activée
  let translatedResults = results;
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    translatedResults = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    endpoint: 'upcoming',
    ...translatedResults,
    meta: {
      fetchedAt: new Date().toISOString(),
      category,
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * GET /media/tmdb/on-the-air
 * Séries en cours de diffusion (7 prochains jours)
 * Nouveaux épisodes qui seront diffusés dans les 7 prochains jours
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 100)
 * - page: Page de résultats (défaut: 1)
 * - lang: Code langue (défaut: fr-FR)
 * - autoTrad: Activer traduction automatique (1 ou true)
 */
router.get('/on-the-air', asyncHandler(async (req, res) => {
  const {
    limit = '20',
    page = '1',
    lang = 'fr-FR',
    autoTrad
  } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 100);
  const pageNum = parseInt(page) || 1;

  // === CACHE INTEGRATION ===
  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'tmdb',
    endpoint: 'upcoming',
    fetchFn: async () => {
      return await provider.getOnTheAir({
        limit: limitNum,
        lang,
        page: pageNum
      });
    },
    cacheOptions: {
      category: 'tv',
      period: 'on-the-air',
      page: pageNum,
      ttl: getTTL('upcoming')
    }
  });

  // Traduction automatique si activée
  let translatedResults = results;
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    translatedResults = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    endpoint: 'on-the-air',
    ...translatedResults,
    meta: {
      fetchedAt: new Date().toISOString(),
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * GET /media/tmdb/airing-today
 * Séries diffusées aujourd'hui
 * Épisodes de séries TV diffusés aujourd'hui
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 100)
 * - page: Page de résultats (défaut: 1)
 * - lang: Code langue (défaut: fr-FR)
 * - autoTrad: Activer traduction automatique (1 ou true)
 */
router.get('/airing-today', asyncHandler(async (req, res) => {
  const {
    limit = '20',
    page = '1',
    lang = 'fr-FR',
    autoTrad
  } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 100);
  const pageNum = parseInt(page) || 1;

  // === CACHE INTEGRATION ===
  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'tmdb',
    endpoint: 'upcoming',
    fetchFn: async () => {
      return await provider.getAiringToday({
        limit: limitNum,
        lang,
        page: pageNum
      });
    },
    cacheOptions: {
      category: 'tv',
      period: 'airing-today',
      page: pageNum,
      ttl: getTTL('upcoming')
    }
  });

  // Traduction automatique si activée
  let translatedResults = results;
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    translatedResults = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });
  }

  res.json({
    success: true,
    provider: 'tmdb',
    domain: 'media',
    endpoint: 'airing-today',
    ...translatedResults,
    meta: {
      fetchedAt: new Date().toISOString(),
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey
    }
  });
}));

export default router;
