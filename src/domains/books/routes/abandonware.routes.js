/**
 * Routes Abandonware Magazines
 * 
 * Endpoints pour l'archive de magazines Abandonware.
 * 
 * Routes disponibles :
 * - GET /health             - Vérifier la disponibilité de l'API
 * - GET /search             - Rechercher des magazines par nom
 * - GET /magazines          - Lister tous les magazines (paginé)
 * - GET /magazine/:id       - Détails d'un magazine + numéros
 * - GET /magazine/:id/issues - Numéros d'un magazine (paginé)
 * 
 * Pas de traduction automatique (contenu francophone).
 */

import { Router } from 'express';
import { AbandonwareProvider } from '../providers/abandonware.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';

const router = Router();
const provider = new AbandonwareProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.status(health.healthy ? 200 : 503).json({
    provider: 'abandonware',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /books/abandonware/search
 * Rechercher des magazines par nom
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - limit / maxResults : Nombre max de résultats (défaut 20, max 100)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const max = Math.min(Math.max(parseInt(limit || maxResults) || 20, 1), 100);

  const results = await provider.search(q.trim(), { maxResults: max });
  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// LISTE DES MAGAZINES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /books/abandonware/magazines
 * Lister tous les magazines disponibles
 * 
 * Query params :
 * - page : Numéro de page (défaut 1)
 * - limit / pageSize : Résultats par page (défaut 50, max 200)
 */
router.get('/magazines', asyncHandler(async (req, res) => {
  const { page = '1', limit, pageSize = '50' } = req.query;

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit || pageSize) || 50, 1), 200);

  const results = await provider.listMagazines({ page: pageNum, limit: lim });
  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS D'UN MAGAZINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /books/abandonware/magazine/:id
 * Obtenir les détails d'un magazine avec la liste de ses numéros
 * 
 * Path params :
 * - id : ID du magazine (entier)
 */
router.get('/magazine/:id', asyncHandler(async (req, res) => {
  const magazineId = parseInt(req.params.id, 10);

  if (!magazineId || isNaN(magazineId)) {
    throw new ValidationError('L\'ID du magazine doit être un entier valide');
  }

  const result = await provider.getMagazineDetails(magazineId);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════════════
// NUMÉROS D'UN MAGAZINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /books/abandonware/magazine/:id/issues
 * Lister les numéros d'un magazine (paginé)
 * 
 * Path params :
 * - id : ID du magazine (entier)
 * 
 * Query params :
 * - page : Numéro de page (défaut 1)
 * - limit / pageSize : Résultats par page (défaut 50, max 200)
 */
router.get('/magazine/:id/issues', asyncHandler(async (req, res) => {
  const magazineId = parseInt(req.params.id, 10);
  const { page = '1', limit, pageSize = '50' } = req.query;

  if (!magazineId || isNaN(magazineId)) {
    throw new ValidationError('L\'ID du magazine doit être un entier valide');
  }

  const pageNum = Math.max(parseInt(page) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit || pageSize) || 50, 1), 200);

  const result = await provider.getMagazineIssues(magazineId, { page: pageNum, limit: lim });
  res.json(result);
}));

export default router;
