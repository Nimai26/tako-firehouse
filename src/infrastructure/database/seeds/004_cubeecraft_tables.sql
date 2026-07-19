-- Seed: Cubeecraft Archive Table
-- Source: cubeecraft.com (site ABANDONNÉ, archivé 2026-07-19) — ~751 modèles papercraft
-- Table créée ici ; données peuplées par le loader séparé (load_cubeecraft.mjs) depuis
-- /mnt/storage/cubeecraft-archive/_metadata.jsonl. Fichiers (patrons + vignettes) servis via
-- FILE_BASE_URL/cubeecraft-archive/{slug}/... (rsync offsite Egon).

CREATE TABLE IF NOT EXISTS cubeecraft_products (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(500),
  url TEXT,
  categories JSONB DEFAULT '[]'::jsonb,
  thumb_path VARCHAR(500),
  patron_file VARCHAR(255),
  patron_pages JSONB DEFAULT '[]'::jsonb,
  source VARCHAR(100) DEFAULT 'cubeecraft.com',
  license TEXT,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cubeecraft_slug ON cubeecraft_products(slug);
CREATE INDEX IF NOT EXISTS idx_cubeecraft_name ON cubeecraft_products(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_cubeecraft_cats ON cubeecraft_products USING GIN(categories);
