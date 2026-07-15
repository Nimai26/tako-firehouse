# 📚 Guide Complet des Endpoints Discovery

Documentation exhaustive des endpoints de découverte (trending, popular, upcoming, etc.) avec cache PostgreSQL.

---

## 🎬 TMDB (Média - Films & Séries)

### **Trending** - Contenus populaires du moment

#### Films
```bash
GET /api/media/tmdb/trending?mediaType=movie&timeWindow=week
```

**Paramètres** :
- `mediaType` : `movie` (obligatoire pour films)
- `timeWindow` : `day` | `week` (défaut: `week`)
- `limit` : Nombre de résultats (défaut: 20, max: 100)
- `lang` : Code langue (défaut: `fr-FR`)

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "title": "Film Populaire",
      "overview": "Description...",
      "poster_path": "/path.jpg",
      "vote_average": 8.5,
      "release_date": "2026-01-15"
    }
  ],
  "metadata": {
    "provider": "tmdb",
    "endpoint": "trending",
    "searchType": "movie",
    "timeWindow": "week",
    "count": 20
  }
}
```

**Cache** : ✅ 24h TTL (clé: `tmdb:trending:movie:week`)

---

#### Séries TV
```bash
GET /api/media/tmdb/trending?mediaType=tv&timeWindow=week
```

**Paramètres** :
- `mediaType` : `tv` (obligatoire pour séries)
- `timeWindow` : `day` | `week` (défaut: `week`)

**Réponse** : Format identique aux films avec `name` au lieu de `title`

**Cache** : ✅ 24h TTL (clé: `tmdb:trending:tv:week`)

---

### **Popular** - Contenus les plus populaires

#### Films
```bash
GET /api/media/tmdb/popular?category=movie
```

**Paramètres** :
- `category` : `movie` (défaut: `movie`)
- `limit` : Nombre de résultats (défaut: 20)
- `lang` : Code langue (défaut: `fr-FR`)

⚠️ **ATTENTION** : Utilise `category` et non `mediaType` !

**Réponse** : Format identique à `/trending`

**Cache** : ✅ 24h TTL (clé: `tmdb:popular:movie`)

---

#### Séries TV
```bash
GET /api/media/tmdb/popular?category=tv
```

**Paramètres** : Identiques aux films avec `category=tv`

**Cache** : ✅ 24h TTL (clé: `tmdb:popular:tv`)

---

### **Top Rated** - Meilleurs contenus notés

#### Films
```bash
GET /api/media/tmdb/top-rated?category=movie
```

**Paramètres** :
- `category` : `movie` (défaut: `movie`)
- `limit` : Nombre de résultats (défaut: 20)
- `lang` : Code langue

⚠️ **ATTENTION** : Utilise `category` et non `mediaType` !

**Cache** : ✅ 24h TTL (clé: `tmdb:top-rated:movie`)

---

#### Séries TV
```bash
GET /api/media/tmdb/top-rated?category=tv
```

**Cache** : ✅ 24h TTL (clé: `tmdb:top-rated:tv`)

---

### **Upcoming** - Sorties à venir

#### Films
```bash
GET /api/media/tmdb/upcoming
```

**Paramètres** :
- `limit` : Nombre de résultats (défaut: 20)
- `lang` : Code langue

**Note** : Endpoint dédié films uniquement, pas besoin de `mediaType`

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "id": 67890,
      "title": "Film à venir",
      "release_date": "2026-03-20",
      "poster_path": "/upcoming.jpg"
    }
  ]
}
```

**Cache** : ✅ 6h TTL (clé: `tmdb:upcoming:movie`)

---

#### Séries TV - Diffusion en cours
```bash
GET /api/media/tmdb/on-the-air
```

**Description** : Séries actuellement diffusées à la télévision

**Paramètres** :
- `limit` : Nombre de résultats (défaut: 20)
- `lang` : Code langue

**Cache** : ✅ 6h TTL (clé: `tmdb:upcoming:tv:on-the-air`)

---

#### Séries TV - Diffusion aujourd'hui
```bash
GET /api/media/tmdb/airing-today
```

**Description** : Séries dont un épisode est diffusé aujourd'hui

**Paramètres** : Identiques à `/on-the-air`

**Cache** : ✅ 6h TTL (clé: `tmdb:upcoming:tv:airing-today`)

---

## 🎌 Jikan (Anime & Manga)

