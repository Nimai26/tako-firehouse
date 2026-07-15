/**
 * Routes Deezer
 * 
 * Endpoints pour l'API Deezer (albums, artistes, tracks, charts)
 * 
 * @module domains/music/routes/deezer
 */

import { Router } from 'express';
import * as deezerProvider from '../providers/deezer.provider.js';
import * as deezerNormalizer from '../normalizers/deezer.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';
import { translateMusicGenres, extractLangCode } from '../../../shared/utils/translator.js';
import { withDiscoveryCache, getTTL } from '../../../shared/utils/cache-wrapper.js';

const router = Router();
const log = logger.create('DeezerRoutes');

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /health
 * Vérifie la disponibilité de l'API Deezer
 */
router.get('/health', async (req, res) => {
  try {
    const health = await deezerProvider.healthCheck();
    
    res.json({
      provider: 'deezer',
      status: health.status,
      latency: health.latency,
      features: [
        'Recherche albums/artistes/tracks',
        'Détails albums avec tracklist et preview',
        'Profil artiste avec top tracks',
        'Artistes similaires',
        'Charts et genres',
        'Previews audio 30 secondes'
      ]
    });
  } catch (error) {
    log.error('Health check failed', { error: error.message });
    res.status(503).json({
      provider: 'deezer',
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * GET /search
 * Recherche globale (albums par défaut)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'album', limit = 25 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await deezerProvider.search(q, { type, limit: parseInt(limit) });
    
    let normalized;
    if (type === 'artist') {
      normalized = deezerNormalizer.normalizeArtistSearchResponse(data, q);
    } else if (type === 'track') {
      normalized = deezerNormalizer.normalizeTrackSearchResponse(data, q);
    } else {
      normalized = deezerNormalizer.normalizeAlbumSearchResponse(data, q);
    }
    
    res.json(normalized);
  } catch (error) {
    log.error('Search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /search/albums
 * Recherche d'albums
 */
router.get('/search/albums', async (req, res) => {
  try {
    const { q, limit = 25 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await deezerProvider.searchAlbums(q, { limit: parseInt(limit) });
    const normalized = deezerNormalizer.normalizeAlbumSearchResponse(data, q);
    
    res.json(normalized);
  } catch (error) {
    log.error('Album search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /search/artists
 * Recherche d'artistes
 */
router.get('/search/artists', async (req, res) => {
  try {
    const { q, limit = 25 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await deezerProvider.searchArtists(q, { limit: parseInt(limit) });
    const normalized = deezerNormalizer.normalizeArtistSearchResponse(data, q);
    
    res.json(normalized);
  } catch (error) {
    log.error('Artist search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /search/tracks
 * Recherche de tracks
 */
router.get('/search/tracks', async (req, res) => {
  try {
    const { q, limit = 25 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await deezerProvider.searchTracks(q, { limit: parseInt(limit) });
    const normalized = deezerNormalizer.normalizeTrackSearchResponse(data, q);
    
    res.json(normalized);
  } catch (error) {
    log.error('Track search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DÉTAILS ALBUM
// ============================================================================

/**
 * GET /albums/:id
 * Détails d'un album
 */
router.get('/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await deezerProvider.getAlbum(id);
    const normalized = deezerNormalizer.normalizeAlbumDetail(data);
    
    // Traduire les genres si demandé
    const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
    const lang = req.query.lang;
    if (autoTrad && lang && normalized.details?.genres && normalized.details.genres.length > 0) {
      const targetLang = extractLangCode(lang);
      const { terms: translatedGenres, termsOriginal } = await translateMusicGenres(normalized.details.genres, targetLang);
      normalized.details.genres = translatedGenres;
      if (termsOriginal) normalized.details.genresOriginal = termsOriginal;
    }
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'album',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get album failed', { error: error.message });
    res.status(error.message.includes('non trouvé') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /albums/:id/tracks
 * Tracks d'un album
 */
router.get('/albums/:id/tracks', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;
    
    const data = await deezerProvider.getAlbumTracks(id, { limit: parseInt(limit) });
    
    const tracks = (data.data || []).map((t, idx) =>
      deezerNormalizer.normalizeTrackSearchItem(t, idx + 1)
    );
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'album-tracks',
      query: id,
      total: data.total || tracks.length,
      count: tracks.length,
      data: tracks,
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), albumId: id }
    });
  } catch (error) {
    log.error('Get album tracks failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DÉTAILS ARTISTE
// ============================================================================

/**
 * GET /artists/:id
 * Détails d'un artiste avec top tracks et albums
 */
router.get('/artists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupérer artiste, top tracks et albums en parallèle
    const [artist, topTracks, albums] = await Promise.all([
      deezerProvider.getArtist(id),
      deezerProvider.getArtistTopTracks(id, { limit: 10 }),
      deezerProvider.getArtistAlbums(id, { limit: 50 })
    ]);
    
    const normalized = deezerNormalizer.normalizeArtistDetail(artist, topTracks, albums);
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'artist',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get artist failed', { error: error.message });
    res.status(error.message.includes('non trouvé') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /artists/:id/albums
 * Albums d'un artiste
 */
router.get('/artists/:id/albums', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    const data = await deezerProvider.getArtistAlbums(id, { limit: parseInt(limit) });
    
    const albums = (data.data || []).map((a, idx) => 
      deezerNormalizer.normalizeAlbumSearchItem(a, idx + 1)
    );
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'artist-albums',
      query: id,
      total: data.total || albums.length,
      count: albums.length,
      data: albums,
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), artistId: id }
    });
  } catch (error) {
    log.error('Get artist albums failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /artists/:id/top
 * Top tracks d'un artiste
 */
router.get('/artists/:id/top', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    const data = await deezerProvider.getArtistTopTracks(id, { limit: parseInt(limit) });
    
    const tracks = (data.data || []).map((t, idx) => 
      deezerNormalizer.normalizeTrackSearchItem(t, idx + 1)
    );
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'artist-top',
      query: id,
      total: tracks.length,
      count: tracks.length,
      data: tracks,
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), artistId: id }
    });
  } catch (error) {
    log.error('Get artist top tracks failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /artists/:id/related
 * Artistes similaires
 */
router.get('/artists/:id/related', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;
    
    const data = await deezerProvider.getArtistRelated(id, { limit: parseInt(limit) });
    
    const artists = (data.data || []).map((a, idx) => 
      deezerNormalizer.normalizeArtistSearchItem(a, idx + 1)
    );
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'related-artists',
      query: id,
      total: artists.length,
      count: artists.length,
      data: artists,
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), artistId: id }
    });
  } catch (error) {
    log.error('Get related artists failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DÉTAILS TRACK
// ============================================================================

/**
 * GET /tracks/:id
 * Détails d'un track
 */
router.get('/tracks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await deezerProvider.getTrack(id);
    const normalized = deezerNormalizer.normalizeTrackDetail(data);
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'track',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get track failed', { error: error.message });
    res.status(error.message.includes('non trouvé') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GENRES & CHARTS
// ============================================================================

/**
 * GET /genres
 * Liste des genres
 */
router.get('/genres', async (req, res) => {
  try {
    const data = await deezerProvider.getGenres();
    const normalized = deezerNormalizer.normalizeGenres(data);
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      type: 'genres',
      query: null,
      total: normalized.total || normalized.data?.length || 0,
      count: normalized.data?.length || 0,
      data: normalized.data || [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get genres failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /chart/albums
 * Top albums
 */
router.get('/chart/albums', async (req, res) => {
  try {
    const { limit = 25 } = req.query;
    
    const data = await deezerProvider.getChart('albums', { limit: parseInt(limit) });
    const normalized = deezerNormalizer.normalizeChart(data, 'albums');
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      endpoint: 'charts',
      query: null,
      total: normalized.total || 0,
      count: (normalized.data || []).length,
      data: normalized.data || [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), category: 'albums' }
    });
  } catch (error) {
    log.error('Get chart albums failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /charts - Route générique pour charts (🆕)
 * Charts Deezer (albums/tracks/artists)
 */
router.get('/charts', async (req, res) => {
  try {
    const { category = 'albums', limit = 25 } = req.query;
    
    // Validation de la catégorie
    const validCategories = ['albums', 'tracks', 'artists'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}`
      });
    }
    
    const { data: normalized, fromCache, cacheKey } = await withDiscoveryCache({
      provider: 'deezer',
      endpoint: 'charts',
      fetchFn: async () => {
        const data = await deezerProvider.getChart(category, { limit: parseInt(limit) });
        return deezerNormalizer.normalizeChart(data, category);
      },
      cacheOptions: {
        category,
        ttl: getTTL('charts')
      }
    });
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      endpoint: 'charts',
      query: null,
      total: normalized.total || 0,
      count: (normalized.data || []).length,
      data: normalized.data || [],
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        category,
        limit: parseInt(limit),
        cached: fromCache,
        cacheKey
      }
    });
  } catch (error) {
    log.error('Get charts failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /chart/tracks
 * Top tracks
 */
router.get('/chart/tracks', async (req, res) => {
  try {
    const { limit = 25 } = req.query;
    
    const data = await deezerProvider.getChart('tracks', { limit: parseInt(limit) });
    const normalized = deezerNormalizer.normalizeChart(data, 'tracks');
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      endpoint: 'charts',
      query: null,
      total: normalized.total || 0,
      count: (normalized.data || []).length,
      data: normalized.data || [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), category: 'tracks' }
    });
  } catch (error) {
    log.error('Get chart tracks failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /chart/artists
 * Top artistes
 */
router.get('/chart/artists', async (req, res) => {
  try {
    const { limit = 25 } = req.query;
    
    const data = await deezerProvider.getChart('artists', { limit: parseInt(limit) });
    const normalized = deezerNormalizer.normalizeChart(data, 'artists');
    
    res.json({
      success: true,
      provider: 'deezer',
      domain: 'music',
      endpoint: 'charts',
      query: null,
      total: normalized.total || 0,
      count: (normalized.data || []).length,
      data: normalized.data || [],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), category: 'artists' }
    });
  } catch (error) {
    log.error('Get chart artists failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
