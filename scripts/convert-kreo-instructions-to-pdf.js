/**
 * KRE-O Instructions Images → PDF Converter
 * 
 * Convertit les scans d'instructions (images WebP/JPG page par page) stockés
 * dans MinIO en un PDF unique par produit, plus pratique pour les utilisateurs.
 * 
 * Source : kreo-archive/instructions/{set_number}/page_001.jpg, page_002.jpg, ...
 * Dest   : kreo-archive/pdfs/{set_number}_instructions_scan.pdf
 * 
 * Met à jour pdf_path en base pour pointer vers le PDF généré.
 * 
 * Usage :
 *   node scripts/convert-kreo-instructions-to-pdf.js [--dry-run] [--limit N] [--force]
 */

import pg from 'pg';
import * as Minio from 'minio';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

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

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');  // Re-generate even if PDF already exists
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function listObjects(prefix) {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minio.listObjects(BUCKET, prefix, true);
    stream.on('data', obj => objects.push(obj));
    stream.on('end', () => resolve(objects));
    stream.on('error', reject);
  });
}

async function getBuffer(objectPath) {
  const stream = await minio.getObject(BUCKET, objectPath);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function objectExists(path) {
  try {
    await minio.statObject(BUCKET, path);
    return true;
  } catch {
    return false;
  }
}

// ─── Convert one folder to PDF ──────────────────────────────────────────────

async function convertFolderToPdf(folderPrefix) {
  // List all images in this folder, sorted
  const objects = await listObjects(folderPrefix);
  const imageFiles = objects
    .filter(o => /\.(jpg|jpeg|png|webp|gif)$/i.test(o.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (imageFiles.length === 0) return null;

  // Create PDF
  const pdfDoc = await PDFDocument.create();

  for (const imgObj of imageFiles) {
    // Download image
    const imgBuffer = await getBuffer(imgObj.name);

    // Convert to JPEG with sharp (pdf-lib supports JPEG and PNG natively)
    const metadata = await sharp(imgBuffer).metadata();
    const jpegBuffer = await sharp(imgBuffer)
      .jpeg({ quality: 85 })
      .toBuffer();

    // Embed JPEG in PDF
    const jpgImage = await pdfDoc.embedJpg(jpegBuffer);

    // Create page with same dimensions as image (in points, 1px ≈ 0.75pt for screen)
    // Use image dimensions directly — PDF will be pixel-perfect
    const width = metadata.width;
    const height = metadata.height;
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  // Set PDF metadata
  pdfDoc.setTitle(`KRE-O Instructions - ${folderPrefix.replace('instructions/', '').replace('/', '')}`);
  pdfDoc.setProducer('TakoAPI KRE-O Archive');
  pdfDoc.setCreator('convert-kreo-instructions-to-pdf.js');

  const pdfBytes = await pdfDoc.save();
  return { buffer: Buffer.from(pdfBytes), pageCount: imageFiles.length };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  KRE-O Instructions → PDF Converter');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log('  ⚠ Mode DRY-RUN');
  if (FORCE) console.log('  ⚠ Mode FORCE : re-génère même si PDF existe');
  if (LIMIT) console.log(`  ⚠ Limite : ${LIMIT} dossiers`);

  // 1. Discover instruction folders in MinIO
  const allObjects = await listObjects('instructions/');
  const folders = new Set();
  for (const obj of allObjects) {
    const parts = obj.name.split('/');
    if (parts.length >= 2) {
      folders.add(parts[1]); // set_number or slug
    }
  }
  console.log(`\n📂 ${folders.size} dossiers d'instructions trouvés dans MinIO\n`);

  // 2. Load DB products with pdf_path
  const pool = new pg.Pool(DB_CONFIG);
  const { rows: dbProducts } = await pool.query(
    'SELECT id, set_number, name, pdf_path, pdf_url FROM kreo_products WHERE pdf_path IS NOT NULL'
  );
  console.log(`📦 ${dbProducts.length} produits avec pdf_path en base\n`);

  // Build lookup: pdf_path folder → product
  const productByFolder = new Map();
  for (const p of dbProducts) {
    if (p.pdf_path) {
      // pdf_path looks like "instructions/30667/" — extract folder name
      const match = p.pdf_path.match(/instructions\/([^/]+)/);
      if (match) {
        productByFolder.set(match[1], p);
      }
    }
  }

  // 3. Process each folder
  const foldersToProcess = LIMIT ? [...folders].slice(0, LIMIT) : [...folders];

  const stats = {
    converted: 0,
    skipped: 0,
    errors: 0,
    totalPages: 0,
    totalSizeKB: 0,
    dbUpdated: 0,
  };

  for (let i = 0; i < foldersToProcess.length; i++) {
    const folder = foldersToProcess[i];
    const pdfPath = `pdfs/${folder}_instructions_scan.pdf`;
    const product = productByFolder.get(folder);

    process.stdout.write(`  [${i + 1}/${foldersToProcess.length}] ${folder.padEnd(20)} `);

    // Skip if PDF already exists (unless --force)
    if (!FORCE && await objectExists(pdfPath)) {
      stats.skipped++;
      process.stdout.write('⏩ PDF déjà existant\n');
      continue;
    }

    try {
      const result = await convertFolderToPdf(`instructions/${folder}/`);

      if (!result) {
        process.stdout.write('⚠ aucune image\n');
        stats.errors++;
        continue;
      }

      const sizeKB = (result.buffer.length / 1024).toFixed(0);
      stats.totalPages += result.pageCount;
      stats.totalSizeKB += result.buffer.length / 1024;

      if (!DRY_RUN) {
        // Upload PDF to MinIO
        await minio.putObject(BUCKET, pdfPath, result.buffer, result.buffer.length, {
          'Content-Type': 'application/pdf',
        });

        // Update DB: change pdf_path to point to the PDF
        if (product) {
          await pool.query(
            `UPDATE kreo_products SET pdf_path = $1, updated_at = NOW() WHERE id = $2`,
            [pdfPath, product.id]
          );
          stats.dbUpdated++;
        }
      }

      stats.converted++;
      process.stdout.write(`✅ ${result.pageCount} pages → ${sizeKB} KB${product ? ' (DB ✔)' : ' (pas de produit)'}\n`);
    } catch (err) {
      stats.errors++;
      process.stdout.write(`💥 ${err.message.substring(0, 60)}\n`);
    }
  }

  // 4. Summary
  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`  RÉSUMÉ`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  PDFs générés      : ${stats.converted}`);
  console.log(`  Déjà existants    : ${stats.skipped}`);
  console.log(`  Erreurs           : ${stats.errors}`);
  console.log(`  Pages traitées    : ${stats.totalPages}`);
  console.log(`  Taille totale     : ${(stats.totalSizeKB / 1024).toFixed(1)} MB`);
  console.log(`  BDD mis à jour    : ${stats.dbUpdated}`);

  // Final counts
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
  console.log(`    Total produits  : ${fc.total}`);
  console.log(`    Avec pdf_url    : ${fc.with_pdf_url} (manuels Hasbro)`);
  console.log(`    Avec pdf_path   : ${fc.with_pdf_path} (scans → PDF)`);
  console.log(`    Avec un PDF qqc : ${fc.with_any_pdf}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  await pool.end();
}

main().catch(err => {
  console.error('\n💥 FATAL:', err);
  process.exit(1);
});