### **Top** - Meilleurs anime/manga classés

#### Anime
```bash
GET /api/anime-manga/jikan/top/anime
```

**Paramètres** :
- `limit` : Nombre de résultats (défaut: 20, max: 25)
- `page` : Page de résultats (défaut: 1)

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "mal_id": 12345,
      "title": "Attack on Titan",
      "score": 9.0,
      "rank": 1,
      "images": {
        "jpg": {
          "image_url": "https://...",
          "large_image_url": "https://..."
        }
      },
      "type": "TV",
      "episodes": 25,
      "status": "Finished Airing"
    }
  ],
  "metadata": {
    "provider": "jikan",
    "endpoint": "top",
    "type": "anime",
    "count": 20
  }
}
```

**Cache** : ✅ 24h TTL (clé: `jikan:top:anime`)

---

#### Manga
```bash
GET /api/anime-manga/jikan/top/manga
```

**Paramètres** : Identiques à `/top/anime`

**Cache** : ✅ 24h TTL (clé: `jikan:top:manga`)

---

### **Trending** - Anime de la saison en cours

```bash
GET /api/anime-manga/jikan/trending
```

**Paramètres** :
- `limit` : Nombre de résultats (défaut: 20)

**Description** : Retourne les anime de la saison en cours (season/now de MyAnimeList)

**Réponse** : Format identique à `/top`

**Cache** : ✅ 24h TTL (clé: `jikan:trending:all`)

⚠️ **Note** : Anime uniquement, pas de manga pour trending

---

### **Upcoming** - Anime à venir

```bash
GET /api/anime-manga/jikan/upcoming
```

**Paramètres** :
- `limit` : Nombre de résultats (défaut: 20)

**Description** : Anime prévus pour les prochaines saisons

**Cache** : ✅ 6h TTL (clé: `jikan:upcoming:all`)

---

### **Schedule** - Calendrier de diffusion

```bash
GET /api/anime-manga/jikan/schedule?day=monday
```

**Paramètres** :
- `day` : `monday` | `tuesday` | `wednesday` | `thursday` | `friday` | `saturday` | `sunday` (optionnel)
- `limit` : Nombre de résultats

**Description** : Anime diffusés un jour spécifique ou tous les jours si non spécifié

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "mal_id": 54321,
      "title": "One Piece",
      "broadcast": {
        "day": "Sunday",
        "time": "09:30",
        "timezone": "Asia/Tokyo"
      }
    }
  ]
}
```

**Cache** : ✅ 12h TTL (clé: `jikan:schedule:all` ou `jikan:schedule:monday`)

---

## 🎮 RAWG (Jeux Vidéo)

### **Popular** - Jeux les plus populaires

```bash
GET /api/videogames/rawg/popular
```

**Paramètres** :
- `pageSize` : Nombre de résultats (défaut: 20)
- `page` : Page de résultats (défaut: 1)

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "name": "The Witcher 3",
      "rating": 4.5,
      "metacritic": 92,
      "background_image": "https://...",
      "platforms": ["PC", "PlayStation", "Xbox"]
    }
  ]
}
```

**Cache** : ✅ 24h TTL (clé: `rawg:popular:all`)

⚠️ **État** : Endpoint renvoie souvent 0 résultats (problème API RAWG)

---

### **Trending** - Jeux tendance

```bash
GET /api/videogames/rawg/trending
```

**Paramètres** : Identiques à `/popular`

**Description** : Jeux récemment ajoutés et populaires

**Cache** : ✅ 24h TTL (clé: `rawg:trending:all`)

⚠️ **État** : Endpoint renvoie souvent 0 résultats (problème API RAWG)

---

## 🎯 IGDB (Jeux Vidéo)

### **Popular** - Jeux populaires

```bash
GET /api/videogames/igdb/popular
```

**Paramètres** :
- `limit` : Nombre de résultats (défaut: 20, **max API: 10**)

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "id": 1074,
      "name": "Super Mario 64",
      "rating": 89.5,
      "first_release_date": 820454400,
      "cover": {
        "url": "//images.igdb.com/..."
      },
      "genres": ["Platform", "Adventure"]
    }
  ]
}
```

**Cache** : ✅ 24h TTL (clé: `igdb:popular:all`)

⚠️ **Limitation** : L'API IGDB limite à 10 résultats maximum par requête

---

## 🎵 Deezer (Musique)

### **Charts** - Classements musicaux

