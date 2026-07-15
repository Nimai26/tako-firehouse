/**
 * Mega Construx Provider (v2.1 - Database + Filesystem)
 * 
 * Provider pour les sets de construction Mattel MEGA.
 * Utilise la base de données archivée (PostgreSQL) + stockage fichiers (filesystem).
 * 
 * ARCHITECTURE :
 * - PostgreSQL (Louis 10.20.0.10:5434) : Catalogue de 199 produits archivés
 * - Filesystem (/data/tako-storage/mega-archive/) : 205 PDFs d'instructions + 205 images
 * 
 * TABLE products :
 *   id, sku, name, category, pdf_url, image_url, pdf_path, image_path, discovered_at
 * 
 * CATÉGORIES : pokemon (87), halo (40), hot-wheels (34), barbie (29), masters-of-the-universe (9)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { MegaNormalizer } from '../normalizers/mega.normalizer.js';
import { NotFoundError, BadGatewayError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';
import { env } from '../../../config/env.js';
import {
  isMegaConnected,
  megaQueryOne,
  megaQueryAll,
  isMegaMinIOConnected as isStorageReady,
  getFileUrl,
  getBucketStats as getArchiveStats
} from '../../../infrastructure/mega/index.js';

const MEGA_ARCHIVE = 'mega-archive';

export class MegaProvider extends BaseProvider {
  constructor() {
    super({
      name: 'mega',
      domain: 'construction-toys',
      baseUrl: 'database://mega_archive',
      timeout: 10000,
      retries: 1
    });

    this.normalizer = new MegaNormalizer();
    this.log = logger.create('MegaProvider');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des produits MEGA dans la BDD
   * @param {string} query - Terme de recherche
   * @param {Object} options
   * @param {number} [options.page=1] - Page
   * @param {number} [options.pageSize=20] - Résultats par page (max 100)
   * @param {string} [options.category] - Filtrer par catégorie
   */
  async search(query, options = {}) {
    this.ensureConnected();

    const {
      page = 1,
      pageSize = 20,
      category = null
    } = options;

    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    this.log.debug(`Recherche BDD: "${query}" (page: ${page}, limit: ${limit}, cat: ${category || 'toutes'})`);

    // Construire la requête avec recherche ILIKE + filtre catégorie optionnel
    let countSql = `SELECT COUNT(*) as total FROM products WHERE (name ILIKE $1 OR sku ILIKE $1 OR category ILIKE $1)`;
    let searchSql = `SELECT * FROM products WHERE (name ILIKE $1 OR sku ILIKE $1 OR category ILIKE $1)`;
    const params = [`%${query}%`];

    if (category) {
      countSql += ` AND category = $2`;
      searchSql += ` AND category = $2`;
      params.push(category);
    }

    searchSql += ` ORDER BY category, name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // Exécuter en parallèle
    const countParams = category ? [`%${query}%`, category] : [`%${query}%`];
    const [countResult, results] = await Promise.all([
      megaQueryOne(countSql, countParams),
      megaQueryAll(searchSql, params)
    ]);

    const total = parseInt(countResult?.total || 0);

    // Enrichir avec les URLs fichiers statiques
    const enrichedResults = await this.enrichWithFileUrls(results);

    // Normaliser
    return this.normalizer.normalizeSearchResponse(enrichedResults, {
      query,
      total,
      pagination: {
        page,
        limit,
        hasMore: offset + results.length < total
      }
    });
  }

  /**
   * Récupérer un produit par SKU
   * @param {string} id - SKU du produit (ex: HGC23)
   */
  async getById(id, options = {}) {
    this.ensureConnected();

    this.log.debug(`Récupération produit: ${id}`);

    const row = await megaQueryOne(
      `SELECT * FROM products WHERE UPPER(sku) = UPPER($1)`,
      [id]
    );

    if (!row) {
      throw new NotFoundError(`Produit MEGA non trouvé: ${id}`);
    }

    // Enrichir avec URLs fichiers
    const enriched = await this.enrichRowWithFileUrls(row);

    // Normaliser
    const normalized = this.normalizer.normalize(enriched);

    return {
      success: true,
      provider: 'mega',
      domain: 'construction-toys',
      id: normalized.id,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
        source: 'database'
      }
    };
  }

  /**
   * Lister les produits par catégorie
   * @param {string} category - Catégorie (pokemon, halo, hot-wheels, barbie, masters-of-the-universe)
   * @param {Object} options
   */
  async getByCategory(category, options = {}) {
    this.ensureConnected();

    const { page = 1, pageSize = 50 } = options;
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    this.log.debug(`Catégorie: ${category} (page: ${page})`);

    const [countResult, results] = await Promise.all([
      megaQueryOne(`SELECT COUNT(*) as total FROM products WHERE category = $1`, [category]),
      megaQueryAll(
        `SELECT * FROM products WHERE category = $1 ORDER BY name LIMIT $2 OFFSET $3`,
        [category, limit, offset]
      )
    ]);

    const total = parseInt(countResult?.total || 0);

    if (total === 0) {
      throw new NotFoundError(`Catégorie MEGA non trouvée: ${category}`);
    }

    const enrichedResults = await this.enrichWithFileUrls(results);

    return this.normalizer.normalizeSearchResponse(enrichedResults, {
      query: `category:${category}`,
      total,
      pagination: {
        page,
        limit,
        hasMore: offset + results.length < total
      }
    });
  }

  /**
   * Lister toutes les catégories avec comptages
   */
  async getCategories() {
    this.ensureConnected();

    const rows = await megaQueryAll(
      `SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC`
    );

    return {
      success: true,
      provider: 'mega',
      domain: 'construction-toys',
      query: null,
      data: rows.map(r => ({
        name: r.category,
        count: parseInt(r.count),
        slug: r.category
      })),
      total: rows.length,
      count: rows.length,
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        source: 'database'
      }
    };
  }

  /**
   * Récupérer les instructions (PDF) pour un SKU
   * @param {string} sku - SKU du produit
   */
  async getInstructions(sku) {
    this.ensureConnected();

    const row = await megaQueryOne(
      `SELECT sku, name, category, pdf_url, pdf_path FROM products WHERE UPPER(sku) = UPPER($1)`,
      [sku]
    );

    if (!row) {
      throw new NotFoundError(`Instructions non trouvées pour le SKU: ${sku}`);
    }

    // Générer l'URL directe vers le fichier statique
    const pdfFileUrl = row.pdf_path
      ? getFileUrl(MEGA_ARCHIVE, `${row.category}/${row.sku.toLowerCase()}.pdf`)
      : null;

    return {
      success: true,
      provider: 'mega',
      sku: row.sku.toUpperCase(),
      name: row.name,
      category: row.category,
      pdfUrl: pdfFileUrl,
      pdfOriginalUrl: row.pdf_url,
      source: 'filesystem',
      note: 'PDF servi via stockage fichiers statiques'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENRICHISSEMENT FICHIERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enrichir une liste de produits avec les URLs fichiers statiques
   * @private
   */
  async enrichWithFileUrls(rows) {
    if (!rows.length) return rows;
    return rows.map(row => this.enrichRowWithFileUrls(row));
  }

  /**
   * Enrichir un produit unique avec les URLs fichiers statiques
   * @private
   */
  enrichRowWithFileUrls(row) {
    const skuLower = (row.sku || '').toLowerCase();
    const category = row.category || '';

    return {
      ...row,
      // URLs directes vers les fichiers statiques
      pdf_file_url: row.pdf_path
        ? getFileUrl(MEGA_ARCHIVE, `${category}/${skuLower}.pdf`)
        : null,
      image_file_url: row.image_path
        ? getFileUrl(MEGA_ARCHIVE, `${category}/${skuLower}.jpg`)
        : null,
      // Rétrocompatibilité : mapper les anciens noms de champs
      pdf_proxy_url: row.pdf_path
        ? getFileUrl(MEGA_ARCHIVE, `${category}/${skuLower}.pdf`)
        : null,
      image_proxy_url: row.image_path
        ? getFileUrl(MEGA_ARCHIVE, `${category}/${skuLower}.jpg`)
        : null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vérifie que la DB MEGA est connectée
   * @private
   */
  ensureConnected() {
    if (!isMegaConnected()) {
      throw new BadGatewayError('Base de données MEGA non disponible. Vérifiez la connexion à Louis (10.20.0.10:5434).');
    }
  }

  /**
   * Health check
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();

    const dbConnected = isMegaConnected();
    const storageConnected = isStorageReady();

    if (!dbConnected) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: 'MEGA Database non connectée',
        details: { db: false, storage: storageConnected }
      };
    }

    try {
      const countResult = await megaQueryOne('SELECT COUNT(*) as count FROM products');
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
        message: `MEGA Archive opérationnelle (${countResult.count} produits)`,
        details: {
          db: true,
          storage: storageConnected,
          products: parseInt(countResult.count),
          source: 'database'
        }
      };
    } catch (err) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: err.message,
        details: { db: false, storage: storageConnected }
      };
    }
  }
}

export default MegaProvider;
