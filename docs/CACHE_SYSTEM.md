# 🗄️ Système de Cache PostgreSQL - Tako API

**Date de création** : 2 février 2026  
**Status** : En conception  
**Objectif** : Cache PostgreSQL pour trending/popular/charts/upcoming avec refresh automatique échelonné

---

## 🎯 Objectifs

### Problématiques actuelles
- ❌ Appels API externes à chaque requête utilisateur
- ❌ Rate limits atteints sur requêtes fréquentes
- ❌ Latence élevée (2-5s par requête)
- ❌ Surcharge serveur si pics de trafic
- ❌ Données trending identiques pendant 24h

### Solutions proposées
- ✅ Cache PostgreSQL dédié aux endpoints discovery
- ✅ Refresh automatique toutes les 24h (horaires échelonnés)
- ✅ Réduction latence : < 100ms au lieu de 2-5s
- ✅ Indépendance vis-à-vis des rate limits API
- ✅ Scalabilité : PostgreSQL gère +100k requêtes/s

---

## 📊 Architecture du Cache

### 1. Table PostgreSQL

```sql
CREATE TABLE IF NOT EXISTS discovery_cache (
  -- Identifiant unique
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(255) UNIQUE NOT NULL,  -- Ex: "tmdb:trending:movie:week"
  
  -- Métadonnées
  provider VARCHAR(50) NOT NULL,            -- tmdb, jikan, rawg, igdb, deezer, itunes
  endpoint VARCHAR(50) NOT NULL,            -- trending, popular, charts, upcoming, etc.
  category VARCHAR(50),                     -- movie, tv, anime, manga, game, album
  period VARCHAR(20),                       -- day, week, month (pour trending)
  
  -- Données
  data JSONB NOT NULL,                      -- Résultats complets normalisés
  total_results INTEGER,                    -- Nombre total de résultats
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_accessed TIMESTAMP DEFAULT NOW(),
  
  -- Statistiques
  fetch_count INTEGER DEFAULT 0,
  refresh_count INTEGER DEFAULT 0,
  
  -- Index pour performances
  INDEX idx_cache_key (cache_key),
  INDEX idx_provider_endpoint (provider, endpoint),
  INDEX idx_expires_at (expires_at),
  INDEX idx_last_accessed (last_accessed)
);

-- Fonction pour mise à jour last_accessed
CREATE OR REPLACE FUNCTION update_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed = NOW();
  NEW.fetch_count = NEW.fetch_count + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_last_accessed
BEFORE UPDATE ON discovery_cache
FOR EACH ROW
EXECUTE FUNCTION update_last_accessed();
```

### 2. Générateur de cache_key

Format standardisé : `{provider}:{endpoint}:{category}:{period}:{params}:{page}`

```javascript
function generateCacheKey(provider, endpoint, options = {}) {
  const parts = [provider, endpoint];
  
  if (options.category) parts.push(options.category);
  if (options.period) parts.push(options.period);
  if (options.type) parts.push(options.type);
  if (options.filter) parts.push(options.filter);
  if (options.day) parts.push(options.day);
  if (options.sfw && options.sfw !== 'all') parts.push(options.sfw);
  if (options.page && options.page > 1) parts.push(`p${options.page}`);
  
  return parts.join(':');
}

// Exemples
generateCacheKey('tmdb', 'trending', { category: 'movie', period: 'week' })
// → "tmdb:trending:movie:week"          (page 1, pas de suffixe)

generateCacheKey('tmdb', 'trending', { category: 'movie', period: 'week', page: 2 })
// → "tmdb:trending:movie:week:p2"       (page 2)

generateCacheKey('jikan', 'trending', { category: 'tv', sfw: 'sfw', page: 3 })
// → "jikan:trending:tv:sfw:p3"          (page 3, filtre sfw)

generateCacheKey('jikan', 'schedule', { day: 'monday' })
// → "jikan:schedule:monday"

generateCacheKey('deezer', 'charts')
// → "deezer:charts"
```

> **Note** : La page 1 n'ajoute pas de suffixe pour rester compatible avec les entrées de cache existantes. Chaque page > 1 produit une clé distincte (`:p2`, `:p3`, etc.).

---

## 🔄 Stratégie de Refresh Échelonné

### Configuration TTL par type

