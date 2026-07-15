/**
 * Routes Digimon Card Game
 * Gestion des endpoints pour les cartes Digimon
 */

import express from 'express';
import {
  searchDigimonCards,
  getDigimonCardDetails,
  healthCheck
} from '../providers/digimon.provider.js';
import {
  normalizeSearchResults,
  normalizeCardDetails
} from '../normalizers/digimon.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';
import { translateDigimonName } from '../utils/digimon-names.js';

const router = express.Router();

/**
 * GET /api/tcg/digimon/search
 * Recherche de cartes Digimon
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      type,
      color,
      level,
      series,
      attribute,
      rarity,
      stage,
      max = '100',
      limit,
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
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Si lang != en, tenter de traduire le nom de recherche JP/FR → EN
    const searchQuery = (lang !== 'en') ? translateDigimonName(q, 'en') : q;
    if (searchQuery !== q) {
      logger.info(`[Digimon Routes] Translated search: "${q}" → "${searchQuery}" (${lang}→en)`);
    }
    
    // Recherche via provider
    const rawData = await searchDigimonCards(searchQuery, {
      type,
      color,
      level,
      series,
      attribute,
      rarity,
      stage,
      max: maxResults
    });
    
    // Normalisation
    const normalizedData = await normalizeSearchResults(rawData, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'digimon',
      domain: 'tcg',
      query: q,
      total: rawData.total_cards || 0,
      count: normalizedData.length,
      data: normalizedData,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: enableAutoTrad,
        ...(series && { series }),
        ...(type && { type }),
        ...(color && { color }),
        ...(level && { level }),
        ...(attribute && { attribute }),
        ...(rarity && { rarity }),
        ...(stage && { stage })
      }
    });
    
  } catch (error) {
    logger.error(`[Digimon Routes] Search error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/digimon/card/:id
 * Détails d'une carte Digimon
 */
router.get('/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'en', autoTrad = 'false' } = req.query;
    
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Récupérer la carte
    const rawCard = await getDigimonCardDetails(id);
    
    // Normalisation
    const normalizedCard = await normalizeCardDetails(rawCard, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'digimon',
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
    logger.error(`[Digimon Routes] Card details error: ${error.message}`);
    
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
 * GET /api/tcg/digimon/health
 * Health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.status(health.healthy ? 200 : 503).json({
      success: true,
      provider: 'digimon',
      ...health
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      provider: 'digimon',
      healthy: false,
      message: error.message
    });
  }
});

export default router;
