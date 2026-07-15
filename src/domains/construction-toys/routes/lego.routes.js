/**
 * Routes: LEGO Provider
 * 
 * Endpoints pour les produits LEGO
 * 
 * Routes disponibles:
 * - GET /construction-toys/lego/search - Recherche de produits
 * - GET /construction-toys/lego/:id - Détails d'un produit
 * - GET /construction-toys/lego/instructions/:id - Manuels d'instructions
 * - GET /construction-toys/lego/proxy/video - Proxy vidéo CDN LEGO
 */

import { Router } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { LegoProvider } from '../providers/lego.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError, BadGatewayError } from '../../../shared/errors/index.js';

export const router = Router();

// Instance du provider (singleton)
const legoProvider = new LegoProvider();

// ===========================================
// Health Check
// ===========================================

/**
 * GET /construction-toys/lego/health
 * Vérifier la disponibilité du provider
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await legoProvider.healthCheck();
  res.status(health.healthy ? 200 : 503).json(health);
}));

// ===========================================
// Recherche
// ===========================================

/**
 * GET /construction-toys/lego/search
 * Rechercher des produits LEGO
 * 
 * @query {string} q - Terme de recherche (requis)
 * @query {number} page - Page (défaut: 1)
 * @query {number} pageSize - Résultats par page (défaut: 24, max: 100)
 * @query {string} locale - Locale (défaut: fr-FR)
 */
router.get('/search', asyncHandler(async (req, res) => {
const { q, query, page = 1, limit, pageSize = 24, locale = 'fr-FR' } = req.query;
  
  const searchQuery = q || query;
  if (!searchQuery) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const result = await legoProvider.search(searchQuery, {
    page: parseInt(page, 10),
    pageSize: Math.min(parseInt(limit || pageSize, 10), 100),
    locale
  });

  res.json(result);
}));

// ===========================================
// Instructions (doit être AVANT /:id)
// ===========================================

/**
 * GET /construction-toys/lego/instructions/:id
 * Récupérer les manuels d'instructions pour un set LEGO
 * 
 * @param {string} id - ID du produit (ex: 75192)
 * @query {string} locale - Locale (défaut: fr-FR)
 * 
 * @returns {Object} Manuels d'instructions
 * @example
 * {
 *   "success": true,
 *   "id": "75192",
 *   "name": "Millennium Falcon",
 *   "manuals": [
 *     {
 *       "id": "6564020",
 *       "description": "Manuel principal",
 *       "pdfUrl": "https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6564020.pdf",
 *       "sequence": 1
 *     }
 *   ],
 *   "url": "https://www.lego.com/fr-fr/service/building-instructions/75192"
 * }
 */
router.get('/instructions/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { locale = 'fr-FR' } = req.query;

  if (!id) {
    throw new ValidationError('ID produit manquant');
  }

  const instructions = await legoProvider.getLegoInstructions(id, { locale });

  res.json({
    success: true,
    provider: 'lego',
    domain: 'construction-toys',
    id: `lego:${id}`,
    data: instructions,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================
// Proxy vidéo (doit être AVANT /:id)
// ===========================================

// Whitelist stricte : uniquement les vidéos CDN LEGO (anti-SSRF)
const ALLOWED_VIDEO_URL = /^https:\/\/www\.lego\.com\/cdn\/cs\/set\/assets\/blt[0-9a-f]+\/[\w-]+\.mp4$/;

/**
 * GET /construction-toys/lego/proxy/video
 * Proxy pour télécharger les vidéos depuis le CDN LEGO
 * Contourne le rate-limiting en ajoutant les headers appropriés
 * 
 * @query {string} url - URL CDN LEGO de la vidéo (encodée)
 * 
 * @example
 * GET /construction-toys/lego/proxy/video?url=https%3A%2F%2Fwww.lego.com%2Fcdn%2Fcs%2Fset%2Fassets%2Fblt5c92ed12e20671e5%2F75192_v2.mp4
 */
router.get('/proxy/video', asyncHandler(async (req, res) => {
  const { url } = req.query;

  if (!url || !ALLOWED_VIDEO_URL.test(url)) {
    throw new ValidationError(
      'URL vidéo LEGO invalide. Format attendu: https://www.lego.com/cdn/cs/set/assets/blt.../fichier.mp4'
    );
  }

  const upstream = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Referer': 'https://www.lego.com/',
      'Origin': 'https://www.lego.com',
      'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });

  if (!upstream.ok) {
    throw new BadGatewayError(
      `CDN LEGO a répondu ${upstream.status} pour ${url.split('/').pop()}`
    );
  }

  // Extraire le filename pour Content-Disposition
  const filename = url.split('/').pop();

  res.set({
    'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  });

  // Content-Length si disponible (permet la barre de progression côté client)
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    res.set('Content-Length', contentLength);
  }

  // Streamer la vidéo sans la bufferiser en mémoire
  await pipeline(Readable.fromWeb(upstream.body), res);
}));

// ===========================================
// Détails produit
// ===========================================

/**
 * GET /construction-toys/lego/:id
 * Récupérer les détails d'un produit LEGO
 * 
 * @param {string} id - ID du produit (ex: 75192)
 * @query {string} locale - Locale (défaut: fr-FR)
 * @query {boolean} includeInstructions - Inclure les manuels (défaut: true)
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { 
    locale = 'fr-FR', 
    includeInstructions = 'true' 
  } = req.query;

  if (!id) {
    throw new ValidationError('ID produit manquant');
  }

  const result = await legoProvider.getById(id, {
    locale,
    includeInstructions: includeInstructions === 'true'
  });

  res.json(result);
}));

export default router;
