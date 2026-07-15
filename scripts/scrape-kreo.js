#!/usr/bin/env node

/**
 * KRE-O Archive Scraper v3 — Multi-Phase
 * 
 * Scrape le wiki kreo.fandom.com via l'API MediaWiki pour construire
 * une archive complète des produits KRE-O (Hasbro 2011-2017).
 * 
 * Phases :
 *   1 : Templates Setbox/SetboxV2 (sets de construction)     → 77 produits ✅
 *   2 : Templates KreonboxV2/Kreonbox (figurines individuels) → ~118 Kreons
 *   3 : Catégories wiki (discovery de sets manquants)         → ~30-50 sets
 *   4 : Instructions wiki (scans des livrets)                 → ~95 sets
 * 
 * Sources :
 *   - kreo.fandom.com/api.php — templates + catégories
 * 
 * Destination :
 *   - PostgreSQL (10.20.0.10:5434) → table kreo_products
 *   - MinIO (10.20.0.10:9000) → bucket kreo-archive
 * 
 * Usage :
 *   node scripts/scrape-kreo.js                    # Toutes les phases
 *   node scripts/scrape-kreo.js --phase=2          # Phase 2 uniquement
 *   node scripts/scrape-kreo.js --phase=2 --dry-run
 *   node scripts/scrape-kreo.js --franchise=transformers
 */

import pg from 'pg';
import * as Minio from 'minio';
import https from 'https';
import http from 'http';
import { Buffer } from 'buffer';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const WIKI_API = 'https://kreo.fandom.com/api.php';
const DRY_RUN = process.argv.includes('--dry-run');
const FRANCHISE_FILTER = process.argv.find(a => a.startsWith('--franchise='))?.split('=')[1] || null;
const PHASE_FILTER = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] || null;
const PHASES_TO_RUN = PHASE_FILTER ? PHASE_FILTER.split(',').map(Number) : [1, 2, 3];
const DELAY_MS = 400; // Délai entre requêtes wiki
const IMAGE_DELAY_MS = 200; // Délai entre téléchargements d'images

// PostgreSQL
const pool = new pg.Pool({
  host: '10.20.0.10',
  port: 5434,
  database: 'mega_archive',
  user: 'megauser',
  password: 'changeme123',
  max: 5
});

// MinIO
const minio = new Minio.Client({
  endPoint: '10.20.0.10',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin123'
});
const BUCKET = 'kreo-archive';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function logError(msg) {
  console.error(`[${new Date().toISOString().slice(11, 19)}] ❌ ${msg}`);
}

/**
 * Requête HTTP GET avec gestion des redirections
 */
function httpGet(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { 
      headers: { 
        'User-Agent': 'TakoAPI-KreoScraper/1.0 (contact: nimai@snowmanprod.fr)',
        'Accept': '*/*'
      },
      timeout: 30000 
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          const u = new URL(url);
          redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
        }
        return resolve(httpGet(redirectUrl, maxRedirects - 1));
      }
      
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error(`Timeout: ${url}`)));
  });
}

/**
 * Requête vers l'API MediaWiki
 */
