/**
 * Carddass Routes - Endpoints API
 * 
 * Routes pour le provider Carddass (cartes à collectionner japonaises).
 * Source : Archive PostgreSQL depuis animecollection.fr
 * 
 * Routes disponibles :
 * - GET /health                          — État du provider
 * - GET /stats                           — Statistiques de l'archive
 * - GET /search                          — Recherche full-text
 * - GET /licenses                        — Liste des licences
 * - GET /licenses/:id                    — Détails d'une licence
 * - GET /licenses/:id/collections        — Collections d'une licence
 * - GET /collections/:id/series          — Séries d'une collection
 * - GET /series/:id/cards                — Cartes d'une série
 * - GET /cards/:id                       — Détails d'une carte
 * - GET /cards/:id/images                — Images supplémentaires d'une carte
 * 
 * @module domains/collectibles/routes/carddass
 */

import express from 'express';
import { logger } from '../../../shared/utils/logger.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import {
  getLicenses,
  getLicenseById,
  getCollections,
  getSeries,
  getCards,
  getCardById,
  getCardImages,
  searchCards,
  getStats,
  healthCheck
} from '../providers/carddass.provider.js';
import {
  normalizeSearchResults,
  normalizeDetails,
  normalizeLicenses,
  normalizeCollections,
  normalizeSeries,
  normalizeCards
} from '../normalizers/carddass.normalizer.js';

const router = express.Router();

// ============================================================================
// HEALTH CHECK & STATS
// ============================================================================

/**
 * GET /api/collectibles/carddass/health
 * Vérifie l'état du provider Carddass
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await healthCheck();
  const statusCode = health.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    success: health.status === 'healthy',
    data: health
  });
}));

/**
 * GET /api/collectibles/carddass/stats
 * Statistiques de l'archive Carddass
 * 
 * Query params:
 * - site: Filtrer par source ('animecollection' ou 'dbzcollection')
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const { site } = req.query;
  const validSites = ['animecollection', 'dbzcollection'];
  const siteFilter = site && validSites.includes(site) ? site : null;

  const stats = await getStats({ site: siteFilter });

  const sourceLabel = siteFilter === 'dbzcollection' ? 'dbzcollection.fr'
    : siteFilter === 'animecollection' ? 'animecollection.fr'
    : 'animecollection.fr + dbzcollection.fr';

  res.json({
    success: true,
    data: {
      provider: 'carddass',
      source: sourceLabel,
      ...stats,
      timestamp: new Date().toISOString()
    }
  });
}));

// ============================================================================
// SEARCH
// ============================================================================

/**
 * GET /api/collectibles/carddass/search
 * Recherche full-text dans les cartes Carddass
 * 
 * Query params:
 * - q: Terme de recherche (requis)
 * - page: Page (défaut: 1)
 * - pageSize: Résultats par page (défaut: 20, max: 100)
 * - rarity: Filtre par rareté (optionnel, ex: "Prism", "Regular")
 * - license: Filtre par licence (optionnel, ex: "Dragon Ball")
 * - site: Filtre par source ('animecollection' ou 'dbzcollection')
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, page = 1, limit, pageSize = 20, rarity, license, site } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'Le paramètre "q" (terme de recherche) est requis'
      }
    });
  }

  const validSites = ['animecollection', 'dbzcollection'];
  const siteFilter = site && validSites.includes(site) ? site : null;

  logger.info(`[Carddass] Recherche: "${q}" (page: ${page}, rarity: ${rarity || 'all'}, license: ${license || 'all'}, site: ${siteFilter || 'all'})`);

  const rawData = await searchCards(q.trim(), {
    page: parseInt(page, 10),
    pageSize: Math.min(parseInt(limit || pageSize, 10) || 20, 100),
    rarity: rarity || null,
    license: license || null,
    site: siteFilter
  });

  const normalized = normalizeSearchResults(rawData);

  res.json(normalized);
}));

// ============================================================================
// LICENSES
// ============================================================================

/**
 * GET /api/collectibles/carddass/licenses
 * Liste toutes les licences Carddass
 * 
 * Query params:
 * - page: Page (défaut: 1)
 * - pageSize: Résultats par page (défaut: 50, max: 100)
 * - site: Filtre par source ('animecollection' ou 'dbzcollection')
 */
router.get('/licenses', asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 50, site } = req.query;
  const validSites = ['animecollection', 'dbzcollection'];
  const siteFilter = site && validSites.includes(site) ? site : null;

  logger.info(`[Carddass] Liste licences (page: ${page}, site: ${siteFilter || 'all'})`);

  const rawData = await getLicenses({
    page: parseInt(page, 10),
    pageSize: Math.min(parseInt(pageSize, 10) || 50, 100),
    site: siteFilter
  });

  const normalized = normalizeLicenses(rawData);

  res.json(normalized);
}));

