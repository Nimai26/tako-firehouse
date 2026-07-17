/**
 * ConsoleVariations Provider — BASE LOCALE (mega-DB)
 *
 * Le site consolevariations.com a refondu ses URLs (l'ancien scraping live via
 * FlareSolverr renvoyait 404). On lit désormais l'ARCHIVE LOCALE pré-scrapée
 * (12k+ items dans la table `consolevariations_items` de la mega-DB, images sous
 * consolevariations-archive/img/), sur le même principe que le provider Carddass.
 *
 * L'ancien provider de scraping live est conservé en .scraper.bak (utile pour
 * re-scraper/mettre à jour l'archive : cf consolevariations-archive/scraper.py).
 *
 * @module domains/videogames/providers/consolevariations
 */

import { logger } from '../../../shared/utils/logger.js';
import {
  megaQueryOne as queryOne,
  megaQueryAll as queryAll
} from '../../../infrastructure/mega/index.js';

const BASE_URL = 'https://consolevariations.com';
const CDN_URL = 'https://cdn.consolevariations.com';
const TYPE_MAP = { consoles: 'console', controllers: 'controller', accessories: 'accessory' };

/** Chemin d'image relatif → URL absolue (CDN). */
function imgUrl(p) {
  if (!p) return null;
  return String(p).startsWith('http') ? p : `${CDN_URL}/${p}`;
}

/** Slug simple pour une plateforme (« Sony PlayStation 2 » → « sony-playstation-2 »). */
function slugify(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Ligne DB → item de résultat (forme attendue par le normalizer). */
function rowToResult(r) {
  return {
    id: r.slug,
    slug: r.slug,
    name: r.name,
    url: `${BASE_URL}/collectibles/${r.slug}`,
    image: r.image_main || null,
    thumbnail: r.image_main || null,
    type: r.type || 'unknown'
  };
}

/**
 * Recherche dans l'archive locale.
 * @param {string} query
 * @param {Object} [options] - { maxResults=20, type='all'|'consoles'|'controllers'|'accessories' }
 */
export async function searchConsoleVariations(query, options = {}) {
  const { maxResults = 20, type = 'all' } = options;
  const params = [`%${query}%`];
  let where = 'name ILIKE $1';
  if (type !== 'all' && TYPE_MAP[type]) {
    params.push(TYPE_MAP[type]);
    where += ` AND type = $${params.length}`;
  }
  params.push(Math.min(parseInt(maxResults, 10) || 20, 50));
  const rows = await queryAll(
    `SELECT slug, name, image_main, type, platform, brand
       FROM consolevariations_items
      WHERE ${where}
      ORDER BY rarity_score DESC NULLS LAST, name ASC
      LIMIT $${params.length}`, params);
  const results = rows.map(rowToResult);
  logger.info(`[ConsoleVariations] ${results.length} résultat(s) locaux pour "${query}" (type=${type})`);
  return { source: 'consolevariations', query, type, total: results.length, results };
}

/**
 * Détails d'un item par slug (depuis l'archive locale).
 * @param {string} slug
 */
export async function getConsoleVariationsDetails(slug, _options = {}) {
  const row = await queryOne('SELECT * FROM consolevariations_items WHERE slug = $1', [slug]);
  if (!row) return null;
  const props = row.props || {};
  const images = (row.images || []).map((p, i) => ({ url: imgUrl(p), thumbnail: imgUrl(p), isMain: i === 0 }));
  if (row.image_main && !images.some(im => im.url === row.image_main)) {
    images.unshift({ url: row.image_main, thumbnail: row.image_main, isMain: true });
  }
  const platName = row.platform || null;
  const rScore = row.rarity_score != null ? row.rarity_score
    : (props['Rarity Score'] ? parseInt(props['Rarity Score'], 10) : null);
  return {
    slug: row.slug,
    id: row.slug,
    name: row.name,
    nameOriginal: row.name,
    url: row.url,
    images,
    platform: platName ? { slug: slugify(platName), name: platName } : null,
    brand: row.brand || null,
    rarity: { score: rScore, level: row.rarity_tier || props['Rarity Tier'] || 'unknown' },
    releaseType: props['Release Type'] || null,
    regionCode: props['Region Code'] || null,
    amountProduced: props['Amount Produced Estimate'] || null,
    isLimitedEdition: props['Limited Edition'] === 'Yes',
    isBundle: props['Is Bundle'] === 'Yes',
    color: props['Color'] || null,
    community: { wantCount: 0, ownCount: 0 }
  };
}

/**
 * Liste des plateformes (agrégées depuis l'archive), filtrable par marque.
 * @param {Object} [options] - { brand }
 */
export async function listConsoleVariationsPlatforms(options = {}) {
  const { brand } = options;
  const params = [];
  let where = "platform IS NOT NULL AND platform <> ''";
  if (brand) { params.push(brand); where += ` AND LOWER(brand) = LOWER($${params.length})`; }
  const rows = await queryAll(
    `SELECT platform AS name, MIN(brand) AS brand, COUNT(*) AS count
       FROM consolevariations_items
      WHERE ${where}
      GROUP BY platform
      ORDER BY count DESC`, params);
  const results = rows.map(r => ({
    id: slugify(r.name), slug: slugify(r.name), name: r.name,
    url: `${BASE_URL}/${slugify(r.brand || '')}`, brand: r.brand || null, count: Number(r.count)
  }));
  return { source: 'consolevariations', brand: brand || null, total: results.length, results };
}

/**
 * Parcourt une plateforme (par slug de plateforme).
 * @param {string} platformSlug
 * @param {Object} [options] - { maxResults=20 }
 */
export async function browseConsoleVariationsPlatform(platformSlug, options = {}) {
  const { maxResults = 20 } = options;
  const rows = await queryAll(
    `SELECT slug, name, image_main, type, platform, brand
       FROM consolevariations_items
      WHERE regexp_replace(lower(platform), '[^a-z0-9]+', '-', 'g') = $1
      ORDER BY rarity_score DESC NULLS LAST, name ASC
      LIMIT $2`, [platformSlug, Math.min(parseInt(maxResults, 10) || 20, 50)]);
  const results = rows.map(rowToResult);
  return { source: 'consolevariations', platform: platformSlug, total: results.length, results };
}

/** Compat : plus de session FlareSolverr à détruire (lecture DB locale). */
export async function destroyFsrSession() {
  return true;
}

/** Santé : la base locale contient-elle des items ? */
export async function healthCheck() {
  try {
    const row = await queryOne('SELECT COUNT(*)::int AS count FROM consolevariations_items', []);
    const count = row?.count || 0;
    return {
      status: count > 0 ? 'ok' : 'empty',
      healthy: count > 0,
      source: 'archive-locale (mega-db)',
      items: count,
      message: `${count} variations en base locale`
    };
  } catch (err) {
    return { status: 'error', healthy: false, error: err.message };
  }
}
