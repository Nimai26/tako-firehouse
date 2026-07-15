/**
 * Routes Playmobil
 * 
 * Endpoints pour le site officiel Playmobil.
 * 
 * ⚠️ ATTENTION: Ce provider utilise FlareSolverr pour bypasser Cloudflare.
 * Les requêtes peuvent prendre ~18 secondes.
 * 
 * Routes disponibles :
 * - GET /health - Vérifier la disponibilité de Playmobil + FlareSolverr
 * - GET /search - Rechercher des produits
 * - GET /instructions/:productId - Obtenir les instructions de montage
 * - GET /:id - Obtenir les détails d'un produit
 */

import { Router } from 'express';
import { PlaymobilProvider } from '../providers/playmobil.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';

const router = Router();
const provider = new PlaymobilProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/playmobil/health
 * Vérifier la disponibilité de Playmobil et FlareSolverr
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.status(health.healthy ? 200 : 503).json({
    provider: 'playmobil',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message,
    details: health.details,
    note: 'Ce provider nécessite FlareSolverr (~18s/requête)'
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/playmobil/search
 * Rechercher des produits Playmobil
 * 
 * ⚠️ Lent (~18s) car utilise FlareSolverr
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - pageSize : Nombre de résultats (max 100, défaut 24)
 * - lang : Locale (fr-FR, en-US, de-DE, etc. - défaut fr-FR)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, pageSize = '24', lang = 'fr-FR' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const size = Math.min(Math.max(parseInt(limit || pageSize) || 24, 1), 100);

  const results = await provider.search(q.trim(), {
    pageSize: size,
    lang
  });

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/playmobil/instructions/:productId
 * Obtenir les instructions de montage
 * 
 * ✅ Rapide - ne nécessite pas FlareSolverr
 */
router.get('/instructions/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!productId || !/^\d{4,6}$/.test(productId)) {
    throw new ValidationError('Format de productId invalide (4-6 chiffres attendus)');
  }

  const instructions = await provider.getPlaymobilInstructions(productId);

  res.json({
    success: true,
    provider: 'playmobil',
    domain: 'construction-toys',
    id: `playmobil:${productId}`,
    data: instructions,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS D'UN PRODUIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /construction-toys/playmobil/:id
 * Obtenir les détails d'un produit Playmobil
 * 
 * ⚠️ Lent (~18-36s) car utilise FlareSolverr (recherche + détails)
 * 
 * Path params :
 * - id : ID du produit (ex: 71148)
 * 
 * Query params :
 * - lang : Locale (fr-FR, en-US, de-DE, etc. - défaut fr-FR)
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang = 'fr-FR' } = req.query;

  if (!id || !/^\d{4,6}$/.test(id)) {
    throw new ValidationError('Format d\'ID invalide (4-6 chiffres attendus)');
  }

  const product = await provider.getById(id, { lang });

  res.json(product);
}));

export default router;
