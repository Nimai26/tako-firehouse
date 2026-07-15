import pg from 'pg';
const pool = new pg.Pool({ host:'10.20.0.10', port:5434, database:'mega_archive', user:'megauser', password:'changeme123' });

// Chercher les noms exacts dans la BDD pour quelques orphelins connus
const names = ['Arcee','Bulkhead','Cheetor','Dirge','Inferno','Kickback','Ramjet','Scourge','Waspinator','Hoist','Blast-Off','Bludgeon','Acid Wing','Airachnid','Beachcomber','Blight','Crankstart','Groove','Guzzle','Hardshell','Hook','Huffer','Long Haul','Nosecone','Perceptor','Powerglide','Rampage','Scorpinok','Seawing','Sharkticon','Sunstorm','Thrust','Warpath','Haunted Hideaway','Shoreline Strike','Capture Cruiser'];

for (const n of names) {
  const pattern = `%${n}%`;
  const res = await pool.query('SELECT id, set_number, name, product_type, sub_line FROM kreo_products WHERE name ILIKE $1 ORDER BY name', [pattern]);
  if (res.rows.length > 0) {
    res.rows.forEach(r => console.log(`✅ ${n.padEnd(20)} → [${(r.set_number||'?').padEnd(8)}] ${r.name.padEnd(50)} type=${r.product_type} sub=${r.sub_line}`));
  } else {
    console.log(`❌ ${n.padEnd(20)} → PAS EN BDD`);
  }
}

console.log('');
console.log('=== EXEMPLES DE KREONS MICRO-CHANGERS EN BDD ===');
const mc = await pool.query("SELECT set_number, name FROM kreo_products WHERE sub_line = 'Micro-Changers' LIMIT 20");
mc.rows.forEach(r => console.log(`  [${(r.set_number||'?').padEnd(8)}] ${r.name}`));

console.log('');
console.log('=== TOTAL PRODUITS PAR NOM APPROCHANT ===');
// Essai trigram : rechercher par similarité
const orphanSlugs = ['acid-wing','airachnid','arcee','beachcomber','blast-off','blight','bludgeon','bulkhead','cheetor','crankstart','dirge','groove','guzzle','hardshell','haunted-hideaway','hoist','hook','huffer','inferno','kickback','long-haul','nosecone','perceptor','powerglide','ramjet','rampage','scorpinok','scourge','seawing','sharkticon','shoreline-strike','sunstorm','thrust','warpath','waspinator'];

for (const slug of orphanSlugs) {
  const name = slug.replace(/-/g, ' ');
  const res = await pool.query(
    "SELECT set_number, name, similarity(LOWER(name), $1) as sim FROM kreo_products WHERE similarity(LOWER(name), $1) > 0.15 ORDER BY sim DESC LIMIT 2",
    [name]
  );
  if (res.rows.length > 0) {
    res.rows.forEach(r => console.log(`  ${slug.padEnd(20)} → [${r.set_number}] ${r.name} (sim=${r.sim.toFixed(2)})`));
  }
}

await pool.end();
