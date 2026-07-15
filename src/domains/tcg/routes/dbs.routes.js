/**
 * Routes Dragon Ball Super Card Game
 * Source: PostgreSQL local (DBS Masters + Fusion World)
 */

import { Router } from 'express';
import {
  searchDBSCards,
  getDBSCardDetails,
  getDBSSets,
  getDBSSetDetails,
  getDBSStats,
  healthCheck,
} from '../providers/dbs.provider.js';
import {
  normalizeSearchResults,
  normalizeCardDetails,
  normalizeSets,
  normalizeSetDetails,
} from '../normalizers/dbs.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = Router();

/**
 * GET /search
 * Recherche de cartes DBS (Masters + Fusion World)
 *
 * Query params:
 * - q: Recherche texte (requis)
 * - game: 'masters' ou 'fusion_world' (optionnel, défaut: les deux)
 * - color: Filtre couleur (Red, Blue, Green, Yellow, Black, etc.)
 * - type: Filtre type (LEADER, BATTLE, EXTRA, etc.)
 * - rarity: Filtre rareté
 * - set: Filtre set_code (BT1, FB01, etc.)
 * - max: Résultats max (défaut: 20)
 * - page: Page (défaut: 1)
 * - lang: Langue (défaut: fr)
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      game,
      color,
      type,
      rarity,
      set,
      limit,
      max = 20,
      page = 1,
      lang = 'fr',
      autoTrad = false,
    } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre "q" requis pour la recherche',
        provider: 'dbs',
      });
    }

    const rawData = await searchDBSCards(q, {
      game: game || null,
      color: color || null,
      type: type || null,
      rarity: rarity || null,
      set: set || null,
      max: parseInt(limit || max),
      page: parseInt(page),
    });

    const isAutoTrad = autoTrad === 'true' || autoTrad === '1' || autoTrad === true;
    const normalized = await normalizeSearchResults(rawData, { lang, autoTrad: isAutoTrad });

    res.json({
      success: true,
      provider: 'dbs',
      domain: 'tcg',
      query: q,
      total: rawData.total || 0,
      count: normalized.length,
      data: normalized,
      pagination: rawData.total > 0 ? {
        page: rawData.page || parseInt(page),
        limit: rawData.pageSize || parseInt(max),
        hasMore: (rawData.page || 1) * (rawData.pageSize || parseInt(max)) < (rawData.total || 0),
      } : null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true,
        game: game || 'all',
      },
    });
  } catch (error) {
    logger.error(`[DBS TCG] Route search error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'dbs',
      error: error.message,
    });
  }
});

/**
 * GET /card/:id
 * Détails d'une carte par card_number ou ID
 *
 * Params:
 * - id: card_number (ex: BT1-001) ou ID numérique
 * Query:
 * - game: 'masters' ou 'fusion_world' (si ambiguïté)
 */
router.get('/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { game, lang = 'fr', autoTrad = false } = req.query;

    const rawCard = await getDBSCardDetails(id, { game: game || null });
    const isAutoTrad = autoTrad === 'true' || autoTrad === '1' || autoTrad === true;
    const normalized = await normalizeCardDetails(rawCard, { lang, autoTrad: isAutoTrad });

    res.json({
      success: true,
      provider: 'dbs',
      domain: 'tcg',
      id: normalized.id,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const status = error.message.includes('non trouvé') ? 404 : 500;
    logger.error(`[DBS TCG] Route card error: ${error.message}`);
    res.status(status).json({
      success: false,
      provider: 'dbs',
      error: error.message,
    });
  }
});

/**
 * GET /sets
 * Liste des sets DBS
 *
 * Query:
 * - game: 'masters' ou 'fusion_world'
 */
router.get('/sets', async (req, res) => {
  try {
    const { game, lang = 'fr' } = req.query;

    const rawData = await getDBSSets({ game: game || null });
    const normalized = await normalizeSets(rawData, { lang });

    res.json({
      success: true,
      provider: 'dbs',
      domain: 'tcg',
      query: game || null,
      total: rawData.total || 0,
      count: normalized.length,
      data: normalized,
      pagination: null,
      meta: {
        game: game || 'all',
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`[DBS TCG] Route sets error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'dbs',
      error: error.message,
    });
  }
});

/**
 * GET /sets/:code
 * Détails d'un set avec ses cartes
 */
router.get('/sets/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { game, lang = 'fr' } = req.query;

    const rawData = await getDBSSetDetails(code, { game: game || null });
    const normalized = await normalizeSetDetails(rawData, { lang });

    res.json({
      success: true,
      provider: 'dbs',
      domain: 'tcg',
      id: `dbs:${code}`,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const status = error.message.includes('non trouvé') ? 404 : 500;
    logger.error(`[DBS TCG] Route set details error: ${error.message}`);
    res.status(status).json({
      success: false,
      provider: 'dbs',
      error: error.message,
    });
  }
});

/**
 * GET /stats
 * Statistiques de la base DBS
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getDBSStats();

    res.json({
      success: true,
      provider: 'dbs',
      data: stats,
      meta: {
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`[DBS TCG] Route stats error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'dbs',
      error: error.message,
    });
  }
});

/**
 * GET /health
 * Health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    res.json({
      success: true,
      provider: 'dbs',
      ...health,
      meta: {
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      provider: 'dbs',
      healthy: false,
      error: error.message,
    });
  }
});

export default router;
