/**
 * Transformerland Routes
 * 
 * API routes for Transformerland collectibles provider
 * 
 * @module domains/collectibles/routes/transformerland
 */

import express from 'express';
import {
  searchTransformerland,
  getTransformerlandDetails,
  healthCheck
} from '../providers/transformerland.provider.js';
import {
  normalizeSearchResults,
  normalizeDetails
} from '../normalizers/transformerland.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();

/**
 * GET /search
 * Search Transformerland
 * 
 * Query parameters:
 * - q: Search query (required)
 * - max: Maximum results (default: 24)
 * - lang: Target language code (default: 'en')
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
    
    logger.info(`[Transformerland] Searching Transformerland: q="${q}", max=${maxResults}, lang=${lang}, autoTrad=${shouldTranslate}`);
    
    const results = await searchTransformerland(q, {
      maxResults,
      lang: lang || 'en',
      autoTrad: shouldTranslate
    });
    
    const normalized = normalizeSearchResults(results);
    
    res.json(normalized);
  } catch (error) {
    logger.error(`[Transformerland] Search error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'transformerland',
      error: error.message
    });
  }
});

/**
 * GET /details
 * Get item details by ID or URL
 * 
 * Query parameters:
 * - id: Toy ID or URL (required)
 * - lang: Target language code (default: 'en')
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
    
    logger.info(`[Transformerland] Getting Transformerland details: id="${id}", lang=${lang}, autoTrad=${shouldTranslate}`);
    
    const details = await getTransformerlandDetails(id, {
      lang: lang || 'en',
      autoTrad: shouldTranslate
    });
    
    const normalized = normalizeDetails(details);
    
    res.json({
      success: true,
      provider: 'transformerland',
      domain: 'collectibles',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    logger.error(`[Transformerland] Details error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'transformerland',
      error: error.message
    });
  }
});

/**
 * GET /item/:id
 * Get item details by ID (path parameter)
 * 
 * Path parameters:
 * - id: Toy ID
 * 
 * Query parameters:
 * - lang: Target language code (default: 'en')
 * - autoTrad: Enable automatic translation (default: false)
 */
router.get('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang, autoTrad } = req.query;
    
    const shouldTranslate = autoTrad === 'true' || autoTrad === '1' || autoTrad === 1;
    
    logger.info(`[Transformerland] Getting Transformerland item: id="${id}", lang=${lang}, autoTrad=${shouldTranslate}`);
    
    const details = await getTransformerlandDetails(id, {
      lang: lang || 'en',
      autoTrad: shouldTranslate
    });
    
    const normalized = normalizeDetails(details);
    
    res.json({
      success: true,
      provider: 'transformerland',
      domain: 'collectibles',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    logger.error(`[Transformerland] Item error: ${error.message}`);
    res.status(500).json({
      success: false,
      provider: 'transformerland',
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
    logger.error(`[Transformerland] Health check error: ${error.message}`);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
