/**
 * KRE-O Provider (Database + Filesystem)
 * 
 * Provider pour les sets de construction Hasbro KRE-O (2011-2017).
 * Utilise PostgreSQL + stockage fichiers (filesystem) sur Louis.
 * 
 * ARCHITECTURE :
 * - PostgreSQL (Louis 10.20.0.10:5434) : 417 produits dans la table kreo_products
 * - Filesystem (/data/tako-storage/kreo-archive/) : 2170 fichiers (images + PDFs)
 * 
 * TABLE kreo_products :
 *   id, set_number, name, franchise, sub_line, year, piece_count,
 *   kreons_count, kreons_included, description, price_retail,
 *   product_type, image_url, image_path, pdf_url, pdf_path,
 *   wiki_url, wiki_image_url, discovered_at, updated_at
 * 
 * FRANCHISES : transformers (73), dungeons-dragons (3), battleship, gi-joe, star-trek, cityville, trolls
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { KreoNormalizer } from '../normalizers/kreo.normalizer.js';
import { NotFoundError, BadGatewayError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';
import { env } from '../../../config/env.js';
import {
  isMegaConnected,
  megaQueryOne,
  megaQueryAll,
  isMegaMinIOConnected as isStorageReady,
  getFileUrl
} from '../../../infrastructure/mega/index.js';

const KREO_ARCHIVE = 'kreo-archive';

export class KreoProvider extends BaseProvider {
  constructor() {
    super({
      name: 'kreo',
      domain: 'construction-toys',
      baseUrl: 'database://mega_archive/kreo_products',
      timeout: 10000,
      retries: 1
    });

    this.normalizer = new KreoNormalizer();
    this.log = logger.create('KreoProvider');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des produits KRE-O dans la BDD
   * @param {string} query - Terme de recherche
   * @param {Object} options
   * @param {number} [options.page=1]
   * @param {number} [options.pageSize=20]
   * @param {string} [options.franchise] - Filtrer par franchise
   * @param {string} [options.subLine] - Filtrer par sous-ligne
   */
  async search(query, options = {}) {
    this.ensureConnected();

    const {
      page = 1,
      pageSize = 20,
      franchise = null,
      subLine = null
    } = options;

    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    this.log.debug(`Recherche KRE-O: "${query}" (page: ${page}, franchise: ${franchise || 'toutes'})`);

    let countSql = `SELECT COUNT(*) as total FROM kreo_products WHERE (name ILIKE $1 OR set_number ILIKE $1 OR franchise ILIKE $1 OR kreons_included ILIKE $1)`;
    let searchSql = `SELECT * FROM kreo_products WHERE (name ILIKE $1 OR set_number ILIKE $1 OR franchise ILIKE $1 OR kreons_included ILIKE $1)`;
    const params = [`%${query}%`];
    const countParams = [`%${query}%`];

    if (franchise) {
      countSql += ` AND franchise = $${countParams.length + 1}`;
      searchSql += ` AND franchise = $${params.length + 1}`;
      params.push(franchise);
      countParams.push(franchise);
    }

    if (subLine) {
      countSql += ` AND sub_line = $${countParams.length + 1}`;
      searchSql += ` AND sub_line = $${params.length + 1}`;
      params.push(subLine);
      countParams.push(subLine);
    }

    searchSql += ` ORDER BY franchise, year DESC, name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [countResult, results] = await Promise.all([
      megaQueryOne(countSql, countParams),
      megaQueryAll(searchSql, params)
    ]);

    const total = parseInt(countResult?.total || 0);
    const enriched = this.enrichWithFileUrls(results);

    return this.normalizer.normalizeSearchResponse(enriched, {
      query,
      total,
      pagination: {
        page,
        limit,
        hasMore: offset + results.length < total
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAIL PRODUIT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupérer un produit par set_number
   * @param {string} id - Numéro de set (ex: 31144, A2225, B0715)
   */
  async getById(id, options = {}) {
    this.ensureConnected();

    this.log.debug(`Récupération produit KRE-O: ${id}`);

    const row = await megaQueryOne(
      `SELECT * FROM kreo_products WHERE UPPER(set_number) = UPPER($1)`,
      [id]
    );

    if (!row) {
      throw new NotFoundError(`Produit KRE-O non trouvé: ${id}`);
    }

    const enriched = this.enrichRowWithFileUrls(row);
    const normalized = this.normalizer.normalize(enriched);

    return {
      success: true,
      provider: 'kreo',
      domain: 'construction-toys',
      id: normalized.id,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
        source: 'database'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FRANCHISES & SOUS-LIGNES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Lister tous les franchises avec comptages
   */
  async getFranchises() {
    this.ensureConnected();

    const rows = await megaQueryAll(
      `SELECT franchise, COUNT(*) as count FROM kreo_products GROUP BY franchise ORDER BY count DESC`
    );

    return {
      success: true,
      provider: 'kreo',
      domain: 'construction-toys',
      query: null,
      data: rows.map(r => ({
        name: r.franchise,
        count: parseInt(r.count),
        slug: r.franchise
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
   * Lister les produits d'une franchise
   */
  async getByFranchise(franchise, options = {}) {
    this.ensureConnected();

    const { page = 1, pageSize = 50 } = options;
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    const [countResult, results] = await Promise.all([
      megaQueryOne(`SELECT COUNT(*) as total FROM kreo_products WHERE franchise = $1`, [franchise]),
      megaQueryAll(
        `SELECT * FROM kreo_products WHERE franchise = $1 ORDER BY year DESC, name LIMIT $2 OFFSET $3`,
        [franchise, limit, offset]
      )
    ]);

    const total = parseInt(countResult?.total || 0);
    if (total === 0) {
      throw new NotFoundError(`Franchise KRE-O non trouvée: ${franchise}`);
    }

    const enriched = this.enrichWithFileUrls(results);

    return this.normalizer.normalizeSearchResponse(enriched, {
      query: `franchise:${franchise}`,
      total,
      pagination: {
        page,
        limit,
        hasMore: offset + results.length < total
      }
    });
  }

  /**
   * Lister les sous-lignes d'une franchise
   */
  async getSubLines(franchise = null) {
    this.ensureConnected();

    let sql = `SELECT franchise, sub_line, COUNT(*) as count FROM kreo_products WHERE sub_line IS NOT NULL`;
    const params = [];

    if (franchise) {
      sql += ` AND franchise = $1`;
      params.push(franchise);
    }

    sql += ` GROUP BY franchise, sub_line ORDER BY franchise, count DESC`;
    const rows = await megaQueryAll(sql, params);

    return {
      success: true,
      provider: 'kreo',
      domain: 'construction-toys',
      query: franchise || null,
      data: rows.map(r => ({
        franchise: r.franchise,
        subLine: r.sub_line,
        count: parseInt(r.count)
      })),
      total: rows.length,
      count: rows.length,
      pagination: null,
      meta: { fetchedAt: new Date().toISOString(), source: 'database' }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENRICHISSEMENT FICHIERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enrichir une liste de produits avec les URLs fichiers statiques
   * @private
   */
  enrichWithFileUrls(rows) {
    if (!rows.length) return rows;
    return rows.map(row => this.enrichRowWithFileUrls(row));
  }

  /**
   * Enrichir un produit unique avec les URLs fichiers statiques
   * @private
   */
  enrichRowWithFileUrls(row) {
    return {
      ...row,
      // URL directe vers l'image statique
      image_file_url: row.image_path
        ? getFileUrl(KREO_ARCHIVE, row.image_path)
        : null,
      // URL directe vers le PDF d'instructions
      pdf_file_url: row.pdf_path
        ? getFileUrl(KREO_ARCHIVE, row.pdf_path)
        : null,
      // Rétrocompatibilité : mapper les anciens noms de champs
      image_proxy_url: row.image_path
        ? getFileUrl(KREO_ARCHIVE, row.image_path)
        : null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════════════

  ensureConnected() {
    if (!isMegaConnected()) {
      throw new BadGatewayError('Base de données non disponible pour KRE-O. Vérifiez la connexion à Louis (10.20.0.10:5434).');
    }
  }

  async healthCheck() {
    const startTime = Date.now();
    const dbConnected = isMegaConnected();
    const storageConnected = isStorageReady();

    if (!dbConnected) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: 'KRE-O Database non connectée',
        details: { db: false, storage: storageConnected }
      };
    }

    try {
      const countResult = await megaQueryOne('SELECT COUNT(*) as count FROM kreo_products');
      const franchises = await megaQueryAll(
        'SELECT franchise, COUNT(*) as count FROM kreo_products GROUP BY franchise ORDER BY count DESC'
      );
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
        message: `KRE-O Archive opérationnelle (${countResult.count} produits)`,
        details: {
          db: true,
          storage: storageConnected,
          products: parseInt(countResult.count),
          franchises: franchises.map(f => ({ name: f.franchise, count: parseInt(f.count) })),
          archive: KREO_ARCHIVE,
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

export default KreoProvider;