```javascript
const REFRESH_CONFIG = {
  // Trending : refresh quotidien à 2h du matin
  trending: {
    ttl: 24 * 60 * 60,  // 24 heures
    schedules: {
      tmdb: '02:00',      // 2h00
      jikan: '02:30',     // 2h30
      rawg: '03:00',      // 3h00
      igdb: '03:30'       // 3h30
    }
  },
  
  // Popular : refresh quotidien à 3h du matin
  popular: {
    ttl: 24 * 60 * 60,
    schedules: {
      tmdb: '03:00',
      jikan: '03:30',
      rawg: '04:00',
      igdb: '04:30'
    }
  },
  
  // Charts : refresh quotidien à 4h du matin
  charts: {
    ttl: 24 * 60 * 60,
    schedules: {
      deezer: '04:00',
      itunes: '04:30'
    }
  },
  
  // Upcoming : refresh toutes les 6 heures
  upcoming: {
    ttl: 6 * 60 * 60,  // 6 heures
    schedules: {
      tmdb: ['00:00', '06:00', '12:00', '18:00'],
      jikan: ['01:00', '07:00', '13:00', '19:00'],
      rawg: ['02:00', '08:00', '14:00', '20:00'],
      igdb: ['03:00', '09:00', '15:00', '21:00']
    }
  }
};
```

### Avantages de l'échelonnement

1. **Pas de flooding** : Chaque provider à son horaire
2. **Répartition charge** : Lissage sur la nuit
3. **Rate limits respectés** : Délai de 30min minimum entre providers
4. **Monitoring facile** : 1 provider = 1 créneau
5. **Fail-safe** : Si 1 échoue, les autres continuent

---

## 🛠️ Implémentation

### 1. Module de connexion PostgreSQL

**Fichier** : `src/infrastructure/database/connection.js`

```javascript
import pg from 'pg';
import { logger } from '../../shared/utils/logger.js';

const log = logger.create('Database');
const { Pool } = pg;

let pool = null;

export function initDatabase() {
  if (!process.env.POSTGRES_URL) {
    log.warn('POSTGRES_URL non configurée, cache désactivé');
    return;
  }
  
  pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });
  
  pool.on('error', (err) => {
    log.error('Erreur PostgreSQL:', err);
  });
  
  log.info('PostgreSQL connecté');
}

export function getPool() {
  return pool;
}

export async function query(text, params) {
  if (!pool) return null;
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  log.debug('Query executed', { duration: `${duration}ms`, rows: res.rowCount });
  return res;
}

export function isConnected() {
  return pool !== null;
}
```

### 2. Repository discovery_cache

**Fichier** : `src/infrastructure/database/discovery-cache.repository.js`

```javascript
import { query, isConnected } from './connection.js';
import { logger } from '../../shared/utils/logger.js';

const log = logger.create('DiscoveryCache');

/**
 * Récupère les données du cache
 */
export async function getCached(cacheKey) {
  if (!isConnected()) return null;
  
  try {
    const result = await query(
      `SELECT data, total_results, updated_at 
       FROM discovery_cache 
       WHERE cache_key = $1 
         AND expires_at > NOW()
       LIMIT 1`,
      [cacheKey]
    );
    
    if (result.rows.length === 0) {
      log.debug(`Cache MISS: ${cacheKey}`);
      return null;
    }
    
    // Incrémenter fetch_count
    query(
      `UPDATE discovery_cache 
       SET fetch_count = fetch_count + 1, last_accessed = NOW() 
       WHERE cache_key = $1`,
      [cacheKey]
    ).catch(() => {});
    
    log.debug(`Cache HIT: ${cacheKey}`, { 
      age: Math.round((Date.now() - new Date(result.rows[0].updated_at)) / 1000 / 60) + 'min'
    });
    
    return result.rows[0].data;
  } catch (err) {
    log.error(`Erreur getCached: ${err.message}`);
    return null;
  }
}

/**
 * Sauvegarde les données dans le cache
 */
export async function saveCached(cacheKey, provider, endpoint, data, options = {}) {
  if (!isConnected()) return false;
  
  const { category, period, ttl = 24 * 60 * 60 } = options;
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
    log.error(`Erreur saveCached: ${err.message}`);
    return false;
  }
}

/**
 * Récupère les entrées expirées qui doivent être rafraîchies
 */
export async function getExpiredEntries(limit = 10) {
  if (!isConnected()) return [];
  
  try {
    const result = await query(
      `SELECT cache_key, provider, endpoint, category, period 
       FROM discovery_cache 
       WHERE expires_at < NOW()
       ORDER BY expires_at ASC 
       LIMIT $1`,
      [limit]
    );
    
    return result.rows;
  } catch (err) {
    log.error(`Erreur getExpiredEntries: ${err.message}`);
    return [];
  }
}

/**
 * Supprime les entrées trop anciennes (non accédées depuis 90 jours)
 */
export async function purgeOldEntries(daysThreshold = 90) {
  if (!isConnected()) return 0;
  
  try {
    const result = await query(
      `DELETE FROM discovery_cache 
       WHERE last_accessed < NOW() - INTERVAL '1 day' * $1`,
      [daysThreshold]
    );
    
    if (result.rowCount > 0) {
      log.info(`Purge: ${result.rowCount} entrées supprimées (> ${daysThreshold}j)`);
    }
    
    return result.rowCount;
  } catch (err) {
    log.error(`Erreur purgeOldEntries: ${err.message}`);
    return 0;
  }
}
```

