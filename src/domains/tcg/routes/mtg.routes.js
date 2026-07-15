/**
 * Routes Magic: The Gathering
 * API: Scryfall
 */

import { Router } from 'express';
import {
  searchMTGCards,
  getMTGCardDetails,
  getMTGSets,
  healthCheck
} from '../providers/mtg.provider.js';
import {
  normalizeSearchResults,
  normalizeCardDetails,
  normalizeSets
} from '../normalizers/mtg.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = Router();

/**
 * GET /search
 * Recherche de cartes Magic
 * 
 * Query params:
 * - q: Recherche (requis) - nom ou syntaxe Scryfall
 * - lang: Langue (défaut: en) - en, fr, es, de, it, pt, ja, ko, ru, zh-Hans, zh-Hant
 * - max: Résultats max (défaut: 20)
 * - order: Tri (name, set, released, rarity, color, usd, eur, cmc, power)
 * - unique: Mode unicité (cards, art, prints)
 * - dir: Direction tri (auto, asc, desc)
 * - autoTrad: Traduction auto (true/false)
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      lang = 'en',
      limit,
      max = 20,
      order = 'name',
      unique = 'cards',
      dir = 'auto',
      autoTrad = false
    } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre "q" requis pour la recherche',
        provider: 'mtg',
        hint: 'Exemples: q=lightning bolt, q=t:creature c:red, q=mana>=3'
      });
    }

    logger.info(`[MTG] Recherche: ${q}`);

    const rawData = await searchMTGCards(q, {
      lang,
      max: parseInt(limit || max),
      order,
      unique,
      dir
    });

    const normalized = await normalizeSearchResults(rawData, {
      lang,
      autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true
    });

    res.json({
      success: true,
      provider: 'mtg',
      domain: 'tcg',
      query: q,
      total: rawData.total_cards || 0,
      count: normalized.length,
      data: normalized,
      pagination: rawData.hasMore ? {
        page: 1,
        limit: parseInt(max),
        hasMore: true,
      } : null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true
      }
    });

  } catch (error) {
    logger.error(`[MTG] Erreur recherche: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'mtg'
    });
  }
});

/**
 * GET /card/:id
 * Détails d'une carte par ID Scryfall
 * 
 * Params:
 * - id: ID Scryfall de la carte (UUID) ou set/number
 * 
 * Query params:
 * - lang: Langue (défaut: en)
 * - autoTrad: Traduction auto (true/false)
 */
router.get('/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'en', autoTrad = false } = req.query;

    logger.info(`[MTG] Détails carte: ${id}`);

    const rawCard = await getMTGCardDetails(id, { lang });
    const normalized = await normalizeCardDetails(rawCard, {
      lang,
      autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true
    });

    res.json({
      success: true,
      provider: 'mtg',
      domain: 'tcg',
      id: normalized.id,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true
      }
    });

  } catch (error) {
    logger.error(`[MTG] Erreur détails: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'mtg'
    });
  }
});

/**
 * GET /sets
 * Liste des sets Magic
 * 
 * Query params:
 * - lang: Langue (défaut: en)
 */
router.get('/sets', async (req, res) => {
  try {
    const { lang = 'en' } = req.query;

    logger.info(`[MTG] Liste sets`);

    const rawData = await getMTGSets();
    const normalized = await normalizeSets(rawData, { lang });

    res.json({
      success: true,
      provider: 'mtg',
      domain: 'tcg',
      query: null,
      total: rawData.total_cards || 0,
      count: normalized.length,
      data: normalized,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang
      }
    });

  } catch (error) {
    logger.error(`[MTG] Erreur sets: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'mtg'
    });
  }
});

/**
 * GET /health
 * Health check API Scryfall
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.json({
      success: true,
      provider: 'mtg',
      status: health.healthy ? 'healthy' : 'unhealthy',
      ...health
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      provider: 'mtg',
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
