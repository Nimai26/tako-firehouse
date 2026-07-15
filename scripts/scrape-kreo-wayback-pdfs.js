/**
 * KRE-O Wayback Machine PDF Scraper
 * 
 * Scrape les manuels d'instructions PDF depuis les pages produit KRE-O
 * archivées sur le Wayback Machine (hasbro.com), les télécharge et les stocke
 * dans MinIO (kreo-archive/pdfs/).
 * 
 * Pattern PDF trouvé sur les pages Hasbro :
 *   <a href="...common/documents/{folder_uuid}/{file_uuid}.pdf" target="_blank">Instructions</a>
 *   <a href="...common/documents/{folder_uuid}/{file_uuid}.pdf" target="_blank">Replacement Parts</a>
 * 
 * Usage :
 *   node scripts/scrape-kreo-wayback-pdfs.js [--dry-run] [--limit N] [--skip-download]
 */

import pg from 'pg';
import * as Minio from 'minio';
import https from 'https';
import http from 'http';

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host: '10.20.0.10',
  port: 5434,
  database: 'mega_archive',
  user: 'megauser',
  password: 'changeme123',
  max: 5,
};

const minio = new Minio.Client({
  endPoint: '10.20.0.10', port: 9000, useSSL: false,
  accessKey: 'minioadmin', secretKey: 'minioadmin123',
});
const BUCKET = 'kreo-archive';

const CDX_BASE = 'http://web.archive.org/cdx/search/cdx';
const WAYBACK_BASE = 'https://web.archive.org/web';
const DELAY_MS = 2000;         // entre chaque page HTML
const PDF_DELAY_MS = 1500;     // entre chaque téléchargement PDF

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_DOWNLOAD = args.includes('--skip-download');
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
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + url.substring(0, 120))); });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  console.log('\n📡 CDX Discovery...\n');

  // 1. Old format pages: /kre-o/en_US/shop/details.cfm?R={UUID}
  const cdxOld = await httpGetWithRetry(
    `${CDX_BASE}?url=hasbro.com/kre-o/en_US/shop/details.cfm?R=*&output=json&filter=statuscode:200&collapse=urlkey&limit=500`
  );
  const rowsOld = JSON.parse(cdxOld.toString());

  const oldPages = new Map();
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
  console.log(`  Ancien format : ${oldPages.size} pages`);

  // 2. New format pages: /en-us/product/kre-o-*
  const cdxNew = await httpGetWithRetry(
    `${CDX_BASE}?url=hasbro.com/en-us/product/kre-o*&output=json&filter=statuscode:200&collapse=urlkey&limit=500`
  );
  const rowsNew = JSON.parse(cdxNew.toString());

  const newPages = new Map();
  for (let i = 1; i < rowsNew.length; i++) {
    const [, timestamp, originalUrl] = rowsNew[i];
    const slugMatch = originalUrl.match(/product\/(kre-o[^:?]+):?([A-F0-9-]*)/i);
    if (slugMatch) {
      const slug = slugMatch[1];
      if (!newPages.has(slug)) {
        newPages.set(slug, { timestamp, url: originalUrl, uuid: slugMatch[2] || '' });
      }
    }
  }
  console.log(`  Nouveau format : ${newPages.size} pages`);

  // 3. Also look for PDFs directly in CDX
  console.log('\n  📄 Recherche directe de PDFs dans CDX...');
  const cdxPdf = await httpGetWithRetry(
    `${CDX_BASE}?url=hasbro.com/common/documents/*kre*pdf&output=json&filter=statuscode:200&collapse=urlkey&limit=500`
  ).catch(() => null);
  
  let directPdfs = [];
  if (cdxPdf) {
    const rowsPdf = JSON.parse(cdxPdf.toString());
    if (rowsPdf.length > 1) {
      directPdfs = rowsPdf.slice(1).map(r => ({ timestamp: r[1], url: r[2] }));
    }
  }
  console.log(`  PDFs directement indexés : ${directPdfs.length}`);

  return { oldPages, newPages, directPdfs };
}

// ─── PDF Link Extraction ────────────────────────────────────────────────────

