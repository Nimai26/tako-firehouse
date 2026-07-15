/**
 * Provider iTunes
 * 
 * API iTunes Search pour recherche d'albums/artistes/tracks
 * Gratuit, sans clé API
 * 
 * @module domains/music/providers/itunes
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('iTunesProvider');

const BASE_URL = 'https://itunes.apple.com';
const USER_AGENT = 'TakoAPI/1.0';

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
 * Recherche sur iTunes
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options de recherche
 * @returns {Promise<Object>} Résultats de recherche
 */
export async function search(query, options = {}) {
  const { 
    limit = 25, 
    entity = 'album', // album, musicArtist, song, musicTrack
    country = 'FR',
    media = 'music'
  } = options;
  
  const url = `${BASE_URL}/search?term=${encodeURIComponent(query)}&entity=${entity}&country=${country}&media=${media}&limit=${limit}`;
  
  log.debug(`Search ${entity}: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur iTunes: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Recherche d'albums
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Albums trouvés
 */
export async function searchAlbums(query, options = {}) {
  return search(query, { ...options, entity: 'album' });
}

/**
 * Recherche d'artistes
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Artistes trouvés
 */
export async function searchArtists(query, options = {}) {
  return search(query, { ...options, entity: 'musicArtist' });
}

/**
 * Recherche de tracks/songs
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Tracks trouvés
 */
export async function searchTracks(query, options = {}) {
  return search(query, { ...options, entity: 'song' });
}

// ============================================================================
// LOOKUP PAR ID
// ============================================================================

/**
 * Récupère les détails par ID iTunes
 * @param {number|string} id - ID iTunes (collectionId ou artistId)
 * @param {Object} options - Options
 * @returns {Promise<Object>} Détails
 */
export async function lookup(id, options = {}) {
  const { entity = null, country = 'FR' } = options;
  
  let url = `${BASE_URL}/lookup?id=${id}&country=${country}`;
  
  if (entity) {
    url += `&entity=${entity}`;
  }
  
  log.debug(`Lookup: ${id}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur iTunes: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les détails d'un album
 * @param {number|string} albumId - ID de l'album (collectionId)
 * @param {Object} options - Options
 * @returns {Promise<Object>} Détails de l'album avec tracks
 */
export async function getAlbum(albumId, options = {}) {
  const cleanId = String(albumId).replace(/^itunes:/i, '');
  
  log.debug(`Get album: ${cleanId}`);
  
  // Récupérer l'album et ses tracks
  const data = await lookup(cleanId, { ...options, entity: 'song' });
  
  if (!data.results || data.results.length === 0) {
    throw new Error(`Album non trouvé: ${albumId}`);
  }
  
  return data;
}

/**
 * Récupère les détails d'un artiste
 * @param {number|string} artistId - ID de l'artiste
 * @param {Object} options - Options
 * @returns {Promise<Object>} Détails de l'artiste
 */
export async function getArtist(artistId, options = {}) {
  const cleanId = String(artistId).replace(/^itunes:/i, '');
  
  log.debug(`Get artist: ${cleanId}`);
  
  const data = await lookup(cleanId, options);
  
  if (!data.results || data.results.length === 0) {
    throw new Error(`Artiste non trouvé: ${artistId}`);
  }
  
  return data;
}

/**
 * Récupère les albums d'un artiste
 * @param {number|string} artistId - ID de l'artiste
 * @param {Object} options - Options
 * @returns {Promise<Object>} Albums de l'artiste
 */
export async function getArtistAlbums(artistId, options = {}) {
  const cleanId = String(artistId).replace(/^itunes:/i, '');
  const { limit = 50, country = 'FR' } = options;
  
  log.debug(`Get artist albums: ${cleanId}`);
  
  const url = `${BASE_URL}/lookup?id=${cleanId}&entity=album&limit=${limit}&country=${country}`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur iTunes: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// CHARTS
// ============================================================================

/**
 * Récupère les top charts iTunes par pays
 * @param {Object} options - Options
 * @param {string} options.country - Code pays (fr, us, gb, de, etc.) - défaut: 'fr'
 * @param {string} options.entity - Type (album, song) - défaut: 'album'
 * @param {number} options.limit - Nombre de résultats (défaut: 25, max: 200)
 * @returns {Promise<Object>} Top charts
 */
export async function getCharts(options = {}) {
  const { 
    country = 'fr',
    entity = 'album', // album ou song
    limit = 25
  } = options;
  
  // L'API iTunes utilise le endpoint top via search avec ordering
  // Alternative: utiliser l'ancienne API RSS ou un workaround via search
  const feedType = entity === 'album' ? 'album' : 'song';
  const url = `https://itunes.apple.com/${country}/rss/topalbums/limit=${Math.min(limit, 100)}/json`;
  
  log.debug(`Get charts ${entity} for ${country.toUpperCase()}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur iTunes: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Vérifie la disponibilité de l'API iTunes
 * @returns {Promise<Object>} Status de l'API
 */
export async function healthCheck() {
  const start = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/search?term=test&limit=1&media=music`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT
      }
    });
    
    const latency = Date.now() - start;
    
    if (response.ok) {
      return {
        status: 'healthy',
        latency
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
  searchTracks,
  lookup,
  getAlbum,
  getArtist,
  getArtistAlbums,
  getCharts,
  healthCheck
};
