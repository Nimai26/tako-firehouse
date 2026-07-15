# Format de Réponse Normalisé Tako API

> **Ce document est la spécification NORMATIVE (non négociable).**  
> Tout normalizer DOIT produire EXACTEMENT cette structure.  
> Voir [ADR 2025-06 : Choix du Format B](#adr-2025-06--choix-du-format-b) pour le contexte.

## Principe Fondamental

**Toutes les réponses suivent le MÊME schéma de base**, quel que soit le provider ou le domaine.  
Les données spécifiques sont encapsulées dans un objet `details` qui varie selon le type de contenu.

### État de Migration (mars 2026)

| Domaine | Providers | Format B conforme ? | Notes |
|---------|-----------|---------------------|-------|
| media | TMDB, TVDB | ✅ Oui | Audit v10-v12 |
| videogames | IGDB, RAWG, JVC, ConsoleVariations | ✅ Oui | Audit v11-v12 |
| anime-manga | Jikan, MangaUpdates, Nautiljon | ✅ Oui | Audit v12 |
| music | Deezer, Discogs, iTunes, MusicBrainz | ✅ Oui | Audit v11-v12 |
| books | Google Books, OpenLibrary | ✅ Oui | BaseNormalizer |
| comics | ComicVine, Bedetheque | ✅ Oui | Audit v12 |
| construction-toys | Brickset, Rebrickable, LEGO, Playmobil, Klickypedia, KRE-O, Mega | ✅ Oui | Audit v11-v12 |
| tcg | Pokemon, MTG, Yu-Gi-Oh, DBS, Digimon, Lorcana, One Piece | ✅ Oui | Audit v12 + set Format B (mars 2026) |
| collectibles | Carddass, Coleka, Luluberlu, Transformerland | ✅ Oui | Audit v12 |
| boardgames | BGG | ✅ Oui | Audit v12 |
| ecommerce | Amazon | ✅ Oui | Audit v11-v12 |
| sticker-albums | Paninimania | ✅ Oui | Audit v12 |

---

## Structure d'un Item

```json
{
  // ═══════════════════════════════════════════════════════════════════════════
  // NOYAU COMMUN - IDENTIQUE POUR TOUS LES TYPES
  // ═══════════════════════════════════════════════════════════════════════════
  
  "id": "brickset:31754",           // ID Tako unique (format: source:sourceId)
  "type": "construct_toy",          // Type de contenu
  "source": "brickset",             // Provider d'origine
  "sourceId": "31754",              // ID original chez le provider
  
  "title": "75192 Millennium Falcon",    // Titre principal
  "titleOriginal": null,                  // Titre original (si différent)
  
  "description": "Star Wars • Ultimate Collector Series • 7541 pièces • 8 minifigs",
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

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS SPÉCIFIQUES AU TYPE - VARIENT SELON LE DOMAINE
  // ═══════════════════════════════════════════════════════════════════════════
  
  "details": {
    "brand": "LEGO",
    "theme": "Star Wars",
    "subtheme": "Ultimate Collector Series",
    "category": "Normal",
    
    "setNumber": "75192",
    "pieceCount": 7541,
    "minifigCount": 8,
    
    "ageRange": { "min": 16, "max": null },
    "dimensions": { "height": 21, "width": 84, "depth": 56 },
    
    "price": { "amount": 849.99, "currency": "EUR" },
    
    "availability": "available",
    "releaseDate": "2017-10-01",
    "retirementDate": null,
    
    "instructionsUrl": "https://www.lego.com/service/buildinginstructions/75192",
    "barcodes": { "upc": "673419267533", "ean": "5702015869935" },
    
    "rating": { "average": 4.8, "count": 1234 }
  }
}
```

---

## Réponse de Recherche

```json
{
  "success": true,
  "provider": "brickset",
  "domain": "construction-toys",
  "query": "millennium falcon",
  "total": 42,
  "count": 20,
  
  "data": [
    { /* Item normalisé */ },
    { /* Item normalisé */ },
    ...
  ],
  
  "pagination": {
    "page": 1,
    "limit": 20,
    "hasMore": true
  },
  
  "meta": {
    "fetchedAt": "2026-01-28T14:30:00.000Z",
    "lang": "en",
    "cached": false,
    "cacheAge": null
  }
}
```

---

## Réponse de Détail

```json
{
  "success": true,
  "provider": "brickset",
  "domain": "construction-toys",
  "id": "brickset:31754",
  
  "data": {
    /* Item normalisé complet */
  },
  
  "meta": {
    "fetchedAt": "2026-01-28T14:30:00.000Z",
    "lang": "en",
    "cached": true,
    "cacheAge": 3600
  }
}
```

---

## Types de Contenu et leurs Détails

> **39 types** en usage dans les normalizers. 12 disposent d'un schéma Zod officiel dans `content-types.js`.  
> Les types additionnels (person, character, season, episode…) partagent le noyau commun mais n'ont pas de schéma Zod dédié.

### Types officiels (schéma Zod)

| Type | Domaine(s) | Providers |
|------|-----------|-----------|
| `construct_toy` | construction-toys | Brickset, LEGO, Rebrickable, Mega, KRE-O, Klickypedia, Playmobil |
| `book` | books | Google Books, OpenLibrary |
| `videogame` | videogames | IGDB, RAWG, JVC |
| `movie` | media | TMDB, TVDB |
| `series` | media | TMDB, TVDB |
| `anime` | anime-manga | Jikan |
| `manga` | anime-manga | Jikan, MangaUpdates, Nautiljon |
| `tcg_card` | tcg | Pokemon, MTG, Yu-Gi-Oh, DBS, Digimon, Lorcana, One Piece |
| `board_game` | boardgames | BGG |
| `music` | music | (schéma générique — voir `music_album`, `music_artist`, `music_track`) |
| `collectible` | collectibles | Carddass, Coleka, Luluberlu, Transformerland |
| `product` | ecommerce | Amazon |

### Types additionnels (noyau commun, sans schéma Zod dédié)

| Type | Domaine(s) | Providers |
|------|-----------|-----------|
| `person` | media, anime-manga | TMDB, TVDB, Jikan, MangaUpdates |
| `character` | anime-manga, comics | Jikan, ComicVine |
| `season` | media | TMDB, TVDB |
| `episode` | media | TMDB, TVDB |
| `collection` | media | TMDB |
| `list` | media | TVDB |
| `media` | media | TMDB, TVDB (recherche multi) |
| `anime-manga` | anime-manga | Jikan (recherche multi) |
| `producer` | anime-manga | Jikan |
| `organization` | anime-manga | MangaUpdates |
| `manga_volume` | anime-manga | Nautiljon |
| `release` | anime-manga | MangaUpdates |
| `comic` | comics | ComicVine, Bedetheque |
| `volume` | comics | ComicVine |
| `issue` | comics | ComicVine |
| `album` | comics | Bedetheque |
| `serie` | comics | Bedetheque |
| `author` | comics, anime-manga | Bedetheque, MangaUpdates |
| `creator` | comics | ComicVine |
| `publisher` | comics | ComicVine |
| `music_album` | music | Deezer, Discogs, iTunes, MusicBrainz |
| `music_artist` | music | Deezer, Discogs, iTunes, MusicBrainz |
| `music_track` | music | Deezer, iTunes |
| `music_label` | music | Discogs |
| `tcg_set` | tcg | Pokemon, MTG, Yu-Gi-Oh, DBS, Lorcana |
| `console_variation` | videogames | ConsoleVariations |
| `sticker_album` | sticker-albums | Paninimania |
| `boardgame` | boardgames | BGG (alias de `board_game`) |

---

### Champs `details` par type

#### `movie` — Films

| Champ | Type | Description |
|-------|------|-------------|
| `mediaType` | `"movie"` | Type de média |
| `tagline` | string? | Tagline |
| `releaseDate` | string? | Date de sortie (YYYY-MM-DD) |
| `runtime` | number? | Durée en minutes |
| `status` | string? | Released, Planned… |
| `genres` | string[] | Genres |
| `rating` | `{average, voteCount}` | Note et votes |
| `popularity` | number? | Score de popularité |
| `budget` | number? | Budget en USD |
| `revenue` | number? | Recettes en USD |
| `studios` | `[{id, name, logo, country}]` | Studios |
| `cast` | `[{id, name, character, order, image}]` | Distribution |
| `directors` | `[{id, name, image}]` | Réalisateurs |
| `crew` | `[{id, name, job, department, image}]` | Équipe technique |
| `videos` | `[{id, key, name, type, official, url}]` | Bandes-annonces |
| `keywords` | string[] | Mots-clés |
| `collection` | `{id, name, poster, backdrop}?` | Saga/collection |
| `externalIds` | `{imdb, facebook, instagram, twitter, wikidata}` | IDs externes |
| `contentRatings` | `[{country, rating, releaseDate}]` | Classifications |
| `recommendations` | `[{sourceId, title, year, poster, rating}]` | Recommandations |
| `similar` | `[{sourceId, title, year, poster, rating}]` | Films similaires |

#### `series` — Séries TV

| Champ | Type | Description |
|-------|------|-------------|
| `mediaType` | `"tv"` | Type de média |
| `firstAirDate` | string? | Première diffusion |
| `lastAirDate` | string? | Dernière diffusion |
| `status` | string? | Returning Series, Ended… |
| `seasonCount` | number? | Nombre de saisons |
| `episodeCount` | number? | Nombre total d'épisodes |
| `genres` | string[] | Genres |
| `rating` | `{average, voteCount}` | Note |
| `networks` | `[{id, name, logo, country}]` | Diffuseurs |
| `studios` | `[{id, name, logo, country}]` | Studios |
| `creators` | `[{id, name, image}]` | Créateurs |
| `seasons` | `[{id, seasonNumber, name, overview, episodeCount, airDate, poster, rating}]` | Saisons |
| `cast` | `[{id, name, character, order, image}]` | Distribution |
| `videos` | array | Vidéos |
| `externalIds` | `{imdb, tvdb, facebook, instagram, twitter, wikidata}` | IDs externes |

#### `anime` — Anime

| Champ | Type | Description |
|-------|------|-------------|
| `malId` | number | ID MyAnimeList |
| `resourceType` | string | tv, movie, ova, special, ona, music |
| `format` | string? | TV, Movie, OVA… |
| `sourceMaterial` | string? | Manga, Light Novel, Original… |
| `episodes` | number? | Nombre d'épisodes |
| `status` | string? | Finished Airing, Currently Airing… |
| `score` | number? | Score MAL /10 |
| `rank` | number? | Classement MAL |
| `popularity` | number? | Rang de popularité |
| `season` | string? | winter, spring, summer, fall |
| `genres` | `[{id, name, url}]` | Genres |
| `themes` | `[{id, name, url}]` | Thèmes |
| `demographics` | `[{id, name, url}]` | Démographiques (Shounen, Seinen…) |
| `studios` | `[{id, name, url}]` | Studios |
| `rating` | `{code, label, minAge}?` | Classification (PG-13, R-17+…) |
| `aired` | `{from, to, string}` | Dates de diffusion |
| `trailer` | `{url, embedUrl, youtubeId, images}?` | Bande-annonce YouTube |

#### `manga` — Manga

| Champ | Type | Description |
|-------|------|-------------|
| `malId` | number | ID MyAnimeList |
| `format` | string? | Manga, Novel, Light Novel… |
| `chapters` | number? | Nombre de chapitres |
| `volumes` | number? | Nombre de volumes |
| `status` | string? | Finished, Publishing… |
| `score` | number? | Score MAL /10 |
| `rank` | number? | Classement |
| `authors` | `[{id, name, url}]` | Auteurs |
| `genres` | `[{id, name, url}]` | Genres |
| `themes` | `[{id, name, url}]` | Thèmes |
| `demographics` | `[{id, name, url}]` | Démographiques |

#### `manga_volume` — Volumes manga individuels

| Champ | Type | Description |
|-------|------|-------------|
| `resourceType` | `"volume"` | Type de ressource |
| `volumeNumber` | string | Numéro du volume |
| `volumeLabel` | string? | Label affiché ("Vol. 5") |
| `seriesTitle` | string | Titre de la série parente |
| `seriesSlug` | string | Slug de la série parente |
| `seriesTitleOriginal` | string? | Titre original (japonais) |
| `format` | string? | Manga, Light Novel… |
| `origin` | string? | Pays d'origine |
| `status` | string? | En cours, Terminé… |
| `totalVolumes` | number? | Nombre total de volumes |
| `genres` | string[] | Genres |
| `themes` | string[] | Thèmes |
| `authors` | string[] | Auteurs |
| `publishers` | object? | Éditeurs par pays |
| `isbn` | string? | ISBN (détail uniquement) |
| `pages` | number? | Nombre de pages (détail) |
| `price` | string? | Prix (détail) |
| `dates` | `{fr, jp}?` | Dates de sortie (détail) |
| `covers` | `{fr, jp}?` | Couvertures FR/JP (détail) |
| `chapters` | `[{title, number}]?` | Chapitres (détail) |
| `edition` | string? | Édition (détail) |

#### `videogame` — Jeux vidéo

| Champ | Type | Description |
|-------|------|-------------|
| `slug` | string? | Slug IGDB/RAWG |
| `releaseDate` | string? | Date de sortie (YYYY-MM-DD) |
| `rating` | number? | Note (IGDB: /100, RAWG: /10) |
| `ratingCount` | number | Nombre de votes |
| `platforms` | string[] ou `[{id,name}]` | Plateformes |
| `genres` | string[] | Genres |
| `themes` | string[] | Thèmes (IGDB) |
| `gameModes` | string[] | Modes de jeu (IGDB) |
| `developers` | string[] | Studios de développement |
| `publishers` | string[] | Éditeurs |
| `category` | string? | main_game, dlc_addon, expansion… |
| `status` | string? | released, alpha, beta… |
| `metacritic` | number? | Score Metacritic (RAWG) |

#### `book` — Livres

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string? | Sous-titre |
| `fullTitle` | string? | Titre + sous-titre |
| `authors` | string[] | Auteurs |
| `publisher` | string? | Éditeur |
| `publishedDate` | string? | Date de publication |
| `categories` | string[] | Catégories/sujets |
| `language` | string? | Code langue (fr, en…) |
| `isbn` | string? | ISBN principal |
| `isbn10` | string? | ISBN-10 |
| `isbn13` | string? | ISBN-13 |
| `pageCount` | number? | Nombre de pages |
| `rating` | `{value, count}?` | Note |
| `covers` | object? | Couvertures multi-tailles |

#### `tcg_card` — Cartes à collectionner

| Champ | Type | Description |
|-------|------|-------------|
| `subtitle` | string | Supertype ou type de carte |
| `flavorText` | string? | Texte d'ambiance |
| `set` | `{name, code, series, releaseDate}` | Set d'appartenance (uniforme, tous providers TCG) |
| `cardNumber` | string? | Numéro dans le set |
| `rarity` | string? | common, uncommon, rare, mythic… |
| `artist` | string? | Illustrateur |
| `prices` | object? | Prix multi-sources |
| `legalities` | object? | Légalités par format |
| `externalLinks` | object? | Liens marchands |

#### `board_game` / `boardgame` — Jeux de société

| Champ | Type | Description |
|-------|------|-------------|
| `alternateNames` | string[] | Noms multilingues |
| `players` | `{min, max}` | Nombre de joueurs |
| `playTime` | `{min, max, average}` | Temps de jeu en minutes |
| `minAge` | number? | Âge minimum |
| `stats` | `{rating, numRatings, rank, complexity}` | Statistiques BGG |
| `categories` | string[] | Catégories |
| `mechanics` | string[] | Mécaniques de jeu |
| `designers` | string[] | Créateurs |
| `artists` | string[] | Illustrateurs |
| `publishers` | string[] | Éditeurs |

#### `construct_toy` — Jouets de construction

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | string | Marque (LEGO, Playmobil, MEGA, KRE-O) |
| `theme` | string? | Thème (Star Wars, City…) |
| `subtheme` | string? | Sous-thème |
| `category` | string? | Catégorie |
| `set_number` | string? | Numéro de set |
| `pieces` | number? | Nombre de pièces |
| `minifigs` | number? | Nombre de minifigs |
| `ageRange` | `{min, max}?` | Tranche d'âge |
| `price` | `{amount, currency}?` | Prix |
| `availability` | string | available, retired, coming_soon, archived |
| `releaseDate` | string? | Date de sortie |
| `instructions` | object? | Instructions PDF `{count, manuals, url}` |
| `rating` | `{average, count}?` | Note communautaire |
| `videos` | `{url, proxyUrl, filename}[]` | Vidéos produit (LEGO uniquement) |

#### `music_album` — Albums musique

| Champ | Type | Description |
|-------|------|-------------|
| `artist` | string? | Artiste principal |
| `artistId` | string? | ID artiste |
| `releaseDate` | string? | Date de sortie |
| `genres` | string[] | Genres |
| `label` | string? | Label |
| `tracks` | array | Liste des pistes |
| `trackCount` | number | Nombre de pistes |
| `duration` | number? | Durée totale en secondes |
| `explicit` | boolean? | Contenu explicite |
| `recordType` | string? | album, single, ep |

#### `music_artist` — Artistes musique

| Champ | Type | Description |
|-------|------|-------------|
| `nbAlbums` | number? | Nombre d'albums |
| `nbFans` | number? | Nombre de fans |
| `topTracks` | array? | Top pistes |
| `albums` | array? | Albums |
| `realName` | string? | Vrai nom (Discogs) |
| `members` | array? | Membres (si groupe) |

#### `music_track` — Pistes musique

| Champ | Type | Description |
|-------|------|-------------|
| `artist` | string? | Artiste |
| `album` | string? | Album |
| `duration` | number? | Durée en secondes |
| `durationFormatted` | string? | Durée mm:ss |
| `trackNumber` | number? | Numéro de piste |
| `preview` | string? | URL preview |
| `explicit` | boolean | Explicite |

#### `collectible` — Objets de collection

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | string? | Marque |
| `series` | string? | Série |
| `category` | string? | Catégorie |
| `reference` | string? | Référence |
| `condition` | string? | État |
| `availability` | string? | Disponibilité |
| `attributes` | object? | Attributs dynamiques |

#### `product` — Produits e-commerce

| Champ | Type | Description |
|-------|------|-------------|
| `asin` | string | Identifiant Amazon |
| `marketplace` | string | Code pays (fr, us…) |
| `marketplaceName` | string | Amazon France, Amazon US… |
| `price` | number? | Prix numérique |
| `priceFormatted` | string? | Prix formaté (29,99 €) |
| `currency` | string | EUR, USD, GBP… |
| `isPrime` | boolean | Éligible Prime |
| `rating` | number? | Note /5 |
| `reviewCount` | number? | Nombre d'avis |

#### `sticker_album` — Albums de vignettes

| Champ | Type | Description |
|-------|------|-------------|
| `barcode` | string? | Code-barres |
| `copyright` | string? | Copyright |
| `releaseDate` | string? | Date de parution |
| `editor` | string? | Éditeur |
| `categories` | string[] | Catégories |
| `checklist` | object? | Checklist `{raw, total, items, totalWithSpecials}` |
| `specialStickers` | array? | Vignettes spéciales |
| `additionalImages` | array? | Images supplémentaires |

#### `console_variation` — Variations de consoles

| Champ | Type | Description |
|-------|------|-------------|
| `brand` | string? | Marque (Sony, Nintendo…) |
| `platform` | `{id, name}?` | Plateforme |
| `releaseCountry` | string? | Pays de sortie |
| `releaseYear` | number? | Année |
| `releaseType` | string? | retail, promotional, bundle, prototype |
| `isLimitedEdition` | boolean | Édition limitée |
| `rarity` | `{score, level}` | Rareté |
| `community` | `{wantCount, ownCount}` | Stats communautaires |

> **Référence exhaustive** : Voir l'Annexe A du [Developer Guide](DEVELOPER_GUIDE_TAKO_API.md) pour les champs `details` détaillés par provider.

---

## ADR 2025-06 : Choix du Format B

### Contexte

Le projet Tako API a été lancé avec l'intention d'avoir un format de réponse unique et normé.
En réalité, la migration v2.0.0 a produit un format plat (`...base, ...details`) contraire à la spec.
La migration v2.0.1 a affirmé "100% conforme" alors que seul le wrapper externe avait été ajouté.
Résultat en v2.6.0 : **6 formats distincts coexistaient**, chaque domaine ayant son propre vocabulaire.

### Trois causes racines identifiées

1. **v2.0.0** a choisi le format plat (opposé de la spec) → `...base, ...details` au lieu de `{ ...base, details: {...} }`
2. **v2.0.1** a déclaré victoire prématurément — wrapper externe OK mais contenu interne jamais validé
3. **Aucune validation Zod active** — `data: z.any()` dans response.js ⇒ aucun garde-fou

### Décision

**Format B (noyau commun + objet `details`)** est le format DÉFINITIF et NON NÉGOCIABLE pour tous les domaines.

- Le noyau commun (id, type, source, sourceId, title, titleOriginal, description, year, images, urls) est IDENTIQUE partout
- Les données spécifiques au domaine sont dans `details: { ... }` — JAMAIS aplaties au root
- Le schéma Zod dans `content-types.js` est la source de vérité (`coreItemSchema` + `createItemSchema`)

### Conséquences

- Tous les domaines doivent être migrés vers Format B (voir tableau d'état ci-dessus)
- La validation Zod doit être activée dans BaseNormalizer pour rejeter les formats non conformes
- Le `baseItemSchema` legacy (ancien format plat) a été supprimé du code

---

## Validation Zod

Les schémas sont définis dans `src/core/schemas/content-types.js` :

| Schéma | Usage |
|--------|-------|
| `coreItemSchema` | Noyau commun obligatoire |
| `createItemSchema(detailsSchema)` | Fabrique un schéma complet core + details |
| `detailSchemasByType` | Map type → schéma de détails |
| `itemSchemasByType` | Map type → schéma complet |

> **TODO** : Activer la validation Zod `.parse()` dans BaseNormalizer pour garantir la conformité à la compilation.
