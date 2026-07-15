/**
 * Routes Nautiljon
 * 
 * Endpoints pour les données manga depuis Nautiljon.com.
 * Spécialisé dans les données par volume (ISBN, pages, prix, chapitres).
 * 
 * Routes disponibles :
 * - GET /health                           - Health check
 * - GET /search                           - Recherche de mangas (séries)
 * - GET /search/volumes                   - Recherche → liste de volumes directe
 * - GET /series/:slug                     - Détails d'une série
 * - GET /series/:slug/volumes             - Liste des volumes d'une série
 * - GET /series/:slug/volume/:volumeId    - Détails d'un volume
 * 
 * Note : Données en français (source Nautiljon.com)
 */

import { Router } from 'express';
import { NautiljonProvider } from '../providers/nautiljon.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';

const router = Router();
const provider = new NautiljonProvider();

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

router.get('/health', asyncHandler(async (req, res) => {
  const health = await provider.healthCheck();

  res.status(health.healthy ? 200 : 503).json({
    provider: 'nautiljon',
    status: health.healthy ? 'healthy' : 'unhealthy',
    latency: health.latency,
    message: health.message,
    features: {
      apiKey: false,
      scraping: true,
      volumeDetails: true,
      language: 'fr'
    }
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/nautiljon/search
 * Recherche de mangas sur Nautiljon
 * 
 * Query params :
 * - q (required) : Terme de recherche
 * - maxResults : Nombre de résultats (défaut 20)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, maxResults = '20' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const results = await provider.search(q.trim(), {
    maxResults: Math.min(parseInt(limit || maxResults) || 20, 50)
  });

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// RECHERCHE DE VOLUMES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/nautiljon/search/volumes
 * Recherche un manga et retourne directement la liste de ses volumes
 * 
 * Query params :
 * - q (required) : Terme de recherche (ex: "naruto", "one piece")
 * - volume : Filtrer par numéro de volume (ex: "5")
 * - maxResults : Nombre max de volumes (défaut 50)
 */
router.get('/search/volumes', asyncHandler(async (req, res) => {
  const { q, volume = null, limit, maxResults = '50' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Le paramètre "q" est requis pour la recherche');
  }

  const results = await provider.searchVolumes(q.trim(), {
    volume: volume ? String(volume) : null,
    maxResults: Math.min(parseInt(limit || maxResults) || 50, 200)
  });

  res.json(results);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS SÉRIE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/nautiljon/series/:slug
 * Détails d'une série manga
 * 
 * Params :
 * - slug : Slug Nautiljon (ex: "one+piece", "naruto", "dragon+ball")
 */
router.get('/series/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    throw new ValidationError('Slug de série requis');
  }

  const result = await provider.getSeries(slug);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════════════
// LISTE DES VOLUMES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/nautiljon/series/:slug/volumes
 * Liste des volumes d'une série
 * 
 * Params :
 * - slug : Slug Nautiljon
 */
router.get('/series/:slug/volumes', asyncHandler(async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    throw new ValidationError('Slug de série requis');
  }

  const result = await provider.getVolumes(slug);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════════════
// DÉTAILS VOLUME
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /anime-manga/nautiljon/series/:slug/volume/:volumeId
 * Détails d'un volume spécifique
 * 
 * Params :
 * - slug : Slug Nautiljon de la série
 * - volumeId : ID du volume sur Nautiljon
 * 
 * Query params :
 * - name : Nom/numéro du volume (ex: "1", "2", "10") - requis pour construire l'URL
 */
router.get('/series/:slug/volume/:volumeId', asyncHandler(async (req, res) => {
  const { slug, volumeId } = req.params;
  const { name = '1' } = req.query;

  if (!slug || !volumeId) {
    throw new ValidationError('Slug de série et ID de volume requis');
  }

  const result = await provider.getVolume(slug, volumeId, name);
  res.json(result);
}));

export default router;
