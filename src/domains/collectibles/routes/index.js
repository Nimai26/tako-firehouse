/**
 * src/domains/collectibles/routes/index.js - Router principal du domaine collectibles
 * 
 * Monte tous les routers des providers du domaine
 * 
 * @module domains/collectibles/routes
 */

import express from 'express';
import colekaRoutes from './coleka.routes.js';
import luluberluRoutes from './luluberlu.routes.js';
import transformerlandRoutes from './transformerland.routes.js';
import carddassRoutes from './carddass.routes.js';
import { createAmazonAliasRouter } from '../../ecommerce/routes/amazon-alias.factory.js';
import { logger } from '../../../shared/utils/logger.js';

const router = express.Router();

// Monter les routers des providers
router.use('/coleka', colekaRoutes);
router.use('/luluberlu', luluberluRoutes);
router.use('/transformerland', transformerlandRoutes);
router.use('/carddass', carddassRoutes);
router.use('/amazon', createAmazonAliasRouter({
  domain: 'collectibles',
  category: 'toys',
  categoryLabel: 'Jouets',
  excludePatterns: [
    '\\bDVD\\b', '\\bBlu-?ray\\b', '\\bCD\\b', '\\bVinyl\\b',
    '\\bPS[345]\\b', '\\bPS [345]\\b', '\\bPlayStation\\b',
    '\\bXbox\\b', '\\bNintendo Switch\\b', '\\bSwitch OLED\\b',
    '\\bWii\\b', '\\bGame Boy\\b', '\\bGameboy\\b',
    '\\bPC Game\\b', '\\bJeu Vidéo\\b', '\\bJeux Vidéo\\b', '\\bVideo Game\\b',
    '\\bSteam\\b', '\\bEpic Games\\b',
    '\\bLivre\\b', '\\bRoman\\b', '\\bPoche\\b', '\\bBroché\\b',
    '\\bBook\\b', '\\bPaperback\\b', '\\bHardcover\\b', '\\bKindle\\b',
    '\\btome\\b', '\\bédition brochée\\b'
  ]
}));

// Route d'information sur le domaine
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      domain: 'collectibles',
      description: 'API pour les objets de collection (figurines, LEGO, Funko Pop, etc.)',
      providers: [
        {
          name: 'coleka',
          description: 'Base de données collaborative d\'objets de collection',
          baseUrl: '/api/collectibles/coleka',
          features: [
            'search',
            'item-details',
            'categories',
            'translation',
            'high-quality-images',
            'community-data'
          ],
          requiresAuth: false,
          rateLimit: 'FlareSolverr dependent (~3-5s per request)'
        },
        {
          name: 'lulu-berlu',
          description: 'Figurines et collectibles vintage françaises',
          baseUrl: '/api/collectibles/luluberlu',
          features: [
            'search',
            'item-details',
            'translation',
            'vintage-collectibles',
            'french-market'
          ],
          requiresAuth: false,
          rateLimit: 'FlareSolverr dependent (~3-5s per request)'
        },
        {
          name: 'transformerland',
          description: 'Transformers collector\'s guide and online store',
          baseUrl: '/api/collectibles/transformerland',
          features: [
            'search',
            'item-details',
            'translation',
            'collector-guide',
            'vintage-transformers',
            'detailed-specs'
          ],
          requiresAuth: false,
          rateLimit: 'FlareSolverr dependent (~3-5s per request)'
        },
        {
          name: 'carddass',
          description: 'Archive complète de cartes Carddass japonaises (animecollection.fr)',
          baseUrl: '/api/collectibles/carddass',
          features: [
            'search',
            'card-details',
            'hierarchy-browsing',
            'licenses',
            'collections',
            'series',
            'extra-images',
            'packagings',
            'rarity-filter',
            'hd-images',
            'statistics'
          ],
          requiresAuth: false,
          rateLimit: 'Database (fast, <100ms)',
          dataSource: 'PostgreSQL archive (~31,685 cards)'
        }
      ],
      endpoints: {
        coleka: [
          'GET /coleka/search?q={query}&max={20}&lang={fr}&category={lego}&autoTrad={1}',
          'GET /coleka/details?url=coleka://item/{path}&lang={fr}&autoTrad={1}',
          'GET /coleka/item/{path}?lang={fr}&autoTrad={1}',
          'GET /coleka/categories?lang={fr}',
          'GET /coleka/health'
        ],
        luluberlu: [
          'GET /luluberlu/search?q={query}&max={24}&lang={fr}&autoTrad={1}',
          'GET /luluberlu/details?url={https://www.lulu-berlu.com/...a12345.html}&lang={fr}&autoTrad={1}',
          'GET /luluberlu/item/{path}?lang={fr}&autoTrad={1}',
          'GET /luluberlu/health'
        ],
        transformerland: [
          'GET /transformerland/search?q={query}&max={24}&lang={fr}&autoTrad={1}',
          'GET /transformerland/details?id={toyId}&lang={fr}&autoTrad={1}',
          'GET /transformerland/item/{toyId}?lang={fr}&autoTrad={1}',
          'GET /transformerland/health'
        ],
        carddass: [
          'GET /carddass/health',
          'GET /carddass/stats',
          'GET /carddass/search?q={query}&page={1}&pageSize={20}&rarity={Prism}&license={Dragon Ball}',
          'GET /carddass/licenses?page={1}&pageSize={50}',
          'GET /carddass/licenses/{id}',
          'GET /carddass/licenses/{id}/collections?page={1}&pageSize={50}',
          'GET /carddass/collections/{id}/series?page={1}&pageSize={50}',
          'GET /carddass/series/{id}/cards?page={1}&pageSize={50}&rarity={Prism}',
          'GET /carddass/cards/{id}',
          'GET /carddass/cards/{id}/images'
        ]
      }
    }
  });
});

// Health check global du domaine
router.get('/health', async (req, res) => {
  try {
    const healthChecks = await Promise.allSettled([
      import('../providers/coleka.provider.js').then(m => m.healthCheck()),
      import('../providers/luluberlu.provider.js').then(m => m.healthCheck()),
      import('../providers/transformerland.provider.js').then(m => m.healthCheck()),
      import('../providers/carddass.provider.js').then(m => m.healthCheck())
    ]);
    
    const results = healthChecks.map((result, index) => {
      const providerNames = ['coleka', 'lulu-berlu', 'transformerland', 'carddass'];
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
        domain: 'collectibles',
        status: allHealthy ? 'healthy' : 'degraded',
        providers: results,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error(`[Collectibles] Erreur health check: ${error.message}`);
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: error.message
      }
    });
  }
});

export default router;
