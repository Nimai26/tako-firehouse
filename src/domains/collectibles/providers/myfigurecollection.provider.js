/**
 * MyFigureCollection (MFC) Provider
 *
 * Base mondiale de référence pour les figurines de collection (scale figures, Nendoroid,
 * figma, PVC prépeintes, garage kits…). Données très structurées : origine (œuvre/licence),
 * personnage, fabricant, sculpteur, matériaux, échelle/dimensions, dates de sortie, prix (JPY),
 * code-barres JAN, note communautaire, image officielle.
 *
 * Accès HTTP DIRECT (pas de FlareSolverr nécessaire), parsing HTML via cheerio.
 *
 * @module domains/collectibles/providers/myfigurecollection
 */

import { load } from 'cheerio';
import { FlareSolverrClient } from '../../../infrastructure/scraping/FlareSolverrClient.js';
import { translateText } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

const BASE_URL = 'https://myfigurecollection.net';
const DEFAULT_MAX = 24;
const TIMEOUT_MS = 45000;

// Singleton FlareSolverr : MFC est derrière Cloudflare (challenge JS) → 403 en accès direct,
// résolu par FlareSolverr (obtient le cf_clearance), comme coleka/luluberlu/transformerland.
let fsrClient = null;
function getFsrClient() {
  if (!fsrClient) fsrClient = new FlareSolverrClient();
  return fsrClient;
}

/**
 * Récupère le HTML d'une URL MFC via FlareSolverr (passe le challenge Cloudflare).
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchHtml(url) {
  const client = getFsrClient();
  const html = await client.get(url, { maxTimeout: TIMEOUT_MS });
  if (!html) throw new Error('MFC : réponse vide (FlareSolverr)');
  return html;
}

/**
 * Recherche d'items sur MFC. Le titre de chaque vignette est dans l'attribut `alt` de sa
 * miniature (format « Origine - Personnage - Échelle (Fabricant) »).
 * @param {string} query
 * @param {{max?:number}} [options]
 * @returns {Promise<{results:Array, total:number}>}
 */
export async function searchMFC(query, options = {}) {
  const max = options.max || DEFAULT_MAX;
  const url = `${BASE_URL}/?_tab=item&keywords=${encodeURIComponent(query)}`;
  logger.info(`[MFC] search "${query}"`);
  const html = await fetchHtml(url);
  const $ = load(html);
  const items = [];
  const seen = new Set();
  $('span.item-icon > a[href^="/item/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const id = (href.match(/\/item\/(\d+)/) || [])[1];
    if (!id || seen.has(id)) return;
    const img = $(el).find('img').first();
    const image = img.attr('src') || null;
    const title = (img.attr('alt') || '').trim();
    seen.add(id);
    items.push({ id, title, image, url: `${BASE_URL}/item/${id}` });
  });
  return { results: items.slice(0, max), total: items.length };
}

/**
 * Extrait le premier libellé d'un champ « data-field » (translittéré/romaji quand dispo).
 */
function fieldEntry($, label) {
  const field = $(`.data-field`).filter((_, el) =>
    $(el).find('.data-label').first().text().trim() === label).first();
  if (!field.length) return null;
  const span = field.find('.item-entry span').first();
  const t = (span.text() || field.find('.data-value').first().text() || '').trim();
  return t || null;
}

/**
 * Détails complets d'un item MFC.
 * @param {string|number} id
 * @param {{lang?:string, autoTrad?:boolean}} [options]
 * @returns {Promise<object|null>}
 */
export async function getMFCDetails(id, options = {}) {
  const lang = options.lang || 'fr';
  const autoTrad = options.autoTrad;
  const url = `${BASE_URL}/item/${id}`;
  logger.info(`[MFC] details ${id}`);
  const html = await fetchHtml(url);
  const $ = load(html);

  const og = (p) => $(`meta[property="og:${p}"]`).attr('content') || null;
  const title = og('title') || '';
  const image = og('image') || null;

  const company = fieldEntry($, 'Company');       // fabricant
  const origin = fieldEntry($, 'Origin');         // œuvre / licence
  const character = fieldEntry($, 'Character');    // personnage
  const artist = fieldEntry($, 'Artist');          // sculpteur

  // Matériaux (liste)
  let materials = null;
  const matField = $('.data-field').filter((_, el) =>
    $(el).find('.data-label').first().text().trim() === 'Materials').first();
  if (matField.length) {
    materials = matField.find('.item-entry span').map((_, s) => $(s).text().trim())
      .get().filter(Boolean).join(', ') || null;
  }

  // Catégorie (type de figurine : Prepainted, Garage Kit, Trading, …)
  let category = null;
  const catField = $('.data-field').filter((_, el) =>
    $(el).find('.data-label').first().text().trim() === 'Category').first();
  if (catField.length) category = catField.find('.data-value').first().text().trim() || null;

  // Dimensions → échelle (ex « 1/8 »)
  let scale = null;
  const dimField = $('.data-field').filter((_, el) =>
    $(el).find('.data-label').first().text().trim() === 'Dimensions').first();
  if (dimField.length) {
    const s = dimField.find('.item-scale').text().replace(/\s+/g, '').trim();
    scale = s || null;
  }

  // Releases → première sortie : année + prix (JPY) + code-barres JAN
  let year = null, price = null, currency = null, barcode = null;
  const relField = $('.data-field').filter((_, el) =>
    $(el).find('.data-label').first().text().trim() === 'Releases').first();
  if (relField.length) {
    const relText = relField.text();
    const dm = relText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dm) year = parseInt(dm[3], 10);
    const pm = relText.match(/([\d,]+)\s*JPY/);
    if (pm) { price = parseInt(pm[1].replace(/,/g, ''), 10) || null; currency = 'JPY'; }
    const bm = relText.match(/\b(\d{13})\b/);
    if (bm) barcode = bm[1];
  }

  const rating = $('[itemprop="ratingValue"]').first().text().trim() || null;
  let description = og('description') || null;

  // Traduction FR optionnelle des libellés « communs » (les noms propres restent tels quels).
  if (autoTrad && lang && lang !== 'en') {
    if (category) category = await translateText(category, lang).then(r => r?.text || r || category).catch(() => category);
    if (materials) materials = await translateText(materials, lang).then(r => r?.text || r || materials).catch(() => materials);
  }

  return {
    id: String(id), url, title, description, image,
    company, origin, character, artist, materials, scale, category,
    year, price, currency, barcode, rating,
    gallery: image ? [image] : []
  };
}

/**
 * Health check du provider (page d'accueil accessible ?).
 * @returns {Promise<object>}
 */
export async function healthCheck() {
  try {
    const client = getFsrClient();
    const fsr = await client.healthCheck();
    const ok = fsr && (fsr.status === 'ok' || fsr.status === 'healthy' || fsr.healthy);
    return {
      status: ok ? 'healthy' : 'unhealthy',
      provider: 'myfigurecollection',
      dependency: 'flaresolverr',
      details: fsr
    };
  } catch (e) {
    return { status: 'unhealthy', provider: 'myfigurecollection', error: e.message };
  }
}
