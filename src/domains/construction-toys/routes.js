/**
 * Routes: Construction Toys
 * 
 * Endpoints pour les jouets de construction.
 * Ce domaine regroupe les providers LEGO, Rebrickable, Brickset, MEGA, Klickypedia et Playmobil.
 * 
 * Providers disponibles:
 * - /lego       : Site officiel LEGO.com (FlareSolverr)
 * - /rebrickable: API Rebrickable (base communautaire LEGO)
 * - /brickset   : API Brickset (données officielles LEGO)
 * - /mega       : API Searchspring (MEGA Construx - Mattel)
 * - /klickypedia: Encyclopédie Playmobil communautaire
 * - /playmobil  : Site officiel Playmobil (FlareSolverr)
 * 
 * @module construction-toys/routes
 */

import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { createAmazonAliasRouter } from '../ecommerce/routes/amazon-alias.factory.js';

// Import des routers par provider
import legoRouter from './routes/lego.routes.js';
import rebrickableRouter from './routes/rebrickable.routes.js';
import bricksetRouter from './routes/brickset.routes.js';
import megaRouter from './routes/mega.routes.js';
import kreoRouter from './routes/kreo.routes.js';
import klickypediaRouter from './routes/klickypedia.routes.js';
import playmobilRouter from './routes/playmobil.routes.js';

export const router = Router();

// ===========================================
// Routes globales du domaine
// ===========================================

