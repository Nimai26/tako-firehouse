/**
 * Configuration - Cache PostgreSQL
 * 
 * Configuration du système de cache persistant
 */

/**
 * Parse un booléen
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  const str = String(value).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes';
}

/**
 * Parse un entier
 */
function parseInt(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Configuration du cache
 */
export const cache = {
  // Activation
  enabled: parseBoolean(process.env.DB_ENABLED, true),
  
  // Connexion PostgreSQL
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'tako_cache',
    user: process.env.DB_USER || 'tako',
    password: process.env.DB_PASSWORD || '',
    ssl: parseBoolean(process.env.DB_SSL, false)
  },
  
  // TTL par défaut (5 minutes)
  ttl: parseInt(process.env.CACHE_TTL, 300000),
  
  // Taille max du cache mémoire
  maxSize: parseInt(process.env.CACHE_MAX_SIZE, 100),
  
  // TTL par type de contenu (en ms)
  ttlByType: {
    search: 300000,        // 5 min - recherches
    detail: 3600000,       // 1h - détails produits
    price: 600000,         // 10 min - prix (volatile)
    static: 86400000       // 24h - données statiques (thèmes, couleurs)
  }
};
