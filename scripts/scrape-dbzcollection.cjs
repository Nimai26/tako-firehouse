#!/usr/bin/env node
/**
 * Scraper dbzcollection.fr → PostgreSQL + Filesystem
 * 
 * Scrape les cartes Dragon Ball depuis dbzcollection.fr et les insère
 * dans les tables carddass_* existantes (avec source_site='dbzcollection').
 * 
 * Architecture identique à animecollection.fr (même créateur, même PHP/AJAX).
 * Différences clés :
 *   - Pas de niveau "licence" (tout est Dragon Ball)
 *   - Miniatures h50 (au lieu de h100)
 *   - HD h400 (au lieu de h3000)
 *   - Endpoints dans traitements_ajax/ (GET)
 * 
 * Usage:
 *   node scripts/scrape-dbzcollection.js [--phase=1|2|3|all] [--collection=ID] [--resume]
 * 
 * Phases:
 *   1 = Catalogue (collections + séries) → DB
 *   2 = Cartes (détails + enrichissement) → DB
 *   3 = Images (téléchargement HD + miniatures) → Filesystem
 *   all = Tout (défaut)
 */

const pg = require('pg');
const { ProxyAgent } = require('undici');
const { writeFileSync, mkdirSync, existsSync, createWriteStream, readFileSync } = require('fs');
const { join, dirname } = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

// Proxy agent pour router tout via Gluetun VPN
const proxyAgent = new ProxyAgent('http://localhost:8889');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  baseUrl: 'http://www.dbzcollection.fr/2v2',
  ajaxBase: 'http://www.dbzcollection.fr/2v2/traitements_ajax',
  proxy: 'http://localhost:8889',
  
  db: {
    host: '172.21.0.2',
    port: 5432,
    database: 'tako_cache',
    user: 'tako',
    password: 'changeme',
  },
  
  storage: '/mnt/egon/websites/tako-storage/carddass-archive',
  sourceSite: 'dbzcollection',
  licenseName: 'Dragon Ball',
  licenseSourceId: 9999, // High ID to avoid collision with animecollection (max=80)
  
  // Rate limiting
  delayMs: 250,        // Between AJAX requests
  imageDelayMs: 100,   // Between image downloads
  batchSize: 50,       // Cards per batch for DB inserts
  
  // Progress file
  progressFile: '/tmp/dbzcollection-scrape-progress.json',
};

// ============================================================================
// HELPERS
// ============================================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let requestCount = 0;
let errorCount = 0;
let startTime = Date.now();

function log(level, msg) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const prefix = { info: '📋', warn: '⚠️', error: '❌', ok: '✅', img: '🖼️', db: '💾' }[level] || '•';
  console.log(`[${elapsed}s] ${prefix} ${msg}`);
}

/**
 * Fetch via VPN proxy with retry logic
 */
async function fetchViaProxy(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      requestCount++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      const resp = await fetch(url, {
        signal: controller.signal,
        dispatcher: proxyAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': `${CONFIG.baseUrl}/index.php`,
        },
      });
      clearTimeout(timeout);
      
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} for ${url}`);
      }
      return resp;
    } catch (err) {
      if (attempt === retries) {
        errorCount++;
        throw err;
      }
      log('warn', `Attempt ${attempt}/${retries} failed for ${url}: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

async function fetchText(url) {
  const resp = await fetchViaProxy(url);
  const buf = await resp.arrayBuffer();
  // Site uses ISO-8859-1 encoding
  return new TextDecoder('iso-8859-1').decode(buf);
}

async function fetchBinary(url) {
  const resp = await fetchViaProxy(url);
  return resp;
}

function htmlDecode(str) {
  if (!str) return str;
  return str
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
    .replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô').replace(/&ucirc;/g, 'û')
    .replace(/&iuml;/g, 'ï').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
    .replace(/&ccedil;/g, 'ç').replace(/&deg;/g, '°').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&Eacute;/g, 'É').replace(/&Egrave;/g, 'È')
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"').replace(/&ldquo;/g, '"')
    .replace(/&hellip;/g, '…').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .trim();
}

