/**
 * Routes Pokémon TCG
 * API: TCGdex (api.tcgdex.net)
 */

import { Router } from 'express';
import {
  searchPokemonCards,
  getPokemonCardDetails,
  getPokemonSets,
  getPokemonSetDetails,
  healthCheck
} from '../providers/pokemon.provider.js';
import {
  normalizeSearchResults,
  normalizeCardDetails,
  normalizeSets,
  normalizeSetDetails
} from '../normalizers/pokemon.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = Router();

/**
 * GET /search
 * Recherche de cartes Pokémon
 * 
 * Query params:
 * - q: Nom de carte (requis)
 * - lang: Langue (défaut: fr)
 * - max: Résultats max (défaut: 20)
 * - page: Page (défaut: 1)
 * - set: Filtrer par set ID
 * - type: Filtrer par type (Fire, Water, Grass, etc.)
 * - rarity: Filtrer par rareté
 * - supertype: Filtrer par supertype (Pokemon, Trainer, Energy)
 * - subtype: Filtrer par subtype (EX, GX, VMAX, etc.)
 * - autoTrad: Traduction auto (true/false)
 */
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      lang = 'fr',
      limit,
      max = 20,
      page = 1,
      set,
      type,
      rarity,
      supertype,
      subtype,
      autoTrad = false
    } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre "q" requis pour la recherche',
        provider: 'pokemon'
      });
    }

    logger.info(`[Pokemon TCG] Recherche: ${q}`);

    const rawData = await searchPokemonCards(q, {
      lang,
      max: parseInt(limit || max),
      page: parseInt(page),
      set,
      type,
      rarity,
      supertype,
      subtype
    });

    const normalized = await normalizeSearchResults(rawData, {
      lang,
      autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true
    });

    res.json({
      success: true,
      provider: 'pokemon',
      domain: 'tcg',
      query: q,
      total: rawData.total || 0,
      count: normalized.length,
      data: normalized,
      pagination: (rawData.total || 0) > normalized.length ? {
        page: rawData.page || 1,
        limit: parseInt(max),
        hasMore: (rawData.page || 1) * parseInt(max) < (rawData.total || 0),
      } : null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true
      }
    });

  } catch (error) {
    logger.error(`[Pokemon TCG] Erreur recherche: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'pokemon'
    });
  }
});

/**
 * GET /card/:id
 * Détails d'une carte par ID
 * 
 * Params:
 * - id: ID de la carte (ex: base1-4, swsh1-25)
 * 
 * Query params:
 * - lang: Langue (défaut: fr)
 * - autoTrad: Traduction auto (true/false)
 */
router.get('/card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'fr', autoTrad = false } = req.query;

    logger.info(`[Pokemon TCG] Détails carte: ${id}`);

    const rawCard = await getPokemonCardDetails(id, { lang });
    const normalized = await normalizeCardDetails(rawCard, {
      lang,
      autoTrad: autoTrad === 'true' || autoTrad === '1' || autoTrad === true
    });

    res.json({
      success: true,
      provider: 'pokemon',
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
    logger.error(`[Pokemon TCG] Erreur détails: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'pokemon'
    });
  }
});

/**
 * GET /sets
 * Liste des sets Pokémon TCG
 * 
 * Query params:
 * - max: Résultats max (défaut: 250)
 * - lang: Langue (défaut: fr)
 */
router.get('/sets', async (req, res) => {
  try {
    const {
      max = 250,
      lang = 'fr'
    } = req.query;

    logger.info(`[Pokemon TCG] Liste sets`);

    const rawData = await getPokemonSets({
      lang,
      max: parseInt(max)
    });

    const normalized = await normalizeSets(rawData, { lang });

    res.json({
      success: true,
      provider: 'pokemon',
      domain: 'tcg',
      query: null,
      total: rawData.total || 0,
      count: normalized.length,
      data: normalized,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang
      }
    });

  } catch (error) {
    logger.error(`[Pokemon TCG] Erreur sets: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'pokemon'
    });
  }
});

/**
 * GET /sets/:id
 * Détails d'un set Pokémon TCG par ID
 * 
 * Params:
 * - id: ID du set (ex: base1, swsh1)
 * 
 * Query params:
 * - lang: Langue (défaut: fr)
 */
router.get('/sets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'fr' } = req.query;

    logger.info(`[Pokemon TCG] Détails set: ${id}`);

    const rawSet = await getPokemonSetDetails(id, { lang });
    const normalized = await normalizeSetDetails(rawSet, { lang });

    res.json({
      success: true,
      provider: 'pokemon',
      domain: 'tcg',
      id: normalized.id,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang
      }
    });

  } catch (error) {
    logger.error(`[Pokemon TCG] Erreur détails set: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      provider: 'pokemon'
    });
  }
});

/**
 * GET /health
 * Health check API Pokemon TCG
 */
router.get('/health', async (req, res) => {
  try {
    const health = await healthCheck();
    
    res.json({
      success: true,
      provider: 'pokemon',
      status: health.healthy ? 'healthy' : 'unhealthy',
      ...health
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      provider: 'pokemon',
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
