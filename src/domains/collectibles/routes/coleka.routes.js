/**
 * src/domains/collectibles/routes/coleka.routes.js - Routes Coleka
 * 
 * Endpoints pour le provider Coleka
 * 
 * @module domains/collectibles/routes/coleka
 */

import express from 'express';
import { logger } from '../../../shared/utils/logger.js';
import {
  searchColeka,
  getColekaDetails,
  browseColekaCategories,
  healthCheck
} from '../providers/coleka.provider.js';
import {
  normalizeSearchResults,
  normalizeDetails,
  normalizeCategories
} from '../normalizers/coleka.normalizer.js';

const router = express.Router();

/**
 * GET /search - Recherche sur Coleka
 * 
 * Query params:
 * - q: terme de recherche (requis)
 * - max: nombre max de résultats (défaut: 20)
 * - lang: langue (fr, en) (défaut: fr)
 * - category: filtre par catégorie (lego, funko, figurines, etc.)
 * - autoTrad: activer traduction automatique (1 ou true)
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q: searchTerm,
      limit,
      max,
      lang,
      category,
      autoTrad
    } = req.query;
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: 'Le paramètre "q" (terme de recherche) est requis'
        }
      });
    }
    
    const maxResults = parseInt(limit || max, 10) || 20;
    const targetLang = lang || 'fr';
    const autoTradEnabled = autoTrad === '1' || autoTrad === 'true';
    
    logger.info(`[Coleka] Recherche: "${searchTerm}" (max: ${maxResults}, lang: ${targetLang}, category: ${category || 'all'})`);
    
    const rawData = await searchColeka(searchTerm, {
      maxResults,
      lang: targetLang,
      category: category || null,
      autoTrad: autoTradEnabled
    });
    
    const normalized = normalizeSearchResults(rawData);
    
    res.json(normalized);
    
  } catch (error) {
    logger.error(`[Coleka] Erreur recherche: ${error.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * GET /details - Détails d'un item via URL Tako_Api
 * 
 * Query params:
 * - url: URL Tako_Api format coleka://item/{path}
 * - lang: langue (fr, en) (défaut: fr)
 * - autoTrad: activer traduction automatique (1 ou true)
 */
router.get('/details', async (req, res) => {
  try {
    const { url, lang, autoTrad } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: 'Le paramètre "url" est requis'
        }
      });
    }
    
    // Parser l'URL Tako_Api (format: coleka://item/{path})
    const urlPattern = /^coleka:\/\/item\/(.+)$/;
    const match = url.match(urlPattern);
    
    if (!match) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_URL',
          message: 'Format d\'URL invalide. Format attendu: coleka://item/{path}'
        }
      });
    }
    
    const itemPath = match[1];
    const targetLang = lang || 'fr';
    const autoTradEnabled = autoTrad === '1' || autoTrad === 'true';
    
    logger.info(`[Coleka] Détails item: ${itemPath} (lang: ${targetLang})`);
    
    const rawData = await getColekaDetails(itemPath, {
      lang: targetLang,
      autoTrad: autoTradEnabled
    });
    
    const normalized = normalizeDetails(rawData);
    
    res.json({
      success: true,
      provider: 'coleka',
      domain: 'collectibles',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
    
  } catch (error) {
    logger.error(`[Coleka] Erreur détails: ${error.message}`);
    const statusCode = error.message.includes('non trouvé') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.message.includes('non trouvé') ? 'NOT_FOUND' : 'DETAILS_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * GET /item/:itemPath - Détails d'un item par path direct
 * 
 * Path params:
 * - itemPath: chemin de l'item (peut contenir des slashes, ex: fr/lego/star-wars/75192_i123)
 * 
 * Query params:
 * - lang: langue (fr, en) (défaut: fr)
 * - autoTrad: activer traduction automatique (1 ou true)
 */
router.get('/item/*', async (req, res) => {
  try {
    // Récupérer le path complet depuis l'URL (après /item/)
    const itemPath = req.params[0];
    const { lang, autoTrad } = req.query;
    
    if (!itemPath) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: 'Le chemin de l\'item est requis'
        }
      });
    }
    
    const targetLang = lang || 'fr';
    const autoTradEnabled = autoTrad === '1' || autoTrad === 'true';
    
    logger.info(`[Coleka] Détails item (direct): ${itemPath} (lang: ${targetLang})`);
    
    const rawData = await getColekaDetails(itemPath, {
      lang: targetLang,
      autoTrad: autoTradEnabled
    });
    
    const normalized = normalizeDetails(rawData);
    
    res.json({
      success: true,
      provider: 'coleka',
      domain: 'collectibles',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
    
  } catch (error) {
    logger.error(`[Coleka] Erreur détails (direct): ${error.message}`);
    const statusCode = error.message.includes('non trouvé') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.message.includes('non trouvé') ? 'NOT_FOUND' : 'DETAILS_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * GET /categories - Liste des catégories disponibles
 * 
 * Query params:
 * - lang: langue (fr, en) (défaut: fr)
 */
router.get('/categories', async (req, res) => {
  try {
    const { lang } = req.query;
    const targetLang = lang || 'fr';
    
    logger.info(`[Coleka] Liste catégories (lang: ${targetLang})`);
    
    const rawData = await browseColekaCategories({ lang: targetLang });
    const normalized = normalizeCategories(rawData);
    
    res.json(normalized);
    
  } catch (error) {
    logger.error(`[Coleka] Erreur catégories: ${error.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'CATEGORIES_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * GET /health - Health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.json({
      success: true,
      data: health
    });
    
  } catch (error) {
    logger.error(`[Coleka] Erreur health check: ${error.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: error.message
      }
    });
  }
});

export default router;
