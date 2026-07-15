/**
 * Jikan Routes (MyAnimeList API)
 * 
 * Routes pour l'API Jikan - Anime et Manga.
 * 
 * IMPORTANT: Aucune restriction sur le contenu adulte/hentai.
 * Le paramètre sfw=false est TOUJOURS utilisé.
 * 
 * Endpoints:
 * - GET /health - Health check
 * 
 * RECHERCHE:
 * - GET /search - Recherche globale (anime + manga)
 * - GET /search/anime - Recherche anime
 * - GET /search/manga - Recherche manga
 * - GET /search/characters - Recherche personnages
 * - GET /search/people - Recherche personnes (seiyuu, staff)
 * - GET /search/producers - Recherche studios/producteurs
 * 
 * ANIME:
 * - GET /anime/:id - Détails d'un anime
 * - GET /anime/:id/episodes - Épisodes d'un anime
 * - GET /anime/:id/characters - Personnages d'un anime
 * - GET /anime/:id/staff - Staff d'un anime
 * - GET /anime/:id/recommendations - Recommandations
 * - GET /anime/random - Anime aléatoire
 * 
 * MANGA:
 * - GET /manga/:id - Détails d'un manga
 * - GET /manga/:id/characters - Personnages d'un manga
 * - GET /manga/:id/recommendations - Recommandations
 * - GET /manga/random - Manga aléatoire
 * 
 * SAISONS:
 * - GET /seasons - Liste des saisons disponibles
 * - GET /seasons/now - Saison actuelle
 * - GET /seasons/:year/:season - Anime d'une saison
 * 
 * TOP:
 * - GET /top/anime - Top anime
 * - GET /top/manga - Top manga
 * 
 * PLANNING:
 * - GET /schedules - Programme de diffusion
 * - GET /schedules/:day - Programme d'un jour
 * 
 * AUTRES:
 * - GET /genres/anime - Genres anime
 * - GET /genres/manga - Genres manga
 * - GET /characters/:id - Détails d'un personnage
 * - GET /people/:id - Détails d'une personne
 * - GET /producers/:id - Détails d'un studio/producteur
 * 
 * Support traduction:
 * - lang : Code langue cible (fr, en, de, etc.)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */

import { Router } from 'express';
import { JikanProvider } from '../providers/jikan.provider.js';
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
import { env } from '../../../config/env.js';

const router = Router();
const provider = new JikanProvider();

// Code langue par défaut (fr depuis fr-FR)
const DEFAULT_LANG = extractLangCode(env.defaultLocale);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrichit les résultats anime avec des backdrops depuis /pictures
 * @param {Array} data - Tableau de résultats anime
 * @returns {Promise<Array>} - Résultats enrichis avec backdrop
 */
async function enrichWithBackdrops(data) {
  return await provider.enrichAnimeWithBackdrops(data);
}

/**
 * Normalise le paramètre sfw en valeur canonique: 'all', 'sfw' ou 'nsfw'
 * Accepte: all/sfw/nsfw, true/false, 1/0
 */
function normalizeSfw(value) {
  if (!value || value === 'all') return 'all';
  if (value === 'nsfw' || value === '0' || value === 'false') return 'nsfw';
  if (value === 'sfw' || value === '1' || value === 'true') return 'sfw';
  return 'all';
}

/**
 * Normalise la pagination brute Jikan en format B { page, limit, hasMore }
 */
function normalizeJikanPagination(raw) {
  if (!raw) return null;
  return {
    page: raw.current_page || raw.page || 1,
    limit: raw.items?.per_page || raw.limit || 25,
    hasMore: raw.has_next_page || raw.hasMore || false
  };
}

/**
 * Traduit les champs d'un résultat détaillé (Format B canonique)
 * - description (anciennement synopsis / about)
 * - details.background (anciennement background plat)
 * - details.genres (tableau de strings, anciennement objets avec .name)
 */
