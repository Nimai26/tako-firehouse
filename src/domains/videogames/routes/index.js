/**
 * Routes du domaine Videogames
 * 
 * Agrège les routes de tous les providers (IGDB, RAWG, JVC)
 * 
 * @module domains/videogames/routes
 */

import express from 'express';
import igdbRoutes from './igdb.routes.js';
import rawgRoutes from './rawg.routes.js';
import jvcRoutes from './jvc.routes.js';
import consolevariationsRoutes from './consolevariations.routes.js';
import { createAmazonAliasRouter } from '../../ecommerce/routes/amazon-alias.factory.js';
import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('VideogamesRoutes');
const router = express.Router();

// Routes par provider
router.use('/igdb', igdbRoutes);
router.use('/rawg', rawgRoutes);
router.use('/jvc', jvcRoutes);
router.use('/consolevariations', consolevariationsRoutes);

// Route d'information sur le domaine
router.get('/', (req, res) => {
  res.json({
    domain: 'videogames',
    description: 'API de recherche et métadonnées de jeux vidéo',
    providers: [
      {
        name: 'igdb',
        description: 'IGDB - Internet Game Database (via Twitch API)',
        baseUrl: '/api/videogames/igdb',
        features: [
          'search',
          'advanced-search',
          'game-details',
          'genres',
          'platforms',
          'themes',
          'game-modes',
          'player-perspectives',
          'companies',
          'franchises',
          'collections',
          'top-rated',
          'recent',
          'upcoming'
        ]
      },
      {
        name: 'rawg',
        description: 'RAWG - Video Games Database',
        baseUrl: '/api/videogames/rawg',
        features: [
          'search',
          'advanced-search',
          'game-details',
          'screenshots',
          'stores',
          'series',
          'additions',
          'achievements',
          'movies',
          'genres',
          'platforms',
          'tags',
          'developers',
          'publishers',
          'creators',
          'top-rated',
          'recent',
          'upcoming'
        ]
      },
      {
        name: 'jvc',
        description: 'JeuxVideo.com - French gaming website (scraping)',
        baseUrl: '/api/videogames/jvc',
        features: [
          'search',
          'game-details',
          'pegi-ratings',
          'multiplayer-info',
          'media-formats',
          'french-reviews'
        ],
        note: 'Requires FlareSolverr for anti-bot protection'
      },
      {
        name: 'consolevariations',
        description: 'ConsoleVariations - Console variation database (scraping)',
        baseUrl: '/api/videogames/consolevariations',
        features: [
          'search',
          'item-details',
          'platforms',
          'browse-by-platform',
          'rarity-scores',
          'limited-editions'
        ],
        note: 'Requires FlareSolverr for anti-bot protection'
      }
    ],
    endpoints: {
      igdb: {
        search: 'GET /api/videogames/igdb/search?q={query}',
        advancedSearch: 'POST /api/videogames/igdb/search/advanced',
        game: 'GET /api/videogames/igdb/game/{id}',
        gameBySlug: 'GET /api/videogames/igdb/game/slug/{slug}',
        genres: 'GET /api/videogames/igdb/genres',
        platforms: 'GET /api/videogames/igdb/platforms',
        themes: 'GET /api/videogames/igdb/themes',
        gameModes: 'GET /api/videogames/igdb/game-modes',
        playerPerspectives: 'GET /api/videogames/igdb/player-perspectives',
        companiesSearch: 'GET /api/videogames/igdb/companies/search?q={query}',
        company: 'GET /api/videogames/igdb/company/{id}',
        developerGames: 'GET /api/videogames/igdb/developer/{id}/games',
        publisherGames: 'GET /api/videogames/igdb/publisher/{id}/games',
        franchisesSearch: 'GET /api/videogames/igdb/franchises/search?q={query}',
        franchise: 'GET /api/videogames/igdb/franchise/{id}',
        collection: 'GET /api/videogames/igdb/collection/{id}',
        topRated: 'GET /api/videogames/igdb/top-rated',
        recent: 'GET /api/videogames/igdb/recent',
        upcoming: 'GET /api/videogames/igdb/upcoming',
        health: 'GET /api/videogames/igdb/health'
      },
      rawg: {
        search: 'GET /api/videogames/rawg/search?q={query}',
        advancedSearch: 'POST /api/videogames/rawg/search/advanced',
        game: 'GET /api/videogames/rawg/game/{idOrSlug}',
        screenshots: 'GET /api/videogames/rawg/game/{idOrSlug}/screenshots',
        stores: 'GET /api/videogames/rawg/game/{idOrSlug}/stores',
        series: 'GET /api/videogames/rawg/game/{idOrSlug}/series',
        additions: 'GET /api/videogames/rawg/game/{idOrSlug}/additions',
        achievements: 'GET /api/videogames/rawg/game/{idOrSlug}/achievements',
        movies: 'GET /api/videogames/rawg/game/{idOrSlug}/movies',
        genres: 'GET /api/videogames/rawg/genres',
        genre: 'GET /api/videogames/rawg/genre/{idOrSlug}',
        platforms: 'GET /api/videogames/rawg/platforms',
        parentPlatforms: 'GET /api/videogames/rawg/platforms/parents',
        tags: 'GET /api/videogames/rawg/tags',
        stores: 'GET /api/videogames/rawg/stores',
        developers: 'GET /api/videogames/rawg/developers',
        developer: 'GET /api/videogames/rawg/developer/{idOrSlug}',
        developerGames: 'GET /api/videogames/rawg/developer/{idOrSlug}/games',
        publishers: 'GET /api/videogames/rawg/publishers',
        publisher: 'GET /api/videogames/rawg/publisher/{idOrSlug}',
        publisherGames: 'GET /api/videogames/rawg/publisher/{idOrSlug}/games',
        creators: 'GET /api/videogames/rawg/creators',
        creator: 'GET /api/videogames/rawg/creator/{idOrSlug}',
        topRated: 'GET /api/videogames/rawg/top-rated',
        recent: 'GET /api/videogames/rawg/recent',
        upcoming: 'GET /api/videogames/rawg/upcoming',
        health: 'GET /api/videogames/rawg/health'
      },
      jvc: {
        search: 'GET /api/videogames/jvc/search?q={query}',
        game: 'GET /api/videogames/jvc/game/{id}',
        health: 'GET /api/videogames/jvc/health'
      },
      consolevariations: {
        search: 'GET /api/videogames/consolevariations/search?q={query}&type={all|consoles|controllers|accessories}',
        details: 'GET /api/videogames/consolevariations/details?url=consolevariations://item/{slug}',
        item: 'GET /api/videogames/consolevariations/item/{slug}',
        platforms: 'GET /api/videogames/consolevariations/platforms?brand={nintendo|sony|microsoft|sega}',
        browse: 'GET /api/videogames/consolevariations/browse/{platform}',
        health: 'GET /api/videogames/consolevariations/health'
      }
    }
  });
});

