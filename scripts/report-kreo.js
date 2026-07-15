import * as Minio from 'minio';
import pg from 'pg';

const minio = new Minio.Client({ endPoint:'10.20.0.10', port:9000, useSSL:false, accessKey:'minioadmin', secretKey:'minioadmin123' });
const pool = new pg.Pool({ host:'10.20.0.10', port:5434, database:'mega_archive', user:'megauser', password:'changeme123' });

// Structure MinIO
const prefixes = {};
let total = 0;
const s = minio.listObjects('kreo-archive', '', true);
for await (const obj of s) {
  total++;
  const p = obj.name.split('/')[0];
  prefixes[p] = (prefixes[p] || 0) + 1;
}
console.log('=== STRUCTURE MINIO kreo-archive ===');
Object.entries(prefixes).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}/: ${v} fichiers`));
console.log(`Total: ${total}`);

// Dossiers instructions dans MinIO
const instrDirs = new Map();
const s2 = minio.listObjects('kreo-archive', 'instructions/', true);
for await (const obj of s2) {
  const dir = obj.name.split('/')[1];
  if (dir) instrDirs.set(dir, (instrDirs.get(dir) || 0) + 1);
}

// Produits avec pdf_path en BDD
const dbSets = await pool.query("SELECT set_number FROM kreo_products WHERE pdf_path IS NOT NULL AND pdf_path != ''");
const dbSetNumbers = new Set(dbSets.rows.map(r => r.set_number));

console.log('');
console.log('=== DOSSIERS INSTRUCTIONS ORPHELINS (dans MinIO mais pas de pdf_path en BDD) ===');
let orphanCount = 0;
let orphanFiles = 0;
for (const [dir, count] of [...instrDirs.entries()].sort()) {
  if (!dbSetNumbers.has(dir)) {
    // Vérifier si un produit existe avec ce set_number
    const exists = await pool.query("SELECT id, name, franchise FROM kreo_products WHERE set_number = $1", [dir]);
    if (exists.rows.length > 0) {
      const p = exists.rows[0];
      console.log(`  ⚠️  instructions/${dir}/ (${count} scans) — produit existe [${p.name}] mais pdf_path non renseigné`);
    } else {
      console.log(`  ❌ instructions/${dir}/ (${count} scans) — AUCUN produit avec ce set_number`);
    }
    orphanCount++;
    orphanFiles += count;
  }
}
if (orphanCount === 0) console.log('  Aucun');

// Inverse : pdf_path en BDD mais dossier MinIO vide
console.log('');
console.log('=== PRODUITS AVEC pdf_path MAIS SANS FICHIERS MINIO ===');
let ghostCount = 0;
for (const sn of dbSetNumbers) {
  if (!instrDirs.has(sn)) {
    const p = await pool.query("SELECT name FROM kreo_products WHERE set_number = $1", [sn]);
    console.log(`  ❌ [${sn}] ${p.rows[0]?.name || '?'} — pdf_path renseigné mais 0 fichiers dans MinIO`);
    ghostCount++;
  }
}
if (ghostCount === 0) console.log('  Aucun — tout est cohérent ✅');

// Produits par type pour voir ce qui pourrait avoir des instructions
console.log('');
console.log('=== TYPES DE PRODUITS ===');
const types = await pool.query("SELECT product_type, COUNT(*) as c, COUNT(CASE WHEN pdf_path IS NOT NULL AND pdf_path != '' THEN 1 END) as with_instr FROM kreo_products GROUP BY product_type ORDER BY c DESC");
types.rows.forEach(r => console.log(`  ${(r.product_type || 'null').padEnd(20)} : ${String(r.c).padStart(3)} produits, ${String(r.with_instr).padStart(2)} avec instructions`));

// Par franchise : couverture instructions
console.log('');
console.log('=== COUVERTURE INSTRUCTIONS PAR FRANCHISE ===');
const cov = await pool.query(`
  SELECT franchise, 
    COUNT(*) as total,
    COUNT(CASE WHEN pdf_path IS NOT NULL AND pdf_path != '' THEN 1 END) as with_instr,
    COUNT(CASE WHEN product_type = 'building_set' THEN 1 END) as sets_count,
    COUNT(CASE WHEN product_type = 'building_set' AND pdf_path IS NOT NULL AND pdf_path != '' THEN 1 END) as sets_with_instr
  FROM kreo_products GROUP BY franchise ORDER BY total DESC
`);
cov.rows.forEach(r => {
  const pctTotal = r.total > 0 ? Math.round(r.with_instr/r.total*100) : 0;
  const pctSets = r.sets_count > 0 ? Math.round(r.sets_with_instr/r.sets_count*100) : 0;
  console.log(`  ${r.franchise.padEnd(18)} : ${r.with_instr}/${r.total} (${pctTotal}%) — sets: ${r.sets_with_instr}/${r.sets_count} (${pctSets}%)`);
});

// Top 10 plus gros dossiers d'instructions
console.log('');
console.log('=== TOP 10 PLUS GROS MANUELS (nb de scans) ===');
const sorted = [...instrDirs.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10);
for (const [dir, count] of sorted) {
  const p = await pool.query("SELECT name, piece_count FROM kreo_products WHERE set_number = $1", [dir]);
  const name = p.rows[0]?.name || '?';
  const pieces = p.rows[0]?.piece_count || '?';
  console.log(`  ${dir.padEnd(10)} ${name.padEnd(40)} ${String(count).padStart(4)} scans (${pieces} pièces)`);
}

console.log('');
console.log('=== RÉSUMÉ ===');
console.log(`Dossiers instructions MinIO: ${instrDirs.size}`);
console.log(`Produits avec pdf_path BDD : ${dbSetNumbers.size}`);
console.log(`Orphelins MinIO           : ${orphanCount} (${orphanFiles} fichiers)`);
console.log(`Fantômes BDD              : ${ghostCount}`);
console.log(`Fichiers instructions     : ${[...instrDirs.values()].reduce((a,b)=>a+b, 0)}`);

await pool.end();
