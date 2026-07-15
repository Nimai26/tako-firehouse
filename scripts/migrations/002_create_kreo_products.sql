-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002 : Table kreo_products dans mega_archive
-- 
-- Serveur : Louis (10.20.0.10:5434)
-- Base    : mega_archive (même base que MEGA Construx)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kreo_products (
    id              SERIAL PRIMARY KEY,
    
    -- Identification
    set_number      VARCHAR(20) NOT NULL UNIQUE,     -- ex: "31144", "A2224", "38977"
    name            VARCHAR(255) NOT NULL,            -- Nom du produit
    
    -- Classification
    franchise       VARCHAR(50) NOT NULL,             -- transformers, battleship, gi-joe, star-trek, dungeons-dragons, cityville, trolls, armor-hero
    sub_line        VARCHAR(100),                     -- ex: "Beast Hunters", "Age of Extinction", "Micro-Changers"
    year            SMALLINT,                         -- 2011-2017
    
    -- Détails produit
    piece_count     INTEGER,                         -- Nombre de pièces
    kreons_count    INTEGER,                         -- Nombre de Kreons inclus
    kreons_included TEXT,                             -- Liste des Kreons (texte libre)
    description     TEXT,                             -- Description du produit
    price_retail    DECIMAL(8,2),                     -- Prix retail historique USD
    
    -- Type de produit
    product_type    VARCHAR(50) DEFAULT 'building_set', -- building_set, micro_changer, combiner, custom_kreon, kreon_warrior, battle_changer, blind_bag, brick_box
    
    -- Fichiers (chemins dans MinIO bucket kreo-archive)
    image_url       TEXT,                             -- URL source originale de l'image
    image_path      VARCHAR(255),                     -- Chemin dans MinIO: franchise/set_number.jpg
    pdf_url         TEXT,                             -- URL source originale du PDF
    pdf_path        VARCHAR(255),                     -- Chemin dans MinIO: franchise/set_number.pdf
    
    -- URLs wiki source
    wiki_url        TEXT,                             -- URL de la page wiki source
    wiki_image_url  TEXT,                             -- URL originale de l'image sur le wiki
    
    -- Métadonnées
    discovered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_kreo_franchise ON kreo_products(franchise);
CREATE INDEX IF NOT EXISTS idx_kreo_year ON kreo_products(year);
CREATE INDEX IF NOT EXISTS idx_kreo_product_type ON kreo_products(product_type);
CREATE INDEX IF NOT EXISTS idx_kreo_sub_line ON kreo_products(sub_line);
CREATE INDEX IF NOT EXISTS idx_kreo_name_trgm ON kreo_products USING gin (name gin_trgm_ops);

-- Commentaires
COMMENT ON TABLE kreo_products IS 'Archive KRE-O (Hasbro 2011-2017) - Toutes franchises';
COMMENT ON COLUMN kreo_products.franchise IS 'Franchise: transformers, battleship, gi-joe, star-trek, dungeons-dragons, cityville, trolls, armor-hero';
COMMENT ON COLUMN kreo_products.product_type IS 'Type: building_set, micro_changer, combiner, custom_kreon, kreon_warrior, battle_changer, blind_bag, brick_box';
