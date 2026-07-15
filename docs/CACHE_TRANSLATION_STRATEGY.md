# Stratégie de Cache et Traduction - Tako API

## Vue d'ensemble

Ce document décrit l'architecture de cache et traduction optimisée pour Tako API, conçue pour maximiser les performances pour le cas d'usage principal (français) tout en supportant le multi-langue.

## Principe fondamental

**Le cache stocke TOUJOURS les données dans DEFAULT_LOCALE (fr-FR par défaut)**

Cela signifie :
- ✅ Les requêtes en français bénéficient du cache instantané (pas de traduction)
- ✅ Une seule version des données en cache (pas de duplication par langue)
- ✅ Traduction uniquement pour les langues secondaires (en, de, es, etc.)
- ✅ Optimisation de l'espace disque (1 cache au lieu de N caches par langue)

## Architecture

### 1. Flux normal (langue = DEFAULT_LOCALE = fr-FR)

```
┌─────────────┐
│  Requête    │
│  lang=fr    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Cache Check    │
│  (clé sans lang)│
└──────┬──────────┘
       │
       ├─── HIT ───────► Retour immédiat (déjà en français) ✅
       │
       └─── MISS ──┐
                   │
                   ▼
           ┌───────────────┐
           │  API Call     │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Traduction   │
           │  API → fr-FR  │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Save Cache   │
           │  (en fr-FR)   │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Retour       │
           └───────────────┘
```

**Performance** : Cache HIT = 0ms de traduction 🚀

---

### 2. Flux secondaire (langue ≠ DEFAULT_LOCALE, ex: en)

```
┌─────────────┐
│  Requête    │
│  lang=en    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Cache Check    │
│  (clé sans lang)│
└──────┬──────────┘
       │
       ├─── HIT ──┐
       │          │
       │          ▼
       │   ┌────────────────┐
       │   │  Traduction    │
       │   │  fr-FR → en    │
       │   └────────┬───────┘
       │            │
       │            ▼
       │   ┌────────────────┐
       │   │  Retour        │
       │   └────────────────┘
       │
       └─── MISS ──┐
                   │
                   ▼
           ┌───────────────┐
           │  API Call     │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Traduction   │
           │  API → fr-FR  │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Save Cache   │
           │  (en fr-FR)   │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Traduction   │
           │  fr-FR → en   │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  Retour       │
           └───────────────┘
```

**Performance** : Cache HIT = 1 traduction (fr→en) au lieu de 0, mais API économisée

---

## Implémentation

### Configuration

```javascript
// .env
DEFAULT_LOCALE=fr-FR
AUTO_TRAD_ENABLED=true
```

### Cache Wrapper

```javascript
// src/shared/utils/cache-wrapper.js
export async function withDiscoveryCache({ provider, endpoint, fetchFn, cacheOptions = {} }) {
  const { ttl = 24 * 60 * 60, ...keyOptions } = cacheOptions;
  
  // IMPORTANT : La clé de cache n'inclut PAS la langue
  const cacheKeyOptions = { ...keyOptions };
  delete cacheKeyOptions.lang;  // ← Supprime lang de la clé
  
  const cacheKey = generateCacheKey(provider, endpoint, cacheKeyOptions);
  
  // Essayer le cache (toujours en DEFAULT_LOCALE)
  const cached = await getCached(cacheKey);
  
  if (cached) {
    return { data: cached, fromCache: true, cacheKey };
  }
  
  // Cache MISS : fetchFn doit retourner données en DEFAULT_LOCALE
  const data = await fetchFn();
  
  // Sauvegarder en cache (données déjà en DEFAULT_LOCALE)
  saveCached(cacheKey, provider, endpoint, data, { ...cacheKeyOptions, ttl });
  
  return { data, fromCache: false, cacheKey };
}
```

### Routes Discovery

```javascript
// Exemple : /anime-manga/jikan/trending/tv
router.get('/trending/tv', asyncHandler(async (req, res) => {
  const { lang, autoTrad, sfw = 'all' } = req.query;
  const autoTradEnabled = isAutoTradEnabled({ autoTrad });
  const targetLang = extractLangCode(lang);
  
  // 1. Cache check (toujours en DEFAULT_LOCALE)
  const { data: results, fromCache, cacheKey } = await withDiscoveryCache({
    provider: 'jikan',
    endpoint: 'trending',
    fetchFn: async () => {
      // Récupérer les données de l'API
      let results = await provider.getCurrentSeason({ sfw, filter: 'tv' });
      
      // Enrichir avec backdrops
      results.data = await enrichWithBackdrops(results.data);
      
      // IMPORTANT : Traduire vers DEFAULT_LOCALE AVANT le cache
      if (autoTradEnabled) {
        results = await translateSearchResults(results, env.defaultLocale, {
          fieldsToTranslate: ['synopsis', 'title'],
          enabled: true
        });
      }
      
      return results;
    },
    cacheOptions: {
      category: 'tv',
      sfw,
      ttl: getTTL('trending')
      // PAS de 'lang' ici !
    }
  });
  
  // 2. Traduction post-cache si langue différente de DEFAULT_LOCALE
  let finalResults = results;
  if (autoTradEnabled && targetLang && targetLang !== env.defaultLocale) {
    finalResults = await translateSearchResults(results, targetLang, {
      fieldsToTranslate: ['synopsis', 'title'],
      enabled: true
    });
  }
  
  res.json({
    success: true,
    data: finalResults.data,
    meta: {
      fromCache,
      cacheKey,
      cachedLocale: env.defaultLocale,  // fr-FR
      requestedLang: targetLang,        // en, de, etc.
      translated: targetLang !== env.defaultLocale
    }
  });
}));
```

