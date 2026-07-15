#!/usr/bin/env node

/**
 * KRE-O Instructions Scraper
 * 
 * Télécharge les scans d'instructions depuis kreo.fandom.com et les stocke dans MinIO.
 * Chaque page d'instructions contient une galerie d'images (scans de chaque page du livret).
 * 
 * Source : Category:Instructions sur kreo.fandom.com (~95 pages)
 * Destination : MinIO kreo-archive/instructions/{set_number}/
 * 
 * Usage :
 *   node scripts/scrape-kreo-instructions.js                # Télécharger tout
 *   node scripts/scrape-kreo-instructions.js --dry-run      # Simulation
 *   node scripts/scrape-kreo-instructions.js --limit=5      # Tester sur 5 pages
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
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0') || 0;
const DELAY_MS = 400;
const IMAGE_DELAY_MS = 150;

const pool = new pg.Pool({
  host: '10.20.0.10', port: 5434, database: 'mega_archive',
  user: 'megauser', password: 'changeme123', max: 5
});

const minio = new Minio.Client({
  endPoint: '10.20.0.10', port: 9000, useSSL: false,
  accessKey: 'minioadmin', secretKey: 'minioadmin123'
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

function httpGet(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, {
      headers: { 'User-Agent': 'TakoAPI-KreoScraper/1.0', 'Accept': '*/*' },
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

async function wikiApi(params) {
  const url = `${WIKI_API}?${new URLSearchParams({ format: 'json', ...params })}`;
  const data = await httpGet(url);
  return JSON.parse(data.toString());
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUCTION PAGE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extraire un set_number depuis le titre d'une page d'instructions
 * 
 * Patterns :
 *   "Instructions Bumblebee (31144)" → "31144"
 *   "Instructions Bumblebee (36421)" → "36421"
 *   "Instructions Custom Optimus Prime (81233/80947)" → "81233"
 *   "Instructions Autobot Assault Devastator 1" → match by name
 *   "Instructions Crankstart" → match by name
 *   "Instructions Abominus (A4473/A2204)" → "A4473"
 *   "Instructions Cell Block Breakout" → match by name
 *   "Instructions Grimlock (B0718/B0714)" → "B0718"
 */
function extractSetNumberFromTitle(title) {
  // Remove "Instructions " prefix and variants
  const cleaned = title
    .replace(/^Instructions?\s+/i, '')
    .replace(/^Custom\s+/i, '');
  
  // Pattern 1: (number) or (number/number) at end
  const parenMatch = cleaned.match(/\(([A-Z]?\d{4,6})(?:\/[A-Z]?\d{4,6})?\)\s*$/i);
  if (parenMatch) return parenMatch[1].toUpperCase();
  
  // Pattern 2: "Series 4 Micro-Changers" → no set number
  // Pattern 3: "Bucket 275" → special
  const bucketMatch = cleaned.match(/Bucket\s+(\d+)/i);
  if (bucketMatch) return null; // Match by name
  
  return null; // Will match by name
}

/**
 * Extraire le nom de produit depuis le titre d'une page d'instructions
 */
function extractNameFromTitle(title) {
  return title
    .replace(/^Instructions?\s+/i, '')
    .replace(/\s*\([^)]+\)\s*$/, '')
    .replace(/\s+\d+$/, '') // "Devastator 1" → "Devastator" (multi-book)
    .trim();
}

/**
 * Détecter le numéro de livre pour les sets multi-livres
 * "Instructions Autobot Assault Devastator 1" → book 1
 */
