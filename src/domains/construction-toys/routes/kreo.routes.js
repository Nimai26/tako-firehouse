/**
 * Routes: KRE-O Provider (Database + Filesystem)
 * 
 * Endpoints pour les produits KRE-O archivés (Hasbro 2011-2017).
 * Source : PostgreSQL (catalogue) + Filesystem (images + PDFs)
 * 
 * Routes disponibles:
 * - GET /construction-toys/kreo/health                - État du provider
 * - GET /construction-toys/kreo/search                - Recherche de produits
 * - GET /construction-toys/kreo/franchises            - Franchises disponibles
 * - GET /construction-toys/kreo/franchise/:name       - Produits par franchise
 * - GET /construction-toys/kreo/sublines              - Sous-lignes disponibles
 * - GET /construction-toys/kreo/file/:setNumber/image - Redirige vers image statique
 * - GET /construction-toys/kreo/:id                   - Détails d'un produit
 */

import { Router } from 'express';
import { KreoProvider } from '../providers/kreo.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError, NotFoundError } from '../../../shared/errors/index.js';
import { megaQueryOne } from '../../../infrastructure/mega/index.js';
import { getFileUrl, isMegaMinIOConnected as isStorageReady } from '../../../infrastructure/mega/index.js';

export const router = Router();

const KREO_ARCHIVE = 'kreo-archive';
const kreoProvider = new KreoProvider();

// ===========================================
// Health Check
// ===========================================

/**
 * GET /construction-toys/kreo/health
 * Vérifier la disponibilité de la BDD KRE-O
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await kreoProvider.healthCheck();
  res.status(health.healthy ? 200 : 503).json({
    ...health,
    provider: 'kreo'
  });
}));

// ===========================================
// Recherche
// ===========================================

/**
 * GET /construction-toys/kreo/search
 * Rechercher des produits KRE-O dans l'archive
 * 
 * @query {string} q - Terme de recherche (requis)
 * @query {number} page - Page (défaut: 1)
 * @query {number} pageSize - Résultats par page (défaut: 20, max: 100)
 * @query {string} franchise - Filtrer par franchise (optionnel)
 * @query {string} subLine - Filtrer par sous-ligne (optionnel)
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, query, page = 1, limit, pageSize = 20, franchise, subLine } = req.query;

  const searchQuery = q || query;
  if (!searchQuery) {
    throw new ValidationError('Le paramètre "q" est requis');
  }

  const result = await kreoProvider.search(searchQuery, {
    page: parseInt(page, 10),
    pageSize: Math.min(parseInt(limit || pageSize, 10), 100),
    franchise: franchise || null,
    subLine: subLine || null
  });

  res.json(result);
}));

// ===========================================
// Franchises & Sous-lignes
// ===========================================

/**
 * GET /construction-toys/kreo/franchises
 * Lister toutes les franchises KRE-O avec le nombre de produits
 */
router.get('/franchises', asyncHandler(async (req, res) => {
  const result = await kreoProvider.getFranchises();
  res.json(result);
}));

/**
 * GET /construction-toys/kreo/franchise/:name
 * Lister les produits d'une franchise
 * 
 * @param {string} name - Nom de la franchise (transformers, battleship, gi-joe, etc.)
 */
router.get('/franchise/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { page = 1, pageSize = 50 } = req.query;

  const result = await kreoProvider.getByFranchise(name, {
    page: parseInt(page, 10),
    pageSize: Math.min(parseInt(pageSize, 10), 100)
  });

  res.json(result);
}));

/**
 * GET /construction-toys/kreo/sublines
 * Lister les sous-lignes avec comptages
 * 
 * @query {string} franchise - Filtrer par franchise (optionnel)
 */
router.get('/sublines', asyncHandler(async (req, res) => {
  const { franchise } = req.query;
  const result = await kreoProvider.getSubLines(franchise || null);
  res.json(result);
}));

// ===========================================
// Fichiers statiques (rétrocompatibilité proxy → redirect)
// ===========================================

/**
 * GET /construction-toys/kreo/file/:setNumber/image
 * Redirige vers le fichier image statique
 * 
 * @param {string} setNumber - Numéro de set (ex: 31144, A2225)
 */
router.get('/file/:setNumber/image', asyncHandler(async (req, res) => {
  const { setNumber } = req.params;
  if (!setNumber) throw new ValidationError('Numéro de set manquant');

  const row = await megaQueryOne(
    `SELECT set_number, image_path FROM kreo_products WHERE UPPER(set_number) = UPPER($1)`,
    [setNumber]
  );
  if (!row) throw new NotFoundError(`Produit KRE-O non trouvé: ${setNumber}`);
  if (!row.image_path) throw new NotFoundError(`Image non disponible pour ${setNumber}`);

  const fileUrl = getFileUrl(KREO_ARCHIVE, row.image_path);
  if (!fileUrl) throw new NotFoundError(`Image non disponible pour ${setNumber}`);

  res.redirect(301, fileUrl);
}));

// ===========================================
// Détails produit (DOIT être en dernier — catch-all :id)
// ===========================================

/**
 * GET /construction-toys/kreo/:id
 * Récupérer les détails d'un produit KRE-O par numéro de set
 * 
 * @param {string} id - Numéro de set (ex: 31144, A2225, B0715)
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('ID produit manquant');
  }

  const result = await kreoProvider.getById(id);
  res.json(result);
}));

export default router;
