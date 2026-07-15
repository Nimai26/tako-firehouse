/**
 * Routes ComicVine
 * 
 * Endpoints pour l'API ComicVine.
 * 
 * Routes disponibles :
 * - GET /health - Vérifier la disponibilité
 * - GET /search - Recherche générale (volumes par défaut)
 * - GET /search/volumes - Rechercher des séries
 * - GET /search/issues - Rechercher des numéros
 * - GET /search/characters - Rechercher des personnages
 * - GET /search/publishers - Rechercher des éditeurs
 * - GET /search/creators - Rechercher des créateurs (auteurs, dessinateurs)
 * - GET /volume/:id - Détails d'un volume
 * - GET /volume/:id/issues - Issues d'un volume
 * - GET /issue/:id - Détails d'un issue
 * - GET /character/:id - Détails d'un personnage
 * - GET /creator/:id - Détails d'un créateur
 * - GET /creator/:id/works - Œuvres d'un créateur
 * 
 * Support traduction :
 * - lang : Code langue cible (fr, de, es, it, pt)
 * - autoTrad : Activer la traduction automatique via auto_trad (1 ou true)
 */

import { Router } from 'express';
import { ComicVineProvider } from '../providers/comicvine.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';
import {
  translateSearchResults,
  translateText,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';

const router = Router();
const provider = new ComicVineProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.status(health.healthy ? 200 : 503).json({
    provider: 'comicvine',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /comics/comicvine/search
 * Recherche générale (volumes par défaut)
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - type : Type de ressource (volume, issue, character, publisher)
 * - maxResults : Nombre de résultats (max 100, défaut 20)
 * - page : Numéro de page (défaut 1)
 * - lang : Langue cible pour traduction
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, type = 'volume', limit, maxResults = '20', page = '1', lang, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.search(q.trim(), {
    resourceType: type,
    maxResults: parseInt(limit || maxResults) || 20,
    page: parseInt(page) || 1
  });

  // Traduction automatique si activée
  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

/**
 * GET /comics/comicvine/search/volumes
 * Rechercher des séries de comics
 */
router.get('/search/volumes', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20', page = '1', lang, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchVolumes(q.trim(), {
    maxResults: parseInt(limit || maxResults) || 20,
    page: parseInt(page) || 1
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

/**
 * GET /comics/comicvine/search/issues
 * Rechercher des numéros de comics
 */
router.get('/search/issues', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20', page = '1', lang, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchIssues(q.trim(), {
    maxResults: parseInt(limit || maxResults) || 20,
    page: parseInt(page) || 1
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

/**
 * GET /comics/comicvine/search/characters
 * Rechercher des personnages
 */
router.get('/search/characters', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20', page = '1', lang, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchCharacters(q.trim(), {
    maxResults: parseInt(limit || maxResults) || 20,
    page: parseInt(page) || 1
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

/**
 * GET /comics/comicvine/search/publishers
 * Rechercher des éditeurs
 */
router.get('/search/publishers', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20', page = '1', lang, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchPublishers(q.trim(), {
    maxResults: parseInt(limit || maxResults) || 20,
    page: parseInt(page) || 1
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

/**
 * GET /comics/comicvine/search/creators
 * Rechercher des créateurs (auteurs, dessinateurs, etc.)
 */
router.get('/search/creators', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20', page = '1', lang, autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchCreators(q.trim(), {
    maxResults: parseInt(limit || maxResults) || 20,
    page: parseInt(page) || 1
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /comics/comicvine/volume/:id
 * Détails d'un volume (série)
 */
router.get('/volume/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('L\'ID du volume est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let volume = await provider.getVolumeDetails(id);

  // Traduction de la description si activée
  if (autoTradEnabled && targetLang && volume.data?.description) {
    const translated = await translateText(volume.data.description, targetLang, true);
    if (translated.translated) {
      volume = {
        ...volume,
        data: {
          ...volume.data,
          description: translated.text,
          originalDescription: volume.data.description
        }
      };
    }
  }

  res.json(volume);
}));

/**
 * GET /comics/comicvine/volume/:id/issues
 * Liste des issues d'un volume
 */
router.get('/volume/:id/issues', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = '1', maxResults = '20', lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('L\'ID du volume est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.getVolumeIssues(id, {
    page: parseInt(page) || 1,
    maxResults: parseInt(maxResults) || 20
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

/**
 * GET /comics/comicvine/issue/:id
 * Détails d'un issue (numéro)
 */
router.get('/issue/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('L\'ID de l\'issue est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let issue = await provider.getIssueDetails(id);

  if (autoTradEnabled && targetLang && issue.data?.description) {
    const translated = await translateText(issue.data.description, targetLang, true);
    if (translated.translated) {
      issue = {
        ...issue,
        data: {
          ...issue.data,
          description: translated.text,
          originalDescription: issue.data.description
        }
      };
    }
  }

  res.json(issue);
}));

/**
 * GET /comics/comicvine/character/:id
 * Détails d'un personnage
 */
router.get('/character/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('L\'ID du personnage est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let character = await provider.getCharacterDetails(id);

  if (autoTradEnabled && targetLang && character.data?.description) {
    const translated = await translateText(character.data.description, targetLang, true);
    if (translated.translated) {
      character = {
        ...character,
        data: {
          ...character.data,
          description: translated.text,
          originalDescription: character.data.description
        }
      };
    }
  }

  res.json(character);
}));

/**
 * GET /comics/comicvine/creator/:id
 * Détails d'un créateur
 */
router.get('/creator/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('L\'ID du créateur est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let creator = await provider.getCreatorDetails(id);

  if (autoTradEnabled && targetLang && creator.data?.description) {
    const translated = await translateText(creator.data.description, targetLang, true);
    if (translated.translated) {
      creator = {
        ...creator,
        data: {
          ...creator.data,
          description: translated.text,
          originalDescription: creator.data.description
        }
      };
    }
  }

  res.json(creator);
}));

/**
 * GET /comics/comicvine/creator/:id/works
 * Liste des œuvres (volumes) d'un créateur
 */
router.get('/creator/:id/works', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = '1', maxResults = '20', lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('L\'ID du créateur est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.getCreatorWorks(id, {
    page: parseInt(page) || 1,
    maxResults: parseInt(maxResults) || 20
  });

  if (autoTradEnabled && targetLang && results.data?.length > 0) {
    results = await translateSearchResults(results, targetLang, {
      fields: ['title', 'description']
    });
  }

  res.json(results);
}));

export default router;
