# 📚 Tako API - Routes par Provider

> Documentation complète de toutes les routes disponibles par domaine et provider.
> 
> **Dernière mise à jour** : mars 2026 - **v2.7.0 — 39 providers, 12 domaines, ~265+ routes**  
> **Format** : Format B normalisé (noyau 11 clés + `details`)  
> **Endpoints discovery** : 19 (TMDB 7, Jikan 4, RAWG 2, IGDB 1, Deezer 1, iTunes 1)  
> **Cache** : PostgreSQL actif - 93% réduction latence  
> **Archives** : 130 102 cartes (Carddass 122 200 + DBS 7 902)

---

## 📖 Table des matières

1. [Comics / BD](#-comics--bd)
   - [ComicVine](#comicvine)
   - [Bedetheque](#bedetheque)
2. [Books / Livres](#-books--livres)
   - [OpenLibrary](#openlibrary)
   - [Google Books](#google-books)
   - [Abandonware Magazines](#abandonware-magazines)
3. [Construction Toys / Jouets de construction](#-construction-toys--jouets-de-construction)
   - [Brickset](#brickset)
   - [Rebrickable](#rebrickable)
   - [LEGO](#lego)
   - [Playmobil](#playmobil)
   - [Klickypedia](#klickypedia)
   - [MEGA](#mega)
   - [KRE-O](#kre-o)
4. [Anime & Manga](#-anime--manga)
   - [MangaUpdates](#mangaupdates)
   - [Jikan (MyAnimeList)](#jikan-myanimelist)
5. [Media / Films & Séries](#-media--films--séries)
   - [TMDB](#tmdb)
   - [TVDB](#tvdb)
6. [Videogames / Jeux vidéo](#-videogames--jeux-vidéo)
   - [IGDB](#igdb)
   - [RAWG](#rawg)
   - [JVC (JeuxVideo.com)](#jvc-jeuxvideocom)
   - [ConsoleVariations](#consolevariations)
7. [BoardGames / Jeux de société](#-boardgames--jeux-de-société)
   - [BoardGameGeek (BGG)](#boardgamegeek-bgg)
8. [Collectibles / Objets de collection](#-collectibles--objets-de-collection)
   - [Coleka](#coleka)
   - [Lulu-Berlu](#lulu-berlu)
   - [Transformerland](#transformerland)
   - [Carddass](#carddass)
9. [Sticker-Albums / Albums de vignettes](#-sticker-albums--albums-de-vignettes)
   - [Paninimania](#paninimania)
10. [TCG / Trading Card Games](#-tcg--trading-card-games)
    - [Pokémon TCG](#pokémon-tcg)
    - [Dragon Ball Super Card Game (DBS)](#dragon-ball-super-card-game-dbs)
    - [Magic: The Gathering (MTG)](#magic-the-gathering-mtg)
    - [Yu-Gi-Oh! TCG](#yu-gi-oh-tcg)
    - [Digimon TCG](#digimon-tcg)
    - [Lorcana TCG](#lorcana-tcg)
    - [One Piece TCG](#one-piece-tcg)
11. [Music / Musique](#-music--musique)
    - [Discogs](#discogs)
    - [Deezer](#deezer)
    - [MusicBrainz](#musicbrainz)
    - [iTunes](#itunes)
12. [E-commerce](#-e-commerce)
    - [Amazon](#amazon)
13. [Cache & Administration](#-cache--administration)
    - [Cache Admin](#cache-admin)

---

## 🦸 Comics / BD

### ComicVine

> **Base URL** : `/api/comics/comicvine`  
> **Source** : [comicvine.gamespot.com](https://comicvine.gamespot.com)  
> **API Key** : ✅ Requise (`COMICVINE_API_KEY`)  
> **Rate Limit** : 200 requêtes / 15 min

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale (tous types) | ✅ Fonctionne |
| `GET /search/volumes?q=` | Recherche de séries/volumes | ✅ Fonctionne |
| `GET /search/issues?q=` | Recherche de numéros | ✅ Fonctionne |
| `GET /search/characters?q=` | Recherche de personnages | ✅ Fonctionne |
| `GET /search/publishers?q=` | Recherche d'éditeurs | ✅ Fonctionne |
| `GET /search/creators?q=` | Recherche de créateurs (auteurs) | ✅ Fonctionne |
| `GET /volume/:id` | Détails d'un volume/série | ✅ Fonctionne |
| `GET /volume/:id/issues` | Issues d'un volume | ✅ Fonctionne |
| `GET /issue/:id` | Détails d'un issue | ✅ Fonctionne |
| `GET /character/:id` | Détails d'un personnage | ✅ Fonctionne |
| `GET /creator/:id` | Détails d'un créateur | ✅ Fonctionne |
| `GET /creator/:id/works` | Œuvres d'un créateur | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `maxResults` : Nombre max de résultats (défaut: 20, max: 100)
- `page` : Numéro de page (défaut: 1)
- `lang` : Langue cible pour traduction (fr, de, es, it, pt)
- `autoTrad` : Activer traduction automatique (1 ou true)

---

### Bedetheque

> **Base URL** : `/api/comics/bedetheque`  
> **Source** : [bedetheque.com](https://www.bedetheque.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : 1 requête / seconde  
> **Note** : Utilise FlareSolverr pour les pages protégées

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale (séries + auteurs) | ✅ Fonctionne |
| `GET /search/series?q=` | Recherche de séries | ✅ Fonctionne |
| `GET /search/authors?q=` | Recherche d'auteurs | ✅ Fonctionne |
| `GET /search/albums?q=` | Recherche d'albums (stratégie series-first) | ✅ Fonctionne |
| `GET /serie/:id` | Détails d'une série | ✅ Fonctionne |
| `GET /serie/:id/albums` | Albums d'une série | ✅ Fonctionne |
| `GET /author/:id/works` | Œuvres d'un auteur | ✅ Fonctionne |
| `GET /album/:id` | Détails d'un album | ✅ Fonctionne |
| `GET /detail/:id` | Auto-détection série ou album | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `maxResults` : Nombre max de résultats (défaut: 20)
- `lang` : Langue cible pour traduction
- `autoTrad` : Activer traduction automatique
- `enrichCovers` : Enrichir les résultats de recherche avec les couvertures via FlareSolverr (défaut: false)
- `url` : URL Bedetheque de l'album (pour `/album/:id`, évite les erreurs de slug)
- `type` : Forcer le type pour `/detail/:id` (`serie` ou `album`)

**Technologies** :
- API AJAX Bedetheque (autocomplete séries/auteurs)
- FlareSolverr (pages protégées anti-bot, scraping détails/albums)
- Stratégie *series-first* pour `searchAlbums` : recherche AJAX des séries → récupération parallèle des albums via FlareSolverr

---

## 📚 Books / Livres

### OpenLibrary

> **Base URL** : `/api/books/openlibrary`  
> **Source** : [openlibrary.org](https://openlibrary.org)  
> **API Key** : ❌ Non requise  
> **Rate Limit** : Aucun officiel (respecter usage raisonnable)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de livres | ✅ Fonctionne |
| `GET /search/author?author=` | Recherche de livres par auteur | ✅ Fonctionne |
| `GET /search/authors?q=` | Recherche d'auteurs (profils) | ✅ Fonctionne |
| `GET /author/:id` | Détails d'un auteur | ✅ Fonctionne |
| `GET /author/:id/works` | Œuvres d'un auteur | ✅ Fonctionne |
| `GET /:olId` | Détails d'un livre par ID OpenLibrary | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `limit` : Nombre de résultats (défaut: 20, max: 100)
- `offset` : Décalage pour pagination (défaut: 0)
- `lang` : Langue cible pour traduction
- `autoTrad` : Activer traduction automatique

**Endpoint auteurs** :
- Recherche d'auteurs : nom, biographie, nombre d'œuvres, note moyenne
- Détails auteur : bio complète, liens, photos, noms alternatifs
- Œuvres : liste paginée de toutes les œuvres avec sujets et couvertures

---

### Google Books

> **Base URL** : `/api/books/googlebooks`  
> **Source** : [books.google.com](https://books.google.com)  
> **API Key** : ⚠️ Optionnelle (`GOOGLE_BOOKS_API_KEY`) - Augmente les quotas  
> **Rate Limit** : 1000 requêtes/jour (sans clé), plus avec clé

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de livres | ✅ Fonctionne |
| `GET /search/author?author=` | Recherche de livres par auteur | ✅ Fonctionne |
| `GET /:volumeId` | Détails d'un livre par ID Google | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `maxResults` : Nombre de résultats (défaut: 20, max: 40)
- `startIndex` : Index de départ pour pagination
- `lang` : Langue cible pour traduction
- `autoTrad` : Activer traduction automatique

**⚠️ Limitations Google Books** :
- Pas d'endpoint `/authors` ou `/search/authors` - l'API Google Books ne supporte pas les entités auteurs
- Les auteurs sont de simples chaînes de texte dans les métadonnées des livres
- Pour rechercher les profils d'auteurs avec biographies et listes d'œuvres, utiliser **OpenLibrary**

---

### Abandonware Magazines

> **Base URL** : `/api/books/abandonware`  
> **Source** : [abandonware-magazines.org](https://www.abandonware-magazines.org)  
> **API Key** : ❌ Non requise  
> **Rate Limit** : Non spécifié  
> **Type** : API native (format texte propriétaire)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de magazines par nom | ✅ Fonctionne |
| `GET /magazines` | Liste de tous les magazines (paginé) | ✅ Fonctionne |
| `GET /magazine/:id` | Détails d'un magazine avec tous ses numéros | ✅ Fonctionne |
| `GET /magazine/:id/issues` | Numéros d'un magazine (paginé) | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (pour /search)
- `limit` / `maxResults` : Nombre max de résultats (défaut: 20, max: 100)
- `page` : Numéro de page (défaut: 1)
- `pageSize` : Résultats par page pour /magazines et /issues (défaut: 50, max: 200)

**Contenu** :
- 602+ magazines français numérisés (informatique, jeux vidéo, BD, etc.)
- Chaque magazine contient ses numéros avec couvertures, dates et métadonnées
- Logos des magazines générés automatiquement
- Support hors-série et numéros spéciaux (CD)

```bash
# Recherche de magazines
curl "https://tako.snowmanprod.fr/api/books/abandonware/search?q=joystick"

# Liste de tous les magazines (602+)
curl "https://tako.snowmanprod.fr/api/books/abandonware/magazines?page=1&limit=50"

# Détails du magazine Joystick (id 31, 464 numéros)
curl "https://tako.snowmanprod.fr/api/books/abandonware/magazine/31"

# Numéros paginés
curl "https://tako.snowmanprod.fr/api/books/abandonware/magazine/31/issues?page=2&limit=20"
```

---

## 🧱 Construction Toys / Jouets de construction

### Brickset

> **Base URL** : `/construction-toys/brickset`  
> **Source** : [brickset.com](https://brickset.com)  
> **API Key** : ✅ Requise (`BRICKSET_API_KEY`)  
> **Rate Limit** : Non spécifié

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de sets LEGO | ✅ Fonctionne |
| `GET /themes` | Liste des thèmes | ✅ Fonctionne |
| `GET /themes/:theme/subthemes` | Sous-thèmes d'un thème | ✅ Fonctionne |
| `GET /years` | Liste des années | ✅ Fonctionne |
| `GET /recently-updated` | Sets récemment mis à jour | ✅ Fonctionne |
| `GET /sets/:id` | Détails d'un set | ✅ Fonctionne |

**Paramètres de recherche** :
- `q` : Terme de recherche
- `theme` : Filtrer par thème
- `year` : Filtrer par année
- `pageSize` : Nombre de résultats par page
- `pageNumber` : Numéro de page

---

### Rebrickable

> **Base URL** : `/construction-toys/rebrickable`  
> **Source** : [rebrickable.com](https://rebrickable.com)  
> **API Key** : ✅ Requise (`REBRICKABLE_API_KEY`)  
> **Rate Limit** : 1 requête / seconde

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de sets | ✅ Fonctionne |
| `GET /themes` | Liste des thèmes | ✅ Fonctionne |
| `GET /colors` | Liste des couleurs | ✅ Fonctionne |
| `GET /parts?q=` | Recherche de pièces | ✅ Fonctionne |
| `GET /minifigs?q=` | Recherche de minifigs | ✅ Fonctionne |
| `GET /sets/:id` | Détails d'un set | ✅ Fonctionne |
| `GET /sets/:id/parts` | Pièces d'un set | ✅ Fonctionne |
| `GET /sets/:id/minifigs` | Minifigs d'un set | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `theme_id` : Filtrer par thème
- `min_year` / `max_year` : Filtrer par année
- `page` : Numéro de page
- `page_size` : Taille de page (max: 1000)

---

### LEGO

> **Base URL** : `/construction-toys/lego`  
> **Source** : [lego.com](https://www.lego.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : Respecter délais raisonnables  
> **Note** : Utilise FlareSolverr

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de sets | ✅ Fonctionne |
| `GET /instructions/:productId` | Instructions PDF | ✅ Fonctionne |
| `GET /proxy/video?url=` | Proxy vidéo CDN (anti-429) | ✅ Fonctionne |
| `GET /:id` | Détails d'un set par numéro | ✅ Fonctionne |

**Paramètres** :
- `q` : Terme de recherche
- `maxResults` : Nombre max de résultats

---

### Playmobil

> **Base URL** : `/construction-toys/playmobil`  
> **Source** : [playmobil.fr](https://www.playmobil.fr)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : ~18s par requête (FlareSolverr)  
> **Note** : Utilise FlareSolverr - Temps de réponse élevé

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de sets | ✅ Fonctionne |
| `GET /instructions/:productId` | Instructions PDF | ✅ Fonctionne |
| `GET /:id` | Détails d'un set | ✅ Fonctionne |

**Paramètres** :
- `q` : Terme de recherche
- `maxResults` : Nombre max de résultats

---

### Klickypedia

> **Base URL** : `/construction-toys/klickypedia`  
> **Source** : [klickypedia.com](https://www.klickypedia.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : Respecter délais raisonnables

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de sets Playmobil | ✅ Fonctionne |
| `GET /instructions/:id` | Instructions PDF | ✅ Fonctionne |
| `GET /:id` | Détails d'un set | ✅ Fonctionne |

**Paramètres** :
- `q` : Terme de recherche
- `maxResults` : Nombre max de résultats

---

### MEGA

> **Base URL** : `/construction-toys/mega`  
> **Source** : [megabrands.com](https://megabrands.com)  
> **API Key** : ❌ Non requise (API Searchspring)  
> **Rate Limit** : Non spécifié

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de sets MEGA | ✅ Fonctionne |
| `GET /instructions/:sku` | Instructions PDF par SKU | ✅ Fonctionne |
| `GET /:id` | Détails d'un set | ✅ Fonctionne |

**Paramètres** :
- `q` : Terme de recherche
- `maxResults` : Nombre max de résultats (défaut: 20)

---

### KRE-O

> **Base URL** : `/api/construction-toys/kreo`  
> **Source** : Archive Hasbro (2011-2017)  
> **API Key** : ❌ Non requise (base de données locale)  
> **Note** : Données d'archive. Source PostgreSQL + MinIO (images/PDFs)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check (vérifie BDD + MinIO) | ✅ Fonctionne |
| `GET /search?q=` | Recherche plein texte dans l'archive | ✅ Fonctionne |
| `GET /franchises` | Liste des franchises avec comptage | ✅ Fonctionne |
| `GET /franchise/:name` | Produits filtrés par franchise | ✅ Fonctionne |
| `GET /sublines` | Sous-lignes disponibles avec comptages | ✅ Fonctionne |
| `GET /file/:setNumber/image` | Redirect 301 vers image statique MinIO | ✅ Fonctionne |
| `GET /:id` | Détails d'un produit (par numéro de set) | ✅ Fonctionne |

**Paramètres** :
- `q` : Terme de recherche (requis pour /search)
- `page` : Numéro de page (défaut: 1)
- `pageSize` : Résultats par page (défaut: 20, max: 100)
- `franchise` : Filtre par franchise (transformers, battleship, gi-joe…)
- `subLine` : Filtre par sous-ligne

---

## 🎌 Anime & Manga

### MangaUpdates

> **Base URL** : `/api/anime-manga/mangaupdates`  
> **Source** : [mangaupdates.com](https://www.mangaupdates.com)  
> **API Key** : ❌ Non requise  
> **Rate Limit** : Raisonnable (non documenté)  
> **Note** : Pas de filtrage NSFW, base de données manga complète

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de séries manga | ✅ Fonctionne |
| `GET /search/authors?q=` | Recherche d'auteurs | ✅ Fonctionne |
| `GET /search/publishers?q=` | Recherche d'éditeurs | ✅ Fonctionne |
| `GET /series/:id` | Détails d'une série | ✅ Fonctionne |
| `GET /series/:id/recommendations` | Recommandations pour une série | ✅ Fonctionne |
| `GET /author/:id` | Détails d'un auteur | ✅ Fonctionne |
| `GET /author/:id/works` | Œuvres d'un auteur | ✅ Fonctionne |
| `GET /genres` | Liste des genres avec statistiques | ✅ Fonctionne |
| `GET /releases` | Dernières sorties de chapitres | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `maxResults` : Nombre max de résultats (défaut: 20)
- `page` : Numéro de page (défaut: 1)
- `lang` : Langue cible pour traduction (fr, de, es, it, pt)
- `autoTrad` : Activer traduction automatique (1 ou true)
- `frenchTitle` : Rechercher le titre français via Nautiljon (1 ou true)

**Paramètres spécifiques** :
- `/search` : `type` (manga, manhwa, manhua, etc.), `year`, `genre`
- `/releases` : `maxResults` (défaut: 20)

**Fonctionnalités** :
- **Titre français** : Recherche automatique du titre français via Nautiljon.com
- **Traduction** : Descriptions traduites automatiquement en français
- **Pas de filtrage NSFW** : Contrairement à Jikan/MangaDex, accès à tout le catalogue

---

### Jikan (MyAnimeList)

> **Base URL** : `/api/anime-manga/jikan`  
> **Source** : [jikan.moe](https://jikan.moe) (API non-officielle MyAnimeList)  
> **API Key** : ❌ Non requise  
> **Rate Limit** : 3 req/sec, 60 req/min  
> **⚠️ AUCUN FILTRAGE NSFW** : Contenu adulte/hentai inclus (`sfw=false` toujours actif)

| Endpoint | Description | Status |
|----------|-------------|--------|
| **Recherche** | | |
| `GET /health` | Health check avec liste des fonctionnalités | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale (anime + manga) | ✅ Fonctionne |
| `GET /search/anime?q=` | Recherche anime uniquement | ✅ Fonctionne |
| `GET /search/manga?q=` | Recherche manga uniquement | ✅ Fonctionne |
| `GET /search/characters?q=` | Recherche de personnages | ✅ Fonctionne |
| `GET /search/people?q=` | Recherche de personnes (seiyuu, staff) | ✅ Fonctionne |
| `GET /search/producers?q=` | Recherche de studios/producteurs | ✅ Fonctionne |
| **Anime** | | |
| `GET /anime/:id` | Détails complets d'un anime | ✅ Fonctionne |
| `GET /anime/:id/episodes` | Liste des épisodes | ✅ Fonctionne |
| `GET /anime/:id/characters` | Personnages et doubleurs | ✅ Fonctionne |
| `GET /anime/:id/staff` | Staff de production | ✅ Fonctionne |
| `GET /anime/:id/recommendations` | Anime similaires | ✅ Fonctionne |
| `GET /anime/random` | Anime aléatoire | ✅ Fonctionne |
| **Manga** | | |
| `GET /manga/:id` | Détails complets d'un manga | ✅ Fonctionne |
| `GET /manga/:id/characters` | Personnages du manga | ✅ Fonctionne |
| `GET /manga/:id/recommendations` | Manga similaires | ✅ Fonctionne |
| `GET /manga/random` | Manga aléatoire | ✅ Fonctionne |
| **Saisons** | | |
| `GET /seasons` | Liste des saisons disponibles | ✅ Fonctionne |
| `GET /seasons/now` | Anime de la saison en cours | ✅ Fonctionne |
| `GET /seasons/:year/:season` | Anime d'une saison spécifique | ✅ Fonctionne |
| **Classements** | | |
| `GET /top/anime` | Top anime (par score MAL) | ✅ Fonctionne |
| `GET /top/manga` | Top manga (par score MAL) | ✅ Fonctionne |
| `GET /top` | **Top anime/manga (🆕)** | ✅ Fonctionne |
| `GET /trending` | **Anime de la saison en cours (🆕)** | ✅ Fonctionne |
| `GET /trending/anime` | **Trending tous anime (🆕)** | ✅ Fonctionne |
| `GET /trending/tv` | **Trending séries animées (🆕)** | ✅ Fonctionne |
| `GET /trending/movie` | **Trending films animés (🆕)** | ✅ Fonctionne |
| `GET /top/tv` | **Top séries animées (🆕)** | ✅ Fonctionne |
| `GET /top/movie` | **Top films animés (🆕)** | ✅ Fonctionne |
| `GET /upcoming` | **Anime à venir prochaine saison (🆕 Phase 4)** | ✅ Fonctionne |
| `GET /schedule` | **Planning de diffusion unifié (🆕 Phase 4)** | ✅ Fonctionne |
| **Plannings** | | |
| `GET /schedules` | Programme complet de diffusion | ✅ Fonctionne |
| `GET /schedules/:day` | Programme d'un jour spécifique | ✅ Fonctionne |
| **Genres** | | |
| `GET /genres/anime` | Liste des genres anime | ✅ Fonctionne |
| `GET /genres/manga` | Liste des genres manga | ✅ Fonctionne |
| **Entités** | | |
| `GET /characters/:id` | Détails d'un personnage | ✅ Fonctionne |
| `GET /people/:id` | Détails d'une personne | ✅ Fonctionne |
| `GET /producers/:id` | Détails d'un studio/producteur | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `limit` : Nombre max de résultats (défaut: 25, max: 25)
- `page` : Numéro de page (défaut: 1)
- `lang` : Langue cible pour traduction (fr, de, es, it, pt)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Paramètres de recherche anime/manga** :
- `type` : Type (tv, movie, ova, special, ona, music pour anime / manga, novel, lightnovel, oneshot, doujin, manhwa, manhua)
- `score` : Score minimum (1-10)
- `status` : Statut (airing, complete, upcoming pour anime / publishing, complete, hiatus, discontinued)
- `rating` : Classification (g, pg, pg13, r17, r, rx)
- `genres` : IDs de genres (ex: 1,2,3)
- `orderBy` : Tri (mal_id, title, start_date, end_date, episodes, score, scored_by, rank, popularity, members, favorites)
- `sort` : Direction (asc, desc)

**Paramètres saisons** :
- `:year` : Année (ex: 2024)
- `:season` : Saison (winter, spring, summer, fall)
- `filter` : Filtre (tv, movie, ova, special, ona, music)

**Paramètres top** :
- `filter` : Filtre (airing, upcoming, bypopularity, favorite)
- `type` : Type de contenu

**Paramètres top/trending** (🆕) :
- `type` : Type (`anime` ou `manga`, défaut: `anime`)
- `filter` : Filtre (`bypopularity`, `favorite`, `airing`, `publishing`)
- `subtype` : Sous-type (tv, movie, ova, special pour anime / manga, novel, lightnovel pour manga)
- `sfw` : Filtre contenu (`all` défaut, `sfw`/`true`/`1` = sans hentai, `nsfw`/`false`/`0` = hentai uniquement)
- `limit` : Nombre de résultats (défaut: 25, max: 25)
- `page` : Numéro de page (défaut: 1)
- `lang` : Langue pour traduction
- `autoTrad` : Activer traduction auto (1 ou true)

**Paramètres upcoming/schedule** (🆕 Phase 4) :
- `day` : Jour de la semaine (monday, tuesday, wednesday, thursday, friday, saturday, sunday, unknown, other) - uniquement pour /schedule
- `filter` : Filtre par type (tv, movie, ova, special, ona, music) - optionnel
- `limit` : Nombre de résultats (défaut: 25, max: 25)
- `page` : Numéro de page (défaut: 1)
- `lang` : Langue pour traduction
- `autoTrad` : Activer traduction auto (1 ou true)

**Exemples top/trending** (🆕) :
```bash
# Top anime par popularité
GET /api/anime-manga/jikan/top?type=anime&filter=bypopularity&limit=10

# Top manga par favoris
GET /api/anime-manga/jikan/top?type=manga&filter=favorite

# Anime trending de la saison en cours
GET /api/anime-manga/jikan/trending?limit=20

# Anime d'une saison spécifique
GET /api/anime-manga/jikan/seasons/2024/winter?filter=tv

# Avec traduction automatique
GET /api/anime-manga/jikan/top?type=anime&filter=bypopularity&autoTrad=1&lang=fr
```

**Exemples upcoming/schedule** (🆕 Phase 4) :
```bash
# Anime à venir prochaine saison (627 anime)
GET /api/anime-manga/jikan/upcoming?limit=10

# Anime à venir filtrés par type TV
GET /api/anime-manga/jikan/upcoming?filter=tv&limit=20

# Planning des anime diffusés le lundi
GET /api/anime-manga/jikan/schedule?day=monday&limit=15

# Planning du vendredi avec traduction
GET /api/anime-manga/jikan/schedule?day=friday&autoTrad=1&lang=fr

# Tous les anime du planning (tous les jours)
GET /api/anime-manga/jikan/schedule?day=unknown&limit=25
```

**Paramètres schedules** :
- `:day` : Jour (monday, tuesday, wednesday, thursday, friday, saturday, sunday, unknown)

**Classification des âges** :
| Code | Description | Âge min |
|------|-------------|---------|
| g | Tous publics | 0 |
| pg | Enfants | 0 |
| pg13 | Ados 13+ | 13 |
| r17 | Violence/Langage 17+ | 17 |
| r | Nudité légère | 17 |
| rx | Hentai | 18 |

**⚠️ Note importante sur le contenu adulte** :
- Cette API n'applique **AUCUN filtrage** sur le contenu adulte (hentai, ecchi, etc.)
- Le paramètre `sfw=false` est **toujours utilisé** côté serveur
- Tous les genres et classifications sont accessibles, y compris Rx (Hentai)
- Idéal pour les applications qui nécessitent un catalogue complet sans censure

---

### Nautiljon (Volumes Manga)

> **Base URL** : `/api/anime-manga/nautiljon`  
> **Source** : [nautiljon.com](https://www.nautiljon.com)  
> **API Key** : ❌ Non requise (scraping HTML)  
> **Rate Limit** : 1 req/sec  
> **Note** : Données par volume manga (ISBN, pages, prix, chapitres, couvertures FR/JP)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check avec latence | ✅ Fonctionne |
| `GET /search?q=` | Recherche de séries manga | ✅ Fonctionne |
| `GET /series/:slug` | Détails d'une série (genres, thèmes, auteurs, éditeurs, liste volumes) | ✅ Fonctionne |
| `GET /series/:slug/volumes` | Liste paginée des volumes avec couvertures | ✅ Fonctionne |
| `GET /series/:slug/volume/:volumeId?name=` | Détail volume (ISBN, pages, prix, dates, chapitres) | ✅ Fonctionne |

**Paramètres** :
- `q` : Terme de recherche (requis pour /search)
- `:slug` : Slug Nautiljon de la série (ex: `one+piece`, `naruto`)
- `:volumeId` : ID numérique du volume sur Nautiljon
- `name` : Numéro/nom du volume (requis pour /volume/:volumeId)
- `volume` : Filtrer par numéro de volume (pour /search/volumes)
- `maxResults` : Nombre max de résultats (défaut 50)

**Données volume** :
- ISBN/EAN, nombre de pages, prix (€ et ¥)
- Dates de parution VF et VO
- Éditeurs VF (ex: Glénat, Kana) et VO (ex: Shueisha)
- Couvertures FR et JP
- Liste des chapitres avec titres français
- Édition (standard, collector, etc.)

**Exemples** :
```bash
# Recherche manga
GET /api/anime-manga/nautiljon/search?q=one+piece

# Recherche → volumes directement (l'app reçoit des volumes, pas des séries)
GET /api/anime-manga/nautiljon/search/volumes?q=naruto

# Filtrer un volume spécifique
GET /api/anime-manga/nautiljon/search/volumes?q=naruto&volume=5

# Détails série
GET /api/anime-manga/nautiljon/series/one+piece

# Liste des volumes
GET /api/anime-manga/nautiljon/series/one+piece/volumes

# Détail du volume 1
GET /api/anime-manga/nautiljon/series/one+piece/volume/98?name=1
```

---

## 🎬 Media / Films & Séries

### TMDB

> **Base URL** : `/api/media/tmdb`  
> **Source** : [themoviedb.org](https://www.themoviedb.org)  
> **API Key** : ✅ Requise (`TMDB_API_KEY` ou `TMDB_KEY`)  
> **Rate Limit** : ~40 requêtes / 10 secondes

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale (films + séries) | ✅ Fonctionne |
| `GET /search/movies?q=` | Recherche de films | ✅ Fonctionne |
| `GET /search/series?q=` | Recherche de séries TV | ✅ Fonctionne |
| `GET /movies/:id` | Détails d'un film | ✅ Fonctionne |
| `GET /series/:id` | Détails d'une série | ✅ Fonctionne |
| `GET /series/:id/season/:n` | Détails d'une saison | ✅ Fonctionne |
| `GET /series/:id/season/:n/episode/:e` | Détails d'un épisode | ✅ Fonctionne |
| `GET /collections/:id` | Détails d'une saga/collection | ✅ Fonctionne |
| `GET /persons/:id` | Détails d'une personne | ✅ Fonctionne |
| `GET /directors/:id/movies` | Filmographie d'un réalisateur | ✅ Fonctionne |
| `GET /discover/movies` | Découvrir des films par critères | ✅ Fonctionne |
| `GET /trending` | **Films/séries trending** (🆕) | ✅ Fonctionne |
| `GET /popular` | **Films/séries populaires** (🆕) | ✅ Fonctionne |
| `GET /top-rated` | **Films/séries les mieux notés** (🆕) | ✅ Fonctionne |
| `GET /upcoming` | **Films/séries à venir** (🆕 Phase 4) | ✅ Fonctionne |
| `GET /on-the-air` | **Séries avec nouveaux épisodes** (🆕 Phase 4) | ✅ Fonctionne |
| `GET /airing-today` | **Séries diffusées aujourd'hui** (🆕 Phase 4) | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `pageSize` : Nombre max de résultats (défaut: 20)
- `page` : Numéro de page
- `lang` : Langue (défaut: fr-FR)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Paramètres discover** :
- `genre` : ID de genre TMDB
- `year` : Année de sortie
- `sort` : Tri (popularity.desc, vote_average.desc, release_date.desc)

**Paramètres trending/popular/top-rated** (🆕) :
- `category` : Type de contenu (`movie` ou `tv`, défaut: `movie`)
- `period` : Période trending (`day` ou `week`, défaut: `week`) - uniquement pour /trending
- `limit` : Nombre de résultats (défaut: 20, max: 100)
- `page` : Numéro de page (défaut: 1)
- `lang` : Langue (défaut: fr-FR)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Paramètres upcoming/on-the-air/airing-today** (🆕 Phase 4) :
- `category` : Type de contenu (`movie` ou `tv`) - uniquement pour /upcoming
- `limit` : Nombre de résultats (défaut: 20, max: 100)
- `page` : Numéro de page (défaut: 1)
- `lang` : Langue (défaut: fr-FR)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Exemples trending/popular/top-rated** (🆕) :
```bash
# Films trending de la semaine
GET /api/media/tmdb/trending?category=movie&period=week&limit=10

# Séries trending du jour
GET /api/media/tmdb/trending?category=tv&period=day

# Films populaires
GET /api/media/tmdb/popular?category=movie&limit=20

# Séries les mieux notées
GET /api/media/tmdb/top-rated?category=tv&limit=30

# Avec traduction automatique
GET /api/media/tmdb/trending?category=movie&period=week&autoTrad=1&lang=fr
```

**Exemples upcoming/on-the-air/airing-today** (🆕 Phase 4) :
```bash
# Films à venir (956 films)
GET /api/media/tmdb/upcoming?category=movie&limit=10

# Séries à venir jamais diffusées (388 séries)
GET /api/media/tmdb/upcoming?category=tv&limit=20

# Séries avec nouveaux épisodes dans les 7 prochains jours (1225 séries)
GET /api/media/tmdb/on-the-air?limit=15

# Séries diffusées aujourd'hui
GET /api/media/tmdb/airing-today?limit=10

# Avec traduction automatique
GET /api/media/tmdb/upcoming?category=movie&autoTrad=1&lang=fr
```

**Données retournées** :
- **Films** : titre, synopsis, genres, durée, budget, revenus, cast, crew, collection, images
- **Séries** : titre, synopsis, saisons, épisodes, networks, status, créateurs
- **Saisons** : numéro, nom, synopsis, date, épisodes avec détails
- **Épisodes** : titre, synopsis, date, durée, crew, guest stars
- **Collections** : nom, synopsis, films ordonnés avec posters
- **Personnes** : nom, bio, filmographie, photos

---

### TVDB

> **Base URL** : `/api/media/tvdb`  
> **Source** : [thetvdb.com](https://thetvdb.com)  
> **API Key** : ✅ Requise (`TVDB_API_KEY` ou `TVDB_KEY`)  
> **Rate Limit** : Non spécifié  
> **Note** : Authentification Bearer Token (validité 25 jours)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale (films, séries, personnes, listes) | ✅ Fonctionne |
| `GET /search/movies?q=` | Recherche de films | ✅ Fonctionne |
| `GET /search/series?q=` | Recherche de séries | ✅ Fonctionne |
| `GET /movies/:id` | Détails d'un film | ✅ Fonctionne |
| `GET /series/:id` | Détails d'une série | ✅ Fonctionne |
| `GET /series/:id/seasons` | Liste des saisons d'une série | ✅ Fonctionne |
| `GET /seasons/:id` | Détails d'une saison (par ID TVDB) | ✅ Fonctionne |
| `GET /series/:id/episodes` | Épisodes d'une série | ✅ Fonctionne |
| `GET /episodes/:id` | Détails d'un épisode (par ID TVDB) | ✅ Fonctionne |
| `GET /lists/:id` | Détails d'une liste/saga | ✅ Fonctionne |
| `GET /persons/:id` | Détails d'une personne | ✅ Fonctionne |
| `GET /directors/:id/works` | Filmographie d'un réalisateur | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `type` : Type de contenu (series, movie, person, company)
- `pageSize` : Nombre max de résultats (défaut: 20, max: 50)
- `lang` : Code langue ISO 639-1 (fr, en, de...) - converti automatiquement en ISO 639-2
- `autoTrad` : Activer traduction automatique (1 ou true)

**Traductions natives** :
- TVDB supporte les traductions directement via le paramètre `lang`
- L'autoTrad sert de fallback si la traduction native n'existe pas

**Différences avec TMDB** :
- Les saisons et épisodes ont des IDs TVDB uniques (accès direct sans seriesId)
- Les listes TVDB permettent de regrouper des contenus (sagas, franchises)
- Artworks plus variés (posters, banners, fanarts, clearlogos)

**Données retournées** :
- **Films** : titre, synopsis, année, durée, status, artworks, cast, genres
- **Séries** : titre, synopsis, années, saisons (Aired Order), networks, status
- **Saisons** : numéro, nom, synopsis, épisodes complets
- **Épisodes** : titre, synopsis, date, durée, réalisateurs, scénaristes, guests
- **Personnes** : nom, bio, date naissance, characters (filmographie)
- **Listes** : nom, description, entités (films/séries)

---

## � Videogames / Jeux vidéo

### IGDB

> **Base URL** : `/api/videogames/igdb`  
> **Source** : [igdb.com](https://www.igdb.com)  
> **API Key** : ✅ Requise (OAuth2 via Twitch - `IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET`)  
> **Rate Limit** : 4 requêtes / seconde

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de jeux | ✅ Fonctionne |
| `GET /advanced-search` | Recherche avancée avec filtres | ✅ Fonctionne |
| `GET /game/:id` | Détails d'un jeu par ID | ✅ Fonctionne |
| `GET /game/slug/:slug` | Détails d'un jeu par slug | ✅ Fonctionne |
| `GET /genres` | Liste des genres disponibles | ✅ Fonctionne |
| `GET /platforms` | Liste des plateformes | ✅ Fonctionne |
| `GET /themes` | Liste des thèmes | ✅ Fonctionne |
| `GET /game-modes` | Liste des modes de jeu | ✅ Fonctionne |
| `GET /player-perspectives` | Liste des perspectives | ✅ Fonctionne |
| `GET /companies/search?q=` | Recherche de compagnies | ✅ Fonctionne |
| `GET /companies/:id` | Détails d'une compagnie | ✅ Fonctionne |
| `GET /companies/:id/games/developed` | Jeux développés | ✅ Fonctionne |
| `GET /companies/:id/games/published` | Jeux publiés | ✅ Fonctionne |
| `GET /franchises/search?q=` | Recherche de franchises | ✅ Fonctionne |
| `GET /franchises/:id` | Détails d'une franchise | ✅ Fonctionne |
| `GET /collections/:id` | Détails d'une collection | ✅ Fonctionne |
| `GET /top-rated` | Jeux les mieux notés | ✅ Fonctionne |
| `GET /popular` | **Jeux populaires (🆕)** | ✅ Fonctionne |
| `GET /recent-releases` | Sorties récentes | ✅ Fonctionne |
| `GET /upcoming` | **Jeux à venir** (🆕 Phase 4) | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `limit` : Nombre max de résultats (défaut: 20, max: 500)
- `offset` : Position de départ (pagination)
- `lang` : Langue cible pour traduction (fr, de, es, it, pt)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Paramètres popular** (🆕) :
- `limit` : Nombre de résultats (défaut: 20, max: 100)
- `offset` : Décalage pour pagination
- `platforms` : IDs de plateformes (ex: "6,48,49" pour PC, PS4, Xbox One)
- `genres` : IDs de genres (ex: "4,5,12" pour Fighting, Shooter, RPG)
- `lang` : Langue pour traduction
- `autoTrad` : Activer traduction (1 ou true)

**Paramètres upcoming** (🆕 Phase 4) :
- `limit` : Nombre de résultats (défaut: 20)
- `offset` : Décalage pour pagination
- `platforms` : IDs de plateformes (ex: "6,48,49" pour PC, PS4, Xbox One)
- `lang` : Langue pour traduction
- `autoTrad` : Activer traduction (1 ou true)

**Exemples popular** (🆕) :
```bash
# Jeux populaires (triés par nombre de votes)
GET /api/videogames/igdb/popular?limit=20

# Popular filtrés par plateforme PC (ID=6)
GET /api/videogames/igdb/popular?platforms=6&limit=10

# Popular genre RPG (ID=12) avec traduction
GET /api/videogames/igdb/popular?genres=12&autoTrad=1&lang=fr
```

**Exemples upcoming** (🆕 Phase 4) :
```bash
# Jeux à venir (10+ jeux)
GET /api/videogames/igdb/upcoming?limit=10

# Jeux à venir filtrés par plateforme PS5 (ID=167)
GET /api/videogames/igdb/upcoming?platforms=167&limit=20

# Avec traduction automatique
GET /api/videogames/igdb/upcoming?autoTrad=1&lang=fr
```

**Paramètres de recherche avancée** :
- `platforms` : IDs de plateformes séparés par virgules (ex: "6,48,49" = PC, PS4, Xbox One)
- `genres` : IDs de genres séparés par virgules
- `themes` : IDs de thèmes séparés par virgules
- `gameModes` : IDs de modes de jeu séparés par virgules
- `playerPerspectives` : IDs de perspectives séparés par virgules
- `minRating` : Note minimale (0-100)
- `releaseYear` : Année de sortie

**Données retournées** :
- **Jeux** : titre, résumé (traduit), storyline, genres (traduits), plateformes, notes, dates, cover, screenshots, artworks, vidéos, DLCs, remakes, franchises, compagnies
- **Genres** : 23 genres disponibles avec traductions
- **Plateformes** : Toutes générations (Atari → PS5/Xbox Series)
- **Compagnies** : développeurs, éditeurs, description, logo, pays
- **Franchises** : nom, jeux de la série

**Technologies** :
- OAuth2 via Twitch (renouvellement automatique du token)
- Requêtes POST avec body Apicalypse
- Cache token en mémoire

---

### RAWG

> **Base URL** : `/api/videogames/rawg`  
> **Source** : [rawg.io](https://rawg.io)  
> **API Key** : ✅ Requise (`RAWG_API_KEY`)  
> **Rate Limit** : 5 requêtes / seconde (non strict)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de jeux | ✅ Fonctionne |
| `GET /advanced-search` | Recherche avancée avec filtres | ✅ Fonctionne |
| `GET /game/:idOrSlug` | Détails d'un jeu | ✅ Fonctionne |
| `GET /game/:idOrSlug/screenshots` | Screenshots d'un jeu | ✅ Fonctionne |
| `GET /game/:idOrSlug/stores` | Magasins où acheter | ✅ Fonctionne |
| `GET /game/:idOrSlug/series` | Jeux de la même série | ✅ Fonctionne |
| `GET /game/:idOrSlug/additions` | DLCs et extensions | ✅ Fonctionne |
| `GET /game/:idOrSlug/achievements` | Achievements du jeu | ✅ Fonctionne |
| `GET /game/:idOrSlug/movies` | Vidéos/trailers | ✅ Fonctionne |
| `GET /game/:idOrSlug/reddit` | Posts Reddit | ✅ Fonctionne |
| `GET /game/:idOrSlug/twitch` | Streams Twitch | ✅ Fonctionne |
| `GET /genres` | Liste des genres | ✅ Fonctionne |
| `GET /platforms` | Liste des plateformes | ✅ Fonctionne |
| `GET /parent-platforms` | Plateformes parentes | ✅ Fonctionne |
| `GET /tags` | Liste des tags | ✅ Fonctionne |
| `GET /stores` | Liste des magasins | ✅ Fonctionne |
| `GET /developers` | Liste des développeurs | ✅ Fonctionne |
| `GET /developers/:id` | Détails développeur | ✅ Fonctionne |
| `GET /developers/:id/games` | Jeux du développeur | ✅ Fonctionne |
| `GET /publishers` | Liste des éditeurs | ✅ Fonctionne |
| `GET /publishers/:id` | Détails éditeur | ✅ Fonctionne |
| `GET /publishers/:id/games` | Jeux de l'éditeur | ✅ Fonctionne |
| `GET /creators` | Liste des créateurs | ✅ Fonctionne |
| `GET /creators/:id` | Détails créateur | ✅ Fonctionne |
| `GET /top-rated` | Jeux les mieux notés | ✅ Fonctionne |
| `GET /popular` | **Jeux populaires (🆕)** | ✅ Fonctionne |
| `GET /trending` | **Jeux trending récents (🆕)** | ✅ Fonctionne |
| `GET /recent-releases` | Sorties récentes | ✅ Fonctionne |
| `GET /upcoming` | **Jeux à venir** (🆕 Phase 4) | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `page` : Numéro de page (défaut: 1)
- `page_size` / `pageSize` : Taille de page (défaut: 20, max: 100)
- `lang` : Langue cible pour traduction (fr, de, es, it, pt)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Paramètres popular/trending** (🆕) :
- `pageSize` : Nombre de résultats (défaut: 20, max: 100)
- `platforms` : IDs de plateformes (ex: "4,187" pour PC, PS5)
- `genres` : IDs de genres (ex: "4,5" pour Action, Shooter)
- `tags` : IDs de tags
- `lang` : Langue pour traduction auto
- `autoTrad` : Activer traduction (1 ou true)

**Paramètres upcoming** (🆕 Phase 4) :
- `page` : Numéro de page (défaut: 1)
- `pageSize` : Nombre de résultats (défaut: 20)
- `lang` : Langue pour traduction
- `autoTrad` : Activer traduction (1 ou true)

**Exemples popular/trending** (🆕) :
```bash
# Jeux populaires (bien notés, metacritic 70+)
GET /api/videogames/rawg/popular?pageSize=10

# Jeux trending (récemment ajoutés)
GET /api/videogames/rawg/trending?pageSize=10

# Popular filtrés par plateforme PC (ID=4)
GET /api/videogames/rawg/popular?platforms=4&pageSize=20

# Trending genre Shooter (ID=2) avec traduction
GET /api/videogames/rawg/trending?genres=2&autoTrad=1&lang=fr
```

**Exemples upcoming** (🆕 Phase 4) :
```bash
# Jeux à venir (42 jeux)
GET /api/videogames/rawg/upcoming?pageSize=10

# Jeux à venir avec traduction
GET /api/videogames/rawg/upcoming?pageSize=20&autoTrad=1&lang=fr
```

**Paramètres de recherche avancée** :
- `platforms` : IDs de plateformes séparés par virgules
- `genres` : IDs de genres séparés par virgules
- `tags` : IDs de tags séparés par virgules
- `developers` : IDs de développeurs séparés par virgules
- `publishers` : IDs d'éditeurs séparés par virgules
- `stores` : IDs de magasins séparés par virgules
- `dates` : Période (ex: "2020-01-01,2020-12-31")
- `metacritic` : Score Metacritic minimum (ex: "80,100")
- `ordering` : Tri (released, -released, name, -name, -rating, -metacritic)

**Données retournées** :
- **Jeux** : titre, description (traduite), genres (traduits), plateformes, notes (RAWG + Metacritic), dates, cover, screenshots, clips, achievements, tags, stores, ESRB rating
- **Métadonnées** : 19 genres, 50+ plateformes, 400+ tags, stores (Steam, Epic, GOG, PlayStation, Xbox, Nintendo)
- **Développeurs/Éditeurs** : nom, description, jeux, image
- **Créateurs** : game designers, position, jeux

**Différences avec IGDB** :
- Plus de métadonnées communautaires (tags, achievements, Reddit, Twitch)
- Scores Metacritic intégrés
- Liens directs vers les magasins
- Moins de données historiques (focus jeux modernes)
- Description HTML plus riche

---

### JVC (JeuxVideo.com)

> **Base URL** : `/api/videogames/jvc`  
> **Source** : [jeuxvideo.com](https://www.jeuxvideo.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : Dépend de FlareSolverr  
> **Note** : Nécessite FlareSolverr pour contourner la protection Cloudflare

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de jeux | ✅ Fonctionne |
| `GET /game/:id` | Détails d'un jeu | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `limit` : Nombre max de résultats (défaut: 20, max: 50)
- `lang` : Langue cible pour traduction (fr, de, es, it, pt)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Données retournées** :
- **Jeux** : titre, description (française native), genres (traduits), plateformes, notes (test JVC + utilisateurs), PEGI, âge minimum, nombre de joueurs, supports physiques (Cartouche/CD/DVD/eShop), liens vers tests
- **Notes** : Échelle JVC 0-20 normalisée vers 0-5
- **Métadonnées** : Développeur, éditeur, PEGI, multijoueur, supports, vidéos

**Particularités** :
- Contenu 100% français (pas de traduction nécessaire vers fr)
- Focus sur le marché français
- Tests et avis de la rédaction JVC
- Notes communautaires françaises
- Informations PEGI détaillées
- Supports physiques et dématérialisés

**Prérequis** :
- FlareSolverr doit être configuré et accessible
- Variable d'environnement : `FLARESOLVERR_URL` (défaut: http://localhost:8191/v1)
- Optionnel : `FSR_SESSION_ID` pour performances optimales

---

### ConsoleVariations

> **Base URL** : `/api/videogames/consolevariations`  
> **Source** : [consolevariations.com](https://consolevariations.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : Dépend de FlareSolverr (~3-5s par requête)  
> **Note** : Nécessite FlareSolverr - Base de données de variations de consoles

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check FlareSolverr | ✅ Fonctionne |
| `GET /search?q=&type=` | Recherche de variations | ✅ Fonctionne |
| `GET /details?url=` | Détails d'une variation | ✅ Fonctionne |
| `GET /item/:slug` | Détails par slug direct | ✅ Fonctionne |
| `GET /platforms?brand=` | Liste marques ou plateformes | ✅ Fonctionne |
| `GET /browse/:platform` | Browse items d'une plateforme | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (pour /search)
- `type` : Type de filtre (all|consoles|controllers|accessories) [défaut: all]
- `max` : Nombre max de résultats (défaut: 20)
- `lang` : Langue cible pour traduction (fr, de, es, it, pt)
- `autoTrad` : Activer traduction automatique (1 ou true)
- `brand` : Marque (nintendo, sony, microsoft, sega, atari, etc.)
- `url` : URL Tako_Api format `consolevariations://item/{slug}`

**Données retournées** :
- **Variations** : nom, images multiples, marque, plateforme, type (console/controller/accessory)
- **Détails** : pays/année release, type release (retail/promotional/bundle/prototype), code région
- **Production** : quantité estimée, édition limitée (bool), bundle (bool), couleur
- **Rareté** : score 0-100, niveau (common/uncommon/rare/very_rare/extremely_rare)
- **Communauté** : nombre de personnes qui veulent/possèdent l'item
- **Identification** : barcode si disponible

**Types de variations** :
- **Consoles** : éditions spéciales, couleurs, régions, packs bundle
- **Controllers** : manettes officielles/tierces, couleurs, éditions limitées
- **Accessories** : périphériques, câbles, adaptateurs, packs

**Particularités** :
- Base de données collaborative de collectionneurs
- Scores de rareté basés sur communauté
- Photos multiples haute qualité
- Historique de production détaillé
- Focus sur éditions limitées et promos
- Comparaison de variations

**Exemples** :
```bash
# Recherche toutes variations PS2
GET /api/videogames/consolevariations/search?q=playstation%202&type=all

# Recherche uniquement consoles Nintendo
GET /api/videogames/consolevariations/search?q=nintendo&type=consoles

# Détails avec traduction française
GET /api/videogames/consolevariations/details?url=consolevariations://item/sony-playstation-2-slim-limited-edition&lang=fr&autoTrad=1

# Détails par slug direct
GET /api/videogames/consolevariations/item/sega-dreamcast-hello-kitty

# Liste des marques
GET /api/videogames/consolevariations/platforms

# Plateformes Nintendo
GET /api/videogames/consolevariations/platforms?brand=nintendo

# Browse toutes variations NES
GET /api/videogames/consolevariations/browse/nes?max=50
```

**Prérequis** :
- FlareSolverr doit être configuré et accessible
- Variable d'environnement : `FLARESOLVERR_URL`
- Temps de réponse élevé (3-5s) dû au scraping anti-bot



## 🎲 BoardGames / Jeux de société

### BoardGameGeek (BGG)

> **Base URL** : `/api/boardgames/bgg`  
> **Source** : [boardgamegeek.com](https://boardgamegeek.com)  
> **API Key** : ✅ Requise (`BGG_API_TOKEN`)  
> **Login** : ✅ Optionnel (`BGG_USERNAME` / `BGG_PASSWORD`) — nécessaire pour les URLs de téléchargement des fichiers  
> **Rate Limit** : 1 requête / seconde (1000ms)  
> **Format** : XML (parser custom intégré)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de jeux par nom | ✅ Fonctionne |
| `GET /search/category?q=` | Recherche par catégorie | ✅ Fonctionne |
| `GET /game/:id` | Détails d'un jeu (stats, catégories, fichiers/règles) | ✅ Fonctionne |

**Paramètres** :
- `q` : Terme de recherche (requis pour /search)
- `limit` : Nombre max de résultats (défaut: 20)
- `autoTrad` : Activer traduction automatique (1 ou true)
- `targetLang` : Langue cible (fr, de, es, it)

**Exemples** :

```bash
# Health check
curl "http://localhost:3000/api/boardgames/bgg/health"

# Recherche de jeux
curl "http://localhost:3000/api/boardgames/bgg/search?q=catan&limit=5"

# Recherche en français
curl "http://localhost:3000/api/boardgames/bgg/search?q=Les%20Aventuriers%20du%20Rail"

# Détails avec traduction française
curl "http://localhost:3000/api/boardgames/bgg/game/13?autoTrad=1&targetLang=fr"
```

**Réponse type** :

```json
{
  "id": "13",
  "name": "CATAN",
  "localizedName": "Les Colons de Catane",
  "year": 1995,
  "players": { "min": 3, "max": 4 },
  "playTime": { "min": 60, "max": 120 },
  "stats": { "rating": 7.1, "rank": 610, "complexity": 2.28 },
  "categories": ["Économique", "Négociation"],
  "mechanics": ["Dice Rolling", "Trading"],
  "designers": ["Klaus Teuber"],
  "files": [
    {
      "id": 15610,
      "filename": "CatanRules.pdf",
      "language": "English",
      "size": 2457600,
      "url": "https://boardgamegeek.com/filepage/15610/...",
      "downloadUrl": "https://boardgamegeek.com/file/download_redirect/{token}/CatanRules.pdf",
      "votes": 42,
      "date": "2012-05-15T00:00:00Z"
    }
  ]
}
```

**Fonctionnalités** :
- 🌍 **Noms localisés** : Extraction automatique (FR/DE/ES/IT)
- 🔍 **Recherche multilingue** : Accepte "Catane", "Les Aventuriers du Rail"
- 📊 **Dictionnaire** : 80+ catégories traduites en 5 langues
- 🖼️ **Thumbnails** : Enrichissement batch des résultats de recherche avec images
- 📄 **Fichiers/Règles** : Téléchargement des règles du jeu (PDF) avec URLs de téléchargement direct

**Fichiers & Règles (détails)** :
- Les fichiers sont récupérés via l'API Files de Geekdo (`api.geekdo.com/api/files`)
- Chaque fichier inclut `url` (page du fichier sur BGG) et `downloadUrl` (lien de téléchargement direct)
- `downloadUrl` est un lien de redirection BGG qui redirige (307) vers une URL S3 presigned (expire en 120 secondes)
- `downloadUrl` fonctionne sans authentification côté client (le token est intégré dans l'URL)
- Si `BGG_USERNAME`/`BGG_PASSWORD` ne sont pas configurés, `downloadUrl` sera `null`

---

## 🎁 Collectibles / Objets de collection

### Coleka

> **Base URL** : `/api/collectibles/coleka`  
> **Source** : [coleka.com](https://www.coleka.com)  
> **API Key** : ❌ Non requise (scraping HTTP direct)  
> **Rate Limit** : ~1-2s par requête (fetch natif)  
> **Note** : Utilise un User-Agent Googlebot pour contourner Cloudflare Turnstile (Coleka whitelist les crawlers). Pas de dépendance FlareSolverr.

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check FlareSolverr | ✅ Fonctionne |
| `GET /search?q=&category=` | Recherche d'objets | ✅ Fonctionne |
| `GET /details?url=` | Détails d'un objet | ✅ Fonctionne |
| `GET /item/:path` | Détails par path direct | ✅ Fonctionne |
| `GET /categories` | Liste des catégories | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (pour /search)
- `max` : Nombre max de résultats (défaut: 20)
- `lang` : Langue (fr, en) (défaut: fr)
- `category` : Filtre par catégorie (lego, funko, figurines, playmobil, etc.)
- `autoTrad` : Activer traduction automatique (1 ou true)
- `url` : URL Tako_Api format `coleka://item/{path}`

**Données retournées** :
- **Collectibles** : nom, images haute qualité, marque, série, catégorie
- **Collection/Série** : hiérarchie complète depuis JSON-LD (`collectionHierarchy`), série (`series`), catégorie (`category`)
- **Détails** : description, année, référence, code-barres
- **Attributs** : nombre de pièces (LEGO), couleur, édition limitée
- **Classification** : licences/franchises, catégories (fil d'Ariane)
- **JSON-LD** : métadonnées structurées si disponibles

**Types d'objets** :
- **LEGO** : sets, minifigures, briques
- **Funko Pop** : figurines de toutes licences
- **Figurines** : action figures, statuettes
- **Playmobil** : sets et figurines
- **Jeux de société** : jeux de plateau et de cartes
- **Cartes à collectionner** : Pokemon, Magic, Yu-Gi-Oh
- **Peluches** : jouets en tissu
- **Comics & BD** : bandes dessinées

**Particularités** :
- Base de données collaborative française
- Images haute qualité dédupliquées (www vs thumbs)
- Support des données structurées JSON-LD
- Extraction des catégories depuis fil d'Ariane
- Multi-marques/licences par item
- Bypass Cloudflare Turnstile via User-Agent Googlebot (fetch natif, pas de FlareSolverr)
- Parsing des résultats via classe CSS `lib_has` avec attribut `data-id`

**Exemples** :
```bash
# Recherche tous objets LEGO
GET /api/collectibles/coleka/search?q=lego%20star%20wars

# Recherche uniquement Funko Pop
GET /api/collectibles/coleka/search?q=batman&category=funko

# Détails avec traduction anglaise
GET /api/collectibles/coleka/details?url=coleka://item/fr/lego/star-wars/millennium-falcon_i12345&lang=en&autoTrad=1

# Détails par path direct
GET /api/collectibles/coleka/item/fr/funko/marvel/iron-man_i67890

# Liste des catégories
GET /api/collectibles/coleka/categories?lang=fr
```

**Prérequis** :
- Aucun (requêtes HTTP directes avec UA crawler Googlebot)
- Temps de réponse rapide (~1-2s)

---

### Lulu-Berlu

> **Base URL** : `/api/collectibles/luluberlu`  
> **Source** : [lulu-berlu.com](https://www.lulu-berlu.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : Dépend de FlareSolverr (~2-4s par requête)  
> **Note** : Figurines et collectibles vintage français - Pas de challenge anti-bot

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check FlareSolverr | ✅ Fonctionne |
| `GET /search?q=` | Recherche de produits | ✅ Fonctionne |
| `GET /details?url=` | Détails par URL complète | ✅ Fonctionne |
| `GET /item/:path` | Détails par chemin | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `url` : URL complète du produit (requis pour /details)
- `max` : Nombre max de résultats (défaut: 24, par page: 12)
- `lang` : Langue cible pour traduction (défaut: fr)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Données retournées** :
- **Produits** : nom, marque, prix (EUR), disponibilité
- **Images** : URL principale et galerie (haute qualité)
- **Détails** : description, référence SKU, condition
- **Attributs** : type, matière, taille, origine, année

**Spécialités** :
- **Figurines** : Final Fantasy, Star Wars, Marvel, DC Comics
- **Jouets vintage** : Transformers, LEGO anciens, Bandai
- **Statuettes** : collector, résine, cold-cast
- **Trading Arts** : figurines japonaises articulées
- **Kotobukiya** : statues haute qualité

**Particularités** :
- Site français spécialisé dans le vintage
- Prix en euros uniquement
- Images grande taille (p-image-*-grande)
- Extraction via pattern `idproduit="(\d+)"`
- Pas de catégories (recherche libre)
- **`sourceId` = slug URL** (ex: `goldorak-a3155.html`), pas l'ID numérique
- `/details?url=` accepte l'URL complète retournée par /search
- `/item/:path` accepte le `sourceId` directement (slug URL)

**Exemples** :
```bash
# Recherche de figurines Final Fantasy
GET /api/collectibles/luluberlu/search?q=squall&max=6

# Recherche LEGO vintage
GET /api/collectibles/luluberlu/search?q=lego%20star%20wars

# Détails par URL complète (retournée par /search)
GET /api/collectibles/luluberlu/details?url=https://www.lulu-berlu.com/final-fantasy-viii-bandai-figurine-15cm-squall-leonhart-a47524.html

# Détails par chemin relatif
GET /api/collectibles/luluberlu/item/final-fantasy-viii-bandai-figurine-15cm-squall-leonhart-a47524.html

# Avec traduction anglaise
GET /api/collectibles/luluberlu/item/final-fantasy-viii-bandai-figurine-15cm-squall-leonhart-a47524.html?lang=en&autoTrad=1
```

**Prérequis** :
- FlareSolverr doit être configuré et accessible
- Variable d'environnement : `FLARESOLVERR_URL`
- Temps de réponse moyen (2-4s) pour le scraping

---

### Transformerland

> **Base URL** : `/api/collectibles/transformerland`  
> **Source** : [transformerland.com](https://www.transformerland.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : Dépend de FlareSolverr (~3-5s par requête)  
> **Note** : Guide de collection Transformers et boutique vintage - Nécessite FlareSolverr

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check FlareSolverr | ✅ Fonctionne |
| `GET /search?q=` | Recherche de jouets Transformers | ✅ Fonctionne |
| `GET /details?id=` | Détails par toyId ou URL | ✅ Fonctionne |
| `GET /item/:id` | Détails par toyId | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `id` : Toy ID numérique, URL complète ou chemin (requis pour /details et /item)
- `max` : Nombre max de résultats (défaut: 24)
- `lang` : Langue cible pour traduction (défaut: en)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Données retournées** :
- **Jouets** : nom, série (G1, Beast Wars, etc.), subgroup, faction
- **Images** : thumbnails, reference_images (haute qualité)
- **Instructions** : scans d'instructions de transformation (`details.instructions`, tableau d'URLs) — `null` si non disponible
- **Specs** : scans de fiches techniques (`details.specs`, tableau d'URLs) — `null` si non disponible
- **Détails** : année, taille, fabricant (Hasbro, Takara), disponibilité
- **Attributs** : toyLine, allegiance (Autobot/Decepticon), condition, prix (si boutique)

**Types de pages supportées** :
1. **Guide du collectionneur** (`show_parent_g12.php?action=show_parent&toyid=`)
   - Infos techniques complètes
   - Images de référence haute qualité
   - Scans instructions/specs
   - Pas de prix (référence uniquement)
   
2. **Pages boutique** (`/store/item/`)
   - Prix en USD
   - Disponibilité en stock
   - Condition du produit
   - Schema.org/Product metadata

**Séries principales** :
- **G1 (1984-1992)** : Génération 1 originale (Optimus Prime, Megatron, etc.)
- **G2 (1993-1995)** : Génération 2
- **Beast Wars** : Transformers animaux
- **Armada, Energon, Cybertron** : Unicron Trilogy
- **Classics, Universe** : Reprises modernes de G1
- **Prime, RID** : Séries récentes
- **Masterpiece** : Rééditions premium haute qualité
- **Studio Series** : Basés sur les films

**Fabricants** :
- **Hasbro** : Version US/internationale
- **Takara / TakaraTomy** : Version japonaise (souvent meilleure qualité)
- **Third Party** : FansProject, MMC, DX9, TFC, Unique Toys

**Factions** :
- **Autobot** : Gentils (Optimus Prime, Bumblebee, Jazz)
- **Decepticon** : Méchants (Megatron, Starscream, Soundwave)
- **Maximal / Predacon** : Beast Wars
- **Neutral** : Non-alignés

**Particularités** :
- Contenu toujours en anglais (source US)
- Extraction via regex complexe (structure HTML tableau)
- Support toyId numérique, URL complète ou chemin relatif
- Images: `/thumbnails/` → `/reference_images/` (haute qualité)
- Instructions: `/image/archive/instructionscans/full/` → `details.instructions` (séparé des images)
- Specs: `/image/archive/specscans/full/` → `details.specs` (séparé des images)
- Année extraite du subgroup (format "Leaders (1984)")
- Pas de challenge Cloudflare actif (mais FlareSolverr nécessaire)

**Exemples** :
```bash
# Recherche Optimus Prime
GET /api/collectibles/transformerland/search?q=optimus+prime&max=5

# Recherche Beast Wars
GET /api/collectibles/transformerland/search?q=beast+wars

# Détails G1 Optimus Prime par toyId
GET /api/collectibles/transformerland/details?id=158

# Détails par URL complète
GET /api/collectibles/transformerland/details?id=https://www.transformerland.com/show_parent_g12.php?action=show_parent&toyid=158

# Détails via /item/:id
GET /api/collectibles/transformerland/item/158

# Avec traduction française
GET /api/collectibles/transformerland/item/158?lang=fr&autoTrad=1

# Health check
GET /api/collectibles/transformerland/health
```

**Exemples de résultats** :
```json
{
  "id": "158",
  "name": "Leaders Optimus Prime",
  "url": "https://www.transformerland.com/show_parent_g12.php?action=show_parent&toyid=158",
  "series": "G1",
  "subgroup": "Leaders (1984)",
  "faction": "Autobot",
  "year": 1984,
  "images": [
    "https://www.transformerland.com/image/reference_images/161.jpg"
  ],
  "instructions": [
    "https://www.transformerland.com/image/archive/instructionscans/full/Optimus_Prime_instructions.jpg"
  ],
  "specs": [
    "https://www.transformerland.com/image/archive/specscans/full/Optimus_Prime_specs.jpg"
  ],
  "attributes": {
    "toyLine": "Transformers"
  },
  "source": "transformerland"
}
```

**Prérequis** :
- FlareSolverr doit être configuré et accessible
- Variable d'environnement : `FLARESOLVERR_URL`
- Temps de réponse élevé (3-5s) pour le scraping avec FlareSolverr
- Site potentiellement protégé par Cloudflare (d'où FlareSolverr)

---

## 🏷️ Sticker-Albums / Albums de vignettes

### Paninimania

> **Base URL** : `/api/sticker-albums/paninimania`  
> **Source** : [paninimania.com](https://www.paninimania.com)  
> **API Key** : ❌ Non requise (scraping)  
> **Rate Limit** : Dépend de FlareSolverr (~3-5s par requête)  
> **Note** : Base de données d'albums Panini et stickers - Parsing très complexe

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check FlareSolverr | ✅ Fonctionne |
| `GET /search?q=` | Recherche d'albums Panini | ✅ Fonctionne |
| `GET /details?id=` | Détails par ID ou URL | ✅ Fonctionne |
| `GET /album/:id` | Détails par ID (path) | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche (requis pour /search)
- `id` : ID album ou URL complète (requis pour /details et /album)
- `max` : Nombre max de résultats (défaut: 24)
- `lang` : Langue cible pour traduction (défaut: fr)
- `autoTrad` : Activer traduction automatique (1 ou true)

**Données retournées (structure complexe)** :

**Albums (recherche)** :
- `id` : ID album unique
- `title` : Titre de l'album
- `url` : URL vers la page de détails
- `image` / `thumbnail` : Image de couverture
- `year` : Année de parution

**Albums (détails)** :
- `id`, `title`, `url` : Identifiants de base
- `description` : Description détaillée (multilignes)
- `mainImage` : Image principale haute qualité
- `barcode` : Code-barres (EAN/UPC)
- `copyright` : Détenteur des droits
- `releaseDate` : Date de première parution
- `editor` : Éditeur (généralement "Panini")

**Checklist** (structure détaillée) :
```json
{
  "raw": "1 à 226, LE1 à LE5",
  "total": 226,
  "items": [1, 2, 3, ..., 226],
  "totalWithSpecials": 276
}
```
- `raw` : Format brut de la checklist
- `total` : Nombre d'images normales
- `items` : Tableau des numéros individuels
- `totalWithSpecials` : Total incluant les images spéciales

**Special Stickers** (images spéciales) :
Types supportés : Fluorescentes, Brillantes, Hologrammes, Métallisées, Pailletées, Transparentes, Puzzle, Relief, Autocollantes, Tatouages, Phosphorescentes, 3D, Lenticulaires, Dorées, Argentées

```json
{
  "specialStickers": [
    {
      "name": "brillantes",
      "raw": "1, 2, 4, 5, 8, 10, 12, ...",
      "total": 50,
      "list": [1, 2, 4, 5, 8, 10, 12, ...]
    },
    {
      "name": "Limitées",
      "raw": "LE1, LE2, LE3, LE4, LE5",
      "total": 5,
      "list": ["LE1", "LE2", "LE3", "LE4", "LE5"]
    }
  ]
}
```

**Additional Images** (images supplémentaires) :
```json
{
  "additionalImages": [
    {
      "url": "https://www.paninimania.com/files/.../image.jpg",
      "caption": "Dos de l'album"
    },
    {
      "url": "https://www.paninimania.com/files/.../image2.jpg",
      "caption": "Pochette"
    }
  ]
}
```

**Autres données** :
- `categories` : Tableau de catégories (ex: ["Sports", "Football"])
- `articles` : Articles divers associés (packs, tin box, etc.)

**Types de listes supportées** :

1. **Numéros** : `1 à 100`, `105`, `110-120`
   - Résultat : `[1, 2, 3, ..., 100, 105, 110, 111, ..., 120]`

2. **Lettres** : `A à Z`, `A, B, C`
   - Résultat : `["A", "B", "C", ..., "Z"]`

3. **Alphanumériques** : `A1, B2, C3`, `LE1 à LE5`
   - Résultat : `["A1", "B2", "C3"]` ou `["LE1", "LE2", "LE3", "LE4", "LE5"]`

4. **Romains** : `I, II, III, IV`
   - Résultat : `["I", "II", "III", "IV"]`

**Exemples** :
```bash
# Recherche albums foot
GET /api/sticker-albums/paninimania/search?q=football&max=10

# Recherche Star Wars
GET /api/sticker-albums/paninimania/search?q=star+wars

# Détails album par ID
GET /api/sticker-albums/paninimania/details?id=7523

# Détails via /album/:id
GET /api/sticker-albums/paninimania/album/7523

# Avec traduction anglaise
GET /api/sticker-albums/paninimania/album/7523?lang=en&autoTrad=1

# Health check
GET /api/sticker-albums/paninimania/health
```

**Exemple de réponse complète** :
```json
{
  "id": "7523",
  "title": "# Fiers d'être Bleus - Sticker Album - Panini - 2023",
  "url": "https://www.paninimania.com/?pag=cid508_alb&idf=15&idm=7523",
  "description": "Paru en France.\n\nEdition Limitée\n\nLe Sommer et Griezman = LE1...",
  "mainImage": null,
  "barcode": null,
  "copyright": "Panini",
  "releaseDate": "aout 2023",
  "editor": "Panini",
  "checklist": {
    "raw": "1 à 226, LE1 à LE5",
    "total": 226,
    "items": [1, 2, 3, ..., 226],
    "totalWithSpecials": 276
  },
  "categories": ["Sports", "Football"],
  "additionalImages": [
    {
      "url": "https://www.paninimania.com/files/15/31/?n=7523_i1b_d1wmyy.jpg",
      "caption": "Dos de l`album"
    }
  ],
  "articles": [
    "Pack de démarrage : Album + 3 pochettes + 1 limitée : 4,95 €",
    "Album : 2.90 €"
  ],
  "specialStickers": [
    {
      "name": "brillantes",
      "raw": "1, 2, 4, 5, 8, 10, 12, ...",
      "total": 50,
      "list": [1, 2, 4, 5, 8, 10, 12, ...]
    }
  ],
  "source": "paninimania"
}
```

**Particularités** :

- **Parsing ultra-complexe** : Gère 15+ types d'images spéciales différentes
- **Formats multiples** : Numéros, lettres, alphanumériques, romains
- **Checklist détaillée** : Total normal + total avec spéciales
- **Images multiples** : Image principale + 10-20 images additionnelles avec légendes
- **Metadata riche** : Code-barres, copyright, date de parution, éditeur
- **Articles divers** : Prix des packs, tin box, blisters
- **Catégorisation** : Extraction depuis fil d'Ariane
- **Format brut préservé** : `raw` conserve le format original pour référence

**Cas d'usage** :

- **Collectionneurs** : Checklist complète pour savoir quelles images chercher
- **Détaillants** : Prix des packs et produits dérivés
- **Recherche** : Trouver albums par thème (sport, dessin animé, film)
- **Inventaire** : Liste exhaustive de toutes les images (normales + spéciales)
- **Vérification** : Code-barres pour authentification

**Prérequis** :
- FlareSolverr doit être configuré et accessible
- Variable d'environnement : `FLARESOLVERR_URL`
- Temps de réponse élevé (3-5s minimum) pour le scraping complexe
- Site en français (traduction automatique disponible)

---

### Carddass

> **Base URL** : `/api/collectibles/carddass`  
> **Sources** : [animecollection.fr](http://www.animecollection.fr) + [dbzcollection.fr](http://www.dbzcollection.fr)  
> **API Key** : ❌ Non requise (base locale PostgreSQL)  
> **Données** : 122 200 cartes (31 685 animecollection + 90 515 dbzcollection), 219 093 images (9,8 Go)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Santé du provider | ✅ Fonctionne |
| `GET /stats` | Statistiques complètes (par site, licence) | ✅ Fonctionne |
| `GET /search?q=` | Recherche full-text | ✅ Fonctionne |
| `GET /licenses` | Liste des licences | ✅ Fonctionne |
| `GET /licenses/:id` | Détail d'une licence | ✅ Fonctionne |
| `GET /licenses/:id/collections` | Collections d'une licence | ✅ Fonctionne |
| `GET /collections/:id/series` | Séries d'une collection | ✅ Fonctionne |
| `GET /series/:id/cards` | Cartes d'une série | ✅ Fonctionne |
| `GET /cards/:id` | Détail carte (hiérarchie complète) | ✅ Fonctionne |
| `GET /random` | Carte aléatoire | ✅ Fonctionne |

**Paramètres de recherche** :
- `q` : Texte recherché (nom de carte)
- `rarity` : Filtrer par rareté
- `license` : Filtrer par ID licence
- `site` : Filtrer par source (`animecollection` ou `dbzcollection`)
- `max` : Résultats max (défaut: 20, max: 100)
- `page` : Page de résultats (défaut: 1)

**Données multi-sites** :
- `animecollection` : 80 licences — Dragon Ball, Gundam, Sailor Moon, One Piece, Naruto, etc.
- `dbzcollection` : 1 licence Dragon Ball — 336 collections, 1 477 séries, 90 515 cartes

**Exemples** :
```bash
# Recherche globale
GET /api/collectibles/carddass/search?q=goku&max=10

# Recherche sur un site spécifique
GET /api/collectibles/carddass/search?q=vegeta&site=dbzcollection

# Licences
GET /api/collectibles/carddass/licenses

# Collections d'une licence
GET /api/collectibles/carddass/licenses/1/collections

# Statistiques (inclut breakdown par site)
GET /api/collectibles/carddass/stats

# Health check
GET /api/collectibles/carddass/health
```

---

## 🎴 TCG / Trading Card Games

### Pokémon TCG

> **Base URL** : `/api/tcg/pokemon`  
> **Source** : [TCGdex](https://tcgdex.dev) (`api.tcgdex.net`)  
> **API Key** : Aucune requise  
> **Rate Limit** : Aucun  
> **Note** : Cartes Pokémon officielles avec prix, sets, multi-langues natif (FR, EN, DE, ES, IT, PT)
> **Note images** : TCGdex ne fournit d'images que pour les langues d'impression physique. Un fallback automatique vers l'image EN est effectué quand l'image locale est absente.

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /search?q=` | Recherche de cartes | ✅ Fonctionne |
| `GET /card/:id` | Détails d'une carte | ✅ Fonctionne |
| `GET /sets` | Liste des sets | ✅ Fonctionne |
| `GET /sets/:id` | Détails d'un set avec cartes | ✅ Fonctionne |
| `GET /health` | Health check API | ✅ Fonctionne |

**Paramètres de recherche** :
- `q` : Nom de carte (requis)
- `lang` : Langue (défaut: fr) — FR, EN, DE, ES, IT, PT supportées nativement
- `max` : Résultats max (défaut: 20)
- `page` : Page de résultats (défaut: 1)
- `set` : Filtrer par set ID (ex: base1, swsh1)
- `type` : Filtrer par type (Fire/Feu, Water/Eau, Grass/Plante, etc. — selon langue)
- `rarity` : Filtrer par rareté (Common/Commune, Rare, etc. — selon langue)
- `supertype` : Filtrer par catégorie (Pokemon/Pokémon, Trainer/Dresseur, Energy/Énergie)
- `subtype` : Filtrer par suffixe (V, EX, VMAX, VSTAR, etc.)
- `autoTrad` : Traduction automatique (true/false)

**Paramètres de sets** :
- `max` : Résultats max (défaut: 250)
- `lang` : Langue (défaut: fr)

**⚠️ Filtres localisés** : Les filtres `type`, `rarity`, `supertype` doivent correspondre à la langue choisie. Ex: `type=Fire` en EN, `type=Feu` en FR.

**Données retournées** :

**Cartes (recherche)** :
- `id` : ID unique carte formaté `pokemon:{cardId}` (ex: pokemon:base1-58)
- `title` : Nom de la carte (dans la langue demandée)
- `images.primary` / `images.thumbnail` : Images haute/basse qualité (WebP)
- `details.cardNumber` : Numéro local dans le set

**Cartes (détails)** :
- Tout de recherche +
- `description` : Capacités et attaques formatées
- `details.flavorText` : Texte d'ambiance
- `details.set` : `{name, code, series, releaseDate}` (format uniforme)
- `details.setLogo` / `details.setSymbol` : Visuels du set
- `details.setTotal` : Nombre total de cartes
- `details.cardNumber` : Format "number/total"
- `details.supertype` : Pokemon, Trainer, Energy
- `details.subtypes` : [V, EX, VMAX…]
- `details.types` : Types élémentaires
- `details.hp` : Points de vie
- `details.stage` : Basic, Stage1, Stage2
- `details.artist` : Illustrateur
- `details.evolvesFrom` : Évolue depuis
- `details.attacks` : `[{name, cost, damage, effect}]`
- `details.abilities` : `[{name, effect, type}]`
- `details.weaknesses` / `details.resistances` : `[{type, value}]`
- `details.retreatCost` : Coût de retraite (tableau reconstitué)
- `details.legalities` : `{standard, expanded}` (booléens)
- `details.nationalPokedexNumbers` : Numéros Pokédex
- `details.prices` : Prix TCGPlayer + Cardmarket avec variants

**Sets (liste)** :
- `id` : ID formaté `pokemon:{setId}`
- `title` : Nom du set (localisé)
- `images.primary` : Logo du set
- `details.total` / `details.printedTotal` : Nombre de cartes

**Sets (détails `/sets/:id`)** :
- Tout de liste +
- `details.set` : `{name, code, series, releaseDate}`
- `details.series` : Nom de la série
- `details.releaseDate` : Date de parution
- `details.abbreviation` : Code abrégé officiel
- `details.legalities` : Formats légaux
- `details.cards` : Liste complète des cartes `[{id, name, localId, image}]`

**Exemples** :
```bash
# Recherche Pikachu en français
GET /api/tcg/pokemon/search?q=pikachu&lang=fr&max=10

# Pikachu avec filtres (EN)
GET /api/tcg/pokemon/search?q=pikachu&lang=en&rarity=Rare&type=Lightning

# Chercher dans un set spécifique
GET /api/tcg/pokemon/search?q=charizard&set=base1

# Détails d'une carte (FR natif)
GET /api/tcg/pokemon/card/base1-58?lang=fr

# Détails en anglais
GET /api/tcg/pokemon/card/swsh1-25?lang=en

# Liste tous les sets
GET /api/tcg/pokemon/sets?lang=fr

# Détails d'un set avec ses cartes
GET /api/tcg/pokemon/sets/base1?lang=fr

# Health check
GET /api/tcg/pokemon/health
```

**Exemple de réponse (détail carte)** :
```json
{
  "success": true,
  "provider": "pokemon",
  "domain": "tcg",
  "id": "pokemon:base1-58",
  "data": {
    "id": "pokemon:base1-58",
    "type": "tcg_card",
    "source": "pokemon",
    "sourceId": "base1-58",
    "title": "Pikachu",
    "description": "**Rogne** (Incolore): [10]\n\n**Secousse Tonnerre** (Électrique Incolore): ... [30]",
    "images": {
      "primary": "https://assets.tcgdex.net/fr/base/base1/58/high.webp",
      "thumbnail": "https://assets.tcgdex.net/fr/base/base1/58/low.webp"
    },
    "details": {
      "subtitle": "Pokémon",
      "flavorText": "Quand plusieurs de ces Pokémon se réunissent...",
      "set": { "name": "Set de Base", "code": "base1", "series": null, "releaseDate": null },
      "cardNumber": "58/102",
      "types": ["Électrique"],
      "hp": "40",
      "rarity": "Commune",
      "artist": "Mitsuhiro Arita",
      "prices": {
        "currency": "USD",
        "market": 5.12,
        "cardmarket": { "currency": "EUR", "trendPrice": 9.03 }
      }
    }
  }
}
```

---

### Dragon Ball Super Card Game (DBS)

> **Base URL** : `/api/tcg/dbs`  
> **Sources** : [DeckPlanet API](https://api.deckplanet.net) (Masters) + [dbs-cardgame.com](https://www.dbs-cardgame.com) (Fusion World)  
> **API Key** : Aucune requise  
> **Note** : Base locale PostgreSQL, 6 213 cartes Masters + 1 689 cartes Fusion World

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /search?q=` | Recherche de cartes | ✅ Fonctionne |
| `GET /card/:id` | Détails d'une carte | ✅ Fonctionne |
| `GET /sets` | Liste des sets | ✅ Fonctionne |
| `GET /sets/:code` | Détail d'un set avec cartes | ✅ Fonctionne |
| `GET /stats` | Statistiques complètes | ✅ Fonctionne |
| `GET /health` | Health check | ✅ Fonctionne |

**Paramètres de recherche** :
- `q` : Texte de recherche (requis) — nom, skills, traits
- `game` : Filtrer par jeu (`masters` ou `fusion_world`, défaut: les deux)
- `color` : Filtrer par couleur (Red, Blue, Green, Yellow, Black)
- `type` : Filtrer par type (LEADER, BATTLE, EXTRA, UNISON, Z-BATTLE, etc.)
- `rarity` : Filtrer par rareté (Common[C], Rare[R], Super Rare[SR], etc.)
- `set` : Filtrer par set_code (BT1, FB01, etc.)
- `max` : Résultats max (défaut: 20, max: 100)
- `page` : Page de résultats (défaut: 1)

**Données retournées (cartes)** :
- `id` : Numéro de carte (ex: BT1-030, FB01-001)
- `title` : Nom de la carte
- `subtitle` : Type · Couleur
- `description` : Skills de la carte
- `image` / `thumbnail` : URL image de la carte
- `metadata` :
  - `game` : masters ou fusion_world
  - `cardNumber`, `cardType`, `color`, `rarity`
  - `power`, `energyCost`, `comboCost`, `comboPower`
  - `traits`, `character`, `era`, `keywords` (JSON)
  - `setCode`, `setName`
  - `isBanned`, `isLimited`, `hasErrata` (Masters uniquement)
  - `backName`, `backPower`, `backSkill` (Leaders uniquement)
  - `variants`, `finishes` (Masters uniquement)

**Exemples** :
```bash
# Recherche Goku
GET /api/tcg/dbs/search?q=Goku&max=10

# Goku dans Fusion World uniquement
GET /api/tcg/dbs/search?q=Goku&game=fusion_world

# Leaders rouges
GET /api/tcg/dbs/search?q=*&type=LEADER&color=Red

# Détails d'une carte
GET /api/tcg/dbs/card/FB01-001

# Sets Fusion World 
GET /api/tcg/dbs/sets?game=fusion_world

# Statistiques
GET /api/tcg/dbs/stats
```

---

## Magic: The Gathering (MTG)

**Base URL** : `/api/tcg/mtg`

**Source** : Scryfall API (api.scryfall.com)

### Endpoints

| Méthode | Route | Description | Authentification |
|---------|-------|-------------|-----------------|
| GET | `/search` | Recherche de cartes MTG | Non |
| GET | `/card/:id` | Détails d'une carte | Non |
| GET | `/sets` | Liste des sets/éditions | Non |
| GET | `/health` | Health check | Non |

### Paramètres

#### `/search`
- `q` (requis) : Requête de recherche (syntaxe Scryfall supportée)
- `lang` : Langue (en, fr, es, de, it, pt, ja, ko, ru, zh-Hans, zh-Hant) [défaut: "en"]
- `max` : Nombre max de résultats (1-175) [défaut: 20]
- `order` : Tri (name, set, released, rarity, color, usd, tix, eur, cmc, power, toughness, edhrec, penny, artist, review) [défaut: "name"]
- `unique` : Filtre doublons (cards, art, prints) [défaut: "cards"]
- `dir` : Direction tri (auto, asc, desc) [défaut: "auto"]
- `autoTrad` : Traduction automatique (true/false) [défaut: false]

#### `/card/:id`
- `:id` : UUID Scryfall ou format `{set}/{collector_number}` (ex: "clu/141")
- `lang` : Langue [défaut: "en"]
- `autoTrad` : Traduction automatique [défaut: false]

#### `/sets`
- Aucun paramètre (retourne tous les sets)

**Exemples de recherche** :
```bash
# Recherche simple
GET /api/tcg/mtg/search?q=lightning+bolt

# Recherche avancée Scryfall (coût de mana)
GET /api/tcg/mtg/search?q=mv=1+type:instant+color:r

# Recherche avec tri
GET /api/tcg/mtg/search?q=legendary+creature&order=edhrec&max=10

# Carte par UUID
GET /api/tcg/mtg/card/77c6fa74-5543-42ac-9ead-0e890b188e99

# Carte par set/numéro
GET /api/tcg/mtg/card/clu/141

# Sets
GET /api/tcg/mtg/sets

# Health check
GET /api/tcg/mtg/health
```

**Exemple de réponse (recherche)** :
```json
{
  "success": true,
  "provider": "mtg",
  "query": "lightning bolt",
  "total": 0,
  "count": 1,
  "hasMore": false,
  "data": [
    {
      "id": "77c6fa74-5543-42ac-9ead-0e890b188e99",
      "source": "mtg",
      "collection": "Magic: The Gathering",
      "title": "Lightning Bolt",
      "subtitle": "Instant",
      "description": "Instant - Lightning Bolt deals 3 damage to any target.",
      "image": "https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
      "thumbnail": "https://cards.scryfall.io/normal/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
      "year": 2024,
      "metadata": {
        "set": {
          "name": "Ravnica: Clue Edition",
          "code": "clu"
        },
        "rarity": "uncommon",
        "colors": ["R"],
        "manaCost": "{R}",
        "cmc": 1,
        "artist": "Christopher Moeller",
        "collectorNumber": "141"
      },
      "prices": {
        "usd": "1.76",
        "eur": "1.49",
        "tix": "0.02"
      },
      "detailUrl": "/api/tcg/mtg/card/77c6fa74-5543-42ac-9ead-0e890b188e99"
    }
  ],
  "meta": {
    "fetchedAt": "2026-01-30T08:19:00.000Z",
    "lang": "en",
    "autoTrad": false
  }
}
```

**Exemple de réponse (détails)** :
```json
{
  "success": true,
  "provider": "mtg",
  "data": {
    "id": "77c6fa74-5543-42ac-9ead-0e890b188e99",
    "source": "mtg",
    "title": "Lightning Bolt",
    "subtitle": "Instant",
    "description": "Lightning Bolt deals 3 damage to any target.",
    "flavorText": "The sparkmage shrieked, calling on the rage of the storms of his youth.",
    "images": [
      {
        "url": "https://cards.scryfall.io/large/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
        "thumbnail": "https://cards.scryfall.io/small/front/7/7/77c6fa74-5543-42ac-9ead-0e890b188e99.jpg",
        "caption": "Carte",
        "isMain": true
      }
    ],
    "year": 2024,
    "metadata": {
      "set": {
        "id": "d4bfabcf-a859-43a4-9d8a-665533c8b174",
        "code": "clu",
        "name": "Ravnica: Clue Edition",
        "type": "draft_innovation",
        "iconSvg": "https://api.scryfall.com/sets/d4bfabcf-a859-43a4-9d8a-665533c8b174"
      },
      "scryfallId": "77c6fa74-5543-42ac-9ead-0e890b188e99",
      "oracleId": "4457ed35-7c10-48c8-9776-456485fdf070",
      "multiverseIds": [651876],
      "mtgoId": 123066,
      "collectorNumber": "141",
      "manaCost": "{R}",
      "cmc": 1,
      "typeLine": "Instant",
      "oracleText": "Lightning Bolt deals 3 damage to any target.",
      "power": null,
      "toughness": null,
      "loyalty": null,
      "colors": ["R"],
      "colorIdentity": ["R"],
      "rarity": "uncommon",
      "artist": "Christopher Moeller",
      "layout": "normal",
      "keywords": [],
      "legalities": {
        "standard": "not_legal",
        "modern": "legal",
        "legacy": "legal",
        "pauper": "legal",
        "vintage": "legal",
        "commander": "legal"
      }
    },
    "prices": {
      "usd": "1.76",
      "usdFoil": null,
      "eur": "1.49",
      "eurFoil": null,
      "tix": "0.02",
      "currency": "USD/EUR",
      "source": "scryfall",
      "updatedAt": "2026-01-30T08:19:32.610Z"
    },
    "externalLinks": {
      "scryfall": "https://scryfall.com/card/clu/141/lightning-bolt",
      "tcgplayer": "https://www.tcgplayer.com/product/534658",
      "cardmarket": "https://www.cardmarket.com/en/Magic/Products?idProduct=752712"
    },
    "rulings": "https://api.scryfall.com/cards/77c6fa74-5543-42ac-9ead-0e890b188e99/rulings"
  },
  "meta": {
    "fetchedAt": "2026-01-30T08:19:32.610Z",
    "lang": "en"
  }
}
```

**Exemple de réponse (sets)** :
```json
{
  "success": true,
  "provider": "mtg",
  "total": 0,
  "count": 1028,
  "data": [
    {
      "id": "974e1012-df4a-44ea-aea4-4bf2f62b4cbf",
      "source": "mtg",
      "title": "Through the Omenpaths 2",
      "subtitle": "expansion",
      "description": null,
      "image": "https://svgs.scryfall.io/sets/default.svg",
      "thumbnail": "https://svgs.scryfall.io/sets/default.svg",
      "year": 2026,
      "metadata": {
        "code": "om2",
        "type": "expansion",
        "cardCount": 0,
        "digital": false,
        "foilOnly": true
      }
    }
  ],
  "meta": {
    "fetchedAt": "2026-01-30T08:20:00.000Z"
  }
}
```

**Notes** :
- Syntaxe Scryfall complète supportée (mv, color, type, rarity, oracle, etc.)
- Rate limiting : 100ms entre requêtes (10 req/sec)
- Aucune clé API requise
- Prix : USD, EUR, MTGO Tix (source Scryfall)
- Legalités : 14 formats (Standard, Modern, Legacy, Pauper, Commander, etc.)
- Double-faced cards : Retourne face avant par défaut

**Cas d'usage** :
- Recherche de cartes par nom, couleur, coût
- Vérification des prix Scryfall (USD/EUR)
- Consultation des legalités par format
- Exploration des sets/éditions MTG
- Recherche avancée avec syntaxe Scryfall (mv=1, type:instant, etc.)

---

## Yu-Gi-Oh! TCG

**Base URL** : `/api/tcg/yugioh`

**Source** : YGOPRODeck API (db.ygoprodeck.com)

### Endpoints

| Méthode | Route | Description | Authentification |
|---------|-------|-------------|-----------------|
| GET | `/search` | Recherche de cartes Yu-Gi-Oh! | Non |
| GET | `/card/:id` | Détails d'une carte | Non |
| GET | `/sets` | Liste des sets | Non |
| GET | `/archetype` | Recherche par archétype | Non |
| GET | `/health` | Health check | Non |

### Paramètres

#### `/search`
- `q` (requis) : Nom de la carte (fuzzy search)
- `type` : Type (Monster, Spell, Trap)
- `race` : Race/Type (Dragon, Spellcaster, Warrior, etc.)
- `attribute` : Attribut (DARK, LIGHT, WATER, FIRE, EARTH, WIND, DIVINE)
- `level` : Niveau (1-12)
- `archetype` : Archétype (Blue-Eyes, Dark Magician, etc.)
- `max` : Nombre max de résultats (1-100) [défaut: 20]
- `sort` : Tri (name, atk, def, level) [défaut: "name"]
- `lang` : Langue (en, fr, de, it, pt) [défaut: "en"]
- `autoTrad` : Traduction automatique (true/false) [défaut: false]

#### `/card/:id`
- `:id` : ID YGOPRODeck (ex: "46986414" pour Dark Magician)
- `lang` : Langue [défaut: "en"]
- `autoTrad` : Traduction automatique [défaut: false]

#### `/archetype`
- `name` (requis) : Nom de l'archétype
- `max` : Nombre max de résultats (1-100) [défaut: 20]
- `lang` : Langue [défaut: "en"]
- `autoTrad` : Traduction automatique [défaut: false]

#### `/sets`
- Aucun paramètre (retourne tous les sets)

**Exemples de recherche** :
```bash
# Recherche simple
GET /api/tcg/yugioh/search?q=Dark+Magician

# Recherche par type
GET /api/tcg/yugioh/search?q=dragon&type=Monster&race=Dragon&max=10

# Recherche par attribut et niveau
GET /api/tcg/yugioh/search?q=warrior&attribute=EARTH&level=4

# Carte par ID
GET /api/tcg/yugioh/card/46986414

# Recherche par archétype
GET /api/tcg/yugioh/archetype?name=Blue-Eyes&max=20

# Sets
GET /api/tcg/yugioh/sets

# Health check
GET /api/tcg/yugioh/health
```

**Exemple de réponse (recherche)** :
```json
{
  "success": true,
  "provider": "yugioh",
  "query": "Dark Magician",
  "total": 14,
  "count": 2,
  "data": [
    {
      "id": "46986414",
      "source": "yugioh",
      "collection": "Yu-Gi-Oh! Trading Card Game",
      "title": "Dark Magician",
      "subtitle": "Normal Monster",
      "description": "Normal Monster - ''The ultimate wizard in terms of attack and defense.''",
      "image": "https://images.ygoprodeck.com/images/cards/46986414.jpg",
      "thumbnail": "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
      "year": 2002,
      "metadata": {
        "type": "Normal Monster",
        "race": "Spellcaster",
        "archetype": "Dark Magician",
        "atk": 2500,
        "def": 2100,
        "level": 7,
        "attribute": "DARK"
      },
      "detailUrl": "/api/tcg/yugioh/card/46986414"
    }
  ],
  "meta": {
    "fetchedAt": "2026-01-30T08:27:32.382Z",
    "lang": "en",
    "autoTrad": false,
    "sort": "name"
  }
}
```

**Exemple de réponse (détails)** :
```json
{
  "success": true,
  "provider": "yugioh",
  "data": {
    "id": "46986414",
    "source": "yugioh",
    "title": "Dark Magician",
    "subtitle": "Normal Monster",
    "description": "''The ultimate wizard in terms of attack and defense.''",
    "images": [
      {
        "url": "https://images.ygoprodeck.com/images/cards/46986414.jpg",
        "thumbnail": "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
        "cropped": "https://images.ygoprodeck.com/images/cards_cropped/46986414.jpg",
        "caption": "Carte",
        "isMain": true
      }
    ],
    "year": 2002,
    "metadata": {
      "type": "Normal Monster",
      "frameType": "normal",
      "race": "Spellcaster",
      "archetype": "Dark Magician",
      "atk": 2500,
      "def": 2100,
      "level": 7,
      "attribute": "DARK",
      "cardSets": [
        {
          "name": "2016 Mega-Tins",
          "code": "CT13-EN003",
          "rarity": "Ultra Rare",
          "rarityCode": "(UR)",
          "price": "6.97"
        }
      ],
      "banlistInfo": {
        "tcg": "Unlimited",
        "ocg": "Unlimited",
        "goat": "Unlimited"
      },
      "ygoprodeckUrl": "https://ygoprodeck.com/card/dark-magician-46986414"
    },
    "prices": {
      "cardmarket": "1.23",
      "tcgplayer": "2.45",
      "ebay": "3.50",
      "amazon": "4.99",
      "coolstuffinc": "2.99",
      "currency": "USD/EUR",
      "source": "ygoprodeck",
      "updatedAt": "2026-01-30T08:27:35.610Z"
    },
    "externalLinks": {
      "ygoprodeck": "https://ygoprodeck.com/card/dark-magician-46986414",
      "cardmarket": "https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=Dark+Magician",
      "tcgplayer": "https://www.tcgplayer.com/search/yugioh/product?q=Dark+Magician"
    }
  },
  "meta": {
    "fetchedAt": "2026-01-30T08:27:35.610Z",
    "lang": "en"
  }
}
```

**Exemple de réponse (archétype)** :
```json
{
  "success": true,
  "provider": "yugioh",
  "archetype": "Blue-Eyes",
  "total": 40,
  "count": 3,
  "data": [
    {
      "id": "50371210",
      "source": "yugioh",
      "collection": "Yu-Gi-Oh! Trading Card Game",
      "title": "Beacon of White",
      "subtitle": "Spell Card",
      "description": "Spell Card - If you do not control another \"Beacon of White\"...",
      "image": "https://images.ygoprodeck.com/images/cards/50371210.jpg",
      "thumbnail": "https://images.ygoprodeck.com/images/cards_small/50371210.jpg",
      "year": null,
      "metadata": {
        "type": "Spell Card",
        "race": "Normal",
        "archetype": "Blue-Eyes"
      },
      "detailUrl": "/api/tcg/yugioh/card/50371210"
    }
  ],
  "meta": {
    "fetchedAt": "2026-01-30T08:28:00.000Z",
    "lang": "en",
    "autoTrad": false
  }
}
```

**Notes** :
- Aucune clé API requise
- Rate limiting : 50ms entre requêtes (20 req/sec)
- Langues supportées : en, fr, de, it, pt
- Types de cartes : Monster, Spell, Trap (+ variations : Effect, Fusion, Synchro, Xyz, Link, Pendulum)
- Banlist info : TCG, OCG, GOAT formats
- Prix : Cardmarket, TCGPlayer, eBay, Amazon, CoolStuffInc
- Images : 3 formats (normal, small, cropped)

**Cas d'usage** :
- Recherche de cartes par nom, type, race
- Exploration des archétypes (Blue-Eyes, Dark Magician, etc.)
- Vérification des prix multi-sources
- Consultation du banlist (TCG/OCG)
- Construction de deck par attribut/niveau
- Recherche de Link/Pendulum monsters

**Exemple de réponse (détails)** :
```json
{
  "success": true,
  "provider": "pokemon",
  "data": {
    "id": "base1-4",
    "source": "pokemon",
    "title": "Charizard",
    "subtitle": "Pokemon",
    "description": "**Energy Burn** (Pokémon Power): As often as you like during your turn (before your attack), you may turn all Energy attached to Charizard into Fire Energy for the rest of the turn.\n\n**Fire Spin** (Fire Fire Fire Fire): Discard 2 Energy cards attached to Charizard. [100]",
    "flavorText": "Spits fire that is hot enough to melt boulders. Known to cause forest fires unintentionally.",
    "images": [
      {
        "url": "https://images.pokemontcg.io/base1/4_hires.png",
        "thumbnail": "https://images.pokemontcg.io/base1/4.png",
        "caption": "Carte normale",
        "isMain": true
      }
    ],
    "year": 1999,
    "metadata": {
      "set": {
        "id": "base1",
        "name": "Base",
        "series": "Base",
        "printedTotal": 102,
        "releaseDate": "1999-01-09",
        "logo": "https://images.pokemontcg.io/base1/logo.png",
        "symbol": "https://images.pokemontcg.io/base1/symbol.png"
      },
      "number": "4",
      "cardNumber": "4/102",
      "supertype": "Pokemon",
      "subtypes": ["Stage 2"],
      "types": ["Fire"],
      "hp": "120",
      "rarity": "Rare Holo",
      "artist": "Mitsuhiro Arita",
      "evolvesFrom": "Charmeleon",
      "evolvesTo": [],
      "attacks": [
        {
          "name": "Fire Spin",
          "cost": ["Fire", "Fire", "Fire", "Fire"],
          "convertedEnergyCost": 4,
          "damage": "100",
          "text": "Discard 2 Energy cards attached to Charizard in order to use this attack."
        }
      ],
      "abilities": [
        {
          "name": "Energy Burn",
          "text": "As often as you like during your turn (before your attack), you may turn all Energy attached to Charizard into Fire Energy for the rest of the turn. This power can't be used if Charizard is Asleep, Confused, or Paralyzed.",
          "type": "Pokémon Power"
        }
      ],
      "weaknesses": [
        {
          "type": "Water",
          "value": "×2"
        }
      ],
      "resistances": [
        {
          "type": "Fighting",
          "value": "-30"
        }
      ],
      "retreatCost": ["Colorless", "Colorless", "Colorless"],
      "rules": [],
      "regulationMark": null,
      "legalities": {
        "unlimited": "Legal",
        "standard": "Banned",
        "expanded": "Banned"
      },
      "nationalPokedexNumbers": [6]
    },
    "prices": {
      "currency": "USD",
      "low": 150.00,
      "mid": 300.00,
      "high": 600.00,
      "market": 275.00,
      "source": "tcgplayer",
      "updatedAt": "2026-01-30T00:00:00Z"
    },
    "externalLinks": {
      "tcgplayer": "https://prices.pokemontcg.io/tcgplayer/base1-4",
      "cardmarket": "https://prices.pokemontcg.io/cardmarket/base1-4"
    }
  },
  "meta": {
    "fetchedAt": "2026-01-30T08:15:00.000Z",
    "lang": "fr",
    "autoTrad": true
  }
}
```

**Particularités** :

- **Syntaxe Lucene** : L'API supporte des recherches avancées (ex: `name:pikachu* types:lightning`)
- **IDs de cartes** : Format `{set}-{number}` (ex: base1-4, swsh1-25)
- **Prix multiples** : TCGPlayer (USD) et Cardmarket (EUR) quand disponibles
- **Traduction** : Descriptions et flavor text traduits si `autoTrad=true`
- **Images haute qualité** : Versions normale et HD disponibles
- **Légalité** : Formats Standard, Expanded, Unlimited
- **Évolution** : Chaîne complète avec `evolvesFrom` et `evolvesTo`
- **Attaques** : Coûts énergétiques détaillés, dégâts, effets
- **Numérotation** : Numéro de carte imprimé (peut différer du total réel)

**Cas d'usage** :

- **Collectionneurs** : Recherche de cartes, consultation des prix
- **Joueurs** : Vérification légalité, consultation des attaques
- **Decklists** : Construction de decks avec filtres avancés
- **Inventaire** : Gestion de collection avec sets et numéros
- **Commerce** : Prix du marché TCGPlayer et Cardmarket

**Prérequis** :
- API Key optionnelle mais recommandée (rate limit 5x plus élevé)
- Variable d'environnement : `TCG_POKEMON_TOKEN`
- Sans clé : 1000 requêtes/jour
- Avec clé : 5000 requêtes/jour

**Note importante** :
L'API pokemontcg.io peut parfois être lente ou indisponible. En cas d'erreur 504, réessayez quelques secondes plus tard.

---

### Digimon TCG

> **Base URL** : `/api/tcg/digimon`  
> **Source** : [digimoncard.dev](https://digimoncard.dev)  
> **API Key** : ❌ Non requise  
> **Rate Limit** : Non spécifié

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de cartes Digimon | ✅ Fonctionne |
| `GET /card/:id` | Détails d'une carte | ✅ Fonctionne |

**Paramètres de recherche** :
- `q` : Terme de recherche (requis)
- `type` : Type de carte (Digimon, Tamer, Option)
- `color` : Couleur (Red, Blue, Yellow, Green, Black, Purple, White)
- `level` : Niveau
- `series` : Série (défaut: "Digimon Card Game")
- `attribute` : Attribut
- `rarity` : Rareté
- `stage` : Stage d'évolution
- `max` : Résultats max (défaut: 100, max: 250)
- `lang` : Langue (défaut: en)
- `autoTrad` : Traduction automatique (défaut: false)

---

### Lorcana TCG

> **Base URL** : `/api/tcg/lorcana`  
> **Source** : [LorcanaJSON](https://lorcanajson.org) (`lorcanajson.org/files/current/{lang}/allCards.json`)  
> **API Key** : ❌ Non requise  
> **Note** : Langues supportées : en, fr, de, it. Données enrichies avec métadonnées des sets (nom, date de sortie). Liens externes vers TCGPlayer, Cardmarket, CardTrader.

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche de cartes Lorcana | ✅ Fonctionne |
| `GET /card/:id` | Détails d'une carte | ✅ Fonctionne |
| `GET /sets` | Liste de tous les sets | ✅ Fonctionne |

**Paramètres de recherche** :
- `q` : Terme de recherche (requis)
- `color` : Encre (Amber, Amethyst, Emerald, Ruby, Sapphire, Steel)
- `type` : Type (Character, Item, Action, Location)
- `rarity` : Rareté
- `set` : Code du set
- `cost` : Coût en encre (entier)
- `inkable` : Peut produire de l'encre ("true" ou "false")
- `max` : Résultats max (défaut: 100, max: 250)
- `page` : Page (défaut: 1)
- `lang` : Langue (défaut: en, validé: en/fr/de/it)
- `autoTrad` : Traduction automatique (défaut: false)

---

### One Piece TCG

> **Base URL** : `/api/tcg/onepiece`  
> **Source** : API One Piece TCG  
> **API Key** : ❌ Non requise  
> **Note** : `q` est **optionnel** (recherche sans filtre texte possible)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search` | Recherche de cartes One Piece | ✅ Fonctionne |
| `GET /card/:id` | Détails d'une carte | ✅ Fonctionne |
| `GET /image/:cardId` | Proxy image (bypass Cloudflare) | ✅ Fonctionne |

**Paramètres de recherche** :
- `q` : Terme de recherche (**optionnel**, une chaîne vide est acceptée)
- `color` : Couleur
- `type` : Type (Leader, Character, Event, Stage)
- `rarity` : Rareté
- `cost` : Coût (entier)
- `max` : Résultats max (défaut: 100, max: 250)
- `lang` : Langue (défaut: en)
- `autoTrad` : Traduction automatique (défaut: false)

---

## 🎵 Music / Musique

### Discogs

> **Base URL** : `/api/music/discogs`  
> **Source** : [discogs.com](https://www.discogs.com)  
> **API Key** : ⚠️ Optionnelle (`DISCOG_API_KEY`) - 25 req/min sans, 60 avec  
> **Rate Limit** : 25-60 requêtes / minute selon auth

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale | ✅ Fonctionne |
| `GET /search/albums?q=` | Recherche de releases | ✅ Fonctionne |
| `GET /search/masters?q=` | Recherche de masters | ✅ Fonctionne |
| `GET /search/artists?q=` | Recherche d'artistes | ✅ Fonctionne |
| `GET /search/labels?q=` | Recherche de labels | ✅ Fonctionne |
| `GET /barcode/:barcode` | Recherche par code-barres | ✅ Fonctionne |
| `GET /releases/:id` | Détails d'une release | ✅ Fonctionne |
| `GET /masters/:id` | Détails d'un master | ✅ Fonctionne |
| `GET /masters/:id/versions` | Versions d'un master | ✅ Fonctionne |
| `GET /artists/:id` | Détails d'un artiste | ✅ Fonctionne |
| `GET /artists/:id/releases` | Discographie d'un artiste | ✅ Fonctionne |
| `GET /labels/:id` | Détails d'un label | ✅ Fonctionne |
| `GET /labels/:id/releases` | Releases d'un label | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `type` : Type (release, master, artist, label)
- `page` : Numéro de page
- `perPage` : Résultats par page (défaut: 25)
- `autoTrad` : Traduction automatique

**Données retournées** :
- **Releases** : titre, artistes, labels, formats, tracklist, images, code-barres
- **Masters** : version canonique, artistes principaux, versions disponibles
- **Artistes** : nom, profil, alias, membres (groupes), discographie
- **Labels** : nom, profil, sous-labels, releases publiées

---

### Deezer

> **Base URL** : `/api/music/deezer`  
> **Source** : [deezer.com](https://www.deezer.com)  
> **API Key** : ❌ Non requise  
> **Rate Limit** : Non spécifié (usage raisonnable)

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale | ✅ Fonctionne |
| `GET /search/albums?q=` | Recherche d'albums | ✅ Fonctionne |
| `GET /search/artists?q=` | Recherche d'artistes | ✅ Fonctionne |
| `GET /search/tracks?q=` | Recherche de tracks | ✅ Fonctionne |
| `GET /albums/:id` | Détails d'un album | ✅ Fonctionne |
| `GET /albums/:id/tracks` | Tracks d'un album | ✅ Fonctionne |
| `GET /artists/:id` | Détails d'un artiste | ✅ Fonctionne |
| `GET /artists/:id/top` | Top tracks artiste | ✅ Fonctionne |
| `GET /artists/:id/albums` | Albums d'un artiste | ✅ Fonctionne |
| `GET /artists/:id/related` | Artistes similaires | ✅ Fonctionne |
| `GET /tracks/:id` | Détails d'un track | ✅ Fonctionne |
| `GET /genres` | Liste des genres | ✅ Fonctionne |
| `GET /chart/albums` | Charts albums | ✅ Fonctionne |
| `GET /chart/tracks` | Charts tracks | ✅ Fonctionne |
| `GET /chart/artists` | Charts artistes | ✅ Fonctionne |
| `GET /charts` | **🆕 Charts unifié** (albums/tracks/artists) | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `limit` : Nombre de résultats (défaut: 25)
- `index` : Offset pour pagination
- `category` : Type de chart (albums/tracks/artists) pour endpoint `/charts`

**Données retournées** :
- **Albums** : titre, artiste, cover, tracklist, durée, genres
- **Artistes** : nom, image, fans, top tracks, discographie
- **Tracks** : titre, durée, preview 30s, BPM, artiste, album
- **Charts** : tops albums/tracks/artistes avec position, rank, tendances

**Exemple - Charts Deezer** :
```bash
# Top albums France
curl "http://localhost:3000/api/music/deezer/charts?category=albums&limit=10"

# Top tracks
curl "http://localhost:3000/api/music/deezer/charts?category=tracks&limit=20"

# Top artistes
curl "http://localhost:3000/api/music/deezer/charts?category=artists&limit=15"
```

---

### MusicBrainz

> **Base URL** : `/api/music/musicbrainz`  
> **Source** : [musicbrainz.org](https://musicbrainz.org)  
> **API Key** : ❌ Non requise (User-Agent requis)  
> **Rate Limit** : 1 requête / seconde (stricte)  
> **Note** : Base de données libre et communautaire

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale | ✅ Fonctionne |
| `GET /search/albums?q=` | Recherche d'albums (release-groups) | ✅ Fonctionne |
| `GET /search/artists?q=` | Recherche d'artistes | ✅ Fonctionne |
| `GET /barcode/:barcode` | Recherche par code-barres (UPC/EAN) | ✅ Fonctionne |
| `GET /albums/:id` | Détails d'un album | ✅ Fonctionne |
| `GET /albums/:id/cover` | Pochette album (Cover Art Archive) | ✅ Fonctionne |
| `GET /artists/:id` | Détails d'un artiste | ✅ Fonctionne |
| `GET /artists/:id/albums` | Albums d'un artiste | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `limit` : Nombre de résultats (défaut: 25)
- `offset` : Décalage pour pagination
- `type` : Type d'album (album, single, ep, etc.)

**Données retournées** :
- **Albums** : titre, artistes, date, type, tags, rating, pochette (Cover Art Archive)
- **Artistes** : nom, type (personne/groupe), pays, tags, liens externes
- **Barcode** : release correspondant au code-barres avec détails complets

---

### iTunes

> **Base URL** : `/api/music/itunes`  
> **Source** : [itunes.apple.com](https://itunes.apple.com)  
> **API Key** : ❌ Non requise  
> **Rate Limit** : ~20 requêtes / minute

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /health` | Health check | ✅ Fonctionne |
| `GET /search?q=` | Recherche globale | ✅ Fonctionne |
| `GET /search/albums?q=` | Recherche d'albums | ✅ Fonctionne |
| `GET /search/artists?q=` | Recherche d'artistes | ✅ Fonctionne |
| `GET /search/tracks?q=` | Recherche de tracks | ✅ Fonctionne |
| `GET /albums/:id` | Détails d'un album + tracks | ✅ Fonctionne |
| `GET /artists/:id` | Détails d'un artiste | ✅ Fonctionne |
| `GET /artists/:id/albums` | Albums d'un artiste | ✅ Fonctionne |
| `GET /tracks/:id` | Détails d'un track | ✅ Fonctionne |
| `GET /charts` | **🆕 Charts par pays** (albums/songs) | ✅ Fonctionne |

**Paramètres communs** :
- `q` : Terme de recherche
- `limit` : Nombre de résultats (défaut: 25, max: 200)
- `country` : Code pays (défaut: FR)
- `category` : Type de chart (album/song) pour endpoint `/charts`

**Données retournées** :
- **Albums** : titre, artiste, cover HD, tracklist, prix, date
- **Artistes** : nom, genre principal, liens iTunes/Apple Music
- **Tracks** : titre, durée, preview 30s, prix, explicit flag
- **Charts** : top albums/songs par pays via RSS feed iTunes
- Support multi-pays pour prix et disponibilité

**Exemple - Charts iTunes** :
```bash
# Top albums France
curl "http://localhost:3000/api/music/itunes/charts?country=fr&category=album&limit=10"

# Top songs US
curl "http://localhost:3000/api/music/itunes/charts?country=us&category=song&limit=20"

# Top albums UK
curl "http://localhost:3000/api/music/itunes/charts?country=gb&category=album"
```

---

## 🔧 Paramètres globaux

Ces paramètres sont disponibles sur la plupart des endpoints de recherche :

| Paramètre | Type | Description |
|-----------|------|-------------|
| `q` | string | Terme de recherche (requis) |
| `maxResults` | number | Nombre max de résultats |
| `page` | number | Numéro de page |
| `lang` | string | Code langue cible (fr, en, de, es, it, pt) |
| `autoTrad` | boolean | Activer la traduction automatique |

---

## 📊 Légende des statuts

| Status | Signification |
|--------|---------------|
| ✅ Fonctionne | Endpoint pleinement opérationnel |
| ⚠️ Partiel | Fonctionne mais données incomplètes ou améliorations possibles |
| ❌ Non implémenté | Route déclarée mais pas encore fonctionnelle |
| 🔧 En maintenance | Temporairement indisponible |

---

## 🚀 Exemple d'utilisation

```bash
# Recherche de comics sur ComicVine
curl "http://localhost:3000/api/comics/comicvine/search?q=batman&maxResults=5"

# Albums d'une série Bedetheque
curl "http://localhost:3000/api/comics/bedetheque/serie/59/albums"

# Recherche de livres sur OpenLibrary
curl "http://localhost:3000/api/books/openlibrary/search?q=dune"

# Recherche de sets LEGO sur Brickset
curl "http://localhost:3000/construction-toys/brickset/search?q=star%20wars"

# Recherche de manga sur MangaUpdates avec titre français
curl "http://localhost:3000/api/anime-manga/mangaupdates/search?q=one%20piece&frenchTitle=1"

# Œuvres d'un auteur manga (Eiichiro Oda)
curl "http://localhost:3000/api/anime-manga/mangaupdates/author/30829461792/works"

# Liste des genres manga avec statistiques
curl "http://localhost:3000/api/anime-manga/mangaupdates/genres"

# Recherche de films sur TMDB
curl "http://localhost:3000/api/media/tmdb/search/movies?q=matrix"

# Détails d'un film TMDB avec traduction auto
curl "http://localhost:3000/api/media/tmdb/movies/603?autoTrad=1"

# Détails d'une série TMDB
curl "http://localhost:3000/api/media/tmdb/series/1399"

# Saison d'une série TMDB
curl "http://localhost:3000/api/media/tmdb/series/1399/season/1"

# Collection/Saga TMDB (Matrix)
curl "http://localhost:3000/api/media/tmdb/collections/2344"

# Filmographie d'un réalisateur TMDB
curl "http://localhost:3000/api/media/tmdb/directors/525/movies"

# Recherche TVDB
curl "http://localhost:3000/api/media/tvdb/search?q=breaking%20bad"

# Détails série TVDB avec traduction française
curl "http://localhost:3000/api/media/tvdb/series/81189?lang=fr"

# Saisons d'une série TVDB
curl "http://localhost:3000/api/media/tvdb/series/81189/seasons"

# Épisode TVDB par ID
curl "http://localhost:3000/api/media/tvdb/episodes/349232"

# Recherche anime Jikan
curl "http://localhost:3000/api/anime-manga/jikan/search/anime?q=naruto"

# Recherche globale Jikan (anime + manga)
curl "http://localhost:3000/api/anime-manga/jikan/search?q=one%20piece"

# Détails anime Jikan (Cowboy Bebop = 1)
curl "http://localhost:3000/api/anime-manga/jikan/anime/1"

# Épisodes d'un anime
curl "http://localhost:3000/api/anime-manga/jikan/anime/1/episodes"

# Personnages d'un anime avec doubleurs
curl "http://localhost:3000/api/anime-manga/jikan/anime/21/characters"

# Détails manga Jikan (Berserk = 2)
curl "http://localhost:3000/api/media-manga/jikan/manga/2"

# Top anime par score MAL
curl "http://localhost:3000/api/anime-manga/jikan/top/anime"

# Anime de la saison actuelle
curl "http://localhost:3000/api/anime-manga/jikan/seasons/now"

# Anime Winter 2024
curl "http://localhost:3000/api/anime-manga/jikan/seasons/2024/winter"

# Programme de diffusion du lundi
curl "http://localhost:3000/api/anime-manga/jikan/schedules/monday"

# Anime aléatoire (contenu adulte possible)
curl "http://localhost:3000/api/anime-manga/jikan/anime/random"

# Recherche personnage
curl "http://localhost:3000/api/anime-manga/jikan/search/characters?q=luffy"

# Détails d'un seiyuu/acteur
curl "http://localhost:3000/api/anime-manga/jikan/people/118"

# Liste des genres anime
curl "http://localhost:3000/api/anime-manga/jikan/genres/anime"

# ===== VIDEOGAMES =====

# Recherche jeux IGDB
curl "http://localhost:3000/api/videogames/igdb/search?q=zelda&limit=10"

# Recherche avancée IGDB (PC, RPG, note > 80)
curl "http://localhost:3000/api/videogames/igdb/advanced-search?platforms=6&genres=12&minRating=80"

# Détails jeu IGDB avec traduction FR
curl "http://localhost:3000/api/videogames/igdb/game/1074?lang=fr&autoTrad=1"

# Détails jeu par slug IGDB
curl "http://localhost:3000/api/videogames/igdb/game/slug/the-witcher-3-wild-hunt"

# Genres disponibles IGDB
curl "http://localhost:3000/api/videogames/igdb/genres"

# Plateformes IGDB
curl "http://localhost:3000/api/videogames/igdb/platforms"

# Recherche compagnie IGDB
curl "http://localhost:3000/api/videogames/igdb/companies/search?q=nintendo"

# Jeux développés par Nintendo
curl "http://localhost:3000/api/videogames/igdb/companies/70/games/developed"

# Recherche franchise IGDB
curl "http://localhost:3000/api/videogames/igdb/franchises/search?q=final%20fantasy"

# Top jeux IGDB
curl "http://localhost:3000/api/videogames/igdb/top-rated?limit=20"

# Jeux à venir IGDB
curl "http://localhost:3000/api/videogames/igdb/upcoming?limit=10"

# Recherche jeux RAWG
curl "http://localhost:3000/api/videogames/rawg/search?q=witcher"

# Recherche avancée RAWG (PS5, Action, Metacritic > 90)
curl "http://localhost:3000/api/videogames/rawg/advanced-search?platforms=187&genres=4&metacritic=90,100"

# Détails jeu RAWG avec traduction FR
curl "http://localhost:3000/api/videogames/rawg/game/3328?lang=fr&autoTrad=1"

# Screenshots d'un jeu RAWG
curl "http://localhost:3000/api/videogames/rawg/game/3328/screenshots"

# Achievements d'un jeu RAWG
curl "http://localhost:3000/api/videogames/rawg/game/3328/achievements"

# DLCs d'un jeu RAWG
curl "http://localhost:3000/api/videogames/rawg/game/3328/additions"

# Genres disponibles RAWG
curl "http://localhost:3000/api/videogames/rawg/genres"

# Développeurs RAWG
curl "http://localhost:3000/api/videogames/rawg/developers?page=1&page_size=20"

# Jeux d'un développeur RAWG (CD Projekt Red)
curl "http://localhost:3000/api/videogames/rawg/developers/9023/games"

# Top jeux RAWG
curl "http://localhost:3000/api/videogames/rawg/top-rated?page_size=20"

# Recherche jeux JVC
curl "http://localhost:3000/api/videogames/jvc/search?q=zelda"

# Détails jeu JVC avec traduction EN
curl "http://localhost:3000/api/videogames/jvc/game/114792?lang=en&autoTrad=1"

# Health check JVC (vérifie FlareSolverr)
curl "http://localhost:3000/api/videogames/jvc/health"

# Recherche variations consoles (toutes)
curl "http://localhost:3000/api/videogames/consolevariations/search?q=playstation%202"

# Recherche uniquement consoles Nintendo
curl "http://localhost:3000/api/videogames/consolevariations/search?q=nintendo&type=consoles&max=30"

# Recherche controllers Xbox
curl "http://localhost:3000/api/videogames/consolevariations/search?q=xbox&type=controllers"

# Détails variation avec traduction française
curl "http://localhost:3000/api/videogames/consolevariations/item/sony-playstation-2-slim-silver?lang=fr&autoTrad=1"

# Liste des marques
curl "http://localhost:3000/api/videogames/consolevariations/platforms"

# Plateformes Nintendo
curl "http://localhost:3000/api/videogames/consolevariations/platforms?brand=nintendo"

# Browse variations NES
curl "http://localhost:3000/api/videogames/consolevariations/browse/nes?max=50"

# Health check ConsoleVariations
curl "http://localhost:3000/api/videogames/consolevariations/health"

# ===== COLLECTIBLES =====

# Recherche LEGO Star Wars
curl "http://localhost:3000/api/collectibles/coleka/search?q=lego%20star%20wars&max=10"

# Recherche uniquement Funko Pop Batman
curl "http://localhost:3000/api/collectibles/coleka/search?q=batman&category=funko"

# Recherche figurines Marvel
curl "http://localhost:3000/api/collectibles/coleka/search?q=marvel&category=figurines&lang=fr"

# Détails item avec traduction anglaise
curl "http://localhost:3000/api/collectibles/coleka/item/fr/lego/technic/42100-liebherr-r-9800_i123456?lang=en&autoTrad=1"

# Liste des catégories Coleka
curl "http://localhost:3000/api/collectibles/coleka/categories"

# Health check Coleka (FlareSolverr)
curl "http://localhost:3000/api/collectibles/coleka/health"

# Recherche figurines Final Fantasy (Lulu-Berlu)
curl "http://localhost:3000/api/collectibles/luluberlu/search?q=squall&max=6"

# Recherche LEGO vintage (Lulu-Berlu)
curl "http://localhost:3000/api/collectibles/luluberlu/search?q=lego%20star%20wars"

# Détails par URL complète (Lulu-Berlu)
curl "http://localhost:3000/api/collectibles/luluberlu/details?url=https://www.lulu-berlu.com/final-fantasy-viii-bandai-figurine-15cm-squall-leonhart-a47524.html"

# Détails item par path (Lulu-Berlu)
curl "http://localhost:3000/api/collectibles/luluberlu/item/final-fantasy-viii-bandai-figurine-15cm-squall-leonhart-a47524.html"

# Détails avec traduction anglaise (Lulu-Berlu)
curl "http://localhost:3000/api/collectibles/luluberlu/item/final-fantasy-viii-bandai-figurine-15cm-squall-leonhart-a47524.html?lang=en&autoTrad=1"

# Health check Lulu-Berlu (FlareSolverr)
curl "http://localhost:3000/api/collectibles/luluberlu/health"

# ===== MUSIC =====

# Recherche albums sur Discogs
curl "http://localhost:3000/api/music/discogs/search/albums?q=daft%20punk"

# Détails d'une release Discogs (Random Access Memories)
curl "http://localhost:3000/api/music/discogs/releases/4571215"

# Recherche par code-barres Discogs
curl "http://localhost:3000/api/music/discogs/barcode/0887654764225"

# Discographie d'un artiste Discogs
curl "http://localhost:3000/api/music/discogs/artists/3289/releases"

# Recherche albums sur Deezer
curl "http://localhost:3000/api/music/deezer/search/albums?q=discovery"

# Détails album Deezer
curl "http://localhost:3000/api/music/deezer/albums/302127"

# Top tracks d'un artiste Deezer
curl "http://localhost:3000/api/music/deezer/artists/27/top"

# Charts albums Deezer
curl "http://localhost:3000/api/music/deezer/chart/albums"

# Recherche albums MusicBrainz
curl "http://localhost:3000/api/music/musicbrainz/search/albums?q=ok%20computer"

# Détails artiste MusicBrainz (Radiohead)
curl "http://localhost:3000/api/music/musicbrainz/artists/a74b1b7f-71a5-4011-9441-d0b5e4122711"

# Pochette album MusicBrainz (via Cover Art Archive)
curl "http://localhost:3000/api/music/musicbrainz/albums/a4864e94-6d75-3622-b477-f9ac58ed24c0/cover"

# Recherche iTunes
curl "http://localhost:3000/api/music/itunes/search?q=beyonce"

# Détails album iTunes avec tracks
curl "http://localhost:3000/api/music/itunes/albums/1440935467"

# Albums d'un artiste iTunes
curl "http://localhost:3000/api/music/itunes/artists/1419227/albums?country=FR"

# ===== E-COMMERCE =====

# Liste des marketplaces Amazon supportés
curl "http://localhost:3000/api/ecommerce/amazon/marketplaces"

# Liste des catégories Amazon supportées
curl "http://localhost:3000/api/ecommerce/amazon/categories"

# Recherche LEGO sur Amazon France
curl "http://localhost:3000/api/ecommerce/amazon/search?q=lego&country=fr&limit=10"

# Recherche dans catégorie jeux vidéo Amazon US
curl "http://localhost:3000/api/ecommerce/amazon/search?q=nintendo&country=us&category=videogames"

# Détails d'un produit par ASIN (Amazon Standard Identification Number)
curl "http://localhost:3000/api/ecommerce/amazon/product/B01N6CJ1QW?country=fr"

# Comparaison de prix multi-pays (France, USA, UK)
curl "http://localhost:3000/api/ecommerce/amazon/compare/B01N6CJ1QW?countries=fr,us,uk"

# Comparaison sur tous les marketplaces
curl "http://localhost:3000/api/ecommerce/amazon/compare/B01N6CJ1QW?countries=fr,us,uk,de,es,it,ca,jp"

# Health check Amazon (via FlareSolverr)
curl "http://localhost:3000/api/ecommerce/amazon/health"
```

---

## 🛒 E-commerce

### Amazon

> **Base URL** : `/api/ecommerce/amazon`  
> **Source** : Amazon multi-marketplaces (8 pays)  
> **API Key** : ❌ Non requise (scraping via FlareSolverr)  
> **Rate Limit** : Recommandé : 1 requête / 3 secondes  
> **VPN** : Gluetun (PIA OpenVPN) — proxy HTTP pour contourner le blocage IP Amazon  
> **Anti-WAF** : Détection automatique AWS WAF challenge + warm-up session + retry

#### 📊 Marketplaces supportés

| Code | Marketplace | Domaine | Devise |
|------|-------------|---------|--------|
| `fr` | Amazon France | www.amazon.fr | EUR |
| `us` | Amazon US | www.amazon.com | USD |
| `uk` | Amazon UK | www.amazon.co.uk | GBP |
| `de` | Amazon Allemagne | www.amazon.de | EUR |
| `es` | Amazon Espagne | www.amazon.es | EUR |
| `it` | Amazon Italie | www.amazon.it | EUR |
| `ca` | Amazon Canada | www.amazon.ca | CAD |
| `jp` | Amazon Japon | www.amazon.co.jp | JPY |

#### 📦 Catégories supportées

| Code | Nom |
|------|-----|
| `all` | Tous les produits |
| `videogames` | Jeux vidéo |
| `toys` | Jouets |
| `books` | Livres |
| `music` | Musique |
| `movies` | Films & Séries |
| `electronics` | Électronique |

#### 🛣 Routes

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /marketplaces` | Liste des marketplaces supportés | ✅ Fonctionne |
| `GET /categories` | Liste des catégories supportées | ✅ Fonctionne |
| `GET /search?q=&country=&category=` | Recherche de produits | ✅ Fonctionne |
| `GET /product/:asin?country=` | Détails d'un produit par ASIN | ✅ Fonctionne |
| `GET /compare/:asin?countries=` | Comparaison de prix multi-pays | ✅ Fonctionne |
| `GET /health` | Health check FlareSolverr | ✅ Fonctionne |

**Paramètres de recherche (`/search`)** :
- `q` : Terme de recherche (requis)
- `country` : Code marketplace (défaut: `fr`)
- `category` : Code catégorie (défaut: `all`)
- `page` : Numéro de page (défaut: 1)
- `limit` : Résultats par page (défaut: 20, max: 50)
- `lang` : Langue cible pour traduction (défaut: `fr`)
- `autotrad` : Activer traduction auto (`true`/`false`)

**Paramètres de détails (`/product/:asin`)** :
- `asin` : Amazon Standard Identification Number (10 caractères alphanumériques)
- `country` : Code marketplace (défaut: `fr`)
- `lang` : Langue cible
- `autotrad` : Activer traduction auto

**Paramètres de comparaison (`/compare/:asin`)** :
- `asin` : Amazon Standard Identification Number
- `countries` : Liste de codes pays séparés par virgule (défaut: `fr,us,uk,de`)

**Format de réponse normalisé** :

```json
{
  "data": [
    {
      "id": "amazon:B01N6CJ1QW",
      "sourceId": "B01N6CJ1QW",
      "title": "LEGO Botanicals 10343 Miniature Orchid",
      "description": "Description du produit...",
      "images": {
        "primary": "https://m.media-amazon.com/images/I/71EeFX1HCsL._SL500_.jpg",
        "thumbnail": "https://m.media-amazon.com/images/I/71EeFX1HCsL._SL160_.jpg"
      },
      "urls": {
        "detail": "/api/ecommerce/amazon/product/B01N6CJ1QW",
        "source": "https://www.amazon.fr/dp/B01N6CJ1QW"
      },
      "details": {
        "asin": "B01N6CJ1QW",
        "marketplace": "fr",
        "marketplaceName": "Amazon France",
        "price": 19.99,
        "priceFormatted": "€19,99",
        "currency": "EUR",
        "isPrime": true,
        "rating": 4.8,
        "reviewCount": 1234
      }
    }
  ],
  "domain": "ecommerce",
  "provider": "amazon",
  "query": "lego",
  "total": 24,
  "count": 20,
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalResults": 24,
    "totalPages": 2,
    "hasMore": true
  },
  "meta": {
    "fetchedAt": "2026-03-06T13:07:11.956Z",
    "lang": "fr",
    "country": "fr",
    "category": "Tous",
    "autoTrad": false
  }
}
```

**Format de comparaison de prix** :

```json
{
  "success": true,
  "provider": "amazon",
  "data": {
    "asin": "B01N6CJ1QW",
    "source": "amazon",
    "comparison": [
      {
        "marketplace": {
          "code": "fr",
          "name": "Amazon France",
          "currency": "EUR"
        },
        "available": true,
        "price": {
          "value": 19.99,
          "currency": "EUR",
          "formatted": "€19.99"
        },
        "isPrime": true,
        "url": "https://www.amazon.fr/dp/B01N6CJ1QW",
        "error": null
      }
    ],
    "summary": {
      "total": 4,
      "available": 4,
      "cheapest": {
        "marketplace": "us",
        "price": {
          "value": 17.99,
          "currency": "USD",
          "formatted": "$17.99"
        }
      }
    }
  }
}
```

**⚠️ Limitations** :
- Délai de réponse FlareSolverr : 3-10 secondes par requête (warm-up session inclus)
- La 1ère requête après redémarrage est plus lente (~8s, résolution WAF challenge)
- Recommandation : Limiter à 1 requête / 3 secondes pour éviter détection
- Parsing HTML fragile, peut casser si Amazon change sa structure
- Certains produits peuvent ne pas être détectés correctement
- Le VPN (Gluetun/PIA) est requis — sans VPN, Amazon bloque les requêtes

**🛡️ Mécanisme anti-blocage** :
1. **VPN Gluetun** : proxy HTTP via PIA OpenVPN (variable `VPN_PROXY_URL`)
2. **Warm-up session** : `ensureSession()` visite le domaine Amazon (5s) pour résoudre le JS WAF et poser les cookies
3. **Détection WAF** : `isWafChallenge()` détecte les pages `awsWafCookieDomainList` / `challenge.js`
4. **Retry automatique** : si WAF toujours présent, attend 4s et retente (max 2 tentatives)
5. **Détection blocage** : `detectAmazonBlock()` identifie bot_detection, CAPTCHA, error_page

**💡 Conseils d'utilisation** :
- Privilégier les recherches spécifiques plutôt que génériques
- Utiliser les ASIN pour les détails de produits (plus fiable)
- Activer la comparaison de prix pour trouver le meilleur marketplace
- Surveiller le health check avant utilisation intensive
- Prévoir un cache côté client pour réduire les requêtes

---

### Amazon — Routes alias par domaine

> Amazon est aussi accessible comme **provider natif** dans chaque domaine via des routes alias.
> La catégorie Amazon est pré-configurée — pas besoin de la spécifier.

#### Routes disponibles

| Route alias | Catégorie Amazon | Label |
|-------------|-----------------|-------|
| `/api/videogames/amazon` | `videogames` | Jeux vidéo |
| `/api/collectibles/amazon` | `toys` | Jouets |
| `/api/boardgames/amazon` | `toys` | Jouets |
| `/api/construction-toys/amazon` | `toys` | Jouets |
| `/api/books/amazon` | `books` | Livres |
| `/api/anime-manga/amazon` | `books` | Livres |
| `/api/comics/amazon` | `books` | Livres |
| `/api/music/amazon` | `music` | Musique |
| `/api/media/amazon` | `movies` | Films & Séries |

#### Endpoints par alias

| Endpoint | Description |
|----------|-------------|
| `GET /` | Info sur l'alias (domaine, catégorie, endpoints disponibles) |
| `GET /search?q=&country=&page=&limit=` | Recherche avec catégorie forcée |
| `GET /product/:asin?country=` | Détails d'un produit par ASIN |
| `GET /health` | Health check FlareSolverr + info alias |

#### Exemples

```bash
# Rechercher des jeux vidéo sur Amazon
curl "http://localhost:3000/api/videogames/amazon/search?q=zelda&country=fr"

# Rechercher des livres manga
curl "http://localhost:3000/api/anime-manga/amazon/search?q=one+piece&country=fr"

# Rechercher des jouets de construction
curl "http://localhost:3000/api/construction-toys/amazon/search?q=lego+star+wars"

# Détails d'un produit musique
curl "http://localhost:3000/api/music/amazon/product/B09ZGJKQ3K?country=fr"

# Rechercher des films/séries
curl "http://localhost:3000/api/media/amazon/search?q=lord+of+the+rings"
```

> **Note** : Ces alias utilisent le même provider Amazon (FlareSolverr + VPN) que `/api/ecommerce/amazon`.
> Les réponses sont identiques mais le champ `domain` reflète le domaine de l'alias.

---

## �️ Cache & Administration

### Cache Admin

> **Base URL** : `/api/cache`  
> **Source** : PostgreSQL interne  
> **Authentification** : ❌ Non requise (endpoints publics)  
> **Phase 5** : ✅ Opérationnel depuis 2 février 2026

| Endpoint | Description | Status |
|----------|-------------|--------|
| `GET /stats` | Statistiques globales du cache | ✅ Fonctionne |
| `POST /refresh/:provider` | Force refresh d'un provider | ✅ Fonctionne |
| `POST /refresh` | Refresh des entrées expirées | ✅ Fonctionne |
| `DELETE /clear` | Vide tout le cache | ✅ Fonctionne |

**Paramètres /refresh** :
- `:provider` : Nom du provider (`tmdb`, `jikan`, `rawg`, `igdb`, `deezer`, `itunes`)
- `batchSize` : Nombre d'entrées à rafraîchir (défaut: 10) - uniquement pour `POST /refresh`

**Exemples** :
```bash
# Statistiques du cache
curl "http://localhost:3000/api/cache/stats"

# Force refresh TMDB (tous les endpoints)
curl -X POST "http://localhost:3000/api/cache/refresh/tmdb"

# Refresh 20 entrées expirées
curl -X POST "http://localhost:3000/api/cache/refresh?batchSize=20"

# Vider tout le cache
curl -X DELETE "http://localhost:3000/api/cache/clear"
```

**Réponse GET /stats** :
```json
{
  "success": true,
  "cache": {
    "global": {
      "total_entries": "14",
      "total_items": "118",
      "total_fetches": "14",
      "valid_entries": "14",
      "expired_entries": "0",
      "accessed_today": "14"
    },
    "byProvider": [
      {
        "provider": "tmdb",
        "endpoint": "trending",
        "total_entries": "2",
        "total_items": "40",
        "total_fetches": "2",
        "avg_refreshes": 2,
        "oldest_update": "2026-02-02T13:20:13.875Z",
        "latest_update": "2026-02-02T13:20:14.402Z",
        "valid_entries": "2",
        "expired_entries": "0"
      }
    ]
  },
  "database": {
    "connected": true,
    "totalCount": 1,
    "idleCount": 1
  }
}
```

**Cache automatique actif sur** :
- **TMDB** : 7 endpoints (trending, popular, top-rated, upcoming, on-the-air, airing-today)
- **Jikan** : 4 endpoints (top, trending, upcoming, schedule)
- **RAWG** : 2 endpoints (popular, trending)
- **IGDB** : 1 endpoint (popular)
- **Deezer** : 1 endpoint (charts)
- **iTunes** : 1 endpoint (charts)

**Refresh automatique** (9 cron jobs) :
- `02:00` → TMDB trending
- `02:30` → Jikan trending  
- `03:00` → TMDB/RAWG popular
- `03:30` → IGDB popular
- `04:00` → Deezer charts
- `04:30` → iTunes charts
- `*/6h`  → Upcoming refresh
- `05:00` → Purge anciennes entrées (>90j)
- `*/1h`  → Monitoring stats

**Performance** :
- Réduction latence : **-93%** (159ms → 11ms)
- Gain de vitesse : **14x plus rapide**
- TTL : 24h (trending/popular/charts), 6h (upcoming/schedule)
- Toutes les réponses incluent `metadata.cached` et `metadata.cacheKey`

---

## �📝 Notes
```
1. **FlareSolverr** : Certains providers (Bedetheque, LEGO, Playmobil) nécessitent FlareSolverr pour contourner les protections anti-bot. Temps de réponse plus élevé (~3-18s).

2. **Traduction** : La traduction automatique est disponible via le paramètre `autoTrad=1`. Elle utilise un service de traduction interne.

3. **Rate Limiting** : Respectez les limites de chaque API pour éviter les blocages.

4. **Clés API** : Configurez les clés dans le fichier `.env` :
   ```env
   COMICVINE_API_KEY=your_key
   BRICKSET_API_KEY=your_key
   REBRICKABLE_API_KEY=your_key
   GOOGLE_BOOKS_API_KEY=your_key  # optionnel
   TMDB_API_KEY=your_key
   TVDB_API_KEY=your_key
   IGDB_CLIENT_ID=your_twitch_client_id
   IGDB_CLIENT_SECRET=your_twitch_client_secret
   RAWG_API_KEY=your_key
   BGG_API_TOKEN=your_boardgamegeek_token
   BGG_USERNAME=your_bgg_username      # pour les URLs de téléchargement des fichiers
   BGG_PASSWORD=your_bgg_password      # pour les URLs de téléchargement des fichiers
   DISCOG_API_KEY=your_key  # optionnel, augmente rate limit
   ```
