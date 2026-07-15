# Tako API — Guide du Développeur

> **Version** : 2.7.0  
> **Base URL Production** : `https://tako.snowmanprod.fr`  
> **Dernière mise à jour** : 30 mars 2026

---

## Table des matières

1. [Introduction](#1-introduction)
2. [Démarrage rapide](#2-démarrage-rapide)
3. [Authentification & Accès](#3-authentification--accès)
4. [Format de réponse unifié](#4-format-de-réponse-unifié)
5. [Paramètres communs](#5-paramètres-communs)
6. [Pagination](#6-pagination)
7. [Gestion des erreurs](#7-gestion-des-erreurs)
8. [Headers HTTP](#8-headers-http)
9. [Cache & Performance](#9-cache--performance)
10. [Domaines & Endpoints](#10-domaines--endpoints)
    - [10.1 Comics / BD](#101-comics--bd)
    - [10.2 Books / Livres](#102-books--livres)
    - [10.3 Construction Toys](#103-construction-toys--jouets-de-construction)
    - [10.4 Anime & Manga](#104-anime--manga)
    - [10.5 Media / Films & Séries](#105-media--films--séries)
    - [10.6 Videogames / Jeux vidéo](#106-videogames--jeux-vidéo)
    - [10.7 BoardGames / Jeux de société](#107-boardgames--jeux-de-société)
    - [10.8 Collectibles / Objets de collection](#108-collectibles--objets-de-collection)
    - [10.9 TCG / Jeux de cartes](#109-tcg--jeux-de-cartes-à-collectionner)
    - [10.10 Music / Musique](#1010-music--musique)
    - [10.11 E-commerce](#1011-e-commerce)
    - [10.12 Sticker-Albums](#1012-sticker-albums)
11. [Endpoints Discovery (Trending/Popular)](#11-endpoints-discovery-trendingpopularcharts)
12. [Cache Admin](#12-cache-admin)
13. [Servir des fichiers statiques](#13-fichiers-statiques-images-pdfs)
14. [Traduction automatique](#14-traduction-automatique)
15. [Limites & Bonnes pratiques](#15-limites--bonnes-pratiques)
16. [Exemples d'intégration](#16-exemples-dintégration)
17. [FAQ](#17-faq)

---

## 1. Introduction

**Tako API** est une API REST unifiée qui agrège **39 providers** répartis en **12 domaines** (comics, livres, jeux vidéo, anime, films, musique, TCG, collectibles, sticker-albums…). Elle fournit un **format de réponse normalisé** quel que soit le provider, ce qui simplifie considérablement l'intégration côté client.

### Ce que Tako API offre

- **Recherche multi-sources** : un seul format de requête pour interroger TMDB, IGDB, Pokémon TCG, Discogs, etc.
- **Réponses normalisées** : tous les providers retournent la même structure d'objet
- **Traduction automatique** : traduction intégrée vers FR, EN, DE, ES, IT, PT
- **Cache intelligent** : cache PostgreSQL avec refresh automatique pour les endpoints discovery
- **Archives locales** : 130 102 cartes Carddass, 7 902 cartes DBS, 616 constructions MEGA/KRE-O avec images servies directement
- **Zéro authentification** : l'API est publique, aucune clé n'est requise côté client

### Architecture résumée

```
Votre App  →  Tako API  →  36 APIs/Sites externes
                ↓
           PostgreSQL (cache + archives)
                ↓
           Fichiers statiques (images, PDFs)
```

---

## 2. Démarrage rapide

### Votre premier appel

```bash
# Health check
curl https://tako.snowmanprod.fr/health

# Rechercher "batman" dans les comics
curl "https://tako.snowmanprod.fr/api/comics/comicvine/search?q=batman&maxResults=5"

# Rechercher un anime
curl "https://tako.snowmanprod.fr/api/anime-manga/jikan/search/anime?q=naruto&limit=5"

# Chercher un set LEGO
curl "https://tako.snowmanprod.fr/api/construction-toys/brickset/search?q=millennium+falcon"
```

### En JavaScript (fetch)

```javascript
const BASE_URL = 'https://tako.snowmanprod.fr';

// Recherche de films
const res = await fetch(`${BASE_URL}/api/media/tmdb/search/movies?q=matrix`);
const { data, pagination } = await res.json();

data.forEach(movie => {
  console.log(`${movie.title} (${movie.year}) - ${movie.images?.primary}`);
});
```

### En Python (requests)

```python
import requests

BASE_URL = "https://tako.snowmanprod.fr"

res = requests.get(f"{BASE_URL}/api/tcg/pokemon/search", params={"q": "pikachu", "max": 5})
cards = res.json()["data"]

for card in cards:
    print(f"{card['title']} - {card['details']['rarity']} - {card['images']['primary']}")
```

---

## 3. Authentification & Accès

| Élément | Valeur |
|---------|--------|
| **Authentification client** | **Aucune** — L'API est publique |
| **HTTPS** | ✅ Obligatoire en production (`https://tako.snowmanprod.fr`) |
| **CORS** | ✅ Activé (toutes origines autorisées) |
| **Rate limit client** | Aucun rate limit côté Tako API |

> **Note** : Tako API gère en interne les clés API de chaque provider (TMDB, IGDB, Brickset, etc.). Vous n'avez aucune clé à fournir.

---

## 4. Format de réponse unifié

### Structure d'un item

Chaque élément retourné par l'API suit **le même schéma de base**, quel que soit le provider :

```json
{
  "id": "brickset:31754",
  "type": "construct_toy",
  "source": "brickset",
  "sourceId": "31754",
  "title": "75192 Millennium Falcon",
  "titleOriginal": null,
  "description": "Star Wars • Ultimate Collector Series • 7541 pièces",
  "year": 2017,
  "images": {
    "primary": "https://images.brickset.com/sets/large/75192-1.jpg",
    "thumbnail": "https://images.brickset.com/sets/small/75192-1.jpg",
    "gallery": []
  },
  "urls": {
    "source": "https://brickset.com/sets/75192-1",
    "detail": "/api/construction-toys/brickset/31754"
  },
  "details": {
    "brand": "LEGO",
    "theme": "Star Wars",
    "pieceCount": 7541,
    "price": { "amount": 849.99, "currency": "EUR" }
  }
}
```

**Champs communs à tous les types :**

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string | ID Tako unique (`source:sourceId`) |
| `type` | string | Type de contenu (voir table ci-dessous) |
| `source` | string | Provider d'origine |
| `sourceId` | string | ID chez le provider |
| `title` | string | Titre principal |
| `titleOriginal` | string? | Titre original (si différent) |
| `description` | string? | Description textuelle |
| `year` | number? | Année de sortie/publication |
| `images` | object | `{ primary, thumbnail, gallery }` |
| `urls` | object | `{ source, detail }` |
| `details` | object | **Spécifique au type** — varie selon le domaine |

### Types de contenu

| `type` | Domaine | Description |
|--------|---------|-------------|
| `construct_toy` | construction-toys | Jouet de construction |
| `book` | books | Livre |
| `comic` | comics | Comic / BD |
| `videogame` | videogames | Jeu vidéo |
| `movie` | media | Film |
| `series` | media | Série TV |
| `anime` | anime-manga | Anime |
| `manga` | anime-manga | Manga |
| `manga_volume` | anime-manga | Volume manga (Nautiljon) |
| `magazine` | books | Magazine numérisé (Abandonware) |
| `tcg_card` | tcg | Carte à collectionner |
| `collectible` | collectibles | Objet de collection |
| `album` | music | Album musical |
| `board_game` | boardgames | Jeu de société |

### Réponse de recherche

```json
{
  "success": true,
  "provider": "tmdb",
  "domain": "media",
  "query": "matrix",
  "total": 42,
  "count": 20,
  "data": [ /* tableau d'items normalisés */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "hasMore": true
  },
  "meta": {
    "fetchedAt": "2026-03-04T14:30:00.000Z",
    "lang": "fr",
    "cached": false,
    "cacheAge": null
  }
}
```

### Réponse de détail

```json
{
  "success": true,
  "provider": "tmdb",
  "domain": "media",
  "id": "tmdb:603",
  "data": { /* item normalisé complet */ },
  "meta": {
    "fetchedAt": "2026-03-04T14:30:00.000Z",
    "lang": "fr",
    "cached": true,
    "cacheAge": 3600
  }
}
```

---

## 5. Paramètres communs

Ces paramètres sont disponibles sur **la plupart** des endpoints de recherche :

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `q` | string | *(requis)* | Terme de recherche |
| `lang` | string | `fr` | Code langue ISO 639-1 (`fr`, `en`, `de`, `es`, `it`, `pt`) |
| `autoTrad` | boolean | `false` | Activer la traduction automatique (`1`, `true`) |
| `limit` | number | `20` | Nombre max de résultats (alias universel, accepté par toutes les routes) |
| `page` | number | `1` | Numéro de page |
| `refresh` | boolean | `false` | Ignorer le cache et forcer un appel frais |

> **Note** : Le paramètre **`limit`** est accepté comme alias universel par toutes les routes search. Les anciens noms (`maxResults`, `max`, `pageSize`) restent fonctionnels pour rétrocompatibilité.

---

## 6. Pagination

Toutes les réponses de recherche incluent un bloc `pagination` avec exactement **3 champs** :

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `page` | number | Page courante (1-indexed) |
| `limit` | number | Nombre maximum d'éléments par page |
| `hasMore` | boolean | `true` s'il existe une page suivante |

> **Note** : Il n'y a PAS de champs `totalResults`, `totalPages`, `pageSize` ou `offset`. Seuls `page`, `limit` et `hasMore` sont retournés. Pour les endpoints sans pagination (listes complètes), `pagination` vaut `null`.

Pour naviguer entre les pages :

```bash
# Page 1
GET /api/media/tmdb/search/movies?q=star+wars&page=1

# Page 2
GET /api/media/tmdb/search/movies?q=star+wars&page=2
```

---

## 7. Gestion des erreurs

### Codes HTTP

| Code | Signification |
|------|---------------|
| `200` | Succès |
| `400` | Paramètres invalides |
| `404` | Ressource non trouvée |
| `429` | Rate limit du provider externe dépassé |
| `502` | Erreur du provider externe (API down) |
| `504` | Timeout du provider externe |
| `500` | Erreur interne du serveur |

### Format d'erreur

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "Query parameter 'q' is required",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "q", "message": "Required" }
  ]
}
```

### Erreur provider externe

```json
{
  "success": false,
  "error": "ProviderError",
  "message": "TMDB API returned 429: Too Many Requests",
  "code": "PROVIDER_ERROR"
}
```

---

## 8. Headers HTTP

### Headers de réponse

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Identifiant unique de la requête (pour le debug) |
| `X-Cache` | `HIT` ou `MISS` (indique si la réponse vient du cache) |
| `X-Cache-Age` | Âge du cache en secondes |
| `Cache-Control` | Directives de cache HTTP |
| `Content-Encoding` | `gzip` (compression activée) |

### Headers de requête recommandés

```
Accept: application/json
Accept-Language: fr
```

---

## 9. Cache & Performance

Tako API utilise un **cache PostgreSQL** pour les endpoints discovery (trending, popular, charts). Les données sont rafraîchies automatiquement.

| Type d'endpoint | TTL | Refresh auto |
|-----------------|-----|--------------|
| trending, popular, top-rated, charts | 24h | 02:00–04:30 AM |
| upcoming, schedule | 6–12h | Toutes les 6h |

**Impact sur les performances :**

| | Sans cache | Avec cache |
|-|-----------|-----------|
| Latence | 150–5000ms | **~11ms** |
| Gain | — | **14x plus rapide** |

Les réponses cachées incluent dans `meta` :
- `cached: true` — la réponse vient du cache
- `cacheKey: "jikan:trending:all:p2"` — clé de cache utilisée (inclut la page)
- `cacheAge: 3600` — âge en secondes

### Clés de cache et pagination

Chaque combinaison `provider + endpoint + category + page` produit une clé de cache unique :

```
tmdb:trending:movie:week       ← page 1 (pas de suffixe)
tmdb:trending:movie:week:p2    ← page 2
tmdb:trending:movie:week:p3    ← page 3
jikan:trending:tv:sfw:p2       ← page 2, filtre sfw
```

> La page 1 n'a pas de suffixe pour compatibilité avec les entrées existantes.

---

## 10. Domaines & Endpoints

### Structure des URLs

```
https://tako.snowmanprod.fr/api/{domain}/{provider}/{endpoint}
```

Exemples :
- `/api/media/tmdb/search/movies?q=matrix`
- `/api/tcg/pokemon/card/base1-4`
- `/api/construction-toys/lego/instructions/75192`

---

### 10.1 Comics / BD

#### ComicVine

> Source : [comicvine.gamespot.com](https://comicvine.gamespot.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/comics/comicvine/search?q=` | Recherche globale |
| `GET /api/comics/comicvine/search/volumes?q=` | Recherche de séries/volumes |
| `GET /api/comics/comicvine/search/issues?q=` | Recherche de numéros |
| `GET /api/comics/comicvine/search/characters?q=` | Recherche de personnages |
| `GET /api/comics/comicvine/search/publishers?q=` | Recherche d'éditeurs |
| `GET /api/comics/comicvine/search/creators?q=` | Recherche de créateurs |
| `GET /api/comics/comicvine/volume/:id` | Détails d'un volume |
| `GET /api/comics/comicvine/volume/:id/issues` | Issues d'un volume |
| `GET /api/comics/comicvine/issue/:id` | Détails d'un issue |
| `GET /api/comics/comicvine/character/:id` | Détails d'un personnage |
| `GET /api/comics/comicvine/creator/:id` | Détails d'un créateur |
| `GET /api/comics/comicvine/creator/:id/works` | Œuvres d'un créateur |

**Paramètres** : `q`, `maxResults` (max: 100), `page`, `lang`, `autoTrad`

#### Bedetheque

> Source : [bedetheque.com](https://www.bedetheque.com) (scraping)

| Endpoint | Description |
|----------|-------------|
| `GET /api/comics/bedetheque/search?q=` | Recherche globale (séries + auteurs) |
| `GET /api/comics/bedetheque/search/series?q=` | Recherche de séries |
| `GET /api/comics/bedetheque/search/authors?q=` | Recherche d'auteurs |
| `GET /api/comics/bedetheque/search/albums?q=` | Recherche d'albums (stratégie series-first) |
| `GET /api/comics/bedetheque/serie/:id` | Détails d'une série |
| `GET /api/comics/bedetheque/serie/:id/albums` | Albums d'une série |
| `GET /api/comics/bedetheque/author/:id/works` | Œuvres d'un auteur |
| `GET /api/comics/bedetheque/album/:id` | Détails d'un album |
| `GET /api/comics/bedetheque/detail/:id` | Auto-détection série ou album |

**Paramètres** : `q`, `maxResults`, `lang`, `autoTrad`, `enrichCovers`, `url` (album), `type` (detail)

---

### 10.2 Books / Livres

#### OpenLibrary

> Source : [openlibrary.org](https://openlibrary.org) — Aucune clé requise

| Endpoint | Description |
|----------|-------------|
| `GET /api/books/openlibrary/search?q=` | Recherche de livres |
| `GET /api/books/openlibrary/search/author?author=` | Livres par auteur |
| `GET /api/books/openlibrary/search/authors?q=` | Recherche d'auteurs |
| `GET /api/books/openlibrary/author/:id` | Détails d'un auteur |
| `GET /api/books/openlibrary/author/:id/works` | Œuvres d'un auteur |
| `GET /api/books/openlibrary/:olId` | Détails d'un livre par ID |

**Paramètres** : `q`, `limit` (max: 100), `offset`, `lang`, `autoTrad`

#### Google Books

> Source : [books.google.com](https://books.google.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/books/googlebooks/search?q=` | Recherche de livres |
| `GET /api/books/googlebooks/search/author?author=` | Livres par auteur |
| `GET /api/books/googlebooks/:volumeId` | Détails d'un livre |

**Paramètres** : `q`, `maxResults` (max: 40), `startIndex`, `lang`, `autoTrad`

#### Abandonware Magazines

> Source : [abandonware-magazines.org](https://www.abandonware-magazines.org) — Aucune clé requise — API native

| Endpoint | Description |
|----------|-------------|
| `GET /api/books/abandonware/health` | Health check |
| `GET /api/books/abandonware/search?q=` | Recherche de magazines par nom |
| `GET /api/books/abandonware/magazines` | Liste de tous les magazines (paginé) |
| `GET /api/books/abandonware/magazine/:id` | Détails d'un magazine + tous ses numéros |
| `GET /api/books/abandonware/magazine/:id/issues` | Numéros d'un magazine (paginé) |

**Paramètres** :
- `q` : Terme de recherche (pour /search)
- `:id` : ID numérique du magazine
- `limit` / `maxResults` : Nombre max de résultats (défaut 20, max 100)
- `page` : Page (défaut 1)
- `pageSize` : Résultats par page pour /magazines et /issues (défaut 50, max 200)

**Données magazine** : nom, logo, nombre de numéros

**Données numéro (issue)** : numéro, date de parution, année, couverture, hors-série, CD, filename

```bash
# Recherche
GET /api/books/abandonware/search?q=joystick

# Liste de tous les magazines (page 2)
GET /api/books/abandonware/magazines?page=2&limit=50

# Détails d'un magazine (Joystick = id 31, 464 numéros)
GET /api/books/abandonware/magazine/31

# Numéros paginés
GET /api/books/abandonware/magazine/31/issues?page=3&limit=20
```

---

### 10.3 Construction Toys / Jouets de construction

#### Brickset

> Source : [brickset.com](https://brickset.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/construction-toys/brickset/search?q=` | Recherche de sets LEGO |
| `GET /api/construction-toys/brickset/themes` | Liste des thèmes |
| `GET /api/construction-toys/brickset/themes/:theme/subthemes` | Sous-thèmes |
| `GET /api/construction-toys/brickset/years` | Années disponibles |
| `GET /api/construction-toys/brickset/recently-updated` | Sets récemment mis à jour |
| `GET /api/construction-toys/brickset/sets/:id` | Détails d'un set |

**Paramètres** : `q`, `theme`, `year`, `pageSize`, `pageNumber`

#### Rebrickable

> Source : [rebrickable.com](https://rebrickable.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/construction-toys/rebrickable/search?q=` | Recherche de sets |
| `GET /api/construction-toys/rebrickable/themes` | Liste des thèmes |
| `GET /api/construction-toys/rebrickable/colors` | Liste des couleurs |
| `GET /api/construction-toys/rebrickable/parts?q=` | Recherche de pièces |
| `GET /api/construction-toys/rebrickable/minifigs?q=` | Recherche de minifigs |
| `GET /api/construction-toys/rebrickable/sets/:id` | Détails d'un set |
| `GET /api/construction-toys/rebrickable/sets/:id/parts` | Pièces d'un set |
| `GET /api/construction-toys/rebrickable/sets/:id/minifigs` | Minifigs d'un set |

**Paramètres** : `q`, `theme_id`, `min_year`, `max_year`, `page`, `page_size` (max: 1000)

#### LEGO

> Source : [lego.com](https://www.lego.com) (scraping)

| Endpoint | Description |
|----------|-------------|
| `GET /api/construction-toys/lego/search?q=` | Recherche de sets |
| `GET /api/construction-toys/lego/instructions/:productId` | Instructions PDF |
| `GET /api/construction-toys/lego/proxy/video?url=` | Proxy vidéo CDN LEGO (anti-429) |
| `GET /api/construction-toys/lego/:id` | Détails d'un set |

#### Playmobil

> Source : [playmobil.fr](https://www.playmobil.fr) (scraping, ~18s/requête)

| Endpoint | Description |
|----------|-------------|
| `GET /api/construction-toys/playmobil/search?q=` | Recherche de sets |
| `GET /api/construction-toys/playmobil/instructions/:productId` | Instructions PDF |
| `GET /api/construction-toys/playmobil/:id` | Détails d'un set |

#### Klickypedia

> Source : [klickypedia.com](https://www.klickypedia.com) (scraping)

| Endpoint | Description |
|----------|-------------|
| `GET /api/construction-toys/klickypedia/search?q=` | Recherche de sets Playmobil |
| `GET /api/construction-toys/klickypedia/instructions/:id` | Instructions PDF |
| `GET /api/construction-toys/klickypedia/:id` | Détails d'un set |

#### MEGA

> Source : [megabrands.com](https://megabrands.com) + base locale (199 produits archivés)

| Endpoint | Description |
|----------|-------------|
| `GET /api/construction-toys/mega/search?q=` | Recherche de sets |
| `GET /api/construction-toys/mega/categories` | Liste des catégories |
| `GET /api/construction-toys/mega/category/:name` | Sets d'une catégorie |
| `GET /api/construction-toys/mega/instructions/:sku` | Instructions PDF par SKU |
| `GET /api/construction-toys/mega/file/:sku/pdf` | Fichier PDF par SKU |
| `GET /api/construction-toys/mega/file/:sku/image` | Image par SKU |
| `GET /api/construction-toys/mega/:id` | Détails d'un set |

**Paramètres** : `q`, `page`, `pageSize` (max: 100), `category`

#### KRE-O

> Source : base locale PostgreSQL (417 produits archivés — Hasbro KRE-O 2011–2017)

| Endpoint | Description |
|----------|-------------|
| `GET /api/construction-toys/kreo/search?q=` | Recherche de sets |
| `GET /api/construction-toys/kreo/franchises` | Liste des franchises |
| `GET /api/construction-toys/kreo/franchise/:name` | Sets d'une franchise |
| `GET /api/construction-toys/kreo/sublines` | Liste des sous-lignes |
| `GET /api/construction-toys/kreo/file/:setNumber/image` | Image par numéro de set |
| `GET /api/construction-toys/kreo/:id` | Détails d'un set |

**Paramètres** : `q`, `page`, `pageSize` (max: 100), `franchise`, `subLine`

```bash
# Recherche KRE-O
GET /api/construction-toys/kreo/search?q=transformers

# Franchises disponibles
GET /api/construction-toys/kreo/franchises

# Sets d'une franchise
GET /api/construction-toys/kreo/franchise/Transformers
```

---

### 10.4 Anime & Manga

#### Jikan (MyAnimeList)

> Source : [jikan.moe](https://jikan.moe) — Rate limit : 3 req/sec

| Endpoint | Description |
|----------|-------------|
| `GET /api/anime-manga/jikan/search?q=` | Recherche globale (anime + manga) |
| `GET /api/anime-manga/jikan/search/anime?q=` | Recherche anime |
| `GET /api/anime-manga/jikan/search/manga?q=` | Recherche manga |
| `GET /api/anime-manga/jikan/search/characters?q=` | Recherche personnages |
| `GET /api/anime-manga/jikan/search/people?q=` | Recherche personnes (seiyuu, staff) |
| `GET /api/anime-manga/jikan/search/producers?q=` | Recherche studios |
| `GET /api/anime-manga/jikan/anime/:id` | Détails d'un anime |
| `GET /api/anime-manga/jikan/anime/:id/episodes` | Épisodes |
| `GET /api/anime-manga/jikan/anime/:id/characters` | Personnages et doubleurs |
| `GET /api/anime-manga/jikan/anime/:id/staff` | Staff de production |
| `GET /api/anime-manga/jikan/anime/:id/recommendations` | Anime similaires |
| `GET /api/anime-manga/jikan/anime/random` | Anime aléatoire |
| `GET /api/anime-manga/jikan/manga/:id` | Détails d'un manga |
| `GET /api/anime-manga/jikan/manga/:id/characters` | Personnages du manga |
| `GET /api/anime-manga/jikan/manga/:id/recommendations` | Manga similaires |
| `GET /api/anime-manga/jikan/manga/random` | Manga aléatoire |
| `GET /api/anime-manga/jikan/seasons` | Saisons disponibles |
| `GET /api/anime-manga/jikan/seasons/now` | Anime de la saison en cours |
| `GET /api/anime-manga/jikan/seasons/:year/:season` | Anime d'une saison |
| `GET /api/anime-manga/jikan/top/anime` | Top anime |
| `GET /api/anime-manga/jikan/top/manga` | Top manga |
| `GET /api/anime-manga/jikan/top` | Top unifié (anime ou manga) |
| `GET /api/anime-manga/jikan/trending` | Anime de la saison en cours |
| `GET /api/anime-manga/jikan/upcoming` | Anime à venir |
| `GET /api/anime-manga/jikan/schedule` | Planning de diffusion |
| `GET /api/anime-manga/jikan/schedules/:day` | Planning d'un jour |
| `GET /api/anime-manga/jikan/genres/anime` | Genres anime |
| `GET /api/anime-manga/jikan/genres/manga` | Genres manga |
| `GET /api/anime-manga/jikan/characters/:id` | Détails d'un personnage |
| `GET /api/anime-manga/jikan/people/:id` | Détails d'une personne (seiyuu, staff) |
| `GET /api/anime-manga/jikan/producers/:id` | Détails d'un studio |
| `GET /api/anime-manga/jikan/trending/anime` | Trending tous anime (saison en cours) |
| `GET /api/anime-manga/jikan/trending/tv` | Trending séries animées |
| `GET /api/anime-manga/jikan/trending/movie` | Trending films animés |
| `GET /api/anime-manga/jikan/top/tv` | Top séries animées |
| `GET /api/anime-manga/jikan/top/movie` | Top films animés |
| `GET /api/anime-manga/jikan/upcoming/tv` | À venir séries animées |
| `GET /api/anime-manga/jikan/upcoming/movie` | À venir films animés |

**Paramètres recherche** : `q`, `limit` (max: 25), `page`, `type`, `score`, `status`, `rating`, `genres`, `orderBy`, `sort`, `sfw` (`all` défaut / `sfw` ou `true` ou `1` / `nsfw` ou `false` ou `0`), `lang`, `autoTrad`

**Paramètres top/trending** : `type` (`anime`/`manga`), `filter` (`bypopularity`, `favorite`, `airing`, `publishing`), `subtype`, `limit`, `page`

**Paramètres schedule** : `day` (`monday`…`sunday`, `unknown`)

```bash
# Top anime par popularité
GET /api/anime-manga/jikan/top?type=anime&filter=bypopularity&limit=10

# Anime de la saison en cours
GET /api/anime-manga/jikan/trending?limit=20

# Planning du lundi
GET /api/anime-manga/jikan/schedule?day=monday&limit=15
```

#### MangaUpdates

> Source : [mangaupdates.com](https://www.mangaupdates.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/anime-manga/mangaupdates/search?q=` | Recherche de séries manga |
| `GET /api/anime-manga/mangaupdates/search/authors?q=` | Recherche d'auteurs |
| `GET /api/anime-manga/mangaupdates/search/publishers?q=` | Recherche d'éditeurs |
| `GET /api/anime-manga/mangaupdates/series/:id` | Détails d'une série |
| `GET /api/anime-manga/mangaupdates/series/:id/recommendations` | Recommandations |
| `GET /api/anime-manga/mangaupdates/author/:id` | Détails d'un auteur |
| `GET /api/anime-manga/mangaupdates/author/:id/works` | Œuvres d'un auteur |
| `GET /api/anime-manga/mangaupdates/publisher/:id` | Détails d'un éditeur |
| `GET /api/anime-manga/mangaupdates/genres` | Liste des genres |
| `GET /api/anime-manga/mangaupdates/releases` | Dernières sorties |

**Paramètres** : `q`, `maxResults`, `page`, `type`, `year`, `genre`, `frenchTitle` (`1` pour titre français via Nautiljon), `lang`, `autoTrad`

#### Nautiljon (Volumes Manga)

> Source : [nautiljon.com](https://www.nautiljon.com) — Rate limit : 1 req/sec — Scraping HTML

| Endpoint | Description |
|----------|-------------|
| `GET /api/anime-manga/nautiljon/health` | Health check avec latence |
| `GET /api/anime-manga/nautiljon/search?q=` | Recherche de séries manga |
| `GET /api/anime-manga/nautiljon/search/volumes?q=&volume=` | Recherche → liste de volumes directe |
| `GET /api/anime-manga/nautiljon/series/:slug` | Détails série (genres, thèmes, auteurs, éditeurs, volumes) |
| `GET /api/anime-manga/nautiljon/series/:slug/volumes` | Liste des volumes avec couvertures |
| `GET /api/anime-manga/nautiljon/series/:slug/volume/:volumeId?name=` | Détail volume (ISBN, pages, prix, dates, chapitres) |

**Paramètres** :
- `:slug` : Slug Nautiljon (ex: `one+piece`, `naruto`)
- `:volumeId` : ID numérique du volume
- `name` : Numéro/nom du volume (requis pour le détail volume)
- `q` : Terme de recherche (pour /search)
- `volume` : Filtre par numéro de volume (pour /search/volumes)
- `maxResults` : Nombre max de volumes (défaut 50)

**Données série** : titre FR/JP, synopsis, genres, thèmes, auteurs, éditeurs VF/VO, nombre de volumes, liste complète des volumes

**Données volume** : ISBN/EAN, nombre de pages, prix (€/¥), dates de parution VF/VO, éditeurs VF/VO, couvertures FR/JP, chapitres avec titres français, édition

```bash
# Recherche
GET /api/anime-manga/nautiljon/search?q=one+piece

# Recherche → volumes directement (retourne des volumes, pas des séries)
GET /api/anime-manga/nautiljon/search/volumes?q=naruto

# Filtrer un volume spécifique
GET /api/anime-manga/nautiljon/search/volumes?q=naruto&volume=5

# Détails série (451 volumes pour One Piece)
GET /api/anime-manga/nautiljon/series/one+piece

# Liste des volumes
GET /api/anime-manga/nautiljon/series/one+piece/volumes

# Détail volume 1 : ISBN 9782723433358, 192 pages, 7.20€
GET /api/anime-manga/nautiljon/series/one+piece/volume/98?name=1
```

---

### 10.5 Media / Films & Séries

#### TMDB

> Source : [themoviedb.org](https://www.themoviedb.org)

| Endpoint | Description |
|----------|-------------|
| `GET /api/media/tmdb/search?q=` | Recherche globale (films + séries) |
| `GET /api/media/tmdb/search/movies?q=` | Recherche de films |
| `GET /api/media/tmdb/search/series?q=` | Recherche de séries |
| `GET /api/media/tmdb/movies/:id` | Détails d'un film |
| `GET /api/media/tmdb/series/:id` | Détails d'une série |
| `GET /api/media/tmdb/series/:id/season/:n` | Détails d'une saison |
| `GET /api/media/tmdb/series/:id/season/:n/episode/:e` | Détails d'un épisode |
| `GET /api/media/tmdb/collections/:id` | Saga/collection de films |
| `GET /api/media/tmdb/persons/:id` | Détails d'une personne |
| `GET /api/media/tmdb/directors/:id/movies` | Filmographie |
| `GET /api/media/tmdb/discover/movies` | Découvrir par critères |
| `GET /api/media/tmdb/trending` | Trending (films/séries) |
| `GET /api/media/tmdb/popular` | Populaires |
| `GET /api/media/tmdb/top-rated` | Mieux notés |
| `GET /api/media/tmdb/upcoming` | À venir |
| `GET /api/media/tmdb/on-the-air` | Séries avec nouveaux épisodes |
| `GET /api/media/tmdb/airing-today` | Séries diffusées aujourd'hui |

**Paramètres trending/popular/top-rated** :
- `category` : `movie` ou `tv` (défaut: `movie`)
- `period` : `day` ou `week` (trending uniquement)
- `limit`, `page`, `lang`, `autoTrad`

> **Attention** : `/trending` utilise `mediaType` tandis que `/popular` et `/top-rated` utilisent `category`.

```bash
# Films trending de la semaine
GET /api/media/tmdb/trending?category=movie&period=week

# Séries populaires
GET /api/media/tmdb/popular?category=tv

# Séries diffusées aujourd'hui
GET /api/media/tmdb/airing-today?limit=10
```

#### TVDB

> Source : [thetvdb.com](https://thetvdb.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/media/tvdb/search?q=` | Recherche globale |
| `GET /api/media/tvdb/search/movies?q=` | Recherche de films |
| `GET /api/media/tvdb/search/series?q=` | Recherche de séries |
| `GET /api/media/tvdb/movies/:id` | Détails d'un film |
| `GET /api/media/tvdb/series/:id` | Détails d'une série |
| `GET /api/media/tvdb/series/:id/seasons` | Saisons d'une série |
| `GET /api/media/tvdb/seasons/:id` | Détails d'une saison |
| `GET /api/media/tvdb/series/:id/episodes` | Épisodes d'une série |
| `GET /api/media/tvdb/episodes/:id` | Détails d'un épisode |
| `GET /api/media/tvdb/lists/:id` | Détails d'une liste |
| `GET /api/media/tvdb/persons/:id` | Détails d'une personne |
| `GET /api/media/tvdb/directors/:id/works` | Filmographie |

**Paramètres** : `q`, `type` (`series`, `movie`, `person`, `company`), `pageSize` (max: 50), `lang`, `autoTrad`

---

### 10.6 Videogames / Jeux vidéo

#### IGDB

> Source : [igdb.com](https://www.igdb.com) — OAuth2 Twitch

| Endpoint | Description |
|----------|-------------|
| `GET /api/videogames/igdb/search?q=` | Recherche de jeux |
| `POST /api/videogames/igdb/search/advanced` | Recherche avancée |
| `GET /api/videogames/igdb/game/:id` | Détails d'un jeu |
| `GET /api/videogames/igdb/game/slug/:slug` | Jeu par slug |
| `GET /api/videogames/igdb/genres` | Genres |
| `GET /api/videogames/igdb/platforms` | Plateformes |
| `GET /api/videogames/igdb/themes` | Thèmes |
| `GET /api/videogames/igdb/game-modes` | Modes de jeu |
| `GET /api/videogames/igdb/player-perspectives` | Perspectives joueur |
| `GET /api/videogames/igdb/companies/search?q=` | Recherche compagnies |
| `GET /api/videogames/igdb/company/:id` | Détails compagnie |
| `GET /api/videogames/igdb/developer/:id/games` | Jeux développés |
| `GET /api/videogames/igdb/publisher/:id/games` | Jeux publiés |
| `GET /api/videogames/igdb/franchises/search?q=` | Recherche franchises |
| `GET /api/videogames/igdb/franchise/:id` | Détails franchise |
| `GET /api/videogames/igdb/collection/:id` | Détails collection |
| `GET /api/videogames/igdb/top-rated` | Mieux notés |
| `GET /api/videogames/igdb/popular` | Populaires |
| `GET /api/videogames/igdb/recent` | Sorties récentes |
| `GET /api/videogames/igdb/upcoming` | À venir |

**Paramètres recherche avancée** (`POST`) : `platforms`, `genres`, `themes`, `gameModes`, `playerPerspectives`, `minRating`, `releaseYear`

```bash
# Recherche avancée : RPG sur PC, note > 80
POST /api/videogames/igdb/search/advanced  (body: {"platforms": [6], "genres": [12], "minRating": 80})

# Jeux populaires
GET /api/videogames/igdb/popular?limit=20
```

#### RAWG

> Source : [rawg.io](https://rawg.io)

| Endpoint | Description |
|----------|-------------|
| `GET /api/videogames/rawg/search?q=` | Recherche de jeux |
| `POST /api/videogames/rawg/search/advanced` | Recherche avancée |
| `GET /api/videogames/rawg/game/:idOrSlug` | Détails d'un jeu |
| `GET /api/videogames/rawg/game/:idOrSlug/screenshots` | Screenshots |
| `GET /api/videogames/rawg/game/:idOrSlug/stores` | Magasins du jeu |
| `GET /api/videogames/rawg/game/:idOrSlug/series` | Jeux de la série |
| `GET /api/videogames/rawg/game/:idOrSlug/additions` | DLCs |
| `GET /api/videogames/rawg/game/:idOrSlug/achievements` | Achievements |
| `GET /api/videogames/rawg/game/:idOrSlug/movies` | Trailers |
| `GET /api/videogames/rawg/genres` | Genres |
| `GET /api/videogames/rawg/genre/:idOrSlug` | Détails d'un genre |
| `GET /api/videogames/rawg/platforms` | Plateformes |
| `GET /api/videogames/rawg/platforms/parents` | Plateformes parentes |
| `GET /api/videogames/rawg/tags` | Tags |
| `GET /api/videogames/rawg/stores` | Magasins |
| `GET /api/videogames/rawg/developers` | Développeurs |
| `GET /api/videogames/rawg/developer/:idOrSlug` | Détails développeur |
| `GET /api/videogames/rawg/developer/:idOrSlug/games` | Jeux d'un dev |
| `GET /api/videogames/rawg/publishers` | Éditeurs |
| `GET /api/videogames/rawg/publisher/:idOrSlug` | Détails éditeur |
| `GET /api/videogames/rawg/publisher/:idOrSlug/games` | Jeux d'un éditeur |
| `GET /api/videogames/rawg/creators` | Créateurs |
| `GET /api/videogames/rawg/creator/:idOrSlug` | Détails créateur |
| `GET /api/videogames/rawg/top-rated` | Mieux notés |
| `GET /api/videogames/rawg/popular` | Populaires |
| `GET /api/videogames/rawg/trending` | Trending |
| `GET /api/videogames/rawg/recent` | Sorties récentes |
| `GET /api/videogames/rawg/upcoming` | À venir |

**Paramètres recherche avancée** (`POST`) : `platforms`, `genres`, `tags`, `developers`, `publishers`, `stores`, `dates`, `metacritic`, `ordering`

#### JVC (JeuxVideo.com)

> Source : [jeuxvideo.com](https://www.jeuxvideo.com) (scraping, contenu français natif)

| Endpoint | Description |
|----------|-------------|
| `GET /api/videogames/jvc/search?q=` | Recherche de jeux |
| `GET /api/videogames/jvc/game/:id` | Détails (notes JVC + users, PEGI) |

#### ConsoleVariations

> Source : [consolevariations.com](https://consolevariations.com) (scraping, éditions de consoles)

| Endpoint | Description |
|----------|-------------|
| `GET /api/videogames/consolevariations/search?q=&type=` | Recherche (`type`: all, consoles, controllers, accessories) |
| `GET /api/videogames/consolevariations/details?url=` | Détails par URL |
| `GET /api/videogames/consolevariations/item/:slug` | Détails par slug |
| `GET /api/videogames/consolevariations/platforms` | Marques |
| `GET /api/videogames/consolevariations/platforms?brand=` | Plateformes d'une marque |
| `GET /api/videogames/consolevariations/browse/:platform` | Browse par plateforme |

---

### 10.7 BoardGames / Jeux de société

#### BoardGameGeek (BGG)

> Source : [boardgamegeek.com](https://boardgamegeek.com) — Format XML avec parser intégré

| Endpoint | Description |
|----------|-------------|
| `GET /api/boardgames/bgg/search?q=` | Recherche de jeux |
| `GET /api/boardgames/bgg/search/category?q=` | Recherche par catégorie |
| `GET /api/boardgames/bgg/game/:id` | Détails (joueurs, durée, complexité, fichiers/règles) |

**Paramètres** : `q`, `limit`, `autoTrad`, `targetLang` (`fr`, `de`, `es`, `it`)

**Fichiers / Règles du jeu** :

Les détails d'un jeu (`/game/:id`) incluent un tableau `files` contenant les fichiers de règles :

| Champ | Description |
|-------|-------------|
| `id` | ID du fichier BGG |
| `filename` | Nom du fichier (ex: `CatanRules.pdf`) |
| `language` | Langue du fichier |
| `downloadUrl` | URL de téléchargement direct (redirection 307 → S3) |
| `url` | Lien vers la page du fichier sur BGG |
| `votes` | Nombre de votes positifs |

- `downloadUrl` est un lien valide sans authentification côté client (token intégré dans l'URL)
- La redirection mène vers une URL S3 presigned qui expire en 120 secondes
- Nécessite `BGG_USERNAME` / `BGG_PASSWORD` dans le `.env` du serveur
- Si les identifiants ne sont pas configurés, `downloadUrl` sera `null`

```bash
# Détails avec fichiers de règles
GET /api/boardgames/bgg/game/13?autoTrad=1&targetLang=fr
```

---

### 10.8 Collectibles / Objets de collection

#### Coleka

> Source : [coleka.com](https://www.coleka.com) (scraping HTTP direct, base collaborative)  
> **Note** : Coleka utilise Cloudflare Turnstile mais whitelist les crawlers search engine. Le provider utilise un User-Agent Googlebot avec `fetch` natif (pas de FlareSolverr) — réponses en ~1-2s.
> **Collection/Série** : Extraite du JSON-LD `category` (format `Catégorie > Sous-cat > Collection`) et exposée dans `details.series`, `details.category`, `details.collectionHierarchy`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/collectibles/coleka/search?q=&category=` | Recherche (catégories : lego, funko, figurines…) |
| `GET /api/collectibles/coleka/details?url=` | Détails par URL |
| `GET /api/collectibles/coleka/item/:path` | Détails par path |
| `GET /api/collectibles/coleka/categories` | Liste des catégories |
| `GET /api/collectibles/coleka/health` | Health check (test accès direct) |

#### Lulu-Berlu

> Source : [lulu-berlu.com](https://www.lulu-berlu.com) (scraping via FlareSolverr, figurines vintage)  
> **Note** : Le `sourceId` retourné par la recherche est le **slug URL** (ex: `goldorak-a3155.html`), pas l'ID numérique. Il est directement utilisable avec `/item/:path`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/collectibles/luluberlu/search?q=` | Recherche de figurines |
| `GET /api/collectibles/luluberlu/details?url=` | Détails par URL complète |
| `GET /api/collectibles/luluberlu/item/:path` | Détails par slug (= `sourceId`) |
| `GET /api/collectibles/luluberlu/health` | Health check FlareSolverr |

#### Transformerland

> Source : [transformerland.com](https://www.transformerland.com) (scraping, guide Transformers)  
> **Note** : Les scans d'instructions et fiches techniques (specs) sont extraits séparément dans `details.instructions` et `details.specs` (tableaux d'URLs images). `null` si aucun scan disponible.

| Endpoint | Description |
|----------|-------------|
| `GET /api/collectibles/transformerland/search?q=` | Recherche de jouets |
| `GET /api/collectibles/transformerland/details?id=` | Détails par toy ID ou URL |
| `GET /api/collectibles/transformerland/item/:id` | Détails par ID |
| `GET /api/collectibles/transformerland/health` | Health check FlareSolverr |

#### Carddass (Archive locale)

> Sources : [animecollection.fr](http://www.animecollection.fr) + [dbzcollection.fr](http://www.dbzcollection.fr)  
> **122 200 cartes** (31 685 animecollection + 90 515 dbzcollection) — **219 093 images** (9,8 Go)

| Endpoint | Description |
|----------|-------------|
| `GET /api/collectibles/carddass/stats` | Statistiques (par site et licence) |
| `GET /api/collectibles/carddass/search?q=` | Recherche full-text |
| `GET /api/collectibles/carddass/licenses` | Liste des licences |
| `GET /api/collectibles/carddass/licenses/:id` | Détail d'une licence |
| `GET /api/collectibles/carddass/licenses/:id/collections` | Collections d'une licence |
| `GET /api/collectibles/carddass/collections/:id/series` | Séries d'une collection |
| `GET /api/collectibles/carddass/series/:id/cards` | Cartes d'une série |
| `GET /api/collectibles/carddass/cards/:id` | Détail carte (hiérarchie complète) |
| `GET /api/collectibles/carddass/cards/:id/images` | Images d'une carte |

**Paramètres spécifiques** :
- `site` : `animecollection` ou `dbzcollection` — filtre par source
- `rarity`, `license`, `max` (max: 100), `page`

```bash
# Recherche globale
GET /api/collectibles/carddass/search?q=goku&max=10

# Filtrer par site
GET /api/collectibles/carddass/search?q=vegeta&site=dbzcollection

# Statistiques
GET /api/collectibles/carddass/stats
```

---

### 10.9 TCG / Jeux de cartes à collectionner

#### Pokémon TCG

> Source : [TCGdex](https://tcgdex.dev) (`api.tcgdex.net`) — Gratuit, sans clé, multi-langues natif

| Endpoint | Description |
|----------|-------------|
| `GET /api/tcg/pokemon/search?q=` | Recherche de cartes |
| `GET /api/tcg/pokemon/card/:id` | Détails (attaques, prix, légalité) |
| `GET /api/tcg/pokemon/sets` | Liste des sets |
| `GET /api/tcg/pokemon/sets/:id` | Détails d'un set avec cartes |

**Paramètres recherche** : `q`, `set`, `type`, `rarity`, `supertype`, `subtype`, `max`, `page`, `lang`, `autoTrad`

⚠️ Les filtres `type`, `rarity`, `supertype` sont localisés (ex: `type=Fire` en EN, `type=Feu` en FR).

```bash
# Pikachu en français
GET /api/tcg/pokemon/search?q=pikachu&lang=fr

# Carte par ID (détails natifs FR)
GET /api/tcg/pokemon/card/base1-58?lang=fr

# Détails d'un set
GET /api/tcg/pokemon/sets/base1?lang=fr
```

#### Magic: The Gathering (MTG)

> Source : [Scryfall API](https://api.scryfall.com) — Syntaxe Scryfall complète supportée

| Endpoint | Description |
|----------|-------------|
| `GET /api/tcg/mtg/search?q=` | Recherche de cartes |
| `GET /api/tcg/mtg/card/:id` | Détails (prix USD/EUR, légalités) |
| `GET /api/tcg/mtg/sets` | Liste des sets (~1028) |

**Paramètres** : `q`, `lang`, `max` (max: 175), `order`, `unique`, `dir`, `autoTrad`

```bash
# Recherche avancée Scryfall
GET /api/tcg/mtg/search?q=mv=1+type:instant+color:r

# Carte par set/numéro
GET /api/tcg/mtg/card/clu/141
```

#### Yu-Gi-Oh!

> Source : [YGOPRODeck](https://db.ygoprodeck.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/tcg/yugioh/search?q=` | Recherche de cartes |
| `GET /api/tcg/yugioh/card/:id` | Détails (banlist, prix multi-sources) |
| `GET /api/tcg/yugioh/sets` | Liste des sets |
| `GET /api/tcg/yugioh/archetype?name=` | Cartes d'un archétype |

**Paramètres** : `q`, `type`, `race`, `attribute`, `level`, `archetype`, `max`, `sort`, `lang`, `autoTrad`

```bash
# Recherche par archétype
GET /api/tcg/yugioh/archetype?name=Blue-Eyes&max=20
```

#### Dragon Ball Super Card Game (DBS)

> Sources : DeckPlanet API (Masters) + dbs-cardgame.com (Fusion World)  
> **7 902 cartes** stockées localement (6 213 Masters + 1 689 Fusion World)

| Endpoint | Description |
|----------|-------------|
| `GET /api/tcg/dbs/search?q=` | Recherche de cartes |
| `GET /api/tcg/dbs/card/:id` | Détails d'une carte |
| `GET /api/tcg/dbs/sets` | Liste des sets |
| `GET /api/tcg/dbs/sets/:code` | Détail d'un set avec cartes |
| `GET /api/tcg/dbs/stats` | Statistiques |

**Paramètres** : `q`, `game` (`masters`/`fusion_world`), `color`, `type`, `rarity`, `set`, `max`, `page`

```bash
# Goku dans Fusion World
GET /api/tcg/dbs/search?q=Goku&game=fusion_world

# Leaders rouges
GET /api/tcg/dbs/search?q=*&type=LEADER&color=Red
```

#### Autres TCG

Les providers suivants sont également disponibles :

| Provider | Base URL | Source | Endpoints |
|----------|----------|--------|-----------|
| **Lorcana** | `/api/tcg/lorcana/` | LorcanaJSON (`lorcanajson.org`) | `search`, `card/:id`, `sets` |
| **Digimon** | `/api/tcg/digimon/` | digimoncard.io | `search`, `card/:id` |
| **One Piece** | `/api/tcg/onepiece/` | onepiece-cardgame.dev | `search`, `card/:id`, `image/:cardId` |

> **Note** : Digimon et One Piece ne disposent pas d'endpoint `/sets`. Seuls Lorcana, Pokémon, MTG, Yu-Gi-Oh! et DBS proposent la liste des sets.
> 
> **Note One Piece** : Les images sont protégées par Cloudflare JS Challenge. L'endpoint `image/:cardId` sert de proxy — il télécharge l'image via les cookies FlareSolverr et la retourne en binaire. Les champs `images.primary`/`thumbnail` pointent vers ce proxy.

---

### 10.10 Music / Musique

#### Discogs

> Source : [discogs.com](https://www.discogs.com) — Rate limit : 25-60 req/min

| Endpoint | Description |
|----------|-------------|
| `GET /api/music/discogs/search?q=` | Recherche globale |
| `GET /api/music/discogs/search/albums?q=` | Recherche releases |
| `GET /api/music/discogs/search/masters?q=` | Recherche masters |
| `GET /api/music/discogs/search/artists?q=` | Recherche artistes |
| `GET /api/music/discogs/search/labels?q=` | Recherche labels |
| `GET /api/music/discogs/barcode/:barcode` | Recherche par code-barres |
| `GET /api/music/discogs/releases/:id` | Détails release |
| `GET /api/music/discogs/masters/:id` | Détails master |
| `GET /api/music/discogs/masters/:id/versions` | Versions d'un master |
| `GET /api/music/discogs/artists/:id` | Détails artiste |
| `GET /api/music/discogs/artists/:id/releases` | Discographie |
| `GET /api/music/discogs/labels/:id` | Détails label |
| `GET /api/music/discogs/labels/:id/releases` | Releases d'un label |

#### Deezer

> Source : [deezer.com](https://www.deezer.com) — Aucune clé requise

| Endpoint | Description |
|----------|-------------|
| `GET /api/music/deezer/search?q=` | Recherche globale |
| `GET /api/music/deezer/search/albums?q=` | Recherche albums |
| `GET /api/music/deezer/search/artists?q=` | Recherche artistes |
| `GET /api/music/deezer/search/tracks?q=` | Recherche tracks |
| `GET /api/music/deezer/albums/:id` | Détails album |
| `GET /api/music/deezer/albums/:id/tracks` | Tracks d'un album |
| `GET /api/music/deezer/artists/:id` | Détails artiste |
| `GET /api/music/deezer/artists/:id/top` | Top tracks |
| `GET /api/music/deezer/artists/:id/albums` | Albums |
| `GET /api/music/deezer/artists/:id/related` | Artistes similaires |
| `GET /api/music/deezer/tracks/:id` | Détails track |
| `GET /api/music/deezer/genres` | Genres |
| `GET /api/music/deezer/charts` | Charts (albums/tracks/artists) |
| `GET /api/music/deezer/chart/albums` | Charts albums |
| `GET /api/music/deezer/chart/tracks` | Charts tracks |
| `GET /api/music/deezer/chart/artists` | Charts artistes |

**Paramètres charts** : `category` (`albums`, `tracks`, `artists`), `limit`

> Les routes dédiées `/chart/albums`, `/chart/tracks`, `/chart/artists` permettent d'accéder directement à une catégorie spécifique.

#### MusicBrainz

> Source : [musicbrainz.org](https://musicbrainz.org) — Rate limit : 1 req/sec

| Endpoint | Description |
|----------|-------------|
| `GET /api/music/musicbrainz/search?q=` | Recherche globale |
| `GET /api/music/musicbrainz/search/albums?q=` | Recherche albums |
| `GET /api/music/musicbrainz/search/artists?q=` | Recherche artistes |
| `GET /api/music/musicbrainz/barcode/:barcode` | Recherche par code-barres |
| `GET /api/music/musicbrainz/albums/:id` | Détails album |
| `GET /api/music/musicbrainz/albums/:id/cover` | Pochette (Cover Art Archive) |
| `GET /api/music/musicbrainz/artists/:id` | Détails artiste |
| `GET /api/music/musicbrainz/artists/:id/albums` | Albums d'un artiste |

#### iTunes

> Source : [itunes.apple.com](https://itunes.apple.com)

| Endpoint | Description |
|----------|-------------|
| `GET /api/music/itunes/search?q=` | Recherche globale |
| `GET /api/music/itunes/search/albums?q=` | Recherche albums |
| `GET /api/music/itunes/search/artists?q=` | Recherche artistes |
| `GET /api/music/itunes/search/tracks?q=` | Recherche tracks |
| `GET /api/music/itunes/albums/:id` | Détails album + tracks |
| `GET /api/music/itunes/artists/:id` | Détails artiste |
| `GET /api/music/itunes/artists/:id/albums` | Albums |
| `GET /api/music/itunes/tracks/:id` | Détails track |
| `GET /api/music/itunes/charts` | Charts par pays |

**Paramètres charts** : `category` (`album`, `song`), `country` (`fr`, `us`, `gb`…), `limit`

---

### 10.11 E-commerce

#### Amazon

> Source : 8 marketplaces Amazon (scraping via FlareSolverr + VPN Gluetun)

| Marketplace | Code | Devise |
|-------------|------|--------|
| France | `fr` | EUR |
| USA | `us` | USD |
| UK | `uk` | GBP |
| Allemagne | `de` | EUR |
| Espagne | `es` | EUR |
| Italie | `it` | EUR |
| Canada | `ca` | CAD |
| Japon | `jp` | JPY |

| Endpoint | Description |
|----------|-------------|
| `GET /api/ecommerce/amazon/marketplaces` | Liste des marketplaces |
| `GET /api/ecommerce/amazon/categories` | Catégories (all, videogames, toys…) |
| `GET /api/ecommerce/amazon/search?q=&country=&category=` | Recherche produits |
| `GET /api/ecommerce/amazon/product/:asin?country=` | Détails par ASIN |
| `GET /api/ecommerce/amazon/compare/:asin?countries=` | Comparaison prix multi-pays |

```bash
# Recherche LEGO sur Amazon France
GET /api/ecommerce/amazon/search?q=lego&country=fr&limit=10

# Comparaison de prix
GET /api/ecommerce/amazon/compare/B01N6CJ1QW?countries=fr,us,uk,de
```

**Architecture anti-blocage** :

Le provider Amazon utilise un mécanisme multi-couches pour contourner les protections :

1. **VPN Gluetun** — proxy HTTP PIA OpenVPN (`VPN_PROXY_URL=http://gluetun:8888`)
2. **FlareSolverr** — navigateur Chromium headless avec résolution Cloudflare
3. **Warm-up session** — `fetchAmazonPage()` appelle `ensureSession()` (5s) avant chaque requête pour résoudre les challenges AWS WAF
4. **Retry automatique** — si la réponse est un WAF challenge (`isWafChallenge()`), attend 4s et retente (max 2 tentatives)
5. **Détection blocage** — `detectAmazonBlock()` distingue bot_detection, CAPTCHA et error_page

> **Note** : Temps de réponse : ~8s (1ère requête avec warm-up WAF), ~3s ensuite (session réutilisée). Limiter à 1 requête / 3 secondes.

#### Routes alias Amazon par domaine

Amazon est également exposé comme **provider natif** dans 9 domaines via des routes alias. Chaque alias redirige vers le provider Amazon avec une **catégorie pré-configurée** :

| Route alias | Catégorie Amazon | Label |
|-------------|-----------------|-------|
| `/api/videogames/amazon/` | `videogames` | Jeux vidéo |
| `/api/collectibles/amazon/` | `toys` | Jouets |
| `/api/boardgames/amazon/` | `toys` | Jouets |
| `/api/construction-toys/amazon/` | `toys` | Jouets |
| `/api/books/amazon/` | `books` | Livres |
| `/api/anime-manga/amazon/` | `books` | Livres |
| `/api/comics/amazon/` | `books` | Livres |
| `/api/music/amazon/` | `music` | Musique |
| `/api/media/amazon/` | `movies` | Films & Séries |

Chaque alias expose **4 endpoints** :

| Endpoint | Description |
|----------|-------------|
| `GET /api/{domain}/amazon/search?q=` | Recherche Amazon (catégorie pré-filtrée, `country=fr` par défaut) |
| `GET /api/{domain}/amazon/product/:asin` | Détails produit par ASIN |
| `GET /api/{domain}/amazon/health` | Statut du provider Amazon |
| `GET /api/{domain}/amazon/` | Informations de la route alias |

```bash
# Recherche de jeux vidéo sur Amazon (catégorie videogames auto)
GET /api/videogames/amazon/search?q=zelda

# Détail d'un Blu-ray via l'alias media
GET /api/media/amazon/product/B07HHQK71Z

# Recherche de livres manga sur Amazon
GET /api/anime-manga/amazon/search?q=one+piece
```

> **Note** : Les alias utilisent le même provider Amazon que `/api/ecommerce/amazon/` — même mécanisme FlareSolverr + VPN, mêmes temps de réponse.

---

### 10.12 Sticker-Albums

#### Paninimania

> Source : [paninimania.com](https://www.paninimania.com) (scraping, albums Panini)

| Endpoint | Description |
|----------|-------------|
| `GET /api/sticker-albums/paninimania/search?q=` | Recherche d'albums |
| `GET /api/sticker-albums/paninimania/details?id=` | Détails avec checklist |
| `GET /api/sticker-albums/paninimania/album/:id` | Détails par ID |

> **Note** : Paninimania est monté sous le domaine `/api/sticker-albums` et non sous `/api/collectibles`.

---

## 11. Endpoints Discovery (Trending/Popular/Charts)

Ces endpoints retournent des données **pré-cachées** dans PostgreSQL, rafraîchies automatiquement. Réponse ultra-rapide (~11ms).

| Endpoint | Provider | Description |
|----------|----------|-------------|
| `GET /api/media/tmdb/trending?category=movie&period=day` | TMDB | Films trending |
| `GET /api/media/tmdb/trending?category=tv&period=day` | TMDB | Séries trending |
| `GET /api/media/tmdb/popular?category=movie` | TMDB | Films populaires |
| `GET /api/media/tmdb/popular?category=tv` | TMDB | Séries populaires |
| `GET /api/media/tmdb/top-rated?category=movie` | TMDB | Films mieux notés |
| `GET /api/media/tmdb/top-rated?category=tv` | TMDB | Séries mieux notées |
| `GET /api/media/tmdb/upcoming` | TMDB | Films à venir |
| `GET /api/media/tmdb/on-the-air` | TMDB | Séries en cours |
| `GET /api/media/tmdb/airing-today` | TMDB | Séries du jour |
| `GET /api/anime-manga/jikan/top?type=anime` | Jikan | Top anime |
| `GET /api/anime-manga/jikan/top?type=manga` | Jikan | Top manga |
| `GET /api/anime-manga/jikan/top/tv` | Jikan | Top séries animées |
| `GET /api/anime-manga/jikan/top/movie` | Jikan | Top films animés |
| `GET /api/anime-manga/jikan/trending` | Jikan | Anime de la saison |
| `GET /api/anime-manga/jikan/trending/anime` | Jikan | Trending tous anime (saison en cours) |
| `GET /api/anime-manga/jikan/trending/tv` | Jikan | Trending séries animées |
| `GET /api/anime-manga/jikan/trending/movie` | Jikan | Trending films animés |
| `GET /api/anime-manga/jikan/upcoming` | Jikan | Anime à venir |
| `GET /api/anime-manga/jikan/upcoming/tv` | Jikan | À venir séries animées |
| `GET /api/anime-manga/jikan/upcoming/movie` | Jikan | À venir films animés |
| `GET /api/videogames/igdb/popular` | IGDB | Jeux populaires |
| `GET /api/videogames/igdb/top-rated` | IGDB | Jeux mieux notés |
| `GET /api/videogames/igdb/recent` | IGDB | Sorties récentes |
| `GET /api/videogames/igdb/upcoming` | IGDB | Jeux à venir |
| `GET /api/videogames/rawg/popular` | RAWG | Jeux populaires |
| `GET /api/videogames/rawg/trending` | RAWG | Jeux trending |
| `GET /api/videogames/rawg/top-rated` | RAWG | Jeux mieux notés |
| `GET /api/videogames/rawg/recent` | RAWG | Sorties récentes |
| `GET /api/videogames/rawg/upcoming` | RAWG | Jeux à venir |
| `GET /api/music/deezer/charts` | Deezer | Charts globaux |
| `GET /api/music/deezer/chart/albums` | Deezer | Charts albums |
| `GET /api/music/deezer/chart/tracks` | Deezer | Charts tracks |
| `GET /api/music/deezer/chart/artists` | Deezer | Charts artistes |
| `GET /api/music/itunes/charts?category=album&country=fr` | iTunes | Top albums FR |

---

## 12. Cache Admin

| Endpoint | Description |
|----------|-------------|
| `GET /api/cache/stats` | Statistiques globales du cache |
| `POST /api/cache/refresh/:provider` | Force refresh d'un provider |
| `POST /api/cache/refresh?batchSize=10` | Refresh des entrées expirées |
| `DELETE /api/cache/clear` | Vide tout le cache |

```bash
# Statistiques
curl https://tako.snowmanprod.fr/api/cache/stats

# Force refresh TMDB
curl -X POST https://tako.snowmanprod.fr/api/cache/refresh/tmdb
```

---

## 13. Fichiers statiques (images, PDFs)

Les archives locales (MEGA, KRE-O, Carddass, DBS) servent directement les images et PDFs.

**Base URL fichiers** : `https://tako.snowmanprod.fr/files/`

| Archive | Contenu | Exemple |
|---------|---------|---------|
| `mega-archive/` | 199 produits MEGA | `/files/mega-archive/HNH57/main.webp` |
| `kreo-archive/` | 417 produits KRE-O | `/files/kreo-archive/A6951/main.webp` |
| `carddass-archive/` | 219 093 images de cartes | `/files/carddass-archive/animecollection/...` |
| `dbs-archive/` | 8 362 images DBS | `/files/dbs-archive/masters/BT1/BT1-001.webp` |

> Les URLs d'images sont directement incluses dans les réponses API dans les champs `image`, `thumbnail`, `images.primary`, etc.

---

## 14. Traduction automatique

La plupart des endpoints supportent la traduction automatique via deux paramètres :

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `lang` | `fr`, `en`, `de`, `es`, `it`, `pt` | Langue cible |
| `autoTrad` | `1`, `true` | Activer la traduction |

```bash
# Détails d'un jeu IGDB traduit en français
GET /api/videogames/igdb/game/1074?lang=fr&autoTrad=1

# Top anime avec traduction
GET /api/anime-manga/jikan/top?type=anime&autoTrad=1&lang=fr
```

> La traduction est intégrée côté serveur (google-translate-api-x). Certains providers (TMDB, TVDB) supportent nativement le français via `lang=fr` sans besoin d'`autoTrad`.

---

## 15. Limites & Bonnes pratiques

### Performances attendues

| Type de requête | Latence typique |
|-----------------|-----------------|
| Endpoint discovery (cache) | ~11ms |
| Recherche via API externe | 150ms–2s |
| Endpoint scraping (FlareSolverr) | 3–18s |
| Endpoint scraping direct (Coleka) | 1–2s |
| Amazon (1ère requête, warm-up WAF) | ~8s |
| Amazon (requêtes suivantes) | 3–5s |

### Bonnes pratiques

1. **Exploitez les endpoints discovery** pour le contenu trending/popular — ils sont pré-cachés et quasi instantanés
2. **Cachez côté client** : les données products/détails changent rarement, cachez 1h minimum
3. **Utilisez `detailUrl`** : les réponses de recherche incluent un champ `detailUrl` ou `urls.detail` — utilisez-le pour récupérer les détails complets
4. **Limitez les résultats** : ne demandez que ce dont vous avez besoin (`limit=10` plutôt que 100)
5. **Gérez les erreurs 502/504** : les APIs externes peuvent être indisponibles temporairement — implémentez un retry avec backoff
6. **Respectez les providers scraped** : LEGO, Playmobil, Amazon sont plus lents (scraping) — ne les interrogez pas en boucle

### Providers les plus fiables

| Provider | Fiabilité | Vitesse | Notes |
|----------|-----------|---------|-------|
| TMDB | ★★★★★ | Rapide | Excellent pour films/séries |
| Jikan | ★★★★☆ | Rapide | Rate limit 3 req/sec |
| IGDB | ★★★★☆ | Rapide | Max 10 résultats pour popular |
| Pokémon TCG | ★★★★☆ | Moyen | API parfois lente |
| Scryfall (MTG) | ★★★★★ | Rapide | Syntaxe puissante |
| Deezer | ★★★★★ | Rapide | Pas de clé |
| Carddass (local) | ★★★★★ | Instantané | Base locale |
| DBS (local) | ★★★★★ | Instantané | Base locale |

---

## 16. Exemples d'intégration

### Application React — Page d'accueil

```javascript
const BASE = 'https://tako.snowmanprod.fr';

async function loadHomePage() {
  // Charger en parallèle les contenus trending (ultra rapide grâce au cache)
  const [movies, anime, games] = await Promise.all([
    fetch(`${BASE}/api/media/tmdb/trending?category=movie&limit=10`).then(r => r.json()),
    fetch(`${BASE}/api/anime-manga/jikan/trending?limit=10`).then(r => r.json()),
    fetch(`${BASE}/api/videogames/igdb/popular?limit=10`).then(r => r.json()),
  ]);

  return {
    trendingMovies: movies.data,
    trendingAnime: anime.data,
    popularGames: games.data,
  };
}
```

### Application React — Recherche multi-domaine

```javascript
async function searchAll(query) {
  const [movies, games, manga] = await Promise.all([
    fetch(`${BASE}/api/media/tmdb/search?q=${query}&limit=5`).then(r => r.json()),
    fetch(`${BASE}/api/videogames/igdb/search?q=${query}&limit=5`).then(r => r.json()),
    fetch(`${BASE}/api/anime-manga/jikan/search?q=${query}&limit=5`).then(r => r.json()),
  ]);
  
  return { movies: movies.data, games: games.data, manga: manga.data };
}
```

### Application mobile — Scan code-barres

```javascript
async function scanBarcode(barcode) {
  // Chercher d'abord dans Discogs (musique)
  const discogs = await fetch(`${BASE}/api/music/discogs/barcode/${barcode}`).then(r => r.json());
  if (discogs.success && discogs.data.length > 0) return discogs;

  // Puis dans MusicBrainz
  const mb = await fetch(`${BASE}/api/music/musicbrainz/barcode/${barcode}`).then(r => r.json());
  return mb;
}
```

### Script Python — Exporter des cartes Pokémon

```python
import requests

BASE = "https://tako.snowmanprod.fr"

# Récupérer tous les sets
sets = requests.get(f"{BASE}/api/tcg/pokemon/sets").json()["data"]
print(f"Nombre de sets : {len(sets)}")

# Chercher les cartes Charizard
cards = requests.get(f"{BASE}/api/tcg/pokemon/search", params={
    "q": "charizard",
    "max": 50,
    "lang": "fr"
}).json()

for card in cards["data"]:
    details = card.get("details", {})
    prices = details.get("prices", {})
    print(f"{card['title']} | {details.get('rarity')} | {details.get('set', {}).get('name')} | ${prices.get('market', 'N/A')}")
```

---

## 17. FAQ

### L'API est-elle gratuite ?
Oui, Tako API est entièrement gratuite et ne nécessite aucune authentification côté client.

### Quels formats sont supportés ?
Toutes les réponses sont en **JSON**. Le Content-Type est `application/json`.

### Est-ce que l'API est rate-limitée ?
Tako API elle-même n'a pas de rate limit. Cependant, les providers en amont ont leurs propres limites. En cas de dépassement, vous recevrez une erreur `429`.

### Comment savoir si une réponse vient du cache ?
Vérifiez le header `X-Cache` (`HIT`/`MISS`) ou le champ `meta.cached` dans la réponse JSON.

### Les images sont-elles hébergées par Tako API ?
Pour les archives locales (MEGA, KRE-O, Carddass, DBS), oui — les images sont servies directement depuis `https://tako.snowmanprod.fr/files/`. Pour les autres providers, les URLs pointent vers les sources originales (TMDB, TCGdex, etc.).

### Comment obtenir des prix de cartes ?
Les providers TCG incluent les prix dans les détails :
- **Pokémon TCG** : TCGPlayer (USD) + Cardmarket (EUR)
- **MTG** : Scryfall (USD, EUR, MTGO Tix)
- **Yu-Gi-Oh!** : Cardmarket, TCGPlayer, eBay, Amazon, CoolStuffInc

### Puis-je utiliser l'API en production ?
Oui. L'API est accessible en production sur `https://tako.snowmanprod.fr` avec un certificat TLS Let's Encrypt valide.

---

## Endpoints de contrôle

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Statut de l'API, version, uptime |
| `GET /version` | Nom, version, environment |
| `GET /docs` | Liste des specs OpenAPI disponibles |

---

## Annexe A — Référence exhaustive des champs `details` par provider

Cette annexe documente **tous les champs** pouvant apparaître dans l'objet `details` de chaque type de contenu, organisés par domaine et provider.

> **Rappel** : Tous les items partagent un noyau commun de 11 clés (`id`, `type`, `source`, `sourceId`, `title`, `titleOriginal`, `description`, `year`, `images`, `urls`, `details`). Seul le contenu de `details` varie.

---

### A.1 Media — TMDB

#### Movie (recherche)

| Champ | Type | Description |
|-------|------|-------------|
| `mediaType` | `"movie"` | Type de média |
| `releaseDate` | string? | Date de sortie (YYYY-MM-DD) |
| `genreIds` | number[] | IDs de genres TMDB |
| `rating` | `{average, voteCount}?` | Note et nombre de votes |
| `popularity` | number? | Score de popularité |
| `originalLanguage` | string? | Code langue (en, fr…) |
| `adult` | boolean | Contenu adulte |

#### Movie (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `mediaType` | `"movie"` | Type de média |
| `tagline` | string? | Tagline |
| `releaseDate` | string? | Date de sortie |
| `runtime` | number? | Durée en minutes |
| `status` | string? | Released, Planned… |
| `adult` | boolean | Contenu adulte |
| `genres` | string[] | Noms de genres |
| `rating` | `{average, voteCount}` | Note et votes |
| `popularity` | number? | Popularité |
| `budget` | number? | Budget en USD |
| `revenue` | number? | Recettes en USD |
| `originalLanguage` | string? | Langue originale |
| `spokenLanguages` | `[{code, name, englishName}]` | Langues parlées |
| `productionCountries` | `[{code, name}]` | Pays de production |
| `collection` | `{id, name, poster, backdrop}?` | Saga/collection |
| `studios` | `[{id, name, logo, country}]` | Studios de production |
| `cast` | `[{id, name, character, order, image}]` | Distribution |
| `crew` | `[{id, name, job, department, image}]` | Équipe technique |
| `directors` | `[{id, name, image}]` | Réalisateurs |
| `videos` | `[{id, key, name, type, official, url}]` | Bandes-annonces |
| `keywords` | string[] | Mots-clés |
| `externalIds` | `{imdb, facebook, instagram, twitter, wikidata}` | IDs externes |
| `contentRatings` | `[{country, rating, releaseDate}]` | Classifications par pays |
| `recommendations` | `[{sourceId, title, year, poster, rating}]` | Recommandations |
| `similar` | `[{sourceId, title, year, poster, rating}]` | Films similaires |

#### Series (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `mediaType` | `"tv"` | Type de média |
| `seriesType` | string? | Type de série (Scripted, Reality…) |
| `tagline` | string? | Tagline |
| `firstAirDate` | string? | Première diffusion |
| `lastAirDate` | string? | Dernière diffusion |
| `endYear` | number? | Année de fin |
| `status` | string? | Returning Series, Ended… |
| `inProduction` | boolean | En cours de production |
| `adult` | boolean | Contenu adulte |
| `seasonCount` | number? | Nombre de saisons |
| `episodeCount` | number? | Nombre total d'épisodes |
| `episodeRuntime` | number? | Durée moyenne d'un épisode |
| `genres` | string[] | Genres |
| `rating` | `{average, voteCount}` | Note |
| `popularity` | number? | Popularité |
| `originalLanguage` | string? | Langue originale |
| `languages` | string[] | Langues |
| `originalCountry` | string[] | Pays d'origine |
| `spokenLanguages` | `[{code, name, englishName}]` | Langues parlées |
| `productionCountries` | `[{code, name}]` | Pays de production |
| `lastEpisodeToAir` | `{id, name, overview, airDate, seasonNumber, episodeNumber, runtime, still, episodeType, rating}?` | Dernier épisode |
| `nextEpisodeToAir` | `{id, name, overview, airDate, seasonNumber, episodeNumber}?` | Prochain épisode |
| `networks` | `[{id, name, logo, country}]` | Diffuseurs |
| `studios` | `[{id, name, logo, country}]` | Studios |
| `creators` | `[{id, name, image}]` | Créateurs |
| `seasons` | `[{id, seasonNumber, name, overview, episodeCount, airDate, poster, rating}]` | Saisons |
| `cast` | `[{id, name, character, order, image}]` | Distribution |
| `crew` | `[{id, name, job, department, image}]` | Équipe |
| `videos` | `[{id, key, name, type, official, url}]` | Vidéos |
| `keywords` | string[] | Mots-clés |
| `externalIds` | `{imdb, tvdb, facebook, instagram, twitter, wikidata}` | IDs externes |
| `contentRatings` | `[{country, rating}]` | Classifications |
| `recommendations` | `[{sourceId, title, year, poster, rating}]` | Recommandations |
| `similar` | `[{sourceId, title, year, poster, rating}]` | Similaires |

#### Season (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `seriesId` | string? | ID de la série |
| `seasonNumber` | number | Numéro de saison |
| `episodeCount` | number | Nombre d'épisodes |
| `rating` | `{average, voteCount}?` | Note |
| `episodes` | `[{id, episodeNumber, name, description, airDate, runtime, still, rating, crew, guestStars}]` | Épisodes |
| `cast` | `[{id, name, character, image}]` | Distribution |
| `videos` | array | Vidéos |

#### Episode (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `seriesId` | string? | ID de la série |
| `seasonNumber` | number | Numéro de saison |
| `episodeNumber` | number | Numéro d'épisode |
| `airDate` | string? | Date de diffusion |
| `runtime` | number? | Durée en minutes |
| `rating` | `{average, voteCount}?` | Note |
| `crew` | `[{id, name, job, department, image}]` | Équipe |
| `directors` | `[{id, name, image}]` | Réalisateurs |
| `writers` | `[{id, name, image}]` | Scénaristes |
| `guestStars` | `[{id, name, character, order, image}]` | Guests |
| `videos` | array | Vidéos |

#### Collection (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `movieCount` | number | Nombre de films |
| `parts` | `[{sourceId, title, titleOriginal, description, releaseDate, year, poster, backdrop, rating, popularity, order}]` | Films de la saga |

#### Person (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `alsoKnownAs` | string[] | Noms alternatifs |
| `birthday` | string? | Date de naissance |
| `deathday` | string? | Date de décès |
| `placeOfBirth` | string? | Lieu de naissance |
| `gender` | number | Genre (1=Femme, 2=Homme) |
| `knownForDepartment` | string? | Département principal |
| `popularity` | number? | Popularité |
| `adult` | boolean | Contenu adulte |
| `externalIds` | `{imdb, facebook, instagram, twitter, tiktok, youtube}` | IDs externes |
| `movieCredits` | `{cast: [{sourceId,title,character,releaseDate,year,poster,rating,popularity}], crew: [...]}` | Filmographie cinéma |
| `tvCredits` | `{cast: [{sourceId,title,character,firstAirDate,year,poster,rating,episodeCount}], crew: [...]}` | Filmographie TV |

---

### A.2 Media — TVDB

#### Movie (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `mediaType` | `"movie"` | Type |
| `slug` | string? | Slug TVDB |
| `releaseDate` | string? | Date de sortie |
| `runtime` | number? | Durée |
| `status` | string? | Statut |
| `genres` | string[] | Genres |
| `popularityScore` | number? | Score populaire |
| `budget` | number? | Budget |
| `revenue` | number? | Recettes |
| `originalLanguage` | string? | Langue originale |
| `productionCountries` | `[{code}]` | Pays de production |
| `releases` | `[{country, date, detail}]` | Dates de sortie |
| `studios` | `[{id, name, country, type}]` | Studios |
| `cast` | `[{id, name, character, order, image}]` | Distribution |
| `directors` | `[{id, name, image}]` | Réalisateurs |
| `crew` | `[{id, name, image, job}]` | Équipe |
| `videos` | `[{id, name, url, type, runtime, language}]` | Bandes-annonces |
| `collection` | `{id, name, overview}?` | Collection |
| `contentRatings` | `[{country, rating, fullName}]` | Classifications |
| `externalIds` | `{imdb, tmdb, facebook, twitter, instagram, wikidata}` | IDs externes |
| `artworks` | `[{id, type, image, thumbnail, language, score}]` | Images artistiques |

#### Series (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `mediaType` | `"tv"` | Type |
| `slug` | string? | Slug TVDB |
| `firstAirDate` | string? | Première diffusion |
| `lastAirDate` | string? | Dernière diffusion |
| `nextAirDate` | string? | Prochaine diffusion |
| `endYear` | number? | Année de fin |
| `status` | string? | Statut |
| `defaultSeasonType` | number? | Type de saison par défaut |
| `averageRuntime` | number? | Durée moyenne |
| `episodeRuntime` | number? | Durée par épisode |
| `seasonCount` | number | Nombre de saisons |
| `episodeCount` | number? | Nombre d'épisodes |
| `genres` | string[] | Genres |
| `aliases` | array | Noms alternatifs |
| `broadcast` | `{days, time, timeUTC}?` | Horaires de diffusion |
| `popularityScore` | number? | Score populaire |
| `originalLanguage` | string? | Langue originale |
| `originalCountry` | string[] | Pays d'origine |
| `seasons` | `[{id, seasonNumber, name, poster}]` | Saisons |
| `networks` | `[{id, name, logo, country}]` | Diffuseurs |
| `studios` | `[{id, name, country, type}]` | Studios |
| `cast` | `[{id, name, character, order, image}]` | Distribution |
| `creators` | `[{id, name, image}]` | Créateurs |
| `directors` | `[{id, name, image}]` | Réalisateurs |
| `crew` | `[{id, name, image, job}]` | Équipe |
| `videos` | array | Vidéos |
| `collection` | `{id, name, overview}?` | Collection |
| `contentRatings` | `[{country, rating, fullName}]` | Classifications |
| `externalIds` | `{imdb, tmdb, facebook, twitter, instagram, wikidata}` | IDs externes |
| `artworks` | array | Images |

#### Episode (détail TVDB)

| Champ | Type | Description |
|-------|------|-------------|
| `seriesId` | number? | ID de la série |
| `seasonNumber` | number? | Numéro de saison |
| `episodeNumber` | number? | Numéro d'épisode |
| `absoluteNumber` | number? | Numéro absolu |
| `airDate` | string? | Date de diffusion |
| `runtime` | number? | Durée |
| `productionCode` | string? | Code de production |
| `isMovie` | boolean | Est un film |
| `finaleType` | string? | Type de finale |
| `rating` | `{average, voteCount}?` | Note |
| `directors` | `[{id, name, image}]` | Réalisateurs |
| `crew` | array | Équipe |
| `guestStars` | `[{id, name, character, image}]` | Guests |

#### Person (détail TVDB)

| Champ | Type | Description |
|-------|------|-------------|
| `birthday` | string? | Date de naissance |
| `deathday` | string? | Date de décès |
| `placeOfBirth` | string? | Lieu de naissance |
| `gender` | string? | Genre |
| `biographies` | array | Biographies multilingues |
| `characters` | `[{id, name, type, peopleType, seriesId, movieId, image}]` | Personnages joués |
| `externalIds` | `{imdb, tmdb, facebook, twitter, instagram, wikidata}` | IDs externes |

---

### A.3 Videogames — IGDB

#### Game (recherche)

| Champ | Type | Description |
|-------|------|-------------|
| `slug` | string? | Slug IGDB |
| `releaseDate` | string? | Date (YYYY-MM-DD) |
| `rating` | number? | Note /100 |
| `ratingCount` | number | Nombre de votes |
| `platforms` | string[] | Noms des plateformes |
| `genres` | string[] | Genres |
| `themes` | string[] | Thèmes |
| `gameModes` | string[] | Modes de jeu |
| `developers` | string[] | Développeurs |
| `publishers` | string[] | Éditeurs |
| `screenshots` | string[] | URLs screenshots |
| `category` | string | main_game, dlc_addon, expansion, bundle, remake, remaster… |

#### Game (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `slug` | string? | Slug IGDB |
| `storyline` | string? | Synopsis détaillé |
| `releaseDate` | string? | Date de sortie |
| `createdAt` | string? | Date de création sur IGDB |
| `updatedAt` | string? | Dernière mise à jour IGDB |
| `rating` | number? | Note globale /100 |
| `ratingCount` | number | Nombre de votes |
| `criticRating` | number? | Note critique /100 |
| `criticRatingCount` | number | Nombre de critiques |
| `userRating` | number? | Note utilisateurs /100 |
| `userRatingCount` | number | Nombre d'avis utilisateurs |
| `hypes` | number | Nombre de hypes |
| `follows` | number | Nombre de follows |
| `category` | string | Type de jeu (main_game, dlc_addon…) |
| `status` | string | released, alpha, beta, early_access, offline, cancelled… |
| `ageRatings` | `[{category, rating, synopsis, contentDescriptions}]` | Classifications ESRB/PEGI/CERO |
| `screenshots` | `[{id, url, thumb}]` | Screenshots |
| `artworks` | `[{id, url, thumb}]` | Artworks |
| `videos` | `[{id, name, videoId, url, thumbnail}]` | Vidéos YouTube |
| `genres` | string[] | Genres |
| `themes` | string[] | Thèmes |
| `keywords` | string[] | Mots-clés |
| `gameModes` | string[] | Modes de jeu |
| `playerPerspectives` | string[] | Perspectives joueur |
| `platforms` | `[{id, name, abbreviation, slug}]` | Plateformes |
| `involvedCompanies` | `[{id, name, developer, publisher, porting, supporting}]` | Compagnies impliquées |
| `developers` | string[] | Développeurs |
| `publishers` | string[] | Éditeurs |
| `franchise` | `{id, name}?` | Franchise principale |
| `franchises` | `[{id, name}]` | Franchises |
| `collection` | `{id, name, games: [{id, name, cover}]}?` | Collection de jeux |
| `parentGame` | `{id, name, cover}?` | Jeu parent (si DLC) |
| `dlcs` | `[{id, name, cover}]` | DLCs |
| `expansions` | `[{id, name, cover}]` | Extensions |
| `remakes` | `[{id, name, cover}]` | Remakes |
| `remasters` | `[{id, name, cover}]` | Remasters |
| `similarGames` | `[{id, name, cover, rating}]` | Jeux similaires |
| `websites` | `[{category, url, trusted}]` | Sites web (official, steam, gog…) |
| `gameEngines` | `[{id, name}]` | Moteurs de jeu |
| `alternativeNames` | `[{name, comment}]` | Noms alternatifs |
| `releaseDates` | `[{platform, date, region, human}]` | Dates de sortie par plateforme |
| `languageSupports` | `[{language, nativeName, type}]` | Langues supportées |

---

### A.4 Videogames — RAWG

#### Game (recherche)

| Champ | Type | Description |
|-------|------|-------------|
| `slug` | string? | Slug RAWG |
| `releaseDate` | string? | Date (YYYY-MM-DD) |
| `rating` | number? | Note /10 (rawg_rating × 2) |
| `ratingTop` | number | Note max (défaut 5) |
| `ratingsCount` | number | Nombre de votes |
| `metacritic` | number? | Score Metacritic |
| `playtime` | number? | Temps de jeu moyen (heures) |
| `platforms` | string[] | Plateformes |
| `genres` | string[] | Genres |
| `stores` | string[] | Magasins |
| `tags` | string[] | Tags (max 10) |
| `esrbRating` | string? | Classification ESRB |
| `added` | number | Nombre d'ajouts |
| `updated` | string? | Dernière mise à jour |

#### Game (détail)

Inclut tous les champs de recherche plus :

| Champ | Type | Description |
|-------|------|-------------|
| `descriptionHtml` | string? | Description en HTML |
| `tba` | boolean | Date à confirmer |
| `ratingsBreakdown` | `[{id, title, count, percent}]` | Répartition des notes |
| `metacriticUrl` | string? | URL Metacritic |
| `metacriticPlatforms` | `[{platform, score, url}]` | Scores par plateforme |
| `achievementsCount` | number | Nombre de succès |
| `reviewsCount` | number | Nombre de reviews |
| `suggestionsCount` | number | Suggestions |
| `addedByStatus` | object | Répartition par statut |
| `esrbRating` | `{id, name, slug}?` | Classification détaillée |
| `backgroundAdditional` | string? | Image de fond secondaire |
| `website` | string? | Site officiel |
| `genres` | `[{id, name, slug}]` | Genres détaillés |
| `tags` | `[{id, name, slug, language, gamesCount}]` | Tags détaillés |
| `platforms` | `[{id, name, slug, released, requirements}]` | Plateformes détaillées |
| `parentPlatforms` | `[{id, name, slug}]` | Plateformes parentes |
| `developers` | `[{id, name, slug, gamesCount, image}]` | Développeurs |
| `publishers` | `[{id, name, slug, gamesCount, image}]` | Éditeurs |
| `stores` | `[{id, name, slug, domain, url}]` | Magasins |
| `clip` | `{clip, preview, video}?` | Clip vidéo |
| `redditUrl` | string? | URL Reddit |
| `alternativeNames` | string[] | Noms alternatifs |

---

### A.5 Videogames — JVC

#### Game (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `releaseDate` | string? | Date de sortie |
| `platforms` | string[] | Plateformes |
| `genres` | string[] | Genres |
| `developers` | string[] | Développeurs |
| `publishers` | string[] | Éditeurs |
| `pegi` | string? | Classification PEGI |
| `minAge` | number? | Âge minimum |
| `players` | string? | Nombre de joueurs |
| `isMultiplayer` | boolean | Mode multijoueur |
| `media` | string[] | Types de média |
| `rating` | `{critics, users}` | Notes JVC /5 |
| `reviewUrl` | string? | URL du test |
| `language` | `"fr"` | Toujours français |

---

### A.6 Videogames — ConsoleVariations

#### Console/Controller/Accessory (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | string? | Marque (Sony, Nintendo…) |
| `platform` | `{id, name}?` | Plateforme |
| `releaseCountry` | string? | Pays de sortie |
| `releaseYear` | number? | Année de sortie |
| `releaseType` | string? | retail, promotional, bundle, prototype |
| `regionCode` | string? | Code région |
| `productionQuantity` | number? | Quantité produite |
| `isLimitedEdition` | boolean | Édition limitée |
| `isBundle` | boolean | Bundle |
| `color` | string? | Couleur |
| `barcode` | string? | Code-barres |
| `rarity` | `{score, level}` | Score de rareté |
| `community` | `{wantCount, ownCount}` | Statistiques communautaires |

---

### A.7 Anime-Manga — Jikan

#### Anime (recherche et détail)

| Champ | Type | Description |
|-------|------|-------------|
| `position` | number? | Position dans les résultats |
| `malId` | number | ID MyAnimeList |
| `resourceType` | string | tv, movie, ova, special, ona, music |
| `titleEnglish` | string? | Titre anglais |
| `titleAlternatives` | `[{type, title}]` | Titres alternatifs |
| `trailer` | `{url, embedUrl, youtubeId, images}?` | Bande-annonce YouTube |
| `format` | string? | TV, Movie, OVA… |
| `sourceMaterial` | string? | Manga, Light Novel, Original… |
| `episodes` | number? | Nombre d'épisodes |
| `status` | string? | Finished Airing, Currently Airing… |
| `airing` | boolean | En cours de diffusion |
| `aired` | `{from, to, string}` | Dates de diffusion |
| `duration` | string? | Durée (ex: "24 min per ep") |
| `rating` | `{code, label, minAge}?` | Classification (PG-13, R-17+…) |
| `score` | number? | Score MAL /10 |
| `scoredBy` | number? | Nombre de votants |
| `rank` | number? | Classement |
| `popularity` | number? | Rang de popularité |
| `members` | number? | Nombre de membres |
| `favorites` | number? | Nombre de favoris |
| `season` | string? | winter, spring, summer, fall |
| `studios` | `[{id, name, url}]` | Studios d'animation |
| `producers` | `[{id, name, url}]` | Producteurs |
| `licensors` | `[{id, name, url}]` | Distributeurs |
| `genres` | `[{id, name, url}]` | Genres |
| `explicitGenres` | `[{id, name, url}]` | Genres explicites |
| `themes` | `[{id, name, url}]` | Thèmes |
| `demographics` | `[{id, name, url}]` | Démographiques (Shounen, Seinen…) |
| `titleSynonyms` | string[] | Synonymes |
| `broadcast` | `{day, time, timezone, string}?` | Horaires de diffusion |

*Champs supplémentaires en détail complet :*

| Champ | Type | Description |
|-------|------|-------------|
| `background` | string? | Contexte/historique |
| `relations` | `[{relation, entries: [{id, type, name, url}]}]` | Relations (sequels, prequels…) |
| `openingThemes` | string[] | Génériques d'ouverture |
| `endingThemes` | string[] | Génériques de fin |
| `streaming` | `[{name, url}]` | Plateformes de streaming |
| `externalLinks` | `[{name, url}]` | Liens externes |
| `detailLevel` | `"full"` | Niveau de détail |

#### Manga (recherche et détail)

| Champ | Type | Description |
|-------|------|-------------|
| `position` | number? | Position |
| `malId` | number | ID MyAnimeList |
| `resourceType` | string | manga, novel, lightnovel, oneshot… |
| `titleEnglish` | string? | Titre anglais |
| `titleAlternatives` | `[{type, title}]` | Titres alternatifs |
| `format` | string? | Manga, Novel, Light Novel… |
| `chapters` | number? | Nombre de chapitres |
| `volumes` | number? | Nombre de volumes |
| `status` | string? | Finished, Publishing… |
| `publishing` | boolean | En cours de publication |
| `published` | `{from, to, string}` | Dates de publication |
| `score` | number? | Score MAL /10 |
| `scoredBy` | number? | Nombre de votants |
| `rank` | number? | Classement |
| `popularity` | number? | Rang de popularité |
| `members` | number? | Nombre de membres |
| `favorites` | number? | Nombre de favoris |
| `authors` | `[{id, name, url}]` | Auteurs |
| `serializations` | `[{id, name, url}]` | Revues de publication |
| `genres` | `[{id, name, url}]` | Genres |
| `explicitGenres` | `[{id, name, url}]` | Genres explicites |
| `themes` | `[{id, name, url}]` | Thèmes |
| `demographics` | `[{id, name, url}]` | Démographiques |
| `titleSynonyms` | string[] | Synonymes |

*Champs supplémentaires en détail complet :*

| Champ | Type | Description |
|-------|------|-------------|
| `background` | string? | Contexte |
| `relations` | `[{relation, entries: [{id, type, name, url}]}]` | Relations |
| `externalLinks` | `[{name, url}]` | Liens externes |
| `detailLevel` | `"full"` | Niveau de détail |

#### Character (détail Jikan)

| Champ | Type | Description |
|-------|------|-------------|
| `malId` | number | ID MAL |
| `nicknames` | string[] | Surnoms |
| `favorites` | number | Nombre de favoris |
| `anime` | `[{id, title, image, url, role}]` | Apparitions anime |
| `manga` | `[{id, title, image, url, role}]` | Apparitions manga |
| `voiceActors` | `[{id, name, image, language}]` | Doubleurs |

#### Person (détail Jikan)

| Champ | Type | Description |
|-------|------|-------------|
| `malId` | number | ID MAL |
| `givenName` | string? | Prénom |
| `familyName` | string? | Nom de famille |
| `alternateNames` | string[] | Noms alternatifs |
| `birthday` | string? | Date de naissance |
| `favorites` | number | Nombre de favoris |
| `websiteUrl` | string? | Site web |
| `voiceActing` | `[{character: {id,name,image}, anime: {id,title,image}, role}]` | Rôles de doublage |
| `animeStaff` | `[{id, title, image, position}]` | Positions staff anime |
| `mangaStaff` | `[{id, title, image, position}]` | Positions staff manga |

---

### A.8 Anime-Manga — MangaUpdates

#### Series (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `format` | string | Manga, Manhwa, Manhua, Novel… |
| `status` | string | completed, ongoing, unknown |
| `titleAlternatives` | string[] | Titres alternatifs |
| `titleFrench` | string? | Titre français (Nautiljon) |
| `statusDetails` | `{completed, licensed, licensedEnglish, animeAdaptation}` | Statut détaillé |
| `genres` | `[{id, name}]` | Genres |
| `categories` | `[{id, name, votes, votesPlus, votesMinus}]` | Catégories vote communauté |
| `rating` | `{score, votes, distribution}` | Note communautaire |
| `publications` | `[{name, publisherId, publisherName}]` | Publications |
| `authors` | `[{id, name, type}]` | Auteurs (rôle: story, art…) |
| `publishers` | `[{id, name, type, notes}]` | Éditeurs |
| `relatedSeries` | `[{id, name, type, triggeredByRelation}]` | Séries liées |
| `recommendations` | `[{id, name, weight}]` | Recommandations |
| `anime` | `{startYear, endYear}?` | Adaptation anime |
| `latestChapter` | number? | Dernier chapitre |
| `stats` | `{rankPosition, rankOldPosition, forumId}` | Statistiques |
| `lastUpdated` | string? | Dernière MAJ |

#### Author (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"author"` | Type |
| `nameAlternatives` | string[] | Noms alternatifs |
| `actualName` | string? | Vrai nom |
| `birthday` | string? | Date de naissance |
| `birthplace` | string? | Lieu de naissance |
| `bloodtype` | string? | Groupe sanguin |
| `gender` | string? | Genre |
| `social` | `{website, facebook, twitter}` | Réseaux sociaux |
| `stats` | `{totalSeries, genres}` | Statistiques |

---

### A.9 Anime-Manga — Nautiljon

#### Série manga (recherche)

| Champ | Type | Description |
|-------|------|-------------|
| `position` | number | Position dans les résultats |
| `resourceType` | `"manga"` | Type de ressource |
| `slug` | string | Slug Nautiljon |

#### Série manga (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"manga"` | Type de ressource |
| `format` | string? | Manga, Light Novel… |
| `origin` | string? | Pays d'origine (Japon, Corée…) |
| `status` | string? | En cours, Terminé… |
| `volumes` | number? | Nombre de volumes VO |
| `genres` | string[] | Genres |
| `themes` | string[] | Thèmes |
| `authors` | string[] | Auteurs |
| `publishers` | object? | Éditeurs par pays `{vf, vo}` |
| `editions` | string[] | Éditions disponibles |
| `volumesList` | `[{id, number, label, cover, detailUrl}]` | Liste des volumes |
| `volumesCount` | number | Nombre de volumes listés |

#### Volume manga (liste / recherche)

| Champ | Type | Description |
|-------|------|-------------|
| `position` | number | Position dans la liste |
| `resourceType` | `"volume"` | Type de ressource |
| `volumeNumber` | string | Numéro du volume |
| `volumeLabel` | string? | Label affiché ("Vol. 5") |
| `seriesTitle` | string | Titre de la série parente |
| `seriesSlug` | string | Slug de la série |
| `seriesTitleOriginal` | string? | Titre original japonais |
| `format` | string? | Manga, Light Novel… |
| `origin` | string? | Pays d'origine |
| `status` | string? | En cours, Terminé… |
| `totalVolumes` | number? | Nombre total de volumes |
| `genres` | string[] | Genres de la série |
| `themes` | string[] | Thèmes de la série |
| `authors` | string[] | Auteurs |
| `publishers` | object? | Éditeurs `{vf, vo}` |
| `seriesImage` | string? | Image de la série |

#### Volume manga (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"volume"` | Type de ressource |
| `volumeNumber` | string | Numéro du volume |
| `seriesTitle` | string | Titre de la série |
| `seriesSlug` | string | Slug de la série |
| `isbn` | string? | ISBN/EAN |
| `pages` | number? | Nombre de pages |
| `price` | string? | Prix (ex: "7.20 €") |
| `dates` | `{fr, jp}?` | Dates de sortie VF/VO |
| `publishers` | `{fr, jp}?` | Éditeurs VF/VO |
| `covers` | `{fr, jp}?` | URLs couvertures FR/JP |
| `chapters` | `[{title, number}]?` | Chapitres avec titres |
| `chaptersCount` | number | Nombre de chapitres |
| `edition` | string? | Édition |

---

### A.10 Music — Deezer

#### Album (recherche)

| Champ | Type | Description |
|-------|------|-------------|
| `artist` | string? | Nom de l'artiste |
| `artistId` | string? | ID artiste (`deezer:123`) |
| `recordType` | string? | album, single, ep |
| `trackCount` | number? | Nombre de pistes |
| `explicit` | boolean | Contenu explicite |
| `position` | number? | Position dans les résultats |

#### Album (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `upc` | string? | Code UPC |
| `recordType` | string? | Type d'album |
| `artist` | string? | Artiste |
| `artistId` | string? | ID artiste |
| `artistImage` | string? | Photo de l'artiste |
| `releaseDate` | string? | Date de sortie |
| `genres` | string[] | Genres |
| `label` | string? | Label |
| `duration` | number? | Durée totale en secondes |
| `durationFormatted` | string? | Durée formatée |
| `tracks` | `[{position, id, sourceId, title, artist, artistId, duration, durationFormatted, discNumber, preview, explicit, rank}]` | Pistes |
| `trackCount` | number | Nombre de pistes |
| `discCount` | number | Nombre de disques |
| `contributors` | `[{id, sourceId, name, role, image}]` | Contributeurs |
| `explicit` | boolean | Contenu explicite |
| `fans` | number | Nombre de fans |

#### Artist (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `nbAlbums` | number | Nombre d'albums |
| `nbFans` | number | Nombre de fans |
| `topTracks` | `[{position, id, sourceId, title, duration, durationFormatted, album, albumCover, preview, rank, explicit}]` | Top pistes |
| `albums` | `[{position, id, sourceId, title, cover, releaseDate, year, type, trackCount, fans}]` | Albums |

#### Track (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `titleShort` | string? | Titre court |
| `titleVersion` | string? | Version du titre |
| `artist` | string? | Artiste |
| `artistId` | string? | ID artiste |
| `album` | string? | Album |
| `albumId` | string? | ID album |
| `albumCover` | string? | Pochette |
| `duration` | number? | Durée en secondes |
| `durationFormatted` | string? | Format mm:ss |
| `discNumber` | number | Numéro de disque |
| `trackNumber` | number? | Numéro de piste |
| `releaseDate` | string? | Date de sortie |
| `bpm` | number? | Battements par minute |
| `gain` | number? | Gain |
| `rank` | number? | Classement |
| `preview` | string? | URL preview 30s |
| `explicit` | boolean | Explicite |
| `isrc` | string? | Code ISRC |
| `contributors` | `[{id, name, role}]` | Contributeurs |

---

### A.11 Music — Discogs

#### Release (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"release"` | Type |
| `masterId` | string? | ID master |
| `artists` | `[{id, sourceId, name, role}]` | Artistes |
| `artist` | string | Noms joints |
| `releaseDate` | string? | Date de sortie |
| `country` | string? | Pays |
| `genres` | string[] | Genres |
| `styles` | string[] | Styles |
| `formats` | `[{name, qty, descriptions}]` | Formats physiques |
| `labels` | `[{id, sourceId, name, catalogNumber}]` | Labels |
| `tracks` | `[{position, title, duration, durationSeconds, artists}]` | Tracklist |
| `trackCount` | number | Nombre de pistes |
| `community` | `{have, want, rating, ratingCount}?` | Stats communautaires |
| `identifiers` | `[{type, value}]` | Identifiants (barcode…) |
| `numForSale` | number | Copies en vente |
| `lowestPrice` | number? | Prix le plus bas |
| `companies` | `[{id, sourceId, name, role, catalogNumber}]` | Compagnies |
| `extraArtists` | `[{id, sourceId, name, role}]` | Artistes supplémentaires |
| `videos` | `[{title, url, duration, description}]` | Vidéos |

#### Master (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"master"` | Type |
| `artists` | `[{id, sourceId, name, role}]` | Artistes |
| `artist` | string | Noms joints |
| `genres` | string[] | Genres |
| `styles` | string[] | Styles |
| `tracks` | `[{position, title, duration, durationSeconds, artists}]` | Tracklist |
| `trackCount` | number | Nombre de pistes |
| `versionsCount` | number | Nombre de versions |
| `numForSale` | number | Copies en vente |
| `lowestPrice` | number? | Prix le plus bas |
| `mainReleaseId` | string? | ID release principale |
| `videos` | array | Vidéos |

#### Artist (détail Discogs)

| Champ | Type | Description |
|-------|------|-------------|
| `realName` | string? | Vrai nom |
| `nameVariations` | string[] | Variations du nom |
| `members` | `[{id, sourceId, name, active}]` | Membres (si groupe) |
| `aliases` | `[{id, sourceId, name}]` | Alias |
| `groups` | `[{id, sourceId, name, active}]` | Groupes |
| `externalUrls` | string[] | Liens |

#### Label (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `contactInfo` | string? | Coordonnées |
| `sublabels` | `[{id, sourceId, name}]` | Sous-labels |
| `parentLabel` | `{id, sourceId, name}?` | Label parent |
| `externalUrls` | string[] | Liens |

---

### A.12 Music — iTunes

#### Album (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `artist` | string? | Artiste |
| `artistId` | string? | ID (`itunes:123`) |
| `releaseDate` | string? | Date de sortie |
| `genre` | string? | Genre |
| `tracks` | `[{position, id, sourceId, title, artist, artistId, duration, durationFormatted, discNumber, preview, explicit, url, price}]` | Pistes |
| `trackCount` | number | Nombre de pistes |
| `discCount` | number | Nombre de disques |
| `duration` | number? | Durée totale |
| `durationFormatted` | string? | Durée formatée |
| `explicit` | boolean | Explicite |
| `price` | number? | Prix |
| `currency` | string? | Devise |
| `copyright` | string? | Copyright |

#### Track (détail iTunes)

| Champ | Type | Description |
|-------|------|-------------|
| `artist` | string? | Artiste |
| `artistId` | string? | ID artiste |
| `album` | string? | Album |
| `albumId` | string? | ID album |
| `trackNumber` | number? | Numéro de piste |
| `discNumber` | number | Disque |
| `duration` | number? | Durée en secondes |
| `durationFormatted` | string? | Format mm:ss |
| `genre` | string? | Genre |
| `releaseDate` | string? | Date de sortie |
| `explicit` | boolean | Explicite |
| `preview` | string? | URL preview |
| `price` | number? | Prix |
| `currency` | string? | Devise |
| `isStreamable` | boolean | Streamable |

---

### A.13 Music — MusicBrainz

#### Album (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `artist` | string? | Artiste principal |
| `artists` | `[{id, sourceId, name, joinPhrase}]` | Artistes |
| `disambiguation` | string? | Désambiguïsation |
| `releaseDate` | string? | Date de sortie |
| `primaryType` | string? | Album, EP, Single |
| `secondaryTypes` | string[] | Compilation, Live… |
| `tags` | `[{name, count}]` | Tags |
| `rating` | `{value, votes}?` | Note communautaire |
| `releases` | `[{id, sourceId, title, status, date, country, barcode, trackCount, packaging, label, catalogNumber}]` | Releases physiques |
| `releasesCount` | number | Nombre de releases |
| `tracks` | `[{position, disc, title, duration, durationFormatted}]` | Tracklist |
| `trackCount` | number | Nombre de pistes |

#### Artist (détail MusicBrainz)

| Champ | Type | Description |
|-------|------|-------------|
| `sortName` | string? | Nom de tri |
| `disambiguation` | string? | Désambiguïsation |
| `artistType` | string? | Person, Group, Orchestra… |
| `gender` | string? | Genre |
| `country` | string? | Code ISO |
| `area` | string? | Zone |
| `beginDate` | string? | Date de début |
| `endDate` | string? | Date de fin |
| `active` | boolean | En activité |
| `beginArea` | string? | Zone de début |
| `endArea` | string? | Zone de fin |
| `aliases` | `[{name, sortName, type, locale, primary}]` | Alias |
| `tags` | `[{name, count}]` | Tags |
| `rating` | `{value, votes}?` | Note |
| `albums` | `[{position, id, sourceId, title, primaryType, secondaryTypes, releaseDate, year, cover}]` | Albums |
| `eps` | array | EPs (même structure) |
| `singles` | array | Singles (même structure) |
| `allReleases` | array | Toutes les releases |

---

### A.14 Books — Google Books

#### Book (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string? | Sous-titre |
| `fullTitle` | string | Titre + sous-titre |
| `authors` | string[] | Auteurs |
| `publisher` | string? | Éditeur |
| `publishedDate` | string? | Date de publication |
| `categories` | string[] | Catégories |
| `language` | string? | Code langue |
| `isbn` | string? | ISBN principal |
| `isbn10` | string? | ISBN-10 |
| `isbn13` | string? | ISBN-13 |
| `identifiers` | object | Tous les identifiants |
| `pageCount` | number? | Nombre de pages |
| `synopsis` | string? | Synopsis complet |
| `rating` | `{value, count}?` | Note |
| `printType` | string? | Type d'impression |
| `maturityRating` | string? | Classification |
| `previewLink` | string? | Lien de prévisualisation |
| `covers` | `{extraLarge, large, medium, small, thumbnail}?` | Toutes les couvertures |

---

### A.15 Books — OpenLibrary

#### Book (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | null | — |
| `authors` | string[] | Auteurs |
| `publishers` | string[] | Éditeurs |
| `publisher` | string? | Éditeur principal |
| `publishedDate` | string? | Date de publication |
| `categories` | string[] | Sujets (max 15) |
| `language` | string? | Langue |
| `identifiers` | `{openlibrary, isbn}` | Identifiants |
| `covers` | `{large, medium, small}` | Couvertures |
| `pageCount` | number? | Nombre de pages |
| `places` | string[]? | Lieux mentionnés |
| `times` | string[]? | Époques |
| `people` | string[]? | Personnages |
| `externalLinks` | `[{title, url}]`? | Liens externes |
| `format` | string? | Format physique |
| `workId` | string? | ID de l'œuvre |
| `availableLanguages` | string[]? | Langues disponibles |

---

### A.16 Comics — ComicVine

#### Volume (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"volume"` | Type |
| `startYear` | string? | Année de début |
| `publisher` | string? | Éditeur |
| `publisherId` | number? | ID éditeur |
| `issueCount` | number | Nombre de numéros |
| `aliases` | string[] | Alias |
| `firstIssue` | `{id, name, issueNumber}?` | Premier numéro |
| `lastIssue` | `{id, name, issueNumber}?` | Dernier numéro |
| `issues` | `[{id, name, issueNumber}]` | Liste des numéros |
| `detailLevel` | `"full"` | Niveau |

#### Issue (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"issue"` | Type |
| `issueNumber` | string? | Numéro |
| `coverDate` | string? | Date de couverture |
| `storeDate` | string? | Date de vente |
| `volume` | `{id, name}?` | Volume parent |
| `characters` | `[{id, name}]` | Personnages |
| `creators` | `[{id, name, role}]` | Créateurs (rôle: writer, artist…) |
| `teams` | `[{id, name}]` | Équipes |
| `storyArcs` | `[{id, name}]` | Arcs |
| `detailLevel` | `"full"` | Niveau |

#### Character (détail ComicVine)

| Champ | Type | Description |
|-------|------|-------------|
| `realName` | string? | Vrai nom |
| `publisher` | string? | Éditeur |
| `publisherId` | number? | ID éditeur |
| `firstAppearance` | `{id, name, issueNumber}?` | Première apparition |
| `aliases` | string[] | Alias |
| `birth` | string? | Date de naissance |
| `gender` | string? | male, female, other |
| `origin` | string? | Origine |
| `powers` | string[] | Pouvoirs |
| `teams` | `[{id, name}]` | Équipes |
| `enemies` | `[{id, name}]` | Ennemis |
| `friends` | `[{id, name}]` | Alliés |
| `detailLevel` | `"full"` | Niveau |

#### Creator (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"person"` | Type |
| `birth` | string? | Naissance |
| `death` | string? | Décès |
| `hometown` | string? | Ville natale |
| `country` | string? | Pays |
| `issueCount` | number | Issues contributés |
| `aliases` | string[] | Alias |
| `gender` | string? | Genre |
| `website` | string? | Site web |
| `volumeCount` | number | Volumes travaillés |
| `characterCount` | number | Personnages créés |
| `createdCharacters` | `[{id, name}]` | Personnages créés |
| `detailLevel` | `"full"` | Niveau |

---

### A.17 Comics — Bedetheque

> **Recherche albums** : stratégie *series-first* — recherche AJAX des séries, puis récupération FlareSolverr des albums de chaque série (en parallèle). La recherche avancée Bedetheque nécessite des tokens CSRF impossibles à scraper directement.
>
> **`/detail/:id`** : endpoint intelligent qui teste d'abord en tant que série, puis en tant qu'album. Supporte `?type=serie|album` pour forcer le type.
>
> **`enrichCovers`** : paramètre optionnel sur les routes de recherche pour enrichir les résultats AJAX (sans images) avec les couvertures via FlareSolverr.
>
> **`url` param** : sur `/album/:id`, permet de passer l'URL Bedetheque directe pour éviter les erreurs de construction de slug (ex: noms composés, IDs ambigus).

#### Album (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"album"` | Type |
| `serie` | string? | Nom de la série |
| `tome` | string? | Numéro de tome |
| `authors` | `[{name, role}]` | Auteurs (scénariste, dessinateur, coloriste) |
| `publisher` | string? | Éditeur |
| `releaseDate` | string? | Date de sortie |
| `isbn` | string? | ISBN |
| `pages` | number? | Nombre de pages |
| `format` | string? | Format |
| `detailLevel` | `"full"` | Niveau |
| `language` | `"fr"` | Français |

#### Serie (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"serie"` | Type |
| `genre` | string? | Genre |
| `status` | string? | Statut |
| `numberOfAlbums` | number? | Nombre d'albums |
| `origin` | string? | Origine |
| `firstPublished` | string? | Date de première publication |
| `publisher` | string? | Éditeur |
| `authors` | array | Auteurs |
| `recommendations` | array | Recommandations |
| `detailLevel` | `"full"` | Niveau |

---

### A.18 TCG — Pokémon (TCGdex)

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string | Catégorie (Pokémon, Dresseur, Énergie — localisé) |
| `flavorText` | string? | Texte d'ambiance (natif dans la langue demandée) |
| `set` | `{name, code, series, releaseDate}` | Set (format uniforme) |
| `setLogo` | string? | URL logo du set |
| `setSymbol` | string? | URL symbole du set |
| `setTotal` | number? | Nombre total de cartes dans le set |
| `number` | string? | Numéro local dans le set |
| `cardNumber` | string | Format "number/total" |
| `supertype` | string | Catégorie (Pokemon, Trainer, Energy — localisé) |
| `subtypes` | string[] | Suffixe [V, EX, VMAX…] |
| `types` | string[] | Types élémentaires (localisés : Fire/Feu, Water/Eau…) |
| `hp` | string? | Points de vie |
| `rarity` | string? | Rareté (localisée) |
| `artist` | string? | Illustrateur |
| `stage` | string? | Stade d'évolution (Basic, Stage1, Stage2 — localisé) |
| `evolvesFrom` | string? | Évolue depuis |
| `evolvesTo` | string[] | (toujours vide — non fourni par TCGdex) |
| `attacks` | `[{name, cost, damage, effect}]` | Attaques |
| `abilities` | `[{name, effect, type}]` | Capacités |
| `weaknesses` | `[{type, value}]` | Faiblesses |
| `resistances` | `[{type, value}]` | Résistances |
| `retreatCost` | string[] | Coût de retraite (reconstitué depuis nombre) |
| `rules` | string[] | Règles spéciales |
| `regulationMark` | string? | Marque de régulation |
| `legalities` | `{standard, expanded}` | Légalités (booléens) |
| `nationalPokedexNumbers` | number[] | Numéros Pokédex |
| `prices` | `{currency, low, mid, high, market, source, updatedAt, variants, cardmarket}?` | Prix TCGPlayer + Cardmarket |
| `externalLinks` | `{tcgplayer, cardmarket}` | (null — TCGdex ne fournit pas de liens directs) |

> **Note images** : TCGdex ne fournit d'images que pour les langues d'impression physique. Un fallback automatique vers l'image EN est effectué quand l'image locale est absente (recherche : appel EN parallèle ; détail : second appel EN si `image` manquant). Résultat : ~87% d'images en FR contre ~70% sans fallback.

---

### A.19 TCG — MTG (Scryfall)

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string | Type line |
| `flavorText` | string? | Texte d'ambiance |
| `set` | `{name, code, series, releaseDate}` | Set (format uniforme) |
| `setId` | string? | ID du set Scryfall (extra MTG) |
| `setType` | string? | Type du set (extra MTG) |
| `setIconSvg` | string? | URL icône SVG du set (extra MTG) |
| `scryfallId` | string | ID Scryfall |
| `oracleId` | string? | ID Oracle |
| `multiverseIds` | number[] | IDs Multiverse |
| `collectorNumber` | string? | Numéro de collectionneur |
| `manaCost` | string? | Coût de mana (ex: `{2}{U}{B}`) |
| `cmc` | number | Coût converti |
| `typeLine` | string? | Ligne de type |
| `oracleText` | string? | Texte Oracle |
| `power` | string? | Force |
| `toughness` | string? | Endurance |
| `loyalty` | string? | Loyauté (planeswalkers) |
| `colors` | string[] | Couleurs (W, U, B, R, G) |
| `colorIdentity` | string[] | Identité de couleur |
| `rarity` | string? | common, uncommon, rare, mythic |
| `artist` | string? | Illustrateur |
| `cardFaces` | array? | Faces (cartes double-face) |
| `layout` | string? | normal, transform, modal_dfc… |
| `keywords` | string[] | Mots-clés (Flying, Trample…) |
| `legalities` | object | Légalités par format (standard, modern, legacy…) |
| `reserved` | boolean | Liste réservée |
| `foil` | boolean | Disponible en foil |
| `nonfoil` | boolean | Disponible en non-foil |
| `promo` | boolean | Promo |
| `reprint` | boolean | Réimpression |
| `digital` | boolean | Digital only |
| `lang` | string | Langue de l'impression |
| `printedName` | string? | Nom imprimé |
| `printedTypeLine` | string? | Type imprimé |
| `printedText` | string? | Texte imprimé |
| `prices` | `{usd, usdFoil, usdEtched, eur, eurFoil, eurEtched, tix, currency, source, updatedAt}` | Prix multi-devises |
| `externalLinks` | `{scryfall, tcgplayer, cardmarket, cardhoarder}` | Liens marchands |
| `rulings` | string? | URI des rulings |

---

### A.20 TCG — Yu-Gi-Oh!

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string | Type de carte |
| `type` | string | Type complet |
| `frameType` | string | normal, effect, ritual, fusion, synchro, xyz, link |
| `race` | string | Dragon, Spellcaster, Warrior… |
| `archetype` | string? | Archétype |
| `atk` | number? | Points d'attaque (monstres) |
| `def` | number? | Points de défense |
| `level` | number? | Niveau |
| `attribute` | string? | DARK, LIGHT, EARTH… |
| `linkval` | number? | Link Value (Link monsters) |
| `linkmarkers` | string[]? | Link Markers |
| `scale` | number? | Échelle Pendulum |
| `pendulumEffect` | string? | Effet Pendule |
| `set` | `{name, code, series, releaseDate}` | Set principal (format uniforme, dérivé du 1er cardSet) |
| `cardSets` | `[{name, code, rarity, rarityCode, price}]` | Tous les sets contenant la carte |
| `banlistInfo` | `{tcg, ocg, goat}?` | Statut banlist |
| `prices` | `{cardmarket, tcgplayer, ebay, amazon, coolstuffinc, currency, source, updatedAt}` | Prix |
| `externalLinks` | `{ygoprodeck, cardmarket, tcgplayer}` | Liens |

---

### A.21 TCG — Dragon Ball Super

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `collection` | string | "DBS Masters" ou "Fusion World" |
| `subtitle` | string | "card_type · card_color" |
| `internalId` | number | ID base locale |
| `game` | string | masters ou fusion_world |
| `cardNumber` | string | Numéro (BT1-001…) |
| `cardType` | string | LEADER, BATTLE, EXTRA… |
| `color` | string | Red, Blue, Green… |
| `rarity` | string | Rareté |
| `power` | string? | Puissance |
| `set` | `{name, code, series, releaseDate}` | Set (format uniforme) |
| `traits` | string[] | Traits |
| `character` | string[] | Personnages |
| `era` | string[] | Ères |
| `keywords` | string[] | Mots-clés |
| `energyCost` | string? | Coût en énergie |
| `comboCost` | string? | Coût combo |
| `comboPower` | string? | Puissance combo |
| `skillHtml` | string? | Texte compétence (HTML) |
| `skillText` | string? | Texte compétence (texte brut) |
| `back` | `{name, power, skillHtml, skillText, traits, character, era}?` | Face arrière |
| `bans` | `{isBanned, isLimited, limitedTo}` | Statut ban |
| `errata` | `{hasErrata, erratas}` | Erratas |
| `variants` | array | Variantes |

---

### A.22 TCG — Digimon

> **Source** : `digimoncard.io/api-public`
> **Images** : `https://images.digimoncard.io/images/cards/{id}.jpg` (construites côté normalizer, l'API ne fournit plus `image_url`)
> **Recherche** : paramètre `card={id}` pour le détail, `n={name}` pour la recherche

#### Traduction des noms JP/FR ↔ EN

L'API digimoncard.io utilise les noms anglais localisés (Omnimon, Gallantmon…) alors que les fans francophones utilisent les noms japonais originaux (Omegamon, Dukemon…). Un **dictionnaire bidirectionnel** (~150 entrées) assure la traduction automatique :

- **Recherche** (`lang≠en`) : le nom FR/JP est traduit en EN avant l'appel API
- **Affichage** (`lang≠en`) : le nom EN des résultats est traduit en FR/JP, avec `titleOriginal` indiquant le nom EN du jeu de cartes
- **3 stratégies de matching** : exact → préfixe (`Omegamon Zwart` → `Omnimon Zwart`) → suffixe (`BlackGatomon` → `BlackTailmon`)
- **Toujours actif** quand `lang≠en` (lookup dictionnaire instantané, pas de Google Translate)
- **Fichier** : `src/domains/tcg/utils/digimon-names.js`

```
GET /api/tcg/digimon/search?q=Omegamon&lang=fr  →  API: n=Omnimon  →  title: "Omegamon", titleOriginal: "Omnimon"
GET /api/tcg/digimon/card/BT1-084?lang=fr        →  API: card=BT1-084  →  title: "Omegamon", titleOriginal: "Omnimon"
GET /api/tcg/digimon/search?q=Omnimon&lang=en    →  API: n=Omnimon  →  title: "Omnimon" (pas de traduction)
```

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string | "Lv.X / Type / Attribute" |
| `cardNumber` | string | ID de la carte (ex: BT1-084) |
| `type` | string | Type de carte (Digimon, Tamer, Option, Digi-Egg) |
| `color` | string | Couleur primaire |
| `color2` | string? | Couleur secondaire |
| `stage` | string? | Stage (Rookie, Champion, Ultimate, Mega) |
| `level` | number? | Niveau |
| `attribute` | string? | Attribut (Vaccine, Virus, Data, Free) |
| `dp` | number? | Digimon Power |
| `playCost` | number? | Coût de jeu |
| `evolutionCost` | number? | Coût de digivolution |
| `evolutionLevel` | number? | Niveau requis pour digivolution |
| `evolutionColor` | string? | Couleur requise pour digivolution |
| `xrosRequirement` | string? | Prérequis DigiXros |
| `digiType` | string? | Types Digimon combinés (ex: "Holy Warrior / Royal Knight") |
| `form` | string? | Forme |
| `mainEffect` | string | Effet principal |
| `inheritedEffect` | string? | Effet hérité (source_effect) |
| `securityEffect` | string? | Effet sécurité (alt_effect) |
| `rarity` | string | Rareté |
| `set` | `{name, code, series, releaseDate}` | Set (name = premier set de `set_name[]`, code extrait de l'ID) |
| `illustrator` | string? | Artiste (champ `artist` de l'API) |
| `tcgplayerId` | number? | ID TCGPlayer |
| `externalLinks` | `{digimoncard}` | Lien vers digimoncard.io |

---

### A.23 TCG — Lorcana

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string | "version - type" |
| `flavorText` | string? | Texte d'ambiance |
| `name` | string | Nom |
| `version` | string | Version |
| `fullName` | string | Nom complet |
| `type` | string | Type (Personnage, Action, Objet, Lieu) |
| `subtypes` | string[] | Sous-types (Storyborn, Héros, Reine, Mage…) |
| `color` | string | Encre (Ambre, Améthyste, Émeraude, Rubis, Saphir, Acier) |
| `cost` | number | Coût en encre |
| `inkwell` | boolean | Peut produire de l'encre |
| `strength` | number? | Force (personnages) |
| `willpower` | number? | Volonté |
| `lore` | number? | Connaissance |
| `moveCost` | number? | Coût de déplacement (lieux) |
| `abilities` | `[{type, name, text, effect}]` | Capacités |
| `set` | `{name, code, series, releaseDate}` | Set (enrichi depuis métadonnées sets) |
| `cardNumber` | number | Numéro dans le set |
| `rarity` | string | Rareté |
| `foilTypes` | string[] | Types de foil disponibles (None, Silver…) |
| `artist` | string | Illustrateur(s) |
| `code` | string | Code carte |
| `fullIdentifier` | string | Identifiant complet ("40/204 • FR • 1") |
| `story` | string? | Franchise d'origine (La Reine des neiges, Raiponce…) |
| `legalities` | `{Core, Infinity}` | Légalité par format |
| `externalLinks` | `{lorcanajson, tcgplayer?, cardmarket?, cardTrader?}` | Liens externes (depuis LorcanaJSON) |

---

### A.24 TCG — One Piece

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string | "color / type / rarity" |
| `cardId` | string | ID de carte |
| `cardNumber` | string | Numéro |
| `type` | string | Leader, Character, Event, Stage… |
| `color` | string | Couleur |
| `rarity` | string | Rareté |
| `attribute` | string | Attribut |
| `cost` | number? | Coût |
| `power` | number? | Puissance |
| `counter` | number? | Compteur (champ source `cp`) |
| `life` | number? | Vie — Leaders (champ source `l`) |
| `effect` | string | Texte d'effet |
| `traits` | string? | Affiliations du personnage (ex: "Supernovas/Straw Hat Crew") |
| `set` | `{name, code, series, releaseDate}` | Set (format uniforme, depuis `srcN`/`srcD`) |
| `tags` | string[] | Tags |
| `externalLinks` | `{onePieceCardGame}` | Lien |

---

### A.25 Construction-Toys — Brickset

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | `"LEGO"` | Marque |
| `theme` | string? | Thème (Star Wars, City…) |
| `subtheme` | string? | Sous-thème |
| `themeGroup` | string? | Groupe de thèmes |
| `category` | string? | Catégorie |
| `set_number` | string? | Numéro de set |
| `pieces` | number? | Nombre de pièces |
| `minifigs` | number? | Nombre de minifigs |
| `ageRange` | `{min, max}?` | Tranche d'âge |
| `dimensions` | `{height, width, depth}?` | Dimensions |
| `price` | `{amount, currency}?` | Prix (priorité FR) |
| `pricesByRegion` | `{FR, US, UK, DE, CA}` | Prix par région |
| `availability` | string | available, coming_soon, retired… |
| `releaseDate` | string? | Date de disponibilité |
| `instructionsCount` | number | Nombre de notices |
| `instructionsUrl` | string? | URL instructions |
| `barcodes` | `{upc, ean}` | Codes-barres |
| `rating` | `{average, count}?` | Note communautaire |

---

### A.26 Construction-Toys — LEGO

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | `"LEGO"` | Marque |
| `theme` | string? | Thème |
| `subtheme` | string? | Sous-thème |
| `category` | string? | Catégorie |
| `set_number` | string | Numéro de set |
| `pieces` | number? | Nombre de pièces |
| `minifigs` | number? | Nombre de minifigs |
| `ageRange` | `{min, max}?` | Tranche d'âge |
| `price` | `{amount, currency, formatted}?` | Prix courant |
| `listPrice` | `{amount, currency, formatted}?` | Prix catalogue |
| `onSale` | boolean | En promotion |
| `salePercentage` | number? | % de réduction |
| `availability` | string | available, out_of_stock, coming_soon, retired |
| `availabilityText` | string? | Texte brut du statut |
| `canAddToBag` | boolean? | Ajout au panier possible |
| `isNew` | boolean | Nouveau produit |
| `releaseDate` | string? | Date de sortie |
| `instructions` | `{count, manuals: [{id, description, pdfUrl, sequence}], url}?` | Manuels d'instructions |
| `instructionsUrl` | string? | URL instructions |
| `sku` | string? | SKU interne |
| `slug` | string? | Slug produit |
| `rating` | `{average, count}?` | Note |
| `videos` | `{url, proxyUrl, filename}[]` | Vidéos produit avec proxy anti-rate-limit |

---

### A.27 Construction-Toys — Rebrickable

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | `"LEGO"` | Marque |
| `theme` | string? | Thème |
| `set_number` | string? | Numéro sans suffixe |
| `pieces` | number? | Nombre de pièces |
| `minifigs` | number? | Nombre de minifigs |
| `availability` | `"unknown"` | Statut |
| `releaseDate` | string? | Année de sortie |
| `parts` | `{totalCount, uniqueCount, spareCount, items: [{partNum, name, category, color, colorRgb, quantity, isSpare, imageUrl, elementId}]}?` | Pièces détaillées |
| `minifigsDetails` | `{count, items: [{figNum, name, quantity, numParts, imageUrl}]}?` | Minifigs détaillées |
| `rebrickable` | `{setNum, themeId, lastModified}` | Métadonnées |

---

### A.28 Construction-Toys — Mega Construx

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | `"MEGA"` | Marque |
| `category` | string? | pokemon, halo, hot-wheels… |
| `set_number` | string? | SKU |
| `pieces` | number? | Nombre de pièces |
| `sku` | string? | SKU produit |
| `franchise` | string? | Franchise détectée |
| `availability` | `{status: "archived", inStock: false}` | Archivé |
| `instructions` | `{count, manuals, url}?` | Instructions PDF |
| `instructionsUrl` | string? | URL du PDF |
| `metadata` | `{source, type, dataSource, archivedAt}` | Métadonnées |

---

### A.29 Construction-Toys — KRE-O

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | `"KRE-O"` | Marque |
| `theme` | string? | Sous-ligne |
| `category` | string? | Franchise |
| `set_number` | string? | Numéro |
| `pieces` | number? | Nombre de pièces |
| `minifigs` | number? | Nombre de Kreons |
| `franchise` | string? | Transformers, Battleship, G.I. Joe… |
| `subLine` | string? | Sous-ligne |
| `kreonsIncluded` | string[]? | Personnages inclus |
| `kreonsCount` | number? | Nombre de Kreons |
| `productType` | string | building_set, micro_changer, combiner… |
| `price` | number? | Prix retail |
| `availability` | `{status: "archived", inStock: false}` | Archivé |
| `instructions` | `{count, manuals, url}?` | Instructions PDF |
| `metadata` | `{source, type, dataSource, franchise, subLine, productType}` | Métadonnées |

---

### A.30 Construction-Toys — Klickypedia

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | `"Playmobil"` | Marque |
| `theme` | string? | Thème |
| `category` | string? | Format (Standard Box, Play Box…) |
| `set_number` | string | Code produit |
| `minifigs` | number? | Nombre de personnages |
| `ageRange` | object? | Tranche d'âge |
| `productCode` | string | Code produit |
| `ean` | string? | Code EAN |
| `translations` | `{fr, es, de, en}` | Noms traduits |
| `localizedName` | string | Nom dans la langue courante |
| `format` | string? | Format du set |
| `tags` | string[] | Tags communautaires |
| `released` | number? | Année de sortie |
| `discontinued` | number? | Année d'arrêt |
| `figureCount` | number? | Nombre de personnages |
| `instructions` | `{count, manuals, url}?` | Instructions |
| `metadata` | `{source, type, note}` | Métadonnées |

---

### A.31 Construction-Toys — Playmobil

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | `"Playmobil"` | Marque |
| `category` | string? | Catégorie |
| `category2` | string? | Catégorie secondaire |
| `theme` | string? | Thème |
| `set_number` | string? | Code produit |
| `pieces` | number? | Nombre de pièces |
| `minifigs` | number? | Nombre de personnages |
| `productCode` | string? | Code produit |
| `figureCount` | number? | Nombre de personnages |
| `price` | `{amount, currency, formatted}?` | Prix courant |
| `listPrice` | `{amount, currency, formatted}?` | Prix catalogue |
| `discountPrice` | `{amount, currency, formatted}?` | Prix réduit |
| `discount` | string? | Réduction |
| `onSale` | boolean | En promotion |
| `ageRange` | `{min, max}?` | Tranche d'âge |
| `availability` | string | Statut |
| `canAddToBag` | boolean | Ajout au panier |
| `inStock` | boolean | En stock |
| `instructions` | `{count, manuals, url}?` | Instructions |

---

### A.32 Boardgames — BGG

#### Game (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `alternateNames` | string[] | Noms multilingues |
| `players` | `{min, max}` | Nombre de joueurs |
| `playTime` | `{min, max, average}` | Temps de jeu (minutes) |
| `minAge` | number? | Âge minimum |
| `stats` | `{rating, numRatings, rank, complexity}` | Statistiques BGG |
| `categories` | string[] | Catégories |
| `mechanics` | string[] | Mécaniques de jeu |
| `designers` | string[] | Créateurs |
| `artists` | string[] | Illustrateurs |
| `publishers` | string[] | Éditeurs |

---

### A.33 Collectibles — Carddass

#### Card (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `cardNumber` | string? | Numéro de carte |
| `rarity` | string? | Rareté (Prism, Regular…) |
| `rarityColor` | string? | Couleur de rareté |
| `license` | string? | Licence (Dragon Ball…) |
| `collection` | string? | Collection |
| `series` | string? | Série |
| `hierarchy` | object? | Hiérarchie licence→collection→série complète |
| `extraImages` | `[{id, sourceId, label, thumbnail, hd}]` | Images supplémentaires |
| `packagings` | `[{id, sourceId, label, image}]` | Emballages |
| `dataSource` | `"database"` | Source |
| `originalSite` | string | animecollection.fr ou dbzcollection.fr |

---

### A.34 Collectibles — Coleka

#### Item (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `nameTranslated` | string? | Nom traduit |
| `descriptionOriginal` | string? | Description originale |
| `descriptionTranslated` | string? | Description traduite |
| `brand` | string? | Marque |
| `brands` | string[] | Toutes les marques |
| `manufacturer` | string? | Fabricant |
| `series` | string? | Collection/Série (dernier élément de la hiérarchie JSON-LD) |
| `subseries` | string? | Sous-série |
| `category` | string? | Catégorie (premier élément de la hiérarchie JSON-LD) |
| `collectionHierarchy` | string[]? | Hiérarchie complète (ex: `["Figurines de collection", "Star Wars", "Vintage Star Wars (Kenner)"]`) |
| `reference` | string? | Référence |
| `barcode` | string? | Code-barres |
| `condition` | `"unknown"` | État |
| `availability` | `"unknown"` | Disponibilité |
| `attributes` | object | Attributs dynamiques |

---

### A.35 Collectibles — Lulu-Berlu

#### Item (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `nameTranslated` | string? | Nom traduit |
| `descriptionOriginal` | string? | Description originale |
| `descriptionTranslated` | string? | Description traduite |
| `brand` | string? | Marque |
| `manufacturer` | string? | Fabricant |
| `category` | string? | Type |
| `reference` | string? | Référence |
| `condition` | string | new, good, fair, poor, used, unknown |
| `availability` | string | in_stock, preorder, out_of_stock, unknown |
| `pricing` | `{price, currency}?` | Prix en EUR |
| `attributes` | `{type, material, size, origin, condition_details}` | Attributs |

---

### A.36 Collectibles — Transformerland

#### Item (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `price` | number? | Prix |
| `currency` | string? | Devise |
| `availability` | string? | Disponibilité |
| `condition` | string? | État |
| `series` | string? | Série |
| `subgroup` | string? | Sous-groupe |
| `faction` | string? | Faction (Autobot, Decepticon…) |
| `size` | string? | Taille |
| `manufacturer` | string? | Fabricant |
| `instructions` | string[]? | Scans d'instructions de transformation (URLs images) |
| `specs` | string[]? | Scans de fiches techniques (URLs images) |
| `attributes` | object | Attributs libres |

---

### A.37 E-commerce — Amazon

#### Product (recherche)

| Champ | Type | Description |
|-------|------|-------------|
| `asin` | string | Identifiant Amazon |
| `marketplace` | string | Code pays (fr, us…) |
| `marketplaceName` | string | Amazon France, Amazon US… |
| `price` | number? | Prix numérique |
| `priceFormatted` | string? | Prix formaté (29,99 €) |
| `currency` | string | EUR, USD, GBP, JPY, CAD |
| `isPrime` | boolean | Éligible Prime |
| `rating` | number? | Note /5 |
| `reviewCount` | number? | Nombre d'avis |

#### Product (détail)

Mêmes champs que recherche + :

| Champ | Type | Description |
|-------|------|-------------|
| `ratingMax` | number | Toujours 5 |
| `brand` | string? | Marque |

#### Compare (comparaison multi-pays)

```json
{
  "asin": "B01N6CJ1QW",
  "comparison": [{
    "marketplace": { "code": "fr", "name": "Amazon France", "currency": "EUR" },
    "available": true,
    "price": { "value": 29.99, "currency": "EUR", "formatted": "29,99 €" },
    "isPrime": true,
    "url": "https://www.amazon.fr/dp/B01N6CJ1QW"
  }],
  "summary": {
    "total": 4,
    "available": 3,
    "cheapest": { "marketplace": "us", "price": 24.99 }
  }
}
```

---

### A.38 Sticker-Albums — Paninimania

#### Album (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `barcode` | string? | Code-barres |
| `copyright` | string? | Copyright |
| `releaseDate` | string? | Date de parution |
| `editor` | string? | Éditeur |
| `categories` | string[]? | Catégories |
| `checklist` | `{raw, total, items, totalWithSpecials}?` | Checklist de vignettes |
| `specialStickers` | `[{name, raw, total, list}]?` | Vignettes spéciales (dorées, brillantes…) |
| `additionalImages` | `[{url, caption}]?` | Images avec légendes |
| `articles` | string[]? | Articles liés |

---

### A.39 Books — Abandonware Magazines

#### Magazine (recherche / liste)

| Champ | Type | Description |
|-------|------|-------------|
| `position` | number | Position dans les résultats |

#### Magazine (détail)

| Champ | Type | Description |
|-------|------|-------------|
| `issueCount` | number | Nombre total de numéros |
| `issues` | `Issue[]` | Liste complète des numéros |

#### Issue (numéro)

| Champ | Type | Description |
|-------|------|-------------|
| `issueId` | number | ID du numéro |
| `issueNumber` | string | Numéro (ex: "001", "042") |
| `date` | string? | Date de parution (ex: "Janvier 1990") |
| `year` | number? | Année extraite de la date |
| `isCd` | boolean | Numéro avec CD inclus |
| `isHorsSerieOrSpecial` | boolean | Hors-série ou spécial |
| `images.cover` | string? | URL de la couverture |
| `filename` | string? | Nom du fichier (ex: "joystick_numero001.jpg") |

---

> **Tako API v2.7.0** — 39 providers, 12 domaines, 130 102 cartes archivées  
> Pour toute question, consultez le repo [Nimai26/Tako_Api](https://github.com/Nimai26/Tako_Api)
