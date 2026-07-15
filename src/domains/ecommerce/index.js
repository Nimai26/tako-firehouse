/**
 * Domaine E-commerce
 * Providers de sites marchands (Amazon, etc.)
 * 
 * @module domains/ecommerce
 */

import { Router } from 'express';
import amazonRouter from './routes/amazon.routes.js';
import * as amazonProvider from './providers/amazon.provider.js';
import { logger } from '../../shared/utils/logger.js';

const router = Router();

// Montage des routes Amazon
router.use('/amazon', amazonRouter);

/**
 * Info du domaine
 * GET /api/ecommerce
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    domain: 'ecommerce',
    providers: [
      {
        name: 'amazon',
        description: 'Amazon multi-marketplaces (8 pays)',
        marketplaces: ['fr', 'us', 'uk', 'de', 'es', 'it', 'jp', 'ca'],
        categories: ['all', 'videogames', 'toys', 'books', 'music', 'movies', 'electronics'],
        endpoints: {
          search: '/api/ecommerce/amazon/search?q=<query>&country=<code>',
          product: '/api/ecommerce/amazon/product/<asin>?country=<code>',
          compare: '/api/ecommerce/amazon/compare/<asin>?countries=<codes>',
          marketplaces: '/api/ecommerce/amazon/marketplaces',
          categories: '/api/ecommerce/amazon/categories',
          health: '/api/ecommerce/amazon/health'
        }
      }
    ]
  });
});

/**
 * Health check du domaine
 * GET /api/ecommerce/health
 */
router.get('/health', async (req, res) => {
  try {
    // Check Amazon
    const amazonHealth = await amazonProvider.healthCheck();
    
    const allHealthy = amazonHealth.healthy;
    
    res.status(allHealthy ? 200 : 503).json({
      success: true,
      domain: 'ecommerce',
      healthy: allHealthy,
      providers: {
        amazon: amazonHealth
      }
    });
  } catch (err) {
    logger.error('[Ecommerce] Erreur health check:', err);
    res.status(503).json({
      success: false,
      domain: 'ecommerce',
      healthy: false,
      error: err.message
    });
  }
});

export default router;
