/**
 * Repository pour discovery_cache
 * 
 * Gère le CRUD du cache PostgreSQL pour les endpoints discovery
 * Tako API v1.0.0
 */

import { query, queryOne, queryAll, getIsConnected } from './connection.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('DiscoveryCache');

/**
 * Génère une clé de cache unique
 * @param {string} provider - Nom du provider
 * @param {string} endpoint - Nom de l'endpoint
 * @param {Object} options - Options additionnelles
 * @returns {string} Cache key
 */
export function generateCacheKey(provider, endpoint, options = {}) {
  const parts = [provider, endpoint];
  
  if (options.category) parts.push(options.category);
  if (options.period) parts.push(options.period);
  if (options.type) parts.push(options.type);
  if (options.filter) parts.push(options.filter);
  if (options.day) parts.push(options.day);
  if (options.sfw && options.sfw !== 'all') parts.push(options.sfw);  // Inclure sfw (sauf 'all' qui est le défaut)
  if (options.page && options.page > 1) parts.push(`p${options.page}`);  // Inclure page (sauf page 1, identique à sans page)
  
  return parts.join(':');
}

/**
 * Récupère les données du cache
 * @param {string} cacheKey - Clé du cache
 * @returns {Promise<Object|null>} Données ou null
 */
export async function getCached(cacheKey) {
  if (!getIsConnected()) return null;
  
  try {
    const result = await queryOne(
      `SELECT data, total_results, updated_at, expires_at 
       FROM discovery_cache 
       WHERE cache_key = $1 
         AND expires_at > NOW()
       LIMIT 1`,
      [cacheKey]
    );
    
    if (!result) {
      log.debug(`Cache MISS: ${cacheKey}`);
      return null;
    }
    
    // Incrémenter fetch_count et mettre à jour last_accessed (async, non-bloquant)
    query(
      `UPDATE discovery_cache 
       SET fetch_count = fetch_count + 1, 
           last_accessed = NOW() 
       WHERE cache_key = $1`,
      [cacheKey]
    ).catch(() => {});
    
    const age = Math.round((Date.now() - new Date(result.updated_at)) / 1000 / 60);
    const ttl = Math.round((new Date(result.expires_at) - Date.now()) / 1000 / 60);
    
    log.debug(`Cache HIT: ${cacheKey}`, { 
      age: `${age}min`,
      ttl: `${ttl}min`,
      results: result.total_results
    });
    
    return result.data;
  } catch (err) {
    log.error(`Erreur getCached: ${err.message}`);
    return null;
  }
}

/**
 * Sauvegarde les données dans le cache
 * @param {string} cacheKey - Clé du cache
 * @param {string} provider - Nom du provider
 * @param {string} endpoint - Nom de l'endpoint
 * @param {Object} data - Données à cacher
 * @param {Object} options - Options (category, period, ttl)
 * @returns {Promise<boolean>} Succès
 */
export async function saveCached(cacheKey, provider, endpoint, data, options = {}) {
  if (!getIsConnected()) return false;
  
  const { category = null, period = null, ttl = 24 * 60 * 60 } = options;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const totalResults = Array.isArray(data) ? data.length : (data.data?.length || 0);
  
  try {
    await query(
      `INSERT INTO discovery_cache (
        cache_key, provider, endpoint, category, period,
        data, total_results, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (cache_key) DO UPDATE SET
        data = EXCLUDED.data,
        total_results = EXCLUDED.total_results,
        updated_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        refresh_count = discovery_cache.refresh_count + 1`,
      [cacheKey, provider, endpoint, category, period, 
       JSON.stringify(data), totalResults, expiresAt]
    );
    
    log.debug(`Cache SAVE: ${cacheKey}`, { 
      results: totalResults, 
      ttl: `${Math.round(ttl / 3600)}h` 
    });
    
    return true;
  } catch (err) {
    log.error(`Erreur saveCached: ${err.message}`, { cacheKey });
    return false;
  }
}

/**
 * Récupère les entrées expirées qui doivent être rafraîchies
 * @param {number} limit - Nombre max d'entrées
 * @returns {Promise<Array>} Liste des entrées expirées
 */