async function translateDetailResult(result, targetLang, autoTradEnabled) {
  if (!autoTradEnabled || !targetLang || !result) return result;

  const translated = { ...result };

  // Traduire description si présent (anciennement synopsis / about)
  if (result.description) {
    const { text, translated: wasTranslated } = await translateText(result.description, targetLang, { enabled: true });
    if (wasTranslated) {
      translated.details = { ...translated.details, descriptionOriginal: result.description, descriptionTranslated: true };
      translated.description = text;
    }
  }

  // Traduire details.background si présent
  if (result.details?.background) {
    const { text, translated: wasTranslated } = await translateText(result.details.background, targetLang, { enabled: true });
    if (wasTranslated) {
      translated.details = translated.details || {};
      translated.details.backgroundOriginal = result.details.background;
      translated.details.background = text;
      translated.details.backgroundTranslated = true;
    }
  }

  // Traduire les genres (objets {id, name, url} dans details.genres)
  if (result.details?.genres?.length > 0) {
    const genreObjects = result.details.genres;
    const genreNames = genreObjects.map(g => typeof g === 'object' ? (g.name || g) : g);
    const translatedGenres = await Promise.all(
      genreNames.map(name => translateGenre(name, targetLang))
    );
    const wasTranslatedGenres = translatedGenres.some((g, i) => g !== genreNames[i]);
    if (wasTranslatedGenres) {
      translated.details = translated.details || {};
      translated.details.genresOriginal = genreObjects;
      translated.details.genres = genreObjects.map((obj, i) =>
        typeof obj === 'object' ? { ...obj, name: translatedGenres[i] } : translatedGenres[i]
      );
      translated.details.genresTranslated = true;
    }
  }

  return translated;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/health
 * Health check
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.json({
    provider: 'jikan',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message,
    features: [
      'Recherche anime/manga SANS restriction adulte',
      'Détails complets avec épisodes, personnages, staff',
      'Saisons anime par année',
      'Top anime/manga',
      'Programme de diffusion',
      'Traduction automatique optionnelle'
    ],
    note: 'Contenu adulte/hentai NON filtré (sfw=false)'
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/search
 * Recherche globale (anime + manga)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, type, page = 1, maxResults = 20, lang, autoTrad } = req.query;

  if (!q) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.search(q, {
    type: type || 'all',
    page: parseInt(page),
    maxResults: parseInt(maxResults)
  });

  // Traduction des descriptions si autoTrad activé
  if (autoTradEnabled && targetLang) {
    result = await translateSearchResults(result, targetLang, {
      fieldsToTranslate: ['description'],
      enabled: true
    });
  }

  res.json(result);
}));

/**
 * GET /anime-manga/jikan/search/anime
 * Recherche anime
 */
router.get('/search/anime', asyncHandler(async (req, res) => {
  const { 
    q, 
    page = 1, 
    limit,
    maxResults = 25,
    type,       // tv, movie, ova, special, ona, music
    status,     // airing, complete, upcoming
    rating,     // g, pg, pg13, r17, r, rx
    minScore,
    year,
    season,
    genres,
    orderBy,
    sort,
    sfw: sfwRaw = 'all',  // all (défaut), sfw (sans hentai), nsfw (hentai uniquement)
    lang, 
    autoTrad 
  } = req.query;

  if (!q) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.searchAnime(q, {
    page: parseInt(page),
    maxResults: parseInt(limit || maxResults),
    type,
    status,
    rating,
    minScore: minScore ? parseFloat(minScore) : null,
    year: year ? parseInt(year) : null,
    season,
    genres,
    orderBy,
    sort,
    sfw  // Passer le paramètre sfw au provider
  });

  // Traduction automatique appliquée sur les résultats (multi-langues)
  if (autoTradEnabled && targetLang && result.data) {
    result.data = await translateSearchResults(result.data, true, targetLang);
  }

  res.json(result);
}));

/**
 * GET /anime-manga/jikan/search/manga
 * Recherche manga
 */
router.get('/search/manga', asyncHandler(async (req, res) => {
  const { 
    q, 
    page = 1, 
    limit,
    maxResults = 25,
    type,       // manga, novel, lightnovel, oneshot, doujin, manhwa, manhua
    status,     // publishing, complete, hiatus, discontinued, upcoming
    minScore,
    genres,
    orderBy,
    sort,
    sfw: sfwRaw = 'all',  // all (défaut), sfw (sans hentai), nsfw (hentai uniquement)
    lang, 
    autoTrad 
  } = req.query;

  if (!q) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.searchManga(q, {
    page: parseInt(page),
    maxResults: parseInt(limit || maxResults),
    type,
    status,
    minScore: minScore ? parseFloat(minScore) : null,
    genres,
    orderBy,
    sort,
    sfw  // Passer le paramètre sfw au provider
  });

  // Traduction automatique appliquée sur les résultats (multi-langues)
  if (autoTradEnabled && targetLang && result.data) {
    result.data = await translateSearchResults(result.data, true, targetLang);
  }

  res.json(result);
}));

/**
 * GET /anime-manga/jikan/search/characters
 * Recherche personnages
 */
router.get('/search/characters', asyncHandler(async (req, res) => {
  const { q, page = 1, limit, maxResults = 25, lang, autoTrad } = req.query;

  if (!q) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.searchCharacters(q, {
    page: parseInt(page),
    maxResults: parseInt(limit || maxResults)
  });

  // Traduction automatique appliquée sur les résultats (multi-langues)
  if (autoTradEnabled && targetLang && result.data) {
    result.data = await translateSearchResults(result.data, true, targetLang);
  }

  res.json(result);
}));

