/**
 * RCScrapyard Provider — véhicules radiocommandés (LIVE, à la demande)
 *
 * Base de 4000+ modèles RC (toutes marques, surtout vintage) : rcscrapyard.net.
 * Site VIVANT, HTML server-rendered, robots ouvert → provider LIVE (pas de miroir) :
 * on ne va chercher que la fiche du modèle demandé, au moment où il est ajouté.
 *
 * Recherche = index par marque + fuzzy-match (pas de moteur externe) :
 *   /{marque}.htm liste tous ses modèles (slug + nom) → on matche le nom.
 * Détail = /{slug}.htm : la meta description est structurée
 *   « Team Associated RC10 (1984 / 1986) … ★ 1/10 Scale Electric Buggy ★ »
 *   → on en extrait échelle / année / type / motorisation ; photos sous /car_files/.
 *
 * @module domains/rc/providers/rcscrapyard
 */

import { FlareSolverrClient } from '../../../infrastructure/scraping/FlareSolverrClient.js';
import { logger } from '../../../shared/utils/logger.js';

const BASE = 'https://www.rcscrapyard.net';

// alias de marque (dans la requête) → slug de la page index sur RCScrapyard
const BRANDS = {
  'team associated': 'associated', 'associated': 'associated',
  'tamiya': 'tamiya', 'kyosho': 'kyosho', 'losi': 'losi', 'team losi': 'losi',
  'hpi racing': 'hpi', 'hpi': 'hpi', 'traxxas': 'traxxas', 'schumacher': 'schumacher',
  'yokomo': 'yokomo', 'mugen seiki': 'mugen', 'mugen': 'mugen', 'serpent': 'serpent',
  'xray': 'xray', 'team corally': 'corally', 'corally': 'corally',
  'thunder tiger': 'thunder-tiger', 'academy': 'academy', 'duratrax': 'duratrax',
  'ofna': 'ofna', 'team magic': 'team-magic', 'capricorn': 'capricorn',
  'team durango': 'durango', 'durango': 'durango', 'ansmann': 'ansmann',
  'carson': 'carson', 'graupner': 'graupner', 'robitronic': 'robitronic',
  'team xray': 'xray', 'gs racing': 'gs-racing', 'nichimo': 'nichimo',
  'marui': 'marui', 'hirobo': 'hirobo', 'ripmax': 'ripmax'
};

let _client = null;
function client() {
  if (!_client) _client = new FlareSolverrClient('RCScrapyard');
  return _client;
}

/** Détecte marque (slug index) + partie « modèle » restante à partir de la requête. */
function splitBrand(query) {
  const q = query.toLowerCase().trim();
  for (const alias of Object.keys(BRANDS).sort((a, b) => b.length - a.length)) {
    if (q.startsWith(alias + ' ') || q === alias) {
      return { brandSlug: BRANDS[alias], model: q.slice(alias.length).trim() };
    }
  }
  // repli : 1er mot = slug tenté tel quel
  const [first, ...rest] = q.split(/\s+/);
  return { brandSlug: first.replace(/[^a-z0-9]/g, ''), model: rest.join(' ') };
}

/** Score de proximité simple (chevauchement de tokens + inclusion). */
function score(model, name) {
  const a = new Set(model.split(/\s+/).filter(Boolean));
  const b = name.toLowerCase();
  if (!a.size) return 0.3;                    // pas de modèle précisé → tout est faible
  let hit = 0;
  for (const t of a) if (b.includes(t)) hit++;
  let s = hit / a.size;
  if (b.includes(model)) s += 0.5;            // bonus inclusion exacte
  return s;
}

/**
 * Recherche par nom (marque + modèle).
 * @param {string} query
 * @param {Object} [options] - { maxResults=10 }
 */
