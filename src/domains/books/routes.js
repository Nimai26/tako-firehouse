/**
 * Books Domain Routes
 * 
 * Point d'entrée des routes pour le domaine des livres.
 * Agrège les sous-routes de chaque provider.
 */

import { Router } from 'express';
import googleBooksRoutes from './routes/googlebooks.routes.js';
import openLibraryRoutes from './routes/openlibrary.routes.js';
import abandonwareRoutes from './routes/abandonware.routes.js';
import { createAmazonAliasRouter } from '../ecommerce/routes/amazon-alias.factory.js';

const router = Router();

// Informations du domaine
const domainInfo = {
  domain: 'books',
  version: '1.0.0',
  description: 'API pour la recherche de livres via différentes sources',
  providers: [
    {
      name: 'googlebooks',
      path: '/googlebooks',
      description: 'Google Books API - Plus grande base de données de livres',
      requiresKey: true,
      rateLimit: '1000 requêtes/jour (gratuit)'
    },
    {
      name: 'openlibrary',
      path: '/openlibrary',
      description: 'Open Library - Bibliothèque ouverte et gratuite',
      requiresKey: false,
      rateLimit: 'Non spécifié'
    },
    {
      name: 'abandonware',
      path: '/abandonware',
      description: 'Abandonware Magazines - Archive de magazines français numérisés',
      requiresKey: false,
      rateLimit: 'Non spécifié'
    }
  ]
};

/**
 * GET /
 * Informations sur le domaine books
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    ...domainInfo,
    endpoints: domainInfo.providers.map(p => ({
      provider: p.name,
      basePath: `/api/books${p.path}`,
      routes: [
        { method: 'GET', path: '/health', description: 'Health check' },
        { method: 'GET', path: '/search', description: 'Rechercher des livres' },
        { method: 'GET', path: '/search/author', description: 'Rechercher par auteur' },
        { method: 'GET', path: '/:id', description: 'Détails d\'un livre' }
      ]
    }))
  });
});

/**
 * GET /health
 * Health check global du domaine
 */
router.get('/health', async (req, res) => {
  const { GoogleBooksProvider } = await import('./providers/googlebooks.provider.js');
  const { OpenLibraryProvider } = await import('./providers/openlibrary.provider.js');
  const { AbandonwareProvider } = await import('./providers/abandonware.provider.js');

  const gbProvider = new GoogleBooksProvider();
  const olProvider = new OpenLibraryProvider();
  const awProvider = new AbandonwareProvider();

  const [gbHealth, olHealth, awHealth] = await Promise.allSettled([
    gbProvider.healthCheck(),
    olProvider.healthCheck(),
    awProvider.healthCheck()
  ]);

  const providers = {
    googlebooks: gbHealth.status === 'fulfilled' ? gbHealth.value : { healthy: false, message: gbHealth.reason?.message },
    openlibrary: olHealth.status === 'fulfilled' ? olHealth.value : { healthy: false, message: olHealth.reason?.message },
    abandonware: awHealth.status === 'fulfilled' ? awHealth.value : { healthy: false, message: awHealth.reason?.message }
  };

  const allHealthy = Object.values(providers).every(p => p.healthy);
  const someHealthy = Object.values(providers).some(p => p.healthy);

  res.status(allHealthy ? 200 : someHealthy ? 207 : 503).json({
    domain: 'books',
    status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
    providers,
    timestamp: new Date().toISOString()
  });
});

// Monter les sous-routes
router.use('/googlebooks', googleBooksRoutes);
router.use('/openlibrary', openLibraryRoutes);
router.use('/abandonware', abandonwareRoutes);
router.use('/amazon', createAmazonAliasRouter({ domain: 'books', category: 'books', categoryLabel: 'Livres' }));

export default router;
