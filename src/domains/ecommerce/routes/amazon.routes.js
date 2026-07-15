/**
 * Routes API Amazon
 * 
 * @module domains/ecommerce/routes/amazon
 */

import { Router } from 'express';
import * as amazonProvider from '../providers/amazon.provider.js';
import * as amazonNormalizer from '../normalizers/amazon.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = Router();

/**
 * Recherche de produits Amazon
 * GET /api/ecommerce/amazon/search
 * 
 * Query params:
 * - q: Terme de recherche (requis)
 * - country: Code pays (fr, us, uk, de, es, it, jp, ca) - défaut: fr
 * - category: Catégorie (all, videogames, toys, books, music, movies, electronics) - défaut: all
 * - page: Numéro de page (défaut: 1)
 * - limit: Nombre de résultats par page (défaut: 20, max: 50)
 * - lang: Langue de sortie (défaut: fr)
 * - autotrad: Active traduction automatique (défaut: false)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, country = 'fr', category = 'all', page = 1, limit = 20, lang = 'fr', autotrad = 'false' } = req.query;
    
    // Validation
    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'MISSING_QUERY',
          message: 'Le paramètre "q" est requis'
        }
      });
    }
    
    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 50);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'INVALID_PAGE',
          message: 'Le paramètre "page" doit être un nombre >= 1'
        }
      });
    }
    
    if (isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'INVALID_LIMIT',
          message: 'Le paramètre "limit" doit être un nombre entre 1 et 50'
        }
      });
    }
    
    // Recherche
    logger.info(`[Amazon] Recherche: "${q}" (country=${country}, category=${category}, page=${pageNum})`);
    const rawResults = await amazonProvider.searchAmazon(q, {
      country,
      category,
      page: pageNum,
      limit: limitNum
    });
    
    // Normalisation
    const normalized = await amazonNormalizer.normalizeSearchResults(rawResults, {
      lang,
      autoTrad: autotrad === 'true'
    });
    
    res.json(normalized);
    
  } catch (err) {
    logger.error('[Amazon] Erreur recherche:', err);
    res.status(500).json({
      success: false,
      provider: 'amazon',
      error: {
        code: 'SEARCH_ERROR',
        message: err.message
      }
    });
  }
});

/**
 * Détails d'un produit Amazon par ASIN
 * GET /api/ecommerce/amazon/product/:asin
 * 
 * Params:
 * - asin: Identifiant Amazon (10 caractères alphanumériques)
 * 
 * Query params:
 * - country: Code pays (défaut: fr)
 * - lang: Langue de sortie (défaut: fr)
 * - autotrad: Active traduction automatique (défaut: false)
 */
router.get('/product/:asin', async (req, res) => {
  try {
    const { asin } = req.params;
    const { country = 'fr', lang = 'fr', autotrad = 'false' } = req.query;
    
    // Validation ASIN
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
      return res.status(400).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'INVALID_ASIN',
          message: 'ASIN invalide (doit être 10 caractères alphanumériques)'
        }
      });
    }
    
    // Récupération
    logger.info(`[Amazon] Récupération produit: ${asin} (country=${country})`);
    const rawProduct = await amazonProvider.getAmazonProduct(asin, country);
    
    if (!rawProduct) {
      return res.status(404).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Produit ${asin} introuvable sur Amazon ${country.toUpperCase()}`
        }
      });
    }
    
    // Normalisation
    const normalized = await amazonNormalizer.normalizeProductDetails(rawProduct, {
      lang,
      autoTrad: autotrad === 'true'
    });
    
    res.json({
      success: true,
      provider: 'amazon',
      domain: 'ecommerce',
      id: normalized.id,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        country,
        autoTrad: autotrad === 'true'
      }
    });
    
  } catch (err) {
    logger.error('[Amazon] Erreur récupération produit:', err);
    res.status(500).json({
      success: false,
      provider: 'amazon',
      error: {
        code: 'PRODUCT_ERROR',
        message: err.message
      }
    });
  }
});

/**
 * Comparaison de prix multi-pays
 * GET /api/ecommerce/amazon/compare/:asin
 * 
 * Params:
 * - asin: Identifiant Amazon
 * 
 * Query params:
 * - countries: Liste de codes pays séparés par virgule (défaut: fr,us,uk,de)
 */
router.get('/compare/:asin', async (req, res) => {
  try {
    const { asin } = req.params;
    const { countries = 'fr,us,uk,de' } = req.query;
    
    // Validation ASIN
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
      return res.status(400).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'INVALID_ASIN',
          message: 'ASIN invalide (doit être 10 caractères alphanumériques)'
        }
      });
    }
    
    // Parse countries
    const countriesList = countries.split(',').map(c => c.trim()).filter(c => c.length > 0);
    
    if (countriesList.length === 0) {
      return res.status(400).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'MISSING_COUNTRIES',
          message: 'Au moins un pays doit être spécifié'
        }
      });
    }
    
    // Comparaison
    logger.info(`[Amazon] Comparaison prix: ${asin} (countries=${countriesList.join(',')})`);
    const rawComparison = await amazonProvider.comparePrices(asin, countriesList);
    
    // Normalisation
    const normalized = amazonNormalizer.normalizePriceComparison(rawComparison);
    
    if (!normalized) {
      return res.status(404).json({
        success: false,
        provider: 'amazon',
        error: {
          code: 'COMPARISON_FAILED',
          message: 'Impossible de comparer les prix'
        }
      });
    }
    
    res.json({
      success: true,
      provider: 'amazon',
      domain: 'ecommerce',
      id: asin,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });
    
  } catch (err) {
    logger.error('[Amazon] Erreur comparaison:', err);
    res.status(500).json({
      success: false,
      provider: 'amazon',
      error: {
        code: 'COMPARISON_ERROR',
        message: err.message
      }
    });
  }
});

/**
 * Liste des marketplaces supportés
 * GET /api/ecommerce/amazon/marketplaces
 */
router.get('/marketplaces', async (req, res) => {
  try {
    const marketplaces = amazonProvider.getSupportedMarketplaces();
    
    res.json({
      success: true,
      provider: 'amazon',
      domain: 'ecommerce',
      query: null,
      total: marketplaces.length,
      count: marketplaces.length,
      data: marketplaces,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error('[Amazon] Erreur marketplaces:', err);
    res.status(500).json({
      success: false,
      provider: 'amazon',
      error: {
        code: 'MARKETPLACES_ERROR',
        message: err.message
      }
    });
  }
});

/**
 * Liste des catégories supportées
 * GET /api/ecommerce/amazon/categories
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = amazonProvider.getSupportedCategories();
    
    res.json({
      success: true,
      provider: 'amazon',
      domain: 'ecommerce',
      query: null,
      total: categories.length,
      count: categories.length,
      data: categories,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error('[Amazon] Erreur catégories:', err);
    res.status(500).json({
      success: false,
      provider: 'amazon',
      error: {
        code: 'CATEGORIES_ERROR',
        message: err.message
      }
    });
  }
});

/**
 * Health check Amazon
 * GET /api/ecommerce/amazon/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await amazonProvider.healthCheck();
    
    const statusCode = health.healthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.healthy,
      data: health,
      domain: 'ecommerce',
      provider: 'amazon',
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error('[Amazon] Erreur health check:', err);
    res.status(503).json({
      success: false,
      provider: 'amazon',
      data: {
        healthy: false,
        status: 'error',
        message: err.message
      }
    });
  }
});

export default router;
