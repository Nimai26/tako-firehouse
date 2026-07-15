#!/usr/bin/env node
/**
 * Ingest DBS Card Game data into PostgreSQL
 * 
 * Phase 1: DeckPlanet API → DBS Masters (6,219 cards, REST JSON, no auth)
 * Phase 2: dbs-cardgame.com → Fusion World (HTML scraping)
 * 
 * Usage:
 *   node scripts/ingest-dbs-cards.cjs [--phase=1|2|all] [--download-images]
 */

const pg = require('pg');
const { ProxyAgent } = require('undici');
const { writeFileSync, mkdirSync, existsSync, createWriteStream, readFileSync } = require('fs');
const { dirname } = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  deckplanet: {
    baseUrl: 'https://api.deckplanet.net/cardsearch/dbs_masters_cards',
    imageBase: 'https://multi-deckplanet.us-southeast-1.linodeobjects.com/dbs_masters',
    pageSize: 50,
  },
  
  fusionWorld: {
    baseUrl: 'https://www.dbs-cardgame.com/fw/en/cardlist/',
    imageBase: 'https://www.dbs-cardgame.com/fw/images/cards/card/en',
  },
  
  db: {
    host: '172.21.0.2',
    port: 5432,
    database: 'tako_cache',
    user: 'tako',
    password: 'changeme',
  },
  
  storage: '/mnt/egon/websites/tako-storage/dbs-archive',
  delayMs: 300,
  imageDelayMs: 50,
};

const proxyAgent = new ProxyAgent('http://localhost:8889');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let startTime = Date.now();

function log(level, msg) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const prefix = { info: '📋', warn: '⚠️', error: '❌', ok: '✅', img: '🖼️', db: '💾' }[level] || '•';
  console.log(`[${elapsed}s] ${prefix} ${msg}`);
}

