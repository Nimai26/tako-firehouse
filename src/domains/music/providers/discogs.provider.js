/**
 * Provider Discogs
 * 
 * API Discogs pour recherche et détails de releases/artistes musicaux
 * Token optionnel (limite 25 req/min sans, 60 req/min avec)
 * 
 * @module domains/music/providers/discogs
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('DiscogsProvider');

const BASE_URL = 'https://api.discogs.com';
const USER_AGENT = 'TakoAPI/1.0';

/**
 * Récupère le token Discogs depuis l'environnement
 */
function getToken() {
  return process.env.DISCOG_API_KEY || process.env.DISCOGS_TOKEN || null;
}

/**
 * Headers communs pour les requêtes Discogs
 */
function getHeaders() {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': USER_AGENT
  };
  
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Discogs token=${token}`;
  }
  
  return headers;
}

// ============================================================================
// RECHERCHE
// ============================================================================

/**
 * Recherche sur Discogs
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options de recherche
 * @returns {Promise<Object>} Résultats de recherche
 */
export async function search(query, options = {}) {
  const { 
    limit = 25, 
    page = 1, 
    type = 'release' // release, artist, master, label
  } = options;
  
  const token = getToken();
  let url = `${BASE_URL}/database/search?q=${encodeURIComponent(query)}&type=${type}&per_page=${limit}&page=${page}`;
  
  if (token && !url.includes('token=')) {
    url += `&token=${token}`;
  }
  
  log.debug(`Search: ${url.replace(/token=[^&]+/, 'token=***')}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit Discogs atteint (60 req/min avec token, 25 sans)');
    }
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Recherche d'albums/releases
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Releases trouvées
 */
export async function searchReleases(query, options = {}) {
  return search(query, { ...options, type: 'release' });
}

/**
 * Recherche de masters (albums originaux)
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Masters trouvés
 */
export async function searchMasters(query, options = {}) {
  return search(query, { ...options, type: 'master' });
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
 * Recherche de labels
 * @param {string} query - Terme de recherche
 * @param {Object} options - Options
 * @returns {Promise<Object>} Labels trouvés
 */
export async function searchLabels(query, options = {}) {
  return search(query, { ...options, type: 'label' });
}

// ============================================================================
// DÉTAILS
// ============================================================================

/**
 * Récupère les détails d'une release
 * @param {number|string} releaseId - ID de la release
 * @returns {Promise<Object>} Détails de la release
 */
export async function getRelease(releaseId) {
  const url = `${BASE_URL}/releases/${releaseId}`;
  
  log.debug(`Get release: ${releaseId}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Release non trouvée: ${releaseId}`);
    }
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les détails d'un master (album original)
 * @param {number|string} masterId - ID du master
 * @returns {Promise<Object>} Détails du master
 */
export async function getMaster(masterId) {
  const url = `${BASE_URL}/masters/${masterId}`;
  
  log.debug(`Get master: ${masterId}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Master non trouvé: ${masterId}`);
    }
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les versions d'un master
 * @param {number|string} masterId - ID du master
 * @param {Object} options - Options de pagination
 * @returns {Promise<Object>} Versions du master
 */
export async function getMasterVersions(masterId, options = {}) {
  const { page = 1, limit = 50 } = options;
  const url = `${BASE_URL}/masters/${masterId}/versions?page=${page}&per_page=${limit}`;
  
  log.debug(`Get master versions: ${masterId}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les détails d'un artiste
 * @param {number|string} artistId - ID de l'artiste
 * @returns {Promise<Object>} Détails de l'artiste
 */
export async function getArtist(artistId) {
  const url = `${BASE_URL}/artists/${artistId}`;
  
  log.debug(`Get artist: ${artistId}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Artiste non trouvé: ${artistId}`);
    }
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les releases d'un artiste
 * @param {number|string} artistId - ID de l'artiste
 * @param {Object} options - Options de pagination
 * @returns {Promise<Object>} Releases de l'artiste
 */
export async function getArtistReleases(artistId, options = {}) {
  const { page = 1, limit = 50, sort = 'year', sortOrder = 'desc' } = options;
  const url = `${BASE_URL}/artists/${artistId}/releases?page=${page}&per_page=${limit}&sort=${sort}&sort_order=${sortOrder}`;
  
  log.debug(`Get artist releases: ${artistId}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les détails d'un label
 * @param {number|string} labelId - ID du label
 * @returns {Promise<Object>} Détails du label
 */
export async function getLabel(labelId) {
  const url = `${BASE_URL}/labels/${labelId}`;
  
  log.debug(`Get label: ${labelId}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Label non trouvé: ${labelId}`);
    }
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Récupère les releases d'un label
 * @param {number|string} labelId - ID du label
 * @param {Object} options - Options de pagination
 * @returns {Promise<Object>} Releases du label
 */
export async function getLabelReleases(labelId, options = {}) {
  const { page = 1, limit = 50 } = options;
  const url = `${BASE_URL}/labels/${labelId}/releases?page=${page}&per_page=${limit}`;
  
  log.debug(`Get label releases: ${labelId}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
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
  const token = getToken();
  let url = `${BASE_URL}/database/search?barcode=${encodeURIComponent(barcode)}&type=release`;
  
  if (token) {
    url += `&token=${token}`;
  }
  
  log.debug(`Search by barcode: ${barcode}`);
  
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    throw new Error(`Erreur Discogs: ${response.status}`);
  }
  
  return response.json();
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Vérifie la disponibilité de l'API Discogs
 * @returns {Promise<Object>} Status de l'API
 */
export async function healthCheck() {
  const start = Date.now();
  
  try {
    // Simple recherche pour vérifier l'API
    const response = await fetch(`${BASE_URL}/database/search?q=test&per_page=1`, {
      headers: getHeaders()
    });
    
    const latency = Date.now() - start;
    const hasToken = !!getToken();
    
    if (response.ok) {
      return {
        status: 'healthy',
        latency,
        hasToken,
        rateLimit: hasToken ? '60 req/min' : '25 req/min'
      };
    } else {
      return {
        status: 'degraded',
        latency,
        error: `HTTP ${response.status}`,
        hasToken
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
  searchReleases,
  searchMasters,
  searchArtists,
  searchLabels,
  getRelease,
  getMaster,
  getMasterVersions,
  getArtist,
  getArtistReleases,
  getLabel,
  getLabelReleases,
  searchByBarcode,
  healthCheck
};
