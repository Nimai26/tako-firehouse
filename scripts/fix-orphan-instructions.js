import pg from 'pg';
import * as Minio from 'minio';

const pool = new pg.Pool({ host:'10.20.0.10', port:5434, database:'mega_archive', user:'megauser', password:'changeme123' });
const minio = new Minio.Client({ endPoint:'10.20.0.10', port:9000, useSSL:false, accessKey:'minioadmin', secretKey:'minioadmin123' });

// 37 dossiers orphelins : slug → nom lisible + métadonnées (issus du wiki KRE-O)
const ORPHANS = {
  // Micro-Changers Kreons (principalement des Combiners components)
  'acid-wing':    { name: 'Acid Wing', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'airachnid':    { name: 'Airachnid', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'arcee':        { name: 'Arcee', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'beachcomber':  { name: 'Beachcomber', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'blast-off':    { name: 'Blast Off', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'blight':       { name: 'Blight', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'bludgeon':     { name: 'Bludgeon', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'bulkhead':     { name: 'Bulkhead', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'cheetor':      { name: 'Cheetor', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'crankstart':   { name: 'Crankstart', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'dirge':        { name: 'Dirge', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'groove':       { name: 'Groove', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'guzzle':       { name: 'Guzzle', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'hardshell':    { name: 'Hardshell', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'hoist':        { name: 'Hoist', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'hook':         { name: 'Hook', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'huffer':       { name: 'Huffer', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'inferno':      { name: 'Inferno', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'kickback':     { name: 'Kickback', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'long-haul':    { name: 'Long Haul', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'nosecone':     { name: 'Nosecone', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'perceptor':    { name: 'Perceptor', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'powerglide':   { name: 'Powerglide', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'ramjet':       { name: 'Ramjet', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'rampage':      { name: 'Rampage', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'scorpinok':    { name: 'Scorpinok', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'scourge':      { name: 'Scourge', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'seawing':      { name: 'Seawing', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'sharkticon':   { name: 'Sharkticon', type: 'kreon', subLine: 'MC Combiners', franchise: 'transformers' },
  'sunstorm':     { name: 'Sunstorm', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'thrust':       { name: 'Thrust', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'warpath':      { name: 'Warpath', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  'waspinator':   { name: 'Waspinator', type: 'kreon', subLine: 'Micro-Changers', franchise: 'transformers' },
  // Building sets
  'haunted-hideaway':  { name: 'Haunted Hideaway', type: 'building_set', subLine: 'Original', franchise: 'transformers' },
  'shoreline-strike':  { name: 'Shoreline Strike', type: 'building_set', subLine: 'Original', franchise: 'battleship' },
  // Existing match — just need pdf_path update
  'capture-cruiser':   { name: 'CityVille Capture Cruiser', existingSetNumber: 'A4910' },
  'anthony-flash-gambello': { name: 'Anthony "Flash" Gambello', existingSetNumber: 'KR31831' },
};

let created = 0;
let updated = 0;
let errors = 0;

for (const [slug, meta] of Object.entries(ORPHANS)) {
  const pdfPath = `instructions/${slug}/`;
  
  // Count actual files in MinIO
  let fileCount = 0;
  const stream = minio.listObjects('kreo-archive', pdfPath, true);
  for await (const obj of stream) fileCount++;
  
  if (meta.existingSetNumber) {
    // Just update pdf_path on existing product
    const res = await pool.query(
      'UPDATE kreo_products SET pdf_path = $1, updated_at = NOW() WHERE set_number = $2 AND (pdf_path IS NULL OR pdf_path = $3)',
      [pdfPath, meta.existingSetNumber, '']
    );
    if (res.rowCount > 0) {
      console.log(`  ✅ UPDATED [${meta.existingSetNumber}] ${meta.name} → ${pdfPath} (${fileCount} scans)`);
      updated++;
    } else {
      console.log(`  ⏭️  SKIP [${meta.existingSetNumber}] ${meta.name} — already has pdf_path`);
    }
  } else {
    // Create new product entry
    const wikiUrl = `https://kreo.fandom.com/wiki/${encodeURIComponent(meta.name)}`;
    const year = meta.subLine === 'MC Combiners' ? 2013 : 2012; // Most Micro-Changers were 2012-2013
    
    try {
      const res = await pool.query(`
        INSERT INTO kreo_products (name, franchise, sub_line, year, product_type, pdf_path, wiki_url, discovered_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET pdf_path = $6, updated_at = NOW()
        RETURNING id, set_number
      `, [meta.name, meta.franchise, meta.subLine, year, meta.type, pdfPath, wikiUrl]);
      
      console.log(`  ✅ CREATED [${res.rows[0].id}] ${meta.name} → ${pdfPath} (${fileCount} scans) [${meta.franchise}/${meta.subLine}]`);
      created++;
    } catch (err) {
      // If unique constraint on name, try update
      try {
        await pool.query(
          'UPDATE kreo_products SET pdf_path = $1, updated_at = NOW() WHERE LOWER(name) = LOWER($2)',
          [pdfPath, meta.name]
        );
        console.log(`  ✅ UPDATED (existing) ${meta.name} → ${pdfPath} (${fileCount} scans)`);
        updated++;
      } catch (err2) {
        console.log(`  ❌ ERROR ${meta.name}: ${err2.message}`);
        errors++;
      }
    }
  }
}

// Final stats
const total = await pool.query('SELECT COUNT(*) as c FROM kreo_products');
const withPdf = await pool.query("SELECT COUNT(*) as c FROM kreo_products WHERE pdf_path IS NOT NULL AND pdf_path != ''");

console.log('');
console.log('=== RÉSULTAT ===');
console.log(`Créés: ${created}`);
console.log(`Mis à jour: ${updated}`);
console.log(`Erreurs: ${errors}`);
console.log(`Total produits: ${total.rows[0].c}`);
console.log(`Avec instructions: ${withPdf.rows[0].c}`);

await pool.end();