export async function searchRcscrapyard(query, options = {}) {
  const { maxResults = 10 } = options;
  const { brandSlug, model } = splitBrand(query);
  let html = '';
  try {
    html = await client().get(`${BASE}/${brandSlug}.htm`, { waitInSeconds: 1 });
  } catch (err) {
    logger.debug(`[RCScrapyard] index ${brandSlug} indisponible : ${err.message}`);
    return { source: 'rcscrapyard', query, total: 0, results: [] };
  }
  const pairs = [...html.matchAll(
    /href="(?:https?:\/\/www\.rcscrapyard\.net)?\/([a-z0-9-]+-[a-z0-9-]+\.htm)"[^>]*>([^<]{2,70})</g)];
  const seen = new Set();
  const scored = [];
  for (const m of pairs) {
    const slug = m[1], name = m[2].trim();
    if (seen.has(slug) || !slug.startsWith(brandSlug + '-')) continue;
    seen.add(slug);
    scored.push({ slug, name, s: score(model, name) });
  }
  scored.sort((a, b) => b.s - a.s);
  const results = scored.slice(0, maxResults).map(r => ({
    id: r.slug.replace(/\.htm$/, ''),
    slug: r.slug.replace(/\.htm$/, ''),
    name: r.name,
    url: `${BASE}/${r.slug}`
  }));
  logger.info(`[RCScrapyard] ${results.length} résultat(s) pour "${query}" (marque=${brandSlug})`);
  return { source: 'rcscrapyard', query, total: results.length, results };
}

/** Extrait les champs structurés de la meta description RCScrapyard. */
function parseDescription(desc) {
  const out = { scale: null, year: null, vehicleType: null, motorisation: null };
  const mScale = desc.match(/(\d\/\d{1,2})\s*Scale/i);
  if (mScale) out.scale = mScale[1];
  const mYear = desc.match(/\((\d{4})/);
  if (mYear) out.year = mYear[1];
  const mType = desc.match(/\b(Buggy|Truggy|Monster Truck|Truck|Touring Car|On-?Road|Off-?Road|Crawler|Drift|Rally|Car|Boat|Tank|Motorcycle)\b/i);
  if (mType) out.vehicleType = mType[1];
  const mMot = desc.match(/\b(Electric|Nitro|Petrol|Gas|Glow)\b/i);
  if (mMot) out.motorisation = mMot[1];
  return out;
}

/**
 * Détails d'un modèle par slug.
 * @param {string} slug
 */
export async function getRcscrapyardDetails(slug, _options = {}) {
  const clean = slug.replace(/\.htm$/, '');
  let html = '';
  try {
    html = await client().get(`${BASE}/${clean}.htm`, { waitInSeconds: 1 });
  } catch (err) {
    logger.debug(`[RCScrapyard] fiche ${clean} indisponible : ${err.message}`);
    return null;
  }
  const mTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const mDesc = html.match(/<meta name="description" content="([^"]+)"/i);
  const desc = mDesc ? mDesc[1] : '';
  const parsed = parseDescription(desc);
  // nom = début de la description (avant « ( », « • », « - ») ; sinon le <title> nettoyé
  const nameSrc = desc || (mTitle ? mTitle[1] : clean);
  const name = nameSrc.split(/\s*[•(]|\s+[-–]\s+/)[0].trim();
  // marque = le nom de marque connu par lequel commence la description
  const KNOWN = ['Team Associated', 'Tamiya', 'Kyosho', 'Team Losi', 'Losi', 'HPI Racing', 'HPI',
    'Traxxas', 'Schumacher', 'Yokomo', 'Mugen Seiki', 'Mugen', 'Serpent', 'XRAY', 'Team Corally',
    'Corally', 'Thunder Tiger', 'Academy', 'Duratrax', 'OFNA', 'Team Magic', 'Capricorn',
    'Team Durango', 'Durango', 'Ansmann', 'Carson', 'Graupner', 'Robitronic', 'Marui', 'Hirobo'];
  const brand = KNOWN.find(k => name.toLowerCase().startsWith(k.toLowerCase())) || null;
  const model = brand ? name.slice(brand.length).trim() : name;
  const images = [...new Set([...html.matchAll(/["'](https?:\/\/www\.rcscrapyard\.net\/car_files\/[^"']+\.(?:jpg|jpeg|png))["']/gi)].map(m => m[1]))];
  return {
    slug: clean,
    id: clean,
    name,
    url: `${BASE}/${clean}.htm`,
    description: desc || null,
    brand,
    model: model || name,
    ...parsed,
    images
  };
}

/** Santé : le site répond-il ? */
export async function healthCheck() {
  try {
    const html = await client().get(`${BASE}/`, { waitInSeconds: 1 });
    const ok = /RCScrapyard/i.test(html);
    return { status: ok ? 'ok' : 'error', healthy: ok, source: 'rcscrapyard (live)' };
  } catch (err) {
    return { status: 'error', healthy: false, error: err.message };
  }
}