function extractPdfLinks(html, sourceTimestamp) {
  const links = [];
  const htmlStr = html.toString();

  // Pattern : <a href="...common/documents/.../....pdf" ...>Instructions</a>
  //           <a href="...common/documents/.../....pdf" ...>Replacement Parts</a>
  const pdfRegex = /href=["']([^"']*common\/documents\/[^"']+\.pdf)["'][^>]*>([^<]*)</gi;
  let match;

  while ((match = pdfRegex.exec(htmlStr)) !== null) {
    const rawHref = match[1];
    const linkText = match[2].trim();

    // Extract the original Hasbro URL (strip Wayback prefix)
    let originalUrl;
    const waybackStrip = rawHref.match(/\/web\/\d+(?:id_)?\/?(https?:\/\/.+)/);
    if (waybackStrip) {
      originalUrl = waybackStrip[1];
    } else if (rawHref.startsWith('http')) {
      originalUrl = rawHref;
    } else {
      // Relative — reconstruct
      const pathMatch = rawHref.match(/(\/common\/documents\/.+\.pdf)/);
      if (pathMatch) {
        originalUrl = `http://www.hasbro.com${pathMatch[1]}`;
      }
    }

    if (!originalUrl) continue;

    // Determine type: instructions or replacement_parts
    const type = /instruction/i.test(linkText) ? 'instructions'
               : /replacement/i.test(linkText) ? 'replacement_parts'
               : 'other';

    // Build Wayback download URL (use id_ prefix for raw file)
    const waybackUrl = `${WAYBACK_BASE}/${sourceTimestamp}id_/${originalUrl}`;

    links.push({
      originalUrl,
      waybackUrl,
      type,
      linkText,
    });
  }

  return links;
}

// Extract product name from page HTML
function extractProductName(html) {
  const htmlStr = html.toString();
  const titleMatch = htmlStr.match(/<title[^>]*>([^<]+)</i);
  if (titleMatch) {
    const parts = titleMatch[1].trim().split(/\s*[|]\s*/);
    return parts[0]
      .replace(/^Kre-O\s+/i, '')
      .replace(/\s+Construction Set$/i, '')
      .replace(/\s+Set$/i, '')
      .trim();
  }
  return null;
}

// Extract set number from page HTML
function extractSetNumber(html) {
  const htmlStr = html.toString();
  const itemMatch = htmlStr.match(/class="itemtext"[^>]*>([^<]+)/i);
  if (itemMatch) return itemMatch[1].trim();
  return null;
}

// ─── Name matching (same as wayback scraper) ─────────────────────────────────

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