```bash
GET /api/music/deezer/charts?category=albums
```

**Paramètres** :
- `category` : `albums` | `tracks` | `artists` (défaut: `albums`)
- `limit` : Nombre de résultats (défaut: 20)

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "id": 12345678,
      "title": "Album Populaire",
      "artist": {
        "name": "Artiste"
      },
      "cover_medium": "https://...",
      "release_date": "2026-01-15"
    }
  ]
}
```

**Cache** : ✅ 24h TTL (clé: `deezer:charts:albums`)

---

## 🍎 iTunes (Musique)

### **Charts** - Top iTunes

```bash
GET /api/music/itunes/charts?category=album&country=us
```

**Paramètres** :
- `category` : `album` | `song` | `music-video` (défaut: `album`)
- `country` : Code pays ISO (`us`, `fr`, `uk`, etc. - défaut: `fr`)
- `limit` : Nombre de résultats (défaut: 20)

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "trackId": 123456789,
      "trackName": "Album Title",
      "artistName": "Artist Name",
      "artworkUrl100": "https://...",
      "releaseDate": "2026-01-15T00:00:00Z",
      "country": "USA"
    }
  ]
}
```

**Cache** : ✅ 24h TTL (clé: `itunes:charts:fr-album`)

⚠️ **Note** : Le store FR retourne souvent 0 résultats. Utiliser `country=us` pour plus de contenu.

---

## 📊 Cache Admin

### **Statistiques**

```bash
GET /api/cache/stats
```

**Réponse** :
```json
{
  "success": true,
  "cache": {
    "global": {
      "total_entries": "16",
      "total_items": "280",
      "valid_entries": "16",
      "expired_entries": "0"
    },
    "byProvider": [...]
  },
  "database": {
    "connected": true,
    "totalCount": 1,
    "idleCount": 1
  }
}
```

---

### **Refresh manuel**

#### Par provider
```bash
POST /api/cache/refresh/tmdb
POST /api/cache/refresh/jikan
POST /api/cache/refresh/rawg
POST /api/cache/refresh/igdb
POST /api/cache/refresh/deezer
POST /api/cache/refresh/itunes
```

#### Refresh des entrées expirées
```bash
POST /api/cache/refresh?batchSize=10
```

---

### **Vider le cache**

```bash
POST /api/cache/clear
# ou
DELETE /api/cache/clear
```

**Réponse** :
```json
{
  "success": true,
  "deleted": 16,
  "message": "Cache cleared successfully"
}
```

---

## 🔑 Récapitulatif des Paramètres Importants

### TMDB - ATTENTION aux paramètres !

