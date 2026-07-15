/**
 * Routes: Brickset Provider
 * 
 * Endpoints pour l'API Brickset (données LEGO officielles).
 * 
 * @see https://brickset.com/api/v3.asmx
 * 
 * Routes disponibles:
 * - GET /construction-toys/brickset/health - État du provider
 * - GET /construction-toys/brickset/search - Recherche de sets
 * - GET /construction-toys/brickset/sets/:id - Détails d'un set
 * - GET /construction-toys/brickset/themes - Liste des thèmes
 * - GET /construction-toys/brickset/themes/:theme/subthemes - Sous-thèmes
 * - GET /construction-toys/brickset/years - Années disponibles
 * - GET /construction-toys/brickset/recently-updated - Sets récemment mis à jour
 * 
 * Support traduction :
 * - lang : Code langue cible (fr, de, es, it, pt)
 * - autoTrad : Activer la traduction automatique (1 ou true)
 */

import { Router } from 'express';
import { BricksetProvider } from '../providers/brickset.provider.js';
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
const bricksetProvider = new BricksetProvider();

// ===========================================
// Health Check
// ===========================================

/**
 * GET /construction-toys/brickset/health
 * Vérifier la disponibilité du provider Brickset
 * 
 * @returns {Object} État de santé
 * @example
 * {
 *   "healthy": true,
 *   "latency": 250,
 *   "provider": "brickset"
 * }
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await bricksetProvider.healthCheck();
  res.status(health.healthy ? 200 : 503).json({
    ...health,
    provider: 'brickset'
  });
}));

// ===========================================
// Recherche
// ===========================================

/**
 * GET /construction-toys/brickset/search
 * Rechercher des sets LEGO dans Brickset
 * 
 * @query {string} q - Terme de recherche (nom ou numéro de set)
 * @query {number} page - Page de résultats (défaut: 1)
 * @query {number} pageSize - Résultats par page (défaut: 20, max: 500)
 * @query {string} theme - Filtrer par nom de thème
 * @query {number} year - Filtrer par année
 * @query {string} orderBy - Tri: Name, Number, Year, Pieces, Rating (défaut: Name)
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
    pageSize = 20,
    theme,
    year,
    orderBy = 'Name',
    lang,
    autoTrad
  } = req.query;

  const searchQuery = q || query || '';
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await bricksetProvider.search(searchQuery, {
    page: parseInt(page, 10),
    pageSize: parseInt(limit || pageSize, 10),
    theme,
    year: year ? parseInt(year, 10) : undefined,
    orderBy
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
 * GET /construction-toys/brickset/themes
 * Récupérer la liste des thèmes LEGO
 * 
 * @returns {Object} Liste des thèmes
 * @example
 * {
 *   "success": true,
 *   "themes": [
 *     { "theme": "Star Wars", "setCount": 850, "subthemeCount": 20 }
 *   ]
 * }
 */
router.get('/themes', asyncHandler(async (req, res) => {
  const themes = await bricksetProvider.getThemes();

  res.json({
    success: true,
    provider: 'brickset',
    domain: 'construction-toys',
    query: null,
    total: themes.length,
    count: themes.length,
    data: themes,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

/**
 * GET /construction-toys/brickset/themes/:theme/subthemes
 * Récupérer les sous-thèmes d'un thème
 * 
 * @param {string} theme - Nom du thème
 * 
 * @returns {Object} Liste des sous-thèmes
 */
router.get('/themes/:theme/subthemes', asyncHandler(async (req, res) => {
  const { theme } = req.params;

  if (!theme) {
    throw new ValidationError('Nom du thème manquant');
  }

  const subthemes = await bricksetProvider.getSubthemes(theme);

  res.json({
    success: true,
    provider: 'brickset',
    domain: 'construction-toys',
    query: theme,
    total: subthemes.length,
    count: subthemes.length,
    data: subthemes,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================
// Années
// ===========================================

/**
 * GET /construction-toys/brickset/years
 * Récupérer les années disponibles
 * 
 * @query {string} theme - Filtrer par thème (optionnel)
 * 
 * @returns {Object} Liste des années
 * @example
 * {
 *   "success": true,
 *   "years": [
 *     { "year": "2026", "setCount": 150 },
 *     { "year": "2025", "setCount": 420 }
 *   ]
 * }
 */
router.get('/years', asyncHandler(async (req, res) => {
  const { theme } = req.query;
  
  const years = await bricksetProvider.getYears(theme || null);

  res.json({
    success: true,
    provider: 'brickset',
    domain: 'construction-toys',
    query: theme || null,
    total: years.length,
    count: years.length,
    data: years,
    pagination: null,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
}));

// ===========================================
// Sets récemment mis à jour
// ===========================================

/**
 * GET /construction-toys/brickset/recently-updated
 * Récupérer les sets récemment mis à jour
 * 
 * @query {number} minutesAgo - Minutes depuis la mise à jour (défaut: 10080 = 7 jours)
 * 
 * @returns {Object} Liste des sets récemment mis à jour
 */
router.get('/recently-updated', asyncHandler(async (req, res) => {
  const { minutesAgo = 10080 } = req.query;
  
  const result = await bricksetProvider.getRecentlyUpdated(
    parseInt(minutesAgo, 10)
  );

  res.json(result);
}));

// ===========================================
// Détails d'un set
// ===========================================

/**
 * GET /construction-toys/brickset/sets/:id
 * Récupérer les détails d'un set LEGO
 * 
 * @param {string} id - ID Brickset (setID) ou numéro de set (75192 ou 75192-1)
 * @query {string} lang - Code langue pour traduction (fr, de, es, it, pt)
 * @query {string} autoTrad - Activer la traduction automatique (1 ou true)
 * 
 * @returns {Object} Détails du set normalisés
 */
router.get('/sets/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lang, autoTrad } = req.query;

  if (!id) {
    throw new ValidationError('ID du set manquant');
  }

  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);

  let result = await bricksetProvider.getById(id, { lang: 'en' });

  // Traduction automatique si activée
  if (autoTradEnabled && result.data) {
    // Traduire les catégories (theme, subtheme, category)
    if (result.data.details) {
      const categoriesToTranslate = ['theme', 'subtheme', 'category'].filter(
        key => result.data.details[key]
      );
      if (categoriesToTranslate.length > 0) {
        const translated = await translateToyCategories(
          categoriesToTranslate.map(key => result.data.details[key]),
          targetLang
        );
        categoriesToTranslate.forEach((key, index) => {
          result.data.details[key] = translated[index];
        });
      }
    }
  }

  res.json(result);
}));

export default router;