function extractBookNumber(title) {
  const match = title.match(/(\d+)\s*$/);
  if (match) {
    const num = parseInt(match[1]);
    if (num >= 1 && num <= 10) return num; // Reasonable book number
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  log('═══════════════════════════════════════════════════════════');
  log('  KRE-O Instructions Scraper — kreo.fandom.com');
  log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'PRODUCTION'}`);
  if (LIMIT) log(`  Limite: ${LIMIT} pages`);
  log('═══════════════════════════════════════════════════════════');
  
  // ─── Charger les produits existants en BDD ───
  const products = await pool.query('SELECT set_number, name, product_type FROM kreo_products');
  const productsBySetNumber = new Map();
  const productsByName = new Map(); // lowercase name → set_number
  
  for (const row of products.rows) {
    productsBySetNumber.set(row.set_number, row);
    if (row.name) {
      const lname = row.name.toLowerCase();
      // Ne pas écraser un match existant avec un set_number WK/KR
      if (!productsByName.has(lname) || !row.set_number.startsWith('WK')) {
        productsByName.set(lname, row.set_number);
      }
    }
  }
  log(`\n📊 Produits en BDD : ${products.rows.length}`);
  
  // ─── Récupérer les pages d'instructions ───
  log('\n📋 Chargement de Category:Instructions...');
  const categoryPages = [];
  let cmContinue = null;
  do {
    const params = {
      action: 'query', list: 'categorymembers',
      cmtitle: 'Category:Instructions', cmlimit: '500', cmtype: 'page'
    };
    if (cmContinue) params.cmcontinue = cmContinue;
    const data = await wikiApi(params);
    if (data.query?.categorymembers) categoryPages.push(...data.query.categorymembers);
    cmContinue = data.continue?.cmcontinue || null;
    await sleep(DELAY_MS);
  } while (cmContinue);
  
  // Filtrer les pages index et spéciales
  const instructionPages = categoryPages.filter(p =>
    p.ns === 0 &&
    p.title.startsWith('Instructions ') &&
    !p.title.includes('Series 4 Micro-Changers') // One combined sheet, not per-figure
  );
  
  log(`   ${categoryPages.length} pages dans la catégorie`);
  log(`   ${instructionPages.length} pages d'instructions individuelles`);
  
  const pagesToProcess = LIMIT ? instructionPages.slice(0, LIMIT) : instructionPages;
  
  // ─── Charger les dossiers d'instructions déjà dans MinIO pour skip ───
  const existingFolders = new Set();
  if (!DRY_RUN) {
    const listStream = minio.listObjects(BUCKET, 'instructions/', false);
    await new Promise((resolve, reject) => {
      listStream.on('data', obj => {
        if (obj.prefix) {
          const folder = obj.prefix.replace('instructions/', '').replace('/', '');
          if (folder) existingFolders.add(folder);
        }
      });
      listStream.on('end', resolve);
      listStream.on('error', reject);
    });
    if (existingFolders.size > 0) {
      log(`\n⏩ ${existingFolders.size} dossiers instructions déjà dans MinIO (skip)`);
    }
  }

  // ─── Stats ───
  const stats = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    imagesDownloaded: 0,
    imageFailed: 0,
    productsUpdated: 0,
    errors: 0,
    totalImages: 0,
    skipped: 0
  };
  
  // ─── Traiter chaque page d'instructions ───
  log(`\n📖 Traitement de ${pagesToProcess.length} pages d'instructions...\n`);
  
  for (const page of pagesToProcess) {
    stats.processed++;
    const progress = `[${stats.processed}/${pagesToProcess.length}]`;
    
    try {
      await sleep(DELAY_MS);
      
      // Fetch page avec images
      const parseData = await wikiApi({
        action: 'parse', page: page.title,
        prop: 'wikitext|images', redirects: '1'
      });
      
      if (!parseData.parse) {
        log(`${progress} ⚠ ${page.title} — page introuvable`);
        stats.errors++;
        continue;
      }
      
      const images = parseData.parse.images || [];
      // Filtrer les images Wikia/Site-community
      const instructionImages = images.filter(img =>
        img && !img.includes('Wikia') && !img.includes('Site-') &&
        /\.(jpg|jpeg|png|gif|webp)$/i.test(img)
      );
      
      if (instructionImages.length === 0) {
        log(`${progress} ⚠ ${page.title} — aucune image d'instruction`);
        stats.unmatched++;
        continue;
      }
      
      stats.totalImages += instructionImages.length;
      
      // Matcher avec un produit en BDD
      const setNumber = extractSetNumberFromTitle(page.title);
      const name = extractNameFromTitle(page.title);
      const bookNum = extractBookNumber(page.title);
      
      let matchedSetNumber = null;
      
      // Tentative 1: par set_number extrait du titre
      if (setNumber && productsBySetNumber.has(setNumber)) {
        matchedSetNumber = setNumber;
      }
      
      // Tentative 2: par nom exact
      if (!matchedSetNumber && name) {
        matchedSetNumber = productsByName.get(name.toLowerCase()) || null;
      }
      
      // Tentative 3: par nom partiel (sans préfixes "Instructions_")
      if (!matchedSetNumber && name) {
        const nameLower = name.toLowerCase();
        for (const [prodName, prodSetNum] of productsByName) {
          if (prodName.includes(nameLower) || nameLower.includes(prodName)) {
            matchedSetNumber = prodSetNum;
            break;
          }
        }
      }
      
      const matchStatus = matchedSetNumber ? '✅' : '⚠';
      const matchInfo = matchedSetNumber || 'NO_MATCH';
      log(`${progress} ${matchStatus} ${page.title} → ${matchInfo} (${instructionImages.length} images${bookNum ? ', book ' + bookNum : ''})`);
      
      if (matchedSetNumber) {
        stats.matched++;
      } else {
        stats.unmatched++;
      }
      
      // Déterminer le dossier de stockage
      const folderKey = matchedSetNumber || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const baseDir = `instructions/${folderKey}`;
      
      // Skip si le dossier existe déjà dans MinIO
      if (existingFolders.has(folderKey) && !DRY_RUN) {
        // Quand même mettre à jour le pdf_path en BDD si pas encore fait
        if (matchedSetNumber) {
          await pool.query(
            `UPDATE kreo_products 
             SET pdf_path = COALESCE(kreo_products.pdf_path, $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE set_number = $2 AND pdf_path IS NULL`,
            [`${baseDir}/`, matchedSetNumber]
          );
        }
        stats.skipped++;
        continue;
      }
      
      // Résoudre les URLs et télécharger les images
      let downloadedCount = 0;
      for (let i = 0; i < instructionImages.length; i++) {
        const imgName = instructionImages[i];
        const pageNum = String(i + 1).padStart(3, '0');
        const ext = imgName.match(/\.(png|jpg|jpeg|gif|webp)$/i)?.[1]?.toLowerCase() || 'jpg';
        const bookPrefix = bookNum ? `book${bookNum}_` : '';
        const objectPath = `${baseDir}/${bookPrefix}page_${pageNum}.${ext}`;
        
        if (DRY_RUN) {
          downloadedCount++;
          continue;
        }
        
        try {
          // Résoudre l'URL réelle via imageinfo API
          const imgData = await wikiApi({
            action: 'query',
            titles: `File:${imgName}`,
            prop: 'imageinfo',
            iiprop: 'url'
          });
          
          const imgPages = imgData.query?.pages;
          if (!imgPages) continue;
          
          const imgPage = Object.values(imgPages)[0];
          const imgUrl = imgPage?.imageinfo?.[0]?.url;
          if (!imgUrl) continue;
          
          // Télécharger
          const data = await httpGet(imgUrl);
          const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
          await minio.putObject(BUCKET, objectPath, data, data.length, {
            'Content-Type': contentType
          });
          
          downloadedCount++;
          await sleep(IMAGE_DELAY_MS);
        } catch (imgErr) {
          stats.imageFailed++;
          // Don't log every failed image — just count
        }
      }
      
      stats.imagesDownloaded += downloadedCount;
      
      // Mettre à jour la BDD si matché
      if (matchedSetNumber && !DRY_RUN && downloadedCount > 0) {
        const pdfPath = `${baseDir}/`;
        await pool.query(
          `UPDATE kreo_products 
           SET pdf_path = COALESCE(kreo_products.pdf_path, $1),
               updated_at = CURRENT_TIMESTAMP
           WHERE set_number = $2`,
          [pdfPath, matchedSetNumber]
        );
        stats.productsUpdated++;
      }
      
    } catch (err) {
      logError(`${progress} ${page.title}: ${err.message}`);
      stats.errors++;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // RÉSUMÉ
  // ═══════════════════════════════════════════════════════════════════════
  
  log('\n═══════════════════════════════════════════════════════════');
  log('  RÉSUMÉ — Instructions Scraper');
  log('═══════════════════════════════════════════════════════════');
  log(`  Pages traitées         : ${stats.processed}`);
  log(`  Déjà téléchargées skip: ${stats.skipped}`);
  log(`  Matchées avec produit  : ${stats.matched}`);
  log(`  Non matchées           : ${stats.unmatched}`);
  log(`  Total images trouvées  : ${stats.totalImages}`);
  log(`  Images téléchargées    : ${stats.imagesDownloaded}`);
  log(`  Images échouées        : ${stats.imageFailed}`);
  log(`  Produits mis à jour    : ${stats.productsUpdated}`);
  log(`  Erreurs                : ${stats.errors}`);
  
  if (!DRY_RUN) {
    let minioCount = 0;
    const stream = minio.listObjects(BUCKET, 'instructions/', true);
    await new Promise((resolve, reject) => {
      stream.on('data', () => minioCount++);
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    log(`\n  Fichiers instructions MinIO : ${minioCount}`);
    
    const totalMinio = await new Promise((resolve, reject) => {
      let count = 0;
      const s = minio.listObjects(BUCKET, '', true);
      s.on('data', () => count++);
      s.on('end', () => resolve(count));
      s.on('error', reject);
    });
    log(`  Total MinIO (tout bucket)   : ${totalMinio}`);
  }
  
  log('═══════════════════════════════════════════════════════════');
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