### 3. Scheduler de refresh

**Fichier** : `src/infrastructure/database/refresh-scheduler.js`

```javascript
import cron from 'node-cron';
import { logger } from '../../shared/utils/logger.js';
import { getExpiredEntries, purgeOldEntries } from './discovery-cache.repository.js';
import { refreshCacheEntry } from './cache-refresher.js';

const log = logger.create('RefreshScheduler');

const jobs = [];

/**
 * Démarre les cron jobs de refresh
 */
export function startRefreshScheduler() {
  log.info('Démarrage du scheduler de refresh...');
  
  // Job 1: TMDB trending movies/tv - tous les jours à 2h00
  jobs.push(cron.schedule('0 2 * * *', async () => {
    log.info('[CRON] Refresh TMDB trending...');
    await refreshCacheEntry('tmdb:trending:movie:week');
    await refreshCacheEntry('tmdb:trending:tv:week');
  }));
  
  // Job 2: TMDB popular - tous les jours à 3h00
  jobs.push(cron.schedule('0 3 * * *', async () => {
    log.info('[CRON] Refresh TMDB popular...');
    await refreshCacheEntry('tmdb:popular:movie');
    await refreshCacheEntry('tmdb:popular:tv');
  }));
  
  // Job 3: Jikan trending - tous les jours à 2h30
  jobs.push(cron.schedule('30 2 * * *', async () => {
    log.info('[CRON] Refresh Jikan trending...');
    await refreshCacheEntry('jikan:trending');
  }));
  
  // Job 4: RAWG popular/trending - tous les jours à 3h00/4h00
  jobs.push(cron.schedule('0 3 * * *', async () => {
    log.info('[CRON] Refresh RAWG...');
    await refreshCacheEntry('rawg:popular');
  }));
  
  jobs.push(cron.schedule('0 4 * * *', async () => {
    await refreshCacheEntry('rawg:trending');
  }));
  
  // Job 5: Charts musique - tous les jours à 4h00/4h30
  jobs.push(cron.schedule('0 4 * * *', async () => {
    log.info('[CRON] Refresh Charts musique...');
    await refreshCacheEntry('deezer:charts');
  }));
  
  jobs.push(cron.schedule('30 4 * * *', async () => {
    await refreshCacheEntry('itunes:charts');
  }));
  
  // Job 6: Upcoming - toutes les 6 heures (00:00, 06:00, 12:00, 18:00)
  jobs.push(cron.schedule('0 */6 * * *', async () => {
    log.info('[CRON] Refresh Upcoming...');
    await refreshCacheEntry('tmdb:upcoming:movie');
    await refreshCacheEntry('tmdb:upcoming:tv');
    await refreshCacheEntry('jikan:upcoming');
    await refreshCacheEntry('rawg:upcoming');
    await refreshCacheEntry('igdb:upcoming');
  }));
  
  // Job 7: Purge des anciennes entrées - tous les jours à 5h00
  jobs.push(cron.schedule('0 5 * * *', async () => {
    log.info('[CRON] Purge anciennes entrées...');
    await purgeOldEntries(90);
  }));
  
  // Job 8: Check entrées expirées - toutes les heures
  jobs.push(cron.schedule('0 * * * *', async () => {
    const expired = await getExpiredEntries(5);
    if (expired.length > 0) {
      log.warn(`${expired.length} entrées expirées détectées`);
      // Les rafraîchir si nécessaire
      for (const entry of expired) {
        await refreshCacheEntry(entry.cache_key);
      }
    }
  }));
  
  log.info(`${jobs.length} cron jobs démarrés`);
}

/**
 * Arrête tous les cron jobs
 */
export function stopRefreshScheduler() {
  jobs.forEach(job => job.stop());
  jobs.length = 0;
  log.info('Scheduler arrêté');
}
```

