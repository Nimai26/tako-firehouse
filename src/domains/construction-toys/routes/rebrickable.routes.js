/**
 * Routes: Rebrickable Provider
 * 
 * Endpoints pour l'API Rebrickable (base de données LEGO communautaire).
 * 
 * @see https://rebrickable.com/api/v3/docs/
 * 
 * Routes disponibles:
 * - GET /construction-toys/rebrickable/health - État du provider
 * - GET /construction-toys/rebrickable/search - Recherche de sets
 * - GET /construction-toys/rebrickable/sets/:id - Détails d'un set
 * - GET /construction-toys/rebrickable/sets/:id/parts - Pièces d'un set
 * - GET /construction-toys/rebrickable/sets/:id/minifigs - Minifigs d'un set
 * - GET /construction-toys/rebrickable/parts - Recherche de pièces
 * - GET /construction-toys/rebrickable/minifigs - Recherche de minifigs
 * - GET /construction-toys/rebrickable/themes - Liste des thèmes
 * - GET /construction-toys/rebrickable/colors - Liste des couleurs
 * 
 * Support traduction :
 * - lang : Code langue cible (fr, de, es, it, pt)
 * - autoTrad : Activer la traduction automatique via auto_trad (1 ou true)
 */

import { Router } from 'express';
import { RebrickableProvider } from '../providers/rebrickable.provider.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { ValidationError } from '../../../shared/errors/index.js';
import {
  translateSearchResults,
  translateToyCategories,
  translateText,
  isAutoTradEnabled,
  extractLangCode
} from '../../../shared/utils/translator.js';

export const router = Router();

// Instance du provider (singleton)
const rebrickableProvider = new RebrickableProvider();

// ===========================================
// Health Check
// ===========================================

/**
 * GET /construction-toys/rebrickable/health
 * Vérifier la disponibilité du provider Rebrickable
 * 
 * @returns {Object} État de santé
 * @example
 * {
 *   "healthy": true,
 *   "latency": 120,
 *   "provider": "rebrickable"
 * }
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await rebrickableProvider.healthCheck();
  res.status(health.healthy ? 200 : 503).json({
    ...health,
    provider: 'rebrickable'
  });
}));

// ===========================================
// Recherche
// ===========================================

/**
 * GET /construction-toys/rebrickable/search
 * Rechercher des sets LEGO dans la base Rebrickable
 * 
 * @query {string} q - Terme de recherche (nom ou numéro de set)
 * @query {number} page - Page de résultats (défaut: 1)
 * @query {number} pageSize - Résultats par page (défaut: 100, max: 1000)
 * @query {number} themeId - Filtrer par ID de thème
 * @query {number} minYear - Année minimale
 * @query {number} maxYear - Année maximale
 * @query {number} minParts - Nombre minimum de pièces
 * @query {number} maxParts - Nombre maximum de pièces
 * @query {string} ordering - Tri: year, -year, name, -name, num_parts (défaut: -year)
 * @query {string} lang - Code langue pour traduction (fr, de, es, it, pt)
 * @query {string} autoTrad - Activer la traduction automatique (1 ou true)
 * 
 * @returns {Object} Résultats de recherche normalisés
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { 
    q, 
    query,
    page = 1, 
    limit,
    pageSize = 100,
    themeId,
    minYear,
    maxYear,
    minParts,
    maxParts,
    ordering = '-year',
    lang,
    autoTrad
  } = req.query;

  const searchQuery = q || query || '';
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await rebrickableProvider.search(searchQuery, {
    page: parseInt(page, 10),
    pageSize: parseInt(limit || pageSize, 10),
    themeId: themeId ? parseInt(themeId, 10) : undefined,
    minYear: minYear ? parseInt(minYear, 10) : undefined,
    maxYear: maxYear ? parseInt(maxYear, 10) : undefined,
    minParts: minParts ? parseInt(minParts, 10) : undefined,
    maxParts: maxParts ? parseInt(maxParts, 10) : undefined,
    ordering
  });

  // Traduction automatique si activée
  if (autoTradEnabled && result.data && result.data.length > 0) {
    result.data = await translateSearchResults(result.data, true, targetLang);
  }

  res.json(result);
}));

// ===========================================
// Thèmes
// ===========================================

/**
 * GET /construction-toys/rebrickable/themes
 * Récupérer la liste des thèmes LEGO
 * 
 * @query {number} parentId - Filtrer par thème parent (pour sous-thèmes)
 * 
 * @returns {Object} Liste des thèmes
 * @example
 * {
 *   "success": true,
 *   "count": 450,
 *   "themes": [
 *     { "id": 246, "name": "Star Wars", "parentId": null },
 *     { "id": 247, "name": "Episode I", "parentId": 246 }
 *   ]
 * }
 */
