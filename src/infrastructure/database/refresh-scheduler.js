/**
 * Cache Refresh Scheduler
 * Planifie les rafraîchissements automatiques du cache avec cron jobs
 * Tako API v1.0.0
 */

import cron from 'node-cron';
import { refreshProviderCaches, refreshExpiredCaches } from './cache-refresher.js';
import { purgeOldEntries } from './discovery-cache.repository.js';
import { createLogger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';

const log = createLogger('CacheScheduler');

// Stockage des tâches cron
const cronJobs = [];

/**
 * Démarre le scheduler de refresh automatique
 */
export function startRefreshScheduler() {
  if (!config.cache.enabled) {
    log.info('Cache scheduler désactivé (DB_ENABLED=false)');
    return;
  }
  
  log.info('🕒 Démarrage du cache refresh scheduler...');
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TRENDING - Refresh quotidien décalé (2:00-3:00 AM)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 02:00 - TMDB trending
  cronJobs.push(cron.schedule('0 2 * * *', async () => {
    log.info('🔄 [CRON 02:00] TMDB trending refresh...');
    await refreshProviderCaches('tmdb');
  }));
  
  // 02:30 - Jikan trending
  cronJobs.push(cron.schedule('30 2 * * *', async () => {
    log.info('🔄 [CRON 02:30] Jikan trending refresh...');
    await refreshProviderCaches('jikan');
  }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // POPULAR - Refresh quotidien (3:00-4:00 AM)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 03:00 - TMDB + RAWG popular
  cronJobs.push(cron.schedule('0 3 * * *', async () => {
    log.info('🔄 [CRON 03:00] TMDB/RAWG popular refresh...');
    await refreshProviderCaches('tmdb');
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s de pause
    await refreshProviderCaches('rawg');
  }));
  
  // 03:30 - IGDB popular
  cronJobs.push(cron.schedule('30 3 * * *', async () => {
    log.info('🔄 [CRON 03:30] IGDB popular refresh...');
    await refreshProviderCaches('igdb');
  }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHARTS - Refresh quotidien (4:00-5:00 AM)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 04:00 - Deezer charts
  cronJobs.push(cron.schedule('0 4 * * *', async () => {
    log.info('🔄 [CRON 04:00] Deezer charts refresh...');
    await refreshProviderCaches('deezer');
  }));
  
  // 04:30 - iTunes charts
  cronJobs.push(cron.schedule('30 4 * * *', async () => {
    log.info('🔄 [CRON 04:30] iTunes charts refresh...');
    await refreshProviderCaches('itunes');
  }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UPCOMING - Refresh toutes les 6h (00:00, 06:00, 12:00, 18:00)
  // ═══════════════════════════════════════════════════════════════════════════
  
  cronJobs.push(cron.schedule('0 */6 * * *', async () => {
    const hour = new Date().getHours();
    log.info(`🔄 [CRON ${hour}:00] Upcoming caches refresh...`);
    await refreshExpiredCaches(20);
  }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PURGE - Nettoyage quotidien à 5:00 AM (supprime les entrées > 90 jours)
  // ═══════════════════════════════════════════════════════════════════════════
  
  cronJobs.push(cron.schedule('0 5 * * *', async () => {
    log.info('🗑️  [CRON 05:00] Purge des anciennes entrées...');
    const deleted = await purgeOldEntries(90);
    log.info(`✅ Purge terminé: ${deleted} entrées supprimées`);
  }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MONITORING - Toutes les heures (log des stats)
  // ═══════════════════════════════════════════════════════════════════════════
  
  cronJobs.push(cron.schedule('0 * * * *', async () => {
    const { getCacheStats } = await import('./discovery-cache.repository.js');
    const stats = await getCacheStats();
    
    if (stats.total > 0) {
      log.debug(`📊 Cache stats: ${stats.total} entries, ${stats.providers.length} providers`);
    }
  }));
  
  log.info(`✅ Cache scheduler démarré: ${cronJobs.length} tâches planifiées`);
  log.info('   - 02:00 → TMDB trending');
  log.info('   - 02:30 → Jikan trending');
  log.info('   - 03:00 → TMDB/RAWG popular');
  log.info('   - 03:30 → IGDB popular');
  log.info('   - 04:00 → Deezer charts');
  log.info('   - 04:30 → iTunes charts');
  log.info('   - */6h  → Upcoming refresh');
  log.info('   - 05:00 → Purge anciennes entrées');
  log.info('   - */1h  → Monitoring stats');
}

/**
 * Arrête toutes les tâches cron
 */
export function stopRefreshScheduler() {
  log.info('🛑 Arrêt du cache refresh scheduler...');
  
  cronJobs.forEach(job => {
    job.stop();
  });
  
  cronJobs.length = 0;
  log.info('✅ Scheduler arrêté');
}

/**
 * Force un refresh manuel d'un provider
 * @param {string} provider - Nom du provider
 * @returns {Promise<Object>}
 */
export async function forceRefresh(provider) {
  log.info(`🔄 Force refresh: ${provider}`);
  return await refreshProviderCaches(provider);
}

/**
 * Force un refresh de toutes les entrées expirées
 * @param {number} batchSize - Taille du batch
 * @returns {Promise<Object>}
 */
export async function forceRefreshExpired(batchSize = 10) {
  log.info(`🔄 Force refresh: ${batchSize} expired entries`);
  return await refreshExpiredCaches(batchSize);
}
/**
 * Force un refresh de TOUTES les entrées (même non expirées)
 * @returns {Promise<Object>}
 */
export async function forceRefreshAll() {
  log.info('🔄 Force refresh: ALL entries (including valid ones)');
  
  const { getAllEntries } = await import('./discovery-cache.repository.js');
  const { refreshCacheEntry } = await import('./cache-refresher.js');
  
  const startTime = Date.now();
  
  try {
    // Récupérer TOUTES les entrées
    const allEntries = await getAllEntries();
    
    if (allEntries.length === 0) {
      log.debug('No cache entries to refresh');
      return { total: 0, success: 0, failed: 0 };
    }
    
    log.info(`🔄 Refreshing ${allEntries.length} cache entries (forced)...`);
    
    let success = 0;
    let failed = 0;
    
    for (const entry of allEntries) {
      const result = await refreshCacheEntry(entry);
      if (result) {
        success++;
      } else {
        failed++;
      }
      
      // Délai entre chaque refresh
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const duration = Date.now() - startTime;
    log.info(`✅ Forced refresh complete: ${success} success, ${failed} failed (${duration}ms)`);
    
    return {
      total: allEntries.length,
      success,
      failed,
      duration
    };
  } catch (err) {
    log.error(`❌ Forced refresh error: ${err.message}`);
    return { total: 0, success: 0, failed: 0, error: err.message };
  }
}