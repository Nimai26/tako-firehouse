/**
 * Provider Deezer
 * 
 * API Deezer pour recherche et détails d'albums/artistes/tracks
 * Gratuit, sans clé API
 * 
 * @module domains/music/providers/deezer
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('DeezerProvider');

const BASE_URL = 'https://api.deezer.com';
const USER_AGENT = 'TakoAPI/1.0';

/**
 * Formate une durée en secondes vers "mm:ss"
 */
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche sur Deezer
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options de recherche
 * @returns {Promise<Object>} Résultats de recherche
 */
export async function search(query, options = {}) {
  const { limit = 25, type = 'album' } = options;
  
  const url = `${BASE_URL}/search/${type}?q=${encodeURIComponent(query)}&limit=${limit}`;
  
  log.debug(`Search ${type}: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Deezer: ${data.error.message}`);
  }
  
  return data;
}

/**
 * Recherche d'albums
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Albums trouvés
 */
export async function searchAlbums(query, options = {}) {
  return search(query, { ...options, type: 'album' });
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
 * Recherche de tracks
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Tracks trouvés
 */
export async function searchTracks(query, options = {}) {
  return search(query, { ...options, type: 'track' });
}

// ============================================================================
// DÉTAILS ALBUM
// ============================================================================

/**
 * Récupère les détails d'un album
 * @param {number|string} albumId - ID de l'album
 * @returns {Promise<Object>} Détails de l'album
 */
export async function getAlbum(albumId) {
  const cleanId = String(albumId).replace(/^deezer:/i, '');
  const url = `${BASE_URL}/album/${cleanId}`;
  
  log.debug(`Get album: ${cleanId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Album non trouvé: ${albumId}`);
    }
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  const album = await response.json();
  
  if (album.error) {
    throw new Error(`Deezer: ${album.error.message || album.error.type || 'Album non trouvé'}`);
  }
  
  return album;
}

/**
 * Récupère les tracks d'un album
 * @param {number|string} albumId - ID de l'album
 * @param {Object} options - Options de pagination
 * @returns {Promise<Object>} Tracks de l'album
 */
export async function getAlbumTracks(albumId, options = {}) {
  const { limit = 100 } = options;
  const cleanId = String(albumId).replace(/^deezer:/i, '');
  const url = `${BASE_URL}/album/${cleanId}/tracks?limit=${limit}`;
  
  log.debug(`Get album tracks: ${cleanId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// DÉTAILS ARTISTE
// ============================================================================

/**
 * Récupère les détails d'un artiste
 * @param {number|string} artistId - ID de l'artiste
 * @returns {Promise<Object>} Détails de l'artiste
 */
export async function getArtist(artistId) {
  const cleanId = String(artistId).replace(/^deezer:/i, '');
  const url = `${BASE_URL}/artist/${cleanId}`;
  
  log.debug(`Get artist: ${cleanId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Artiste non trouvé: ${artistId}`);
    }
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  const artist = await response.json();
  
  if (artist.error) {
    throw new Error(`Deezer: ${artist.error.message || 'Artiste non trouvé'}`);
  }
  
  return artist;
}

/**
 * Récupère les top tracks d'un artiste
 * @param {number|string} artistId - ID de l'artiste
 * @param {Object} options - Options
 * @returns {Promise<Object>} Top tracks
 */
export async function getArtistTopTracks(artistId, options = {}) {
  const { limit = 10 } = options;
  const cleanId = String(artistId).replace(/^deezer:/i, '');
  const url = `${BASE_URL}/artist/${cleanId}/top?limit=${limit}`;
  
  log.debug(`Get artist top tracks: ${cleanId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les albums d'un artiste
 * @param {number|string} artistId - ID de l'artiste
 * @param {Object} options - Options
 * @returns {Promise<Object>} Albums de l'artiste
 */
export async function getArtistAlbums(artistId, options = {}) {
  const { limit = 50 } = options;
  const cleanId = String(artistId).replace(/^deezer:/i, '');
  const url = `${BASE_URL}/artist/${cleanId}/albums?limit=${limit}`;
  
  log.debug(`Get artist albums: ${cleanId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les artistes similaires
 * @param {number|string} artistId - ID de l'artiste
 * @param {Object} options - Options
 * @returns {Promise<Object>} Artistes similaires
 */
export async function getArtistRelated(artistId, options = {}) {
  const { limit = 20 } = options;
  const cleanId = String(artistId).replace(/^deezer:/i, '');
  const url = `${BASE_URL}/artist/${cleanId}/related?limit=${limit}`;
  
  log.debug(`Get related artists: ${cleanId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// DÉTAILS TRACK
// ============================================================================

/**
 * Récupère les détails d'un track
 * @param {number|string} trackId - ID du track
 * @returns {Promise<Object>} Détails du track
 */
export async function getTrack(trackId) {
  const cleanId = String(trackId).replace(/^deezer:/i, '');
  const url = `${BASE_URL}/track/${cleanId}`;
  
  log.debug(`Get track: ${cleanId}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Track non trouvé: ${trackId}`);
    }
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// GENRES & CHARTS
// ============================================================================

/**
 * Récupère les genres disponibles
 * @returns {Promise<Object>} Liste des genres
 */
export async function getGenres() {
  const url = `${BASE_URL}/genre`;
  
  log.debug('Get genres');
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère le chart (top albums, tracks, artistes)
 * @param {string} type - Type de chart (tracks, albums, artists)
 * @param {Object} options - Options
 * @returns {Promise<Object>} Chart
 */
export async function getChart(type = 'albums', options = {}) {
  const { limit = 25 } = options;
  const url = `${BASE_URL}/chart/0/${type}?limit=${limit}`;
  
  log.debug(`Get chart ${type}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT
    }
  });
  
  if (!response.ok) {
    throw new Error(`Erreur Deezer: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Vérifie la disponibilité de l'API Deezer
 * @returns {Promise<Object>} Status de l'API
 */
export async function healthCheck() {
  const start = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/genre`, {
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
  getAlbum,
  getAlbumTracks,
  getArtist,
  getArtistTopTracks,
  getArtistAlbums,
  getArtistRelated,
  getTrack,
  getGenres,
  getChart,
  healthCheck
};
