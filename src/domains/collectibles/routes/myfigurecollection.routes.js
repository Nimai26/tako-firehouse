/**
 * MyFigureCollection Routes — Endpoints API
 *
 * Routes disponibles :
 * - GET /health                              — État du provider
 * - GET /search?q={query}&max={24}&lang={fr}&autoTrad={1}
 * - GET /details?id={itemId}&lang={fr}&autoTrad={1}
 * - GET /item/{itemId}?lang={fr}&autoTrad={1}
 *
 * @module domains/collectibles/routes/myfigurecollection
 */

import express from 'express';
import { logger } from '../../../shared/utils/logger.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import {
  searchMFC,
  getMFCDetails,
  healthCheck
} from '../providers/myfigurecollection.provider.js';
import {
  normalizeSearchItem,
  normalizeDetails
} from '../normalizers/myfigurecollection.normalizer.js';

const router = express.Router();

/**
 * GET /health
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await healthCheck();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({ success: health.status === 'healthy', data: health });
}));

/**
 * GET /search — recherche d'items
 */
router.get('/search', asyncHandler(async (req, res) => {
  const q = req.query.q || req.query.keywords;
  if (!q) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_QUERY', message: 'Le paramètre q (ou keywords) est requis' }
    });
  }
  const max = Math.min(parseInt(req.query.limit || req.query.max || '24', 10) || 24, 60);
  const lang = req.query.lang || 'fr';
  const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
  const { results, total } = await searchMFC(q, { max, lang, autoTrad });
  // `data` = LISTE directe (format attendu par le client Firehouse _search).
  res.json({
    success: true,
    source: 'myfigurecollection',
    query: q,
    total,
    data: results.map(normalizeSearchItem).filter(Boolean)
  });
}));

/**
 * Handler partagé /details et /item/:id
 */
async function detailHandler(id, req, res) {
  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_ID', message: 'ID d\'item requis' }
    });
  }
  const lang = req.query.lang || 'fr';
  const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
  const details = await getMFCDetails(id, { lang, autoTrad });
  if (!details) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Item MFC ${id} introuvable` }
    });
  }
  res.json({ success: true, data: normalizeDetails(details) });
}

/**
 * GET /details?id={itemId}
 */
router.get('/details', asyncHandler(async (req, res) => {
  const id = String(req.query.id || '').replace(/\D/g, '');
  return detailHandler(id, req, res);
}));

/**
 * GET /item/{itemId}
 */
router.get('/item/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').replace(/\D/g, '');
  return detailHandler(id, req, res);
}));

/**
 * GET /{itemId} — forme courte /{provider}/{id} attendue par le client Firehouse (_detail).
 * Définie EN DERNIER pour ne pas court-circuiter /health, /search, /details, /item/:id.
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').replace(/\D/g, '');
  return detailHandler(id, req, res);
}));

export default router;