async function fetchWithRetry(url, opts = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        dispatcher: proxyAgent,
        signal: AbortSignal.timeout(30000),
        ...opts,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return resp;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      log('warn', `Retry ${attempt}/${maxRetries} for ${url}: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const resp = await fetch(url, {
        dispatcher: proxyAgent,
        signal: AbortSignal.timeout(60000),
        headers: { 'User-Agent': 'Tako-API/2.5 CardIngester' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      return JSON.parse(text);
    } catch (err) {
      if (attempt === 5) throw err;
      log('warn', `Retry ${attempt}/5 for ${url}: ${err.message}`);
      await sleep(3000 * attempt);
    }
  }
}

async function fetchHtml(url) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const resp = await fetch(url, {
        dispatcher: proxyAgent,
        signal: AbortSignal.timeout(60000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (err) {
      if (attempt === 5) throw err;
      log('warn', `Retry ${attempt}/5 for ${url}: ${err.message}`);
      await sleep(3000 * attempt);
    }
  }
}

async function downloadImage(url, destPath) {
  if (existsSync(destPath)) return false;
  const dir = dirname(destPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(url, {
        dispatcher: proxyAgent,
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) return false;
      const fileStream = createWriteStream(destPath);
      await pipeline(Readable.fromWeb(resp.body), fileStream);
      return true;
    } catch (err) {
      if (attempt === 3) return false;
      await sleep(1000 * attempt);
    }
  }
  return false;
}

// ============================================================================
// DATABASE
// ============================================================================

let pool = null;

async function initDb() {
  pool = new pg.Pool({ ...CONFIG.db, max: 5 });
  const res = await pool.query('SELECT NOW()');
  log('db', `PostgreSQL connecté`);
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function closeDb() {
  if (pool) await pool.end();
}

// ============================================================================
// PHASE 1: DeckPlanet API → DBS Masters
// ============================================================================

async function phase1_deckplanet(downloadImages = false) {
  log('info', '═══════════════════════════════════════════');
  log('info', 'PHASE 1: DeckPlanet API → DBS Masters');
  log('info', '═══════════════════════════════════════════');
  
  let page = 1;
  let totalProcessed = 0;
  let totalCards = 0;
  const setsFound = new Set();
  
  // Paginate through all cards
  while (true) {
    log('info', `Fetching page ${page}...`);
    const data = await fetchJson(`${CONFIG.deckplanet.baseUrl}?page=${page}`);
    await sleep(CONFIG.delayMs);
    
    if (!data.data || data.data.length === 0) break;
    
    totalCards = data.meta?.filter_count || totalCards;
    
    for (const card of data.data) {
      try {
        await insertDeckplanetCard(card, setsFound);
        totalProcessed++;
      } catch (err) {
        log('error', `Card ${card.card_number}: ${err.message}`);
      }
    }
    
    log('ok', `Page ${page}: ${data.data.length} cartes (total: ${totalProcessed}/${totalCards})`);
    
    if (data.data.length < CONFIG.deckplanet.pageSize) break;
    page++;
  }
  
  // Update set card counts
  await query(`
    UPDATE dbs_sets s SET card_count = (
      SELECT COUNT(*) FROM dbs_cards c WHERE c.set_code = s.set_code AND c.game = s.game
    ) WHERE s.game = 'masters'
  `);
  
  log('ok', `Phase 1 terminée: ${totalProcessed} cartes Masters, ${setsFound.size} sets`);
  
  // Download images if requested
  if (downloadImages) {
    await downloadMastersImages();
  }
  
  return { totalProcessed, sets: setsFound.size };
}

async function insertDeckplanetCard(card, setsFound) {
  // Extract set code from card number (e.g. "BT1-001" → "BT1", "P-181" → "P")
  const setCode = card.card_series || extractSetCode(card.card_number);
  
  // Ensure set exists
  if (!setsFound.has(setCode)) {
    await query(`
      INSERT INTO dbs_sets (set_code, name, game, source)
      VALUES ($1, $2, 'masters', 'deckplanet')
      ON CONFLICT (set_code, game) DO UPDATE SET name = $2, updated_at = NOW()
    `, [setCode, card.card_series || setCode]);
    setsFound.add(setCode);
  }
  
  // Image URLs
  const imageUrl = `${CONFIG.deckplanet.imageBase}/${card.img_link || card.card_number}.webp`;
  const imageBackUrl = card.card_back_name 
    ? `${CONFIG.deckplanet.imageBase}/${card.img_link || card.card_number}_b.webp`
    : null;
  
  // Local paths
  const safeNum = (card.card_number || '').replace(/\//g, '_');
  const imagePath = `${CONFIG.storage}/masters/${safeNum}.webp`;
  const imageBackPath = imageBackUrl ? `${CONFIG.storage}/masters/${safeNum}_b.webp` : null;
  
  await query(`
    INSERT INTO dbs_cards (
      source_id, card_number, card_name, card_type, card_color, card_rarity,
      card_power, card_energy_cost, card_combo_cost, card_combo_power,
      card_skill, card_skill_text, card_traits, card_character, card_era, keywords,
      card_back_name, card_back_power, card_back_skill, card_back_skill_text,
      card_back_traits, card_back_character, card_back_era,
      set_code, game, is_banned, is_limited, limited_to, has_errata, erratas, variants, finishes,
      image_url, image_back_url, image_path, image_back_path,
      source, view_count
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23,
      $24, $25, $26, $27, $28, $29, $30, $31, $32,
      $33, $34, $35, $36, $37, $38
    )
    ON CONFLICT (card_number, game) DO UPDATE SET
      card_name = $3, card_type = $4, card_color = $5, card_rarity = $6,
      card_power = $7, card_skill = $11, card_skill_text = $12,
      card_traits = $13, card_character = $14, keywords = $16,
      is_banned = $26, is_limited = $27, has_errata = $29,
      erratas = $30, variants = $31,
      image_url = $33, image_back_url = $34,
      view_count = $38, updated_at = NOW()
  `, [
    card.id,
    card.card_number,
    card.card_name,
    card.card_type || null,
    card.card_color || null,
    card.card_rarity || null,
    card.card_power || null,
    card.card_energy_cost != null ? String(card.card_energy_cost) : null,
    card.card_combo_cost != null ? String(card.card_combo_cost) : null,
    card.card_combo_power || null,
    card.card_skill || null,
    card.card_skill_unstyled || null,
    JSON.stringify(card.card_traits || []),
    JSON.stringify(card.card_character || []),
    JSON.stringify(card.card_era || []),
    JSON.stringify(card.keywords || []),
    card.card_back_name || null,
    card.card_back_power || null,
    card.card_back_skill || null,
    card.card_back_skill_unstyled || null,
    JSON.stringify(card.card_back_traits || []),
    JSON.stringify(card.card_back_character || []),
    JSON.stringify(card.card_back_era || []),
    setCode,
    'masters',
    card.is_banned || false,
    card.is_limited || false,
    card.limited_to || 4,
    card.has_errata || false,
    JSON.stringify(card.erratas || []),
    JSON.stringify(card.variants || []),
    card.finishes || null,
    imageUrl,
    imageBackUrl,
    imagePath,
    imageBackPath,
    'deckplanet',
    card.view_count || 0,
  ]);
}

function extractSetCode(cardNumber) {
  if (!cardNumber) return 'UNKNOWN';
  const match = cardNumber.match(/^([A-Z]+\d*)/);
  return match ? match[1] : cardNumber.split('-')[0] || 'UNKNOWN';
}

async function downloadMastersImages() {
  log('info', 'Téléchargement des images Masters...');
  
  const cards = (await query(
    `SELECT card_number, image_url, image_back_url, image_path, image_back_path
     FROM dbs_cards WHERE game = 'masters' ORDER BY card_number`
  )).rows;
  
  let downloaded = 0;
  let errors = 0;
  
  for (const card of cards) {
    try {
      if (card.image_url && card.image_path) {
        const ok = await downloadImage(card.image_url, card.image_path);
        if (ok) downloaded++;
      }
      if (card.image_back_url && card.image_back_path) {
        const ok = await downloadImage(card.image_back_url, card.image_back_path);
        if (ok) downloaded++;
      }
    } catch (err) {
      errors++;
    }
    await sleep(CONFIG.imageDelayMs);
    
    if (downloaded % 500 === 0 && downloaded > 0) {
      log('img', `${downloaded} images téléchargées (${errors} erreurs)`);
    }
  }
  
  log('ok', `Images Masters: ${downloaded} téléchargées, ${errors} erreurs`);
}

// ============================================================================
// PHASE 2: dbs-cardgame.com → Fusion World
// ============================================================================

const FW_CATEGORIES = {
  '583009': 'BOOSTER PACK -DUAL EVOLUTION- [FB09]',
  '583008': 'BOOSTER PACK -SAIYAN\'s PRIDE- [FB08]',
  '583202': 'MANGA BOOSTER 02 [SB02]',
  '583007': 'BOOSTER PACK -WISH FOR SHENRON- [FB07]',
  '583201': 'MANGA BOOSTER 01 [SB01]',
  '583006': 'BOOSTER PACK -RIVALS CLASH- [FB06]',
  '583005': 'BOOSTER PACK -NEW ADVENTURE- [FB05]',
  '583004': 'BOOSTER PACK -ULTRA LIMIT- [FB04]',
  '583003': 'BOOSTER PACK -RAGING ROAR- [FB03]',
  '583002': 'BOOSTER PACK -BLAZING AURA- [FB02]',
  '583001': 'BOOSTER PACK -AWAKENED PULSE- [FB01]',
  '583112': 'STARTER DECK EX THE BEAT OF KI [FS12]',
  '583111': 'STARTER DECK EX THE PHASE OF EVOLUTION [FS11]',
  '583110': 'STARTER DECK EX GIBLET [FS10]',
  '583109': 'STARTER DECK EX SHALLOT [FS09]',
  '583108': 'STARTER DECK -VEGETA(MINI) SUPER SAIYAN 3- [FS08]',
  '583107': 'STARTER DECK -VEGETA(MINI)- [FS07]',
  '583106': 'STARTER DECK -SON GOKU(MINI)- [FS06]',
  '583105': 'STARTER DECK -BARDOCK- [FS05]',
  '583104': 'STARTER DECK -FRIEZA- [FS04]',
  '583103': 'STARTER DECK -BROLY- [FS03]',
  '583102': 'STARTER DECK -VEGETA- [FS02]',
  '583101': 'STARTER DECK -SON GOKU- [FS01]',
  '583901': 'Promotion Card',
  '583902': 'Release Event Pack',
};

async function phase2_fusionWorld(downloadImages = false) {
  log('info', '═══════════════════════════════════════════');
  log('info', 'PHASE 2: Bandai Official → Fusion World');
  log('info', '═══════════════════════════════════════════');
  
  // Step 1: Collect all unique card numbers from category pages
  const allCardNumbers = new Map(); // cardNumber → setName
  
  for (const [catId, catName] of Object.entries(FW_CATEGORIES)) {
    log('info', `Catégorie ${catId}: ${catName}`);
    const url = `https://www.dbs-cardgame.com/fw/en/cardlist/?search=true&category%5B%5D=${catId}`;
    
    try {
      const html = await fetchHtml(url);
      // Extract card_no values (without variant params like &p=_p1)
      const matches = [...html.matchAll(/card_no=([A-Z0-9-]+)/g)];
      const unique = [...new Set(matches.map(m => m[1]))];
      
      for (const cn of unique) {
        if (!allCardNumbers.has(cn)) {
          allCardNumbers.set(cn, catName);
        }
      }
      
      log('ok', `  → ${unique.length} cartes uniques (total cumulé: ${allCardNumbers.size})`);
    } catch (err) {
      log('error', `  → Erreur: ${err.message}`);
    }
    
    await sleep(500);
  }
  
  log('info', `Total: ${allCardNumbers.size} cartes uniques à scraper`);
  
  // Step 2: Fetch detail.php for each card
  const setsFound = new Set();
  let inserted = 0;
  let errors = 0;
  const total = allCardNumbers.size;
  let processed = 0;
  
  for (const [cardNumber, setName] of allCardNumbers.entries()) {
    processed++;
    
    try {
      const detailUrl = `https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=${cardNumber}`;
      const html = await fetchHtml(detailUrl);
      const card = parseFWDetail(html, cardNumber);
      
      if (!card) {
        log('warn', `Pas de données pour ${cardNumber}`);
        errors++;
        continue;
      }
      
      const setCode = extractSetCode(cardNumber);
      
      if (!setsFound.has(setCode)) {
        await query(`
          INSERT INTO dbs_sets (set_code, name, game, source)
          VALUES ($1, $2, 'fusion_world', 'bandai_official')
          ON CONFLICT (set_code, game) DO UPDATE SET name = $2, updated_at = NOW()
        `, [setCode, card.setName || setName || setCode]);
        setsFound.add(setCode);
      }
      
      // Leaders: use _f and _b suffixes; others: plain .webp
      const hasBack = card.hasBack;
      const isLeader = card.cardType === 'LEADER';
      const imageUrl = isLeader
        ? `https://www.dbs-cardgame.com/fw/images/cards/card/en/${cardNumber}_f.webp`
        : `https://www.dbs-cardgame.com/fw/images/cards/card/en/${cardNumber}.webp`;
      const imageBackUrl = hasBack ? `https://www.dbs-cardgame.com/fw/images/cards/card/en/${cardNumber}_b.webp` : null;
      const safeNum = cardNumber.replace(/\//g, '_');
      const imagePath = isLeader
        ? `${CONFIG.storage}/fusion_world/${safeNum}_f.webp`
        : `${CONFIG.storage}/fusion_world/${safeNum}.webp`;
      const imageBackPath = hasBack ? `${CONFIG.storage}/fusion_world/${safeNum}_b.webp` : null;
      
      await query(`
        INSERT INTO dbs_cards (
          card_number, card_name, card_type, card_color, card_rarity,
          card_power, card_energy_cost, card_combo_cost, card_combo_power,
          card_skill_text, card_traits,
          card_back_name, card_back_power, card_back_skill_text, card_back_traits,
          set_code, game, image_url, image_back_url, image_path, image_back_path, source
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (card_number, game) DO UPDATE SET
          card_name=$2, card_type=$3, card_color=$4, card_rarity=$5,
          card_power=$6, card_energy_cost=$7, card_combo_cost=$8, card_combo_power=$9,
          card_skill_text=$10, card_traits=$11,
          card_back_name=$12, card_back_power=$13, card_back_skill_text=$14, card_back_traits=$15,
          image_url=$18, image_back_url=$19, updated_at=NOW()
      `, [
        cardNumber,
        card.cardName,
        card.cardType,
        card.cardColor,
        card.rarity,
        card.power,
        card.energyCost,
        card.comboCost,
        card.comboPower,
        card.skill,
        JSON.stringify(card.traits || []),
        card.backName,
        card.backPower,
        card.backSkill,
        JSON.stringify(card.backTraits || []),
        setCode,
        'fusion_world',
        imageUrl,
        imageBackUrl,
        imagePath,
        imageBackPath,
        'bandai_official',
      ]);
      
      inserted++;
    } catch (err) {
      log('error', `${cardNumber}: ${err.message}`);
      errors++;
    }
    
    if (processed % 50 === 0) {
      log('info', `Progression: ${processed}/${total} (${inserted} insérées, ${errors} erreurs)`);
    }
    
    await sleep(CONFIG.delayMs);
  }
  
  // Update set card counts
  await query(`
    UPDATE dbs_sets s SET card_count = (
      SELECT COUNT(*) FROM dbs_cards c WHERE c.set_code = s.set_code AND c.game = s.game
    ) WHERE s.game = 'fusion_world'
  `);
  
  log('ok', `Phase 2 terminée: ${inserted} cartes Fusion World, ${setsFound.size} sets, ${errors} erreurs`);
  
  if (downloadImages) {
    await downloadFusionWorldImages();
  }
  
  return { inserted, sets: setsFound.size };
}

function parseFWDetail(html, cardNumber) {
  // Helper to extract text between tags
  const extractAfterH6 = (label) => {
    const regex = new RegExp(`<h6>${label}</h6>[\\s\\S]*?<div class="data[^"]*">([\\s\\S]*?)</div>`, 'i');
    const m = html.match(regex);
    if (!m) return null;
    return m[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
  };
  
  const extractDataField = (label, className) => {
    const regex = new RegExp(`<h6>${label}</h6>[\\s\\S]*?<div class="data[^"]*${className || ''}[^"]*">([\\s\\S]*?)</div>`, 'i');
    const m = html.match(regex);
    if (!m) return null;
    return m[1].replace(/<[^>]+>/g, '').trim();
  };
  
  // Card name (Leader cards have is-front, non-Leaders don't)
  const nameMatchFront = html.match(/<h1 class="cardName is-front">([^<]+)<\/h1>/);
  const nameMatchSimple = html.match(/<h1 class="cardName">([^<]+)<\/h1>/);
  const cardName = (nameMatchFront ? nameMatchFront[1] : nameMatchSimple ? nameMatchSimple[1] : '').trim();
  if (!cardName) return null;
  
  // Back name (for leaders)
  const backNameMatch = html.match(/<h1 class="cardName is-back">([^<]+)<\/h1>/);
  const backName = backNameMatch ? backNameMatch[1].trim() : null;
  
  // Has back?
  const hasBack = html.includes('img-back');
  
  // Card type
  const typeMatch = html.match(/<h6>Card type<\/h6>\s*<div class="data">([^<]+)<\/div>/i);
  const cardType = typeMatch ? typeMatch[1].trim() : null;
  
  // Color - extract from colValue elements
  const colorMatches = [...html.matchAll(/data-color="([^"]+)"/g)];
  const cardColor = colorMatches.length > 0 
    ? [...new Set(colorMatches.map(m => m[1]))].join('/')
    : null;
  
  // Rarity (two possible formats)
  const rarityMatch = html.match(/<h6>Rarity<\/h6>\s*<div class="data[^"]*">([^<]+)<\/div>/i);
  const rarityMatch2 = html.match(/<div class="rarity">([^<]+)<\/div>/i);
  const rarity = (rarityMatch ? rarityMatch[1] : rarityMatch2 ? rarityMatch2[1] : '').trim() || null;
  
  // Cost
  const costMatch = html.match(/<h6>Cost<\/h6>\s*<div class="data">([^<]+)<\/div>/i);
  const energyCost = costMatch ? costMatch[1].trim().replace('-', '') || null : null;
  
  // Power (front)
  const powerFrontMatch = html.match(/<h6>Power<\/h6>[\s\S]*?<div class="data is-front">([^<]+)<\/div>/i);
  const powerSimpleMatch = html.match(/<h6>Power<\/h6>\s*<div class="data">([^<]+)<\/div>/i);
  const power = (powerFrontMatch ? powerFrontMatch[1] : powerSimpleMatch ? powerSimpleMatch[1] : '').trim().replace('-', '') || null;
  
  // Power (back)
  const powerBackMatch = html.match(/<h6>Power<\/h6>[\s\S]*?<div class="data is-back">([^<]+)<\/div>/i);
  const backPower = powerBackMatch ? powerBackMatch[1].trim().replace('-', '') || null : null;
  
  // Combo power
  const comboMatch = html.match(/<h6>Combo power<\/h6>\s*<div class="data">([^<]+)<\/div>/i);
  const comboPower = comboMatch ? comboMatch[1].trim().replace('-', '') || null : null;
  
  // Special Traits (front)
  const traitsFrontMatch = html.match(/<h6>Special Traits<\/h6>[\s\S]*?<div class="data is-front">([^<]+)<\/div>/i);
  const traitsSimpleMatch = html.match(/<h6>Special Traits<\/h6>[\s\S]*?<div class="data">\s*(?:<div class="data[^"]*">)?([^<]+)/i);
  const traitsRaw = (traitsFrontMatch ? traitsFrontMatch[1] : traitsSimpleMatch ? traitsSimpleMatch[1] : '').trim();
  const traits = traitsRaw ? traitsRaw.split('/').map(t => t.trim()).filter(Boolean) : [];
  
  // Special Traits (back)
  const traitsBackMatch = html.match(/<h6>Special Traits<\/h6>[\s\S]*?<div class="data is-back">([^<]+)<\/div>/i);
  const backTraits = traitsBackMatch ? traitsBackMatch[1].trim().split('/').map(t => t.trim()).filter(Boolean) : [];
  
  // Skills (front) - keep HTML for rich text
  const skillFrontMatch = html.match(/<h6>Skills<\/h6>[\s\S]*?<div class="data[^"]*is-front[^"]*dataEffect">([^]*?)<\/div>/i);
  const skillSimpleMatch = html.match(/<h6>Skills<\/h6>[\s\S]*?<div class="data[^"]*dataEffect">([^]*?)<\/div>/i);
  const skillRaw = skillFrontMatch ? skillFrontMatch[1] : skillSimpleMatch ? skillSimpleMatch[1] : '';
  const skill = skillRaw.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\n+/g, '\n').trim() || null;
  
  // Skills (back)
  const skillBackMatch = html.match(/<h6>Skills<\/h6>[\s\S]*?<div class="data[^"]*is-back[^"]*dataEffect">([^]*?)<\/div>/i);
  const backSkillHtml = skillBackMatch ? skillBackMatch[1] : '';
  const backSkill = backSkillHtml.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#039;/g, "'").trim() || null;
  
  // Set name from "Where to get it"
  const setMatch = html.match(/<h6>Where to get it<\/h6>\s*<div class="data[^"]*">([^<]+)<\/div>/i);
  const setName = setMatch ? setMatch[1].trim() : null;
  
  // Combo cost (specified cost)
  const comboCostMatch = html.match(/<h6>Specified cost<\/h6>[\s\S]*?<div class="data[^"]*">\s*([^<]+)/i);
  const comboCost = comboCostMatch ? comboCostMatch[1].trim().replace('-', '') || null : null;
  
  return {
    cardName,
    cardType,
    cardColor,
    rarity,
    power,
    energyCost,
    comboCost,
    comboPower,
    skill,
    traits,
    backName: hasBack ? backName : null,
    backPower,
    backSkill,
    backTraits,
    setName,
    hasBack,
  };
}

async function downloadFusionWorldImages() {
  log('info', 'Téléchargement des images Fusion World...');
  
  const cards = (await query(
    `SELECT card_number, image_url, image_back_url, image_path, image_back_path
     FROM dbs_cards WHERE game = 'fusion_world' ORDER BY card_number`
  )).rows;
  
  let downloaded = 0;
  let errors = 0;
  for (const card of cards) {
    try {
      if (card.image_url && card.image_path) {
        const ok = await downloadImage(card.image_url, card.image_path);
        if (ok) downloaded++;
      }
      if (card.image_back_url && card.image_back_path) {
        const ok = await downloadImage(card.image_back_url, card.image_back_path);
        if (ok) downloaded++;
      }
    } catch (err) { errors++; }
    await sleep(CONFIG.imageDelayMs);
    
    if (downloaded % 500 === 0 && downloaded > 0) {
      log('img', `${downloaded} images FW téléchargées (${errors} erreurs)`);
    }
  }
  
  log('ok', `Images Fusion World: ${downloaded} téléchargées, ${errors} erreurs`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find(a => a.startsWith('--phase='))?.split('=')[1] || 'all';
  const dlImages = args.includes('--download-images');
  
  log('info', '╔═══════════════════════════════════════════════╗');
  log('info', '║   DBS Card Game → Tako API Ingester            ║');
  log('info', '║   Masters (6219) + Fusion World               ║');
  log('info', '╚═══════════════════════════════════════════════╝');
  log('info', `Phase: ${phase} | Images: ${dlImages}`);
  
  await initDb();
  
  try {
    if (phase === 'all' || phase === '1') {
      await phase1_deckplanet(dlImages);
    }
    
    if (phase === 'all' || phase === '2') {
      await phase2_fusionWorld(dlImages);
    }
    
    // Final stats
    const mastersCount = (await query("SELECT COUNT(*) as c FROM dbs_cards WHERE game='masters'")).rows[0].c;
    const fwCount = (await query("SELECT COUNT(*) as c FROM dbs_cards WHERE game='fusion_world'")).rows[0].c;
    const setsCount = (await query("SELECT COUNT(*) as c FROM dbs_sets")).rows[0].c;
    
    log('ok', '═══════════════════════════════════════════');
    log('ok', 'INGESTION TERMINÉE');
    log('ok', `Masters: ${mastersCount} cartes`);
    log('ok', `Fusion World: ${fwCount} cartes`);
    log('ok', `Sets: ${setsCount} total`);
    log('ok', `Durée: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
    log('ok', '═══════════════════════════════════════════');
    
  } catch (err) {
    log('error', `ERREUR: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
