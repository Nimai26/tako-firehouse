-- Migration 004: Add source_site column to all carddass tables
-- Needed to support multiple source sites (animecollection.fr, dbzcollection.fr, onepiececollection.fr)
-- Previously source_id was unique per-table, but different sites can have overlapping IDs.

-- 1. Add source_site column to all tables
ALTER TABLE carddass_licenses ADD COLUMN IF NOT EXISTS source_site VARCHAR(50) DEFAULT 'animecollection';
ALTER TABLE carddass_collections ADD COLUMN IF NOT EXISTS source_site VARCHAR(50) DEFAULT 'animecollection';
ALTER TABLE carddass_series ADD COLUMN IF NOT EXISTS source_site VARCHAR(50) DEFAULT 'animecollection';
ALTER TABLE carddass_cards ADD COLUMN IF NOT EXISTS source_site VARCHAR(50) DEFAULT 'animecollection';
ALTER TABLE carddass_extra_images ADD COLUMN IF NOT EXISTS source_site VARCHAR(50) DEFAULT 'animecollection';
ALTER TABLE carddass_packagings ADD COLUMN IF NOT EXISTS source_site VARCHAR(50) DEFAULT 'animecollection';

-- 2. Drop old unique constraints that don't include source_site
-- carddass_cards: source_id was globally unique — now needs (source_id, source_site)
ALTER TABLE carddass_cards DROP CONSTRAINT IF EXISTS carddass_cards_source_id_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carddass_cards_source_site_uniq') THEN
    ALTER TABLE carddass_cards ADD CONSTRAINT carddass_cards_source_site_uniq UNIQUE (source_id, source_site);
  END IF;
END $$;

-- carddass_licenses: source_id was globally unique — now needs (source_id, source_site)
ALTER TABLE carddass_licenses DROP CONSTRAINT IF EXISTS carddass_licenses_source_id_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carddass_licenses_source_site_uniq') THEN
    ALTER TABLE carddass_licenses ADD CONSTRAINT carddass_licenses_source_site_uniq UNIQUE (source_id, source_site);
  END IF;
END $$;

-- carddass_collections: (source_id, license_id) was unique — now needs (source_id, license_id, source_site)
ALTER TABLE carddass_collections DROP CONSTRAINT IF EXISTS carddass_collections_source_id_license_id_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carddass_collections_source_site_uniq') THEN
    ALTER TABLE carddass_collections ADD CONSTRAINT carddass_collections_source_site_uniq UNIQUE (source_id, license_id, source_site);
  END IF;
END $$;

-- carddass_series: (source_id, collection_id) was unique — now needs (source_id, collection_id, source_site)
ALTER TABLE carddass_series DROP CONSTRAINT IF EXISTS carddass_series_source_id_collection_id_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carddass_series_source_site_uniq') THEN
    ALTER TABLE carddass_series ADD CONSTRAINT carddass_series_source_site_uniq UNIQUE (source_id, collection_id, source_site);
  END IF;
END $$;

-- 3. Create indexes on source_site
CREATE INDEX IF NOT EXISTS idx_carddass_cards_source_site ON carddass_cards(source_site);
CREATE INDEX IF NOT EXISTS idx_carddass_licenses_source_site ON carddass_licenses(source_site);
CREATE INDEX IF NOT EXISTS idx_carddass_collections_source_site ON carddass_collections(source_site);
CREATE INDEX IF NOT EXISTS idx_carddass_series_source_site ON carddass_series(source_site);