| Endpoint | Paramètre | Films | Séries |
|----------|-----------|-------|--------|
| `/trending` | `mediaType` | `?mediaType=movie` | `?mediaType=tv` |
| `/popular` | `category` ⚠️ | `?category=movie` | `?category=tv` |
| `/top-rated` | `category` ⚠️ | `?category=movie` | `?category=tv` |
| `/upcoming` | _(aucun)_ | ✅ (par défaut) | ❌ Utiliser `/on-the-air` |
| `/on-the-air` | _(aucun)_ | ❌ | ✅ (séries en cours) |
| `/airing-today` | _(aucun)_ | ❌ | ✅ (épisodes aujourd'hui) |

⚠️ **Incohérence importante** : `/trending` utilise `mediaType` tandis que `/popular` et `/top-rated` utilisent `category` !

**Pour l'app tierce (hikari-no-sekai)** :
```javascript
// Films populaires
fetch('/api/media/tmdb/popular?category=movie')  // ✅ CORRECT

// Séries populaires  
fetch('/api/media/tmdb/popular?category=tv')      // ✅ CORRECT
// OU MIEUX : utiliser le endpoint dédié séries
fetch('/api/media/tmdb/on-the-air')               // ✅ RECOMMANDÉ
```

---

## ⚡ Performance & Cache

### TTL (Time To Live)

| Type | TTL | Refresh |
|------|-----|---------|
| Trending, Popular, Top | 24h | 02:00-04:30 AM |
| Upcoming, Schedule | 6-12h | Toutes les 6h |
| Charts | 24h | 04:00-04:30 AM |

### Cron Jobs Automatiques

```
02:00 → TMDB trending
02:30 → Jikan trending  
03:00 → TMDB/RAWG popular
03:30 → IGDB popular
04:00 → Deezer charts
04:30 → iTunes charts
*/6h  → Upcoming refresh
05:00 → Purge anciennes entrées (>90j)
*/1h  → Monitoring stats
```

---

## 🐛 Problèmes Connus

### RAWG
- ❌ API retourne souvent 0 résultats
- 🔧 Vérifier la clé API dans `.env`
- 💡 Alternative : Utiliser IGDB

### iTunes FR
- ❌ Store FR retourne 0 résultats
- 🔧 Utiliser `country=us` ou autre région

### IGDB
- ⚠️ Maximum 10 résultats par requête
- ⚠️ Rate limit strict
- ✅ OAuth2 géré automatiquement

### Jikan
- ⚠️ Rate limit : 3 req/sec
- ✅ Délai automatique de 2s si atteint
- ✅ Espacer les cron jobs (30min)

---

## 📝 Exemples d'Utilisation

### Application Frontend (React/Vue)

```javascript
// Récupérer films populaires
const response = await fetch('http://tako-api:3000/api/media/tmdb/popular?mediaType=movie&limit=20');
const { data } = await response.json();

// Récupérer séries en cours de diffusion
const series = await fetch('http://tako-api:3000/api/media/tmdb/on-the-air');

// Top anime
const anime = await fetch('http://tako-api:3000/api/anime-manga/jikan/top/anime?limit=10');
```

### Scripts Shell

```bash
# Test complet de tous les endpoints
./scripts/test-cache.sh

# Stats du cache
curl http://localhost:3000/api/cache/stats | jq '.cache.global'

# Refresh manuel TMDB
curl -X POST http://localhost:3000/api/cache/refresh/tmdb
```

---

## 🔐 Variables d'Environnement Requises

```bash
# TMDB
TMDB_API_KEY=your_key_here

# Jikan (pas de clé nécessaire)

# RAWG
RAWG_API_KEY=your_key_here

# IGDB
IGDB_CLIENT_ID=your_client_id
IGDB_CLIENT_SECRET=your_secret

# Deezer (pas de clé nécessaire)

# iTunes (pas de clé nécessaire)

# Database
DB_ENABLED=true
DB_HOST=tako-db
DB_PORT=5432
DB_NAME=tako_cache
DB_USER=tako
DB_PASSWORD=changeme
```

---

## 🐛 Known Issues

### ✅ Previously Reported Issues - RESOLVED

Tous les problèmes précédemment signalés ont été résolus :

#### 1. RAWG - 0 Results in Cache ✅ FIXED
- **Problem**: Cache affichait 0 items malgré l'API fonctionnelle
- **Root Cause**: Les routes retournaient `{normalized, count}` au lieu d'un array
- **Fix**: Modifié `fetchFn` pour retourner directement `normalized`
- **Status**: ✅ Résolu - Cache affiche maintenant 5 items pour popular et trending
- **Files**: `src/domains/videogames/routes/rawg.routes.js` (lines 850-960)

#### 2. iTunes FR - Empty Results ✅ FIXED
- **Problem**: Store français retournait un array vide
- **Root Cause**: Ancien cache invalide
- **Fix**: Clear cache + refresh automatique
- **Status**: ✅ Résolu - FR retourne maintenant 3 albums français
- **Verification**: `curl "http://localhost:3000/api/music/itunes/charts?category=album&country=fr&limit=3"`

#### 3. Jikan Rate Limit ✅ VERIFIED
- **Concern**: Rate limit (3 req/sec) pendant les cron jobs
- **Verification**: Cron Jikan à 02:30, TMDB à 02:00 (30min d'espacement)
- **Status**: ✅ Aucun problème - Espacement suffisant + délai automatique 2s
- **File**: `src/infrastructure/database/refresh-scheduler.js`

#### 4. IGDB - 10 Item Limit ✅ DOCUMENTED
- **Observation**: Popular endpoint retourne max 10 items au lieu de 20
- **Investigation**: Code passe correctement `limit` à l'API IGDB
- **Conclusion**: Limitation de l'API IGDB elle-même, pas un bug Tako API
- **Status**: ✅ Comportement normal - Pas de modification nécessaire
- **Note**: IGDB API renvoie un maximum de 10 résultats par défaut

---

### Current Known Issues

Aucun problème actuellement connu. Le système de cache PostgreSQL fonctionne parfaitement sur tous les providers.

---

**Version** : 1.0.0  
**Dernière mise à jour** : 2 février 2026