async function wikiApi(params) {
  const url = `${WIKI_API}?${new URLSearchParams({ format: 'json', ...params })}`;
  const data = await httpGet(url);
  return JSON.parse(data.toString());
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 : Trouver toutes les pages produit via templates
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère toutes les pages utilisant un template donné (via embeddedin)
 */
async function fetchPagesUsingTemplate(templateName) {
  const pages = [];
  let continueToken = null;
  
  do {
    const params = {
      action: 'query',
      list: 'embeddedin',
      eititle: `Template:${templateName}`,
      eilimit: '500'
    };
    if (continueToken) params.eicontinue = continueToken;
    
    const data = await wikiApi(params);
    if (data.query?.embeddedin) {
      pages.push(...data.query.embeddedin);
    }
    continueToken = data.continue?.eicontinue || null;
    
    await sleep(DELAY_MS);
  } while (continueToken);
  
  return pages;
}

/**
 * Récupère le wikitext d'une page
 */
async function fetchPageWikitext(pageTitle) {
  const data = await wikiApi({
    action: 'parse',
    page: pageTitle,
    prop: 'wikitext|images',
    redirects: '1'
  });
  return data.parse || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 : Parsing des templates
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nettoie un numéro de série wiki
 * Gère : "A2225 (2013)<br>B6425 (2016)" → "A2225"
 *         "A2235/A2205" → "A2235"
 *         "A4473)" → "A4473"
 */
function cleanSerialNumber(raw) {
  if (!raw) return null;
  
  // Supprimer les <br>, les retours à la ligne
  let cleaned = raw.replace(/<br\s*\/?>/gi, '\n').trim();
  
  // Prendre la première ligne / première partie
  cleaned = cleaned.split('\n')[0].trim();
  cleaned = cleaned.split('/')[0].trim();
  
  // Extraire le numéro propre (5 chiffres ou lettre+4-5 chiffres)
  const match = cleaned.match(/([A-Z]?\d{4,6})/i);
  if (match) return match[1].toUpperCase();
  
  // Fallback : nettoyer les parenthèses et espaces
  cleaned = cleaned.replace(/[()]/g, '').trim();
  return cleaned || null;
}

/**
 * Nettoie les Kreons (séparateur <br> → virgule)
 */
function cleanKreonsList(raw) {
  if (!raw) return null;
  return raw
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, link, display) => display || link)
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

/**
 * Parse les templates Setbox OU SetboxV2
 * Retourne un objet normalisé
 */
function parseProductTemplate(wikitext) {
  // Essayer SetboxV2 d'abord (plus complet)
  let match = wikitext.match(/\{\{SetboxV2\s*\n?([\s\S]*?)\}\}/i);
  let version = 'V2';
  
  if (!match) {
    // Essayer Setbox original
    match = wikitext.match(/\{\{Setbox\s*\n?([\s\S]*?)\}\}/i);
    version = 'V1';
  }
  
  if (!match) return null;
  
  const content = match[1];
  const raw = {};
  
  // Parse chaque paramètre |Key = Value
  // Attention: les valeurs peuvent contenir des | dans des [[liens]]
  const lines = content.split(/\|(?=[A-Za-z])/);
  for (const line of lines) {
    const eqPos = line.indexOf('=');
    if (eqPos === -1) continue;
    
    const key = line.slice(0, eqPos).trim().toLowerCase().replace(/\s+/g, '_');
    let value = line.slice(eqPos + 1).trim();
    
    if (value && value !== 'None' && value !== 'N/A' && value !== 'TBA') {
      raw[key] = value;
    }
  }
  
  // Normaliser les champs (V1 et V2 ont des noms différents)
  return {
    version,
    name: raw.name || raw.box_title || null,
    image: (raw.image || '').replace(/^File:/i, '').trim() || null,
    serial_number: raw.serial_number || null,
    franchise: raw.franchise || null,
    year: raw.year || null,
    release_date: raw.release_date || null,
    price: raw.price || null,
    piece_count: raw.number_of_pieces || raw.number || null,
    allegiance: raw.allegiance || null,
    kreons_included: raw.kreons_included || null,
    run: raw.run || null,
    caption: raw.caption || null,
    resources: raw.resources || null
  };
}

/**
 * Parse les templates KreonboxV2 OU Kreonbox (figurines individuels)
 * 
 * KreonboxV2 fields: name, image, imgsize, Serial Number, Franchise, Year,
 *   Release Date, Price, Allegiance, Included with/in, Run
 * Kreonbox fields: Box Title, Image, imagewidth, caption, Franchise, Set,
 *   Year, Code, Number, Allegiance, Resources
 */
function parseKreonTemplate(wikitext) {
  // Essayer KreonboxV2 d'abord
  let match = wikitext.match(/\{\{KreonboxV2\s*\n?([\s\S]*?)\}\}/i);
  let version = 'KV2';
  
  if (!match) {
    match = wikitext.match(/\{\{Kreonbox\s*\n?([\s\S]*?)\}\}/i);
    version = 'KV1';
  }
  
  if (!match) return null;
  
  const content = match[1];
  const raw = {};
  
  const lines = content.split(/\|(?=[A-Za-z])/);
  for (const line of lines) {
    const eqPos = line.indexOf('=');
    if (eqPos === -1) continue;
    
    const key = line.slice(0, eqPos).trim().toLowerCase().replace(/\s+/g, '_');
    let value = line.slice(eqPos + 1).trim();
    
    if (value && value !== 'None' && value !== 'N/A' && value !== 'TBA') {
      raw[key] = value;
    }
  }
  
  return {
    version,
    name: raw.name || raw.box_title || null,
    image: (raw.image || '').replace(/^File:/i, '').trim() || null,
    serial_number: raw.serial_number || null,
    code: raw.code || null,
    franchise: raw.franchise || null,
    year: raw.year || null,
    release_date: raw.release_date || null,
    price: raw.price || null,
    allegiance: raw.allegiance || null,
    included_with: raw.included_with || raw.included_in || null,
    set_info: raw.set || null,
    number: raw.number || null,
    run: raw.run || null,
    caption: raw.caption || null,
    resources: raw.resources || null
  };
}

/**
 * Génère un set_number unique pour un Kreon (évite les conflits avec les sets)
 * Format : KR{pageid} (ex: KR2109 pour Thundercracker)
 */
function generateKreonSetNumber(page, template) {
  // Essayer d'extraire un code unique du template
  if (template.code) {
    const codeMatch = template.code.match(/(\d{5,})/);
    if (codeMatch) return `KR${codeMatch[1]}`;
  }
  // Fallback : utiliser le pageid wiki
  return `KR${page.pageid}`;
}

/**
 * Récupère les pages de la catégorie wiki (avec pagination)
 */
async function fetchCategoryPages(categoryName) {
  const pages = [];
  let continueToken = null;
  
  do {
    const params = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${categoryName}`,
      cmlimit: '500',
      cmtype: 'page'
    };
    if (continueToken) params.cmcontinue = continueToken;
    
    const data = await wikiApi(params);
    if (data.query?.categorymembers) {
      pages.push(...data.query.categorymembers);
    }
    continueToken = data.continue?.cmcontinue || null;
    
    await sleep(DELAY_MS);
  } while (continueToken);
  
  return pages;
}

/**
 * Parse la description depuis le wikitext
 */
function parseDescription(wikitext) {
  // Supprimer le template principal
  const cleaned = wikitext
    .replace(/\{\{(?:Setbox|SetboxV2)[\s\S]*?\}\}/gi, '')
    .trim();
  
  const firstSection = cleaned.indexOf('==');
  let desc = firstSection > 0 ? cleaned.slice(0, firstSection).trim() : cleaned.slice(0, 500).trim();
  
  // Nettoyer le markup wiki
  desc = desc
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, link, display) => display || link)
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\]]+\]/g, '')
    .replace(/:\s*Release Date:.*$/m, '')
    .trim();
  
  return desc.length > 10 ? desc.slice(0, 1000) : null;
}

/**
 * Extraire le nom de fichier image principal
 */
function extractMainImage(template, parseData) {
  // Priorité 1: image du template
  if (template.image) return template.image;
  
  // Priorité 2: images de la page API
  if (parseData?.images) {
    const good = parseData.images.find(img => 
      img && !img.includes('Wikia') && !img.includes('Site-') && 
      /\.(jpg|jpeg|png|gif|webp)$/i.test(img)
    );
    if (good) return good;
  }
  
  return null;
}

/**
 * Détecte la franchise depuis les données
 */
function detectFranchise(template, pageTitle, wikitext) {
  const franchise = (template?.franchise || '').toLowerCase();
  const text = wikitext.toLowerCase();
  
  if (franchise.includes('transform')) return 'transformers';
  if (franchise.includes('battleship')) return 'battleship';
  if (franchise.includes('g.i.') || franchise.includes('joe')) return 'gi-joe';
  if (franchise.includes('star trek')) return 'star-trek';
  if (franchise.includes('dragon') || franchise.includes('dungeon')) return 'dungeons-dragons';
  if (franchise.includes('city')) return 'cityville';
  if (franchise.includes('troll')) return 'trolls';
  if (franchise.includes('armor')) return 'armor-hero';
  
  // Fallback sur le contenu
  if (text.includes('autobot') || text.includes('decepticon')) return 'transformers';
  if (text.includes('battleship')) return 'battleship';
  if (text.includes('cobra') || text.includes('g.i. joe')) return 'gi-joe';
  if (text.includes('starfleet') || text.includes('klingon')) return 'star-trek';
  if (text.includes('dungeon') || text.includes('d&d')) return 'dungeons-dragons';
  if (text.includes('cityville')) return 'cityville';
  
  return 'transformers'; // Default pour KRE-O
}

/**
 * Détecte la sous-ligne
 */
function detectSubLine(template, wikitext) {
  const text = (wikitext || '').toLowerCase();
  const name = (template?.name || '').toLowerCase();
  
  if (text.includes('beast hunters') || name.includes('beast hunt')) return 'Beast Hunters';
  if (text.includes('age of extinction') || name.includes('age of extinction')) return 'Age of Extinction';
  if (text.includes('quest for energon')) return 'Quest for Energon';
  if (text.includes('robots in disguise')) return 'Robots in Disguise';
  if (text.includes('micro-changer') && text.includes('combiner')) return 'Micro-Changers Combiners';
  if (text.includes('micro-changer') || text.includes('micro changer')) return 'Micro-Changers';
  if (text.includes('custom kreon')) return 'Custom Kreons';
  if (text.includes('battle changer')) return 'Battle Changers';
  if (text.includes('kreon warrior')) return 'Kreon Warriors';
  if (text.includes('into darkness')) return 'Into Darkness';
  
  return null;
}

/**
 * Détecte le type de produit
 */
function detectProductType(template, wikitext) {
  const text = (wikitext || '').toLowerCase();
  const name = (template?.name || '').toLowerCase();
  
  if (text.includes('micro-changer') && text.includes('combiner')) return 'combiner';
  if (text.includes('micro-changer') || text.includes('blind bag')) return 'micro_changer';
  if (text.includes('custom kreon')) return 'custom_kreon';
  if (text.includes('battle changer')) return 'battle_changer';
  if (text.includes('kreon warrior')) return 'kreon_warrior';
  if (name.includes('brick box') || name.includes('brick bucket')) return 'brick_box';
  
  return 'building_set';
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 : Téléchargement des images → MinIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère l'URL réelle d'une image du wiki Fandom
 */
async function getImageUrl(filename) {
  try {
    const data = await wikiApi({
      action: 'query',
      titles: `File:${filename}`,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '800'
    });
    
    const pages = data.query?.pages;
    if (!pages) return null;
    
    const page = Object.values(pages)[0];
    return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null;
  } catch {
    return null;
  }
}

/**
 * Télécharge et upload une image vers MinIO
 */
async function downloadAndUploadImage(imageUrl, objectPath) {
  if (DRY_RUN) {
    log(`   [DRY-RUN] Upload image → ${objectPath}`);
    return true;
  }
  
  try {
    const data = await httpGet(imageUrl);
    
    const contentType = imageUrl.match(/\.png/i) ? 'image/png' : 'image/jpeg';
    await minio.putObject(BUCKET, objectPath, data, data.length, {
      'Content-Type': contentType
    });
    
    return true;
  } catch (err) {
    logError(`Image download failed: ${imageUrl} → ${err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 : Insertion en BDD
// ═══════════════════════════════════════════════════════════════════════════

async function upsertProduct(product) {
  if (DRY_RUN) {
    log(`   [DRY-RUN] INSERT: ${product.set_number} — ${product.name} (${product.franchise})`);
    return;
  }
  
  const sql = `
    INSERT INTO kreo_products (
      set_number, name, franchise, sub_line, year, piece_count,
      kreons_count, kreons_included, description, price_retail,
      product_type, image_url, image_path, pdf_url, pdf_path,
      wiki_url, wiki_image_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (set_number) DO UPDATE SET
      name = EXCLUDED.name,
      franchise = EXCLUDED.franchise,
      sub_line = COALESCE(EXCLUDED.sub_line, kreo_products.sub_line),
      year = COALESCE(EXCLUDED.year, kreo_products.year),
      piece_count = COALESCE(EXCLUDED.piece_count, kreo_products.piece_count),
      kreons_count = COALESCE(EXCLUDED.kreons_count, kreo_products.kreons_count),
      kreons_included = COALESCE(EXCLUDED.kreons_included, kreo_products.kreons_included),
      description = COALESCE(EXCLUDED.description, kreo_products.description),
      price_retail = COALESCE(EXCLUDED.price_retail, kreo_products.price_retail),
      image_path = COALESCE(EXCLUDED.image_path, kreo_products.image_path),
      wiki_url = COALESCE(EXCLUDED.wiki_url, kreo_products.wiki_url),
      wiki_image_url = COALESCE(EXCLUDED.wiki_image_url, kreo_products.wiki_image_url),
      updated_at = CURRENT_TIMESTAMP
  `;
  
  await pool.query(sql, [
    product.set_number,
    product.name,
    product.franchise,
    product.sub_line,
    product.year,
    product.piece_count,
    product.kreons_count,
    product.kreons_included,
    product.description,
    product.price_retail,
    product.product_type,
    product.image_url,
    product.image_path,
    product.pdf_url,
    product.pdf_path,
    product.wiki_url,
    product.wiki_image_url
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  log('═══════════════════════════════════════════════════════════');
  log('  KRE-O Archive Scraper v3 — Multi-Phase');
  log(`  Mode: ${DRY_RUN ? 'DRY-RUN (simulation)' : 'PRODUCTION'}`);
  log(`  Phases: ${PHASES_TO_RUN.join(', ')}`);
  if (FRANCHISE_FILTER) log(`  Filtre franchise: ${FRANCHISE_FILTER}`);
  log('═══════════════════════════════════════════════════════════');
  
  // Charger les set_numbers déjà en base pour éviter les doublons
  const existingRows = await pool.query('SELECT set_number, wiki_url FROM kreo_products');
  const existingSetNumbers = new Set(existingRows.rows.map(r => r.set_number));
  const existingWikiUrls = new Set(existingRows.rows.map(r => r.wiki_url).filter(Boolean));
  log(`\n📊 Produits existants en BDD : ${existingSetNumbers.size}`);

  // ═════════════════════════════════════════════════════════════════════
  // PHASE 1 : Sets via Setbox/SetboxV2 templates
  // ═════════════════════════════════════════════════════════════════════
  if (PHASES_TO_RUN.includes(1)) {
    await runPhase1(existingSetNumbers);
  }
  
  // ═════════════════════════════════════════════════════════════════════
  // PHASE 2 : Kreons via KreonboxV2/Kreonbox templates
  // ═════════════════════════════════════════════════════════════════════
  if (PHASES_TO_RUN.includes(2)) {
    await runPhase2(existingSetNumbers, existingWikiUrls);
  }
  
  // ═════════════════════════════════════════════════════════════════════
  // PHASE 3 : Discovery via catégories wiki
  // ═════════════════════════════════════════════════════════════════════
  if (PHASES_TO_RUN.includes(3)) {
    await runPhase3(existingSetNumbers, existingWikiUrls);
  }

  // ═════════════════════════════════════════════════════════════════════
  // RÉSUMÉ FINAL
  // ═════════════════════════════════════════════════════════════════════
  if (!DRY_RUN) {
    const dbCount = await pool.query('SELECT COUNT(*) as count FROM kreo_products');
    const dbByType = await pool.query('SELECT product_type, COUNT(*) as count FROM kreo_products GROUP BY product_type ORDER BY count DESC');
    const dbByFranchise = await pool.query('SELECT franchise, COUNT(*) as count FROM kreo_products GROUP BY franchise ORDER BY count DESC');
    
    log('\n═══════════════════════════════════════════════════════════');
    log('  ÉTAT FINAL DE LA BASE');
    log('═══════════════════════════════════════════════════════════');
    log(`  Total produits : ${dbCount.rows[0].count}`);
    log('');
    log('  Par type :');
    for (const row of dbByType.rows) {
      log(`    ${row.product_type.padEnd(20)} : ${row.count}`);
    }
    log('');
    log('  Par franchise :');
    for (const row of dbByFranchise.rows) {
      log(`    ${row.franchise.padEnd(20)} : ${row.count}`);
    }
    
    let minioCount = 0;
    const stream = minio.listObjects(BUCKET, '', true);
    await new Promise((resolve, reject) => {
      stream.on('data', () => minioCount++);
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    log(`\n  Total MinIO : ${minioCount} fichiers dans ${BUCKET}`);
  }
  
  log('═══════════════════════════════════════════════════════════');
  await pool.end();
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 : Sets via templates Setbox/SetboxV2
// ═══════════════════════════════════════════════════════════════════════════

async function runPhase1(existingSetNumbers) {
  log('\n╔═══════════════════════════════════════════════════════╗');
  log('║  PHASE 1 — Setbox/SetboxV2 Templates (Building Sets) ║');
  log('╚═══════════════════════════════════════════════════════╝');
  
  const setboxPages = await fetchPagesUsingTemplate('Setbox');
  log(`   Template:Setbox    → ${setboxPages.length} pages`);
  await sleep(DELAY_MS);
  
  const setboxV2Pages = await fetchPagesUsingTemplate('SetboxV2');
  log(`   Template:SetboxV2  → ${setboxV2Pages.length} pages`);
  
  // Dédupliquer
  const pageMap = new Map();
  for (const p of [...setboxPages, ...setboxV2Pages]) {
    pageMap.set(p.pageid, p);
  }
  const productPages = [...pageMap.values()];
  log(`   Total unique : ${productPages.length} pages produit`);
  
  const stats = { processed: 0, inserted: 0, skipped: 0, errors: 0, images: 0, byFranchise: {} };
  const seenSetNumbers = new Set(existingSetNumbers);
  
  for (const page of productPages) {
    stats.processed++;
    const progress = `[P1 ${stats.processed}/${productPages.length}]`;
    
    try {
      await sleep(DELAY_MS);
      const parseData = await fetchPageWikitext(page.title);
      if (!parseData?.wikitext?.['*']) { stats.skipped++; continue; }
      
      const wikitext = parseData.wikitext['*'];
      const template = parseProductTemplate(wikitext);
      if (!template) { stats.skipped++; continue; }
      
      let setNumber = cleanSerialNumber(template.serial_number);
      if (!setNumber) { stats.skipped++; continue; }
      
      // Gestion doublons (como avant)
      if (seenSetNumbers.has(setNumber)) {
        const titleMatch = page.title.match(/\(([A-Z]?\d{4,6})\)/i);
        if (titleMatch) {
          const altNumber = titleMatch[1].toUpperCase();
          if (!seenSetNumbers.has(altNumber)) {
            setNumber = altNumber;
          } else { stats.skipped++; continue; }
        } else { stats.skipped++; continue; }
      }
      seenSetNumbers.add(setNumber);
      
      const franchise = detectFranchise(template, page.title, wikitext);
      if (FRANCHISE_FILTER && franchise !== FRANCHISE_FILTER) { stats.skipped++; continue; }
      
      const name = template.name || page.title.replace(/\s*\([^)]+\)$/, '');
      const year = template.year ? parseInt(template.year.match(/\d{4}/)?.[0]) : null;
      const pieceCount = template.piece_count ? (parseInt(template.piece_count) || null) : null;
      const subLine = detectSubLine(template, wikitext);
      const productType = detectProductType(template, wikitext);
      const description = parseDescription(wikitext);
      
      let priceRetail = null;
      if (template.price) {
        const priceMatch = template.price.match(/\$?([\d.]+)/);
        if (priceMatch) priceRetail = parseFloat(priceMatch[1]);
      }
      
      const kreonsRaw = cleanKreonsList(template.kreons_included);
      const kreonsCount = kreonsRaw ? kreonsRaw.split(',').filter(k => k.trim()).length : null;
      
      log(`${progress} ✅ ${setNumber} — ${name} (${franchise}) [${template.version}]`);
      
      // Image
      let imagePath = null;
      let wikiImageUrl = null;
      const imageFile = extractMainImage(template, parseData);
      if (imageFile) {
        const imgUrl = await getImageUrl(imageFile);
        if (imgUrl) {
          wikiImageUrl = imgUrl;
          const ext = imgUrl.match(/\.(png|jpg|jpeg|gif|webp)/i)?.[1] || 'jpg';
          imagePath = `${franchise}/${setNumber.toLowerCase()}.${ext}`;
          if (await downloadAndUploadImage(imgUrl, imagePath)) stats.images++;
          else imagePath = null;
        }
        await sleep(IMAGE_DELAY_MS);
      }
      
      await upsertProduct({
        set_number: setNumber, name, franchise, sub_line: subLine, year,
        piece_count: pieceCount, kreons_count: kreonsCount, kreons_included: kreonsRaw,
        description, price_retail: priceRetail, product_type: productType,
        image_url: null, image_path: imagePath, pdf_url: null, pdf_path: null,
        wiki_url: `https://kreo.fandom.com/wiki/${encodeURIComponent(page.title)}`,
        wiki_image_url: wikiImageUrl
      });
      stats.inserted++;
      stats.byFranchise[franchise] = (stats.byFranchise[franchise] || 0) + 1;
      
    } catch (err) {
      logError(`${progress} ${page.title}: ${err.message}`);
      stats.errors++;
    }
  }
  
  logPhaseStats('Phase 1', stats);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 : Kreons via templates KreonboxV2/Kreonbox
// ═══════════════════════════════════════════════════════════════════════════

async function runPhase2(existingSetNumbers, existingWikiUrls) {
  log('\n╔═══════════════════════════════════════════════════════════╗');
  log('║  PHASE 2 — KreonboxV2/Kreonbox Templates (Figurines)     ║');
  log('╚═══════════════════════════════════════════════════════════╝');
  
  const kv2Pages = await fetchPagesUsingTemplate('KreonboxV2');
  log(`   Template:KreonboxV2 → ${kv2Pages.length} pages`);
  await sleep(DELAY_MS);
  
  const kv1Pages = await fetchPagesUsingTemplate('Kreonbox');
  log(`   Template:Kreonbox   → ${kv1Pages.length} pages`);
  
  // Dédupliquer
  const pageMap = new Map();
  for (const p of [...kv2Pages, ...kv1Pages]) {
    pageMap.set(p.pageid, p);
  }
  const kreonPages = [...pageMap.values()];
  log(`   Total unique : ${kreonPages.length} figurines Kreon`);
  
  const stats = { processed: 0, inserted: 0, skipped: 0, errors: 0, images: 0, byFranchise: {} };
  const seenIds = new Set(existingSetNumbers);
  
  for (const page of kreonPages) {
    stats.processed++;
    const progress = `[P2 ${stats.processed}/${kreonPages.length}]`;
    
    try {
      // Vérifier si la page wiki est déjà en base
      const wikiUrl = `https://kreo.fandom.com/wiki/${encodeURIComponent(page.title)}`;
      if (existingWikiUrls.has(wikiUrl)) {
        stats.skipped++;
        continue;
      }
      
      await sleep(DELAY_MS);
      const parseData = await fetchPageWikitext(page.title);
      if (!parseData?.wikitext?.['*']) { stats.skipped++; continue; }
      
      const wikitext = parseData.wikitext['*'];
      const template = parseKreonTemplate(wikitext);
      if (!template) {
        log(`${progress} ⚠ ${page.title} — pas de template Kreonbox trouvé`);
        stats.skipped++;
        continue;
      }
      
      // Générer un identifiant unique pour ce Kreon
      const setNumber = generateKreonSetNumber(page, template);
      if (seenIds.has(setNumber)) { stats.skipped++; continue; }
      seenIds.add(setNumber);
      
      // Détections
      const franchise = detectFranchise(template, page.title, wikitext);
      if (FRANCHISE_FILTER && franchise !== FRANCHISE_FILTER) { stats.skipped++; continue; }
      
      const name = template.name || page.title.replace(/\s*\([^)]+\)$/, '');
      const yearRaw = template.year;
      const year = yearRaw ? parseInt(yearRaw.match(/\d{4}/)?.[0]) : null;
      const subLine = detectKreonSubLine(template, wikitext);
      const description = parseDescription(wikitext);
      
      // Prix (certains KreonboxV2 ont un prix)
      let priceRetail = null;
      if (template.price) {
        const priceMatch = template.price.match(/\$?([\d.]+)/);
        if (priceMatch) priceRetail = parseFloat(priceMatch[1]);
      }
      
      // Allégeance → description enrichie
      const allegiance = template.allegiance || null;
      const includedWith = template.included_with || template.set_info || null;
      let enrichedDesc = description || '';
      if (allegiance) enrichedDesc = `Allegiance: ${allegiance}. ${enrichedDesc}`;
      if (includedWith) enrichedDesc = `${enrichedDesc} Included with: ${includedWith}`.trim();
      enrichedDesc = enrichedDesc.trim() || null;
      
      log(`${progress} ✅ ${setNumber} — ${name} (${franchise}/${allegiance || '?'}) [${template.version}]`);
      
      // Image
      let imagePath = null;
      let wikiImageUrl = null;
      const imageFile = template.image || extractMainImage({}, parseData);
      if (imageFile) {
        const imgUrl = await getImageUrl(imageFile);
        if (imgUrl) {
          wikiImageUrl = imgUrl;
          const ext = imgUrl.match(/\.(png|jpg|jpeg|gif|webp)/i)?.[1] || 'jpg';
          imagePath = `kreons/${setNumber.toLowerCase()}.${ext}`;
          if (await downloadAndUploadImage(imgUrl, imagePath)) stats.images++;
          else imagePath = null;
        }
        await sleep(IMAGE_DELAY_MS);
      }
      
      await upsertProduct({
        set_number: setNumber, name, franchise, sub_line: subLine, year,
        piece_count: null, kreons_count: 1, kreons_included: name,
        description: enrichedDesc, price_retail: priceRetail,
        product_type: 'kreon',
        image_url: null, image_path: imagePath, pdf_url: null, pdf_path: null,
        wiki_url: wikiUrl, wiki_image_url: wikiImageUrl
      });
      stats.inserted++;
      stats.byFranchise[franchise] = (stats.byFranchise[franchise] || 0) + 1;
      
    } catch (err) {
      logError(`${progress} ${page.title}: ${err.message}`);
      stats.errors++;
    }
  }
  
  logPhaseStats('Phase 2', stats);
}

/**
 * Sous-ligne spécifique pour les Kreons
 */
function detectKreonSubLine(template, wikitext) {
  const text = (wikitext || '').toLowerCase();
  const setInfo = (template.set_info || template.included_with || '').toLowerCase();
  
  // Combiners
  if (text.includes('combiner') && text.includes('micro')) return 'Micro-Changers Combiners';
  // Micro-Changers
  if (text.includes('micro-changer') || text.includes('micro changer') ||
      setInfo.includes('micro-changer')) return 'Micro-Changers';
  // Custom Kreons
  if (text.includes('custom kreon') || setInfo.includes('custom')) return 'Custom Kreons';
  // Battle Changers
  if (text.includes('battle changer')) return 'Battle Changers';
  // Kreon Warriors
  if (text.includes('kreon warrior')) return 'Kreon Warriors';
  // Beast Hunters
  if (text.includes('beast hunters')) return 'Beast Hunters';
  // Age of Extinction
  if (text.includes('age of extinction')) return 'Age of Extinction';
  // Preview Series
  if (text.includes('preview series')) return 'Micro-Changers Preview';
  // Into Darkness (Star Trek)
  if (text.includes('into darkness')) return 'Into Darkness';
  // GI Joe
  if (text.includes('g.i. joe') || text.includes('gi joe')) return 'G.I. Joe';
  // Battleship
  if (text.includes('battleship')) return 'Battleship';
  
  return detectSubLine(template, wikitext);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 : Discovery via catégories wiki
// ═══════════════════════════════════════════════════════════════════════════

async function runPhase3(existingSetNumbers, existingWikiUrls) {
  log('\n╔═══════════════════════════════════════════════════════════╗');
  log('║  PHASE 3 — Category Discovery (Sets manquants)           ║');
  log('╚═══════════════════════════════════════════════════════════╝');
  
  // Recharger les URLs wiki en base (Phase 1+2 ont pu ajouter des entrées)
  const freshRows = await pool.query('SELECT set_number, wiki_url, name FROM kreo_products');
  const knownWikiUrls = new Set(freshRows.rows.map(r => r.wiki_url).filter(Boolean));
  const knownSetNumbers = new Set(freshRows.rows.map(r => r.set_number));
  const knownNames = new Set(freshRows.rows.map(r => r.name?.toLowerCase()).filter(Boolean));
  log(`   Déjà en base : ${knownWikiUrls.size} pages wiki connues`);
  
  // Catégories à priorité pour franchises manquantes
  const categories = [
    { name: 'Battleship', franchise: 'battleship' },
    { name: 'G.I. Joe', franchise: 'gi-joe' },
    { name: 'Star Trek', franchise: 'star-trek' },
    { name: 'CityVille Invasion', franchise: 'cityville' },
    { name: 'Building Sets', franchise: null },   // franchise à détecter
    { name: 'Dungeons & Dragons', franchise: 'dungeons-dragons' },
  ];
  
  const stats = { processed: 0, inserted: 0, skipped: 0, errors: 0, images: 0, byFranchise: {} };
  const seenIds = new Set(knownSetNumbers);
  
  // Pages d'instructions et pages spéciales à exclure
  const excludePatterns = [
    /^Instructions /i,
    /^Category:/i,
    /^Template:/i,
    /^Transformers Instructions$/i,
    /^Star Trek Instructions$/i,
    /^Boxes and Buckets$/i,
    /^Dungeons & Dragons Instructions$/i,
    /^News & Rumors$/i,
    /^STAR TREK Stop Motion/i,
    /^Kre-O Wallpapers$/i,
    /^Kre-O Japan$/i,
    /^Think Like A Kreon$/i,
    /^G\.I\. Joe Sets$/i,
    /^G\.I\. Joe Kreons$/i,
    /^G\.I\. Joe$/i,
    /^Star Trek Sets$/i,
    /^Star Trek Kreons$/i,
    /^Star Trek$/i,
    /^Battleship Sets$/i,
    /^Battleship$/i,
    /^Transformers$/i,
    /^Dungeons & Dragons$/i,
    /^CityVille Invasion$/i,
    /^Cityville Invasion Building Sets$/i,
    /^Kreon Warriors$/i,
    /^Kreon Mini-con Combiners$/i,
    /^Construction Commandos$/i,
    /^Micro Build Ships$/i,
    /^Blind Bag$/i,
    /^NYCC.*Souvenir/i,
    / Sets$/i,         // Any "X Sets" listing pages
  ];
  
  for (const cat of categories) {
    log(`\n   📂 Category:${cat.name}...`);
    const pages = await fetchCategoryPages(cat.name);
    log(`      ${pages.length} pages trouvées`);
    
    let newPages = 0;
    for (const page of pages) {
      // Exclure les pages spéciales
      if (excludePatterns.some(p => p.test(page.title))) continue;
      // Exclure les sous-catégories
      if (page.ns && page.ns !== 0) continue;
      
      const wikiUrl = `https://kreo.fandom.com/wiki/${encodeURIComponent(page.title)}`;
      if (knownWikiUrls.has(wikiUrl)) continue;
      
      stats.processed++;
      const progress = `[P3 ${stats.processed}]`;
      
      try {
        await sleep(DELAY_MS);
        const parseData = await fetchPageWikitext(page.title);
        if (!parseData?.wikitext?.['*']) { stats.skipped++; continue; }
        
        const wikitext = parseData.wikitext['*'];
        
        // Tenter de parser un template Setbox/SetboxV2 (certaines pages en ont)
        let template = parseProductTemplate(wikitext);
        let productType = 'building_set';
        let setNumber = null;
        let name = null;
        let year = null;
        let pieceCount = null;
        let subLine = null;
        let kreonsRaw = null;
        let kreonsCount = null;
        let priceRetail = null;
        let franchise = cat.franchise;
        
        if (template) {
          // Page avec template Setbox
          setNumber = cleanSerialNumber(template.serial_number);
          name = template.name || page.title.replace(/\s*\([^)]+\)$/, '');
          year = template.year ? parseInt(template.year.match(/\d{4}/)?.[0]) : null;
          pieceCount = template.piece_count ? (parseInt(template.piece_count) || null) : null;
          subLine = detectSubLine(template, wikitext);
          productType = detectProductType(template, wikitext);
          kreonsRaw = cleanKreonsList(template.kreons_included);
          kreonsCount = kreonsRaw ? kreonsRaw.split(',').filter(k => k.trim()).length : null;
          if (template.price) {
            const pm = template.price.match(/\$?([\d.]+)/);
            if (pm) priceRetail = parseFloat(pm[1]);
          }
          franchise = franchise || detectFranchise(template, page.title, wikitext);
        } else {
          // Tenter KreonboxV2/Kreonbox
          const kreonTpl = parseKreonTemplate(wikitext);
          if (kreonTpl) {
            productType = 'kreon';
            name = kreonTpl.name || page.title.replace(/\s*\([^)]+\)$/, '');
            year = kreonTpl.year ? parseInt(kreonTpl.year.match(/\d{4}/)?.[0]) : null;
            subLine = detectKreonSubLine(kreonTpl, wikitext);
            franchise = franchise || detectFranchise(kreonTpl, page.title, wikitext);
            if (kreonTpl.price) {
              const pm = kreonTpl.price.match(/\$?([\d.]+)/);
              if (pm) priceRetail = parseFloat(pm[1]);
            }
          } else {
            // Page sans template structuré — extraire les données du texte
            name = page.title.replace(/\s*\([^)]+\)$/, '');
            franchise = franchise || detectFranchise({}, page.title, wikitext);
            productType = detectProductType({}, wikitext);
          }
        }
        
        // Déterminer le set_number
        if (!setNumber) {
          // Essayer depuis le titre de la page : "Air Raid (A2226)"
          const titleMatch = page.title.match(/\(([A-Z]?\d{4,6})\)/i);
          if (titleMatch) {
            setNumber = titleMatch[1].toUpperCase();
          } else {
            setNumber = `WK${page.pageid}`; // Wiki-sourced Key
          }
        }
        
        // Vérifier doublon par nom (ex: même set, page wiki différente)
        if (seenIds.has(setNumber)) { stats.skipped++; continue; }
        if (knownNames.has(name?.toLowerCase())) {
          log(`${progress} ⏭ ${page.title} — "${name}" déjà en base (nom identique)`);
          stats.skipped++;
          continue;
        }
        seenIds.add(setNumber);
        
        if (FRANCHISE_FILTER && franchise !== FRANCHISE_FILTER) { stats.skipped++; continue; }
        
        const description = parseDescription(wikitext);
        
        log(`${progress} ✅ ${setNumber} — ${name} (${franchise}/${productType}) [NEW from ${cat.name}]`);
        newPages++;
        
        // Image
        let imagePath = null;
        let wikiImageUrl = null;
        const imageFile = extractMainImage(template || {}, parseData);
        if (imageFile) {
          const imgUrl = await getImageUrl(imageFile);
          if (imgUrl) {
            wikiImageUrl = imgUrl;
            const ext = imgUrl.match(/\.(png|jpg|jpeg|gif|webp)/i)?.[1] || 'jpg';
            const typeDir = productType === 'kreon' ? 'kreons' : franchise;
            imagePath = `${typeDir}/${setNumber.toLowerCase()}.${ext}`;
            if (await downloadAndUploadImage(imgUrl, imagePath)) stats.images++;
            else imagePath = null;
          }
          await sleep(IMAGE_DELAY_MS);
        }
        
        await upsertProduct({
          set_number: setNumber, name, franchise, sub_line: subLine, year,
          piece_count: pieceCount, kreons_count: kreonsCount, kreons_included: kreonsRaw,
          description, price_retail: priceRetail, product_type: productType,
          image_url: null, image_path: imagePath, pdf_url: null, pdf_path: null,
          wiki_url: wikiUrl, wiki_image_url: wikiImageUrl
        });
        stats.inserted++;
        stats.byFranchise[franchise] = (stats.byFranchise[franchise] || 0) + 1;
        
        // Ajouter dans les sets connus
        knownWikiUrls.add(wikiUrl);
        if (name) knownNames.add(name.toLowerCase());
        
      } catch (err) {
        logError(`${progress} ${page.title}: ${err.message}`);
        stats.errors++;
      }
    }
    
    log(`      → ${newPages} nouvelles pages traitées`);
  }
  
  logPhaseStats('Phase 3', stats);
}

/**
 * Affiche les stats d'une phase
 */
function logPhaseStats(phaseName, stats) {
  log(`\n  ── ${phaseName} ──`);
  log(`  Traités  : ${stats.processed}`);
  log(`  Insérés  : ${stats.inserted}`);
  log(`  Ignorés  : ${stats.skipped}`);
  log(`  Erreurs  : ${stats.errors}`);
  log(`  Images   : ${stats.images}`);
  if (Object.keys(stats.byFranchise).length > 0) {
    log('  Par franchise :');
    for (const [f, c] of Object.entries(stats.byFranchise).sort((a, b) => b[1] - a[1])) {
      log(`    ${f.padEnd(20)} : ${c}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
