/**
 * Routes Discogs
 * 
 * Endpoints pour l'API Discogs (releases, masters, artistes, labels)
 * 
 * @module domains/music/routes/discogs
 */

import { Router } from 'express';
import * as discogsProvider from '../providers/discogs.provider.js';
import * as discogsNormalizer from '../normalizers/discogs.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';
import { translateFields, translateText, translateMusicGenres, extractLangCode } from '../../../shared/utils/translator.js';

const router = Router();
const log = logger.create('DiscogsRoutes');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Traduit les champs texte si demandé
 */
async function applyTranslation(data, req) {
  const autoTrad = req.query.autoTrad === '1' || req.query.autoTrad === 'true';
  const lang = req.query.lang || 'fr';
  
  if (!autoTrad) return data;
  
  const targetLang = extractLangCode(lang);
  const result = { ...data, details: { ...data.details } };
  
  try {
    // Traduire la description top-level (notes pour releases, profile pour artistes/labels)
    if (result.description) {
      const { text, translated: wasTranslated } = await translateText(result.description, targetLang, { enabled: true, sourceLang: 'en' });
      if (wasTranslated) {
        result.details.descriptionOriginal = result.description;
        result.description = text;
      }
    }

    // Champs texte à traduire dans details (notes, profile dupliqués dans details)
    if (result.details) {
      const fieldsToTranslate = ['notes', 'profile'];
      const translated = await translateFields(result.details, fieldsToTranslate, lang);
      Object.assign(result.details, translated);
    }
    
    // Traduire les genres musicaux
    if (result.details?.genres && result.details.genres.length > 0) {
      const { terms: translatedGenres, termsOriginal } = await translateMusicGenres(result.details.genres, targetLang);
      result.details.genres = translatedGenres;
      if (termsOriginal) result.details.genresOriginal = termsOriginal;
    }
    
    // Traduire les styles musicaux (mêmes dictionnaires)
    if (result.details?.styles && result.details.styles.length > 0) {
      const { terms: translatedStyles, termsOriginal } = await translateMusicGenres(result.details.styles, targetLang);
      result.details.styles = translatedStyles;
      if (termsOriginal) result.details.stylesOriginal = termsOriginal;
    }
    
    return result;
  } catch (error) {
    log.warn('Translation failed', { error: error.message });
    return data;
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /health
 * Vérifie la disponibilité de l'API Discogs
 */
router.get('/health', async (req, res) => {
  try {
    const health = await discogsProvider.healthCheck();
    
    res.json({
      provider: 'discogs',
      status: health.status,
      latency: health.latency,
      hasToken: health.hasToken,
      rateLimit: health.rateLimit,
      features: [
        'Recherche releases/masters/artistes/labels',
        'Détails albums avec tracklist',
        'Discographie artistes',
        'Recherche par code-barres',
        'Base de données vinyles/CD complète'
      ]
    });
  } catch (error) {
    log.error('Health check failed', { error: error.message });
    res.status(503).json({
      provider: 'discogs',
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
 * Recherche globale sur Discogs
 */
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'release', limit = 25, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await discogsProvider.search(q, { 
      type, 
      limit: parseInt(limit), 
      page: parseInt(page) 
    });
    
    const normalized = discogsNormalizer.normalizeSearchResponse(data, q, type);
    
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
 * Recherche d'albums (releases)
 */
router.get('/search/albums', async (req, res) => {
  try {
    const { q, limit = 25, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await discogsProvider.searchReleases(q, { 
      limit: parseInt(limit), 
      page: parseInt(page) 
    });
    
    const normalized = discogsNormalizer.normalizeSearchResponse(data, q, 'release');
    
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
 * GET /search/masters
 * Recherche de masters (albums originaux)
 */
router.get('/search/masters', async (req, res) => {
  try {
    const { q, limit = 25, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await discogsProvider.searchMasters(q, { 
      limit: parseInt(limit), 
      page: parseInt(page) 
    });
    
    const normalized = discogsNormalizer.normalizeSearchResponse(data, q, 'master');
    
    res.json(normalized);
  } catch (error) {
    log.error('Master search failed', { error: error.message });
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
    const { q, limit = 25, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await discogsProvider.searchArtists(q, { 
      limit: parseInt(limit), 
      page: parseInt(page) 
    });
    
    const normalized = discogsNormalizer.normalizeSearchResponse(data, q, 'artist');
    
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
 * GET /search/labels
 * Recherche de labels
 */
router.get('/search/labels', async (req, res) => {
  try {
    const { q, limit = 25, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre q (query) est requis'
      });
    }
    
    const data = await discogsProvider.searchLabels(q, { 
      limit: parseInt(limit), 
      page: parseInt(page) 
    });
    
    const normalized = discogsNormalizer.normalizeSearchResponse(data, q, 'label');
    
    res.json(normalized);
  } catch (error) {
    log.error('Label search failed', { error: error.message });
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
 * Recherche par code-barres
 */
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    
    const data = await discogsProvider.searchByBarcode(barcode);
    const normalized = discogsNormalizer.normalizeBarcodeSearch(data, barcode);
    
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
// DÉTAILS RELEASE
// ============================================================================

/**
 * Handler partagé pour les détails d'une release
 */
async function handleReleaseDetail(req, res) {
  try {
    const { id } = req.params;
    
    const data = await discogsProvider.getRelease(id);
    let normalized = discogsNormalizer.normalizeReleaseDetail(data);
    normalized = await applyTranslation(normalized, req);
    
    res.json({
      success: true,
      provider: 'discogs',
      domain: 'music',
      type: 'release',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get release failed', { error: error.message });
    res.status(error.message.includes('non trouvée') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /releases/:id
 * Détails d'une release
 */
router.get('/releases/:id', handleReleaseDetail);

// Alias /albums/:id -> /releases/:id
router.get('/albums/:id', handleReleaseDetail);

// ============================================================================
// DÉTAILS MASTER
// ============================================================================

/**
 * GET /masters/:id
 * Détails d'un master
 */
router.get('/masters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await discogsProvider.getMaster(id);
    let normalized = discogsNormalizer.normalizeMasterDetail(data);
    normalized = await applyTranslation(normalized, req);
    
    res.json({
      success: true,
      provider: 'discogs',
      domain: 'music',
      type: 'master',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get master failed', { error: error.message });
    res.status(error.message.includes('non trouvé') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /masters/:id/versions
 * Versions d'un master
 */
router.get('/masters/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const data = await discogsProvider.getMasterVersions(id, { 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
    
    const versions = (data.versions || []).map((v, idx) => ({
      id: `discogs:${v.id}`,
      type: 'music_album',
      source: 'discogs',
      sourceId: String(v.id),
      title: v.title,
      titleOriginal: null,
      description: null,
      year: v.released ? parseInt(v.released.substring(0, 4)) || null : null,
      images: {
        primary: v.thumb || null,
        thumbnail: v.thumb || null,
        gallery: []
      },
      urls: {
        source: null,
        detail: `/api/music/discogs/releases/${v.id}`
      },
      details: {
        position: idx + 1,
        format: v.format,
        label: v.label,
        country: v.country,
        released: v.released,
        catalogNumber: v.catno || null,
        status: v.status || null
      }
    }));
    
    res.json({
      success: true,
      provider: 'discogs',
      domain: 'music',
      type: 'master-versions',
      query: id,
      total: data.pagination?.items || versions.length,
      count: versions.length,
      pagination: {
        page: data.pagination?.page || 1,
        limit: data.pagination?.per_page || 50,
        hasMore: (data.pagination?.page || 1) < (data.pagination?.pages || 1)
      },
      data: versions,
      meta: { fetchedAt: new Date().toISOString(), masterId: id }
    });
  } catch (error) {
    log.error('Get master versions failed', { error: error.message });
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
    
    const data = await discogsProvider.getArtist(id);
    let normalized = discogsNormalizer.normalizeArtistDetail(data);
    normalized = await applyTranslation(normalized, req);
    
    res.json({
      success: true,
      provider: 'discogs',
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
 * GET /artists/:id/releases
 * Discographie d'un artiste
 */
router.get('/artists/:id/releases', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, sort = 'year', sortOrder = 'desc' } = req.query;
    
    const data = await discogsProvider.getArtistReleases(id, { 
      page: parseInt(page), 
      limit: parseInt(limit),
      sort,
      sortOrder
    });
    
    const normalized = discogsNormalizer.normalizeArtistReleases(data, id);
    
    res.json({
      success: true,
      provider: 'discogs',
      domain: 'music',
      type: 'artist-releases',
      ...normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get artist releases failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DÉTAILS LABEL
// ============================================================================

/**
 * GET /labels/:id
 * Détails d'un label
 */
router.get('/labels/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const data = await discogsProvider.getLabel(id);
    let normalized = discogsNormalizer.normalizeLabelDetail(data);
    normalized = await applyTranslation(normalized, req);
    
    res.json({
      success: true,
      provider: 'discogs',
      domain: 'music',
      type: 'label',
      id: normalized.id,
      data: normalized,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get label failed', { error: error.message });
    res.status(error.message.includes('non trouvé') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /labels/:id/releases
 * Releases d'un label
 */
router.get('/labels/:id/releases', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const data = await discogsProvider.getLabelReleases(id, { 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
    
    const releases = (data.releases || []).map((r, idx) => ({
      id: `discogs:${r.id}`,
      type: 'music_album',
      source: 'discogs',
      sourceId: String(r.id),
      title: r.title,
      titleOriginal: null,
      description: null,
      year: r.year || null,
      images: {
        primary: r.thumb || null,
        thumbnail: r.thumb || null,
        gallery: []
      },
      urls: {
        source: null,
        detail: `/api/music/discogs/releases/${r.id}`
      },
      details: {
        position: idx + 1,
        artist: r.artist,
        format: r.format,
        catalogNumber: r.catno || null,
        status: r.status || null
      }
    }));
    
    res.json({
      success: true,
      provider: 'discogs',
      domain: 'music',
      type: 'label-releases',
      query: id,
      total: data.pagination?.items || releases.length,
      count: releases.length,
      pagination: {
        page: data.pagination?.page || 1,
        limit: data.pagination?.per_page || 50,
        hasMore: (data.pagination?.page || 1) < (data.pagination?.pages || 1)
      },
      data: releases,
      meta: { fetchedAt: new Date().toISOString() }
    });
  } catch (error) {
    log.error('Get label releases failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
