/**
 * Domain: TCG (Trading Card Games)
 * Cartes à collectionner - Pokemon, MTG, YuGiOh, Lorcana, Digimon, OnePiece
 */

import { Router } from 'express';
import pokemonRouter from './routes/pokemon.routes.js';
import mtgRouter from './routes/mtg.routes.js';
import yugiohRouter from './routes/yugioh.routes.js';
import lorcanaRouter from './routes/lorcana.routes.js';
import digimonRouter from './routes/digimon.routes.js';
import onepieceRouter from './routes/onepiece.routes.js';
import dbsRouter from './routes/dbs.routes.js';
import { healthCheck as pokemonHealth } from './providers/pokemon.provider.js';
import { healthCheck as mtgHealth } from './providers/mtg.provider.js';
import { healthCheck as yugiohHealth } from './providers/yugioh.provider.js';
import { healthCheck as lorcanaHealth } from './providers/lorcana.provider.js';
import { healthCheck as digimonHealth } from './providers/digimon.provider.js';
import { healthCheck as onepieceHealth } from './providers/onepiece.provider.js';
import { healthCheck as dbsHealth } from './providers/dbs.provider.js';
import { logger } from '../../shared/utils/logger.js';

const router = Router();

// Routes Pokemon TCG
router.use('/pokemon', pokemonRouter);

// Routes MTG
router.use('/mtg', mtgRouter);

// Routes Yu-Gi-Oh!
router.use('/yugioh', yugiohRouter);

// Routes Lorcana
router.use('/lorcana', lorcanaRouter);

// Routes Digimon
router.use('/digimon', digimonRouter);

// Routes One Piece
router.use('/onepiece', onepieceRouter);

// Routes Dragon Ball Super
router.use('/dbs', dbsRouter);

/**
 * GET /health
 * Health check global TCG
 */
router.get('/health', async (req, res) => {
  try {
    const [pokemon, mtg, yugioh, lorcana, digimon, onepiece, dbs] = await Promise.allSettled([
      pokemonHealth(),
      mtgHealth(),
      yugiohHealth(),
      lorcanaHealth(),
      digimonHealth(),
      onepieceHealth(),
      dbsHealth()
    ]);

    const providers = {
      pokemon: pokemon.status === 'fulfilled' ? pokemon.value : { healthy: false, message: pokemon.reason?.message },
      mtg: mtg.status === 'fulfilled' ? mtg.value : { healthy: false, message: mtg.reason?.message },
      yugioh: yugioh.status === 'fulfilled' ? yugioh.value : { healthy: false, message: yugioh.reason?.message },
      lorcana: lorcana.status === 'fulfilled' ? lorcana.value : { healthy: false, message: lorcana.reason?.message },
      digimon: digimon.status === 'fulfilled' ? digimon.value : { healthy: false, message: digimon.reason?.message },
      onepiece: onepiece.status === 'fulfilled' ? onepiece.value : { healthy: false, message: onepiece.reason?.message },
      dbs: dbs.status === 'fulfilled' ? dbs.value : { healthy: false, message: dbs.reason?.message }
    };

    const allHealthy = Object.values(providers).every(p => p.healthy);

    res.json({
      success: true,
      domain: 'tcg',
      status: allHealthy ? 'healthy' : 'degraded',
      providers,
      meta: {
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error(`[TCG] Health check error: ${error.message}`);
    res.status(500).json({
      success: false,
      domain: 'tcg',
      error: error.message
    });
  }
});

/**
 * GET /
 * Info domaine TCG
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    domain: 'tcg',
    description: 'Trading Card Games - Cartes à collectionner',
    providers: [
      {
        name: 'pokemon',
        title: 'Pokémon TCG',
        status: 'active',
        endpoints: ['/search', '/card/:id', '/sets', '/health']
      },
      {
        name: 'mtg',
        title: 'Magic: The Gathering',
        status: 'active',
        endpoints: ['/search', '/card/:id', '/sets', '/health']
      },
      {
        name: 'yugioh',
        title: 'Yu-Gi-Oh! TCG',
        status: 'active',
        endpoints: ['/search', '/card/:id', '/sets', '/archetype', '/health']
      },
      {
        name: 'lorcana',
        title: 'Disney Lorcana',
        status: 'active',
        endpoints: ['/search', '/card/:id', '/sets', '/health']
      },
      {
        name: 'digimon',
        title: 'Digimon Card Game',
        status: 'active',
        endpoints: ['/search', '/card/:id', '/health']
      },
      {
        name: 'onepiece',
        title: 'One Piece Card Game',
        status: 'active',
        endpoints: ['/search', '/card/:id', '/health']
      },
      {
        name: 'dbs',
        title: 'Dragon Ball Super Card Game',
        status: 'active',
        endpoints: ['/search', '/card/:id', '/sets', '/sets/:code', '/stats', '/health']
      }
    ],
    meta: {
      version: '1.0.0',
      activeProviders: 7
    }
  });
});

export { router };
