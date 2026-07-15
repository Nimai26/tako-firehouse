#!/usr/bin/env node
/**
 * Download Fusion World images from corrected URLs in DB.
 * Skips already-downloaded files.
 */
const pg = require('pg');
const { ProxyAgent } = require('undici');
const { existsSync, mkdirSync, createWriteStream } = require('fs');
const { dirname } = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const proxy = new ProxyAgent('http://localhost:8889');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadImage(url, dest) {
  if (existsSync(dest)) return 'skip';
  const dir = dirname(dest);
  if (existsSync(dir) === false) mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 3; i++) {
    try {
      const resp = await fetch(url, { dispatcher: proxy, signal: AbortSignal.timeout(30000) });
      if (resp.ok === false) { console.log('  HTTP', resp.status, url); return 'fail'; }
      await pipeline(Readable.fromWeb(resp.body), createWriteStream(dest));
      return 'ok';
    } catch (e) {
      if (i === 3) { console.log('  FAIL', url, e.message); return 'fail'; }
      await sleep(1000 * i);
    }
  }
  return 'fail';
}

(async () => {
  const pool = new pg.Pool({ host: '172.21.0.2', port: 5432, database: 'tako_cache', user: 'tako', password: 'changeme', max: 3 });
  const { rows } = await pool.query(
    "SELECT card_number, image_url, image_back_url, image_path, image_back_path FROM dbs_cards WHERE game='fusion_world' ORDER BY card_number"
  );
  console.log('Total FW cards:', rows.length);
  let dl = 0, skip = 0, fail = 0;

  for (const c of rows) {
    if (c.image_url && c.image_path) {
      const r = await downloadImage(c.image_url, c.image_path);
      if (r === 'ok') dl++;
      else if (r === 'skip') skip++;
      else fail++;
    }
    if (c.image_back_url && c.image_back_path) {
      const r = await downloadImage(c.image_back_url, c.image_back_path);
      if (r === 'ok') dl++;
      else if (r === 'skip') skip++;
      else fail++;
    }
    if (dl > 0 && dl % 200 === 0) console.log(`  ${dl} downloaded, ${skip} skipped, ${fail} failed`);
    await sleep(50);
  }
  console.log(`\nDONE: ${dl} downloaded, ${skip} skipped, ${fail} failed`);
  await pool.end();
})();