router.get('/themes', asyncHandler(async (req, res) => {
  const { parentId } = req.query;
  
  const result = await rebrickableProvider.getThemes(
    parentId ? parseInt(parentId, 10) : null
  );

  res.json({
    success: true,
    provider: 'rebrickable',
    domain: 'construction-toys',
    query: null,
    total: result.count,
    count: result.themes.length,
    data: result.themes,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================

/**
 * GET /construction-toys/rebrickable/colors
 * Récupérer la liste des couleurs LEGO
 * 
 * @returns {Object} Liste des couleurs
 * @example
 * {
 *   "success": true,
 *   "count": 200,
 *   "colors": [
 *     { "id": 0, "name": "Black", "rgb": "#212121", "isTrans": false }
 *   ]
 * }
 */
router.get('/colors', asyncHandler(async (req, res) => {
  const result = await rebrickableProvider.getColors();

  res.json({
    success: true,
    provider: 'rebrickable',
    domain: 'construction-toys',
    query: null,
    total: result.count,
    count: result.colors.length,
    data: result.colors,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================

/**
 * GET /construction-toys/rebrickable/parts
 * Rechercher des pièces LEGO
 * 
 * @query {string} q - Terme de recherche (requis)
 * @query {number} page - Page (défaut: 1)
 * @query {number} pageSize - Résultats par page (défaut: 100, max: 1000)
 * 
 * @returns {Object} Liste des pièces
 */
router.get('/parts', asyncHandler(async (req, res) => {
  const { q, query, page = 1, pageSize = 100 } = req.query;
  
  const searchQuery = q || query;
  if (!searchQuery) {
    throw new ValidationError('Le paramètre "q" est requis pour rechercher des pièces');
  }

  const result = await rebrickableProvider.searchParts(searchQuery, {
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10)
  });

  res.json({
    success: true,
    provider: 'rebrickable',
    domain: 'construction-toys',
    query: searchQuery,
    total: result.count,
    count: result.parts.length,
    data: result.parts,
    pagination: result.pagination ? {
      page: result.pagination.page,
      limit: result.pagination.limit,
      hasMore: result.pagination.hasMore
    } : null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================
// Recherche de minifigs
// ===========================================

/**
 * GET /construction-toys/rebrickable/minifigs
 * Rechercher des minifigures LEGO
 * 
 * @query {string} q - Terme de recherche (requis)
 * @query {number} page - Page (défaut: 1)
 * @query {number} pageSize - Résultats par page (défaut: 100, max: 1000)
 * 
 * @returns {Object} Liste des minifigures
 */
router.get('/minifigs', asyncHandler(async (req, res) => {
  const { q, query, page = 1, pageSize = 100 } = req.query;
  
  const searchQuery = q || query;
  if (!searchQuery) {
    throw new ValidationError('Le paramètre "q" est requis pour rechercher des minifigs');
  }

  const result = await rebrickableProvider.searchMinifigs(searchQuery, {
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10)
  });

  res.json({
    success: true,
    provider: 'rebrickable',
    domain: 'construction-toys',
    query: searchQuery,
    total: result.count,
    count: result.minifigs.length,
    data: result.minifigs,
    pagination: result.pagination ? {
      page: result.pagination.page,
      limit: result.pagination.limit,
      hasMore: result.pagination.hasMore
    } : null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================
// Détails d'un set (doit être après les routes statiques)
// ===========================================

/**
 * GET /construction-toys/rebrickable/sets/:id
 * Récupérer les détails d'un set LEGO
 * 
 * @param {string} id - Numéro du set (ex: 75192 ou 75192-1)
 * @query {boolean} includeParts - Inclure les pièces (défaut: false)
 * @query {boolean} includeMinifigs - Inclure les minifigs (défaut: false)
 * @query {number} maxParts - Nombre max de pièces (défaut: 500)
 * @query {string} lang - Code langue pour traduction (fr, de, es, it, pt)
 * @query {string} autoTrad - Activer la traduction automatique (1 ou true)
 * 
 * @returns {Object} Détails du set normalisés
 */
router.get('/sets/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { 
    includeParts = 'false', 
    includeMinifigs = 'false',
    maxParts = 500,
    lang,
    autoTrad
  } = req.query;

  if (!id) {
    throw new ValidationError('ID du set manquant');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await rebrickableProvider.getById(id, {
    includeParts: includeParts === 'true',
    includeMinifigs: includeMinifigs === 'true',
    maxParts: parseInt(maxParts, 10)
  });

  // Traduction automatique si activée
  if (autoTradEnabled && result?.data) {
    // Traduire le nom
    if (result.data.title) {
      const nameResult = await translateText(result.data.title, targetLang, { 
        enabled: true, 
        sourceLang: 'en' 
      });
      if (nameResult.translated) {
        result.data.titleOriginal = result.data.title;
        result.data.title = nameResult.text;
      }
    }
    
    // Traduire la description si présente
    if (result.data.description) {
      const descResult = await translateText(result.data.description, targetLang, { 
        enabled: true, 
        sourceLang: 'en' 
      });
      if (descResult.translated) {
        result.data.descriptionOriginal = result.data.description;
        result.data.description = descResult.text;
      }
    }
    
    // Traduire le thème
    if (result.data.details?.theme) {
      const translated = await translateToyCategories([result.data.details.theme], targetLang);
      if (translated.termsTranslated) {
        result.data.details.themeOriginal = result.data.details.theme;
        result.data.details.theme = translated.terms[0];
      }
    }
  }

  res.json(result);
}));

// ===========================================
// Pièces d'un set
// ===========================================

/**
 * GET /construction-toys/rebrickable/sets/:id/parts
 * Récupérer les pièces d'un set LEGO
 * 
 * @param {string} id - Numéro du set
 * @query {number} page - Page (défaut: 1)
 * @query {number} pageSize - Pièces par page (défaut: 500, max: 1000)
 * 
 * @returns {Object} Liste des pièces du set
 */
router.get('/sets/:id/parts', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 500 } = req.query;

  if (!id) {
    throw new ValidationError('ID du set manquant');
  }

  const result = await rebrickableProvider.getSetParts(id, {
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10)
  });

  res.json({
    success: true,
    provider: 'rebrickable',
    domain: 'construction-toys',
    query: null,
    total: result.count,
    count: result.parts.length,
    data: result.parts,
    pagination: result.pagination ? {
      page: result.pagination.page,
      limit: result.pagination.limit,
      hasMore: result.pagination.hasMore
    } : null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================
// Minifigs d'un set
// ===========================================

/**
 * GET /construction-toys/rebrickable/sets/:id/minifigs
 * Récupérer les minifigures d'un set LEGO
 * 
 * @param {string} id - Numéro du set
 * 
 * @returns {Object} Liste des minifigures du set
 */
router.get('/sets/:id/minifigs', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('ID du set manquant');
  }

  const result = await rebrickableProvider.getSetMinifigs(id);

  res.json({
    success: true,
    provider: 'rebrickable',
    domain: 'construction-toys',
    query: null,
    total: result.count,
    count: result.minifigs.length,
    data: result.minifigs,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

export default router;
