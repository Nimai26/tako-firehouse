/**
 * Media Domain - Routes principales
 * 
 * Monte les sous-routes pour chaque provider media
 */

import { Router } from 'express';
import tmdbRoutes from './routes/tmdb.routes.js';
import tvdbRoutes from './routes/tvdb.routes.js';
import { createAmazonAliasRouter } from '../ecommerce/routes/amazon-alias.factory.js';

const router = Router();

// Montage des sous-routes
router.use('/tmdb', tmdbRoutes);
router.use('/tvdb', tvdbRoutes);
router.use('/amazon', createAmazonAliasRouter({ domain: 'media', category: 'movies', categoryLabel: 'Films & Séries' }));

export { router };
