/**
 * Routes Cache Admin
 * Endpoints pour gérer le cache discovery
 */

import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { getCacheStats, clearAllCache } from '../../infrastructure/database/discovery-cache.repository.js';
import { forceRefresh, forceRefreshExpired } from '../../infrastructure/database/refresh-scheduler.js';
import { getPoolStats } from '../../infrastructure/database/connection.js';

const router = Router();

/**
 * GET /api/cache/stats
 * Statistiques du cache discovery
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await getCacheStats();
  const poolStats = getPoolStats();
  
  res.json({
    success: true,
    cache: stats,
    database: poolStats
  });
}));

/**
 * POST /api/cache/refresh/:provider
 * Force le refresh d'un provider
 * 
 * Exemples :
 * - POST /api/cache/refresh/tmdb
 * - POST /api/cache/refresh/jikan
 */
router.post('/refresh/:provider', asyncHandler(async (req, res) => {
  const { provider } = req.params;
  
  const result = await forceRefresh(provider);
  
  res.json({
    success: true,
    provider,
    ...result
  });
}));

/**
 * POST /api/cache/refresh
 * Force le refresh des entrées expirées
 * 
 * Query params :
 * - batchSize : Nombre d'entrées à rafraîchir (défaut 10)
 * - force : Si true, rafraîchit TOUTES les entrées (même non expirées)
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const batchSize = parseInt(req.query.batchSize) || 10;
  const force = req.query.force === 'true';
  
  let result;
  if (force) {
    // Rafraîchir TOUTES les entrées
    const { forceRefreshAll } = await import('../../infrastructure/database/refresh-scheduler.js');
    result = await forceRefreshAll();
  } else {
    // Rafraîchir seulement les expirées
    result = await forceRefreshExpired(batchSize);
  }
  
  res.json({
    ...result,
    success: result.total > 0 || result.success > 0,
    forced: force
  });
}));

/**
 * POST|DELETE /api/cache/clear
 * Vide tout le cache (DANGER)
 */
const clearHandler = asyncHandler(async (req, res) => {
  const deleted = await clearAllCache();
  
  res.json({
    success: true,
    deleted,
    message: 'Cache cleared successfully'
  });
});

router.post('/clear', clearHandler);
router.delete('/clear', clearHandler);

export default router;
