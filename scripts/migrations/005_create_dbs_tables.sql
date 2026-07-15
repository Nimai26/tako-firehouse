-- Migration 005: Create DBS Card Game tables for DBS Masters + Fusion World
-- Sources: DeckPlanet API (Masters), dbs-cardgame.com (Fusion World)

-- DBS sets/series table
CREATE TABLE IF NOT EXISTS dbs_sets (
  id SERIAL PRIMARY KEY,
  set_code VARCHAR(20) NOT NULL,          -- BT01, EX01, FB09, etc.
  name VARCHAR(255) NOT NULL,
  game VARCHAR(20) NOT NULL DEFAULT 'masters',  -- 'masters' or 'fusion_world'
  card_count INTEGER DEFAULT 0,
  source VARCHAR(50) DEFAULT 'deckplanet',
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(set_code, game)
);

CREATE INDEX IF NOT EXISTS idx_dbs_sets_game ON dbs_sets(game);
CREATE INDEX IF NOT EXISTS idx_dbs_sets_code ON dbs_sets(set_code);

-- DBS cards table (Masters + Fusion World)
CREATE TABLE IF NOT EXISTS dbs_cards (
  id SERIAL PRIMARY KEY,
  source_id INTEGER,                        -- ID from source (DeckPlanet)
  card_number VARCHAR(30) NOT NULL,         -- P-181, BT1-001, FB09-001
  card_name VARCHAR(255) NOT NULL,
  card_type VARCHAR(50),                    -- LEADER, BATTLE, EXTRA, UNISON
  card_color VARCHAR(100),                  -- Red, Blue, Green, Yellow, Red/Green...
  card_rarity VARCHAR(50),                  -- Common[C], Uncommon[UC], Rare[R], etc.
  card_power VARCHAR(30),                   -- 15000, etc.
  card_energy_cost VARCHAR(10),
  card_combo_cost VARCHAR(10),
  card_combo_power VARCHAR(30),
  card_skill TEXT,                          -- HTML formatted skill text
  card_skill_text TEXT,                     -- Plain text skill
  card_traits TEXT,                         -- JSON array: ["Saiyan", "Frieza Clan"]
  card_character TEXT,                      -- JSON array: ["Goku", "Vegeta"]
  card_era TEXT,                            -- JSON array: ["Saiyan Saga"]
  keywords TEXT,                            -- JSON array: ["Auto", "Barrier"]
  
  -- Back side (Leaders)
  card_back_name VARCHAR(255),
  card_back_power VARCHAR(30),
  card_back_skill TEXT,
  card_back_skill_text TEXT,
  card_back_traits TEXT,
  card_back_character TEXT,
  card_back_era TEXT,
  
  -- Metadata
  set_code VARCHAR(20),                     -- Reference to set
  game VARCHAR(20) NOT NULL DEFAULT 'masters',
  is_banned BOOLEAN DEFAULT FALSE,
  is_limited BOOLEAN DEFAULT FALSE,
  limited_to INTEGER DEFAULT 4,
  has_errata BOOLEAN DEFAULT FALSE,
  erratas TEXT,                              -- JSON array of erratas
  variants TEXT,                             -- JSON data for card variants
  finishes TEXT,                             -- Available finishes
  
  -- Images
  image_url TEXT,                            -- Original image URL
  image_back_url TEXT,                       -- Back side image URL
  image_path VARCHAR(500),                   -- Local file path
  image_back_path VARCHAR(500),
  
  -- Source tracking
  source VARCHAR(50) DEFAULT 'deckplanet',   -- deckplanet, bandai_official
  view_count INTEGER DEFAULT 0,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(card_number, game)
);

CREATE INDEX IF NOT EXISTS idx_dbs_cards_number ON dbs_cards(card_number);
CREATE INDEX IF NOT EXISTS idx_dbs_cards_name ON dbs_cards(card_name);
CREATE INDEX IF NOT EXISTS idx_dbs_cards_type ON dbs_cards(card_type);
CREATE INDEX IF NOT EXISTS idx_dbs_cards_color ON dbs_cards(card_color);
CREATE INDEX IF NOT EXISTS idx_dbs_cards_rarity ON dbs_cards(card_rarity);
CREATE INDEX IF NOT EXISTS idx_dbs_cards_set ON dbs_cards(set_code);
CREATE INDEX IF NOT EXISTS idx_dbs_cards_game ON dbs_cards(game);
CREATE INDEX IF NOT EXISTS idx_dbs_cards_source ON dbs_cards(source);

-- Full-text search index 
CREATE INDEX IF NOT EXISTS idx_dbs_cards_search ON dbs_cards USING gin(
  to_tsvector('english', coalesce(card_name, '') || ' ' || coalesce(card_number, '') || ' ' || coalesce(card_type, '') || ' ' || coalesce(card_color, ''))
);