/**
 * GET /api/collectibles/carddass/licenses/:id
 * Détails d'une licence spécifique
 * 
 * Path params:
 * - id: ID de la licence (interne ou source_id)
 */
router.get('/licenses/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info(`[Carddass] Détails licence: ${id}`);

  const data = await getLicenseById(id);

  if (!data) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Licence non trouvée: ${id}`
      }
    });
  }

  res.json({
    success: true,
    provider: 'carddass',
    domain: 'collectibles',
    id: `carddass:${data.id}`,
    data,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

/**
 * GET /api/collectibles/carddass/licenses/:id/collections
 * Collections d'une licence
 * 
 * Path params:
 * - id: ID de la licence
 * 
 * Query params:
 * - page: Page (défaut: 1)
 * - pageSize: Résultats par page (défaut: 50)
 */
router.get('/licenses/:id/collections', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 50 } = req.query;

  logger.info(`[Carddass] Collections de la licence ${id} (page: ${page})`);

  try {
    const rawData = await getCollections(id, {
      page: parseInt(page, 10),
      pageSize: Math.min(parseInt(pageSize, 10) || 50, 100)
    });

    const normalized = normalizeCollections(rawData);

    res.json(normalized);
  } catch (error) {
    if (error.message.includes('non trouvée')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
    }
    throw error;
  }
}));

// ============================================================================
// COLLECTIONS → SERIES
// ============================================================================

/**
 * GET /api/collectibles/carddass/collections/:id/series
 * Séries d'une collection
 * 
 * Path params:
 * - id: ID de la collection
 * 
 * Query params:
 * - page: Page (défaut: 1)
 * - pageSize: Résultats par page (défaut: 50)
 */
router.get('/collections/:id/series', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 50 } = req.query;

  logger.info(`[Carddass] Séries de la collection ${id} (page: ${page})`);

  try {
    const rawData = await getSeries(id, {
      page: parseInt(page, 10),
      pageSize: Math.min(parseInt(pageSize, 10) || 50, 100)
    });

    const normalized = normalizeSeries(rawData);

    res.json(normalized);
  } catch (error) {
    if (error.message.includes('non trouvée')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
    }
    throw error;
  }
}));

// ============================================================================
// SERIES → CARDS
// ============================================================================

/**
 * GET /api/collectibles/carddass/series/:id/cards
 * Cartes d'une série
 * 
 * Path params:
 * - id: ID de la série
 * 
 * Query params:
 * - page: Page (défaut: 1)
 * - pageSize: Résultats par page (défaut: 50)
 * - rarity: Filtre par rareté (optionnel)
 */
router.get('/series/:id/cards', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 50, rarity } = req.query;

  logger.info(`[Carddass] Cartes de la série ${id} (page: ${page}, rarity: ${rarity || 'all'})`);

  try {
    const rawData = await getCards(id, {
      page: parseInt(page, 10),
      pageSize: Math.min(parseInt(pageSize, 10) || 50, 100),
      rarity: rarity || null
    });

    const normalized = normalizeCards(rawData);

    res.json(normalized);
  } catch (error) {
    if (error.message.includes('non trouvée')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
    }
    throw error;
  }
}));

// ============================================================================
// CARDS
// ============================================================================

/**
 * GET /api/collectibles/carddass/cards/:id
 * Détails complets d'une carte
 * 
 * Path params:
 * - id: ID de la carte (interne ou source_id)
 */
router.get('/cards/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info(`[Carddass] Détails carte: ${id}`);

  const rawData = await getCardById(id);

  if (!rawData) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Carte non trouvée: ${id}`
      }
    });
  }

  const normalized = normalizeDetails(rawData);

  res.json({
    success: true,
    provider: 'carddass',
    domain: 'collectibles',
    id: normalized?.id || `carddass:${id}`,
    data: normalized,
    meta: {
      source: 'database',
      fetchedAt: new Date().toISOString()
    }
  });
}));

/**
 * GET /api/collectibles/carddass/cards/:id/images
 * Images supplémentaires d'une carte (verso, variantes, etc.)
 * 
 * Path params:
 * - id: ID de la carte (interne ou source_id)
 */
router.get('/cards/:id/images', asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.info(`[Carddass] Images supplémentaires carte: ${id}`);

  try {
    const data = await getCardImages(id);

    res.json({
      success: true,
      provider: 'carddass',
      domain: 'collectibles',
      id: `carddass:${data.cardId || id}`,
      data,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error.message.includes('non trouvée')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
    }
    throw error;
  }
}));

// ============================================================================
// EXPORT
// ============================================================================

export default router;
