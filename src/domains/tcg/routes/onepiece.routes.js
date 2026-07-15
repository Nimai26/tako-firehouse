/**
 * Routes One Piece Card Game
 * Gestion des endpoints pour les cartes One Piece
 */

import express from 'express';
import {
  searchOnePieceCards,
  getOnePieceCardDetails,
  fetchOnePieceImage,
  getCardImageUrl,
  healthCheck
} from '../providers/onepiece.provider.js';
import {
  normalizeSearchResults,
  normalizeCardDetails
} from '../normalizers/onepiece.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();

/**
 * GET /api/tcg/onepiece/search
 * Recherche de cartes One Piece
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      color,
      type,
      rarity,
      cost,
      max = '100',
      limit,
      lang = 'en',
      autoTrad = 'false'
    } = req.query;
    
    const maxResults = Math.min(parseInt(limit || max) || 100, 250);
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Recherche via provider
    const rawCards = await searchOnePieceCards(q || '', {
      color,
      type,
      rarity,
      cost: cost ? parseInt(cost) : undefined,
      max: maxResults
    });
    
    // Normalisation
    const normalizedData = await normalizeSearchResults(rawCards, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'onepiece',
      domain: 'tcg',
      query: q || null,
      total: rawCards.length,
      count: normalizedData.length,
      data: normalizedData,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: enableAutoTrad,
        ...(color && { color }),
        ...(type && { type }),
        ...(rarity && { rarity }),
        ...(cost && { cost: parseInt(cost) })
      }
    });
    
  } catch (error) {
    logger.error(`[One Piece Routes] Search error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/onepiece/card/:id
 * Détails d'une carte One Piece
 */
router.get('/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'en', autoTrad = 'false' } = req.query;
    
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Récupérer la carte
    const rawCard = await getOnePieceCardDetails(id);
    
    // Normalisation
    const normalizedCard = await normalizeCardDetails(rawCard, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'onepiece',
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
    logger.error(`[One Piece Routes] Card details error: ${error.message}`);
    
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
 * GET /api/tcg/onepiece/image/:cardId
 * Proxy image — contourne la protection Cloudflare
 * Retourne l'image binaire avec le bon Content-Type
 */
router.get('/image/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    
    // Récupérer l'URL de l'image depuis les données
    const imageUrl = await getCardImageUrl(cardId);
    
    if (!imageUrl) {
      return res.status(404).json({
        success: false,
        error: `Card not found: ${cardId}`
      });
    }
    
    // Télécharger l'image via les cookies FlareSolverr
    const { buffer, contentType } = await fetchOnePieceImage(imageUrl);
    
    // Headers de cache (1h navigateur, 24h CDN)
    res.set({
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Image-Source': 'onepiece-cardgame.dev'
    });
    
    res.send(buffer);
    
  } catch (error) {
    logger.error(`[One Piece Routes] Image proxy error: ${error.message}`);
    res.status(502).json({
      success: false,
      error: `Image proxy failed: ${error.message}`
    });
  }
});

/**
 * GET /api/tcg/onepiece/health
 * Health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.status(health.healthy ? 200 : 503).json({
      success: true,
      provider: 'onepiece',
      ...health
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      provider: 'onepiece',
      healthy: false,
      message: error.message
    });
  }
});

export default router;
