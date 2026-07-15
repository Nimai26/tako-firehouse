/**
 * Boardgames Routes Index
 * 
 * Aggregates all board game provider routes.
 * 
 * @module domains/boardgames/routes
 */

import express from 'express';
import bggRoutes from './bgg.routes.js';
import { createAmazonAliasRouter } from '../../ecommerce/routes/amazon-alias.factory.js';

const router = express.Router();

// BoardGameGeek routes
router.use('/bgg', bggRoutes);

// Amazon alias (catégorie Jouets)
router.use('/amazon', createAmazonAliasRouter({ domain: 'boardgames', category: 'toys', categoryLabel: 'Jouets' }));

export default router;
