/**
 * Routes MusicBrainz
 * 
 * Endpoints pour l'API MusicBrainz (albums, artistes, recherche par code-barres)
 * 
 * @module domains/music/routes/musicbrainz
 */

import { Router } from 'express';
import * as musicbrainzProvider from '../providers/musicbrainz.provider.js';
import * as musicbrainzNormalizer from '../normalizers/musicbrainz.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';
import { translateText, translateMusicGenres, extractLangCode } from '../../../shared/utils/translator.js';

const router = Router();
const log = logger.create('MusicBrainzRoutes');

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /health
 * Vérifie la disponibilité de l'API MusicBrainz
 */
router.get('/health', async (req, res) => {
  try {
    const health = await musicbrainzProvider.healthCheck();
    
    res.json({
      provider: 'musicbrainz',
      status: health.status,
      latency: health.latency,
      rateLimit: health.rateLimit,
      features: [
        'Recherche albums/artistes/recordings',
        'Base de données musicale libre',
        'Pochettes via Cover Art Archive',
        'Recherche par code-barres (UPC/EAN)',
        'Métadonnées détaillées (tags, ratings)',
        'Liaison avec Discogs, Spotify, etc.'
      ]
    });
  } catch (error) {
    log.error('Health check failed', { error: error.message });
    res.status(503).json({
      provider: 'musicbrainz',
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
    const { q, type = 'release-group', limit = 25, artist } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await musicbrainzProvider.search(q, { 
      type, 
      limit: parseInt(limit),
      artist 
    });
    
    let normalized;
    if (type === 'artist') {
      normalized = musicbrainzNormalizer.normalizeArtistSearchResponse(data, q);
    } else {
      normalized = musicbrainzNormalizer.normalizeAlbumSearchResponse(data, q);
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
 * Recherche d'albums (release-groups)
 */
router.get('/search/albums', async (req, res) => {
  try {
    const { q, limit = 25, artist } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await musicbrainzProvider.searchAlbums(q, { 
      limit: parseInt(limit),
      artist 
    });
    const normalized = musicbrainzNormalizer.normalizeAlbumSearchResponse(data, q);
    
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
    
    const data = await musicbrainzProvider.searchArtists(q, { limit: parseInt(limit) });
    const normalized = musicbrainzNormalizer.normalizeArtistSearchResponse(data, q);
    
    res.json(normalized);
  } catch (error) {
    log.error('Artist search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CODE-BARRES
// ============================================================================

/**
 * GET /barcode/:barcode
 * Recherche par code-barres (UPC/EAN)
 */
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    
    const data = await musicbrainzProvider.searchByBarcode(barcode);
    const normalized = musicbrainzNormalizer.normalizeBarcodeSearch(data, barcode);
    
    res.json(normalized);
  } catch (error) {
    log.error('Barcode search failed', { error: error.message });
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
 * Détails d'un album (release-group)
 */
router.get('/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupérer l'album
    const album = await musicbrainzProvider.getAlbum(id);
    
    // Récupérer les tracks du premier release si disponible
    let tracks = [];
    if (album.releases && album.releases.length > 0) {
      try {
        const releaseData = await musicbrainzProvider.getReleaseTracks(album.releases[0].id);
        if (releaseData.media) {
          tracks = releaseData.media.flatMap((medium, mediumIdx) =>
            (medium.tracks || []).map((track, trackIdx) => ({
              position: track.position || trackIdx + 1,
              disc: mediumIdx + 1,
              title: track.title,
              duration: track.length
            }))
          );
        }
      } catch (err) {
        log.warn('Could not fetch tracks', { error: err.message });
      }
    }
    
    const normalized = musicbrainzNormalizer.normalizeAlbumDetail(album, tracks);
    
    // Traduire si demandé
    const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
    const lang = req.query.lang;
    if (autoTrad && lang) {
      const targetLang = extractLangCode(lang);

      // Traduire la description (disambiguation)
      if (normalized.description) {
        const { text, translated: wasTranslated } = await translateText(normalized.description, targetLang, { enabled: true, sourceLang: 'en' });
        if (wasTranslated) {
          normalized.details.descriptionOriginal = normalized.description;
          normalized.description = text;
        }
      }

      // Traduire les tags (genres MusicBrainz) — tags sont des {name, count}
      if (normalized.details?.tags && normalized.details.tags.length > 0) {
        const tagNames = normalized.details.tags.map(t => typeof t === 'string' ? t : t.name);
        const { terms: translatedNames, termsOriginal } = await translateMusicGenres(tagNames, targetLang);
        normalized.details.tags = normalized.details.tags.map((t, i) => {
          if (typeof t === 'string') return translatedNames[i];
          return { ...t, name: translatedNames[i] };
        });
        if (termsOriginal) normalized.details.tagsOriginal = termsOriginal;
      }
    }
    
    res.json({
      success: true,
      provider: 'musicbrainz',
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
 * GET /albums/:id/cover
 * Pochette d'un album
 */
router.get('/albums/:id/cover', async (req, res) => {
  try {
    const { id } = req.params;
    const { size = '500' } = req.query;
    
    // Récupérer les infos de pochette
    const coverArt = await musicbrainzProvider.getCoverArt(id);
    
    const images = (coverArt.images || []).map(img => ({
      type: img.types?.join(', ') || 'unknown',
      front: img.front || false,
      back: img.back || false,
      small: img.thumbnails?.small || img.thumbnails?.['250'],
      large: img.thumbnails?.large || img.thumbnails?.['500'],
      xl: img.thumbnails?.['1200'] || img.image,
      url: img.image
    }));
    
    res.json({
      success: true,
      provider: 'musicbrainz',
      domain: 'music',
      type: 'cover-art',
      query: id,
      total: images.length,
      count: images.length,
      data: images,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        albumId: id,
        defaultCover: {
          small: musicbrainzProvider.getCoverUrl(id, '250'),
          medium: musicbrainzProvider.getCoverUrl(id, '500'),
          large: musicbrainzProvider.getCoverUrl(id, '1200')
        }
      }
    });
  } catch (error) {
    log.error('Get cover art failed', { error: error.message });
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
 * Détails d'un artiste
 */
router.get('/artists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await musicbrainzProvider.getArtist(id);
    const normalized = musicbrainzNormalizer.normalizeArtistDetail(data);
    
    // Traduire si demandé
    const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
    const lang = req.query.lang;
    if (autoTrad && lang) {
      const targetLang = extractLangCode(lang);

      // Traduire la description (disambiguation)
      if (normalized.description) {
        const { text, translated: wasTranslated } = await translateText(normalized.description, targetLang, { enabled: true, sourceLang: 'en' });
        if (wasTranslated) {
          normalized.details.descriptionOriginal = normalized.description;
          normalized.description = text;
        }
      }

      // Traduire les tags (genres MusicBrainz) — tags sont des {name, count}
      if (normalized.details?.tags && normalized.details.tags.length > 0) {
        const tagNames = normalized.details.tags.map(t => typeof t === 'string' ? t : t.name);
        const { terms: translatedNames, termsOriginal } = await translateMusicGenres(tagNames, targetLang);
        normalized.details.tags = normalized.details.tags.map((t, i) => {
          if (typeof t === 'string') return translatedNames[i];
          return { ...t, name: translatedNames[i] };
        });
        if (termsOriginal) normalized.details.tagsOriginal = termsOriginal;
      }
    }
    
    res.json({
      success: true,
      provider: 'musicbrainz',
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
    const { limit = 100, offset = 0, type = 'album' } = req.query;
    
    const data = await musicbrainzProvider.getArtistAlbums(id, { 
      limit: parseInt(limit),
      offset: parseInt(offset),
      type 
    });
    
    const normalized = musicbrainzNormalizer.normalizeArtistAlbums(data, id);
    
    res.json({
      success: true,
      provider: 'musicbrainz',
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

export default router;
