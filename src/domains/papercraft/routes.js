/**
 * Papercraft Routes — provider cubeecraft (archive du site abandonné cubeecraft.com).
 *
 * Routes (montées sous /api/papercraft) :
 * - GET /health                — état + nombre de modèles
 * - GET /stats                 — statistiques archive
 * - GET /cubeecraft/categories — catégories + compteurs
 * - GET /cubeecraft/search     — recherche (q, category, limit, offset)
 * - GET /cubeecraft/:slug      — détail d'un modèle (patron + vignette)
 *
 * @module domains/papercraft/routes
 */

import express from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { ValidationError, NotFoundError } from '../../shared/errors/index.js';
import {
  search,
  getBySlug,
  listCategories,
  getStats,
  healthCheck,
} from './providers/cubeecraft.provider.js';

const router = express.Router();

router.get('/health', asyncHandler(async (req, res) => {
  const h = await healthCheck();
  res.status(h.status === 'healthy' ? 200 : 503).json({ provider: 'cubeecraft', ...h });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  res.json(await getStats());
}));

router.get('/cubeecraft/categories', asyncHandler(async (req, res) => {
  res.json(await listCategories());
}));

router.get('/cubeecraft/search', asyncHandler(async (req, res) => {
  const { q = '', category, limit = '30', offset = '0' } = req.query;
  if (!q.trim() && !category) {
    throw new ValidationError('Fournir au moins « q » ou « category »');
  }
  res.json(await search(q, {
    category: category || null,
    limit: Math.min(parseInt(limit) || 30, 100),
    offset: parseInt(offset) || 0,
  }));
}));

router.get('/cubeecraft/:slug', asyncHandler(async (req, res) => {
  const r = await getBySlug(req.params.slug);
  if (!r) throw new NotFoundError(`Modèle papercraft introuvable : ${req.params.slug}`);
  res.json(r);
}));

export default router;
