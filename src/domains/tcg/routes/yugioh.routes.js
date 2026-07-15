/**
 * Routes Yu-Gi-Oh! TCG
 * Gestion des endpoints pour les cartes Yu-Gi-Oh!
 */

import express from 'express';
import {
  searchYuGiOhCards,
  getYuGiOhCardDetails,
  getYuGiOhSets,
  searchByArchetype,
  healthCheck
} from '../providers/yugioh.provider.js';
import {
  normalizeSearchResults,
  normalizeCardDetails,
  normalizeSets,
  normalizeArchetypeResults
} from '../normalizers/yugioh.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();

/**
 * GET /api/tcg/yugioh/search
 * Recherche de cartes Yu-Gi-Oh!
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      type,
      race,
      attribute,
      level,
      archetype,
      max = '20',
      limit,
      sort = 'name',
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
    
    const maxResults = Math.min(parseInt(max) || 20, 100);
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Recherche via provider
    const rawData = await searchYuGiOhCards(q, {
      type,
      race,
      attribute,
      level: level ? parseInt(level) : undefined,
      archetype,
      max: maxResults,
      sort,
      lang
    });
    
    // Normalisation
    const normalizedData = await normalizeSearchResults(rawData, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'yugioh',
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
        ...(type && { type }),
        ...(race && { race }),
        ...(attribute && { attribute }),
        ...(level && { level: parseInt(level) }),
        ...(archetype && { archetype }),
        sort
      }
    });
    
  } catch (error) {
    logger.error(`[Yu-Gi-Oh! Routes] Search error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/yugioh/card/:id
 * Détails d'une carte Yu-Gi-Oh!
 */
router.get('/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'en', autoTrad = 'false' } = req.query;
    
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Récupérer la carte
    const rawCard = await getYuGiOhCardDetails(id, { lang });
    
    // Normalisation
    const normalizedCard = await normalizeCardDetails(rawCard, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'yugioh',
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
    logger.error(`[Yu-Gi-Oh! Routes] Card details error: ${error.message}`);
    
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
 * GET /api/tcg/yugioh/sets
 * Liste des sets Yu-Gi-Oh!
 */
router.get('/sets', async (req, res) => {
  try {
    const { lang = 'en' } = req.query;
    
    // Récupérer les sets
    const rawSets = await getYuGiOhSets();
    
    // Normalisation
    const normalizedSets = await normalizeSets(rawSets, { lang });
    
    res.json({
      success: true,
      provider: 'yugioh',
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
    logger.error(`[Yu-Gi-Oh! Routes] Sets error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/yugioh/archetype
 * Recherche par archétype
 */
router.get('/archetype', async (req, res) => {
  try {
    const { name, max = '20', lang = 'en', autoTrad = 'false' } = req.query;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "name" is required'
      });
    }
    
    const maxResults = Math.min(parseInt(max) || 20, 100);
    const enableAutoTrad = autoTrad === 'true' || autoTrad === '1';
    
    // Recherche par archétype
    const rawData = await searchByArchetype(name, { max: maxResults });
    
    // Normalisation
    const normalizedData = await normalizeArchetypeResults(rawData, {
      lang,
      autoTrad: enableAutoTrad
    });
    
    res.json({
      success: true,
      provider: 'yugioh',
      domain: 'tcg',
      query: name,
      total: rawData.total_cards || 0,
      count: normalizedData.length,
      data: normalizedData,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: enableAutoTrad
      }
    });
    
  } catch (error) {
    logger.error(`[Yu-Gi-Oh! Routes] Archetype error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tcg/yugioh/health
 * Health check
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.status(health.healthy ? 200 : 503).json({
      success: true,
      provider: 'yugioh',
      ...health
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      provider: 'yugioh',
      healthy: false,
      message: error.message
    });
  }
});

export default router;