function findBestMatch(name, setNumber, dbProducts) {
  // 1. Direct set_number match
  if (setNumber) {
    const directMatch = dbProducts.find(p => p.set_number === setNumber);
    if (directMatch) return { product: directMatch, method: 'set_number' };
  }

  // 2. Name matching
  if (name) {
    const normalizedWayback = normalizeForMatch(name);

    const exactMatch = dbProducts.find(p => normalizeForMatch(p.name) === normalizedWayback);
    if (exactMatch) return { product: exactMatch, method: 'name_exact' };

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

// ─── MinIO helpers ──────────────────────────────────────────────────────────

async function objectExists(path) {
  try {
    await minio.statObject(BUCKET, path);
    return true;
  } catch {
    return false;
  }
}

async function uploadPdf(path, buffer) {
  await minio.putObject(BUCKET, path, buffer, buffer.length, {
    'Content-Type': 'application/pdf',
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  KRE-O Wayback Machine PDF Scraper');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log('  ⚠ Mode DRY-RUN : aucune écriture');
  if (SKIP_DOWNLOAD) console.log('  ⚠ Mode SKIP-DOWNLOAD : extraction liens seulement');
  if (LIMIT) console.log(`  ⚠ Limite : ${LIMIT} pages`);

  // 1. Discovery
  const { oldPages, newPages, directPdfs } = await discoverWaybackPages();

  // 2. Load DB products
  const pool = new pg.Pool(DB_CONFIG);
  const { rows: dbProducts } = await pool.query(
    'SELECT id, set_number, name, pdf_url, pdf_path, franchise FROM kreo_products'
  );
  console.log(`\n📦 ${dbProducts.length} produits en base`);
  console.log(`   ${dbProducts.filter(p => p.pdf_url).length} avec pdf_url`);
  console.log(`   ${dbProducts.filter(p => p.pdf_path).length} avec pdf_path\n`);

  // 3. Build page list (old format + new format)
  const allPages = [];

  for (const [uuid, info] of oldPages) {
    allPages.push({ source: 'old', uuid, timestamp: info.timestamp, url: info.url });
  }

  const oldUUIDs = new Set([...oldPages.keys()]);
  for (const [slug, info] of newPages) {
    if (!info.uuid || !oldUUIDs.has(info.uuid)) {
      allPages.push({ source: 'new', slug, timestamp: info.timestamp, url: info.url });
    }
  }

  console.log(`🔍 ${allPages.length} pages à scraper\n`);

  // 4. Scrape each page for PDF links
  const pdfFindings = [];  // { productName, setNumber, pdfLink, matchedProduct }
  const stats = {
    fetched: 0,
    errors: 0,
    pagesWithPdf: 0,
    pagesNoPdf: 0,
    totalPdfLinks: 0,
    instructionLinks: 0,
    replacementLinks: 0,
  };

  const pagesToProcess = LIMIT ? allPages.slice(0, LIMIT) : allPages;

  for (let i = 0; i < pagesToProcess.length; i++) {
    const page = pagesToProcess[i];
    const waybackUrl = `${WAYBACK_BASE}/${page.timestamp}/${page.url}`;
    const label = page.slug || page.uuid || page.url.substring(0, 60);

    process.stdout.write(`  [${i + 1}/${pagesToProcess.length}] ${label.substring(0, 55).padEnd(55)} `);

    try {
      const html = await httpGetWithRetry(waybackUrl, 2, 30000);
      stats.fetched++;

      const productName = extractProductName(html);
      const setNumber = extractSetNumber(html);
      const pdfLinks = extractPdfLinks(html, page.timestamp);

      if (pdfLinks.length === 0) {
        stats.pagesNoPdf++;
        process.stdout.write(`⚠ no PDF (${productName || 'N/A'})\n`);
      } else {
        stats.pagesWithPdf++;

        // Match with DB
        const match = findBestMatch(productName, setNumber, dbProducts);

        for (const pdf of pdfLinks) {
          stats.totalPdfLinks++;
          if (pdf.type === 'instructions') stats.instructionLinks++;
          if (pdf.type === 'replacement_parts') stats.replacementLinks++;

          pdfFindings.push({
            productName,
            setNumber,
            pdfLink: pdf,
            matchedProduct: match ? match.product : null,
            matchMethod: match ? match.method : null,
            pageUrl: page.url,
          });
        }

        const matchInfo = match ? `→ ${match.product.set_number} (${match.method})` : '❌ unmatched';
        const types = pdfLinks.map(p => p.type).join(', ');
        process.stdout.write(`📄 ${pdfLinks.length} PDF (${types}) ${matchInfo}\n`);
      }
    } catch (err) {
      stats.errors++;
      process.stdout.write(`💥 ${err.message.substring(0, 60)}\n`);
    }

    await sleep(DELAY_MS);
  }

  // 5. Filter to instruction PDFs only and deduplicate
  const instructionPdfs = pdfFindings.filter(f => f.pdfLink.type === 'instructions');
  const matchedInstructions = instructionPdfs.filter(f => f.matchedProduct);
  const unmatchedInstructions = instructionPdfs.filter(f => !f.matchedProduct);

  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`  PHASE 1 — Résumé extraction liens`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Pages scrapées    : ${stats.fetched}/${pagesToProcess.length}`);
  console.log(`  Erreurs HTTP      : ${stats.errors}`);
  console.log(`  Pages avec PDF    : ${stats.pagesWithPdf}`);
  console.log(`  Pages sans PDF    : ${stats.pagesNoPdf}`);
  console.log(`  Liens PDF trouvés : ${stats.totalPdfLinks}`);
  console.log(`    Instructions    : ${stats.instructionLinks}`);
  console.log(`    Replacement     : ${stats.replacementLinks}`);
  console.log(`  Instructions matchées   : ${matchedInstructions.length}`);
  console.log(`  Instructions non-matchées: ${unmatchedInstructions.length}`);

  if (unmatchedInstructions.length > 0) {
    console.log(`\n  Non-matchées :`);
    for (const f of unmatchedInstructions) {
      console.log(`    ? ${f.productName || 'N/A'} | ${f.setNumber || 'no-set#'} | ${f.pdfLink.originalUrl.substring(0, 80)}`);
    }
  }

  if (SKIP_DOWNLOAD) {
    console.log(`\n  ⚠ SKIP_DOWNLOAD: pas de téléchargement\n`);
    await pool.end();
    return;
  }

  // 6. Download PDFs and store in MinIO
  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`  PHASE 2 — Téléchargement PDFs → MinIO`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Deduplicate: one instruction PDF per product
  const pdfByProduct = new Map();
  for (const f of matchedInstructions) {
    const productId = f.matchedProduct.id;
    if (!pdfByProduct.has(productId)) {
      pdfByProduct.set(productId, f);
    }
  }

  // Also process replacement_parts PDFs
  const replacementPdfs = pdfFindings.filter(f => f.pdfLink.type === 'replacement_parts' && f.matchedProduct);
  const rpByProduct = new Map();
  for (const f of replacementPdfs) {
    const productId = f.matchedProduct.id;
    if (!rpByProduct.has(productId)) {
      rpByProduct.set(productId, f);
    }
  }

  const downloadStats = {
    downloaded: 0,
    skipped: 0,
    errors: 0,
    dbUpdated: 0,
  };

  // Download instruction PDFs
  const entries = [...pdfByProduct.entries()];
  for (let i = 0; i < entries.length; i++) {
    const [productId, finding] = entries[i];
    const product = finding.matchedProduct;
    const setNumber = product.set_number;
    const minioPath = `pdfs/${setNumber}_instructions.pdf`;

    process.stdout.write(`  [${i + 1}/${entries.length}] ${setNumber.padEnd(12)} instructions `);

    // Skip if already in MinIO
    if (await objectExists(minioPath)) {
      downloadStats.skipped++;
      process.stdout.write('⏩ already exists\n');
      continue;
    }

    try {
      const pdfBuffer = await httpGetWithRetry(finding.pdfLink.waybackUrl, 3, 120000);

      // Verify it's actually a PDF
      if (pdfBuffer.length < 100 || !pdfBuffer.toString('ascii', 0, 5).startsWith('%PDF')) {
        process.stdout.write(`⚠ not a valid PDF (${pdfBuffer.length} bytes)\n`);
        downloadStats.errors++;
        continue;
      }

      if (!DRY_RUN) {
        await uploadPdf(minioPath, pdfBuffer);

        // Update DB: pdf_url with original Hasbro URL
        await pool.query(
          `UPDATE kreo_products SET pdf_url = $1, updated_at = NOW() WHERE id = $2`,
          [finding.pdfLink.originalUrl, productId]
        );
        downloadStats.dbUpdated++;
      }

      downloadStats.downloaded++;
      process.stdout.write(`✅ ${(pdfBuffer.length / 1024).toFixed(0)} KB\n`);
    } catch (err) {
      downloadStats.errors++;
      process.stdout.write(`💥 ${err.message.substring(0, 60)}\n`);
    }

    await sleep(PDF_DELAY_MS);
  }

  // Download replacement parts PDFs
  const rpEntries = [...rpByProduct.entries()];
  if (rpEntries.length > 0) {
    console.log(`\n  --- Replacement Parts PDFs ---\n`);
    for (let i = 0; i < rpEntries.length; i++) {
      const [, finding] = rpEntries[i];
      const product = finding.matchedProduct;
      const setNumber = product.set_number;
      const minioPath = `pdfs/${setNumber}_replacement_parts.pdf`;

      process.stdout.write(`  [${i + 1}/${rpEntries.length}] ${setNumber.padEnd(12)} replacement  `);

      if (await objectExists(minioPath)) {
        downloadStats.skipped++;
        process.stdout.write('⏩ already exists\n');
        continue;
      }

      try {
        const pdfBuffer = await httpGetWithRetry(finding.pdfLink.waybackUrl, 3, 120000);

        if (pdfBuffer.length < 100 || !pdfBuffer.toString('ascii', 0, 5).startsWith('%PDF')) {
          process.stdout.write(`⚠ not a valid PDF (${pdfBuffer.length} bytes)\n`);
          downloadStats.errors++;
          continue;
        }

        if (!DRY_RUN) {
          await uploadPdf(minioPath, pdfBuffer);
        }
        downloadStats.downloaded++;
        process.stdout.write(`✅ ${(pdfBuffer.length / 1024).toFixed(0)} KB\n`);
      } catch (err) {
        downloadStats.errors++;
        process.stdout.write(`💥 ${err.message.substring(0, 60)}\n`);
      }

      await sleep(PDF_DELAY_MS);
    }
  }

  // 7. Final summary
  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`  RÉSUMÉ FINAL`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  PDFs téléchargés    : ${downloadStats.downloaded}`);
  console.log(`  PDFs déjà présents  : ${downloadStats.skipped}`);
  console.log(`  Erreurs download    : ${downloadStats.errors}`);
  console.log(`  DB mis à jour       : ${downloadStats.dbUpdated}`);

  // Verify final state
  const { rows: finalCheck } = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(pdf_url) as with_pdf_url,
      COUNT(pdf_path) as with_pdf_path,
      COUNT(CASE WHEN pdf_url IS NOT NULL OR pdf_path IS NOT NULL THEN 1 END) as with_any_pdf
    FROM kreo_products
  `);
  const fc = finalCheck[0];
  console.log(`\n  État final BDD :`);
  console.log(`    Total produits    : ${fc.total}`);
  console.log(`    Avec pdf_url      : ${fc.with_pdf_url} (manuels Hasbro)`);
  console.log(`    Avec pdf_path     : ${fc.with_pdf_path} (scans wiki)`);
  console.log(`    Avec un PDF qqc   : ${fc.with_any_pdf}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  await pool.end();
}

main().catch(err => {
  console.error('\n💥 FATAL:', err);
  process.exit(1);
});
