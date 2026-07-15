/**
 * @fileoverview Routes Lulu-Berlu - Endpoints API
 * @module domains/collectibles/routes/luluberlu
 * 
 * Routes pour le provider Lulu-Berlu (figurines vintage françaises)
 */

import express from 'express';
import { logger } from '../../../shared/utils/logger.js';
import {
  searchLuluBerlu,
  getLuluBerluDetails,
  healthCheck
} from '../providers/luluberlu.provider.js';
import {
  normalizeSearchResults,
  normalizeDetails
} from '../normalizers/luluberlu.normalizer.js';

const router = express.Router();

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/collectibles/luluberlu/health
 * Vérifie l'état du provider Lulu-Berlu
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.json({
      success: true,
      data: {
        provider: 'lulu-berlu',
        ...health
      }
    });
  } catch (error) {
    logger.error(`[LuluBerlu] Health check error: ${error.message}`);
    
    res.status(503).json({
      success: false,
      error: {
        message: 'Service unavailable',
        details: error.message
      }
    });
  }
});

// ============================================================================
// SEARCH
// ============================================================================

/**
 * GET /api/collectibles/luluberlu/search
 * Recherche de produits sur Lulu-Berlu
 * 
 * Query params:
 * - q: Terme de recherche (requis)
 * - max: Nombre max de résultats (défaut: 12)
 * - lang: Langue cible (défaut: fr)
 * - autoTrad: Activer traduction auto (défaut: false)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit, max = 12, lang = 'fr', autoTrad = 'false' } = req.query;

    // Validation
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Paramètre "q" requis',
          details: 'Le paramètre de recherche "q" doit être une chaîne non vide'
        }
      });
    }

    const maxResults = parseInt(limit || max, 10);
    if (isNaN(maxResults) || maxResults < 1 || maxResults > 100) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Paramètre "max" invalide',
          details: 'Le paramètre "max" doit être un nombre entre 1 et 100'
        }
      });
    }

    const targetLang = lang || 'fr';
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';

    logger.info(`[LuluBerlu] GET /search - q="${q}", max=${maxResults}, lang=${targetLang}, autoTrad=${enableAutoTrad}`);

    // Recherche
    const rawResults = await searchLuluBerlu(q, {
      maxResults,
      lang: targetLang,
      autoTrad: enableAutoTrad
    });

    // Normalisation
    const normalized = normalizeSearchResults(rawResults);

    res.json(normalized);

  } catch (error) {
    logger.error(`[LuluBerlu] Search error: ${error.message}`);
    
    res.status(500).json({
      success: false,
      error: {
        message: 'Erreur lors de la recherche',
        details: error.message
      }
    });
  }
});

// ============================================================================
// DETAILS
// ============================================================================

/**
 * GET /api/collectibles/luluberlu/details
 * Récupère les détails d'un produit par URL
 * 
 * Query params:
 * - url: URL complète du produit (requis) - Ex: https://www.lulu-berlu.com/...a12345.html
 * - lang: Langue cible (défaut: fr)
 * - autoTrad: Activer traduction auto (défaut: false)
 */
router.get('/details', async (req, res) => {
  try {
    const { url, lang = 'fr', autoTrad = 'false' } = req.query;

    // Validation
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Paramètre "url" requis',
          details: 'Le paramètre "url" doit être une URL complète du produit (ex: https://www.lulu-berlu.com/...a12345.html)'
        }
      });
    }

    const targetLang = lang || 'fr';
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';

    logger.info(`[LuluBerlu] GET /details - url="${url}", lang=${targetLang}, autoTrad=${enableAutoTrad}`);

    // Récupération des détails
    const rawDetails = await getLuluBerluDetails(url, {
      lang: targetLang,
      autoTrad: enableAutoTrad
    });

    // Normalisation
    const normalized = normalizeDetails(rawDetails);

    res.json({
      success: true,
      provider: 'luluberlu',
      domain: 'collectibles',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });

  } catch (error) {
    logger.error(`[LuluBerlu] Details error: ${error.message}`);
    
    const statusCode = error.message.includes('non trouvé') ? 404 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: {
        message: statusCode === 404 ? 'Produit non trouvé' : 'Erreur lors de la récupération des détails',
        details: error.message
      }
    });
  }
});

// ============================================================================
// ITEM BY PATH
// ============================================================================

/**
 * GET /api/collectibles/luluberlu/item/:path
 * Récupère les détails d'un produit par son chemin/URL
 * 
 * Params:
 * - path: Chemin du produit (ex: "figurines/star-wars-a12345.html")
 * 
 * Query params:
 * - lang: Langue cible (défaut: fr)
 * - autoTrad: Activer traduction auto (défaut: false)
 */
router.get('/item/:path(*)', async (req, res) => {
  try {
    const { path } = req.params;
    const { lang = 'fr', autoTrad = 'false' } = req.query;

    // Validation
    if (!path || path.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Paramètre "path" requis',
          details: 'Le chemin du produit doit être spécifié'
        }
      });
    }

    const targetLang = lang || 'fr';
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';

    logger.info(`[LuluBerlu] GET /item/${path} - lang=${targetLang}, autoTrad=${enableAutoTrad}`);

    // Récupération des détails via le chemin
    const rawDetails = await getLuluBerluDetails(path, {
      lang: targetLang,
      autoTrad: enableAutoTrad
    });

    // Normalisation
    const normalized = normalizeDetails(rawDetails);

    res.json({
      success: true,
      provider: 'luluberlu',
      domain: 'collectibles',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });

  } catch (error) {
    logger.error(`[LuluBerlu] Item path error: ${error.message}`);
    
    const statusCode = error.message.includes('non trouvé') ? 404 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: {
        message: statusCode === 404 ? 'Produit non trouvé' : 'Erreur lors de la récupération des détails',
        details: error.message
      }
    });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;
