/**
 * Routes TVDB
 * 
 * Endpoints pour l'API TheTVDB.
 * 
 * Routes disponibles :
 * - GET /health - Vérifier la disponibilité
 * - GET /search - Recherche (séries, films, personnes)
 * - GET /search/movies - Rechercher uniquement des films
 * - GET /search/series - Rechercher uniquement des séries
 * - GET /movies/:id - Détails d'un film
 * - GET /series/:id - Détails d'une série
 * - GET /series/:id/seasons - Liste des saisons
 * - GET /seasons/:id - Détails d'une saison
 * - GET /series/:id/episodes - Épisodes d'une série
 * - GET /episodes/:id - Détails d'un épisode
 * - GET /lists/:id - Détails d'une liste/saga
 * - GET /persons/:id - Détails d'une personne
 * - GET /directors/:id/works - Films/séries d'un réalisateur
 * 
 * Support traduction :
 * - lang : Code langue (fr, en, de, etc.)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */

import { Router } from 'express';
import { TvdbProvider } from '../providers/tvdb.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';
import {
  translateSearchResults,
  translateText,
  translateGenre,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';

const router = Router();
const provider = new TvdbProvider();

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
    provider: 'tvdb',
    status: isConfigured ? 'healthy' : 'unhealthy',
    message: isConfigured ? 'TVDB API configurée' : 'TVDB_API_KEY non configurée'
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tvdb/search
 * Recherche générale
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - type : Type (series, movie, person, company)
 * - pageSize : Résultats par page (max 50)
 * - lang : Langue
 * - year : Année de sortie
 * - autoTrad : Activer la traduction automatique
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { 
    q, 
    type, 
    limit,
    pageSize = '20', 
    lang,
    year,
    autoTrad 
  } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.search(q.trim(), {
    type: type || null,
    pageSize: parseInt(limit || pageSize) || 20,
    lang,
    year: year ? parseInt(year) : null
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
 * GET /media/tvdb/search/movies
 * Rechercher uniquement des films
 */
router.get('/search/movies', asyncHandler(async (req, res) => {
  const { q, limit, pageSize = '20', lang, year, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchMovies(q.trim(), {
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
 * GET /media/tvdb/search/series
 * Rechercher uniquement des séries
 */
router.get('/search/series', asyncHandler(async (req, res) => {
  const { q, limit, pageSize = '20', lang, year, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchSeries(q.trim(), {
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
 * GET /media/tvdb/movies/:id
 * Détails d'un film
 */
router.get('/movies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

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
    provider: 'tvdb',
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
 * GET /media/tvdb/series/:id
 * Détails d'une série
 */
router.get('/series/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSeries(id, { lang });

  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tvdb',
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
// SAISONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tvdb/series/:id/seasons
 * Liste des saisons d'une série
 */
router.get('/series/:id/seasons', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getSeriesSeasons(id, { lang });

  res.json({
    success: true,
    provider: 'tvdb',
    domain: 'media',
    type: 'seasons',
    query: null,
    total: result.total,
    count: result.seasons?.length || 0,
    data: result.seasons,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      seriesId: id,
      seriesName: result.seriesName
    }
  });
}));

/**
 * GET /media/tvdb/seasons/:id
 * Détails d'une saison (par ID TVDB de la saison)
 */
router.get('/seasons/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSeason(id, { lang });

  // Traduire description de la saison (format canonique)
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  // Traduire les descriptions des épisodes (format canonique : details.episodes)
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
    provider: 'tvdb',
    domain: 'media',
    type: 'season',
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
// ÉPISODES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tvdb/series/:id/episodes
 * Liste des épisodes d'une série
 */
router.get('/series/:id/episodes', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, season, page = '0', autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSeriesEpisodes(id, {
    lang,
    season: season ? parseInt(season) : null,
    page: parseInt(page) || 0
  });

  // Traduire les descriptions des épisodes (format canonique : ep.description)
  if (autoTradEnabled && targetLang && result.episodes?.length > 0) {
    result.episodes = await Promise.all(
      result.episodes.map(async (ep) => {
        if (ep.description) {
          const { text, translated } = await translateText(ep.description, targetLang, { enabled: true });
          if (translated) {
            return { ...ep, description: text, details: { ...ep.details, descriptionOriginal: ep.description, descriptionTranslated: true } };
          }
        }
        return ep;
      })
    );
  }

  res.json({
    success: true,
    provider: 'tvdb',
    domain: 'media',
    type: 'episodes',
    query: null,
    total: result.total,
    count: result.episodes?.length || 0,
    data: result.episodes,
    pagination: {
      page: parseInt(page) || 0,
      limit: result.episodes?.length || 0,
      hasMore: !!result.links?.next
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled,
      seriesId: id,
      season: season ? parseInt(season) : null
    }
  });
}));

/**
 * GET /media/tvdb/episodes/:id
 * Détails d'un épisode (par ID TVDB de l'épisode)
 */
router.get('/episodes/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getEpisode(id, { lang });

  // Traduire description (format canonique)
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tvdb',
    domain: 'media',
    type: 'episode',
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
// LISTES / SAGAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tvdb/lists/:id
 * Détails d'une liste/saga TVDB
 */
router.get('/lists/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getList(id, { lang });

  // Traduire description (format canonique)
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tvdb',
    domain: 'media',
    type: 'list',
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
// PERSONNES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /media/tvdb/persons/:id
 * Détails d'une personne
 */
router.get('/persons/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getPerson(id, { lang });

  // Extraire la biographie anglaise comme description si absente (format canonique)
  if (!result.description && result.details?.biographies?.length > 0) {
    const engBio = result.details.biographies.find(b => b.language === 'eng');
    if (engBio?.biography) {
      result = { ...result, description: engBio.biography };
    }
  }

  // Traduire description (biographie) si autoTrad activé
  result = await translateDetailResult(result, targetLang, autoTradEnabled);

  res.json({
    success: true,
    provider: 'tvdb',
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
 * GET /media/tvdb/directors/:id/works
 * Liste des films/séries réalisés par une personne
 */
router.get('/directors/:id/works', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getDirectorWorks(id, { lang });

  const allWorks = [...result.movies.map(m => ({ ...m, mediaType: 'movie' })), ...result.series.map(s => ({ ...s, mediaType: 'series' }))];

  res.json({
    success: true,
    provider: 'tvdb',
    domain: 'media',
    type: 'director_works',
    query: null,
    total: allWorks.length,
    count: allWorks.length,
    data: allWorks,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      directorId: id,
      director: result.person,
      totalMovies: result.totalMovies,
      totalSeries: result.totalSeries
    }
  });
}));

export default router;
