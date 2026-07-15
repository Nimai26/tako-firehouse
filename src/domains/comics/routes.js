/**
 * Comics Domain Routes
 * 
 * Point d'entrée des routes pour le domaine des comics/BD.
 * Agrège les sous-routes de chaque provider.
 */

import { Router } from 'express';
import comicVineRoutes from './routes/comicvine.routes.js';
import bedethequeRoutes from './routes/bedetheque.routes.js';
import { createAmazonAliasRouter } from '../ecommerce/routes/amazon-alias.factory.js';

const router = Router();

// Informations du domaine
const domainInfo = {
  domain: 'comics',
  version: '1.0.0',
  description: 'API pour la recherche de comics et BD via différentes sources',
  providers: [
    {
      name: 'comicvine',
      path: '/comicvine',
      description: 'Comic Vine API - Base de données comics américains (GameSpot)',
      requiresKey: true,
      rateLimit: '200 requêtes/15 min'
    },
    {
      name: 'bedetheque',
      path: '/bedetheque',
      description: 'Bedetheque - Base de données BD francophone (scraping)',
      requiresKey: false,
      rateLimit: '1 requête/seconde'
    }
  ]
};

/**
 * GET /
 * Informations sur le domaine comics
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    ...domainInfo,
    endpoints: domainInfo.providers.map(p => ({
      provider: p.name,
      basePath: `/api/comics${p.path}`,
      routes: [
        { method: 'GET', path: '/health', description: 'Health check' },
        { method: 'GET', path: '/search', description: 'Recherche générale' },
        { method: 'GET', path: '/search/volumes', description: 'Rechercher des séries' },
        { method: 'GET', path: '/search/issues', description: 'Rechercher des numéros' },
        { method: 'GET', path: '/search/characters', description: 'Rechercher des personnages' },
        { method: 'GET', path: '/search/publishers', description: 'Rechercher des éditeurs' },
        { method: 'GET', path: '/volume/:id', description: 'Détails d\'un volume' },
        { method: 'GET', path: '/volume/:id/issues', description: 'Issues d\'un volume' },
        { method: 'GET', path: '/issue/:id', description: 'Détails d\'un issue' },
        { method: 'GET', path: '/character/:id', description: 'Détails d\'un personnage' }
      ]
    })),
    params: {
      search: {
        q: 'Terme de recherche (requis)',
        type: 'Type de ressource: volume, issue, character, publisher (défaut: volume)',
        maxResults: 'Nombre de résultats (max 100, défaut 20)',
        page: 'Numéro de page (défaut 1)',
        lang: 'Langue cible pour traduction (fr, de, es, it, pt)',
        autoTrad: 'Activer traduction automatique (1 ou true)'
      }
    }
  });
});

// Montage des routes par provider
router.use('/comicvine', comicVineRoutes);
router.use('/bedetheque', bedethequeRoutes);
router.use('/amazon', createAmazonAliasRouter({ domain: 'comics', category: 'books', categoryLabel: 'Livres' }));

export default router;
