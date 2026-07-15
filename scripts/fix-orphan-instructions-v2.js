import pg from 'pg';
import * as Minio from 'minio';

const pool = new pg.Pool({ host:'10.20.0.10', port:5434, database:'mega_archive', user:'megauser', password:'changeme123' });
const minio = new Minio.Client({ endPoint:'10.20.0.10', port:9000, useSSL:false, accessKey:'minioadmin', secretKey:'minioadmin123' });

// 35 dossiers orphelins dont les produits n'existent PAS en BDD
const ORPHANS = [
  // Micro-Changers Kreons
  { slug: 'acid-wing',    name: 'Acid Wing',    subLine: 'Micro-Changers', year: 2013 },
  { slug: 'airachnid',    name: 'Airachnid',    subLine: 'Micro-Changers', year: 2013 },
  { slug: 'arcee',        name: 'Arcee',        subLine: 'Micro-Changers', year: 2012 },
  { slug: 'beachcomber',  name: 'Beachcomber',  subLine: 'Micro-Changers', year: 2012 },
  { slug: 'blast-off',    name: 'Blast Off',    subLine: 'MC Combiners',   year: 2013 },
  { slug: 'blight',       name: 'Blight',       subLine: 'MC Combiners',   year: 2014 },
  { slug: 'bludgeon',     name: 'Bludgeon',     subLine: 'MC Combiners',   year: 2014 },
  { slug: 'bulkhead',     name: 'Bulkhead',     subLine: 'Micro-Changers', year: 2013 },
  { slug: 'cheetor',      name: 'Cheetor',      subLine: 'Micro-Changers', year: 2013 },
  { slug: 'crankstart',   name: 'Crankstart',   subLine: 'Micro-Changers', year: 2013 },
  { slug: 'dirge',        name: 'Dirge',        subLine: 'Micro-Changers', year: 2012 },
  { slug: 'groove',       name: 'Groove',       subLine: 'MC Combiners',   year: 2013 },
  { slug: 'guzzle',       name: 'Guzzle',       subLine: 'Micro-Changers', year: 2013 },
  { slug: 'hardshell',    name: 'Hardshell',    subLine: 'Micro-Changers', year: 2013 },
  { slug: 'hoist',        name: 'Hoist',        subLine: 'Micro-Changers', year: 2013 },
  { slug: 'hook',         name: 'Hook',         subLine: 'MC Combiners',   year: 2013 },
  { slug: 'huffer',       name: 'Huffer',       subLine: 'Micro-Changers', year: 2012 },
  { slug: 'inferno',      name: 'Inferno',      subLine: 'Micro-Changers', year: 2013 },
  { slug: 'kickback',     name: 'Kickback',     subLine: 'MC Combiners',   year: 2013 },
  { slug: 'long-haul',    name: 'Long Haul',    subLine: 'MC Combiners',   year: 2013 },
  { slug: 'nosecone',     name: 'Nosecone',     subLine: 'MC Combiners',   year: 2013 },
  { slug: 'perceptor',    name: 'Perceptor',    subLine: 'Micro-Changers', year: 2013 },
  { slug: 'powerglide',   name: 'Powerglide',   subLine: 'Micro-Changers', year: 2013 },
  { slug: 'ramjet',       name: 'Ramjet',       subLine: 'Micro-Changers', year: 2012 },
  { slug: 'rampage',      name: 'Rampage',      subLine: 'MC Combiners',   year: 2014 },
  { slug: 'scorpinok',    name: 'Scorpinok',    subLine: 'MC Combiners',   year: 2014 },
  { slug: 'scourge',      name: 'Scourge',      subLine: 'Micro-Changers', year: 2014 },
  { slug: 'seawing',      name: 'Seawing',      subLine: 'MC Combiners',   year: 2014 },
  { slug: 'sharkticon',   name: 'Sharkticon',   subLine: 'MC Combiners',   year: 2014 },
  { slug: 'sunstorm',     name: 'Sunstorm',     subLine: 'Micro-Changers', year: 2013 },
  { slug: 'thrust',       name: 'Thrust',       subLine: 'Micro-Changers', year: 2013 },
  { slug: 'warpath',      name: 'Warpath',      subLine: 'Micro-Changers', year: 2012 },
  { slug: 'waspinator',   name: 'Waspinator',   subLine: 'Micro-Changers', year: 2013 },
  // Building sets
  { slug: 'haunted-hideaway',  name: 'Haunted Hideaway',  subLine: 'Original', year: 2013, type: 'building_set' },
  { slug: 'shoreline-strike',  name: 'Shoreline Strike',  subLine: 'Movie',    year: 2012, type: 'building_set', franchise: 'battleship' },
];

let created = 0;
for (const o of ORPHANS) {
  const pdfPath = `instructions/${o.slug}/`;
  const franchise = o.franchise || 'transformers';
  const prodType = o.type || 'kreon';
  const wikiUrl = `https://kreo.fandom.com/wiki/${encodeURIComponent(o.name)}`;
  
  // Count files
  let fileCount = 0;
  const stream = minio.listObjects('kreo-archive', pdfPath, true);
  for await (const obj of stream) fileCount++;
  
  // Check if already exists
  const existing = await pool.query(
    "SELECT id, name, pdf_path FROM kreo_products WHERE LOWER(name) = LOWER($1) AND franchise = $2",
    [o.name, franchise]
  );
  
  if (existing.rows.length > 0) {
    // Update pdf_path
    await pool.query(
      "UPDATE kreo_products SET pdf_path = $1, updated_at = NOW() WHERE id = $2",
      [pdfPath, existing.rows[0].id]
    );
    console.log(`  ✅ UPDATED [${existing.rows[0].id}] ${o.name} → ${pdfPath} (${fileCount} scans)`);
  } else {
    // Insert new product — generate a set_number from slug
    const setNumber = 'KRO-' + o.slug.toUpperCase().replace(/-/g, '').substring(0, 12);
    const res = await pool.query(`
      INSERT INTO kreo_products (set_number, name, franchise, sub_line, year, product_type, pdf_path, wiki_url, discovered_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id
    `, [setNumber, o.name, franchise, o.subLine, o.year, prodType, pdfPath, wikiUrl]);
    console.log(`  ✅ CREATED [${res.rows[0].id}] ${o.name} → ${pdfPath} (${fileCount} scans) [${franchise}/${o.subLine}]`);
    created++;
  }
}

const total = await pool.query('SELECT COUNT(*) as c FROM kreo_products');
const withPdf = await pool.query("SELECT COUNT(*) as c FROM kreo_products WHERE pdf_path IS NOT NULL AND pdf_path != ''");

console.log('');
console.log(`=== RÉSULTAT ===`);
console.log(`Nouveaux produits créés: ${created}`);
console.log(`Total produits: ${total.rows[0].c}`);
console.log(`Avec instructions (pdf_path): ${withPdf.rows[0].c}`);

await pool.end();
