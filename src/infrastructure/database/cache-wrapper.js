/**
 * Infrastructure - Cache Wrapper
 * Abstraction du cache pour les providers
 * 
 * TODO: Migrer depuis toys_api/lib/database/cache-wrapper.js
 */

import { logger } from '../../shared/utils/logger.js';

const log = logger.create('Cache');

// Info sur le dernier accès cache (pour headers)
let lastCacheInfo = { hit: false, age: 0 };

/**
 * Crée un wrapper de cache pour un provider
 * @param {string} provider - Nom du provider
 * @param {string} contentType - Type de contenu (search, detail, etc.)
 */
export function createProviderCache(provider, contentType) {
  return {
    /**
     * Recherche avec cache
     */
    async searchWithCache(query, fetchFn, options = {}) {
      // TODO: Implémenter le cache réel
      // Pour l'instant, appelle directement la fonction
      log.debug(`Cache MISS for ${provider}:${contentType} search "${query}"`);
      lastCacheInfo = { hit: false, age: 0 };
      
      const result = await fetchFn();
      return { ...result, _cacheMatch: false };
    },
    
    /**
     * Détails avec cache
     */
    async getWithCache(id, fetchFn, options = {}) {
      // TODO: Implémenter le cache réel
      log.debug(`Cache MISS for ${provider}:${contentType} detail "${id}"`);
      lastCacheInfo = { hit: false, age: 0 };
      
      const result = await fetchFn();
      return result;
    }
  };
}

/**
 * Wrapper générique pour cache
 */
export async function withCache(key, fetchFn, options = {}) {
  // TODO: Implémenter
  return fetchFn();
}

/**
 * Retourne les infos du dernier accès cache
 */
export function getCacheInfo() {
  return lastCacheInfo;
}