// Progress tracking
function saveProgress(phase, data) {
  try {
    let progress = {};
    if (existsSync(CONFIG.progressFile)) {
      progress = JSON.parse(readFileSync(CONFIG.progressFile, 'utf8'));
    }
    progress[phase] = { ...data, timestamp: new Date().toISOString() };
    writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2));
  } catch (e) { /* ignore */ }
}

function loadProgress(phase) {
  try {
    if (existsSync(CONFIG.progressFile)) {
      const progress = JSON.parse(readFileSync(CONFIG.progressFile, 'utf8'));
      return progress[phase] || null;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ============================================================================
// DATABASE
// ============================================================================

let pool = null;

async function initDb() {
  pool = new pg.Pool({
    ...CONFIG.db,
    max: 5,
    idleTimeoutMillis: 60000,
  });
  const client = await pool.connect();
  const res = await client.query('SELECT NOW()');
  client.release();
  log('db', `PostgreSQL connecté (${res.rows[0].now})`);
  return pool;
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function queryOne(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

async function closeDb() {
  if (pool) await pool.end();
}

// ============================================================================
// PHASE 1 : CATALOGUE (Collections + Séries)
// ============================================================================

async function phase1_catalogue(resumeFrom = null) {
  log('info', '═══════════════════════════════════════════');
  log('info', 'PHASE 1 : Scraping du catalogue');
  log('info', '═══════════════════════════════════════════');
  
  // Step 1: Ensure Dragon Ball license exists
  const licenseRow = await queryOne(
    `INSERT INTO carddass_licenses (source_id, name, description, source_site)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_id, source_site) DO UPDATE SET name = $2, updated_at = NOW()
     RETURNING id`,
    [CONFIG.licenseSourceId, CONFIG.licenseName, 'Cartes Dragon Ball archivées depuis dbzcollection.fr (~27 000+ cartes, 336 collections)', CONFIG.sourceSite]
  );
  const licenseId = licenseRow.id;
  log('ok', `Licence "${CONFIG.licenseName}" → id=${licenseId}`);
  
  // Step 2: Fetch main page to extract all collections
  log('info', 'Chargement page principale...');
  const mainHtml = await fetchText(`${CONFIG.baseUrl}/index.php`);
  await sleep(CONFIG.delayMs);
  
  // Extract collections from <select id="collection">
  const selectMatch = mainHtml.match(/<select[^>]*id="collection"[^>]*>([\s\S]*?)<\/select>/);
  if (!selectMatch) throw new Error('Select collection non trouvé dans le HTML');
  
  const collectionOptions = [...selectMatch[1].matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)];
  log('info', `${collectionOptions.length} collections trouvées`);
  
  let collectionsInserted = 0;
  let seriesInserted = 0;
  const collectionsDone = resumeFrom?.collectionsDone || [];
  
  for (const [, sourceId, rawName] of collectionOptions) {
    const colSourceId = parseInt(sourceId);
    const colName = htmlDecode(rawName);
    
    if (collectionsDone.includes(colSourceId)) {
      continue; // Skip if resume
    }
    
    // Insert collection
    const colRow = await queryOne(
      `INSERT INTO carddass_collections (source_id, license_id, name, source_site)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (source_id, license_id, source_site) DO UPDATE SET name = $3, updated_at = NOW()
       RETURNING id`,
      [colSourceId, licenseId, colName, CONFIG.sourceSite]
    );
    const collectionInternalId = colRow.id;
    collectionsInserted++;
    
    // Fetch series for this collection
    const seriesHtml = await fetchText(
      `${CONFIG.ajaxBase}/get_liste_series_collection.php?idc=${colSourceId}`
    );
    await sleep(CONFIG.delayMs);
    
    const seriesOptions = [...seriesHtml.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)];
    
    for (const [, serSourceId, rawSerName] of seriesOptions) {
      const serName = htmlDecode(rawSerName);
      await query(
        `INSERT INTO carddass_series (source_id, collection_id, license_source_id, collection_source_id, name, source_site)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (source_id, collection_id, source_site) DO UPDATE SET name = $5, updated_at = NOW()`,
        [parseInt(serSourceId), collectionInternalId, CONFIG.licenseSourceId, colSourceId, serName, CONFIG.sourceSite]
      );
      seriesInserted++;
    }
    
    log('ok', `Collection ${collectionsInserted}/${collectionOptions.length}: "${colName}" (${colSourceId}) → ${seriesOptions.length} séries`);
    
    collectionsDone.push(colSourceId);
    saveProgress('phase1', { collectionsDone, collectionsInserted, seriesInserted });
  }
  
  log('ok', `Phase 1 terminée: ${collectionsInserted} collections, ${seriesInserted} séries`);
  return { collectionsInserted, seriesInserted };
}

// ============================================================================
// PHASE 2 : CARTES (Détails + Enrichissement)
// ============================================================================

async function phase2_cards(targetCollectionId = null, resumeFrom = null) {
  log('info', '═══════════════════════════════════════════');
  log('info', 'PHASE 2 : Scraping des cartes');
  log('info', '═══════════════════════════════════════════');
  
  // Get all collections to scrape
  let collectionFilter = `WHERE c.source_site = $1`;
  const params = [CONFIG.sourceSite];
  
  if (targetCollectionId) {
    collectionFilter += ` AND c.source_id = $2`;
    params.push(targetCollectionId);
  }
  
  const collections = (await pool.query(
    `SELECT c.id, c.source_id, c.name FROM carddass_collections c ${collectionFilter} ORDER BY c.source_id`,
    params
  )).rows;
  
  log('info', `${collections.length} collections à traiter`);
  
  let totalCards = 0;
  let totalExtras = 0;
  const collectionsDone = resumeFrom?.collectionsDone || [];
  
  for (let ci = 0; ci < collections.length; ci++) {
    const col = collections[ci];
    
    if (collectionsDone.includes(col.source_id)) continue;
    
    // Fetch all card IDs for this collection
    const cardsText = await fetchText(
      `${CONFIG.ajaxBase}/get_liste_cartes.php?numero=&idc=${col.source_id}&idtc=&nom=&nature=&prix_appel=&nc=&pa=&phase=&caracteristiques=&pouvoir=`
    );
    await sleep(CONFIG.delayMs);
    
    // Parse card IDs from format: @@{idc}/{ids}/h50_{cardId}-{idc}/{ids}/h50_{cardId}-...
    const aaSection = cardsText.split('@@')[1];
    if (!aaSection) {
      log('warn', `Pas de cartes pour collection "${col.name}" (${col.source_id})`);
      collectionsDone.push(col.source_id);
      continue;
    }
    
    const cardEntries = aaSection.split('-').filter(e => e.trim());
    const parsedCards = cardEntries.map(entry => {
      const match = entry.match(/(\d+)\/(\d+)\/h50_(\d+)/);
      if (!match) return null;
      return { collectionSourceId: parseInt(match[1]), seriesSourceId: parseInt(match[2]), cardId: parseInt(match[3]) };
    }).filter(Boolean);
    
    log('info', `Collection ${ci + 1}/${collections.length}: "${col.name}" (${col.source_id}) → ${parsedCards.length} cartes`);
    
    // Process cards in batches
    for (let i = 0; i < parsedCards.length; i += CONFIG.batchSize) {
      const batch = parsedCards.slice(i, i + CONFIG.batchSize);
      
      for (const card of batch) {
        try {
          await processCard(card, col);
          totalCards++;
        } catch (err) {
          log('error', `Carte ${card.cardId}: ${err.message}`);
        }
        await sleep(CONFIG.delayMs);
      }
      
      log('info', `  ... ${Math.min(i + CONFIG.batchSize, parsedCards.length)}/${parsedCards.length} cartes traitées`);
    }
    
    collectionsDone.push(col.source_id);
    saveProgress('phase2', { collectionsDone, totalCards, totalExtras });
  }
  
  log('ok', `Phase 2 terminée: ${totalCards} cartes, ${totalExtras} images supplémentaires`);
  return { totalCards, totalExtras };
}

async function processCard(card, collection) {
  // Resolve series internal ID
  const series = await queryOne(
    `SELECT id, source_id, name FROM carddass_series 
     WHERE source_id = $1 AND collection_id = $2 AND source_site = $3`,
    [card.seriesSourceId, collection.id, CONFIG.sourceSite]
  );
  
  if (!series) {
    // Series might not exist yet (if phase 1 missed it). Insert it.
    const serResult = await queryOne(
      `INSERT INTO carddass_series (source_id, collection_id, license_source_id, collection_source_id, name, source_site)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source_id, collection_id, source_site) DO UPDATE SET updated_at = NOW()
       RETURNING id, source_id, name`,
      [card.seriesSourceId, collection.id, CONFIG.licenseSourceId, card.collectionSourceId, `Series ${card.seriesSourceId}`, CONFIG.sourceSite]
    );
    card._seriesId = serResult.id;
    card._seriesSourceId = serResult.source_id;
  } else {
    card._seriesId = series.id;
    card._seriesSourceId = series.source_id;
  }
  
  // Fetch card details
  const detailHtml = await fetchText(
    `${CONFIG.ajaxBase}/get_infos_detail_carte.php?id=${card.cardId}`
  );
  
  // Parse detail fields
  const fields = {};
  const fieldMatches = [...detailHtml.matchAll(/apercu_td_intitule[^>]*>([^<]+)<\/td>[\s\S]*?apercu_td_valeur[^>]*>([\s\S]*?)<\/td>/g)];
  for (const [, rawKey, rawVal] of fieldMatches) {
    const key = htmlDecode(rawKey).replace(/\s*:\s*$/, '').toLowerCase();
    const val = htmlDecode(rawVal.replace(/<[^>]+>/g, '').trim());
    fields[key] = val;
  }
  
  const cardNumber = fields['numéro'] || fields['numero'] || `#${card.cardId}`;
  const rarity = fields['rareté'] || fields['rarete'] || null;
  const cardName = fields['nom'] || null;
  
  // Image URLs
  const thumbUrl = `${CONFIG.baseUrl}/cartes/${card.collectionSourceId}/${card.seriesSourceId}/h50_${card.cardId}_carte.jpg`;
  const hdUrl = `${CONFIG.baseUrl}/cartes/${card.collectionSourceId}/${card.seriesSourceId}/h400_${card.cardId}_carte.jpg`;
  
  // Storage paths
  const thumbPath = `${CONFIG.storage}/cards/${card.collectionSourceId}/${card.seriesSourceId}/h50_${card.cardId}_carte.jpg`;
  const hdPath = `${CONFIG.storage}/cards/${card.collectionSourceId}/${card.seriesSourceId}/h400_${card.cardId}_carte.jpg`;
  
  // Get license and collection names
  const licenseName = CONFIG.licenseName;
  const collectionName = collection.name;
  const seriesName = (series || {}).name || fields['série'] || fields['serie'] || `Series ${card.seriesSourceId}`;
  
  // Insert card
  await query(
    `INSERT INTO carddass_cards 
       (source_id, series_id, card_number, rarity, rarity_color,
        image_url_thumb, image_url_hd, image_path_thumb, image_path_hd,
        license_name, collection_name, series_name, source_site)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (source_id, source_site) DO UPDATE SET
       card_number = $3, rarity = $4, image_url_hd = $7,
       image_path_thumb = $8, image_path_hd = $9,
       license_name = $10, collection_name = $11, series_name = $12,
       updated_at = NOW()`,
    [card.cardId, card._seriesId, cardNumber, rarity, null,
     thumbUrl, hdUrl, thumbPath, hdPath,
     licenseName, collectionName, seriesName, CONFIG.sourceSite]
  );
  
  // Check for extra images in the detail
  const extraMatches = [...detailHtml.matchAll(/afficher_detail_img\('(\d+)','([^']+)','(\d+)'\)/g)];
  for (const [, imgId, imgPath, parentCardId] of extraMatches) {
    const label = detailHtml.match(new RegExp(`${imgId}[^>]*>([^<]+)`));
    const imgLabel = label ? htmlDecode(label[1]) : null;
    
    const imgThumbPath = `${CONFIG.storage}/cards/${card.collectionSourceId}/${card.seriesSourceId}/${card.cardId}/h50_${imgId}_carte_image.jpg`;
    const imgHdPath = `${CONFIG.storage}/cards/${card.collectionSourceId}/${card.seriesSourceId}/${card.cardId}/h400_${imgId}_carte_image.jpg`;
    const imgThumbUrl = `${CONFIG.baseUrl}/cartes/${card.collectionSourceId}/${card.seriesSourceId}/${card.cardId}/h50_${imgId}_carte_image.jpg`;
    const imgHdUrl = `${CONFIG.baseUrl}/cartes/${card.collectionSourceId}/${card.seriesSourceId}/${card.cardId}/h400_${imgId}_carte_image.jpg`;
    
    // Get the internal card ID
    const cardRow = await queryOne(
      'SELECT id FROM carddass_cards WHERE source_id = $1 AND source_site = $2',
      [card.cardId, CONFIG.sourceSite]
    );
    
    if (cardRow) {
      await query(
        `INSERT INTO carddass_extra_images 
           (source_id, card_id, label, image_url_thumb, image_url_hd, image_path_thumb, image_path_hd, source_site)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_id, source_site) DO NOTHING`,
        [parseInt(imgId), cardRow.id, imgLabel, imgThumbUrl, imgHdUrl, imgThumbPath, imgHdPath, CONFIG.sourceSite]
      );
    }
  }
}

// ============================================================================
// PHASE 3 : IMAGES (Téléchargement)
// ============================================================================

async function phase3_images(resumeFrom = null) {
  log('info', '═══════════════════════════════════════════');
  log('info', 'PHASE 3 : Téléchargement des images');
  log('info', '═══════════════════════════════════════════');
  
  // Get all cards that need images downloaded
  const cards = (await pool.query(
    `SELECT source_id, image_url_thumb, image_url_hd, image_path_thumb, image_path_hd
     FROM carddass_cards WHERE source_site = $1 ORDER BY source_id`,
    [CONFIG.sourceSite]
  )).rows;
  
  log('info', `${cards.length} cartes à traiter pour les images`);
  
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  const startFrom = resumeFrom?.lastCardSourceId || 0;
  
  for (const card of cards) {
    if (card.source_id <= startFrom) {
      skipped++;
      continue;
    }
    
    // Download HD image
    if (card.image_path_hd && card.image_url_hd) {
      try {
        await downloadImage(card.image_url_hd, card.image_path_hd);
        downloaded++;
      } catch (err) {
        errors++;
        if (errors % 100 === 0) log('error', `${errors} erreurs de téléchargement`);
      }
    }
    
    // Download thumbnail
    if (card.image_path_thumb && card.image_url_thumb) {
      try {
        await downloadImage(card.image_url_thumb, card.image_path_thumb);
      } catch (err) {
        // Non-fatal for thumbnails
      }
    }
    
    await sleep(CONFIG.imageDelayMs);
    
    if (downloaded % 500 === 0 && downloaded > 0) {
      log('img', `${downloaded} images téléchargées, ${skipped} skippées, ${errors} erreurs`);
      saveProgress('phase3', { lastCardSourceId: card.source_id, downloaded, skipped, errors });
    }
  }
  
  // Also download extra images
  const extras = (await pool.query(
    `SELECT source_id, image_url_thumb, image_url_hd, image_path_thumb, image_path_hd
     FROM carddass_extra_images WHERE source_site = $1 ORDER BY source_id`,
    [CONFIG.sourceSite]
  )).rows;
  
  log('info', `${extras.length} images supplémentaires à traiter`);
  
  let extraDownloaded = 0;
  for (const img of extras) {
    if (img.image_path_hd && img.image_url_hd) {
      try {
        await downloadImage(img.image_url_hd, img.image_path_hd);
        extraDownloaded++;
      } catch (err) { /* skip */ }
    }
    if (img.image_path_thumb && img.image_url_thumb) {
      try {
        await downloadImage(img.image_url_thumb, img.image_path_thumb);
      } catch (err) { /* skip */ }
    }
    await sleep(CONFIG.imageDelayMs);
    
    if (extraDownloaded % 500 === 0 && extraDownloaded > 0) {
      log('img', `${extraDownloaded} images supplémentaires téléchargées`);
    }
  }
  
  log('ok', `Phase 3 terminée: ${downloaded} images cartes + ${extraDownloaded} extras (${errors} erreurs)`);
  return { downloaded, extraDownloaded, errors };
}

async function downloadImage(url, destPath) {
  // Skip if already exists
  if (existsSync(destPath)) return;
  
  // Ensure directory exists
  const dir = dirname(destPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  const resp = await fetchBinary(url);
  const fileStream = createWriteStream(destPath);
  await pipeline(Readable.fromWeb(resp.body), fileStream);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find(a => a.startsWith('--phase='))?.split('=')[1] || 'all';
  const collectionId = args.find(a => a.startsWith('--collection='))?.split('=')[1];
  const resume = args.includes('--resume');
  
  log('info', '╔═══════════════════════════════════════════════╗');
  log('info', '║   dbzcollection.fr → Tako API Scraper         ║');
  log('info', '║   ~27 000 cartes Dragon Ball                  ║');
  log('info', '╚═══════════════════════════════════════════════╝');
  log('info', `Phase: ${phase} | Collection: ${collectionId || 'toutes'} | Resume: ${resume}`);
  
  // Test VPN proxy
  try {
    const vpnResp = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(10000),
      dispatcher: proxyAgent,
    });
    const vpnIp = await vpnResp.json();
    log('info', `VPN IP: ${vpnIp.ip}`);
    if (vpnIp.ip === '82.64.251.170') {
      log('error', 'VPN NON ACTIF — IP Labo détectée ! Abandon.');
      process.exit(1);
    }
  } catch (e) {
    log('warn', `Impossible de vérifier IP VPN: ${e.message}`);
  }
  
  await initDb();
  
  try {
    const results = {};
    
    if (phase === 'all' || phase === '1') {
      const resumeData = resume ? loadProgress('phase1') : null;
      results.phase1 = await phase1_catalogue(resumeData);
    }
    
    if (phase === 'all' || phase === '2') {
      const resumeData = resume ? loadProgress('phase2') : null;
      results.phase2 = await phase2_cards(
        collectionId ? parseInt(collectionId) : null,
        resumeData
      );
    }
    
    if (phase === 'all' || phase === '3') {
      const resumeData = resume ? loadProgress('phase3') : null;
      results.phase3 = await phase3_images(resumeData);
    }
    
    log('ok', '═══════════════════════════════════════════');
    log('ok', 'SCRAPING TERMINÉ');
    log('ok', `Requêtes: ${requestCount} | Erreurs: ${errorCount}`);
    log('ok', `Durée: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
    if (results.phase1) log('ok', `Catalogue: ${results.phase1.collectionsInserted} collections, ${results.phase1.seriesInserted} séries`);
    if (results.phase2) log('ok', `Cartes: ${results.phase2.totalCards} cartes`);
    if (results.phase3) log('ok', `Images: ${results.phase3.downloaded} + ${results.phase3.extraDownloaded} extras`);
    log('ok', '═══════════════════════════════════════════');
    
  } catch (err) {
    log('error', `ERREUR FATALE: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
