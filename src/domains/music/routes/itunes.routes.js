/**
 * Routes iTunes
 * 
 * Endpoints pour l'API iTunes Search (albums, artistes, tracks)
 * 
 * @module domains/music/routes/itunes
 */

import { Router } from 'express';
import * as itunesProvider from '../providers/itunes.provider.js';
import * as itunesNormalizer from '../normalizers/itunes.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';
import { translateGenre, extractLangCode } from '../../../shared/utils/translator.js';
import { withDiscoveryCache, getTTL } from '../../../shared/utils/cache-wrapper.js';

const router = Router();
const log = logger.create('iTunesRoutes');

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /health
 * Vérifie la disponibilité de l'API iTunes
 */
router.get('/health', async (req, res) => {
  try {
    const health = await itunesProvider.healthCheck();
    
    res.json({
      provider: 'itunes',
      status: health.status,
      latency: health.latency,
      features: [
        'Recherche albums/artistes/tracks',
        'Catalogue Apple Music/iTunes Store',
        'Previews audio 30 secondes',
        'Prix et disponibilité par pays',
        'Liens d\'achat/streaming'
      ]
    });
  } catch (error) {
    log.error('Health check failed', { error: error.message });
    res.status(503).json({
      provider: 'itunes',
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
 * Recherche globale (all)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'musicArtist,album,musicTrack', limit = 25, country = 'FR' } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await itunesProvider.search(q, { 
      entity: type,
      limit: parseInt(limit),
      country
    });
    
    // Grouper par type et normaliser
    const artists = [];
    const albums = [];
    const tracks = [];
    
    for (const item of data.results || []) {
      if (item.wrapperType === 'artist') {
        artists.push(itunesNormalizer.normalizeArtistSearchItem(item, artists.length + 1));
      } else if (item.wrapperType === 'collection' || item.collectionType === 'Album') {
        albums.push(itunesNormalizer.normalizeAlbumSearchItem(item, albums.length + 1));
      } else if (item.wrapperType === 'track') {
        tracks.push(itunesNormalizer.normalizeTrackSearchItem(item, tracks.length + 1));
      }
    }
    
    res.json({
      success: true,
      provider: 'itunes',
      domain: 'music',
      query: q,
      total: artists.length + albums.length + tracks.length,
      count: artists.length + albums.length + tracks.length,
      data: [...artists, ...albums, ...tracks],
      pagination: null,
      meta: { fetchedAt: new Date().toISOString() }
    });
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
    const { q, limit = 25, country = 'FR' } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await itunesProvider.searchAlbums(q, { 
      limit: parseInt(limit),
      country
    });
    const normalized = itunesNormalizer.normalizeAlbumSearchResponse(data, q);
    
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
    const { q, limit = 25, country = 'FR' } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await itunesProvider.searchArtists(q, { 
      limit: parseInt(limit),
      country 
    });
    const normalized = itunesNormalizer.normalizeArtistSearchResponse(data, q);
    
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
 * Recherche de tracks/chansons
 */
router.get('/search/tracks', async (req, res) => {
  try {
    const { q, limit = 25, country = 'FR' } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await itunesProvider.searchTracks(q, { 
      limit: parseInt(limit),
      country 
    });
    const normalized = itunesNormalizer.normalizeTrackSearchResponse(data, q);
    
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
 * Détails d'un album avec ses tracks
 */
router.get('/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { country = 'FR' } = req.query;
    
    const data = await itunesProvider.getAlbum(id, { country });
    const normalized = itunesNormalizer.normalizeAlbumDetail(data);
    
    // Traduire le genre si demandé
    const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
    const lang = req.query.lang;
    if (autoTrad && lang && normalized.details?.genre) {
      const targetLang = extractLangCode(lang);
      const translatedGenre = await translateGenre(normalized.details.genre, targetLang);
      if (translatedGenre !== normalized.details.genre) {
        normalized.details.genreOriginal = normalized.details.genre;
        normalized.details.genre = translatedGenre;
      }
    }
    
    res.json({
      success: true,
      provider: 'itunes',
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

// ============================================================================
// DÉTAILS ARTISTE
// ============================================================================

/**
 * GET /artists/:id
 * Détails d'un artiste
 */
router.get('/artists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { country = 'FR' } = req.query;
    
    const data = await itunesProvider.getArtist(id, { country });
    const normalized = itunesNormalizer.normalizeArtistDetail(data);
    
    // Traduire le genre si demandé
    const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
    const lang = req.query.lang;
    if (autoTrad && lang && normalized.details?.genre) {
      const targetLang = extractLangCode(lang);
      const translatedGenre = await translateGenre(normalized.details.genre, targetLang);
      if (translatedGenre !== normalized.details.genre) {
        normalized.details.genreOriginal = normalized.details.genre;
        normalized.details.genre = translatedGenre;
      }
    }
    
    res.json({
      success: true,
      provider: 'itunes',
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
    const { limit = 50, country = 'FR' } = req.query;
    
    const data = await itunesProvider.getArtistAlbums(id, { 
      limit: parseInt(limit),
      country 
    });
    const normalized = itunesNormalizer.normalizeArtistAlbums(data, id);
    
    res.json({
      success: true,
      provider: 'itunes',
      domain: 'music',
      type: 'artist-albums',
      ...normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get artist albums failed', { error: error.message });
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
    const { country = 'FR' } = req.query;
    
    const data = await itunesProvider.lookup(id, { country, entity: 'song' });
    
    if (!data.results || data.results.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Track ${id} non trouvé`
      });
    }
    
    const track = data.results[0];
    
    res.json({
      success: true,
      provider: 'itunes',
      domain: 'music',
      type: 'track',
      id: `itunes:${track.trackId}`,
      data: {
        id: `itunes:${track.trackId}`,
        type: 'music_track',
        source: 'itunes',
        sourceId: String(track.trackId),
        title: track.trackName,
        titleOriginal: null,
        description: null,
        year: track.releaseDate ? new Date(track.releaseDate).getFullYear() : null,
        images: {
          primary: track.artworkUrl100?.replace('100x100', '600x600') || null,
          thumbnail: track.artworkUrl60 || track.artworkUrl100 || null,
          gallery: []
        },
        urls: {
          source: track.trackViewUrl || null,
          detail: `/api/music/itunes/tracks/${track.trackId}`
        },
        details: {
          artist: track.artistName || null,
          artistId: track.artistId ? `itunes:${track.artistId}` : null,
          album: track.collectionName || null,
          albumId: track.collectionId ? `itunes:${track.collectionId}` : null,
          trackNumber: track.trackNumber || null,
          discNumber: track.discNumber || 1,
          duration: track.trackTimeMillis ? Math.round(track.trackTimeMillis / 1000) : null,
          durationFormatted: track.trackTimeMillis 
            ? `${Math.floor(track.trackTimeMillis / 60000)}:${String(Math.floor((track.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}`
            : null,
          genre: track.primaryGenreName || null,
          releaseDate: track.releaseDate || null,
          explicit: track.trackExplicitness === 'explicit',
          preview: track.previewUrl || null,
          price: track.trackPrice || null,
          currency: track.currency || null,
          isStreamable: track.isStreamable || false
        }
      },
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get track failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CHARTS (🆕)
// ============================================================================

/**
 * GET /charts
 * Top charts iTunes par pays
 */
router.get('/charts', async (req, res) => {
  try {
    const { 
      country = 'fr',
      category = 'album', // album ou song
      limit = 25 
    } = req.query;
    
    // Validation de la catégorie
    const validCategories = ['album', 'song'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}`
      });
    }
    
    const { data: rawData, fromCache, cacheKey } = await withDiscoveryCache({
      provider: 'itunes',
      endpoint: 'charts',
      fetchFn: async () => {
        return await itunesProvider.getCharts({ 
          country: country.toLowerCase(),
          entity: category,
          limit: parseInt(limit)
        });
      },
      cacheOptions: {
        category: `${country.toLowerCase()}-${category}`,
        ttl: getTTL('charts')
      }
    });
    
    // L'API RSS iTunes retourne un format différent
    const feed = rawData?.feed;
    if (!feed || !feed.entry) {
      return res.json({
        success: true,
        provider: 'itunes',
        domain: 'music',
        endpoint: 'charts',
        query: null,
        total: 0,
        count: 0,
        data: [],
        pagination: null,
        meta: {
          fetchedAt: new Date().toISOString(),
          country: country.toUpperCase(),
          category,
          limit: parseInt(limit),
          cached: fromCache,
          cacheKey
        }
      });
    }
    
    // Normalisation simplifiée
    const results = feed.entry.map((item, index) => {
      const itunesId = item.id?.attributes?.['im:id'];
      const cover = item['im:image']?.[2]?.label || item['im:image']?.[1]?.label || null;
      return {
        id: `itunes:${itunesId}`,
        type: category === 'songs' ? 'music_track' : 'music_album',
        source: 'itunes',
        sourceId: String(itunesId),
        title: item['im:name']?.label || item.title?.label || '',
        titleOriginal: null,
        description: null,
        year: item['im:releaseDate']?.label ? new Date(item['im:releaseDate']?.label).getFullYear() : null,
        images: {
          primary: cover,
          thumbnail: cover,
          gallery: []
        },
        urls: {
          source: item.link?.attributes?.href || null,
          detail: null
        },
        details: {
          position: index + 1,
          artist: item['im:artist']?.label || null,
          genre: item.category?.attributes?.label || null,
          releaseDate: item['im:releaseDate']?.label || null,
          price: item['im:price']?.label || null,
          rights: item.rights?.label || null
        }
      };
    });
    
    res.json({
      success: true,
      provider: 'itunes',
      domain: 'music',
      endpoint: 'charts',
      query: null,
      total: results.length,
      count: results.length,
      data: results,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        country: country.toUpperCase(),
        category,
        limit: parseInt(limit),
        updated: feed.updated?.label,
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

export default router;
