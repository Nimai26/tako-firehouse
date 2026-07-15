/**
 * Routes Google Books
 * 
 * Endpoints pour l'API Google Books.
 * 
 * Routes disponibles :
 * - GET /health - Vérifier la disponibilité
 * - GET /search - Rechercher des livres
 * - GET /search/author - Rechercher par auteur
 * - GET /:volumeId - Obtenir les détails d'un livre
 * 
 * Support traduction :
 * - lang : Code langue cible (fr, de, es, it, pt)
 * - autoTrad : Activer la traduction automatique via auto_trad (1 ou true)
 */

import { Router } from 'express';
import { GoogleBooksProvider } from '../providers/googlebooks.provider.js';
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
const provider = new GoogleBooksProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.status(health.healthy ? 200 : 503).json({
    provider: 'googlebooks',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /books/googlebooks/search
 * Rechercher des livres (titre, auteur, ISBN)
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - maxResults : Nombre de résultats (max 40, défaut 20)
 * - lang : Restriction de langue (fr, en, de, etc.)
 * - orderBy : Tri (relevance, newest)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20', lang, orderBy = 'relevance', autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const max = Math.min(Math.max(parseInt(limit || maxResults) || 20, 1), 40);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.search(q.trim(), {
    maxResults: max,
    lang,
    orderBy
  });

  // Traduction automatique si activée
  if (autoTradEnabled && results.data && results.data.length > 0) {
    results.data = await translateSearchResults(results.data, true, targetLang);
    
    // Traduire aussi les genres/catégories de chaque livre
    for (const book of results.data) {
      if (book.details?.categories && book.details.categories.length > 0) {
        const translated = await translateBookGenres(book.details.categories, targetLang);
        if (translated.termsTranslated) {
          book.details.categoriesOriginal = translated.termsOriginal;
          book.details.categories = translated.terms;
        }
      }
    }
  }

  res.json(results);
}));

/**
 * GET /books/googlebooks/search/author
 * Rechercher par auteur
 * 
 * Query params :
 * - author (required) : Nom de l'auteur
 * - maxResults : Nombre de résultats (max 40, défaut 20)
 * - lang : Restriction de langue
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */
router.get('/search/author', asyncHandler(async (req, res) => {
  const { author, limit, maxResults = '20', lang, autoTrad } = req.query;

  if (!author || typeof author !== 'string' || author.trim().length === 0) {
    throw new ValidationError('Le paramètre "author" est requis');
  }

  const max = Math.min(Math.max(parseInt(limit || maxResults) || 20, 1), 40);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let results = await provider.searchByAuthor(author.trim(), {
    maxResults: max,
    lang
  });

  // Traduction automatique si activée
  if (autoTradEnabled && results.data && results.data.length > 0) {
    results.data = await translateSearchResults(results.data, true, targetLang);
    
    for (const book of results.data) {
      if (book.details?.categories && book.details.categories.length > 0) {
        const translated = await translateBookGenres(book.details.categories, targetLang);
        if (translated.termsTranslated) {
          book.details.categoriesOriginal = translated.termsOriginal;
          book.details.categories = translated.terms;
        }
      }
    }
  }

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS D'UN LIVRE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /books/googlebooks/:volumeId
 * Obtenir les détails d'un livre
 * 
 * Path params :
 * - volumeId : ID du volume Google Books
 * 
 * Query params :
 * - lang : Langue préférée
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */
router.get('/:volumeId', asyncHandler(async (req, res) => {
  const { volumeId } = req.params;
  const { lang, autoTrad } = req.query;

  if (!volumeId || volumeId.trim().length === 0) {
    throw new ValidationError('L\'ID du volume est requis');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let book = await provider.getById(volumeId.trim(), { lang });

  // Traduction automatique si activée
  if (autoTradEnabled && book) {
    // Traduire la description
    if (book.data?.description) {
      const descResult = await translateText(book.data.description, targetLang, { 
        enabled: true, 
        sourceLang: 'en' 
      });
      if (descResult.translated) {
        book.data.descriptionOriginal = book.data.description;
        book.data.description = descResult.text;
      }
    }
    
    // Traduire les catégories
    if (book.data?.details?.categories && book.data.details.categories.length > 0) {
      const translated = await translateBookGenres(book.data.details.categories, targetLang);
      if (translated.termsTranslated) {
        book.data.details.categoriesOriginal = translated.termsOriginal;
        book.data.details.categories = translated.terms;
      }
    }
  }

  res.json(book);
}));

export default router;
