/**
 * Paninimania Routes
 * 
 * API routes for Paninimania sticker albums provider
 * 
 * @module domains/sticker-albums/routes/paninimania
 */

import express from 'express';
import {
  searchPaninimania,
  getPaninimaniAlbumDetails,
  healthCheck
} from '../providers/paninimania.provider.js';
import {
  normalizeSearchResults,
  normalizeDetails
} from '../normalizers/paninimania.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();

/**
 * GET /search
 * Search Paninimania albums
 * 
 * Query parameters:
 * - q: Search query (required)
 * - max: Maximum results (default: 24)
 * - lang: Target language code (default: 'fr')
 * - autoTrad: Enable automatic translation (default: false)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit, max, lang, autoTrad } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: q'
      });
    }
    
    const maxResults = parseInt(limit || max, 10) || 24;
    const shouldTranslate = autoTrad === 'true' || autoTrad === '1' || autoTrad === 1;
    
    logger.info(`[Paninimania] Searching: q="${q}", max=${maxResults}, lang=${lang}, autoTrad=${shouldTranslate}`);
    
    const results = await searchPaninimania(q, {
      maxResults,
      lang: lang || 'fr',
      autoTrad: shouldTranslate
    });
    
    const normalized = normalizeSearchResults(results);
    
    res.json(normalized);
  } catch (error) {
    logger.error(`[Paninimania] Search error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'paninimania',
      error: error.message
    });
  }
});

/**
 * GET /details
 * Get album details by ID or URL
 * 
 * Query parameters:
 * - id: Album ID or URL (required)
 * - lang: Target language code (default: 'fr')
 * - autoTrad: Enable automatic translation (default: false)
 */
router.get('/details', async (req, res) => {
  try {
    const { id, lang, autoTrad } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: id'
      });
    }
    
    const shouldTranslate = autoTrad === 'true' || autoTrad === '1' || autoTrad === 1;
    
    logger.info(`[Paninimania] Getting details: id="${id}", lang=${lang}, autoTrad=${shouldTranslate}`);
    
    const details = await getPaninimaniAlbumDetails(id, {
      lang: lang || 'fr',
      autoTrad: shouldTranslate
    });
    
    const normalized = normalizeDetails(details);
    
    res.json({
      success: true,
      provider: 'paninimania',
      domain: 'sticker-albums',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    logger.error(`[Paninimania] Details error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'paninimania',
      error: error.message
    });
  }
});

/**
 * GET /album/:id
 * Get album details by ID (path parameter)
 * 
 * Path parameters:
 * - id: Album ID
 * 
 * Query parameters:
 * - lang: Target language code (default: 'fr')
 * - autoTrad: Enable automatic translation (default: false)
 */
router.get('/album/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang, autoTrad } = req.query;
    
    const shouldTranslate = autoTrad === 'true' || autoTrad === '1' || autoTrad === 1;
    
    logger.info(`[Paninimania] Getting album: id="${id}", lang=${lang}, autoTrad=${shouldTranslate}`);
    
    const details = await getPaninimaniAlbumDetails(id, {
      lang: lang || 'fr',
      autoTrad: shouldTranslate
    });
    
    const normalized = normalizeDetails(details);
    
    res.json({
      success: true,
      provider: 'paninimania',
      domain: 'sticker-albums',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    logger.error(`[Paninimania] Album error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'paninimania',
      error: error.message
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.json(health);
  } catch (error) {
    logger.error(`[Paninimania] Health check error: ${error.message}`);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
