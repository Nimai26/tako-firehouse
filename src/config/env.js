/**
 * Configuration - Variables d'environnement
 * 
 * Centralise et valide toutes les variables d'environnement
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Charger le fichier .env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

// Lecture de la version depuis package.json
let packageVersion = '1.0.0';
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  packageVersion = packageJson.version;
} catch (e) {
  // Ignore si package.json non trouvé
}

/**
 * Parse un booléen depuis une variable d'environnement
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes';
}

/**
 * Parse un entier depuis une variable d'environnement
 */
function parseInt(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Configuration environnement validée
 */
export const env = {
  // Serveur
  port: parseInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  version: process.env.API_VERSION || packageVersion,
  defaultLocale: process.env.DEFAULT_LOCALE || 'fr-FR',
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  
  // Fonctionnalités
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  
  // Scraping
  fsr: {
    url: process.env.FSR_URL || 'http://flaresolverr:8191/v1',
    amazonUrl: process.env.FSR_AMAZON_URL || null
  },
  
  vpn: {
    proxyUrl: process.env.VPN_PROXY_URL || null,
    controlUrl: process.env.GLUETUN_CONTROL_URL || 'http://gluetun:8000'
  },
  
  userAgent: process.env.USER_AGENT || 
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  
  // Traduction (intégrée - plus besoin de container externe)
  autoTrad: {
    // AUTO_TRAD_ENABLED=false pour désactiver complètement la traduction
    enabled: parseBoolean(process.env.AUTO_TRAD_ENABLED, true)  // Activé par défaut maintenant
  },
  
  // Monitoring
  monitoring: {
    enabled: parseBoolean(process.env.ENABLE_MONITORING, false),
    email: process.env.MONITORING_EMAIL || null
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CLÉS API PROVIDERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Construction Toys
  BRICKSET_API_KEY: process.env.BRICKSET_API_KEY || null,
  BRICKSET_USERNAME: process.env.BRICKSET_USERNAME || null,
  BRICKSET_PASSWORD: process.env.BRICKSET_PASSWORD || null,
  BRICKSET_USER_HASH: process.env.BRICKSET_USER_HASH || null,
  REBRICKABLE_API_KEY: process.env.REBRICKABLE_API_KEY || null,
  
  // Mega Construx / KRE-O - Tables internes (products, kreo_products dans tako_cache)
  // Plus de base séparée depuis v2.4.0

  // Stockage fichiers (filesystem local, servi par express.static)
  storage: {
    path: process.env.STORAGE_PATH || '/data/tako-storage',
    fileBaseUrl: process.env.FILE_BASE_URL || `${process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`}/files`
  },
  
  // Books
  GOOGLE_BOOKS_API_KEY: process.env.GOOGLE_BOOKS_API_KEY || null,
  
  // Games
  IGDB_CLIENT_ID: process.env.IGDB_CLIENT_ID || null,
  IGDB_CLIENT_SECRET: process.env.IGDB_CLIENT_SECRET || null,
  RAWG_API_KEY: process.env.RAWG_API_KEY || null,
  
  // Media
  TMDB_API_KEY: process.env.TMDB_API_KEY || process.env.TMDB_KEY || null,
  TVDB_API_KEY: process.env.TVDB_API_KEY || process.env.TVDB_KEY || null,
  OMDB_API_KEY: process.env.OMDB_API_KEY || null,
  
  // TCG
  POKEMON_TCG_API_KEY: process.env.POKEMON_TCG_API_KEY || null,
  SCRYFALL_API_KEY: process.env.SCRYFALL_API_KEY || null,
  
  // Music
  DISCOGS_TOKEN: process.env.DISCOGS_TOKEN || null,
  
  // Comics
  COMICVINE_API_KEY: process.env.COMICVINE_API_KEY || null
};