export async function getExpiredEntries(limit = 10) {
  if (!getIsConnected()) return [];
  
  try {
    const result = await queryAll(
      `SELECT cache_key, provider, endpoint, category, period,
              expires_at, updated_at, fetch_count
       FROM discovery_cache 
       WHERE expires_at < NOW()
       ORDER BY fetch_count DESC, expires_at ASC 
       LIMIT $1`,
      [limit]
    );
    
    return result;
  } catch (err) {
    log.error(`Erreur getExpiredEntries: ${err.message}`);
    return [];
  }
}

/**
 * Récupère TOUTES les entrées de cache
 * @returns {Promise<Array>}
 */
export async function getAllEntries() {
  if (!getIsConnected()) return [];
  
  try {
    const result = await queryAll(
      `SELECT cache_key, provider, endpoint, category, period,
              expires_at, updated_at, fetch_count
       FROM discovery_cache 
       ORDER BY provider, endpoint, category`,
      []
    );
    
    return result;
  } catch (err) {
    log.error(`Erreur getAllEntries: ${err.message}`);
    return [];
  }
}

/**
 * Supprime les entrées trop anciennes (non accédées depuis X jours)
 * @param {number} daysThreshold - Nombre de jours
 * @returns {Promise<number>} Nombre d'entrées supprimées
 */
export async function purgeOldEntries(daysThreshold = 90) {
  if (!getIsConnected()) return 0;
  
  try {
    const result = await query(
      `DELETE FROM discovery_cache 
       WHERE last_accessed < NOW() - INTERVAL '1 day' * $1`,
      [daysThreshold]
    );
    
    const deletedCount = result ? result.rowCount : 0;
    
    if (deletedCount > 0) {
      log.info(`Purge: ${deletedCount} entrées supprimées (> ${daysThreshold}j)`);
    }
    
    return deletedCount;
  } catch (err) {
    log.error(`Erreur purgeOldEntries: ${err.message}`);
    return 0;
  }
}

/**
 * Récupère les statistiques du cache
 * @returns {Promise<Object>} Statistiques
 */
export async function getCacheStats() {
  if (!getIsConnected()) return null;
  
  try {
    const stats = await queryAll(`
      SELECT 
        provider,
        endpoint,
        COUNT(*) as total_entries,
        SUM(total_results) as total_items,
        SUM(fetch_count) as total_fetches,
        AVG(refresh_count)::int as avg_refreshes,
        MIN(updated_at) as oldest_update,
        MAX(updated_at) as latest_update,
        COUNT(*) FILTER (WHERE expires_at > NOW()) as valid_entries,
        COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_entries
      FROM discovery_cache
      GROUP BY provider, endpoint
      ORDER BY provider, endpoint
    `);
    
    // Stats globales
    const global = await queryOne(`
      SELECT 
        COUNT(*) as total_entries,
        SUM(total_results) as total_items,
        SUM(fetch_count) as total_fetches,
        COUNT(*) FILTER (WHERE expires_at > NOW()) as valid_entries,
        COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_entries,
        COUNT(*) FILTER (WHERE last_accessed > NOW() - INTERVAL '24 hours') as accessed_today
      FROM discovery_cache
    `);
    
    return {
      global,
      byProvider: stats
    };
  } catch (err) {
    log.error(`Erreur getCacheStats: ${err.message}`);
    return null;
  }
}

/**
 * Supprime une entrée du cache
 * @param {string} cacheKey - Clé du cache
 * @returns {Promise<boolean>} Succès
 */
export async function deleteCached(cacheKey) {
  if (!getIsConnected()) return false;
  
  try {
    await query(
      `DELETE FROM discovery_cache WHERE cache_key = $1`,
      [cacheKey]
    );
    
    log.debug(`Cache DELETE: ${cacheKey}`);
    return true;
  } catch (err) {
    log.error(`Erreur deleteCached: ${err.message}`);
    return false;
  }
}

/**
 * Vide tout le cache
 * @returns {Promise<number>} Nombre d'entrées supprimées
 */
export async function clearAllCache() {
  if (!getIsConnected()) return 0;
  
  try {
    const result = await query(`DELETE FROM discovery_cache`);
    const deletedCount = result ? result.rowCount : 0;
    
    log.info(`Cache vidé: ${deletedCount} entrées supprimées`);
    return deletedCount;
  } catch (err) {
    log.error(`Erreur clearAllCache: ${err.message}`);
    return 0;
  }
}
