/**
 * JeuxVideo.com (JVC) Routes
 * 
 * Endpoints for JVC videogame data with translation support.
 * JVC is a French gaming website, so content is already in French.
 * 
 * @module routes/jvc
 */

import express from 'express';
import * as jvcProvider from '../providers/jvc.provider.js';
import * as jvcNormalizer from '../normalizers/jvc.normalizer.js';
import { translateVideoGameGenres, translateText, isAutoTradEnabled, extractLangCode } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('JvcRoutes');
const router = express.Router();

/**
 * Translate game genres and descriptions
 * @param {Array|Object} games - Game or array of games
 * @param {boolean} autoTrad - Auto-translation enabled
 * @param {string} targetLang - Target language
 * @returns {Promise<Array|Object>} Translated games
 */
async function translateGameContent(games, autoTrad, targetLang) {
  if (!autoTrad || !targetLang) {
    return games;
  }
  
  const isArray = Array.isArray(games);
  const gamesArray = isArray ? games : [games];
  
  const translatedGames = await Promise.all(gamesArray.map(async (game) => {
    if (!game) return game;
    
    const result = { ...game };
    
    // Translate genres (stored in details.genres)
    if (game.details?.genres && game.details.genres.length > 0) {
      try {
        const { terms: translatedGenres } = await translateVideoGameGenres(
          game.details.genres,
          targetLang
        );
        result.details = {
          ...result.details,
          genresOriginal: game.details.genres,
          genres: translatedGenres
        };
      } catch (error) {
        log.warn(`Genre translation failed: ${error.message}`);
      }
    }
    
    // Translate description (only if target lang is not French)
    // JVC content is already in French
    if (targetLang !== 'fr' && game.description && game.description.length > 20) {
      try {
        const translated = await translateText(
          game.description,
          targetLang,
          { enabled: true, sourceLang: 'fr' }
        );
        
        if (translated.translated) {
          result.details = { ...result.details, descriptionOriginal: game.description };
          result.description = translated.text;
        }
      } catch (error) {
        log.warn(`Summary translation failed: ${error.message}`);
      }
    }
    
    return result;
  }));
  
  return isArray ? translatedGames : translatedGames[0];
}

/**
 * GET /api/videogames/jvc/search
 * Search games on JeuxVideo.com
 * 
 * Query params:
 * - q: Search query (required)
 * - limit: Max results (default: 20, max: 50)
 * - autoTrad: Enable translation (default: from settings)
 * - lang: Target language (default: from Accept-Language)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit, autoTrad, lang } = req.query;
    
    if (!q) {
      return res.status(400).json({
        error: 'Missing required parameter: q'
      });
    }
    
    const autoTradEnabled = isAutoTradEnabled({ autoTrad });
    const targetLang = lang || extractLangCode(req.headers['accept-language']);
    
    // Search
    const rawResults = await jvcProvider.search(q, { 
      limit: limit ? parseInt(limit) : 20 
    });
    
    // Normalize
    const normalized = jvcNormalizer.normalizeSearchResult(rawResults);
    
    // Translate
    const translated = await translateGameContent(
      normalized.data,
      autoTradEnabled,
      targetLang
    );
    
    res.json({
      ...normalized,
      data: translated
    });
    
  } catch (error) {
    log.error(`Search error: ${error.message}`);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

/**
 * GET /api/videogames/jvc/game/:id
 * Get game details by ID
 * 
 * Query params:
 * - autoTrad: Enable translation (default: from settings)
 * - lang: Target language (default: from Accept-Language)
 */
router.get('/game/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { autoTrad, lang } = req.query;
    
    const autoTradEnabled = isAutoTradEnabled({ autoTrad });
    const targetLang = lang || extractLangCode(req.headers['accept-language']);
    
    // Fetch game
    const rawGame = await jvcProvider.getGame(id);
    
    // Normalize
    const normalized = jvcNormalizer.normalizeGame(rawGame);
    
    // Translate
    const translated = await translateGameContent(
      normalized,
      autoTradEnabled,
      targetLang
    );
    
    res.json({
      success: true,
      provider: 'jvc',
      domain: 'videogames',
      id: translated.id,
      data: translated,
      meta: { fetchedAt: new Date().toISOString() }
    });
    
  } catch (error) {
    log.error(`Get game error: ${error.message}`);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Game not found',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch game',
      message: error.message
    });
  }
});

/**
 * GET /api/videogames/jvc/health
 * Health check for JVC provider
 */
router.get('/health', async (req, res) => {
  try {
    const health = await jvcProvider.healthCheck();
    
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
    
  } catch (error) {
    log.error(`Health check error: ${error.message}`);
    res.status(503).json({
      status: 'error',
      provider: 'jvc',
      error: error.message
    });
  }
});

export default router;