// Health check global du domaine
router.get('/health', async (req, res) => {
  const [igdbHealth, rawgHealth, jvcHealth, consolevariationsHealth] = await Promise.allSettled([
    import('../providers/igdb.provider.js').then(m => m.healthCheck()),
    import('../providers/rawg.provider.js').then(m => m.healthCheck()),
    import('../providers/jvc.provider.js').then(m => m.healthCheck()),
    import('../providers/consolevariations.provider.js').then(m => m.healthCheck())
  ]);
  
  const providers = {
    igdb: igdbHealth.status === 'fulfilled' ? igdbHealth.value : { status: 'error', error: igdbHealth.reason?.message },
    rawg: rawgHealth.status === 'fulfilled' ? rawgHealth.value : { status: 'error', error: rawgHealth.reason?.message },
    jvc: jvcHealth.status === 'fulfilled' ? jvcHealth.value : { status: 'error', error: jvcHealth.reason?.message },
    consolevariations: consolevariationsHealth.status === 'fulfilled' ? consolevariationsHealth.value : { status: 'error', error: consolevariationsHealth.reason?.message }
  };
  
  const healthyCount = Object.values(providers).filter(p => p.status === 'healthy' || p.healthy === true).length;
  const totalCount = Object.keys(providers).length;
  
  res.json({
    domain: 'videogames',
    status: healthyCount === totalCount ? 'healthy' : healthyCount > 0 ? 'degraded' : 'unhealthy',
    providers,
    summary: `${healthyCount}/${totalCount} providers healthy`
  });
});

// Amazon alias (catégorie Jeux vidéo)
router.use('/amazon', createAmazonAliasRouter({ domain: 'videogames', category: 'videogames', categoryLabel: 'Jeux vidéo' }));

export default router;
