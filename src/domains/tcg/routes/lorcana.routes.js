/**
 * Routes Disney Lorcana
 * Gestion des endpoints pour les cartes Lorcana
 */

import express from 'express';
import {
  searchLorcanaCards,
  getLorcanaCardDetails,
  getLorcanaSets,
  healthCheck
} from '../providers/lorcana.provider.js';
import {
  normalizeSearchResults,
  normalizeCardDetails,
  normalizeSets
} from '../normalizers/lorcana.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();

/**
 * GET /api/tcg/lorcana/search
 * Recherche de cartes Lorcana
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      color,
      type,
      rarity,
      set,
      cost,
      inkable,
      max = '100',
      limit,
      page = '1',
      lang = 'en',
      autoTrad = 'false'
    } = req.query;
    
    // Validation
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required'
      });
    }
    
    const maxResults = Math.min(parseInt(limit || max) || 100, 250);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Validation langue
    if (!['en', 'fr', 'de', 'it'].includes(lang)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lang. Supported: en, fr, de, it'
      });
    }
    
    // Recherche via provider
    const rawData = await searchLorcanaCards(q, {
      color,
      type,
      rarity,
      set,
      cost: cost ? parseInt(cost) : undefined,
      inkable: inkable === 'true' ? true : inkable === 'false' ? false : undefined,
      max: maxResults,
      page: pageNum,
      lang
    });
    
    // Normalisation
    const normalizedData = await normalizeSearchResults(rawData, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'lorcana',
      domain: 'tcg',
      query: q,
      total: rawData.total_cards || 0,
      count: normalizedData.length,
      data: normalizedData,
      pagination: (rawData.total_pages || 1) > 1 ? {
        page: rawData.page || 1,
        limit: maxResults,
        hasMore: (rawData.page || 1) < (rawData.total_pages || 1),
      } : null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: enableAutoTrad,
        ...(color && { color }),
        ...(type && { type }),
        ...(rarity && { rarity }),
        ...(set && { set }),
        ...(cost && { cost: parseInt(cost) }),
        ...(inkable && { inkable: inkable === 'true' })
      }
    });
    
  } catch (error) {
    logger.error(`[Lorcana Routes] Search error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/lorcana/card/:id
 * Détails d'une carte Lorcana
 */
router.get('/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'en', autoTrad = 'false' } = req.query;
    
    // Validation langue
    if (!['en', 'fr', 'de', 'it'].includes(lang)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lang. Supported: en, fr, de, it'
      });
    }
    
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Récupérer la carte
    const rawCard = await getLorcanaCardDetails(id, { lang });
    
    // Normalisation
    const normalizedCard = await normalizeCardDetails(rawCard, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'lorcana',
      domain: 'tcg',
      id: normalizedCard.id,
      data: normalizedCard,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: enableAutoTrad
      }
    });
    
  } catch (error) {
    logger.error(`[Lorcana Routes] Card details error: ${error.message}`);
    
    if (error.message.includes('Card not found')) {
      return res.status(404).json({
        success: false,
        error: `Card not found: ${req.params.id}`
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/lorcana/sets
 * Liste des sets Lorcana
 */
router.get('/sets', async (req, res) => {
  try {
    const { lang = 'en' } = req.query;
    
    // Validation langue
    if (!['en', 'fr', 'de', 'it'].includes(lang)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lang. Supported: en, fr, de, it'
      });
    }
    
    // Récupérer les sets
    const rawSets = await getLorcanaSets({ lang });
    
    // Normalisation
    const normalizedSets = await normalizeSets(rawSets, { lang });
    
    res.json({
      success: true,
      provider: 'lorcana',
      domain: 'tcg',
      query: null,
      total: normalizedSets.length,
      count: normalizedSets.length,
      data: normalizedSets,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang
      }
    });
    
  } catch (error) {
    logger.error(`[Lorcana Routes] Sets error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/lorcana/health
 * Health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.status(health.healthy ? 200 : 503).json({
      success: true,
      provider: 'lorcana',
      ...health
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      provider: 'lorcana',
      healthy: false,
      message: error.message
    });
  }
});

export default router;
