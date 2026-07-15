/**
 * Routes MangaUpdates
 * 
 * Endpoints pour l'API MangaUpdates.
 * 
 * Routes disponibles :
 * - GET /health - Vérifier la disponibilité
 * - GET /search - Recherche de séries manga
 * - GET /search/authors - Rechercher des auteurs
 * - GET /search/publishers - Rechercher des éditeurs
 * - GET /series/:id - Détails d'une série
 * - GET /series/:id/recommendations - Recommandations pour une série
 * - GET /author/:id - Détails d'un auteur
 * - GET /author/:id/works - Œuvres d'un auteur
 * - GET /publisher/:id - Détails d'un éditeur
 * - GET /genres - Liste des genres disponibles
 * - GET /releases - Dernières sorties
 * 
 * Support traduction :
 * - lang : Code langue cible (fr, de, es, it, pt)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 * - frenchTitle : Enrichir avec les titres français via Nautiljon (1 ou true)
 */

import { Router } from 'express';
import { MangaUpdatesProvider } from '../providers/mangaupdates.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';
import {
  translateSearchResults,
  translateText,
  translateGenre,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';
import { findFrenchTitle } from '../services/french-title.service.js';

const router = Router();
const provider = new MangaUpdatesProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si l'enrichissement français est demandé
 */
function isFrenchTitleEnabled(query) {
  const { frenchTitle, fr } = query;
  return frenchTitle === '1' || frenchTitle === 'true' || fr === '1' || fr === 'true';
}

/**
 * Enrichit un résultat avec le titre français si disponible
 */
async function enrichWithFrenchTitle(item) {
  if (!item?.title) return item;
  
  try {
    const frResult = await findFrenchTitle(item.title);
    if (frResult) {
      return {
        ...item,
        details: {
          ...item.details,
          titleFrench: frResult.titleFrench,
          nautiljon: {
            url: frResult.url,
            confidence: frResult.confidence
          }
        }
      };
    }
  } catch (error) {
    // Silencieux - on ne bloque pas si Nautiljon échoue
  }
  
  return item;
}

/**
 * Enrichit plusieurs résultats avec les titres français (limité pour perfs)
 */
async function enrichResultsWithFrench(results, maxItems = 10) {
  if (!results?.data?.length) return results;
  
  const enriched = await Promise.all(
    results.data.slice(0, maxItems).map(item => enrichWithFrenchTitle(item))
  );
  
  return {
    ...results,
    data: [
      ...enriched,
      ...results.data.slice(maxItems) // Le reste non enrichi
    ]
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.status(health.healthy ? 200 : 503).json({
    provider: 'mangaupdates',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message,
    features: {
      apiKey: false, // Pas de clé requise
      frenchTitles: true,
      autoTranslation: true
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE SÉRIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/mangaupdates/search
 * Recherche de séries manga
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - type : Type (Manga, Manhwa, Manhua, Novel, Doujinshi, etc.)
 * - maxResults : Nombre de résultats (max 100, défaut 25)
 * - page : Numéro de page (défaut 1)
 * - year : Année de sortie
 * - licensed : Seulement les séries licenciées (1 ou true)
 * - lang : Langue cible pour traduction
 * - autoTrad : Activer la traduction automatique (1 ou true)
 * - frenchTitle : Enrichir avec titres français (1 ou true)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { 
    q, 
    type, 
    limit,
    maxResults = '25', 
    page = '1', 
    year,
    licensed,
    lang, 
    autoTrad,
    frenchTitle,
    fr
  } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  const frenchEnabled = isFrenchTitleEnabled({ frenchTitle, fr });

  let results = await provider.search(q.trim(), {
    type,
    maxResults: parseInt(limit || maxResults) || 25,
    page: parseInt(page) || 1,
    year: year ? parseInt(year) : undefined,
    licensed: licensed === '1' || licensed === 'true' ? true : undefined
  });

  // Enrichissement avec titres français
  if (frenchEnabled && results.data?.length > 0) {
    results = await enrichResultsWithFrench(results, 10);
  }

  // Traduction automatique si activée
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['description']
    });

    // Traduction des genres pour chaque résultat
    for (const item of results.data) {
      const genreObjects = item.details?.genres;
      if (Array.isArray(genreObjects) && genreObjects.length > 0) {
        const genreNames = genreObjects.map(g => typeof g === 'object' ? (g.name || g) : g);
        const genreTranslations = await Promise.all(
          genreNames.map(name => translateGenre(name, targetLang))
        );
        const wasTranslated = genreTranslations.some((g, i) => g !== genreNames[i]);
        if (wasTranslated) {
          item.details.genresOriginal = genreObjects;
          item.details.genres = genreObjects.map((obj, i) =>
            typeof obj === 'object' ? { ...obj, name: genreTranslations[i] } : genreTranslations[i]
          );
          item.details.genresTranslated = true;
        }
      }
    }
  }

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE AUTEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/mangaupdates/search/authors
 * Rechercher des auteurs
 */
router.get('/search/authors', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '25', page = '1' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const results = await provider.searchAuthors(q.trim(), {
    maxResults: parseInt(limit || maxResults) || 25,
    page: parseInt(page) || 1
  });

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE ÉDITEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/mangaupdates/search/publishers
 * Rechercher des éditeurs
 */
router.get('/search/publishers', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '25', page = '1' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const results = await provider.searchPublishers(q.trim(), {
    maxResults: parseInt(limit || maxResults) || 25,
    page: parseInt(page) || 1
  });

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS SÉRIE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/mangaupdates/series/:id
 * Détails d'une série
 */
router.get('/series/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad, frenchTitle, fr } = req.query;

  if (!id) {
    throw new ValidationError('ID de série requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  const frenchEnabled = isFrenchTitleEnabled({ frenchTitle, fr });

  let result = await provider.getSeries(id);

  // Enrichissement avec titre français
  if (frenchEnabled && result.data?.title) {
    result = { ...result, data: await enrichWithFrenchTitle(result.data) };
  }

  // Traduction automatique de la description
  if (autoTradEnabled && targetLang && result.data?.description) {
    const translated = await translateText(result.data.description, targetLang, { enabled: true });
    if (translated.translated) {
      result.data.details = {
        ...result.data.details,
        descriptionOriginal: result.data.description,
        descriptionTranslated: true
      };
      result.data.description = translated.text;
    }
  }

  // Traduction des genres (objets {id, name})
  if (autoTradEnabled && targetLang && result.data?.details?.genres && Array.isArray(result.data.details.genres) && result.data.details.genres.length > 0) {
    const genreObjects = result.data.details.genres;
    const genreNames = genreObjects.map(g => typeof g === 'object' ? (g.name || g) : g);
    const genreTranslations = await Promise.all(
      genreNames.map(name => translateGenre(name, targetLang))
    );
    const wasTranslated = genreTranslations.some((g, i) => g !== genreNames[i]);
    if (wasTranslated) {
      result.data.details.genresOriginal = genreObjects;
      result.data.details.genres = genreObjects.map((obj, i) =>
        typeof obj === 'object' ? { ...obj, name: genreTranslations[i] } : genreTranslations[i]
      );
      result.data.details.genresTranslated = true;
    }
  }

  res.json(result);
}));

/**
 * GET /anime-manga/mangaupdates/series/:id/recommendations
 * Recommandations pour une série
 */
router.get('/series/:id/recommendations', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('ID de série requis');
  }

  const result = await provider.getSeriesRecommendations(id);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════════════
// AUTEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/mangaupdates/author/:id
 * Détails d'un auteur
 */
router.get('/author/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('ID auteur requis');
  }

  const result = await provider.getAuthor(id);
  res.json({
    success: true,
    provider: 'mangaupdates',
    domain: 'anime-manga',
    id: result.id,
    data: result,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * GET /anime-manga/mangaupdates/author/:id/works
 * Œuvres d'un auteur
 */
router.get('/author/:id/works', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('ID auteur requis');
  }

  const result = await provider.getAuthorWorks(id);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════════════
// ÉDITEURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/mangaupdates/publisher/:id
 * Détails d'un éditeur
 */
router.get('/publisher/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('ID éditeur requis');
  }

  const result = await provider.getPublisher(id);
  res.json({
    success: true,
    provider: 'mangaupdates',
    domain: 'anime-manga',
    id: result.id,
    data: result,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// GENRES & RELEASES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/mangaupdates/genres
 * Liste des genres disponibles
 */
router.get('/genres', asyncHandler(async (req, res) => {
  const result = await provider.getGenres();
  res.json({
    success: true,
    provider: 'mangaupdates',
    domain: 'anime-manga',
    type: 'genres',
    query: null,
    total: result.total || result.data?.length || 0,
    count: result.data?.length || 0,
    data: result.data || [],
    pagination: null,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * GET /anime-manga/mangaupdates/releases
 * Dernières sorties/chapitres
 */
router.get('/releases', asyncHandler(async (req, res) => {
  const { q, search, limit, maxResults = '25', page = '1' } = req.query;

  const result = await provider.searchReleases({
    search: q || search,
    maxResults: parseInt(limit || maxResults) || 25,
    page: parseInt(page) || 1
  });

  res.json(result);
}));

export default router;
