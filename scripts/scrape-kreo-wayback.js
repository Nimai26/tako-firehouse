/**
 * KRE-O Wayback Machine Scraper
 * Phase 5 du workflow KREO_SCRAPING_WORKFLOW.md
 * 
 * Scrape les pages produit KRE-O archivées sur le Wayback Machine (hasbro.com)
 * pour en extraire les prix officiels et enrichir la base.
 * 
 * Sources :
 *   - Nouveau format : hasbro.com/en-us/product/kre-o-{slug}:{UUID}
 *   - Ancien format  : hasbro.com/kre-o/en_US/shop/details.cfm?R={UUID}:en_US
 * 
 * Usage : node scripts/scrape-kreo-wayback.js [--dry-run] [--limit N]
 */

import pg from 'pg';
import https from 'https';
import http from 'http';

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host: '10.20.0.10',
  port: 5434,
  database: 'mega_archive',
  user: 'megauser',
  password: 'changeme123',
};

const CDX_BASE = 'http://web.archive.org/cdx/search/cdx';
const WAYBACK_BASE = 'https://web.archive.org/web';
const DELAY_MS = 1500;  // politeness delay between Wayback fetches

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 0;

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpGet(url, maxRedirects = 5, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { 
      headers: { 'User-Agent': 'TakoAPI/1.0 (archive research)' },
      timeout: timeoutMs,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        res.resume();
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(httpGet(loc, maxRedirects - 1, timeoutMs));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url.substring(0, 120)}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + url.substring(0, 120))); });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function httpGetWithRetry(url, retries = 3, timeoutMs = 60000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await httpGet(url, 5, timeoutMs);
    } catch (e) {
      if (i < retries - 1) {
        console.log(`  ⟳ Retry ${i + 1}/${retries} for ${url.substring(0, 80)}...`);
        await sleep(3000 * (i + 1));
      } else {
        throw e;
      }
    }
  }
}

// ─── CDX Discovery ──────────────────────────────────────────────────────────

async function discoverWaybackPages() {
  console.log('\n📡 Interrogation du CDX Wayback Machine...\n');

  // 1. New format pages: /en-us/product/kre-o-*
  const cdxNew = await httpGetWithRetry(
    `${CDX_BASE}?url=hasbro.com/en-us/product/kre-o*&output=json&filter=statuscode:200&collapse=urlkey&limit=500`
  );
  const rowsNew = JSON.parse(cdxNew);
  
  const newPages = new Map(); // slug → { timestamp, url, uuid }
  for (let i = 1; i < rowsNew.length; i++) {
    const [, timestamp, originalUrl] = rowsNew[i];
    const slugMatch = originalUrl.match(/product\/(kre-o[^:?]+):?([A-F0-9-]*)/i);
    if (slugMatch) {
      const slug = slugMatch[1];
      const uuid = slugMatch[2] || '';
      if (!newPages.has(slug)) {
        newPages.set(slug, { timestamp, url: originalUrl, uuid });
      }
    }
  }
  console.log(`  Nouveau format : ${newPages.size} produits uniques`);

  // 2. Old format pages: /kre-o/en_US/shop/details.cfm?R={UUID}
  const cdxOld = await httpGetWithRetry(
    `${CDX_BASE}?url=hasbro.com/kre-o/en_US/shop/details.cfm?R=*&output=json&filter=statuscode:200&collapse=urlkey&limit=500`
  );
  const rowsOld = JSON.parse(cdxOld);
  
  const oldPages = new Map(); // uuid → { timestamp, url }
  for (let i = 1; i < rowsOld.length; i++) {
    const [, timestamp, originalUrl] = rowsOld[i];
    const uuidMatch = originalUrl.match(/R=([A-F0-9-]+)/i);
    if (uuidMatch) {
      const uuid = uuidMatch[1];
      if (!oldPages.has(uuid)) {
        oldPages.set(uuid, { timestamp, url: originalUrl });
      }
    }
  }
  console.log(`  Ancien format  : ${oldPages.size} produits uniques`);

  return { newPages, oldPages };
}

// ─── HTML Extraction ─────────────────────────────────────────────────────────