/**
 * GET /construction-toys/
 * Information sur le domaine et les providers disponibles
 */
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    domain: 'construction-toys',
    description: 'APIs pour les jouets de construction (LEGO, etc.)',
    providers: [
      {
        name: 'lego',
        description: 'Site officiel LEGO.com',
        baseUrl: '/construction-toys/lego',
        endpoints: [
          { method: 'GET', path: '/health', description: 'État du provider' },
          { method: 'GET', path: '/search', description: 'Recherche de produits' },
          { method: 'GET', path: '/:id', description: 'Détails d\'un produit' },
          { method: 'GET', path: '/instructions/:id', description: 'Manuels d\'instructions' }
        ],
        rateLimit: '~18s/requête (FlareSolverr)',
        authentication: 'Aucune'
      },
      {
        name: 'rebrickable',
        description: 'Base de données LEGO communautaire',
        baseUrl: '/construction-toys/rebrickable',
        endpoints: [
          { method: 'GET', path: '/health', description: 'État du provider' },
          { method: 'GET', path: '/search', description: 'Recherche de sets' },
          { method: 'GET', path: '/sets/:id', description: 'Détails d\'un set' },
          { method: 'GET', path: '/sets/:id/parts', description: 'Pièces d\'un set' },
          { method: 'GET', path: '/sets/:id/minifigs', description: 'Minifigs d\'un set' },
          { method: 'GET', path: '/themes', description: 'Liste des thèmes' },
          { method: 'GET', path: '/colors', description: 'Liste des couleurs' },
          { method: 'GET', path: '/parts', description: 'Recherche de pièces' },
          { method: 'GET', path: '/minifigs', description: 'Recherche de minifigs' }
        ],
        rateLimit: '1 req/s (gratuit)',
        authentication: 'API Key (REBRICKABLE_API_KEY)'
      },
      {
        name: 'brickset',
        description: 'Données LEGO officielles',
        baseUrl: '/construction-toys/brickset',
        endpoints: [
          { method: 'GET', path: '/health', description: 'État du provider' },
          { method: 'GET', path: '/search', description: 'Recherche de sets' },
          { method: 'GET', path: '/sets/:id', description: 'Détails d\'un set' },
          { method: 'GET', path: '/themes', description: 'Liste des thèmes' },
          { method: 'GET', path: '/themes/:theme/subthemes', description: 'Sous-thèmes' },
          { method: 'GET', path: '/years', description: 'Années disponibles' },
          { method: 'GET', path: '/recently-updated', description: 'Sets récemment mis à jour' }
        ],
        rateLimit: 'Non spécifié',
        authentication: 'API Key (BRICKSET_API_KEY)'
      },
      {
        name: 'mega',
        description: 'MEGA Construx (Mattel) - Pokemon, Halo, etc.',
        baseUrl: '/construction-toys/mega',
        endpoints: [
          { method: 'GET', path: '/health', description: 'État du provider' },
          { method: 'GET', path: '/search', description: 'Recherche de produits' },
          { method: 'GET', path: '/:id', description: 'Détails d\'un produit' },
          { method: 'GET', path: '/instructions/:sku', description: 'Informations instructions' }
        ],
        rateLimit: 'API publique (raisonnable)',
        authentication: 'Aucune'
      },
      {
        name: 'kreo',
        description: 'KRE-O (Hasbro) - Transformers, D&D, Battleship, etc. (2011-2017)',
        baseUrl: '/construction-toys/kreo',
        endpoints: [
          { method: 'GET', path: '/health', description: 'État du provider' },
          { method: 'GET', path: '/search', description: 'Recherche de produits' },
          { method: 'GET', path: '/franchises', description: 'Franchises disponibles' },
          { method: 'GET', path: '/franchise/:name', description: 'Produits par franchise' },
          { method: 'GET', path: '/sublines', description: 'Sous-lignes disponibles' },
          { method: 'GET', path: '/file/:setNumber/image', description: 'Image statique (redirect)' },
          { method: 'GET', path: '/:id', description: 'Détails d\'un produit' }
        ],
        rateLimit: 'Archive locale (rapide)',
        authentication: 'Aucune'
      },
      {
        name: 'klickypedia',
        description: 'Encyclopédie Playmobil communautaire',
        baseUrl: '/construction-toys/klickypedia',
        endpoints: [
          { method: 'GET', path: '/health', description: 'État du provider' },
          { method: 'GET', path: '/search', description: 'Recherche de sets' },
          { method: 'GET', path: '/:id', description: 'Détails d\'un set' },
          { method: 'GET', path: '/instructions/:productId', description: 'Instructions de montage' }
        ],
        rateLimit: '1 req/s (respecter le site communautaire)',
        authentication: 'Aucune'
      },
      {
        name: 'playmobil',
        description: 'Site officiel Playmobil.com (FlareSolverr)',
        baseUrl: '/construction-toys/playmobil',
        endpoints: [
          { method: 'GET', path: '/health', description: 'État du provider + FlareSolverr' },
          { method: 'GET', path: '/search', description: 'Recherche de produits (~18s)' },
          { method: 'GET', path: '/:id', description: 'Détails d\'un produit (~18-36s)' },
          { method: 'GET', path: '/instructions/:productId', description: 'Instructions de montage (rapide)' }
        ],
        rateLimit: '~18s/requête (FlareSolverr)',
        authentication: 'Aucune'
      }
    ]
  });
}));

/**
 * GET /construction-toys/search
 * Recherche multi-provider
 */
router.get('/search', asyncHandler(async (req, res) => {
  // TODO: Implémenter la recherche multi-provider
  res.json({
    success: false,
    error: 'Not implemented',
    message: 'Multi-provider search not yet implemented. Use provider-specific search endpoints.',
    alternatives: [
      '/construction-toys/lego/search?q=...',
      '/construction-toys/rebrickable/search?q=...',
      '/construction-toys/brickset/search?q=...',
      '/construction-toys/mega/search?q=...',
      '/construction-toys/klickypedia/search?q=...',
      '/construction-toys/playmobil/search?q=...'
    ]
  });
}));

// ===========================================
// Sous-routes par provider
// ===========================================

router.use('/lego', legoRouter);
router.use('/rebrickable', rebrickableRouter);
router.use('/brickset', bricksetRouter);
router.use('/mega', megaRouter);
router.use('/kreo', kreoRouter);
router.use('/klickypedia', klickypediaRouter);
router.use('/playmobil', playmobilRouter);
// router.use('/playmobil', playmobilRouter);
router.use('/amazon', createAmazonAliasRouter({ domain: 'construction-toys', category: 'toys', categoryLabel: 'Jouets' }));
