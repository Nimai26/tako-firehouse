/**
 * BGG Routes
 * 
 * Routes for BoardGameGeek provider with translation support.
 * 
 * @module routes/bgg
 */

import express from 'express';
import * as bggProvider from '../providers/bgg.provider.js';
import * as bggNormalizer from '../normalizers/bgg.normalizer.js';
import { translateBoardGameCategories, translateText, isAutoTradEnabled } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();
const log = logger.create('BGGRoutes');

/**
 * Translate board game content
 * @param {Array|object} games - Game(s) to translate
 * @param {boolean} autoTrad - Auto-translation flag
 * @param {string} targetLang - Target language
 * @returns {Promise<Array|object>} Translated game(s)
 */
async function translateGameContent(games, autoTrad, targetLang) {
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  
  if (!autoTradEnabled || !targetLang) {
    return games;
  }
  
  const translateGame = async (game) => {
    const translatedGame = { ...game };
    
    // Extract localized name from alternateNames
    if (game.details?.alternateNames && game.details.alternateNames.length > 0) {
      const localizedName = bggNormalizer.findLocalizedName(game.details.alternateNames, targetLang);
      if (localizedName) {
        translatedGame.details = { ...translatedGame.details, localizedName };
      }
    }
    
    // Translate categories (BGG uses English)
    if (game.details?.categories && game.details.categories.length > 0) {
      const translated = await translateBoardGameCategories(
        game.details.categories,
        targetLang
      );
      translatedGame.details = { ...translatedGame.details };
      translatedGame.details.categories = translated.terms;
      if (translated.termsOriginal) {
        translatedGame.details.categoriesOriginal = translated.termsOriginal;
      }
    }
    
    // Translate description from English to target language
    if (game.description && targetLang !== 'en') {
      try {
        const translatedDesc = await translateText(game.description, 'en', targetLang);
        if (translatedDesc) {
          translatedGame.description = translatedDesc;
        }
      } catch (error) {
        log.error(`[BGG] Translation error: ${error.message}`);
      }
    }
    
    return translatedGame;
  };
  
  if (Array.isArray(games)) {
    return Promise.all(games.map(translateGame));
  } else {
    return translateGame(games);
  }
}

/**
 * GET /search
 * Search board games by name
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit, autoTrad, targetLang } = req.query;
    
    if (!q) {
      return res.status(400).json({
        error: 'Missing required parameter: q'
      });
    }
    
    log.info(`[BGG] Search: "${q}"`);
    
    const rawData = await bggProvider.search(q, {
      limit: limit ? parseInt(limit) : undefined
    });
    
    const normalized = bggNormalizer.normalizeSearchResult(rawData);
    
    // Translate if needed
    const results = await translateGameContent(
      normalized.data,
      autoTrad,
      targetLang
    );
    
    res.json({
      ...normalized,
      data: results
    });
    
  } catch (error) {
    log.error(`[BGG] Search error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'bgg'
    });
  }
});

/**
 * GET /search/category
 * Search board games by category
 */
router.get('/search/category', async (req, res) => {
  try {
    const { q, limit, autoTrad, targetLang } = req.query;
    
    if (!q) {
      return res.status(400).json({
        error: 'Missing required parameter: q (category name)'
      });
    }
    
    log.info(`[BGG] Search by category: "${q}"`);
    
    const rawData = await bggProvider.searchByCategory(q, {
      limit: limit ? parseInt(limit) : undefined
    });
    
    const normalized = bggNormalizer.normalizeSearchResult(rawData);
    
    // Translate if needed
    const results = await translateGameContent(
      normalized.data,
      autoTrad,
      targetLang
    );
    
    res.json({
      ...normalized,
      data: results
    });
    
  } catch (error) {
    log.error(`[BGG] Category search error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'bgg'
    });
  }
});

/**
 * GET /game/:id
 * Get board game details by BGG ID
 */
router.get('/game/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { autoTrad, targetLang } = req.query;
    
    log.info(`[BGG] Get game: ${id}`);
    
    const rawGame = await bggProvider.getGame(id);
    const normalized = bggNormalizer.normalizeGame(rawGame);
    
    // Translate if needed
    const game = await translateGameContent(normalized, autoTrad, targetLang);
    
    res.json({
      success: true,
      provider: 'bgg',
      domain: 'boardgames',
      id: game.id,
      data: game,
      meta: { fetchedAt: new Date().toISOString() }
    });
    
  } catch (error) {
    log.error(`[BGG] Get game error: ${error.message}`);
    
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
        provider: 'bgg'
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        provider: 'bgg'
      });
    }
  }
});

/**
 * GET /health
 * Health check for BGG provider
 */
router.get('/health', async (req, res) => {
  try {
    const health = await bggProvider.healthCheck();
    
    if (health.status === 'ok') {
      res.json(health);
    } else {
      res.status(503).json(health);
    }
    
  } catch (error) {
    log.error(`[BGG] Health check error: ${error.message}`);
    res.status(503).json({
      status: 'error',
      provider: 'bgg',
      error: error.message
    });
  }
});

export default router;
