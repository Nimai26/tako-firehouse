/**
 * OpenLibrary Routes
 * 
 * Routes pour le provider OpenLibrary.
 * 
 * Routes :
 * - GET /health          - Health check
 * - GET /search          - Recherche par titre ou ISBN
 * - GET /search/author   - Recherche par auteur (livres d'un auteur)
 * - GET /search/authors  - Recherche d'auteurs (profils)
 * - GET /author/:id      - Détails d'un auteur
 * - GET /author/:id/works - Œuvres d'un auteur
 * - GET /:olId           - Détails d'un livre par ID OpenLibrary
 * 
 * Support traduction :
 * - lang : Code langue cible (fr, de, es, it, pt)
 * - autoTrad : Activer la traduction automatique via auto_trad (1 ou true)
 */

import { Router } from 'express';
import { OpenLibraryProvider } from '../providers/openlibrary.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';
import {
  translateSearchResults,
  translateBookGenres,
  translateText,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';

const router = Router();
const provider = new OpenLibraryProvider();

/**
 * GET /health
 * Health check pour OpenLibrary
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();
  const status = health.healthy ? 200 : 503;
  res.status(status).json(health);
}));

/**
 * GET /search
 * Rechercher des livres (par titre ou ISBN)
 * 
 * Query params:
 * - q (requis): Terme de recherche ou ISBN
 * - limit: Nombre de résultats (1-100, défaut: 20)
 * - lang: Code langue (fr, en, etc.)
 * - autoTrad: Activer la traduction automatique (1 ou true)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, lang, autoTrad } = req.query;

  if (!q || !q.trim()) {
    throw new ValidationError('Le paramètre q est requis');
  }

  const maxResults = limit ? Math.min(Math.max(1, parseInt(limit, 10) || 20), 100) : 20;
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.search(q.trim(), {
    maxResults,
    lang: lang || null
  });

  // Traduction automatique si activée
  if (autoTradEnabled && result.data && result.data.length > 0) {
    result.data = await translateSearchResults(result.data, true, targetLang);
    
    for (const book of result.data) {
      if (book.details?.categories && book.details.categories.length > 0) {
        const translated = await translateBookGenres(book.details.categories, targetLang);
        if (translated.termsTranslated) {
          book.details.categoriesOriginal = translated.termsOriginal;
          book.details.categories = translated.terms;
        }
      }
    }
  }

  res.json(result);
}));

/**
 * GET /search/author
 * Rechercher des livres par auteur
 * 
 * Query params:
 * - author (requis): Nom de l'auteur
 * - limit: Nombre de résultats (1-100, défaut: 20)
 * - lang: Code langue
 * - autoTrad: Activer la traduction automatique (1 ou true)
 */
router.get('/search/author', asyncHandler(async (req, res) => {
  const { author, limit, lang, autoTrad } = req.query;

  if (!author || !author.trim()) {
    throw new ValidationError('Le paramètre author est requis');
  }

  const maxResults = limit ? Math.min(Math.max(1, parseInt(limit, 10) || 20), 100) : 20;
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.searchByAuthor(author.trim(), {
    maxResults,
    lang: lang || null
  });

  // Traduction automatique si activée
  if (autoTradEnabled && result.data && result.data.length > 0) {
    result.data = await translateSearchResults(result.data, true, targetLang);
    
    for (const book of result.data) {
      if (book.details?.categories && book.details.categories.length > 0) {
        const translated = await translateBookGenres(book.details.categories, targetLang);
        if (translated.termsTranslated) {
          book.details.categoriesOriginal = translated.termsOriginal;
          book.details.categories = translated.terms;
        }
      }
    }
  }

  res.json(result);
}));

/**
 * GET /search/authors
 * Rechercher des auteurs par nom
 * 
 * Query params:
 * - q (requis): Nom de l'auteur à rechercher
 * - limit: Nombre de résultats (1-100, défaut: 20)
 * - lang: Code langue (pour traduction bio si autoTrad)
 * - autoTrad: Activer la traduction automatique (1 ou true)
 */
router.get('/search/authors', asyncHandler(async (req, res) => {
  const { q, limit, lang, autoTrad } = req.query;

  if (!q || !q.trim()) {
    throw new ValidationError('Le paramètre q est requis');
  }

  const maxResults = limit ? Math.min(Math.max(1, parseInt(limit, 10) || 20), 100) : 20;
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.searchAuthors(q.trim(), {
    limit: maxResults
  });

  // Traduction automatique si activée (bio des auteurs)
  if (autoTradEnabled && result.data && result.data.length > 0) {
    for (const author of result.data) {
      if (author.bio) {
        const bioResult = await translateText(author.bio, targetLang, {
          enabled: true,
          sourceLang: 'en'
        });
        if (bioResult.translated) {
          author.bioOriginal = author.bio;
          author.bio = bioResult.text;
        }
      }
    }
  }

  res.json(result);
}));

/**
 * GET /author/:id
 * Récupérer les détails d'un auteur par son ID OpenLibrary
 * 
 * Params:
 * - id: ID OpenLibrary de l'auteur (ex: OL19981A)
 * 
 * Query params:
 * - lang: Langue cible pour traduction
 * - autoTrad: Activer la traduction automatique (1 ou true)
 */
router.get('/author/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id || !id.trim()) {
    throw new ValidationError("L'ID de l'auteur est requis");
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getAuthorDetails(id.trim());

  // Traduction automatique si activée (description = bio dans Format B)
  if (autoTradEnabled && result?.description) {
    const bioResult = await translateText(result.description, targetLang, {
      enabled: true,
      sourceLang: 'en'
    });
    if (bioResult.translated) {
      result.details = {
        ...result.details,
        descriptionOriginal: result.description,
        descriptionTranslated: true
      };
      result.description = bioResult.text;
    }
  }

  res.json({
    success: true,
    provider: 'openlibrary',
    domain: 'books',
    id: result.id || `openlibrary:${id.trim()}`,
    data: result,
    meta: { fetchedAt: new Date().toISOString() }
  });
}));

