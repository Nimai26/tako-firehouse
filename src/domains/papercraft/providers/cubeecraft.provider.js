/**
 * Cubeecraft Provider (Database + Filesystem)
 *
 * Papercraft (modèles en papier à découper/monter) archivés depuis cubeecraft.com
 * (site ABANDONNÉ, sauvegardé le 2026-07-19 — ~751 modèles).
 *
 * ARCHITECTURE :
 * - PostgreSQL (tako_cache) : table `cubeecraft_products` (seed 004) — métadonnées.
 * - Filesystem (/data/tako-storage/cubeecraft-archive/{slug}/) : patron (pages JPG/PDF) + vignette,
 *   servis via FILE_BASE_URL (rsync offsite Egon).
 *
 * @module domains/papercraft/providers/cubeecraft
 */

import { logger } from '../../../shared/utils/logger.js';
import { queryOne, queryAll, getIsConnected } from '../../../infrastructure/database/connection.js';
import { getFileUrl } from '../../../infrastructure/storage/index.js';

const log = logger.create('CubeecraftProvider');
const ARCHIVE = 'cubeecraft-archive';

// ── helpers ──────────────────────────────────────────────────────────────────
function enrich(row) {
  if (!row) return null;
  const slug = row.slug;
  const pages = Array.isArray(row.patron_pages) ? row.patron_pages : [];
  return {
    slug,
    name: row.name,
    categories: Array.isArray(row.categories) ? row.categories : [],
    source: row.source,
    license: row.license,
    source_url: row.url,
    thumb_url: row.thumb_path ? getFileUrl(ARCHIVE, row.thumb_path) : null,
    // le patron : fichier principal (zip OU image/pdf) + chaque page imprimable
    patron_url: row.patron_file ? getFileUrl(ARCHIVE, `${slug}/${row.patron_file}`) : null,
    patron_pages: pages.map((p) => ({ file: p, url: getFileUrl(ARCHIVE, `${slug}/${p}`) })),
  };
}

// ── API ──────────────────────────────────────────────────────────────────────

/** Recherche par nom/slug, filtre catégorie optionnel. */
export async function search(q, { category = null, limit = 30, offset = 0 } = {}) {
  const where = [];
  const params = [];
  let i = 1;
  if (q && q.trim()) {
    where.push(`(name ILIKE $${i} OR slug ILIKE $${i})`);
    params.push(`%${q.trim()}%`);
    i++;
  }
  if (category) {
    where.push(`categories @> $${i}::jsonb`);
    params.push(JSON.stringify([category]));
    i++;
  }
  const wsql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await queryOne(`SELECT COUNT(*)::int AS n FROM cubeecraft_products ${wsql}`, params);
  const rows = await queryAll(
    `SELECT * FROM cubeecraft_products ${wsql} ORDER BY name LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  return {
    success: true,
    provider: 'cubeecraft',
    total: totalRow ? totalRow.n : 0,
    count: rows.length,
    limit,
    offset,
    results: rows.map(enrich),
  };
}

/** Détail d'un modèle par slug. */
export async function getBySlug(slug) {
  const row = await queryOne('SELECT * FROM cubeecraft_products WHERE slug = $1', [slug]);
  return row ? { success: true, provider: 'cubeecraft', data: enrich(row) } : null;
}

/** Liste des catégories avec compteurs. */
export async function listCategories() {
  const rows = await queryAll(
    `SELECT cat AS name, COUNT(*)::int AS count
       FROM cubeecraft_products, jsonb_array_elements_text(categories) AS cat
      GROUP BY cat ORDER BY count DESC, name`
  );
  return { success: true, provider: 'cubeecraft', categories: rows };
}

/** Stats de l'archive. */
export async function getStats() {
  const row = await queryOne('SELECT COUNT(*)::int AS total FROM cubeecraft_products');
  return { success: true, provider: 'cubeecraft', total: row ? row.total : 0, archive: ARCHIVE };
}

/** Health check. */
export async function healthCheck() {
  try {
    if (!getIsConnected()) return { status: 'unhealthy', message: 'DB non connectée' };
    const row = await queryOne('SELECT COUNT(*)::int AS total FROM cubeecraft_products');
    return { status: 'healthy', total: row ? row.total : 0, archive: ARCHIVE };
  } catch (e) {
    log.error(`healthCheck KO: ${e.message}`);
    return { status: 'unhealthy', message: e.message };
  }
}