/**
 * GET /anime-manga/jikan/search/people
 * Recherche personnes (seiyuu, staff)
 */
router.get('/search/people', asyncHandler(async (req, res) => {
  const { q, page = 1, limit, maxResults = 25, lang, autoTrad } = req.query;

  if (!q) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.searchPeople(q, {
    page: parseInt(page),
    maxResults: parseInt(limit || maxResults)
  });

  // Traduction automatique appliquée sur les résultats (multi-langues)
  if (autoTradEnabled && targetLang && result.data) {
    result.data = await translateSearchResults(result.data, true, targetLang);
  }

  res.json(result);
}));

/**
 * GET /anime-manga/jikan/search/producers
 * Recherche studios/producteurs
 */
router.get('/search/producers', asyncHandler(async (req, res) => {
  const { q, page = 1, limit, maxResults = 25, lang, autoTrad } = req.query;

  if (!q) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.searchProducers(q, {
    page: parseInt(page),
    maxResults: parseInt(limit || maxResults)
  });

  // Traduction automatique appliquée sur les résultats (multi-langues)
  if (autoTradEnabled && targetLang && result.data) {
    result.data = await translateSearchResults(result.data, true, targetLang);
  }

  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════════════
// ANIME
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/anime/random
 * Anime aléatoire
 */
router.get('/anime/random', asyncHandler(async (req, res) => {
  const { lang, autoTrad } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getRandomAnime();

  if (autoTradEnabled && targetLang) {
    result = await translateDetailResult(result, targetLang, autoTradEnabled);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'anime',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré'
    }
  });
}));

/**
 * GET /anime-manga/jikan/anime/:id
 * Détails d'un anime
 */
router.get('/anime/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getAnime(id);

  if (autoTradEnabled && targetLang) {
    result = await translateDetailResult(result, targetLang, autoTradEnabled);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'anime',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

/**
 * GET /anime-manga/jikan/anime/:id/episodes
 * Épisodes d'un anime
 */
router.get('/anime/:id/episodes', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1 } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getAnimeEpisodes(id, { page: parseInt(page) });

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'episodes',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: result.pagination,
    meta: {
      ...result.meta,
      animeId: id
    }
  });
}));

/**
 * GET /anime-manga/jikan/anime/:id/characters
 * Personnages d'un anime
 */
router.get('/anime/:id/characters', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getAnimeCharacters(id);

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'characters',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: null,
    meta: {
      ...result.meta,
      animeId: id
    }
  });
}));

/**
 * GET /anime-manga/jikan/anime/:id/staff
 * Staff d'un anime
 */
router.get('/anime/:id/staff', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getAnimeStaff(id);

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'staff',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: null,
    meta: {
      ...result.meta,
      animeId: id
    }
  });
}));

/**
 * GET /anime-manga/jikan/anime/:id/recommendations
 * Recommandations pour un anime
 */
router.get('/anime/:id/recommendations', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getAnimeRecommendations(id);

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'recommendations',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: null,
    meta: {
      ...result.meta,
      animeId: id
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// MANGA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/manga/random
 * Manga aléatoire
 */
router.get('/manga/random', asyncHandler(async (req, res) => {
  const { lang, autoTrad } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getRandomManga();

  if (autoTradEnabled && targetLang) {
    result = await translateDetailResult(result, targetLang, autoTradEnabled);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'manga',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré'
    }
  });
}));

/**
 * GET /anime-manga/jikan/manga/:id
 * Détails d'un manga
 */
router.get('/manga/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getManga(id);

  if (autoTradEnabled && targetLang) {
    result = await translateDetailResult(result, targetLang, autoTradEnabled);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'manga',
    id: result.id,
    data: result,
    meta: {
      fetchedAt: new Date().toISOString(),
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

/**
 * GET /anime-manga/jikan/manga/:id/characters
 * Personnages d'un manga
 */
router.get('/manga/:id/characters', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getMangaCharacters(id);

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'characters',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: null,
    meta: {
      ...result.meta,
      mangaId: id
    }
  });
}));

/**
 * GET /anime-manga/jikan/manga/:id/recommendations
 * Recommandations pour un manga
 */
