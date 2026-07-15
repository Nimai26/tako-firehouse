/**
 * Factory de routes Amazon alias pour les domaines métier
 * 
 * Permet d'exposer Amazon comme un provider natif dans n'importe quel domaine
 * en pré-configurant la catégorie Amazon correspondante.
 * 
 * Exemple :
 *   GET /api/videogames/amazon/search?q=zelda
 *   → équivalent à GET /api/ecommerce/amazon/search?q=zelda&category=videogames
 * 
 * @module domains/ecommerce/routes/amazon-alias.factory
 */

import { Router } from 'express';
import * as amazonProvider from '../providers/amazon.provider.js';
import * as amazonNormalizer from '../normalizers/amazon.normalizer.js';
import { logger } from '../../../shared/utils/logger.js';

/**
 * Crée un router Amazon alias pour un domaine donné
 * 
 * @param {object} options
 * @param {string} options.domain - Nom du domaine (ex: 'videogames', 'books')
 * @param {string} options.category - Catégorie Amazon à forcer (ex: 'videogames', 'toys', 'books')
 * @param {string} [options.categoryLabel] - Label affiché (ex: 'Jeux vidéo')
 * @param {string[]} [options.excludePatterns] - Mots-clés à exclure des titres (insensible à la casse)
 * @returns {Router} Express router
 */
export function createAmazonAliasRouter({ domain, category, categoryLabel, excludePatterns = [] }) {
  const excludeRegex = excludePatterns.length > 0
    ? new RegExp(excludePatterns.join('|'), 'i')
    : null;
  const router = Router();

  /**
   * Recherche Amazon filtrée par catégorie
   * GET /api/{domain}/amazon/search
   */
  router.get('/search', async (req, res) => {
    try {
      const { q, country = 'fr', page = 1, limit = 20, lang = 'fr', autotrad = 'false' } = req.query;

      if (!q || q.trim().length === 0) {
        return res.status(400).json({
          success: false,
          provider: 'amazon',
          error: { code: 'MISSING_QUERY', message: 'Le paramètre "q" est requis' }
        });
      }

      const pageNum = parseInt(page, 10);
      const limitNum = Math.min(parseInt(limit, 10) || 20, 50);

      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({
          success: false,
          provider: 'amazon',
          error: { code: 'INVALID_PAGE', message: 'Le paramètre "page" doit être un nombre >= 1' }
        });
      }

      logger.info(`[Amazon/${domain}] Recherche "${q}" (category=${category}, country=${country})`);

      const rawResults = await amazonProvider.searchAmazon(q, {
        country,
        category,
        page: pageNum,
        limit: limitNum
      });

      const normalized = await amazonNormalizer.normalizeSearchResults(rawResults, {
        lang,
        autoTrad: autotrad === 'true'
      });

      if (excludeRegex && normalized.data) {
        normalized.data = normalized.data.filter(
          item => !excludeRegex.test(item.title || '')
        );
        normalized.total = normalized.data.length;
      }

      res.json(normalized);
    } catch (err) {
      logger.error(`[Amazon/${domain}] Erreur recherche:`, err);
      res.status(500).json({
        success: false,
        provider: 'amazon',
        error: { code: 'SEARCH_ERROR', message: err.message }
      });
    }
  });

  /**
   * Détails d'un produit par ASIN
   * GET /api/{domain}/amazon/product/:asin
   */
  router.get('/product/:asin', async (req, res) => {
    try {
      const { asin } = req.params;
      const { country = 'fr', lang = 'fr', autotrad = 'false' } = req.query;

      if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
        return res.status(400).json({
          success: false,
          provider: 'amazon',
          error: { code: 'INVALID_ASIN', message: 'ASIN invalide (doit être 10 caractères alphanumériques)' }
        });
      }

      logger.info(`[Amazon/${domain}] Produit ${asin} (country=${country})`);
      const rawProduct = await amazonProvider.getAmazonProduct(asin, country);

      if (!rawProduct) {
        return res.status(404).json({
          success: false,
          provider: 'amazon',
          error: { code: 'PRODUCT_NOT_FOUND', message: `Produit ${asin} introuvable` }
        });
      }

      const normalized = await amazonNormalizer.normalizeProductDetails(rawProduct, {
        lang,
        autoTrad: autotrad === 'true'
      });

      res.json({
        success: true,
        provider: 'amazon',
        domain,
        id: normalized.id,
        data: normalized,
        meta: {
          fetchedAt: new Date().toISOString(),
          lang,
          country,
          autoTrad: autotrad === 'true'
        }
      });
    } catch (err) {
      logger.error(`[Amazon/${domain}] Erreur produit:`, err);
      res.status(500).json({
        success: false,
        provider: 'amazon',
        error: { code: 'PRODUCT_ERROR', message: err.message }
      });
    }
  });

  /**
   * Health check
   * GET /api/{domain}/amazon/health
   */
  router.get('/health', async (req, res) => {
    try {
      const health = await amazonProvider.healthCheck();
      res.status(health.healthy ? 200 : 503).json({
        data: { ...health, aliasFor: `ecommerce/amazon (category: ${category})` },
        domain,
        provider: 'amazon'
      });
    } catch (err) {
      res.status(503).json({
        data: { healthy: false, status: 'error', message: err.message },
        domain,
        provider: 'amazon'
      });
    }
  });

  /**
   * Info route
   * GET /api/{domain}/amazon
   */
  router.get('/', (req, res) => {
    res.json({
      provider: 'amazon',
      domain,
      description: `Recherche Amazon filtrée sur la catégorie "${categoryLabel || category}"`,
      amazonCategory: category,
      note: 'Alias vers le provider Amazon e-commerce avec catégorie pré-configurée',
      endpoints: {
        search: `GET /api/${domain}/amazon/search?q={query}&country=fr`,
        product: `GET /api/${domain}/amazon/product/{asin}?country=fr`,
        health: `GET /api/${domain}/amazon/health`
      }
    });
  });

  return router;
}
