/**
 * Routes RCScrapyard (véhicules RC, provider live).
 *   GET /api/rc/rcscrapyard/search?q=&limit=
 *   GET /api/rc/rcscrapyard/health
 *   GET /api/rc/rcscrapyard/:slug           (détails)
 * @module domains/rc/routes/rcscrapyard
 */
import express from 'express';
import * as provider from '../providers/rcscrapyard.provider.js';
import * as normalizer from '../normalizers/rcscrapyard.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, max = 10 } = req.query;
  if (!q) return res.status(400).json({ success: false, error: 'Paramètre "q" requis' });
  const raw = await provider.searchRcscrapyard(q, { maxResults: parseInt(limit || max, 10) || 10 });
  const n = normalizer.normalizeSearchResults(raw);
  res.json({ success: true, provider: 'rcscrapyard', domain: 'rc', query: q,
    total: n.total, count: n.data.length, data: n.data,
    meta: { fetchedAt: new Date().toISOString() } });
}));

router.get('/health', asyncHandler(async (_req, res) => {
  res.json({ success: true, provider: 'rcscrapyard', ...(await provider.healthCheck()) });
}));

router.get('/details', asyncHandler(async (req, res) => {
  const { url } = req.query;
  const m = (url || '').match(/^rcscrapyard:\/\/item\/(.+)$/);
  const slug = m ? decodeURIComponent(m[1]) : (req.query.slug || '');
  if (!slug) return res.status(400).json({ success: false, error: 'slug/url requis' });
  const raw = await provider.getRcscrapyardDetails(slug);
  res.json({ success: true, provider: 'rcscrapyard', data: normalizer.normalizeDetails(raw) });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const raw = await provider.getRcscrapyardDetails(req.params.slug);
  if (!raw) return res.status(404).json({ success: false, error: 'modèle introuvable' });
  res.json({ success: true, provider: 'rcscrapyard', data: normalizer.normalizeDetails(raw) });
}));

export default router;