---

## Avantages

### Performance

| Scénario | Sans optimisation | Avec optimisation | Gain |
|----------|------------------|-------------------|------|
| Requête fr-FR (cache HIT) | Traduction API→fr | Aucune traduction | **100%** ⚡ |
| Requête fr-FR (cache MISS) | API + Traduction | API + Traduction | 0% |
| Requête en (cache HIT) | API + Traduction | Traduction fr→en | **~50%** |
| Requête en (cache MISS) | API + Traduction | API + Trad→fr + Trad fr→en | -50% |

**Cas d'usage principal (fr-FR avec cache) : gain de 100%**

### Espace disque

Avant : 
```
Cache trending/tv?lang=fr-FR
Cache trending/tv?lang=en
Cache trending/tv?lang=de
Cache trending/tv?lang=es
→ 4 entrées x 50 KB = 200 KB
```

Après :
```
Cache trending/tv (fr-FR)
→ 1 entrée x 50 KB = 50 KB
```

**Économie : 75% d'espace disque**

---

## Migration

### Changements nécessaires

1. ✅ **cache-wrapper.js** : Supprimer `lang` de la clé de cache
2. ✅ **Routes discovery** : Traduire vers DEFAULT_LOCALE AVANT le cache
3. ✅ **Routes discovery** : Traduire vers langue cible APRÈS le cache (si différent)
4. ⏳ **Vider le cache existant** : Les anciennes clés avec `lang` sont obsolètes

### Commandes de migration

```bash
# Vider le cache discovery existant
docker exec tako_db psql -U tako -d tako_cache -c "DELETE FROM discovery_cache WHERE created_at < NOW();"

# Ou plus sélectif (garder les données récentes)
docker exec tako_db psql -U tako -d tako_cache -c "DELETE FROM discovery_cache WHERE cache_key LIKE '%lang=%';"
```

---

## Tests de validation

### Test 1 : Cache fr-FR (cas nominal)

```bash
# 1ère requête (MISS)
curl "http://localhost:3000/anime-manga/jikan/trending/tv?lang=fr-FR&autoTrad=true"
# → fromCache: false, temps: ~2000ms

# 2ème requête (HIT)
curl "http://localhost:3000/anime-manga/jikan/trending/tv?lang=fr-FR&autoTrad=true"
# → fromCache: true, temps: ~50ms ✅ (pas de traduction)
```

### Test 2 : Cache multi-langue

```bash
# 1ère requête fr-FR (MISS)
curl "http://localhost:3000/anime-manga/jikan/trending/tv?lang=fr-FR&autoTrad=true"
# → fromCache: false, cachedLocale: fr-FR

# 2ème requête en (HIT + traduction)
curl "http://localhost:3000/anime-manga/jikan/trending/tv?lang=en&autoTrad=true"
# → fromCache: true, cachedLocale: fr-FR, requestedLang: en, translated: true

# 3ème requête de (HIT + traduction)
curl "http://localhost:3000/anime-manga/jikan/trending/tv?lang=de&autoTrad=true"
# → fromCache: true, cachedLocale: fr-FR, requestedLang: de, translated: true

# 4ème requête fr-FR (HIT + pas de traduction)
curl "http://localhost:3000/anime-manga/jikan/trending/tv?lang=fr-FR&autoTrad=true"
# → fromCache: true, translated: false ✅ (optimal)
```

### Test 3 : Validation données

```bash
# Vérifier que le cache stocke bien en fr-FR
docker exec tako_db psql -U tako -d tako_cache -c \
  "SELECT cache_key, LENGTH(data::text) as size, created_at FROM discovery_cache WHERE provider='jikan' LIMIT 5;"
```

---

## Considérations

### Langues supportées

Les traductions sont faites via l'API de traduction automatique. Langues supportées :
- fr-FR (défaut)
- en (anglais)
- de (allemand)
- es (espagnol)
- it (italien)
- pt (portugais)
- ja (japonais)
- etc.

### Désactiver la traduction

Si `AUTO_TRAD_ENABLED=false` dans `.env` :
- Les données API sont retournées dans leur langue native (en pour TMDB/Jikan)
- Pas de traduction vers DEFAULT_LOCALE
- Pas de traduction post-cache
- Le cache stocke les données en langue native

### Performance de traduction

La traduction est faite par un service de traduction automatique :
- Temps moyen : ~50-100ms par champ
- Pour 20 résultats avec 2 champs : ~2000ms (2 secondes)
- Cache HIT en fr-FR : 0ms ✅

---

## Maintenance

### Monitoring

Ajouter des logs pour suivre l'efficacité :

```javascript
log.info('Cache stats', {
  provider,
  endpoint,
  fromCache,
  cachedLocale: env.defaultLocale,
  requestedLang: targetLang,
  translationNeeded: targetLang !== env.defaultLocale
});
```

### Métriques à surveiller

- **Taux de cache HIT** : Devrait être > 80%
- **Temps de traduction moyen** : < 100ms par champ
- **Taille du cache** : Devrait diminuer de ~75%
- **Requêtes fr-FR** : Devraient être < 50ms avec cache

---

## Conclusion

Cette architecture optimise le cas d'usage principal (français) tout en maintenant le support multi-langue. Le gain de performance est significatif (100% sur cache HIT fr-FR) et l'espace disque est réduit de 75%.

**Recommandation** : Déployer cette optimisation en priorité sur les endpoints discovery les plus utilisés (trending, popular, top).
