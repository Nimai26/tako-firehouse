/**
 * Wrapper helper pour intégrer le cache dans les routes discovery
 * Tako API v1.0.0
 */

import { getCached, saveCached, generateCacheKey } from '../../infrastructure/database/discovery-cache.repository.js';
import { createLogger } from './logger.js';
import { env } from '../../config/env.js';

const log = createLogger('CacheWrapper');

/**
 * Wrapper pour les endpoints discovery avec cache automatique
 * 
 * STRATÉGIE DE CACHE ET TRADUCTION :
 * - Le cache stocke TOUJOURS les données dans DEFAULT_LOCALE (fr-FR par défaut)
 * - La traduction vers DEFAULT_LOCALE est faite AVANT la mise en cache
 * - Les requêtes dans DEFAULT_LOCALE bénéficient du cache sans traduction (performance max)
 * - Les requêtes dans d'autres langues sont traduites APRÈS récupération du cache
 * 
 * @param {Object} options - Options du wrapper
 * @param {string} options.provider - Nom du provider (tmdb, jikan, etc.)
 * @param {string} options.endpoint - Nom de l'endpoint (trending, popular, etc.)
 * @param {Function} options.fetchFn - Fonction async qui appelle le provider (doit retourner données en DEFAULT_LOCALE)
 * @param {Object} options.cacheOptions - Options du cache (category, period, ttl)
 * @returns {Promise<{data: Object, fromCache: boolean, cacheKey: string}>}
 */
export async function withDiscoveryCache({ provider, endpoint, fetchFn, cacheOptions = {} }) {
  const { ttl = 24 * 60 * 60, ...keyOptions } = cacheOptions;
  
  // IMPORTANT : La clé de cache n'inclut PAS la langue
  // Car on cache toujours dans DEFAULT_LOCALE
  const cacheKeyOptions = { ...keyOptions };
  delete cacheKeyOptions.lang;  // Supprimer lang si présent
  
  const cacheKey = generateCacheKey(provider, endpoint, cacheKeyOptions);
  
  // Essayer le cache d'abord
  const cached = await getCached(cacheKey);
  
  if (cached) {
    log.debug(`Cache HIT: ${provider}/${endpoint} (stored in ${env.defaultLocale})`);
    return {
      data: cached,
      fromCache: true,
      cacheKey
    };
  }
  
  // Cache MISS : appeler le provider
  log.debug(`Cache MISS: ${provider}/${endpoint} - Fetching from API in ${env.defaultLocale}`);
  const data = await fetchFn();
  
  // Sauvegarder en cache (async, non-bloquant)
  // Les données sont déjà dans DEFAULT_LOCALE grâce à fetchFn
  saveCached(cacheKey, provider, endpoint, data, {
    ...cacheKeyOptions,
    ttl
  }).catch(err => {
    log.error(`Erreur sauvegarde cache: ${err.message}`, { cacheKey });
  });
  
  return {
    data,
    fromCache: false,
    cacheKey
  };
}

/**
 * TTL recommandés par type d'endpoint
 */
export const CACHE_TTL = {
  // Trending : 24h (refresh quotidien)
  trending: 24 * 60 * 60,
  
  // Popular : 24h (refresh quotidien)
  popular: 24 * 60 * 60,
  
  // Top-rated : 24h (peu de changements)
  'top-rated': 24 * 60 * 60,
  
  // Charts : 24h (refresh quotidien)
  charts: 24 * 60 * 60,
  
  // Upcoming : 6h (refresh 4x/jour)
  upcoming: 6 * 60 * 60,
  
  // On-the-air : 6h
  'on-the-air': 6 * 60 * 60,
  
  // Airing-today : 6h
  'airing-today': 6 * 60 * 60,
  
  // Schedule : 12h
  schedule: 12 * 60 * 60,
  
  // Défaut
  default: 24 * 60 * 60
};

/**
 * Récupère le TTL approprié pour un endpoint
 */
export function getTTL(endpoint) {
  return CACHE_TTL[endpoint] || CACHE_TTL.default;
}
