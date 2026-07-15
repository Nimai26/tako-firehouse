/**
 * Routes Music Domain
 * 
 * Point d'entrée des routes pour le domaine musique
 * Monte les sous-routes de chaque provider
 * 
 * @module domains/music/routes
 */

import { Router } from 'express';
import discogsRoutes from './routes/discogs.routes.js';
import deezerRoutes from './routes/deezer.routes.js';
import musicbrainzRoutes from './routes/musicbrainz.routes.js';
import itunesRoutes from './routes/itunes.routes.js';
import { createAmazonAliasRouter } from '../ecommerce/routes/amazon-alias.factory.js';
import { logger } from '../../shared/utils/logger.js';

const router = Router();
const log = logger.create('MusicDomain');

// ============================================================================
// DOMAIN INFO
// ============================================================================

/**
 * GET /
 * Informations sur le domaine Music
 */
router.get('/', (req, res) => {
  res.json({
    domain: 'music',
    description: 'APIs de musique - Albums, artistes, tracks',
    providers: [
      {
        name: 'discogs',
        path: '/music/discogs',
        description: 'Base de données vinyle/CD - Releases, masters, labels',
        features: [
          'Recherche releases/masters/artistes/labels',
          'Détails releases avec tracklist',
          'Discographie artistes',
          'Recherche par code-barres',
          'Marketplace info'
        ],
        requiresAuth: false,
        optionalToken: 'DISCOG_API_KEY'
      },
      {
        name: 'deezer',
        path: '/music/deezer',
        description: 'Streaming musical - Albums, artistes, tracks',
        features: [
          'Recherche albums/artistes/tracks',
          'Charts par genre',
          'Previews audio 30s',
          'Artistes similaires',
          'Top tracks artiste'
        ],
        requiresAuth: false
      },
      {
        name: 'musicbrainz',
        path: '/music/musicbrainz',
        description: 'Base de données musicale libre et communautaire',
        features: [
          'Recherche albums/artistes/recordings',
          'Pochettes via Cover Art Archive',
          'Recherche par code-barres',
          'Tags et ratings communautaires',
          'Liens vers autres sources'
        ],
        requiresAuth: false,
        rateLimit: '1 requête/seconde'
      },
      {
        name: 'itunes',
        path: '/music/itunes',
        description: 'Catalogue Apple Music / iTunes Store',
        features: [
          'Recherche albums/artistes/tracks',
          'Previews audio 30s',
          'Prix et disponibilité',
          'Support multi-pays'
        ],
        requiresAuth: false
      }
    ],
    endpoints: {
      discogs: {
        health: 'GET /music/discogs/health',
        search: 'GET /music/discogs/search?q=...',
        searchAlbums: 'GET /music/discogs/search/albums?q=...',
        searchMasters: 'GET /music/discogs/search/masters?q=...',
        searchArtists: 'GET /music/discogs/search/artists?q=...',
        searchLabels: 'GET /music/discogs/search/labels?q=...',
        barcode: 'GET /music/discogs/barcode/:barcode',
        release: 'GET /music/discogs/releases/:id',
        master: 'GET /music/discogs/masters/:id',
        masterVersions: 'GET /music/discogs/masters/:id/versions',
        artist: 'GET /music/discogs/artists/:id',
        artistReleases: 'GET /music/discogs/artists/:id/releases',
        label: 'GET /music/discogs/labels/:id',
        labelReleases: 'GET /music/discogs/labels/:id/releases'
      },
      deezer: {
        health: 'GET /music/deezer/health',
        search: 'GET /music/deezer/search?q=...',
        searchAlbums: 'GET /music/deezer/search/albums?q=...',
        searchArtists: 'GET /music/deezer/search/artists?q=...',
        searchTracks: 'GET /music/deezer/search/tracks?q=...',
        album: 'GET /music/deezer/albums/:id',
        albumTracks: 'GET /music/deezer/albums/:id/tracks',
        artist: 'GET /music/deezer/artists/:id',
        artistTop: 'GET /music/deezer/artists/:id/top',
        artistAlbums: 'GET /music/deezer/artists/:id/albums',
        artistRelated: 'GET /music/deezer/artists/:id/related',
        track: 'GET /music/deezer/tracks/:id',
        genres: 'GET /music/deezer/genres',
        chartAlbums: 'GET /music/deezer/chart/albums',
        chartTracks: 'GET /music/deezer/chart/tracks',
        chartArtists: 'GET /music/deezer/chart/artists'
      },
      musicbrainz: {
        health: 'GET /music/musicbrainz/health',
        search: 'GET /music/musicbrainz/search?q=...',
        searchAlbums: 'GET /music/musicbrainz/search/albums?q=...',
        searchArtists: 'GET /music/musicbrainz/search/artists?q=...',
        barcode: 'GET /music/musicbrainz/barcode/:barcode',
        album: 'GET /music/musicbrainz/albums/:id',
        albumCover: 'GET /music/musicbrainz/albums/:id/cover',
        artist: 'GET /music/musicbrainz/artists/:id',
        artistAlbums: 'GET /music/musicbrainz/artists/:id/albums'
      },
      itunes: {
        health: 'GET /music/itunes/health',
        search: 'GET /music/itunes/search?q=...',
        searchAlbums: 'GET /music/itunes/search/albums?q=...',
        searchArtists: 'GET /music/itunes/search/artists?q=...',
        searchTracks: 'GET /music/itunes/search/tracks?q=...',
        album: 'GET /music/itunes/albums/:id',
        artist: 'GET /music/itunes/artists/:id',
        artistAlbums: 'GET /music/itunes/artists/:id/albums',
        track: 'GET /music/itunes/tracks/:id'
      }
    }
  });
});

/**
 * GET /health
 * Health check global du domaine Music
 */
router.get('/health', async (req, res) => {
  const providers = ['discogs', 'deezer', 'musicbrainz', 'itunes'];
  const healthChecks = {};
  
  // Import dynamique des providers pour les health checks
  const providerModules = {
    discogs: await import('./providers/discogs.provider.js'),
    deezer: await import('./providers/deezer.provider.js'),
    musicbrainz: await import('./providers/musicbrainz.provider.js'),
    itunes: await import('./providers/itunes.provider.js')
  };
  
  for (const provider of providers) {
    try {
      const health = await providerModules[provider].healthCheck();
      healthChecks[provider] = health;
    } catch (error) {
      healthChecks[provider] = {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
  
  const allHealthy = Object.values(healthChecks).every(h => h.status === 'healthy');
  const someHealthy = Object.values(healthChecks).some(h => h.status === 'healthy');
  
  res.status(allHealthy ? 200 : someHealthy ? 207 : 503).json({
    domain: 'music',
    status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
    providers: healthChecks,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// MOUNT PROVIDER ROUTES
// ============================================================================

router.use('/discogs', discogsRoutes);
router.use('/deezer', deezerRoutes);
router.use('/musicbrainz', musicbrainzRoutes);
router.use('/itunes', itunesRoutes);
router.use('/amazon', createAmazonAliasRouter({ domain: 'music', category: 'music', categoryLabel: 'Musique' }));

log.info('Music domain routes initialized', {
  providers: ['discogs', 'deezer', 'musicbrainz', 'itunes']
});

export default router;