---

## 📝 Intégration dans les routes

### Modification des routes existantes

**Exemple pour TMDB trending :**

```javascript
// Avant (direct API)
router.get('/trending', asyncHandler(async (req, res) => {
  const data = await tmdbProvider.getTrending(category, period);
  res.json({ success: true, data });
}));

// Après (avec cache)
import { getCached, saveCached } from '../../../infrastructure/database/discovery-cache.repository.js';

router.get('/trending', asyncHandler(async (req, res) => {
  const { category = 'movie', period = 'week' } = req.query;
  const cacheKey = `tmdb:trending:${category}:${period}`;
  
  // Essayer le cache d'abord
  let data = await getCached(cacheKey);
  let fromCache = true;
  
  if (!data) {
    // Cache MISS : appeler l'API
    fromCache = false;
    data = await tmdbProvider.getTrending(category, period);
    
    // Sauvegarder en cache (async)
    saveCached(cacheKey, 'tmdb', 'trending', data, {
      category,
      period,
      ttl: 24 * 60 * 60
    }).catch(() => {});
  }
  
  res.json({
    success: true,
    provider: 'tmdb',
    endpoint: 'trending',
    data,
    metadata: {
      category,
      period,
      cached: fromCache
    }
  });
}));
```

---

## 🧪 Tests

### Test du cache

```bash
# 1. Appel initial (cache MISS, API call)
curl "http://localhost:3000/api/media/tmdb/trending?category=movie&period=week"
# Temps: ~2s

# 2. Appel suivant (cache HIT)
curl "http://localhost:3000/api/media/tmdb/trending?category=movie&period=week"
# Temps: ~50ms

# 3. Vérifier les stats
curl "http://localhost:3000/api/cache/stats"
```

---

## 📊 Monitoring

### Endpoint de statistiques

```javascript
// GET /api/cache/stats
router.get('/cache/stats', asyncHandler(async (req, res) => {
  const stats = await query(`
    SELECT 
      provider,
      endpoint,
      COUNT(*) as total_entries,
      SUM(fetch_count) as total_fetches,
      AVG(refresh_count) as avg_refreshes,
      MIN(updated_at) as oldest_update,
      MAX(updated_at) as latest_update
    FROM discovery_cache
    GROUP BY provider, endpoint
    ORDER BY provider, endpoint
  `);
  
  res.json({
    success: true,
    stats: stats.rows
  });
}));
```

---

## 🚀 Mise en production

### Variables d'environnement

```bash
# .env
POSTGRES_URL=postgresql://user:password@localhost:5432/tako_cache
CACHE_ENABLED=true
CACHE_MODE=hybrid  # hybrid | api_only | db_only
```

### Migration initiale

```bash
# Créer la table
psql $POSTGRES_URL -f scripts/migrations/001_create_discovery_cache.sql

# Pré-remplir le cache (optionnel)
npm run cache:populate
```

---

## 🎯 Bénéfices attendus

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| Latence moyenne | 2-5s | < 100ms | **95%** |
| Charge API externe | 100% requêtes | < 5% requêtes | **95%** |
| Rate limits atteints | Oui (pics) | Non | ✅ |
| Coût infrastructure | Standard | Standard | = |
| Scalabilité | Limitée | Élevée | ✅ |

---

**Prochaines étapes** :
1. ✅ Valider l'architecture
2. ⚪ Créer la table PostgreSQL
3. ⚪ Implémenter le repository
4. ⚪ Intégrer dans 1 route (POC)
5. ⚪ Déployer le scheduler
6. ⚪ Migrer toutes les routes discovery
