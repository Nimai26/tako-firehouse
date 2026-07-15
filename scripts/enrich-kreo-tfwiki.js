/**
 * KRE-O TFWiki Enrichment Script
 * Phase 6 du workflow KREO_SCRAPING_WORKFLOW.md
 * 
 * Enrichit les produits Transformers avec sub_line et year
 * en utilisant les données TFWiki + patterns connus.
 * 
 * Usage : node scripts/enrich-kreo-tfwiki.js [--dry-run]
 */

import pg from 'pg';
import https from 'https';

const DB_CONFIG = {
  host: '10.20.0.10',
  port: 5434,
  database: 'mega_archive',
  user: 'megauser',
  password: 'changeme123',
};

const DRY_RUN = process.argv.includes('--dry-run');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TakoAPI/1.0' }, timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Year → Sub-line mapping for Building Sets ─────────────────────────────

const YEAR_SUBLINE_MAP = {
  2011: 'Original',
  2012: 'Quest for Energon',
  2013: 'Beast Hunters',
  2014: 'Age of Extinction',
  2015: 'Robots in Disguise',
  2016: 'Budget Store',
  2017: 'Budget Store',
};

// ─── Known product → sub_line + year overrides (from TFWiki) ────────────────

const KNOWN_PRODUCTS = {
  // 2011 Building Sets
  'Bumblebee Construction Set': { year: 2011, subLine: 'Original' },
  'Autobot Jazz': { year: 2011, subLine: 'Original' },
  'Megatron': { year: 2011, subLine: 'Original' },
  'Mirage': { year: 2011, subLine: 'Original' },
  'Prowl': { year: 2011, subLine: 'Original' },
  'Autobot Ratchet': { year: 2011, subLine: 'Original' },
  'Sentinel Prime': { year: 2011, subLine: 'Original' },
  'Sideswipe': { year: 2011, subLine: 'Original' },
  'Starscream': { year: 2011, subLine: 'Original' },
  
  // 2012 - Quest for Energon
  'Battle for Energon': { year: 2012, subLine: 'Quest for Energon' },
  'Cycle Chase': { year: 2012, subLine: 'Quest for Energon' },
  'Decepticon Ambush': { year: 2012, subLine: 'Quest for Energon' },
  'Destruction Site Devastator': { year: 2012, subLine: 'Quest for Energon' },
  'Rotor Rage': { year: 2012, subLine: 'Quest for Energon' },
  'Stealth Bumblebee': { year: 2012, subLine: 'Quest for Energon' },
  'Street Showdown': { year: 2012, subLine: 'Quest for Energon' },
  
  // 2013 - Beast Hunters  
  'Autobot Command Center': { year: 2013, subLine: 'Beast Hunters' },
  'Battle Net Bumblebee Set': { year: 2013, subLine: 'Beast Hunters' },
  'Beast Blade Optimus Prime': { year: 2013, subLine: 'Beast Hunters' },
  'Dragon Assault': { year: 2013, subLine: 'Beast Hunters' },
  'Mech Venom Strike set': { year: 2013, subLine: 'Beast Hunters' },
  'Ripclaw Strike Set': { year: 2013, subLine: 'Beast Hunters' },
  
  // 2014 - Age of Extinction
  'Cell Block Breakout': { year: 2014, subLine: 'Age of Extinction' },
  'Dinobot Charge Set': { year: 2014, subLine: 'Age of Extinction' },
  'Galvatron Factory Battle': { year: 2014, subLine: 'Age of Extinction' },
  'Grimlock Street Attack Set': { year: 2014, subLine: 'Age of Extinction' },
  'Grimlock Unleashed Set': { year: 2014, subLine: 'Age of Extinction' },
  'Lockdown Air Raid': { year: 2014, subLine: 'Age of Extinction' },
  'Optimus Prime Dino Hauler': { year: 2014, subLine: 'Age of Extinction' },
  'Scorn Street Chase': { year: 2014, subLine: 'Age of Extinction' },
  
  // 2015 - Robots in Disguise
  'Optimus Prime Beast Blaster Set': { year: 2015, subLine: 'Robots in Disguise' },
  'Bumblebee Disc Demolishor Set': { year: 2015, subLine: 'Robots in Disguise' },
  'Sideswipe Roadway Rundown': { year: 2015, subLine: 'Robots in Disguise' },
  
  // Misc / multi-year
  'Quest Blaster': { year: 2012, subLine: 'Quest for Energon' },
  'Wheeljack': { year: 2012, subLine: 'Quest for Energon' },
  'Rescue Vehicle Value Brick Bucket': { year: 2013, subLine: 'Beast Hunters' },
  'Brick Bucket - 275 Pieces': { year: 2014, subLine: 'Age of Extinction' },
  'TRANSFORMERS KREON Multi-Pack': { year: 2014, subLine: 'Convention Exclusive' },
  'TRANSFORMERS Preview Series KREON MICRO-CHANGERS Figures Case Pack': { year: 2012, subLine: 'Micro-Changers' },
  'Transformers Age of Extinction Micro-Changers Combiners Firewing': { year: 2014, subLine: 'Micro-Changers Combiners' },
  'Transformers Age of Extinction Micro-Changers Combiners Icebolt Construction': { year: 2014, subLine: 'Micro-Changers Combiners' },
  'Transformers Age of Extinction Micro-Changers Combiners Volcanicon': { year: 2014, subLine: 'Micro-Changers Combiners' },
  'Transformers Micro-Changers Mystery Case Pack': { year: 2013, subLine: 'Micro-Changers' },
  'Transformers Micro-Changers Mystery Pack': { year: 2012, subLine: 'Micro-Changers' },
};

