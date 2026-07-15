-- Seed: Carddass Archive Tables
-- Source: animecollection.fr (31,685 cards, 80 licenses, 336 collections, 733 series)
-- Tables créées ici, données peuplées par le scraper carddass séparé
--
-- IMPORTANT: Chaque CREATE TABLE est suivi de ALTER TABLE ADD COLUMN IF NOT EXISTS
-- pour permettre l'évolution du schéma lors des mises à jour d'image Docker.
-- (CREATE TABLE IF NOT EXISTS ne rajoute pas les colonnes manquantes)

-- ═══════════════════════════════════════════════════════════
-- TABLE 1: carddass_licenses (80 licences)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS carddass_licenses (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  image_path VARCHAR(500),
  banner_url TEXT,
  banner_path VARCHAR(500),
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schema evolution: colonnes ajoutées après la création initiale
ALTER TABLE carddass_licenses ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE carddass_licenses ADD COLUMN IF NOT EXISTS banner_path VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_carddass_licenses_source ON carddass_licenses(source_id);
CREATE INDEX IF NOT EXISTS idx_carddass_licenses_name ON carddass_licenses(name);

-- ═══════════════════════════════════════════════════════════
-- TABLE 2: carddass_collections (336 collections)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS carddass_collections (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL,
  license_id INTEGER NOT NULL REFERENCES carddass_licenses(id),
  name VARCHAR(255) NOT NULL,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, license_id)
);

CREATE INDEX IF NOT EXISTS idx_carddass_collections_license ON carddass_collections(license_id);
CREATE INDEX IF NOT EXISTS idx_carddass_collections_source ON carddass_collections(source_id);

-- ═══════════════════════════════════════════════════════════
-- TABLE 3: carddass_series (733 séries)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS carddass_series (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL,
  collection_id INTEGER NOT NULL REFERENCES carddass_collections(id),
  license_source_id INTEGER,
  collection_source_id INTEGER,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  capsule_url TEXT,
  capsule_path VARCHAR(500),
  card_count INTEGER,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, collection_id)
);

-- Schema evolution: colonnes ajoutées par le scraper
ALTER TABLE carddass_series ADD COLUMN IF NOT EXISTS license_source_id INTEGER;
ALTER TABLE carddass_series ADD COLUMN IF NOT EXISTS collection_source_id INTEGER;
ALTER TABLE carddass_series ADD COLUMN IF NOT EXISTS capsule_path VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_carddass_series_collection ON carddass_series(collection_id);
CREATE INDEX IF NOT EXISTS idx_carddass_series_source ON carddass_series(source_id);

-- ═══════════════════════════════════════════════════════════
-- TABLE 4: carddass_cards (~31,685 cartes)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS carddass_cards (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL UNIQUE,
  series_id INTEGER NOT NULL REFERENCES carddass_series(id),
  card_number VARCHAR(100) NOT NULL,
  rarity VARCHAR(100),
  rarity_color VARCHAR(50),
  
  -- URLs source (relatives à http://www.animecollection.fr/)
  image_url_thumb TEXT,
  image_url_hd TEXT,
  
  -- Chemins locaux après download
  image_path_thumb VARCHAR(500),
  image_path_hd VARCHAR(500),
  
  -- Métadonnées AJAX (redondantes mais utiles)
  license_name VARCHAR(255),
  collection_name VARCHAR(255),
  series_name VARCHAR(255),
  
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schema evolution
ALTER TABLE carddass_cards ADD COLUMN IF NOT EXISTS rarity_color VARCHAR(50);
ALTER TABLE carddass_cards ADD COLUMN IF NOT EXISTS image_path_thumb VARCHAR(500);
ALTER TABLE carddass_cards ADD COLUMN IF NOT EXISTS image_path_hd VARCHAR(500);
ALTER TABLE carddass_cards ADD COLUMN IF NOT EXISTS license_name VARCHAR(255);
ALTER TABLE carddass_cards ADD COLUMN IF NOT EXISTS collection_name VARCHAR(255);
ALTER TABLE carddass_cards ADD COLUMN IF NOT EXISTS series_name VARCHAR(255);
-- Migration: card_number élargi de VARCHAR(20) à VARCHAR(100)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'carddass_cards' AND column_name = 'card_number'
    AND character_maximum_length < 100
  ) THEN
    ALTER TABLE carddass_cards ALTER COLUMN card_number TYPE VARCHAR(100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_carddass_cards_series ON carddass_cards(series_id);
CREATE INDEX IF NOT EXISTS idx_carddass_cards_rarity ON carddass_cards(rarity);
CREATE INDEX IF NOT EXISTS idx_carddass_cards_source ON carddass_cards(source_id);
CREATE INDEX IF NOT EXISTS idx_carddass_cards_number ON carddass_cards(card_number);

-- ═══════════════════════════════════════════════════════════
-- TABLE 5: carddass_extra_images (~6,386 images supplémentaires)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS carddass_extra_images (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL UNIQUE,
  card_id INTEGER NOT NULL REFERENCES carddass_cards(id),
  label VARCHAR(100),
  image_url_thumb TEXT,
  image_url_hd TEXT,
  image_path_thumb VARCHAR(500),
  image_path_hd VARCHAR(500),
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schema evolution
ALTER TABLE carddass_extra_images ADD COLUMN IF NOT EXISTS image_path_thumb VARCHAR(500);
ALTER TABLE carddass_extra_images ADD COLUMN IF NOT EXISTS image_path_hd VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_carddass_extra_card ON carddass_extra_images(card_id);

-- ═══════════════════════════════════════════════════════════
-- TABLE 6: carddass_packagings (~1,734 packagings)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS carddass_packagings (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL UNIQUE,
  series_id INTEGER NOT NULL REFERENCES carddass_series(id),
  label VARCHAR(100),
  rarity VARCHAR(100),
  image_url TEXT,
  image_path VARCHAR(500),
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schema evolution: colonne rarity ajoutée par le scraper
ALTER TABLE carddass_packagings ADD COLUMN IF NOT EXISTS rarity VARCHAR(100);
ALTER TABLE carddass_packagings ADD COLUMN IF NOT EXISTS image_path VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_carddass_pack_series ON carddass_packagings(series_id);

-- ═══════════════════════════════════════════════════════════
-- TABLE 7: carddass_scraping_progress (tracking du scraping)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS carddass_scraping_progress (
  id SERIAL PRIMARY KEY,
  phase VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_source_id INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  UNIQUE(entity_type, entity_source_id)
);

CREATE INDEX IF NOT EXISTS idx_carddass_scraping_status ON carddass_scraping_progress(status);
CREATE INDEX IF NOT EXISTS idx_carddass_scraping_phase ON carddass_scraping_progress(phase);
