/**
 * Manga-news Provider — mangas ET magazines FR par numéro (LIVE, à la demande)
 *
 * manga-news.com : la référence francophone du manga & de la presse manga.
 * Chaque SÉRIE (manga VF, mais aussi les magazines type Animeland/Coyote) a une
 * fiche `/index.php/serie/{slug}` qui liste TOUS ses volumes/numéros avec couverture
 * FR, date de sortie et éditeur — exactement ce qu'il faut pour un full-set numéroté.
 *
 * Site protégé Cloudflare → tout passe par FlareSolverr (VPN dédié de Tako).
 *
 *   Recherche : /index.php/recherche/?q={q}
 *               → sections « Dans Séries Manga VF », « Dans Séries Anime », …
 *               chaque résultat = <li class="resManga"><a href="/serie/{slug}">
 *   Détail    : /index.php/serie/{slug}
 *               → titre, résumé FR, origine/année, éditeur(s), auteur(s), genres,
 *               et la grille des volumes (numéro + couverture + date).
 *
 * @module domains/anime-manga/providers/manga-news
 */

import { FlareSolverrClient } from '../../../infrastructure/scraping/FlareSolverrClient.js';
import { logger } from '../../../shared/utils/logger.js';

const BASE = 'https://www.manga-news.com';

let _client = null;
function client() {
  if (!_client) _client = new FlareSolverrClient('MangaNews');
  return _client;
}

// ── helpers ────────────────────────────────────────────────────────────────

function decodeEntities(s = '') {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;|&rsquo;/g, "'")
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê')
    .replace(/&agrave;/g, 'à').replace(/&acirc;/g, 'â').replace(/&ccedil;/g, 'ç')
    .replace(/&ocirc;/g, 'ô').replace(/&ucirc;/g, 'û').replace(/&ugrave;/g, 'ù')
    .replace(/&icirc;/g, 'î').replace(/&iuml;/g, 'ï').replace(/&euml;/g, 'ë')
    .replace(/&ntilde;/g, 'ñ').replace(/&ocirc;/g, 'ô').replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…').replace(/&oelig;/g, 'œ');
}

const stripTags = (s = '') => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Normalise une URL de couverture en absolu (sans changer la taille). */
function absCover(url) {
  if (!url || /missing_img|no[-_]?image|placeholder/i.test(url)) return null;
  return url.startsWith('http') ? url : `${BASE}/${url.replace(/^\//, '')}`;
}

/** Variante HD `_large` d'une couverture `_medium` (n'existe pas partout). */
function largeVariant(url) {
  return url ? url.replace(/_medium\.(jpe?g|png|webp)$/i, '_large.$1') : null;
}

/**
 * Les couvertures manga existent en `_large` (≈2× la `_medium`) mais PAS les
 * magazines (Animeland n'a que `_medium`). On sonde UNE fois le `_large` du
 * premier volume : s'il existe, toute la série suit la même convention → HD.
 */