router.get('/manga/:id/recommendations', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const result = await provider.getMangaRecommendations(id);

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'recommendations',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: null,
    meta: {
      ...result.meta,
      mangaId: id
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// SAISONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/seasons
 * Liste des saisons disponibles
 */
router.get('/seasons', asyncHandler(async (req, res) => {
  const result = await provider.getSeasonsList();

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'seasons-list',
    query: null,
    total: result.total,
    count: result.data?.length || 0,
    data: result.data,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

/**
 * GET /anime-manga/jikan/seasons/now
 * Saison actuelle
 */
router.get('/seasons/now', asyncHandler(async (req, res) => {
  const { page = 1, filter, lang, autoTrad } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getCurrentSeason({
    page: parseInt(page),
    filter
  });

  if (autoTradEnabled && targetLang) {
    result = await translateSearchResults(result, targetLang, {
      fieldsToTranslate: ['description'],
      enabled: true
    });
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'season',
    query: null,
    ...result,
    meta: {
      ...result.meta,
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré'
    }
  });
}));

/**
 * GET /anime-manga/jikan/seasons/:year/:season
 * Anime d'une saison spécifique
 */
router.get('/seasons/:year/:season', asyncHandler(async (req, res) => {
  const { year, season } = req.params;
  const { page = 1, filter, lang, autoTrad } = req.query;

  if (!year || !season) {
    throw new ValidationError('Les paramètres "year" et "season" sont requis');
  }

  const validSeasons = ['winter', 'spring', 'summer', 'fall'];
  if (!validSeasons.includes(season.toLowerCase())) {
    throw new ValidationError(`Saison invalide. Valeurs acceptées: ${validSeasons.join(', ')}`);
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSeason(parseInt(year), season.toLowerCase(), {
    page: parseInt(page),
    filter
  });

  if (autoTradEnabled && targetLang) {
    result = await translateSearchResults(result, targetLang, {
      fieldsToTranslate: ['description'],
      enabled: true
    });
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'season',
    query: null,
    ...result,
    meta: {
      ...result.meta,
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré'
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TOP / CLASSEMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/top/anime
 * Top anime
 */
router.get('/top/anime', asyncHandler(async (req, res) => {
  const { page = 1, type, filter, lang, autoTrad } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const { data: result, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'top',
    fetchFn: async () => {
      let result = await provider.getTopAnime({
        page: parseInt(page),
        type,
        filter
      });

      if (autoTradEnabled && targetLang) {
        result = await translateSearchResults(result, targetLang, {
          fieldsToTranslate: ['description'],
          enabled: true
        });
      }
      return result;
    },
    cacheOptions: {
      category: 'anime',
      page: parseInt(page),
      ttl: getTTL('trending')
    }
  });

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'top-anime',
    query: null,
    ...result,
    meta: {
      ...result.meta,
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré',
      cached: fromCache,
      cacheKey
    }
  });
}));

/**
 * GET /anime-manga/jikan/top/manga
 * Top manga
 */
router.get('/top/manga', asyncHandler(async (req, res) => {
  const { page = 1, type, filter, lang, autoTrad } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const { data: result, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'top',
    fetchFn: async () => {
      let result = await provider.getTopManga({
        page: parseInt(page),
        type,
        filter
      });

      return result;
    },
    cacheOptions: {
      category: 'manga',
      page: parseInt(page),
      ttl: getTTL('trending')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && result.data) {
    result.data = await translateSearchResults(result.data, true, targetLang);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'top-manga',
    query: null,
    ...result,
    meta: {
      ...result.meta,
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré',
      cached: fromCache,
      cacheKey,
      translated: needsTranslation
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// PLANNING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/schedules
 * Programme de diffusion complet
 */
router.get('/schedules', asyncHandler(async (req, res) => {
  const { page = 1, lang, autoTrad } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSchedules(null, { page: parseInt(page) });

  if (autoTradEnabled && targetLang) {
    result = await translateSearchResults(result, targetLang, {
      fieldsToTranslate: ['description'],
      enabled: true
    });
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'schedule',
    query: null,
    ...result,
    meta: {
      ...result.meta,
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré'
    }
  });
}));

/**
 * GET /anime-manga/jikan/schedules/:day
 * Programme d'un jour spécifique
 */
router.get('/schedules/:day', asyncHandler(async (req, res) => {
  const { day } = req.params;
  const { page = 1, lang, autoTrad } = req.query;

  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'unknown', 'other'];
  if (!validDays.includes(day.toLowerCase())) {
    throw new ValidationError(`Jour invalide. Valeurs acceptées: ${validDays.join(', ')}`);
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getSchedules(day.toLowerCase(), { page: parseInt(page) });

  if (autoTradEnabled && targetLang) {
    result = await translateSearchResults(result, targetLang, {
      fieldsToTranslate: ['description'],
      enabled: true
    });
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'schedule',
    query: null,
    ...result,
    meta: {
      ...result.meta,
      lang,
      autoTrad: autoTradEnabled,
      note: 'Contenu adulte NON filtré'
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// GENRES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/genres/anime
 * Genres anime
 */
router.get('/genres/anime', asyncHandler(async (req, res) => {
  const result = await provider.getAnimeGenres();

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'genres',
    contentType: 'anime',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: null,
    meta: result.meta
  });
}));

/**
 * GET /anime-manga/jikan/genres/manga
 * Genres manga
 */
router.get('/genres/manga', asyncHandler(async (req, res) => {
  const result = await provider.getMangaGenres();

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'genres',
    contentType: 'manga',
    query: null,
    total: result.total,
    count: result.count,
    data: result.data,
    pagination: null,
    meta: result.meta
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// PERSONNAGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/characters/:id
 * Détails d'un personnage
 */
router.get('/characters/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getCharacter(id);

  if (autoTradEnabled && targetLang) {
    result = await translateDetailResult(result, targetLang, autoTradEnabled);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'character',
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
 * GET /anime-manga/jikan/people/:id
 * Détails d'une personne (seiyuu, staff)
 */
router.get('/people/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getPerson(id);

  if (autoTradEnabled && targetLang) {
    result = await translateDetailResult(result, targetLang, autoTradEnabled);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
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
// PRODUCTEURS / STUDIOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/producers/:id
 * Détails d'un studio/producteur
 */
router.get('/producers/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('Le paramètre "id" est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getProducer(id);

  if (autoTradEnabled && targetLang) {
    result = await translateDetailResult(result, targetLang, autoTradEnabled);
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    type: 'producer',
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
// TOP / TRENDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/top
 * Top anime ou manga par popularité/note/favoris
 * 
 * Query params:
 * - type: anime | manga (défaut: anime)
 * - filter: bypopularity | favorite | airing | publishing (défaut: bypopularity)
 * - subtype: tv, movie, ova, special, etc. (optionnel)
 * - limit: Nombre de résultats (défaut: 25, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction auto (1 ou true)
 * 
 * Exemples:
 * - /anime-manga/jikan/top?type=anime&filter=bypopularity
 * - /anime-manga/jikan/top?type=manga&filter=favorite&limit=10
 */
router.get('/top', asyncHandler(async (req, res) => {
  const {
    type = 'anime',
    filter = 'bypopularity',
    subtype = null,
    limit = '25',
    page = '1',
    lang,
    autoTrad
  } = req.query;

  // Validation
  if (!['anime', 'manga'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid type',
      message: 'type must be "anime" or "manga"',
      hint: 'Example: /anime-manga/jikan/top?type=anime&filter=bypopularity'
    });
  }

  const validFilters = ['bypopularity', 'favorite', 'airing', 'publishing'];
  if (filter && !validFilters.includes(filter)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid filter',
      message: `filter must be one of: ${validFilters.join(', ')}`,
      hint: 'Example: /anime-manga/jikan/top?type=anime&filter=bypopularity'
    });
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 25, 25);
  const pageNum = parseInt(page) || 1;

  let results = await provider.getTop(type, {
    limit: limitNum,
    page: pageNum,
    filter,
    subtype
  });

  // Traduction automatique si activée
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'top',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      type,
      filter,
      subtype,
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

/**
 * GET /anime-manga/jikan/trending
 * Anime de la saison en cours (trending)
 * 
 * Query params:
 * - filter: tv, movie, ova, special, ona, music (optionnel)
 * - limit: Nombre de résultats (défaut: 25, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction auto (1 ou true)
 * 
 * Exemples:
 * - /anime-manga/jikan/trending
 * - /anime-manga/jikan/trending?filter=tv&limit=10
 */
router.get('/trending', asyncHandler(async (req, res) => {
  const {
    filter = null,
    limit = '25',
    page = '1',
    lang,
    autoTrad
  } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 25, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'trending',
    fetchFn: async () => {
      let results = await provider.getCurrentSeason({
        limit: limitNum,
        page: pageNum,
        filter
      });

      // Traduction automatique si activée
      if (autoTradEnabled && targetLang && results.data?.length > 0) {
        results.data = await Promise.all(
          results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
        );
      }
      return results;
    },
    cacheOptions: {
      category: filter || 'all',
      page: pageNum,
      ttl: getTTL('trending')
    }
  });

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'trending',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      season: results.season,
      year: results.year,
      filter,
      limit: limitNum,
      page: pageNum,
      cached: fromCache,
      cacheKey,
      lang,
      autoTrad: autoTradEnabled
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// UPCOMING / À VENIR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/jikan/upcoming
 * Anime à venir (prochaine saison)
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 25, max: 25)
 * - page: Page de résultats (défaut: 1)
 * - filter: Filtre optionnel (tv, movie, ova, special, ona, music)
 * - lang: Code langue cible (défaut: fr)
 * - autoTrad: Activer traduction automatique (1 ou true)
 */
router.get('/upcoming', asyncHandler(async (req, res) => {
  const {
    limit = '25',
    page = '1',
    filter = null,
    lang = 'fr',
    autoTrad
  } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 25, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'upcoming',
    fetchFn: async () => {
      let results = await provider.getUpcoming({
        limit: limitNum,
        page: pageNum,
        filter
      });

      // Traduction automatique si activée
      if (autoTradEnabled && targetLang && results.data?.length > 0) {
        results.data = await Promise.all(
          results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
        );
      }
      return results;
    },
    cacheOptions: {
      category: filter || 'all',
      page: pageNum,
      ttl: getTTL('upcoming')
    }
  });

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'upcoming',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      filter,
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
 * GET /anime-manga/jikan/trending/tv
 * Séries anime de la saison en cours (trending TV)
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - sfw: Filtre contenu - 'all' (tout), 'sfw' (sans hentai), 'nsfw' (hentai uniquement) - défaut: 'all'
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction (1 ou true)
 */
router.get('/trending/tv', asyncHandler(async (req, res) => {
  const {
    limit = '20',
    page = '1',
    sfw: sfwRaw = 'all',
    lang,
    autoTrad
  } = req.query;

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'trending',
    fetchFn: async () => {
      let results = await provider.getCurrentSeason({
        limit: limitNum,
        page: pageNum,
        filter: sfw === 'nsfw' ? null : 'tv',  // Pas de filtre type pour NSFW (hentai = OVA/ONA)
        sfw
      });

      // Enrichir avec backdrops depuis /pictures
      results.data = await enrichWithBackdrops(results.data);

      return results;
    },
    cacheOptions: {
      category: 'tv',
      sfw,  // Inclure sfw dans la clé de cache
      page: pageNum,
      ttl: getTTL('trending')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'trending',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      season: results.season,
      year: results.year,
      category: 'tv',
      sfw,
      limit: limitNum,
      page: pageNum,
      cached: fromCache,
      cacheKey,
      lang,
      autoTrad: autoTradEnabled,
      translated: needsTranslation
    }
  });
}));

/**
 * GET /anime-manga/jikan/trending/movie
 * Films anime de la saison en cours (trending movies)
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction (1 ou true)
 */
router.get('/trending/movie', asyncHandler(async (req, res) => {
  const {
    limit = '20',
    page = '1',
    sfw: sfwRaw = 'all',
    lang,
    autoTrad
  } = req.query;

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'trending',
    fetchFn: async () => {
      let results = await provider.getCurrentSeason({
        limit: limitNum,
        page: pageNum,
        filter: sfw === 'nsfw' ? null : 'movie',  // Pas de filtre type pour NSFW
        sfw
      });

      // Enrichir avec backdrops depuis /pictures
      results.data = await enrichWithBackdrops(results.data);

      return results;
    },
    cacheOptions: {
      category: 'movie',
      sfw,  // Inclure sfw dans la clé de cache
      page: pageNum,
      ttl: getTTL('trending')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'trending',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      season: results.season,
      year: results.year,
      category: 'movie',
      limit: limitNum,
      page: pageNum,
      cached: fromCache,
      cacheKey,
      lang,
      autoTrad: autoTradEnabled,
      translated: needsTranslation
    }
  });
}));

/**
 * GET /anime-manga/jikan/trending/anime
 * Tous les anime de la saison en cours (trending anime - alias de /trending avec enrichissement)
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - sfw: Filtre contenu - 'all'|'sfw'|'nsfw'|true|false|1|0 - défaut: 'all'
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction (1 ou true)
 */
router.get('/trending/anime', asyncHandler(async (req, res) => {
  const {
    limit = '20',
    page = '1',
    sfw: sfwRaw = 'all',
    lang,
    autoTrad
  } = req.query;

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'trending',
    fetchFn: async () => {
      let results = await provider.getCurrentSeason({
        limit: limitNum,
        page: pageNum,
        filter: null,  // Pas de filtre type - tous les anime
        sfw
      });

      // Enrichir avec backdrops depuis /pictures
      results.data = await enrichWithBackdrops(results.data);

      return results;
    },
    cacheOptions: {
      category: 'anime',
      sfw,
      page: pageNum,
      ttl: getTTL('trending')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'trending',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      season: results.season,
      year: results.year,
      category: 'anime',
      sfw,
      limit: limitNum,
      page: pageNum,
      cached: fromCache,
      cacheKey,
      lang,
      autoTrad: autoTradEnabled,
      translated: needsTranslation
    }
  });
}));

/**
 * GET /anime-manga/jikan/top/tv
 * Top séries anime
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - filter: bypopularity, favorite, airing (défaut: bypopularity)
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction (1 ou true)
 */
router.get('/top/tv', asyncHandler(async (req, res) => {
  const {
    filter = 'bypopularity',
    limit = '20',
    page = '1',
    sfw: sfwRaw = 'all',
    lang,
    autoTrad
  } = req.query;

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'top',
    fetchFn: async () => {
      let allResults = [];
      let currentPage = pageNum;
      
      // Pour NSFW, on fetch plusieurs pages jusqu'à avoir assez de séries (3+ épisodes)
      if (sfw === 'nsfw') {
        const maxPages = 3;  // Maximum 3 pages (75 résultats potentiels)
        
        while (allResults.length < limitNum && currentPage <= pageNum + maxPages - 1) {
          const results = await provider.getTop('anime', {
            limit: 25,  // Max Jikan
            page: currentPage,
            filter,
            subtype: null,  // Pas de subtype pour NSFW (hentai = OVA/ONA)
            sfw
          });
          
          if (!results.data || results.data.length === 0) break;
          
          // Filtrer les séries (3+ épisodes)
          const filtered = results.data.filter(item => {
            const episodes = item.episodes || 0;
            return episodes >= 3;
          });
          
          allResults.push(...filtered);
          currentPage++;
        }
        
        allResults = allResults.slice(0, limitNum);
      } else {
        // Mode normal (sfw ou all)
        const results = await provider.getTop('anime', {
          limit: limitNum,
          page: pageNum,
          filter,
          subtype: 'tv',
          sfw
        });
        allResults = results.data || [];
      }

      // Enrichir avec backdrops depuis /pictures
      allResults = await enrichWithBackdrops(allResults);

      return { data: allResults };
    },
    cacheOptions: {
      category: 'tv',
      sfw,  // Inclure sfw dans la clé de cache
      page: pageNum,
      ttl: getTTL('top')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'top',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      category: 'tv',
      filter,
      limit: limitNum,
      page: pageNum,
      cached: fromCache,
      cacheKey,
      lang,
      autoTrad: autoTradEnabled,
      translated: needsTranslation
    }
  });
}));

/**
 * GET /anime-manga/jikan/top/movie
 * Top films anime
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - filter: bypopularity, favorite (défaut: bypopularity)
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction (1 ou true)
 */
router.get('/top/movie', asyncHandler(async (req, res) => {
  const {
    filter = 'bypopularity',
    limit = '20',
    page = '1',
    sfw: sfwRaw = 'all',
    lang,
    autoTrad
  } = req.query;

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'top',
    fetchFn: async () => {
      let allResults = [];
      let currentPage = pageNum;
      
      // Pour NSFW, on fetch plusieurs pages jusqu'à avoir assez de one-shots (1-2 épisodes)
      if (sfw === 'nsfw') {
        const maxPages = 3;  // Maximum 3 pages (75 résultats potentiels)
        
        while (allResults.length < limitNum && currentPage <= pageNum + maxPages - 1) {
          const results = await provider.getTop('anime', {
            limit: 25,  // Max Jikan
            page: currentPage,
            filter,
            subtype: null,  // Pas de subtype pour NSFW
            sfw
          });
          
          if (!results.data || results.data.length === 0) break;
          
          // Filtrer les one-shots et courts (1-2 épisodes)
          const filtered = results.data.filter(item => {
            const episodes = item.episodes || 1;
            return episodes <= 2;
          });
          
          allResults.push(...filtered);
          currentPage++;
        }
        
        allResults = allResults.slice(0, limitNum);
      } else {
        // Mode normal (sfw ou all)
        const results = await provider.getTop('anime', {
          limit: limitNum,
          page: pageNum,
          filter,
          subtype: 'movie',
          sfw
        });
        allResults = results.data || [];
      }

      // Enrichir avec backdrops depuis /pictures
      allResults = await enrichWithBackdrops(allResults);

      return { data: allResults };
    },
    cacheOptions: {
      category: 'movie',
      sfw,  // Inclure sfw dans la clé de cache
      page: pageNum,
      ttl: getTTL('top')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'top',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      category: 'movie',
      filter,
      limit: limitNum,
      page: pageNum,
      cached: fromCache,
      cacheKey,
      lang,
      autoTrad: autoTradEnabled,
      translated: needsTranslation
    }
  });
}));

/**
 * GET /anime-manga/jikan/upcoming/tv
 * Séries anime à venir
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction (1 ou true)
 */
router.get('/upcoming/tv', asyncHandler(async (req, res) => {
  const {
    limit = '20',
    page = '1',
    sfw: sfwRaw = 'all',
    lang = 'fr',
    autoTrad
  } = req.query;

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'upcoming',
    fetchFn: async () => {
      let results = await provider.getUpcoming({
        limit: limitNum,
        page: pageNum,
        filter: sfw === 'nsfw' ? null : 'tv',  // Pas de filtre pour NSFW
        sfw
      });

      // Enrichir avec backdrops depuis /pictures
      results.data = await enrichWithBackdrops(results.data);

      return results;
    },
    cacheOptions: {
      category: 'tv',
      sfw,  // Inclure sfw dans la clé de cache
      page: pageNum,
      ttl: getTTL('upcoming')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'upcoming',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      category: 'tv',
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey,
      translated: needsTranslation
    }
  });
}));

/**
 * GET /anime-manga/jikan/upcoming/movie
 * Films anime à venir
 * 
 * Query params:
 * - limit: Nombre de résultats (défaut: 20, max: 25)
 * - page: Numéro de page (défaut: 1)
 * - lang: Langue pour traduction
 * - autoTrad: Activer traduction (1 ou true)
 */
router.get('/upcoming/movie', asyncHandler(async (req, res) => {
  const {
    limit = '20',
    page = '1',
    sfw: sfwRaw = 'all',
    lang = 'fr',
    autoTrad
  } = req.query;

  const sfw = normalizeSfw(sfwRaw);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 20, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'upcoming',
    fetchFn: async () => {
      let results = await provider.getUpcoming({
        limit: limitNum,
        page: pageNum,
        filter: sfw === 'nsfw' ? null : 'movie',  // Pas de filtre pour NSFW
        sfw
      });

      // Enrichir avec backdrops depuis /pictures
      results.data = await enrichWithBackdrops(results.data);

      return results;
    },
    cacheOptions: {
      category: 'movie',
      sfw,  // Inclure sfw dans la clé de cache
      page: pageNum,
      ttl: getTTL('upcoming')
    }
  });

  // Traduction post-cache seulement si langue !== DEFAULT_LOCALE (fr-FR)
  const needsTranslation = autoTradEnabled && targetLang && targetLang !== DEFAULT_LANG;
  if (needsTranslation && results.data?.length > 0) {
    results.data = await Promise.all(
      results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
    );
  }

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'upcoming',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      category: 'movie',
      limit: limitNum,
      page: pageNum,
      lang,
      autoTrad: autoTradEnabled,
      cached: fromCache,
      cacheKey,
      translated: needsTranslation
    }
  });
}));

/**
 * GET /anime-manga/jikan/schedule
 * Planning de diffusion des anime
 * 
 * Query params:
 * - day: Jour de la semaine (monday, tuesday, wednesday, thursday, friday, saturday, sunday, unknown, other)
 * - limit: Nombre de résultats (défaut: 25, max: 25)
 * - page: Page de résultats (défaut: 1)
 * - lang: Code langue cible (défaut: fr)
 * - autoTrad: Activer traduction automatique (1 ou true)
 */
router.get('/schedule', asyncHandler(async (req, res) => {
  const {
    day = null,
    limit = '25',
    page = '1',
    lang = 'fr',
    autoTrad
  } = req.query;

  // Validation
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'unknown', 'other'];
  if (day && !validDays.includes(day)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid day',
      message: `day must be one of: ${validDays.join(', ')}`,
      hint: 'Example: /anime-manga/jikan/schedule?day=monday'
    });
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  const limitNum = Math.min(parseInt(limit) || 25, 25);
  const pageNum = parseInt(page) || 1;

  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'schedule',
    fetchFn: async () => {
      let results = await provider.getSchedule(day, {
        limit: limitNum,
        page: pageNum
      });

      // Traduction automatique si activée
      if (autoTradEnabled && targetLang && results.data?.length > 0) {
        results.data = await Promise.all(
          results.data.map(item => translateDetailResult(item, targetLang, autoTradEnabled))
        );
      }
      return results;
    },
    cacheOptions: {
      category: day || 'all',
      page: pageNum,
      ttl: getTTL('schedule')
    }
  });

  res.json({
    success: true,
    provider: 'jikan',
    domain: 'anime-manga',
    endpoint: 'schedule',
    query: null,
    total: results.data?.length || 0,
    count: results.data?.length || 0,
    data: results.data,
    pagination: normalizeJikanPagination(results.pagination),
    meta: {
      fetchedAt: new Date().toISOString(),
      day: results.day,
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
