-- Migration 001: Création de la table discovery_cache
-- Date: 2 février 2026
-- Objectif: Cache PostgreSQL pour endpoints discovery (trending/popular/charts/upcoming)

-- Créer la table discovery_cache
CREATE TABLE IF NOT EXISTS discovery_cache (
  -- Identifiant unique
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(255) UNIQUE NOT NULL,
  
  -- Métadonnées
  provider VARCHAR(50) NOT NULL,
  endpoint VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  period VARCHAR(20),
  
  -- Données
  data JSONB NOT NULL,
  total_results INTEGER,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_accessed TIMESTAMP DEFAULT NOW(),
  
  -- Statistiques
  fetch_count INTEGER DEFAULT 0,
  refresh_count INTEGER DEFAULT 0
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_cache_key ON discovery_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_provider_endpoint ON discovery_cache(provider, endpoint);
CREATE INDEX IF NOT EXISTS idx_expires_at ON discovery_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_last_accessed ON discovery_cache(last_accessed);

-- Fonction pour mise à jour automatique last_accessed
CREATE OR REPLACE FUNCTION update_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mise à jour last_accessed lors des SELECT
-- Note: Les triggers AFTER SELECT n'existent pas en PostgreSQL
-- On gérera last_accessed manuellement dans le code

-- Fonction pour purger les anciennes entrées
CREATE OR REPLACE FUNCTION purge_old_cache_entries(days_threshold INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM discovery_cache 
  WHERE last_accessed < NOW() - INTERVAL '1 day' * days_threshold;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Commentaires sur la table et les colonnes
COMMENT ON TABLE discovery_cache IS 'Cache PostgreSQL pour les endpoints discovery (trending/popular/charts/upcoming)';
COMMENT ON COLUMN discovery_cache.cache_key IS 'Clé unique du cache (ex: tmdb:trending:movie:week)';
COMMENT ON COLUMN discovery_cache.provider IS 'Nom du provider (tmdb, jikan, rawg, igdb, deezer, itunes)';
COMMENT ON COLUMN discovery_cache.endpoint IS 'Nom de l''endpoint (trending, popular, charts, upcoming)';
COMMENT ON COLUMN discovery_cache.category IS 'Catégorie de contenu (movie, tv, anime, manga, game, album)';
COMMENT ON COLUMN discovery_cache.period IS 'Période pour trending (day, week, month)';
COMMENT ON COLUMN discovery_cache.data IS 'Données JSON complètes normalisées';
COMMENT ON COLUMN discovery_cache.total_results IS 'Nombre total de résultats dans data';
COMMENT ON COLUMN discovery_cache.fetch_count IS 'Nombre de fois où cette entrée a été accédée';
COMMENT ON COLUMN discovery_cache.refresh_count IS 'Nombre de fois où cette entrée a été rafraîchie';

-- Grant permissions (ajuster selon votre configuration)
-- GRANT ALL PRIVILEGES ON discovery_cache TO tako_user;
-- GRANT USAGE, SELECT ON SEQUENCE discovery_cache_id_seq TO tako_user;