// ─── Name normalization for matching ─────────────────────────────────────────

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\s*(construction\s+)?set$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── TFWiki Parser ──────────────────────────────────────────────────────────

async function parseTFWiki() {
  const apiUrl = 'https://tfwiki.net/mediawiki/api.php?action=parse&page=Kre-O&prop=wikitext&format=json';
  const data = JSON.parse(await httpGet(apiUrl));
  const wikitext = data.parse.wikitext['*'];
  
  const products = [];
  let currentYear = null;
  let currentSubLine = null;
  let currentCollectionType = null;
  
  for (const line of wikitext.split('\n')) {
    // h3 headings: ===2011===, ===2012 (''Quest for Energon'')===
    const h3 = line.match(/^===(.+?)===$/);
    if (h3) {
      const heading = h3[1].trim();
      const yearMatch = heading.match(/^(\d{4})/);
      if (yearMatch) {
        currentYear = parseInt(yearMatch[1]);
        const subMatch = heading.match(/\(''(.+?)''\)/) || heading.match(/\("(.+?)"\)/);
        currentSubLine = subMatch ? subMatch[1] : YEAR_SUBLINE_MAP[currentYear] || null;
      }
      // Check for Blind-bagged / Combiners sub-sections
      if (heading.includes('Blind-bagged')) currentCollectionType = 'Micro-Changers';
      if (heading.includes('Combiners')) currentCollectionType = 'Micro-Changers Combiners';
    }
    
    // h2 headings
    const h2 = line.match(/^==([^=]+)==$/);
    if (h2) {
      const heading = h2[1].trim();
      if (heading === 'Micro-Changers') {
        currentCollectionType = 'Micro-Changers';
        currentYear = null;
        currentSubLine = null;
      } else if (heading === 'Custom Kreons') {
        currentCollectionType = 'Custom Kreons';
        currentYear = null;
        currentSubLine = null;
      } else if (heading === 'Building sets') {
        currentCollectionType = 'Building Sets';
        currentYear = null;
        currentSubLine = null;
      } else {
        currentCollectionType = heading;
      }
    }
    
    // Collection headers for year assignment in MC/CK sections
    const collTitle = line.match(/<u>'''(.+?)'''<\/u>/);
    if (collTitle) {
      const title = collTitle[1].replace(/'''/g, '').replace(/''/g, '');
      if (title.includes('Age of Extinction')) {
        currentYear = 2014;
        currentSubLine = 'Age of Extinction';
      } else if (title.includes('Robots in Disguise') || title.includes('RID')) {
        currentYear = 2015;
        currentSubLine = 'Robots in Disguise';
      } else if (title.includes('2017')) {
        currentYear = 2017;
        currentSubLine = 'Robots in Disguise';
      } else if (title.includes('Preview')) {
        currentYear = 2012;
      } else if (title.includes('Collection 1') && currentCollectionType === 'Micro-Changers') {
        currentYear = 2012;
      } else if (title.includes('Collection 2') && currentCollectionType === 'Micro-Changers') {
        currentYear = 2012;
      } else if (title.includes('Collection 3') && currentCollectionType === 'Micro-Changers') {
        currentYear = 2013;
      } else if (title.includes('Collection 4') && currentCollectionType === 'Micro-Changers') {
        currentYear = 2013;
      }
    }
    
    // Product entries
    const productMatch = line.match(/\[\[(?:[^|]*?\|)?([^\]]+)\]\]/);
    if (productMatch && line.includes('Bp-')) {
      products.push({
        name: productMatch[1].trim(),
        year: currentYear,
        subLine: currentSubLine || currentCollectionType,
        section: currentCollectionType,
      });
    }
    
    // Bold product lines in Building Sets
    if (line.startsWith('*') && !line.startsWith('**') && line.includes("'''")) {
      const boldMatch = line.match(/\*\s*'''(?:\[\[(?:[^|]*?\|)?([^\]]+)\]\]|([^']+))'''/);
      if (boldMatch) {
        const name = (boldMatch[1] || boldMatch[2]).trim();
        products.push({
          name,
          year: currentYear,
          subLine: currentSubLine,
          section: currentCollectionType || 'Building Sets',
        });
      }
    }
  }
  
  return products;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  KRE-O TFWiki Enrichment — Phase 6');
  console.log('═══════════════════════════════════════════════════════════');
  if (DRY_RUN) console.log('  ⚠ Mode DRY-RUN\n');
  
  // 1. Parse TFWiki
  console.log('📡 Parsing TFWiki Kre-O page...');
  const tfwikiProducts = await parseTFWiki();
  console.log(`   ${tfwikiProducts.length} entrées trouvées\n`);
  
  // 2. Load DB products
  const pool = new pg.Pool(DB_CONFIG);
  const { rows: dbProducts } = await pool.query(
    `SELECT id, set_number, name, sub_line, year, product_type, franchise 
     FROM kreo_products 
     WHERE franchise = 'transformers'
     ORDER BY name`
  );
  console.log(`📦 ${dbProducts.length} produits TF en base`);
  console.log(`   ${dbProducts.filter(p => !p.sub_line).length} sans sub_line`);
  console.log(`   ${dbProducts.filter(p => !p.year).length} sans year\n`);
  
  const stats = { subLineUpdated: 0, yearUpdated: 0, bothUpdated: 0, noMatch: 0 };
  
  // 3. Strategy A: Direct name matching against KNOWN_PRODUCTS
  console.log('🔧 Stratégie A : Matching par noms connus...');
  for (const product of dbProducts) {
    if (product.sub_line && product.year) continue;
    
    const known = KNOWN_PRODUCTS[product.name];
    if (known) {
      const updates = [];
      const values = [];
      let paramIdx = 1;
      
      if (!product.sub_line && known.subLine) {
        updates.push(`sub_line = $${paramIdx++}`);
        values.push(known.subLine);
      }
      if (!product.year && known.year) {
        updates.push(`year = $${paramIdx++}`);
        values.push(known.year);
      }
      
      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        if (!DRY_RUN) {
          await pool.query(
            `UPDATE kreo_products SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            [...values, product.id]
          );
        }
        // Update local copy
        if (known.subLine) product.sub_line = known.subLine;
        if (known.year) product.year = known.year;
        
        if (updates.length === 3) stats.bothUpdated++;
        else if (updates.length === 2 && values.length === 1) {
          if (!known.year) stats.subLineUpdated++;
          else stats.yearUpdated++;
        }
        console.log(`  ✅ ${product.set_number} ${product.name} → sub_line=${known.subLine || '-'}, year=${known.year || '-'}`);
      }
    }
  }
  
  // 4. Strategy B: Year-based sub_line assignment for sets without sub_line
  console.log('\n🔧 Stratégie B : Sub_line par année...');
  for (const product of dbProducts) {
    if (product.sub_line) continue;
    if (!product.year) continue;
    
    // Determine sub_line from product type and year
    let subLine = null;
    
    if (product.product_type === 'kreon') {
      // Individual Kreons → Micro-Changers (blind-bag) unless they're Custom Kreons
      if (product.name.includes('Custom Kreon')) {
        subLine = 'Custom Kreons';
      } else {
        subLine = 'Micro-Changers';
      }
    } else if (product.product_type === 'set') {
      // Sets → use year mapping
      subLine = YEAR_SUBLINE_MAP[product.year];
      
      // Override with name-based detection
      if (product.name.toLowerCase().includes('beast')) subLine = 'Beast Hunters';
      if (product.name.toLowerCase().includes('age of extinction') || product.name.toLowerCase().includes('aoe')) subLine = 'Age of Extinction';
      if (product.name.toLowerCase().includes('robots in disguise') || product.name.toLowerCase().includes('rid')) subLine = 'Robots in Disguise';
    } else if (product.product_type === 'combiner' || product.product_type === 'combiner-set') {
      subLine = 'Micro-Changers Combiners';
    }
    
    if (subLine) {
      if (!DRY_RUN) {
        await pool.query(
          'UPDATE kreo_products SET sub_line = $1, updated_at = NOW() WHERE id = $2',
          [subLine, product.id]
        );
      }
      product.sub_line = subLine;
      stats.subLineUpdated++;
      console.log(`  ✅ ${product.set_number} ${product.name} (${product.year}) → ${subLine}`);
    }
  }
  
  // 5. Strategy C: Name fuzzy-matching against TFWiki products for year assignment
  console.log('\n🔧 Stratégie C : Matching noms TFWiki pour années manquantes...');
  const noYear = dbProducts.filter(p => !p.year);
  
  for (const product of noYear) {
    const normalizedName = normalizeName(product.name);
    
    // Try to find in TFWiki products - require exact match to avoid false positives
    const match = tfwikiProducts.find(tw => {
      const normalizedTw = normalizeName(tw.name);
      return normalizedTw === normalizedName;
    });
    
    // Fallback: substring match only if name is long enough to be specific
    const substringMatch = !match ? tfwikiProducts.find(tw => {
      const normalizedTw = normalizeName(tw.name);
      return normalizedTw.length >= 10 && (
        normalizedName.includes(normalizedTw) || normalizedTw.includes(normalizedName)
      );
    }) : null;
    
    const finalMatch = match || substringMatch;
    if (finalMatch && finalMatch.year) {
      const updates = [];
      const values = [];
      let paramIdx = 1;
      
      if (!product.year) {
        updates.push(`year = $${paramIdx++}`);
        values.push(finalMatch.year);
      }
      if (!product.sub_line && finalMatch.subLine) {
        updates.push(`sub_line = $${paramIdx++}`);
        values.push(finalMatch.subLine);
      }
      
      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        if (!DRY_RUN) {
          await pool.query(
            `UPDATE kreo_products SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            [...values, product.id]
          );
        }
        product.year = finalMatch.year;
        if (finalMatch.subLine) product.sub_line = finalMatch.subLine;
        stats.yearUpdated++;
        console.log(`  ✅ ${product.set_number} ${product.name} → year=${finalMatch.year}, sub_line=${finalMatch.subLine || '-'}`);
      }
    } else {
      stats.noMatch++;
    }
  }
  
  // 6. Strategy D: Name pattern-based sub_line for remaining products
  console.log('\n🔧 Stratégie D : Patterns nominaux pour sub_lines restantes...');
  const stillNoSubLine = dbProducts.filter(p => !p.sub_line);
  
  for (const product of stillNoSubLine) {
    let subLine = null;
    const nameLower = product.name.toLowerCase();
    
    // Custom Kreon pattern
    if (nameLower.includes('custom kreon')) subLine = 'Custom Kreons';
    // Battle Changer pattern
    else if (nameLower.includes('battle changer')) subLine = 'Battle Changers';
    // Combiner pattern
    else if (product.product_type === 'combiner' || product.product_type === 'combiner-set') subLine = 'Micro-Changers Combiners';
    // Micro-Changers Kreons
    else if (product.product_type === 'kreon') subLine = 'Micro-Changers';
    // AOE names
    else if (nameLower.includes('dinobot') || nameLower.includes('grimlock') || nameLower.includes('lockdown') || nameLower.includes('galvatron')) {
      if (product.year === 2014) subLine = 'Age of Extinction';
    }
    // If has year, use year map
    else if (product.year && YEAR_SUBLINE_MAP[product.year]) {
      subLine = YEAR_SUBLINE_MAP[product.year];
    }
    
    if (subLine) {
      if (!DRY_RUN) {
        await pool.query(
          'UPDATE kreo_products SET sub_line = $1, updated_at = NOW() WHERE id = $2',
          [subLine, product.id]
        );
      }
      product.sub_line = subLine;
      stats.subLineUpdated++;
      console.log(`  ✅ ${product.set_number} ${product.name} → ${subLine}`);
    }
  }
  
  // 7. Summary
  const finalNoSubLine = dbProducts.filter(p => !p.sub_line).length;
  const finalNoYear = dbProducts.filter(p => !p.year).length;
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RÉSUMÉ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Sub_lines MAJ  : ${stats.subLineUpdated}`);
  console.log(`  Years MAJ      : ${stats.yearUpdated}`);
  console.log(`  Les deux MAJ   : ${stats.bothUpdated}`);
  console.log(`  Non matchés    : ${stats.noMatch}`);
  console.log(`  Reste sans sub : ${finalNoSubLine}`);
  console.log(`  Reste sans year: ${finalNoYear}`);
  console.log('═══════════════════════════════════════════════════════════');
  
  if (finalNoSubLine > 0) {
    console.log('\nProduits encore sans sub_line:');
    dbProducts.filter(p => !p.sub_line).forEach(p => 
      console.log(`  ${p.set_number.padEnd(10)} ${(p.year || '-').toString().padEnd(6)} ${p.product_type?.padEnd(12) || '?'.padEnd(12)} ${p.name}`)
    );
  }
  
  await pool.end();
}

main().catch(err => {
  console.error('\n💥 FATAL:', err);
  process.exit(1);
});
