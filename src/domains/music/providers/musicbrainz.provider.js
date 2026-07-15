/**
 * Provider MusicBrainz
 * 
 * API MusicBrainz pour recherche et détails d'albums/artistes
 * Gratuit, sans clé API (User-Agent identifiable requis)
 * 
 * @module domains/music/providers/musicbrainz
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('MusicBrainzProvider');

const BASE_URL = 'https://musicbrainz.org/ws/2';
const COVER_URL = 'https://coverartarchive.org';
const USER_AGENT = 'TakoAPI/1.0 (https://github.com/tako-api)';

// Rate limiting: MusicBrainz limite à 1 req/sec
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 secondes

/**
 * Respecte le rate limiting de MusicBrainz
 */
async function respectRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  
  if (elapsed < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - elapsed;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Formate une durée en ms vers "mm:ss"
 */
function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche sur MusicBrainz
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options de recherche
 * @returns {Promise<Object>} Résultats de recherche
 */
export async function search(query, options = {}) {
  const { 
    limit = 25, 
    type = 'release-group', // release-group (album), artist, release, recording
    artist = null 
  } = options;
  
  await respectRateLimit();
  
  // Construire la requête Lucene
  let luceneQuery = query;
  if (artist) {
    luceneQuery = `"${query}" AND artist:"${artist}"`;
  }
  
  const url = `${BASE_URL}/${type}?query=${encodeURIComponent(luceneQuery)}&limit=${limit}&fmt=json`;
  
  log.debug(`Search ${type}: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('MusicBrainz: Service temporairement indisponible (rate limit)');
    }
    throw new Error(`Erreur MusicBrainz: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Recherche d'albums (release-groups)
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Albums trouvés
 */
export async function searchAlbums(query, options = {}) {
  return search(query, { ...options, type: 'release-group' });
}

/**
 * Recherche d'artistes
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Artistes trouvés
 */
export async function searchArtists(query, options = {}) {
  return search(query, { ...options, type: 'artist' });
}

/**
 * Recherche de releases (versions spécifiques)
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Releases trouvées
 */
export async function searchReleases(query, options = {}) {
  return search(query, { ...options, type: 'release' });
}

/**
 * Recherche de recordings (pistes)
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Recordings trouvés
 */
export async function searchRecordings(query, options = {}) {
  return search(query, { ...options, type: 'recording' });
}

// ============================================================================
// DÉTAILS
// ============================================================================

/**
 * Récupère les détails d'un album (release-group)
 * @param {string} mbid - MusicBrainz ID
 * @returns {Promise<Object>} Détails de l'album
 */
export async function getAlbum(mbid) {
  await respectRateLimit();
  
  const url = `${BASE_URL}/release-group/${mbid}?inc=artists+releases+tags+ratings&fmt=json`;
  
  log.debug(`Get album: ${mbid}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Album non trouvé: ${mbid}`);
    }
    throw new Error(`Erreur MusicBrainz: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les tracks d'un album via le premier release
 * @param {string} releaseId - ID du release
 * @returns {Promise<Object>} Tracks
 */
export async function getReleaseTracks(releaseId) {
  await respectRateLimit();
  
  const url = `${BASE_URL}/release/${releaseId}?inc=recordings+artist-credits&fmt=json`;
  
  log.debug(`Get release tracks: ${releaseId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur MusicBrainz: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les détails d'un artiste
 * @param {string} mbid - MusicBrainz ID
 * @returns {Promise<Object>} Détails de l'artiste
 */
export async function getArtist(mbid) {
  await respectRateLimit();
  
  const url = `${BASE_URL}/artist/${mbid}?inc=aliases+tags+ratings+release-groups&fmt=json`;
  
  log.debug(`Get artist: ${mbid}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Artiste non trouvé: ${mbid}`);
    }
    throw new Error(`Erreur MusicBrainz: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les albums d'un artiste
 * @param {string} artistMbid - MusicBrainz ID de l'artiste
 * @param {Object} options - Options
 * @returns {Promise<Object>} Albums de l'artiste
 */
export async function getArtistAlbums(artistMbid, options = {}) {
  const { limit = 100, offset = 0, type = 'album' } = options;
  
  await respectRateLimit();
  
  const url = `${BASE_URL}/release-group?artist=${artistMbid}&type=${type}&limit=${limit}&offset=${offset}&fmt=json`;
  
  log.debug(`Get artist albums: ${artistMbid}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur MusicBrainz: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// COVER ART
// ============================================================================

/**
 * Récupère l'URL de la pochette d'un album
 * @param {string} mbid - MusicBrainz ID (release-group)
 * @param {string} size - Taille (250, 500, 1200)
 * @returns {string} URL de la pochette
 */
export function getCoverUrl(mbid, size = '500') {
  return `${COVER_URL}/release-group/${mbid}/front-${size}`;
}

/**
 * Récupère toutes les images d'un release-group
 * @param {string} mbid - MusicBrainz ID
 * @returns {Promise<Object>} Images disponibles
 */
export async function getCoverArt(mbid) {
  const url = `${COVER_URL}/release-group/${mbid}`;
  
  log.debug(`Get cover art: ${mbid}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      return { images: [] };
    }
    
    return response.json();
  } catch (error) {
    return { images: [] };
  }
}

// ============================================================================
// RECHERCHE PAR CODE-BARRES
// ============================================================================

/**
 * Recherche par code-barres
 * @param {string} barcode - Code-barres (UPC/EAN)
 * @returns {Promise<Object>} Release trouvée
 */
export async function searchByBarcode(barcode) {
  await respectRateLimit();
  
  const url = `${BASE_URL}/release?query=barcode:${encodeURIComponent(barcode)}&fmt=json`;
  
  log.debug(`Search by barcode: ${barcode}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur MusicBrainz: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Vérifie la disponibilité de l'API MusicBrainz
 * @returns {Promise<Object>} Status de l'API
 */
export async function healthCheck() {
  const start = Date.now();
  
  try {
    await respectRateLimit();
    
    const response = await fetch(`${BASE_URL}/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da?fmt=json`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT
      }
    });
    
    const latency = Date.now() - start;
    
    if (response.ok) {
      return {
        status: 'healthy',
        latency,
        rateLimit: '1 req/sec'
      };
    } else {
      return {
        status: 'degraded',
        latency,
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      latency: Date.now() - start,
      error: error.message
    };
  }
}

export default {
  search,
  searchAlbums,
  searchArtists,
  searchReleases,
  searchRecordings,
  getAlbum,
  getReleaseTracks,
  getArtist,
  getArtistAlbums,
  getCoverUrl,
  getCoverArt,
  searchByBarcode,
  healthCheck
};
