-- Seed: ConsoleVariations Archive Table
-- Source: consolevariations.com (12 016 variations de consoles/manettes/accessoires)
-- Le site a refondu ses URLs (scraping live → 404) : on lit désormais l'ARCHIVE LOCALE
-- pré-scrapée (consolevariations-archive/_metadata.jsonl + img/), sur le même principe
-- que Carddass. Table créée ici, données peuplées par scripts/import-consolevariations.py.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS consolevariations_items (
  slug          TEXT PRIMARY KEY,
  name          TEXT,
  description   TEXT,
  brand         TEXT,
  platform      TEXT,
  type          TEXT,           -- console | controller | accessory (déduit à l'import)
  rarity_score  INTEGER,
  rarity_tier   TEXT,
  image_main    TEXT,
  images        JSONB,          -- chemins relatifs dans l'archive (img/<path>)
  breadcrumb    JSONB,
  props         JSONB,          -- Release Type, Region Code, Amount Produced, Color, Is Bundle…
  url           TEXT,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cv_name_trgm ON consolevariations_items USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cv_brand    ON consolevariations_items(brand);
CREATE INDEX IF NOT EXISTS idx_cv_platform ON consolevariations_items(platform);
CREATE INDEX IF NOT EXISTS idx_cv_type     ON consolevariations_items(type);