async function preferLarge(sampleMediumUrl) {
  const large = largeVariant(sampleMediumUrl);
  if (!large || large === sampleMediumUrl) return false;
  try {
    const r = await fetch(large, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}

// ── RECHERCHE ────────────────────────────────────────────────────────────────

/**
 * Recherche de séries (mangas VF + magazines) sur manga-news.
 * @param {string} query
 * @param {Object} [options] - { maxResults=20 }
 * @returns {Promise<{source,query,total,results:Array}>}
 */
export async function searchMangaNews(query, options = {}) {
  const { maxResults = 20 } = options;
  let html = '';
  try {
    // pas de waitInSeconds : manga-news est server-rendered, et l'option fait crasher
    // l'onglet Chrome de FlareSolverr sous charge (« tab crashed », HTTP 500).
    html = await client().get(`${BASE}/index.php/recherche/?q=${encodeURIComponent(query)}`);
  } catch (err) {
    logger.debug(`[MangaNews] recherche "${query}" indisponible : ${err.message}`);
    return { source: 'manga-news', query, total: 0, results: [] };
  }

  // Découpage par sections (« Dans Séries Manga VF (12) », « Dans Séries Anime (7) », …)
  const sections = [];
  const re = /headerTitle">([^<]+)<\/span>/g;
  let m, prev = null;
  while ((m = re.exec(html))) {
    if (prev) sections.push({ label: decodeEntities(prev.label), body: html.slice(prev.idx, m.index) });
    prev = { label: m[1], idx: m.index };
  }
  if (prev) sections.push({ label: decodeEntities(prev.label), body: html.slice(prev.idx) });

  const seen = new Set();
  const results = [];
  for (const sec of sections) {
    // on ne garde que les sections « Séries » (manga VF, anime, VO) — pas actus/figurines/auteurs
    if (!/S[ée]ries/i.test(sec.label)) continue;
    const kind = /VF/i.test(sec.label) ? 'manga'
      : /Anime/i.test(sec.label) ? 'anime'
      : /VO/i.test(sec.label) ? 'manga-vo' : 'serie';
    const items = sec.body.matchAll(
      /<a href="[^"]*\/index\.php\/serie\/([^"/]+)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?searchTitle">([\s\S]*?)<\/span>/g);
    for (const it of items) {
      const slug = it[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      const txt = stripTags(it[4]);
      const ym = txt.match(/\((\d{4})\)\s*$/);
      results.push({
        slug,
        title: decodeEntities(it[2]).replace(/^\s*-\s*/, '').trim() || txt.replace(/\s*\(\d{4}\)\s*$/, '').trim(),
        year: ym ? ym[1] : null,
        cover: absCover(it[3]),
        kind,
        url: `${BASE}/index.php/serie/${slug}`
      });
      if (results.length >= maxResults) break;
    }
    if (results.length >= maxResults) break;
  }

  logger.info(`[MangaNews] ${results.length} série(s) pour "${query}"`);
  return { source: 'manga-news', query, total: results.length, results };
}

// ── DÉTAIL SÉRIE ─────────────────────────────────────────────────────────────

/** Extrait les liens `/xxx/{val}` en éliminant les entêtes de menu (bruit). */
function linkValues(html, kind, noise) {
  const out = [];
  const re = new RegExp(`/index\\.php/${kind}/[^"?]+"[^>]*>([^<]{2,50})<`, 'g');
  let m;
  while ((m = re.exec(html))) {
    const v = stripTags(m[1]);
    if (v && !noise.some(n => v.includes(n)) && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Détail d'une série : métadonnées + liste des volumes/numéros avec couvertures.
 * @param {string} slug - slug manga-news (ex: "Gunnm-Edition-Originale", "Animeland")
 * @returns {Promise<Object|null>}
 */
export async function getMangaNewsSerie(slug) {
  let html = '';
  try {
    html = await client().get(`${BASE}/index.php/serie/${encodeURIComponent(slug)}`);
  } catch (err) {
    logger.debug(`[MangaNews] série "${slug}" indisponible : ${err.message}`);
    return null;
  }
  if (/<title>\s*Erreur/i.test(html)) return null;

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1 ? stripTags(h1[1]) : slug.replace(/-/g, ' ');

  // Résumé FR : <div id="summary" …><h2>Résumé</h2><div class="bigsize">{synopsis}</div>
  let synopsis = null;
  const sum = html.match(/id="summary"[\s\S]*?class="bigsize"[^>]*>([\s\S]*?)<\/div>/);
  if (sum) synopsis = stripTags(sum[1]) || null;

  // Origine + année VO : « Origine</strong>: Japon - 1991 </li> »
  let origine = null, year = null;
  const orig = html.match(/Origine<\/strong>\s*:\s*([\s\S]*?)<\/li>/);
  if (orig) {
    const t = stripTags(orig[1]);
    const ym = t.match(/(\d{4})/);
    origine = t.replace(/[-\s]*\d{4}.*$/, '').trim() || null;
    year = ym ? ym[1] : null;
  }

  const publishers = linkValues(html, 'editeur',
    ['Editeur', 'éditeur', 'Editeurs', 'Webtoon', 'DVD', 'Blu-ray', 'Japonais', 'Etrangers']);
  const authors = linkValues(html, 'auteur',
    ['Studios', 'Musiciens', 'Compositeurs', 'Doubleur', 'Auteurs', 'Dessinateur']);
  const genres = linkValues(html, 'type',
    ['Webtoon', 'Tous les webtoons', 'Tous les', 'Types']);

  // Volumes : chaque bloc serieVolumesImgBlock → lien /manga/{slug}/vol-N + couverture
  const volumes = [];
  const seenVol = new Set();
  const vre = /serieVolumesImgBlock[^"]*"[\s\S]*?<a href="([^"]*\/index\.php\/manga\/[^"]*\/(vol-[^"/]+))"[\s\S]*?title="([^"]*)"[\s\S]*?<img[^>]+src="([^"]+)"/g;
  let v;
  while ((v = vre.exec(html))) {
    const volSlug = v[2];              // ex "vol-3", "vol-hs-1"
    if (seenVol.has(volSlug)) continue;
    seenVol.add(volSlug);
    const numMatch = volSlug.match(/vol-(\d+)/);
    const titleTxt = decodeEntities(v[3]);
    const vnMatch = titleTxt.match(/Vol\.?\s*([0-9]+)/i);
    volumes.push({
      number: numMatch ? numMatch[1] : (vnMatch ? vnMatch[1] : volSlug.replace('vol-', '')),
      label: titleTxt.trim(),
      cover: absCover(v[4]),
      url: v[1].startsWith('http') ? v[1] : `${BASE}${v[1]}`
    });
  }
  // tri par numéro croissant quand numérique
  volumes.sort((a, b) => {
    const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
    if (isNaN(na) || isNaN(nb)) return 0;
    return na - nb;
  });

  // HD si disponible (mangas oui, magazines non) — une seule sonde par série
  if (volumes.length && await preferLarge(volumes[0].cover)) {
    for (const vol of volumes) vol.cover = largeVariant(vol.cover);
  }

  const coverMain = volumes[0]?.cover
    || absCover((html.match(/id="ficheImg"[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1]);

  return {
    slug, title, synopsis, origine, year,
    publishers, authors, genres,
    cover: coverMain,
    volumes,
    volumesCount: volumes.length,
    url: `${BASE}/index.php/serie/${slug}`
  };
}

// ── HEALTH ───────────────────────────────────────────────────────────────────

export async function healthCheck() {
  const t0 = Date.now();
  try {
    const html = await client().get(`${BASE}/index.php/recherche/?q=naruto`);
    const healthy = /resManga|headerTitle/.test(html);
    return { healthy, latency: Date.now() - t0, message: healthy ? 'ok' : 'markup inattendu' };
  } catch (err) {
    return { healthy: false, latency: Date.now() - t0, message: err.message };
  }
}
