/**
 * Full-sets Provider (Database)
 *
 * Archive PARTAGÉE des listes de référence de collections — « gamme complète » d'une série :
 * LEGO Fabuland, Star Wars Kenner, Les Maîtres de l'Univers, magazines (Player One, AnimeLand)…
 *
 * POURQUOI (18/08/2026) : Firehouse construisait ces listes depuis des fournisseurs externes
 * (Rebrickable, Brickset, bedetheque, manga-news…) mais ne rendait RIEN à l'archive. Or ces
 * listes accumulent un travail qui n'existe nulle part ailleurs — au premier chef les TITRES
 * FRANÇAIS D'ÉPOQUE relevés dans les catalogues et sur les boîtes : LEGO France ne traduisait
 * pas, il réécrivait (« Flower Seller » → « Narcisse le fleuriste »). Aucune base de
 * collectionneurs ne les connaît. Elles méritaient d'être conservées et partagées.
 *
 * CE QUI EST VERSÉ : le CATALOGUE seulement — référence, titre VO, titre VF, année, image.
 * JAMAIS le pointage du collectionneur (possédé, doubles, souhaits) : c'est privé et ça reste
 * chez lui.
 *
 * Comme pour les contributions carddass, l'image est déjà écrite sur le stockage par l'appelant
 * (Firehouse a accès au NAS) ; ici on n'enregistre que le chemin.
 *
 * @module domains/collectibles/providers/fullsets
 */

import { logger } from '../../../shared/utils/logger.js';
import {
  isMegaConnected as isDbConnected,
  megaQuery as query,
  megaQueryOne as queryOne,
  megaQueryAll as queryAll,
} from '../../../infrastructure/mega/index.js';

function ensureConnected() {
  if (!isDbConnected()) {
    throw new Error('Base de données non connectée');
  }
}

let tablesPretes = false;

async function ensureTables() {
  if (tablesPretes) return;
  await query(`CREATE TABLE IF NOT EXISTS fullset_collections (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(160) NOT NULL UNIQUE,
    name VARCHAR(300) NOT NULL,
    description TEXT,
    kind VARCHAR(60),
    source VARCHAR(80),
    source_ref VARCHAR(160),
    contributor VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS fullset_entries (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER NOT NULL REFERENCES fullset_collections(id) ON DELETE CASCADE,
    ref_key VARCHAR(160) NOT NULL,
    title_vo VARCHAR(400),
    title_vf VARCHAR(400),
    title_vf_source VARCHAR(200),
    year INTEGER,
    image_path TEXT,
    image_source TEXT,
    meta TEXT,
    contributor VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (collection_id, ref_key)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_fullset_entries_coll ON fullset_entries(collection_id)`);
  tablesPretes = true;
}

/**
 * Crée ou met à jour une collection de référence, puis remplace/complète ses entrées.
 * Idempotent : rejouable sans doublon (clé = slug côté collection, ref_key côté entrée).
 */
export async function contributeFullset(opts = {}) {
  ensureConnected();
  const { slug, name, description, kind, source, sourceRef, contributor, entries } = opts;
  if (!slug || !name) {
    throw new Error('slug et name requis');
  }
  await ensureTables();

  const col = await queryOne(
    `INSERT INTO fullset_collections (slug, name, description, kind, source, source_ref, contributor)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       description = COALESCE(EXCLUDED.description, fullset_collections.description),
       kind = COALESCE(EXCLUDED.kind, fullset_collections.kind),
       source = COALESCE(EXCLUDED.source, fullset_collections.source),
       source_ref = COALESCE(EXCLUDED.source_ref, fullset_collections.source_ref),
       updated_at = NOW()
     RETURNING id`,
    [slug, name, description || null, kind || null, source || null, sourceRef || null,
      contributor || null]);

  let n = 0;
  for (const e of (entries || [])) {
    if (!e || !e.refKey) continue;
    // un titre VF ne remplace JAMAIS un titre VF existant par du vide : les noms d'époque
    // sont rares et se perdraient au premier re-versement d'une source anglophone.
    await query(
      `INSERT INTO fullset_entries
         (collection_id, ref_key, title_vo, title_vf, title_vf_source, year, image_path, image_source, meta, contributor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (collection_id, ref_key) DO UPDATE SET
         title_vo = COALESCE(EXCLUDED.title_vo, fullset_entries.title_vo),
         title_vf = COALESCE(EXCLUDED.title_vf, fullset_entries.title_vf),
         title_vf_source = COALESCE(EXCLUDED.title_vf_source, fullset_entries.title_vf_source),
         year = COALESCE(EXCLUDED.year, fullset_entries.year),
         image_path = COALESCE(EXCLUDED.image_path, fullset_entries.image_path),
         image_source = COALESCE(EXCLUDED.image_source, fullset_entries.image_source),
         meta = COALESCE(EXCLUDED.meta, fullset_entries.meta),
         updated_at = NOW()`,
      [col.id, String(e.refKey), e.titleVo || null, e.titleVf || null, e.titleVfSource || null,
        e.year || null, e.imagePath || null, e.imageSource || null,
        e.meta ? JSON.stringify(e.meta) : null, contributor || null]);
    n += 1;
  }
  logger.info(`[Fullsets] Contribution « ${name} » (${slug}) : ${n} entrée(s)`);
  return { collectionId: col.id, slug, entries: n };
}

/** Liste les collections de référence archivées. */
export async function listFullsets({ limit = 100, offset = 0 } = {}) {
  ensureConnected();
  await ensureTables();
  const rows = await queryAll(
    `SELECT c.id, c.slug, c.name, c.kind, c.source, c.updated_at,
            (SELECT COUNT(*) FROM fullset_entries e WHERE e.collection_id = c.id) AS entries,
            (SELECT COUNT(*) FROM fullset_entries e WHERE e.collection_id = c.id AND e.title_vf IS NOT NULL) AS with_vf
     FROM fullset_collections c ORDER BY c.name LIMIT $1 OFFSET $2`, [limit, offset]);
  return rows;
}

/** Détail d'une collection de référence (par id ou slug) + ses entrées. */
export async function getFullset(idOrSlug) {
  ensureConnected();
  await ensureTables();
  const col = await queryOne(
    `SELECT * FROM fullset_collections WHERE slug = $1 OR id::text = $1 LIMIT 1`, [String(idOrSlug)]);
  if (!col) return null;
  const entries = await queryAll(
    `SELECT ref_key, title_vo, title_vf, title_vf_source, year, image_path, image_source
     FROM fullset_entries WHERE collection_id = $1 ORDER BY year NULLS LAST, ref_key`, [col.id]);
  return { ...col, entries };
}
