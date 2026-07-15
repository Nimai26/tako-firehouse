/**
 * src/domains/sticker-albums/routes/index.js - Router principal du domaine albums d'images
 * 
 * Monte tous les routers des providers du domaine
 * 
 * @module domains/sticker-albums/routes
 */

import express from 'express';
import paninimaniaRoutes from './paninimania.routes.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();

// Monter les routers des providers
router.use('/paninimania', paninimaniaRoutes);

// Route d'information sur le domaine
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      domain: 'sticker-albums',
      description: 'API pour les albums d\'images et stickers (Panini, etc.)',
      providers: [
        {
          name: 'paninimania',
          description: 'Base de données d\'albums Panini et stickers',
          baseUrl: '/api/sticker-albums/paninimania',
          features: [
            'search',
            'album-details',
            'translation',
            'complex-checklists',
            'special-stickers',
            'additional-images',
            'barcode-lookup'
          ],
          requiresAuth: false,
          rateLimit: 'FlareSolverr dependent (~3-5s per request)'
        }
      ],
      endpoints: {
        paninimania: [
          'GET /paninimania/search?q={query}&max={24}&lang={fr}&autoTrad={1}',
          'GET /paninimania/details?id={albumId}&lang={fr}&autoTrad={1}',
          'GET /paninimania/album/{albumId}?lang={fr}&autoTrad={1}',
          'GET /paninimania/health'
        ]
      }
    }
  });
});

// Health check global du domaine
router.get('/health', async (req, res) => {
  try {
    const healthChecks = await Promise.allSettled([
      import('../providers/paninimania.provider.js').then(m => m.healthCheck())
    ]);
    
    const results = healthChecks.map((result, index) => {
      const providerNames = ['paninimania'];
      return {
        provider: providerNames[index],
        status: result.status === 'fulfilled' ? result.value.status : 'unhealthy',
        details: result.status === 'fulfilled' ? result.value : { error: result.reason?.message }
      };
    });
    
    const allHealthy = results.every(r => r.status === 'healthy');
    
    res.json({
      success: true,
      data: {
        domain: 'sticker-albums',
        status: allHealthy ? 'healthy' : 'degraded',
        providers: results,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`[Sticker-Albums] Health check error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

export default router;