function extractProductData(html, sourceUrl) {
  const data = {};

  // Product name from <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)</i);
  if (titleMatch) {
    // Title format: "KRE-O Product Name|Category|...|Hasbro" or "Product Name | Category | ... | Hasbro"
    const rawTitle = titleMatch[1].trim();
    const parts = rawTitle.split(/\s*[|]\s*/);
    data.name = parts[0]
      .replace(/^Kre-O\s+/i, '')
      .replace(/\s+Construction Set$/i, '')
      .replace(/\s+Set$/i, '')
      .trim();
    data.rawTitle = parts[0].trim();
  }

  // Price: first price in product_price section
  const priceSection = html.match(/class="product_price"[\s\S]{0,500}/i);
  if (priceSection) {
    const priceMatch = priceSection[0].match(/\$(\d+\.\d{2})/);
    if (priceMatch) {
      data.price = parseFloat(priceMatch[1]);
    }
  }
  // Fallback: any price tag with class="price"
  if (!data.price) {
    const priceTag = html.match(/class="price[^"]*"[^>]*>\s*\$(\d+\.\d{2})/i);
    if (priceTag) {
      data.price = parseFloat(priceTag[1]);
    }
  }

  // Set number: <span class="itemtext">A6951</span>
  const itemMatch = html.match(/class="itemtext"[^>]*>([^<]+)/i);
  if (itemMatch) {
    data.setNumber = itemMatch[1].trim();
  }
  // Fallback: look for pattern in first UUID segment of URL
  if (!data.setNumber) {
    const setInUrl = sourceUrl.match(/\b([A-Z]\d{4,5})\b/);
    if (setInUrl) data.setNumber = setInUrl[1];
  }

  // Pieces count
  const piecesMatch = html.match(/(\d+)\s*pieces?/i);
  if (piecesMatch) {
    data.pieces = parseInt(piecesMatch[1]);
  }

  // Age range
  const ageMatch = html.match(/ages?\s*:?\s*(?:ages?\s+)?(\d+)\s*(?:to|[-–])\s*(\d+)/i);
  if (ageMatch) {
    data.ageMin = parseInt(ageMatch[1]);
    data.ageMax = parseInt(ageMatch[2]);
  }

  // Description
  const descMatch = html.match(/Product Description:\s*([\s\S]{10,2000}?)(?:<\/|<div|<section)/i);
  if (descMatch) {
    data.description = descMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 1000);
  }

  // UUID from URL (for future PDF matching)
  const uuidMatch = sourceUrl.match(/([A-F0-9]{8}-?[A-F0-9]{4}-?[A-F0-9]{4}-?[A-F0-9]{4}-?[A-F0-9]{12})/i);
  if (uuidMatch) {
    data.hasbroUuid = uuidMatch[1];
  }

  // Slug from URL
  const slugMatch = sourceUrl.match(/product\/(kre-o[^:?]+)/i);
  if (slugMatch) {
    data.slug = slugMatch[1];
  }

  return data;
}

// ─── Name matching ──────────────────────────────────────────────────────────

