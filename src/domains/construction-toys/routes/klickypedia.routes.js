/**
 * Routes Klickypedia
 * 
 * Endpoints pour l'encyclopédie Playmobil communautaire.
 * 
 * Routes disponibles :
 * - GET /health - Vérifier la disponibilité de Klickypedia
 * - GET /search - Rechercher des sets Playmobil
 * - GET /instructions/:productId - Obtenir les instructions de montage
 * - GET /:id - Obtenir les détails d'un set
 * 
 * Support traduction :
 * - lang : Langue native (fr, es, de, en) ou code langue pour autoTrad
 * - autoTrad : Activer la traduction automatique via auto_trad (1 ou true)
 */

import { Router } from 'express';
import { KlickypediaProvider } from '../providers/klickypedia.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';
import {
  translateSearchResults,
  translateToyCategories,
  translateText,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';

const router = Router();
const provider = new KlickypediaProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/klickypedia/health
 * Vérifier la disponibilité de Klickypedia
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.status(health.healthy ? 200 : 503).json({
    provider: 'klickypedia',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/klickypedia/search
 * Rechercher des sets Playmobil
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - pageSize : Nombre de résultats (max 100, défaut 24)
 * - lang : Langue native (fr, es, de, en - défaut fr) ou code langue pour autoTrad
 * - autoTrad : Activer la traduction automatique vers lang via auto_trad (1 ou true)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, pageSize = '24', lang = 'fr', autoTrad } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const validLangs = ['fr', 'es', 'de', 'en'];
  const targetLang = extractLangCode(lang);
  // Utiliser la langue native si supportée, sinon fallback sur français
  const nativeLang = validLangs.includes(targetLang) ? targetLang : 'fr';
  const size = Math.min(Math.max(parseInt(limit || pageSize) || 24, 1), 100);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });

  let results = await provider.search(q.trim(), {
    pageSize: size,
    lang: nativeLang
  });

  // Traduction automatique si activée et langue non supportée nativement
  if (autoTradEnabled && !validLangs.includes(targetLang) && results.data && results.data.length > 0) {
    results.data = await translateSearchResults(results.data, true, targetLang);
  }

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/klickypedia/instructions/:productId
 * Obtenir les instructions de montage
 * 
 * Vérifie la disponibilité sur le CDN Playmobil officiel
 */
router.get('/instructions/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!productId || !/^\d+(-[a-z]{2,3})?$/i.test(productId)) {
    throw new ValidationError('Format de productId invalide');
  }

  const instructions = await provider.getKlickypediaInstructions(productId);

  res.json({
    success: true,
    provider: 'klickypedia',
    domain: 'construction-toys',
    id: `klickypedia:${productId}`,
    data: instructions,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS D'UN SET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/klickypedia/:id
 * Obtenir les détails d'un set Playmobil
 * 
 * Path params :
 * - id : ID du set (ex: 71148)
 * 
 * Query params :
 * - lang : Langue native (fr, es, de, en - défaut fr) ou code langue pour autoTrad
 * - autoTrad : Activer la traduction automatique vers lang via auto_trad (1 ou true)
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang = 'fr', autoTrad } = req.query;

  if (!id || !/^\d+(-[a-z]{2,3})?$/i.test(id)) {
    throw new ValidationError('Format d\'ID invalide');
  }

  const validLangs = ['fr', 'es', 'de', 'en'];
  const targetLang = extractLangCode(lang);
  // Utiliser la langue native si supportée, sinon fallback sur français
  const nativeLang = validLangs.includes(targetLang) ? targetLang : 'fr';
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });

  let product = await provider.getById(id, { lang: nativeLang });

  // Traduction automatique si activée et langue non supportée nativement
  if (autoTradEnabled && !validLangs.includes(targetLang) && product?.data) {
    // Traduire le nom
    if (product.data.title) {
      const nameResult = await translateText(product.data.title, targetLang, { 
        enabled: true, 
        sourceLang: nativeLang 
      });
      if (nameResult.translated) {
        product.data.titleOriginal = product.data.title;
        product.data.title = nameResult.text;
      }
    }
    
    // Traduire la description
    if (product.data.description) {
      const descResult = await translateText(product.data.description, targetLang, { 
        enabled: true, 
        sourceLang: nativeLang 
      });
      if (descResult.translated) {
        product.data.descriptionOriginal = product.data.description;
        product.data.description = descResult.text;
      }
    }
    
    // Traduire les catégories
    if (product.data.details?.categories && product.data.details.categories.length > 0) {
      const translated = await translateToyCategories(product.data.details.categories, targetLang);
      if (translated.termsTranslated) {
        product.data.details.categoriesOriginal = translated.termsOriginal;
        product.data.details.categories = translated.terms;
      }
    }
  }

  res.json(product);
}));

export default router;