/**
 * GET /author/:id/works
 * Récupérer les œuvres d'un auteur
 * 
 * Params:
 * - id: ID OpenLibrary de l'auteur (ex: OL19981A)
 * 
 * Query params:
 * - limit: Nombre de résultats par page (1-100, défaut: 50)
 * - offset: Décalage pour pagination (défaut: 0)
 * - lang: Langue cible pour traduction
 * - autoTrad: Activer la traduction automatique (1 ou true)
 */
router.get('/author/:id/works', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit, offset, lang, autoTrad } = req.query;

  if (!id || !id.trim()) {
    throw new ValidationError("L'ID de l'auteur est requis");
  }

  const maxResults = limit ? Math.min(Math.max(1, parseInt(limit, 10) || 50), 100) : 50;
  const offsetNum = offset ? Math.max(0, parseInt(offset, 10) || 0) : 0;
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getAuthorWorks(id.trim(), {
    limit: maxResults,
    offset: offsetNum
  });

  // Traduction automatique si activée (descriptions des œuvres)
  if (autoTradEnabled && result.data && result.data.length > 0) {
    for (const work of result.data) {
      if (work.description) {
        const descResult = await translateText(work.description, targetLang, {
          enabled: true,
          sourceLang: 'en'
        });
        if (descResult.translated) {
          work.descriptionOriginal = work.description;
          work.description = descResult.text;
        }
      }
      if (work.details?.categories && work.details.categories.length > 0) {
        const translated = await translateBookGenres(work.details.categories, targetLang);
        if (translated.termsTranslated) {
          work.details.categoriesOriginal = translated.termsOriginal;
          work.details.categories = translated.terms;
        }
      }
    }
  }

  res.json(result);
}));

/**
 * GET /:olId
 * Récupérer les détails d'un livre par son ID OpenLibrary
 * 
 * Params:
 * - olId: ID OpenLibrary (OL1234W pour work, OL1234M pour edition)
 * 
 * Query params:
 * - lang: Langue préférée
 * - autoTrad: Activer la traduction automatique (1 ou true)
 */
router.get('/:olId', asyncHandler(async (req, res) => {
  const { olId } = req.params;
  const { lang, autoTrad } = req.query;

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await provider.getById(olId, {
    lang: lang || null
  });

  // Traduction automatique si activée
  if (autoTradEnabled && result && result.data) {
    // Traduire le titre
    if (result.data.title) {
      const titleResult = await translateText(result.data.title, targetLang, { 
        enabled: true, 
        sourceLang: 'en' 
      });
      if (titleResult.translated) {
        result.data.titleOriginal = result.data.title;
        result.data.title = titleResult.text;
      }
    }
    
    // Traduire la description
    if (result.data.description) {
      const descResult = await translateText(result.data.description, targetLang, { 
        enabled: true, 
        sourceLang: 'en' 
      });
      if (descResult.translated) {
        result.data.descriptionOriginal = result.data.description;
        result.data.description = descResult.text;
      }
    }
    
    // Traduire les sujets/catégories
    if (result.data.details?.categories && result.data.details.categories.length > 0) {
      const translated = await translateBookGenres(result.data.details.categories, targetLang);
      if (translated.termsTranslated) {
        result.data.details.categoriesOriginal = translated.termsOriginal;
        result.data.details.categories = translated.terms;
      }
    }
  }

  res.json(result);
}));

export default router;