function normalizeForMatch(name) {
  return name
    .toLowerCase()
    .replace(/^kre-?o\s*/i, '')
    .replace(/^transformers?\s*/i, '')
    .replace(/^age of extinction\s*/i, '')
    .replace(/^beast hunters?\s*/i, '')
    .replace(/^robots? in disguise\s*/i, '')
    .replace(/^star trek\s*/i, '')
    .replace(/^battleship\s*/i, '')
    .replace(/^cityville\s*/i, '')
    .replace(/^dungeons?\s*(and|&)\s*dragons?\s*/i, '')
    .replace(/^g\.?i\.?\s*joe\s*/i, '')
    .replace(/\s*(construction\s+)?set$/i, '')
    .replace(/\s*building\s+set$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function findBestMatch(waybackData, dbProducts) {
  // 1. Direct set_number match
  if (waybackData.setNumber) {
    const directMatch = dbProducts.find(p => p.set_number === waybackData.setNumber);
    if (directMatch) return { product: directMatch, method: 'set_number' };
  }

  // 2. Name matching
  if (waybackData.name) {
    const normalizedWayback = normalizeForMatch(waybackData.name);
    
    // Exact normalized match
    const exactMatch = dbProducts.find(p => normalizeForMatch(p.name) === normalizedWayback);
    if (exactMatch) return { product: exactMatch, method: 'name_exact' };

    // Substring match
    const substringMatch = dbProducts.find(p => {
      const normalizedDb = normalizeForMatch(p.name);
      return normalizedDb.length > 3 && (
        normalizedWayback.includes(normalizedDb) || normalizedDb.includes(normalizedWayback)
      );
    });
    if (substringMatch) return { product: substringMatch, method: 'name_substring' };
  }

  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  KRE-O Wayback Machine Scraper — Phase 5');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log('  ⚠ Mode DRY-RUN : aucune écriture en base');
  if (LIMIT) console.log(`  ⚠ Limite : ${LIMIT} pages`);

  // 1. Discovery
  const { newPages, oldPages } = await discoverWaybackPages();

  // 2. Load DB products
  const pool = new pg.Pool(DB_CONFIG);
  const { rows: dbProducts } = await pool.query(
    'SELECT id, set_number, name, price_retail, piece_count, description, franchise FROM kreo_products'
  );
  console.log(`\n📦 ${dbProducts.length} produits en base`);
  console.log(`   ${dbProducts.filter(p => p.price_retail).length} avec prix`);
  console.log(`   ${dbProducts.filter(p => !p.price_retail).length} sans prix\n`);

  // Build set_number lookup
  const bySetNumber = new Map();
  dbProducts.forEach(p => bySetNumber.set(p.set_number, p));

  // 3. Merge new + old format pages (new format preferred for readability)
  const allPages = [];
  
  for (const [slug, info] of newPages) {
    allPages.push({
      source: 'new',
      slug,
      timestamp: info.timestamp,
      url: info.url,
    });
  }
  
  // Add old format pages that don't overlap with new format (by UUID check)
  const newUUIDs = new Set([...newPages.values()].map(v => v.uuid).filter(Boolean));
  for (const [uuid, info] of oldPages) {
    if (!newUUIDs.has(uuid)) {
      allPages.push({
        source: 'old',
        uuid,
        timestamp: info.timestamp,
        url: info.url,
      });
    }
  }
  
  console.log(`🔍 ${allPages.length} pages à scraper (${newPages.size} new + ${allPages.length - newPages.size} old-only)\n`);

  // 4. Scrape each page
  const stats = {
    fetched: 0,
    errors: 0,
    matched: 0,
    matchedBySetNumber: 0,
    matchedByName: 0,
    priceUpdated: 0,
    piecesUpdated: 0,
    descriptionUpdated: 0,
    alreadyHadPrice: 0,
    unmatched: [],
    newProducts: [],
  };

  const pagesToProcess = LIMIT ? allPages.slice(0, LIMIT) : allPages;

  for (let i = 0; i < pagesToProcess.length; i++) {
    const page = pagesToProcess[i];
    const waybackUrl = `${WAYBACK_BASE}/${page.timestamp}/${page.url}`;
    const label = page.slug || page.uuid || page.url.substring(0, 60);
    
    process.stdout.write(`  [${i + 1}/${pagesToProcess.length}] ${label.substring(0, 60).padEnd(60)} `);

    try {
      const html = await httpGetWithRetry(waybackUrl, 2, 30000);
      stats.fetched++;
      
      const data = extractProductData(html, page.url);
      
      if (!data.price && !data.setNumber) {
        process.stdout.write('⚠ no data\n');
        stats.errors++;
        continue;
      }
      
      // Try to match with DB
      const match = findBestMatch(data, dbProducts);
      
      if (match) {
        stats.matched++;
        const { product, method } = match;
        if (method === 'set_number') stats.matchedBySetNumber++;
        else stats.matchedByName++;
        
        const updates = [];
        const values = [];
        let paramIdx = 1;

        // Update price if missing
        if (data.price && !product.price_retail) {
          updates.push(`price_retail = $${paramIdx++}`);
          values.push(data.price);
          stats.priceUpdated++;
        } else if (data.price && product.price_retail) {
          stats.alreadyHadPrice++;
        }

        // Update piece_count if missing
        if (data.pieces && !product.piece_count) {
          updates.push(`piece_count = $${paramIdx++}`);
          values.push(data.pieces);
          stats.piecesUpdated++;
        }

        // Update description if missing and we have one
        if (data.description && (!product.description || product.description.length < 20)) {
          updates.push(`description = $${paramIdx++}`);
          values.push(data.description);
          stats.descriptionUpdated++;
        }

        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          
          if (!DRY_RUN) {
            await pool.query(
              `UPDATE kreo_products SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
              [...values, product.id]
            );
          }
          process.stdout.write(`✅ ${method} → ${product.set_number} (${updates.length - 1} fields${data.price ? ', $' + data.price : ''})\n`);
        } else {
          process.stdout.write(`✔ ${method} → ${product.set_number} (no updates needed)\n`);
        }
      } else {
        stats.unmatched.push({
          name: data.name || data.rawTitle || label,
          setNumber: data.setNumber,
          price: data.price,
          pieces: data.pieces,
          slug: data.slug,
          url: page.url,
        });
        process.stdout.write(`❌ unmatched (${data.setNumber || 'no-set#'}, $${data.price || '?'})\n`);
      }
    } catch (err) {
      stats.errors++;
      process.stdout.write(`💥 ${err.message.substring(0, 60)}\n`);
    }

    await sleep(DELAY_MS);
  }

  // 5. Handle unmatched products — try to insert new ones
  if (stats.unmatched.length > 0) {
    console.log(`\n\n📋 Produits non-matchés (${stats.unmatched.length}) :`);
    
    const insertable = stats.unmatched.filter(u => u.setNumber && u.name);
    const notInsertable = stats.unmatched.filter(u => !u.setNumber || !u.name);
    
    for (const u of insertable) {
      // Check it's not already in DB (double check)
      const existing = bySetNumber.get(u.setNumber);
      if (existing) {
        console.log(`  ⟳ ${u.setNumber} | ${u.name} — already in DB as "${existing.name}"`);
        continue;
      }
      
      // Detect franchise from slug/name
      const franchise = detectFranchise(u.slug || u.name);
      
      console.log(`  + ${u.setNumber} | ${u.name} | ${franchise} | $${u.price || '?'} | ${u.pieces || '?'} pieces`);
      stats.newProducts.push(u);

      if (!DRY_RUN) {
        try {
          await pool.query(
            `INSERT INTO kreo_products (set_number, name, franchise, price_retail, piece_count, product_type, discovered_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'set', NOW(), NOW())
             ON CONFLICT (set_number) DO NOTHING`,
            [u.setNumber, u.name, franchise, u.price || null, u.pieces || null]
          );
        } catch (e) {
          console.log(`    ⚠ Insert error: ${e.message}`);
        }
      }
    }

    if (notInsertable.length > 0) {
      console.log(`\n  Non-insertable (pas de set# ou nom) :`);
      notInsertable.forEach(u => console.log(`    ? ${u.name || 'N/A'} | ${u.setNumber || 'no-set#'} | $${u.price || '?'}`));
    }
  }

  // 6. Summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('  RÉSUMÉ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Pages scrapées   : ${stats.fetched}/${pagesToProcess.length}`);
  console.log(`  Erreurs HTTP     : ${stats.errors}`);
  console.log(`  Matchés          : ${stats.matched} (${stats.matchedBySetNumber} par set#, ${stats.matchedByName} par nom)`);
  console.log(`  Prix mis à jour  : ${stats.priceUpdated}`);
  console.log(`  Pièces MAJ       : ${stats.piecesUpdated}`);
  console.log(`  Desc MAJ         : ${stats.descriptionUpdated}`);
  console.log(`  Déjà avaient prix: ${stats.alreadyHadPrice}`);
  console.log(`  Non-matchés      : ${stats.unmatched.length}`);
  console.log(`  Nouveaux insérés : ${stats.newProducts.length}`);
  console.log('═══════════════════════════════════════════════════════════');

  await pool.end();
}

function detectFranchise(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('transformer')) return 'transformers';
  if (t.includes('g-i-joe') || t.includes('gi joe') || t.includes('g.i. joe')) return 'gi-joe';
  if (t.includes('star-trek') || t.includes('star trek')) return 'star-trek';
  if (t.includes('battleship')) return 'battleship';
  if (t.includes('cityville')) return 'cityville';
  if (t.includes('dungeons') || t.includes('d-d') || t.includes('d&d')) return 'dungeons-dragons';
  return 'unknown';
}

main().catch(err => {
  console.error('\n💥 FATAL:', err);
  process.exit(1);
});
