/**
 * Routes ConsoleVariations
 * 
 * Endpoints pour accéder aux variations de consoles de jeux vidéo
 * Base de données: https://consolevariations.com
 * 
 * Paramètres communs:
 * - lang: Code langue (fr, en, de, es, it)
 * - autoTrad: Activer la traduction automatique (1 ou true)
 * 
 * @module domains/videogames/routes/consolevariations
 */

import express from 'express';
import * as consolevariationsProvider from '../providers/consolevariations.provider.js';
import * as consolevariationsNormalizer from '../normalizers/consolevariations.normalizer.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { logger } from '../../../shared/utils/logger.js';
import { isAutoTradEnabled, extractLangCode } from '../../../shared/utils/translator.js';

const router = express.Router();

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * GET /search
 * Recherche de variations de consoles
 * 
 * Query params:
 * - q: Terme de recherche (requis)
 * - type: Type de filtre (all|consoles|controllers|accessories) [défaut: all]
 * - max: Nombre max de résultats [défaut: 20]
 * - lang: Langue [défaut: fr]
 * - autoTrad: Traduction auto [défaut: 0]
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, type = 'all', limit, max = 20, lang = 'fr', autoTrad } = req.query;
  
  if (!q) {
    return res.status(400).json({
      success: false,
      error: 'Paramètre "q" requis'
    });
  }
  
  // Valider le type
  const validTypes = ['all', 'consoles', 'controllers', 'accessories'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      error: `Type invalide. Valeurs acceptées: ${validTypes.join(', ')}`
    });
  }
  
  const effectiveMax = parseInt(limit || max, 10) || 20;
  logger.info(`[ConsoleVariations] Recherche: "${q}" (type=${type}, max=${effectiveMax})`);
  
  // Appeler le provider
  const rawResults = await consolevariationsProvider.searchConsoleVariations(q, {
    maxResults: effectiveMax,
    type
  });
  
  // Normaliser les résultats
  const normalized = consolevariationsNormalizer.normalizeSearchResults(rawResults);
  
  res.json({
    success: true,
    provider: 'consolevariations',
    domain: 'videogames',
    query: q,
    total: normalized.total,
    count: normalized.data.length,
    data: normalized.data,
    pagination: null,
    meta: {
      type,
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ============================================================================
// DÉTAILS
// ============================================================================

/**
 * GET /details
 * Détails d'une variation de console
 * 
 * Query params:
 * - url: URL Tako_Api format consolevariations://item/{slug} (requis)
 * - lang: Langue [défaut: fr]
 * - autoTrad: Traduction auto [défaut: 0]
 */
router.get('/details', asyncHandler(async (req, res) => {
  const { url, lang = 'fr', autoTrad } = req.query;
  
  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Paramètre "url" requis (format: consolevariations://item/{slug})'
    });
  }
  
  // Parser l'URL Tako_Api
  const match = url.match(/^consolevariations:\/\/item\/(.+)$/);
  if (!match) {
    return res.status(400).json({
      success: false,
      error: 'Format URL invalide. Attendu: consolevariations://item/{slug}'
    });
  }
  
  const slug = decodeURIComponent(match[1]);
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  
  logger.info(`[ConsoleVariations] Détails: "${slug}" (lang=${targetLang}, autoTrad=${autoTradEnabled})`);
  
  // Appeler le provider
  const rawDetails = await consolevariationsProvider.getConsoleVariationsDetails(slug, {
    lang: targetLang,
    autoTrad: autoTradEnabled
  });
  
  // Normaliser les détails
  const normalized = consolevariationsNormalizer.normalizeDetails(rawDetails);
  
  res.json({
    success: true,
    provider: 'consolevariations',
    domain: 'videogames',
    id: normalized?.id || null,
    data: normalized,
    meta: {
      source: 'consolevariations',
      fetchedAt: new Date().toISOString()
    }
  });
}));

/**
 * GET /item/:slug
 * Détails d'une variation de console (endpoint alternatif)
 * 
 * Params:
 * - slug: Slug de l'item (ex: "sony-playstation-2-slim-limited-edition")
 * 
 * Query params:
 * - lang: Langue [défaut: fr]
 * - autoTrad: Traduction auto [défaut: 0]
 */
router.get('/item/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { lang = 'fr', autoTrad } = req.query;
  
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  
  logger.info(`[ConsoleVariations] Détails (slug): "${slug}" (lang=${targetLang}, autoTrad=${autoTradEnabled})`);
  
  // Appeler le provider
  const rawDetails = await consolevariationsProvider.getConsoleVariationsDetails(slug, {
    lang: targetLang,
    autoTrad: autoTradEnabled
  });
  
  // Normaliser les détails
  const normalized = consolevariationsNormalizer.normalizeDetails(rawDetails);
  
  res.json({
    success: true,
    provider: 'consolevariations',
    domain: 'videogames',
    id: normalized?.id || null,
    data: normalized,
    meta: {
      source: 'consolevariations',
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ============================================================================
// PLATEFORMES / MARQUES
// ============================================================================

/**
 * GET /platforms
 * Liste des plateformes ou marques
 * 
 * Query params:
 * - brand: Marque optionnelle (nintendo, sony, microsoft, sega, etc.)
 *          Si absent: liste les marques
 *          Si présent: liste les plateformes de cette marque
 */
router.get('/platforms', asyncHandler(async (req, res) => {
  const { brand } = req.query;
  
  logger.info(`[ConsoleVariations] Liste plateformes${brand ? ` (${brand})` : ''}`);
  
  // Appeler le provider
  const rawResults = await consolevariationsProvider.listConsoleVariationsPlatforms({
    brand: brand || null
  });
  
  // Normaliser
  const normalized = consolevariationsNormalizer.normalizePlatforms(rawResults);
  
  res.json({
    success: true,
    provider: 'consolevariations',
    domain: 'videogames',
    type: normalized.type,
    query: brand || null,
    total: normalized.total,
    count: normalized.data.length,
    data: normalized.data,
    pagination: null,
    meta: {
      brand: normalized.brand,
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ============================================================================
// BROWSE PAR PLATEFORME
// ============================================================================

/**
 * GET /browse/:platform
 * Browse les items d'une plateforme spécifique
 * 
 * Params:
 * - platform: Slug de la plateforme (ex: "nes", "sony-playstation")
 * 
 * Query params:
 * - max: Nombre max de résultats [défaut: 20]
 */
router.get('/browse/:platform', asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const { max = 20 } = req.query;
  
  logger.info(`[ConsoleVariations] Browse plateforme: "${platform}" (max=${max})`);
  
  // Appeler le provider
  const rawResults = await consolevariationsProvider.browseConsoleVariationsPlatform(platform, {
    maxResults: parseInt(max, 10)
  });
  
  // Normaliser
  const normalized = consolevariationsNormalizer.normalizeBrowse(rawResults);
  
  res.json({
    success: true,
    provider: 'consolevariations',
    domain: 'videogames',
    query: platform,
    total: normalized.total,
    count: normalized.data.length,
    data: normalized.data,
    pagination: null,
    meta: {
      platform,
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /health
 * Vérifier l'état de FlareSolverr
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await consolevariationsProvider.healthCheck();
  
  res.json({
    success: health.healthy,
    provider: 'consolevariations',
    ...health
  });
}));

export default router;
