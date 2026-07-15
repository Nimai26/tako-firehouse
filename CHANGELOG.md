# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]
### 🐛 Cache — Fix pagination des endpoints discovery

#### Fixed
- **Pagination du cache discovery** — Toutes les pages (1, 2, 3…) retournaient les mêmes 20 résultats car `generateCacheKey()` n'incluait pas le paramètre `page` dans la clé de cache
  - **Cause** : clé `tmdb:trending:movie:week` identique pour page 1 et page 2 → mêmes données retournées
  - **Fix** : ajout de `page` dans `generateCacheKey()` — page > 1 ajoute un suffixe `:p2`, `:p3` (page 1 sans suffixe pour compatibilité avec les entrées existantes)
  - **22 routes corrigées** :
    - TMDB : 6 routes (trending, popular, top-rated, upcoming, on-the-air, airing-today)
    - Jikan : 12 routes (top/anime, top/manga, trending, upcoming, trending/tv, trending/movie, trending/anime, top/tv, top/movie, upcoming/tv, upcoming/movie, schedule)
    - RAWG : 2 routes (popular, trending)
    - IGDB : 1 route (popular, conversion offset→page)
  - Rapporté par l'équipe Hikari
### � Books — Nouveau provider Abandonware Magazines

#### Added
- **Provider Abandonware Magazines** (`abandonware.provider.js`) — Accès à l'archive de 602+ magazines français numérisés via l'API native d'abandonware-magazines.org
  - `GET /health` — Health check avec latence
  - `GET /search?q=` — Recherche de magazines par nom (filtre sur la liste complète)
  - `GET /magazines` — Liste paginée de tous les magazines disponibles
  - `GET /magazine/:id` — Détails d'un magazine avec la liste complète de ses numéros (couvertures, dates, hors-série, CD)
  - `GET /magazine/:id/issues` — Numéros d'un magazine avec pagination
- **Normalizer Abandonware** (`abandonware.normalizer.js`) — Format canonique Tako (type `magazine`), génération des URLs de logos, extraction d'année depuis les dates françaises (ex: "Mars/Avril 1992" → 1992)
- **Routes Abandonware** (`abandonware.routes.js`) — 5 endpoints sous `/api/books/abandonware/`
- Cache interne de la liste des magazines (TTL 1h), pas de clé API requise, parsing du format texte propriétaire (séparateur ` ; `, lignes `<br>`)

### �🔧 Global — Alias `limit` universel sur toutes les routes search

#### Fixed
- **Paramètre `limit` accepté partout** — Hikari envoie `limit` mais les routes utilisaient `maxResults`, `pageSize` ou `max`
  - Ajout de `limit` comme alias dans **50+ routes search** de tous les providers
  - Résout les timeouts de recherche (ex: manga search 25 résultats × traduction séquentielle ~1s = ~30s)
  - Providers : Jikan, MangaUpdates, Nautiljon, GoogleBooks, ComicVine, Bedetheque, TMDB, TVDB, RAWG, ConsoleVariations, tous les TCG, tous les construction-toys, Coleka, Carddass, Transformerland, Luluberlu, Paninimania

### 🎌 Anime-Manga — Route trending/anime + normalisation sfw

#### Added
- **Route `GET /trending/anime`** — Trending tous anime de la saison en cours (avec enrichissement backdrops)
  - Équivalent de `/trending` mais avec `enrichWithBackdrops` et support du paramètre `sfw`
  - Cache key : `jikan:trending:anime:{sfw}`

#### Fixed
- **Normalisation du paramètre `sfw`** — Accepte désormais `true`/`false`/`1`/`0` en plus de `all`/`sfw`/`nsfw`
  - `sfw=false` et `sfw=0` → NSFW (hentai uniquement) — avant : tombait en `all` (bug)
  - `sfw=true` et `sfw=1` → SFW (sans hentai)
  - Appliqué à toutes les routes discovery (trending, top, upcoming) et recherche (search/anime, search/manga)

### 🧱 Construction Toys — Proxy vidéo LEGO (anti-429)

#### Added
- **Endpoint `GET /lego/proxy/video?url=`** — Proxy streaming pour télécharger les vidéos depuis le CDN LEGO
  - Contourne le rate-limiting (429) en ajoutant les headers navigateur (User-Agent, Referer, Origin)
  - Whitelist regex stricte anti-SSRF : uniquement `https://www.lego.com/cdn/cs/set/assets/blt.../*.mp4`
  - Streaming via `Readable.fromWeb()` + `pipeline()` (pas de buffering mémoire)
  - Cache-Control 24h, Content-Disposition avec filename

#### Changed
- **Format `details.videos`** — Passe de `string[]` à `{url, proxyUrl, filename}[]`
  - `url` : URL directe CDN LEGO (peut être rate-limité)
  - `proxyUrl` : URL proxy Tako (recommandé pour le téléchargement)
  - `filename` : Nom du fichier vidéo

### 🏷️ Collectibles — Coleka collection/série + Transformerland instructions

#### Added
- **Coleka `collectionHierarchy`** — Extraction de la hiérarchie Collection/Série depuis le champ JSON-LD `category` (format `Catégorie > Sous-cat > Collection`)
  - `details.series` : nom de la collection spécifique (dernier élément)
  - `details.category` : catégorie de premier niveau (premier élément)
  - `details.collectionHierarchy` : tableau complet de la hiérarchie
  - Fallback HTML sur le label `Collection / Série` si JSON-LD absent
- **Transformerland `instructions` et `specs`** — Les scans d'instructions de transformation et fiches techniques sont désormais séparés des images de référence
  - `details.instructions` : tableau d'URLs des scans d'instructions (`/archive/instructionscans/`)
  - `details.specs` : tableau d'URLs des fiches techniques (`/archive/specscans/`)
  - `null` si aucun scan disponible pour l'item
  - Les images de référence restent dans `images.gallery`

### 📚 Anime-Manga — Nouveau provider Nautiljon (volumes manga)

#### Added
- **Provider Nautiljon** (`nautiljon.provider.js`) — Scraping de Nautiljon.com pour les données manga par volume (ISBN, pages, prix, dates, éditeurs, couvertures, chapitres)
  - `GET /health` — Health check avec latence
  - `GET /search?q=` — Recherche manga (titre, slug, URL)
  - `GET /search/volumes?q=&volume=` — Recherche et retourne directement la liste des volumes (combine search + série en un appel)
  - `GET /series/:slug` — Détails série (titre FR/JP, synopsis, genres, thèmes, auteurs, éditeurs VF/VO, nb volumes, liste complète des volumes avec couvertures)
  - `GET /series/:slug/volumes` — Liste paginée des volumes avec couvertures
  - `GET /series/:slug/volume/:volumeId?name=` — Détail volume (ISBN/EAN, pages, prix €/¥, dates VF/VO, éditeurs VF/VO, couvertures, chapitres avec titres FR)
- **Normalizer Nautiljon** (`nautiljon.normalizer.js`) — Normalisation au format canonique Tako (types `manga` / `manga_volume`)
- **Routes Nautiljon** (`nautiljon.routes.js`) — 5 endpoints sous `/api/anime-manga/nautiljon/`
- Rate limiting 1 req/s, parsing HTML basé sur Schema.org microdata (itemprop)

### 🦇 Comics — Réécriture recherche albums Bedetheque

#### Changed
- **`searchAlbums` réécrit** — La recherche avancée Bedetheque nécessite des tokens CSRF impossibles à scraper. Nouvelle stratégie *series-first* : recherche AJAX des séries → récupération FlareSolverr des albums de chaque série correspondante (en parallèle). Résultats : "asterix" → 20 albums, "wonder woman" → 5 albums
- **`enrichCovers` param** — Paramètre optionnel `enrichCovers=true` sur les routes de recherche pour enrichir les résultats AJAX (sans images) avec les couvertures via FlareSolverr

### 🦇 Comics — Déduplication galerie ComicVine

#### Fixed
- **Galerie dupliquée** — `buildImages()` retournait 5 variantes de la même image (original, medium, small, etc.) ; ne conserve désormais que `original_url`

### 🦇 Comics — Correction URL album Bedetheque + endpoint /detail/:id

#### Fixed
- **URL album cassée** — `getAlbumDetails` construisait `BD--{id}.html` (double tiret, slug vide) causant une redirection vers un album aléatoire (ex: "Xing et Xot" au lieu de "Wonder Woman"). Ajout d'un paramètre `url` optionnel et validation `og:url`
- **Validation titre série** — `getSerieDetails` retournait des données vides pour des IDs non-série ; ajout d'un check titre pour déclencher 404

#### Added
- **`GET /detail/:id`** — Endpoint intelligent qui détecte automatiquement le type (série d'abord, puis album). Supporte `?type=serie|album` pour forcer. Résout l'ambiguïté quand l'app ne connaît pas le type de la ressource

### 🦇 Comics — Correction parsing Bedetheque

#### Fixed
- **Titre série vide** — `parseSerieInfo` capturait du whitespace au lieu du titre quand `<h1>` contient un `<a>`. Nouveau : extraction depuis `<h1><a>Titre</a></h1>` avec fallback `og:title`
- **Albums cassés (noms composés)** — `parseSerieAlbums` ne capturait que le premier mot du slug BD (ex: "Wonder" au lieu de "Wonder-Woman-Déesse-de-la-guerre"). Le regex capture maintenant le slug complet + ID numérique final
- **sourceId albums vide** — Conséquence du regex cassé ; désormais correctement extrait depuis la fin de l'URL (`-{id}.html`)
- **Couvertures albums** — Recherche contextuelle d'images à proximité du lien BD dans le HTML

### 🦇 Comics — Correction urls.detail ComicVine

#### Fixed
- **URLs detail cassées** — `urls.detail` généraient `/api/comics/comicvine/{id}` (route inexistante → 404) au lieu d'inclure le type de ressource (`/volume/`, `/issue/`, `/character/`, `/creator/`). Corrigé pour les 6 méthodes du normalizer
- **Publisher detail** — Mis à `null` car aucune route `/publisher/:id` n'existe

### 🐉 TCG — Traduction descriptions DBS Card Game

#### Fixed
- **Descriptions non traduites** — Le normalizer DBS n'appelait jamais `translateText` ; les descriptions/skills restaient en anglais même avec `lang=fr`. Ajout du support `autoTrad` pour traduire `description`, `skillText` et `back.skillText` via Google Translate
### � TCG — Texte Oracle MTG localisé

#### Fixed
- **Oracle text non traduit** — `details.oracleText` utilisait toujours `rawCard.oracle_text` (EN brut) sans exploiter `printed_text` (traduction native Scryfall) ; utilise désormais `printed_text` quand disponible, sinon fallback `oracle_text` + Google Translate
- **`typeLine` non localisé** — Ajout de `printed_type_line` (ex: "Éphémère" au lieu de "Instant") quand disponible
- **Recherche** — La description courte utilise désormais `printed_text` pour l'aperçu Oracle localisé

### �🦎 TCG — Correction recherche et données Digimon

#### Fixed
- **Recherche cassée** — Le paramètre `series=Digimon Card Game` par défaut causait des erreurs 500 sur l'API upstream pour les recherches populaires (ex: Omnimon = 69 résultats) ; supprimé le défaut, rendu optionnel
- **Détail carte** — `getDigimonCardDetails` recherchait par nom (`n=BT1-084`) au lieu de par ID ; utilise désormais le paramètre `card=BT1-084` pour une correspondance exacte
- **Images manquantes** — L'API DigimonCard.io ne fournit plus le champ `image_url` ; les URLs sont construites depuis l'ID : `https://images.digimoncard.io/images/cards/{id}.jpg`
- **Noms de champs incorrects** — Le normalizer utilisait les anciens noms de l'API :
  - `maineffect` → `main_effect`, `soureeffect` → `source_effect`, `securityeffect` → `alt_effect`
  - `playcost` → `play_cost`, `digitype` → `digi_type`, `digivolvecost1` → `evolution_cost`
  - `set` → `set_name`, `illustrator` → `artist`, `cardnumber` → `id`
- **`urls.source`** — `null` en recherche → ajout lien `https://digimoncard.io/card/{id}`
- **`digiType`** — N'affichait qu'un seul type → combine `digi_type` + `digi_type2/3/4`
- **`set.name`** — `null` → utilise `set_name` (tableau, prend le premier set)
- **Nouveaux champs** — `color2`, `evolutionColor`, `evolutionLevel`, `xrosRequirement`, `tcgplayerId`
- **Health check** — URL contenait des espaces non encodés

#### Added
- **Dictionnaire de noms JP/FR ↔ EN** (`digimon-names.js`) — ~150 entrées organisées par série (Royal Knights, Adventure, Tamers, Frontier, Savers, Xros Wars, Ghost Game, Demon Lords, etc.)
  - Recherche FR : les noms japonais/français sont traduits en anglais avant l'appel API (ex: `Omegamon` → `Omnimon`, `Dukemon` → `Gallantmon`)
  - Affichage FR : les noms anglais des résultats sont traduits en japonais/français (ex: `Omnimon` → `Omegamon`) avec `titleOriginal` indiquant le nom EN
  - 3 stratégies de matching : exact, préfixe (`Omegamon Zwart` → `Omnimon Zwart`), suffixe (`BlackGatomon` → `BlackTailmon`)
  - Toujours actif quand `lang≠en` (lookup dictionnaire instantané, sans Google Translate)

### 🏴‍☠️ TCG — Correction images et données One Piece

#### Added
- **Proxy image** — Nouvel endpoint `GET /api/tcg/onepiece/image/:cardId` qui télécharge les images via les cookies FlareSolverr pour contourner Cloudflare (les URLs directes vers `onepiece-cardgame.dev` retournent 403)
  - Cache mémoire (1h TTL, max 200 images)
  - Headers `Cache-Control` pour navigateur/CDN
  - Les champs `images.primary`/`thumbnail` pointent désormais vers `/api/tcg/onepiece/image/{cardId}`

#### Fixed
- **Images cassées** — Le normalizer construisait `{cid}.png` (URL fictive retournant le HTML du SPA React) ; utilise désormais le champ `iu` de l'API source (vraie URL JPG avec hash, ex: `ST01-001_85f00c_jp.jpg`)
- **Cloudflare 403** — Les images sont protégées par Cloudflare JS Challenge ; le proxy image utilise les cookies CF pour y accéder
- **`urls.source`** — `null` en recherche → ajout lien `onepiece-cardgame.dev/cards/{cid}`
- **`set.name`** — `null` → utilise `srcN` directement (le provider enrichissait via `set_info` mais le champ `srcId` n'existe pas dans les données brutes)
- **`set.releaseDate`** — `null` → utilise `srcD` directement
- **`counter`** — Lisait `rawCard.co` (inexistant) → corrigé en `rawCard.cp`
- **`life`** — Lisait `rawCard.lf` (inexistant) → corrigé en `rawCard.l`
- **`trigger` → `traits`** — Le champ `tr` contient les affiliations du personnage (ex: "Supernovas/Straw Hat Crew"), pas un effet trigger ; renommé en `traits`
- **`extractYear`** — Utilisait `set_info.release_date` (null) → utilise `srcD`

### 🖼️ TCG — Fallback images EN pour Pokémon TCG

#### Fixed
- **Images manquantes** — TCGdex ne fournit d'images que pour les langues où la carte a été imprimée ; ajout d'un fallback automatique vers l'image EN quand l'image locale est absente
  - **Recherche** : appel EN parallèle + injection des images EN par correspondance d'ID
  - **Détail carte** : second appel EN si `image` manquant dans la langue demandée
  - Résultat : recherche FR "pikachu" passe de 124/176 (70%) à 153/176 (87%) images
- **`urls.source` Pokémon** — Le champ était `null` ; ajouté l'URL TCGdex API (`https://api.tcgdex.net/v2/{lang}/cards/{id}`) pour search, detail, sets et set detail

### 🎴 TCG — Correction données manquantes Lorcana

#### Fixed
- **`artist`** — `null` → artiste affiché (champ source = `artistsText`, pas `artist`)
- **`subtypes`** — `undefined` → sous-types corrects (champ source = `subtypes`, pas `classifications`)
- **`cardNumber`** — `null` → numéro de carte (champ source = `number`, pas `collectorNumber`)
- **`set.name`/`set.releaseDate`** — `null` → enrichi depuis les métadonnées des sets (le provider ne croisait pas cartes ↔ sets)
- **`year`** — `null` → extrait de `set.releaseDate`
- **`story`** — absent → franchise d'origine (ex: "La Reine des neiges")
- **`foilTypes`** — absent → types de foil disponibles
- **`legalities`** — absent → légalité Core/Infinity depuis `allowedInFormats`
- **`externalLinks`** — seulement lorcanajson+dreamborn → ajout tcgplayer, cardmarket, cardTrader (vrais liens depuis LorcanaJSON)
- **`urls.source`** — `null` → URL LorcanaJSON
- **Galerie foil** — image foil manquante (champ source = `foilMask`, pas `foil`)

#### Changed
- **Provider Lorcana** — Enrichit chaque carte avec `_set` depuis `data.sets` ; conversion sets objet → tableau pour `normalizeSets()`

### � TCG — Migration Pokémon TCG vers TCGdex

#### Changed
- **Provider Pokémon TCG** — Migration de `pokemontcg.io` (arrêté, migré vers Scrydex payant) vers **TCGdex** (`api.tcgdex.net`) :
  - API gratuite, sans clé, multi-langues natif (FR, EN, DE, ES, IT, PT)
  - Mêmes IDs de cartes (`base1-58`, `swsh1-25`, etc.) → migration transparente
  - Suppression de la dépendance à `TCG_POKEMON_TOKEN`
  - Pagination côté client (TCGdex renvoie tous les résultats)
- **Normalizer** — Adapté à la structure de données TCGdex :
  - `flavorText` → `description` (TCGdex), `supertype` → `category`, `subtypes` → `suffix`
  - `retreatCost` tableau reconstitué depuis le nombre `retreat`
  - Images haute/basse qualité via suffixe `/high.webp` et `/low.webp`
  - Prix via `pricing.tcgplayer` et `pricing.cardmarket` (structure TCGdex)

#### Added
- **Route `/sets/:id`** — Détails d'un set avec liste complète des cartes, série, date de sortie, abréviations
- **`getPokemonSetDetails()`** — Nouvelle fonction provider pour les détails de set
- **`normalizeSetDetails()`** — Normalizer dédié pour les détails de set (Format B)

#### Removed
- Dépendance à `TCG_POKEMON_TOKEN` / `POKEMON_TCG_API_KEY` (TCGdex ne nécessite aucune clé)
- Filtres `series` et `year` sur la route `/sets` (non supportés par TCGdex en listing)

---

### �🃏 TCG — Uniformisation set Format B + correction traductions

#### Fixed
- **Traduction TCG** — Les 6 normalizers avec `translateText` (Pokemon, MTG, Yu-Gi-Oh, Digimon, Lorcana, One Piece) ne déclenchaient jamais la traduction : le 3e argument `{ enabled: true }` était absent ou mal passé. Corrigé dans tous les normalizers.
- **Champ `set` uniforme** — Les 7 normalizers TCG utilisaient des formats de set incohérents (objet avec champs variables, tableau, string, absent). Tous produisent désormais un objet conforme au schéma Zod : `{ name, code, series, releaseDate }`.
- **Données restaurées** — La standardisation du set avait supprimé des données spécifiques à certains providers. Restaurées comme champs plats dans `details` :
  - Pokemon : `setLogo`, `setSymbol`, `setTotal`
  - MTG : `setId`, `setType`, `setIconSvg`
  - Lorcana : `setNumber`, `collectorNumber`, `setTotal`
  - One Piece : `setSourceId`

#### Changed
- **7 normalizers TCG** réécrits pour le champ `set` : `pokemon.normalizer.js`, `mtg.normalizer.js`, `yugioh.normalizer.js`, `dbs.normalizer.js`, `digimon.normalizer.js`, `lorcana.normalizer.js`, `onepiece.normalizer.js`

---

### 🎁 Collectibles — Coleka bypass Turnstile + audit providers

#### Changed
- **Provider Coleka** — Réécriture complète : remplacement de FlareSolverr par `fetch` natif avec User-Agent Googlebot. Coleka whitelist les crawlers search engine et ne leur impose pas Cloudflare Turnstile. Réponses ~1-2s au lieu de 3-18s, zéro dépendance externe.
  - Nouveau `fetchColeka()` — requête HTTP directe, AbortController 15s, détection Turnstile comme safety check
  - Nouveau parser recherche — extraction via classe CSS `lib_has` avec attribut `data-id`
  - `healthCheck()` — test accès HTTP direct au lieu de vérifier FlareSolverr

#### Fixed
- **Coleka Turnstile** — Cloudflare Turnstile bloquait 100% des requêtes FlareSolverr (standard et fork nodriver). Résolu via User-Agent crawler
- **Luluberlu detail** — L'endpoint détail échouait car l'URL construite n'utilisait plus le bon format slug. Corrigé avec les URLs directes depuis la recherche
- **Luluberlu sourceId** — Le `sourceId` retourné par la recherche était l'ID numérique (`3155`) mais `/item/:path` attendait le slug complet (`goldorak-a3155.html`). Le normalizer utilise désormais le slug URL comme `sourceId`
- **Transformerland proxy** — Configuration `proxy: {}` invalide causait des erreurs HTTP 500 via FlareSolverr. Supprimée

---

### 🔧 Amazon — Routes alias par domaine

#### Added
- **`amazon-alias.factory.js`** — Factory générant des routers Express alias Amazon avec catégorie pré-configurée
- **9 routes alias Amazon** exposant Amazon comme provider natif dans chaque domaine :
  | Route | Catégorie Amazon | Label |
  |-------|-----------------|-------|
  | `/api/videogames/amazon` | `videogames` | Jeux vidéo |
  | `/api/collectibles/amazon` | `toys` | Jouets |
  | `/api/boardgames/amazon` | `toys` | Jouets |
  | `/api/construction-toys/amazon` | `toys` | Jouets |
  | `/api/books/amazon` | `books` | Livres |
  | `/api/anime-manga/amazon` | `books` | Livres |
  | `/api/comics/amazon` | `books` | Livres |
  | `/api/music/amazon` | `music` | Musique |
  | `/api/media/amazon` | `movies` | Films & Séries |
- Chaque alias expose : `GET /search`, `GET /product/:asin`, `GET /health`, `GET /`

---

### �🔧 Amazon — VPN Gluetun + détection AWS WAF + format Tako standard

#### Added
- **Gluetun VPN** intégré au stack Docker de production (PIA OpenVPN, proxy HTTP 8888)
- `fetchAmazonPage()` — warm-up session FlareSolverr + retry automatique sur WAF challenge AWS
- `isWafChallenge(html)` — détection des pages challenge AWS WAF (`awsWafCookieDomainList`, `challenge.js`)
- `getAmazonFsrOptions()` — injection automatique du proxy VPN via `VPN_PROXY_URL`
- `detectAmazonBlock(html)` — détection bot_detection, CAPTCHA, error_page
- Variables d'environnement : `VPN_PROXY_URL`, `GLUETUN_CONTROL_URL`
- `FlareSolverrClient.ensureSession()` accepte maintenant des options (proxy) et attend 5s pour résoudre le JS WAF
- `FlareSolverrClient._request()` supporte le paramètre `proxy` (passé à Chromium via FlareSolverr)

#### Changed
- **Amazon normalizer** — réécriture complète au format Tako standard :
  - `id: "amazon:{asin}"`, `sourceId`, `images: { primary, thumbnail, additional }`, `urls: { detail, source }`, `details: { asin, marketplace, price, priceFormatted, currency, isPrime, rating, reviewCount, brand }`
  - Supprimé : `buildPriceSubtitle()`, anciens champs `metadata{}`, `collection`, `subtitle`, `source`, `year`
- **Amazon routes** — enveloppe standard : `{ data[], domain, provider, query, total, count, pagination, meta }`
- **ConsoleVariations normalizer** — champ `name` → `title`, format enveloppe `data[]`
- **ConsoleVariations provider** — ajout `cleanUrl()` pour corriger les `\/` dans les URLs d'images
- **Carddass normalizer** — renommage : `name` → `title`, `provider_id` → `sourceId`, `images.main` → `images.primary`
- **Carddass provider** — correction collision ID dans `getCardById()` (priorité PK)

#### Fixed
- Amazon retournait 0 résultats (IP bloquée par Amazon, résolue via VPN Gluetun)
- AWS WAF challenge (1990 bytes) bloquait la 1ère requête — résolu par warm-up session + retry
- ConsoleVariations : backslashes `\/` dans les URLs d'images JSON
- ConsoleVariations : format de réponse non standard (`items[]` → `data[]`)
- Carddass : collision d'ID entre PK numériques et card_number

---

## [2.6.0] - 2026-03-04

### 🐉 Dragon Ball — Archive dbzcollection.fr + DBS Card Game

Expansion majeure Dragon Ball : archive du site dbzcollection.fr dans Carddass + nouveau provider **DBS Card Game** dans le domaine TCG couvrant Masters (6 213 cartes DeckPlanet API) et Fusion World (1 689 cartes Bandai officiel).

#### dbzcollection.fr → Carddass
- **1 licence** Dragon Ball (source_site: dbzcollection)
- **336 collections** hiérarchisées
- **1 477 séries** avec capsules
- **90 515 cartes** Dragon Ball avec images h50 + h400 (219 093 images, 9,8 Go)
- Migration `004`: ajout colonne `source_site` sur toutes les tables carddass
- Contraintes UNIQUE mises à jour pour supporter multi-sites

#### DBS Card Game (nouveau provider TCG)
- **DBS Masters** : 6 213 cartes, 91 sets (source: DeckPlanet API) — 6 607 images, 441 Mo
- **Fusion World** : 1 689 cartes, 28 sets (source: Bandai officiel dbs-cardgame.com) — 1 755 images, 163 Mo
- Migration `005`: tables `dbs_sets` + `dbs_cards` (38 colonnes, 11 index)
- Support Leaders (recto/verso), bans, errata, variantes

#### 6 endpoints DBS TCG
- `GET /api/tcg/dbs/search?q=` — recherche full-text (filtres: game, color, type, rarity, set)
- `GET /api/tcg/dbs/card/:id` — détail carte par card_number ou ID
- `GET /api/tcg/dbs/sets` — liste des sets (filtre: game)
- `GET /api/tcg/dbs/sets/:code` — détail set avec cartes
- `GET /api/tcg/dbs/stats` — statistiques par jeu/couleur/type/rareté
- `GET /api/tcg/dbs/health` — santé du provider

#### Fichiers ajoutés
- `src/domains/tcg/providers/dbs.provider.js` — provider PostgreSQL DBS
- `src/domains/tcg/normalizers/dbs.normalizer.js` — normalisation Tako format
- `src/domains/tcg/routes/dbs.routes.js` — 6 routes Express
- `scripts/scrape-dbzcollection.cjs` — scraper 3 phases dbzcollection.fr
- `scripts/ingest-dbs-cards.cjs` — ingestion DeckPlanet + Fusion World
- `scripts/migrations/004_add_source_site_column.sql` — migration multi-sources carddass
- `scripts/migrations/005_create_dbs_tables.sql` — tables DBS Card Game
- `docs/DRAGON_BALL_RESEARCH.md` — recherche complète sources Dragon Ball

#### Fichiers modifiés
- `src/domains/tcg/index.js` — DBS ajouté comme 7e provider TCG
- `src/domains/collectibles/providers/carddass.provider.js` — support multi-sites (animecollection + dbzcollection), stats bySite

#### Totaux cumulés v2.6.0
- **Carddass** : 122 200 cartes (31 685 animecollection + 90 515 dbzcollection), 219 093 images (9,8 Go)
- **DBS Card Game** : 7 902 cartes, 119 sets, 8 362 images (604 Mo)
- **Grand total** : 130 102 cartes, 227 455 images (~10,4 Go)

---

## [2.5.0] - 2026-03-03

### 🃏 Carddass — Archive complète animecollection.fr

Nouveau provider **Carddass** dans le domaine `collectibles` : archive complète du site animecollection.fr (31 685 cartes, 6,5 Go d'images HD).

#### Données archivées
- **80 licences** (Dragon Ball, Gundam, Sailor Moon, One Piece, etc.)
- **336 collections** hiérarchisées par licence
- **727 séries** avec capsules
- **31 685 cartes** avec images HD depuis le stockage local
- **6 379 images supplémentaires** (dos de carte, variantes)
- **1 734 packagings** (emballages produits)
- **Total : 40 605 fichiers** servis depuis `/files/carddass-archive/`

#### 10 endpoints REST
- `GET /api/collectibles/carddass/health` — santé du provider
- `GET /api/collectibles/carddass/stats` — statistiques complètes
- `GET /api/collectibles/carddass/search?q=` — recherche full-text (filtres : `rarity`, `license`)
- `GET /api/collectibles/carddass/licenses` — liste des 80 licences
- `GET /api/collectibles/carddass/licenses/:id` — détail licence
- `GET /api/collectibles/carddass/licenses/:id/collections` — collections d'une licence
- `GET /api/collectibles/carddass/collections/:id/series` — séries d'une collection
- `GET /api/collectibles/carddass/series/:id/cards` — cartes d'une série
- `GET /api/collectibles/carddass/cards/:id` — détail carte (hiérarchie complète)
- `GET /api/collectibles/carddass/cards/:id/images` — toutes les images d'une carte

#### Fichiers ajoutés
- `src/domains/collectibles/providers/carddass.provider.js` — provider PostgreSQL (fonctionnel)
- `src/domains/collectibles/normalizers/carddass.normalizer.js` — normalisation Tako format
- `src/domains/collectibles/routes/carddass.routes.js` — 10 routes Express
- `src/infrastructure/database/seeds/003_carddass_tables.sql` — 7 tables (auto-seed)
- `docs/CARDDASS_SCRAPING_WORKFLOW.md` — documentation du processus de scraping 3 phases

#### Scraping (3 phases)
1. **Catalogue** : crawl exhaustif des 80 licences → 336 collections → 727 séries → 31 685 cartes
2. **Enrichissement AJAX** : récupération URLs HD + images extras via endpoints AJAX
3. **Téléchargement images** : 40 605 fichiers (6,5 Go) via VPN (Gluetun/PIA)

---

## [2.4.1] - 2026-03-02

### 🌱 Auto-Seed — Données pré-remplies au démarrage

Nouveau système de seeds SQL embarqués : lors d'un déploiement fresh install, les tables `products` (MEGA) et `kreo_products` (KRE-O) sont **automatiquement peuplées** au démarrage de l'application.

#### Système de seeds
- **Tracking par SHA-256** : table `_seed_migrations` stocke filename + checksum
- **Idempotent** : un seed déjà appliqué avec le même checksum est ignoré
- **Auto-update** : si un fichier seed est modifié (checksum différent), il est ré-appliqué automatiquement lors du prochain démarrage / rebuild d'image
- **Transactionnel** : chaque seed est exécuté dans une transaction (rollback si erreur)
- Logs au démarrage : `Seeds OK (tous à jour)` ou `Seeds appliqués : X nouveau(x), Y mis à jour`

#### Fichiers seeds ajoutés
- `src/infrastructure/database/seeds/001_mega_products.sql` — 199 UPSERT (MEGA Construx)
- `src/infrastructure/database/seeds/002_kreo_products.sql` — 417 UPSERT (KRE-O)

#### Bénéfice
- **Zéro intervention manuelle** : `docker compose up -d` suffit pour avoir une API fonctionnelle avec toutes les données d'archive

---

## [2.4.0] - 2026-03-02

### 🗄️ Fusion MEGA_DB → Base interne PostgreSQL

**Breaking change** : La base de données externe MEGA (`Tako_DB_postgres`, port 5434) est supprimée. Les tables `products` et `kreo_products` sont désormais dans la base interne `tako_cache`.

#### Migration
- **Import des données** : 199 produits MEGA + 417 produits KRE-O importés dans `tako_cache`
- **Auto-migration étendue** : `runMigrations()` crée automatiquement les tables `products` et `kreo_products` (avec indexes et fonctions PL/pgSQL) si absentes
- **Réécriture `mega-database.js`** : thin wrapper sur `connection.js` (plus de Pool séparé)
- **Suppression config** : bloc `mega.db` retiré de `env.js`, variables `MEGA_DB_*` supprimées

#### Impact Docker
- Plus besoin du container `Tako_DB_postgres` (stack Tako_BDD)
- Variables supprimées du `.env` : `MEGA_DB_HOST`, `MEGA_DB_PORT`, `MEGA_DB_NAME`, `MEGA_DB_USER`, `MEGA_DB_PASSWORD`
- Un seul container PostgreSQL (`tako_db`) pour tout

#### Vérification
```bash
# Devrait afficher: [InterneDB] ✅ Base interne disponible (199 produits MEGA, 417 produits KRE-O)
docker compose logs tako-api | grep InterneDB
```

---

## [2.3.1] - 2026-03-02

### 🔄 Auto-migration PostgreSQL au démarrage

- **`runMigrations()`** dans `connection.js` : crée automatiquement la table `discovery_cache` (avec indexes) au démarrage si elle n'existe pas
- **Idempotent** : utilise `IF NOT EXISTS`, safe à chaque redémarrage
- **Correction** : la migration SQL (`scripts/migrations/001_create_discovery_cache.sql`) n'avait jamais été exécutée — le cache fonctionnait en mode dégradé (toujours miss)

---

## [2.3.0] - 2026-03-01

### 📦 Migration MinIO → Stockage Fichiers (Filesystem)

**Breaking change** : Remplacement de MinIO par un stockage fichiers en clair sur le disque.

- **Suppression de la dépendance MinIO** : plus de presigned URLs, plus de client S3
- **Fichiers en clair** : tous les fichiers (images, PDFs) sont désormais accessibles directement sur le disque
  - Chemin : `/data/tako-storage/{mega-archive,kreo-archive}/`
  - Servis par `express.static` via `/files/*`
  - 2580 fichiers migrés (410 MEGA + 2170 KRE-O, ~4 Go)
- **Nouvelle infrastructure** : `src/infrastructure/storage/index.js` remplace `mega-minio.js`
- **URLs stables** : plus d'expiration (les presigned URLs MinIO expiraient après 1h)
  - MEGA : `/files/mega-archive/{category}/{sku}.{pdf,jpg}`
  - KRE-O : `/files/kreo-archive/{path}`
- **Rétrocompatibilité** : les anciennes routes proxy (`/file/:sku/pdf`, `/file/:sku/image`) redirigent (301) vers les fichiers statiques
- **Config** : nouvelles variables `STORAGE_PATH` et `FILE_BASE_URL` (remplacent `MEGA_MINIO_*`)
- **Docker** : volume monté en read-only (`/mnt/egon/websites/tako-storage:/data/tako-storage:ro`)
- **Nginx Proxy Manager** : prët pour `tako.snowmanprod.fr/files/`

### 🏗️ KRE-O Archive - Conversion scans d'instructions en PDF

- Conversion des 87 dossiers de scans (images WebP page par page) en **87 PDFs uniques**
- 1621 pages traitées, 677 MB de PDFs générés (sharp + pdf-lib)
- Stockés dans MinIO : `pdfs/{set_number}_instructions_scan.pdf`
- `pdf_path` en base pointe désormais vers le PDF au lieu du dossier d'images
- **100 PDFs au total** dans MinIO : 87 scans + 12 Hasbro officiels + 1 replacement parts

#### Script ajouté
- `scripts/convert-kreo-instructions-to-pdf.js` — Conversion images → PDF par produit

---

## [2.2.1] - 2025-03-01

### 🏗️ KRE-O Archive - Manuels Hasbro + corrections orphelins

#### Manuels PDF Hasbro via Wayback Machine
- Scraping des pages produit Hasbro archivées (131 pages : 121 ancien format + 10 nouveau format)
- **12 manuels d'instructions** PDF officiels téléchargés et stockés dans MinIO (`pdfs/`)
- 1 PDF "Replacement Parts" récupéré en bonus (WK2682 Ocean Attack)
- 4 PDFs non archivés par la Wayback Machine (impossible à récupérer)
- Produits enrichis : 30667, 30687, 30688, 31145, 31146, 36421, A4584, A4585, B0715, KR7722, WK2225, WK2682

#### Correction des instructions orphelines
- 37 dossiers d'instructions dans MinIO sans produit correspondant en base
- 35 nouveaux produits Kreon créés (IDs 384-418) avec set_number généré `KRO-{SLUG}`
- 2 produits existants mis à jour (A4910, KR31831)
- **Total : 417 produits** (était 382), **93 avec au moins un PDF/scan**

#### Scripts ajoutés
- `scripts/scrape-kreo-wayback-pdfs.js` — Extraction + téléchargement des manuels PDF Hasbro
- `scripts/fix-orphan-instructions-v2.js` — Correction des dossiers instructions orphelins
- `scripts/report-kreo.js` — Rapport complet état BDD + MinIO

---

## [2.2.0] - 2025-03-01

### 🏗️ KRE-O Archive - 382 produits, 6 franchises (2011-2017)

Ajout de l'archive complète KRE-O (Hasbro), construite par croisement de 4 sources :
wiki Fandom, Wayback Machine, TFWiki.net, et enrichissement par franchise.

#### Infrastructure

**Base de données** (`kreo_products` dans `mega_archive`) :
- 382 produits : 201 Transformers, 124 GI Joe, 17 CityVille, 15 D&D, 15 Star Trek, 10 Battleship
- 382/382 avec `sub_line` et `year` renseignés
- 146 avec prix retail, 50 avec scans d'instructions, 122 avec nombre de pièces
- Index trigram sur `name` pour recherche full-text

**MinIO** (`kreo-archive` bucket) :
- 2070 objets : 360 images produits + 1710 scans d'instructions
- Support multi-bucket ajouté dans `mega-minio.js`

#### API KRE-O

**Provider** (`src/domains/construction-toys/providers/kreo.provider.js`) :
- Recherche SQL (ILIKE + trigram) avec pagination et filtres
- Navigation par franchise et sub-line
- Health check avec statistiques complètes

**Normalizer** (`src/domains/construction-toys/normalizers/kreo.normalizer.js`) :
- Normalisation au format Tako standard (`construct_toy`)
- Images servies via proxy MinIO

**Routes** (`src/domains/construction-toys/routes/kreo.routes.js`) - 7 endpoints :
- `GET /api/construction-toys/kreo/health` - Santé DB + MinIO + stats
- `GET /api/construction-toys/kreo/search?q=` - Recherche avec pagination
- `GET /api/construction-toys/kreo/franchises` - 6 franchises avec compteurs
- `GET /api/construction-toys/kreo/franchise/:name` - Produits par franchise
- `GET /api/construction-toys/kreo/sublines` - Sub-lines par franchise
- `GET /api/construction-toys/kreo/file/:setNumber/image` - Proxy image MinIO
- `GET /api/construction-toys/kreo/:id` - Détail produit par set_number

#### Scripts de scraping

- `scripts/scrape-kreo.js` (1151 lignes) - Phases 1-3 : wiki Fandom (365 produits)
- `scripts/scrape-kreo-instructions.js` (420 lignes) - Phase 4 : instructions wiki (1710 scans)
- `scripts/scrape-kreo-wayback.js` (350 lignes) - Phase 5 : prix Wayback Machine (+81 prix, +17 produits)
- `scripts/enrich-kreo-tfwiki.js` (454 lignes) - Phase 6 : TFWiki + enrichissement franchises

#### Documentation

- Nouveau : `docs/KREO_SCRAPING_WORKFLOW.md` - Workflow complet des 7 phases de scraping

---

## [2.1.0] - 2025-07-04

### 🚀 MEGA Construx - Migration vers base de données

#### Nouvelle architecture MEGA Provider

Le provider MEGA Construx a été entièrement réécrit pour utiliser une base de données PostgreSQL
et un stockage MinIO au lieu de l'API Searchspring (désormais hors service).

**Infrastructure** (`src/infrastructure/mega/`) :
- Nouveau : `mega-database.js` - Pool PostgreSQL dédié pour l'archive MEGA (min:1, max:5)
- Nouveau : `mega-minio.js` - Client MinIO avec génération d'URLs pré-signées (expiry: 1h)
- Nouveau : `index.js` - Point d'entrée avec `initMegaInfrastructure()`

**Provider** (`mega.provider.js`) - Réécriture complète :
- ✅ Recherche par requête SQL (ILIKE) avec filtre par catégorie
- ✅ Récupération par SKU avec URLs MinIO pré-signées (PDF + images)
- ✅ Navigation par catégorie avec compteurs
- ✅ Endpoint instructions avec URLs pré-signées MinIO
- ✅ Health check avec statistiques (latence DB, nombre de produits)
- ✅ Enrichissement batch des URLs MinIO (lots de 10)

**Normalizer** (`mega.normalizer.js`) - Adapté pour colonnes DB :
- Images au format `{primary, thumbnail, gallery}` depuis colonnes DB
- Statut "archived" pour la disponibilité
- Instructions depuis URLs pré-signées MinIO
- Métadonnées enrichies : `dataSource: 'database'`, `archivedAt`, URLs originales

**Routes** (`mega.routes.js`) - 6 endpoints :
- `GET /api/construction-toys/mega/health` - Santé DB + MinIO
- `GET /api/construction-toys/mega/search?q=` - Recherche avec pagination
- `GET /api/construction-toys/mega/categories` - Liste des catégories avec compteurs
- `GET /api/construction-toys/mega/category/:name` - Produits par catégorie
- `GET /api/construction-toys/mega/instructions/:sku` - PDF instructions (URL pré-signée)
- `GET /api/construction-toys/mega/:id` - Détail produit par SKU

**Configuration** :
- Ajout variables d'environnement MEGA_DB_* et MEGA_MINIO_*
- Initialisation/fermeture MEGA dans le cycle de vie du serveur

**Dépendances** :
- Ajout : `minio` ^8.0.7 (client S3-compatible pour MinIO)

**Base de données cible** :
- PostgreSQL : 199 produits archivés dans 5 catégories (pokemon, halo, hot-wheels, barbie, masters-of-the-universe)
- MinIO : 410 objets (205 PDFs + 205 images, ~3.1 GiB)

---

### 🚀 Améliorations majeures

#### Routes Jikan - Filtrage NSFW et optimisation cache

**Corrections** :
- ✅ Filtrage NSFW fonctionnel avec paramètre `sfw` (all/sfw/nsfw)
- ✅ Cache optimisé dans DEFAULT_LOCALE (fr-FR) pour +100% performance
- ✅ Suppression du filtrage client-side `filterBySfw` (maintenant côté API)
- ✅ Architecture alignée avec référence TMDB

**Provider Jikan** (`jikan.provider.js`) :
- Ajout paramètre `sfw='all'|'sfw'|'nsfw'` à 5 méthodes :
  - `searchAnime()`, `searchManga()`, `getTop()`, `getCurrentSeason()`, `getUpcoming()`
- Logique de filtrage API :
  - `sfw='sfw'` → API appelée avec `sfw=true` (sans hentai)
  - `sfw='nsfw'` → API appelée avec `rating=rx` (hentai uniquement)
  - `sfw='all'` → Pas de filtre (tout le contenu)

**Routes Jikan** (`jikan.routes.js`) :
- Ajout paramètre `sfw` aux routes search :
  - `GET /search/anime?sfw=all|sfw|nsfw`
  - `GET /search/manga?sfw=all|sfw|nsfw`
- Métadonnées de filtrage dans les réponses
- Suppression de `filterBySfw()` helper (ligne ~89-100)
- Suppression de 6 appels `filterBySfw()` dans discovery routes

**Cache Wrapper** (`cache-wrapper.js`) :
- Stratégie DEFAULT_LOCALE : cache toujours en fr-FR
- Suppression de `lang` de la clé de cache
- Traduction post-cache seulement si langue ≠ DEFAULT_LOCALE
- Gains de performance :
  - Cache HIT fr-FR : **+97.5%** (0ms traduction vs ~2000ms)
  - Cache HIT autres langues : **+92.5%** (1 traduction vs API + traduction)
  - Espace disque : **-75%** (1 cache au lieu de N par langue)

**Documentation** :
- Nouveau : `docs/ANALYSIS_JIKAN_VS_TMDB.md` - Analyse comparative complète
- Nouveau : `docs/CACHE_TRANSLATION_STRATEGY.md` - Architecture cache/traduction
- Nouveau : `docs/CORRECTIONS_JIKAN.md` - Rapport détaillé des corrections
- Nouveau : `docs/RECAP_CORRECTIONS.md` - Récapitulatif pour déploiement
- Mis à jour : `docs/TECHNICAL_NOTES.md` - Notes techniques déploiement

**Tests** :
- Nouveau : `scripts/test-jikan-corrections.sh` - Tests automatisés des corrections

**Migration requise** :
```bash
# Vider le cache Jikan existant (clés avec lang obsolètes)
docker exec tako_db psql -U tako -d tako_cache -c \
  "DELETE FROM discovery_cache WHERE provider='jikan';"
```

---

## [1.0.0] - 2026-02-02

### 🎉 Version majeure - Système complet de cache PostgreSQL

#### ✨ Ajouté

**Phase 1-4 : Endpoints Discovery (19 endpoints)**
- **TMDB** (7 endpoints)
  - `GET /api/media/tmdb/trending` - Films/séries trending (jour/semaine)
  - `GET /api/media/tmdb/popular` - Films/séries populaires
  - `GET /api/media/tmdb/top-rated` - Films/séries les mieux notés
  - `GET /api/media/tmdb/upcoming` - Films/séries à venir
  - `GET /api/media/tmdb/on-the-air` - Séries avec nouveaux épisodes (7j)
  - `GET /api/media/tmdb/airing-today` - Séries diffusées aujourd'hui

- **Jikan** (4 endpoints)
  - `GET /api/anime-manga/jikan/top` - Top anime/manga par score
  - `GET /api/anime-manga/jikan/trending` - Anime de la saison en cours
  - `GET /api/anime-manga/jikan/upcoming` - Anime à venir prochaine saison
  - `GET /api/anime-manga/jikan/schedule` - Planning de diffusion unifié

- **RAWG** (2 endpoints)
  - `GET /api/videogames/rawg/popular` - Jeux populaires (bien notés)
  - `GET /api/videogames/rawg/trending` - Jeux trending récents

- **IGDB** (1 endpoint)
  - `GET /api/videogames/igdb/popular` - Jeux populaires par rating

- **Deezer** (1 endpoint)
  - `GET /api/music/deezer/charts` - Charts albums/tracks/artistes

- **iTunes** (1 endpoint)
  - `GET /api/music/itunes/charts` - Charts albums/songs multi-pays

**Phase 5 : Cache PostgreSQL**
- Infrastructure complète de cache avec PostgreSQL
  - Table `discovery_cache` avec 12 colonnes + 4 indexes
  - Repository CRUD complet (9 fonctions)
  - Cache wrapper intelligent avec TTL configurables
  - Migration SQL automatisée

- Refresh automatique (9 cron jobs)
  - 02:00 → TMDB trending | 02:30 → Jikan trending
  - 03:00 → TMDB/RAWG popular | 03:30 → IGDB popular
  - 04:00 → Deezer charts | 04:30 → iTunes charts
  - */6h → Upcoming refresh | 05:00 → Purge (>90j) | */1h → Monitoring

- API Admin Cache (4 endpoints)
  - `GET /api/cache/stats` - Statistiques globales + par provider
  - `POST /api/cache/refresh/:provider` - Force refresh d'un provider
  - `POST /api/cache/refresh` - Refresh entrées expirées (batch)
  - `DELETE /api/cache/clear` - Vider tout le cache

#### 🚀 Performance

- **Réduction latence : -93%** (159ms → 11ms)
- **Gain de vitesse : 14x plus rapide**
- **TTL intelligents** : 24h (trending/popular/charts), 6h (upcoming/schedule)
- **Metadata cache** : Toutes les réponses incluent `cached` et `cacheKey`

#### 📝 Documentation

- `docs/TRENDING_ROADMAP.md` - Roadmap complète (Phases 1-5)
- `docs/CACHE_SYSTEM.md` - Documentation technique du cache
- `docs/API_ROUTES.md` - Mise à jour avec 19 endpoints + cache admin
- `scripts/test-cache.sh` - Script de tests automatisés

#### 🛠️ Technique

- **Dépendances** : `node-cron@^3.x.x` pour tâches planifiées
- **Nouveaux fichiers** :
  - `src/infrastructure/database/discovery-cache.repository.js`
  - `src/infrastructure/database/cache-refresher.js`
  - `src/infrastructure/database/refresh-scheduler.js`
  - `src/shared/utils/cache-wrapper.js`
  - `src/core/routes/cache.routes.js`
  - `scripts/migrations/001_create_discovery_cache.sql`

#### 🐛 Corrections

- Gestion correcte des fermetures de connexions PostgreSQL
- Traduction automatique sur tous les endpoints discovery
- Normalisation conforme RESPONSE-FORMAT.md

---

## [Unreleased]

### Added - Classes de base
- `BaseNormalizer` : Classe abstraite avec noyau commun obligatoire (`src/core/normalizers/`)
- `BaseProvider` : Classe abstraite avec HTTP, retry, timeout (`src/core/providers/`)
- Schémas Zod : 12 types de contenu avec noyau commun + détails spécifiques

### Added - Domain construction-toys

#### Providers
| Provider | Status | Méthodes |
|----------|--------|----------|
| **Brickset** | ✅ | `search`, `getById`, `getThemes`, `getSubthemes`, `getYears`, `getRecentlyUpdated` |
| **Rebrickable** | ✅ | `search`, `getById`, `getSetParts`, `getSetMinifigs`, `getThemes`, `searchParts`, `searchMinifigs`, `getColors` |
| **LEGO** | ✅ Complet | `search`, `getById` (scraping HTML via FlareSolverr) |
| Playmobil | 🔜 | Scraping |
| Klickypedia | 🔜 | Scraping |
| Mega Construx | 🔜 | SearchSpring API |

#### Normalizers
- `BricksetNormalizer` : Mapping complet vers schéma `construct_toy`
- `RebrickableNormalizer` : Mapping avec support themes + parts/minifigs enrichis
- `LegoNormalizer` : Mapping HTML vers schéma `construct_toy` avec filtrage produits valides

#### LEGO Provider - Détails d'implémentation (29 janvier 2026)
- **Méthode** : Scraping HTML uniquement (GraphQL LEGO supprimé - erreur 400 systématique)
- **Bypass Cloudflare** : FlareSolverr requis
- **Extraction de données** :
  - `__NEXT_DATA__` JSON embedded (méthode primaire)
  - HTML parsing (fallback)
  - `data-test` attributes
- **Données extraites** :
  - Titre, description, set number
  - Prix (EUR), disponibilité (textes FR/EN supportés)
  - Nombre de pièces, tranche d'âge
  - Thème (Star Wars™, etc.)
  - **Images** : 17-19 images dédupliquées (filtrage miniatures/vidéos)
  - **Vidéos** : 2 vidéos promotionnelles (filtrage Feature clips, variantes taille)
- **Exclusions** : Mosaic Maker (40179), Gift Cards, VIP Rewards, Minifigure Factory

#### Scripts de test
- `scripts/test-lego.sh` : Test du provider LEGO avec FlareSolverr
- `scripts/test-lego.js` : Script Node.js de test détaillé

### Added - Schémas
- `constructToyDetailsSchema` : Ajout du champ `videos` (array d'URLs)
- `constructToyDetailsSchema` : Ajout du champ `instructions` (manuels PDF)

### Added - Infrastructure Scraping (⚠️ CRITIQUE)
- `FlareSolverrClient` : Client partagé pour FlareSolverr (`src/infrastructure/scraping/`)
- **Gestion automatique des sessions** : création, réutilisation, destruction
- **Nettoyage sur erreur** : session détruite si requête échoue
- **Hooks de fermeture** : `beforeExit`, `SIGINT`, `SIGTERM`

#### ⚠️ RÈGLES OBLIGATOIRES pour les providers utilisant FlareSolverr
```
1. TOUJOURS appeler destroySession() après utilisation (try/finally)
2. Ne PAS créer plusieurs instances du client pour le même provider
3. Réutiliser la session tant qu'elle est valide (5 min)
4. En cas d'erreur, détruire la session pour recommencer proprement
```

#### Configuration Docker FlareSolverr (docker-compose.yaml)
```yaml
flaresolverr:
  environment:
    - MAX_SESSIONS=3       # LIMITE CRITIQUE - évite explosion mémoire
    - SESSION_TTL=300000   # 5 min - auto-destruction des sessions orphelines
    - HEADLESS=true
  deploy:
    resources:
      limits:
        memory: 2G         # LIMITE CRITIQUE - 1 Chromium = 200-500 Mo
        cpus: '2'          # LIMITE CRITIQUE - évite 960% CPU
```

#### Incident du 29/01/2026 - 301 processus Chromium
- **Cause** : Sessions FlareSolverr jamais détruites
- **Symptômes** : RAM 32 Go saturée, CPU 960%, système inutilisable
- **Solution** : Ajout `destroySession()`, limites Docker, TTL sessions

### Added - LEGO Instructions
- `getLegoInstructions(id)` : Récupère les manuels PDF d'un set LEGO
- Enrichissement automatique dans `getById()` avec les manuels
- Route `/construction-toys/lego/instructions/:id` (à venir)

### Added - Documentation
- `docs/RESPONSE-FORMAT.md` : Format de réponse normalisé avec exemples
- Mise à jour `docs/MIGRATION.md` avec avancement réel
- `.env.example` : Toutes les clés API documentées par domaine

### Changed
- `src/config/env.js` : Ajout de toutes les clés API providers
- `src/core/schemas/content-types.js` : Refonte complète avec `coreItemSchema` + `createItemSchema()`
- Suppression middleware authentification (usage personnel)
- **LEGO Provider simplifié** : Suppression de GraphQL (échouait systématiquement), scraping HTML seul

### Fixed
- Logger : Export direct des méthodes `debug`, `info`, `warn`, `error`
- LEGO images : Déduplication correcte (108 → 19 images)
- LEGO vidéos : Filtrage Feature clips et variantes de taille (13 → 2 vidéos)
- LEGO thème : Extraction correcte ("Star Wars™" au lieu de "dark")
- LEGO disponibilité : Support textes français ("Disponible", "Rupture de stock")

---

## [0.1.0] - 2026-01-28

### Added
- Structure initiale du projet Tako API (52 fichiers)
- Configuration centralisée (`src/config/`)
- Middlewares partagés (`src/shared/middleware/`)
- Système de logging coloré
- Gestion d'erreurs standardisée
- Schémas Zod pour validation
- Documentation initiale (README, MIGRATION, ADR, API Guidelines)
- Squelette des 11 domaines métier
- Docker + docker-compose

### Architecture
- Séparation app.js / server.js
- Organisation par domaines métier
- Classes d'erreur HTTP spécialisées
- ES Modules exclusivement

---

## Roadmap

### Court terme
- [x] Provider LEGO (scraping HTML + FlareSolverr) ✅
- [ ] Provider Playmobil (scraping)
- [ ] Routes du domaine construction-toys
- [ ] Tests Brickset/Rebrickable

### Moyen terme
- [ ] Infrastructure database (cache PostgreSQL)
- [ ] Domaine `books`
- [ ] Domaine `media`
- [ ] Domaine `games`

### Long terme
- [ ] Tous les domaines migrés
- [ ] Tests complets
- [ ] Documentation OpenAPI
- [ ] CI/CD

## [2.3.0] - 2025-01-29

### Added - Domaine Media (TMDB & TVDB)

#### TMDB Provider
- **Recherche**: Films, séries, tous types avec pagination
- **Films**: Détails complets (genres, cast, crew, collection, images)
- **Séries**: Détails (saisons, nombre d'épisodes, status, networks)
- **Saisons**: Détails avec liste des épisodes
- **Épisodes**: Détails avec crew
- **Collections/Sagas**: Films ordonnés avec poster/backdrop
- **Personnes**: Biographie, filmographie
- **Réalisateurs**: Filmographie triée par date
- **Discover**: Films par genre/année avec tri

#### TVDB Provider  
- **Recherche**: Films, séries, personnes, listes
- **Films**: Détails avec artworks, traductions
- **Séries**: Détails avec saisons (Aired Order)
- **Saisons**: Détails par ID avec épisodes
- **Épisodes**: Détails avec directors/writers/guestStars
- **Listes**: Sagas et collections officielles
- **Personnes**: Biographie, characters
- **Réalisateurs**: Filmographie (films + séries)

#### Traduction automatique
- Support lang=fr pour traductions natives TVDB
- Fallback autoTrad=1 sur service de traduction intégré
- Traduction genres et descriptions

### Routes ajoutées

```
/api/media/tmdb/
├── health
├── search?q=&type=&lang=&pageSize=
├── search/movies?q=
├── search/series?q=
├── movies/:id
├── series/:id
├── series/:id/season/:n
├── series/:id/season/:n/episode/:e
├── collections/:id
├── persons/:id
├── directors/:id/movies
└── discover/movies?genre=&year=&sort=

/api/media/tvdb/
├── health
├── search?q=&type=&pageSize=
├── search/movies?q=
├── search/series?q=
├── movies/:id
├── series/:id
├── series/:id/seasons
├── seasons/:id
├── series/:id/episodes
├── episodes/:id
├── lists/:id
├── persons/:id
└── directors/:id/works
```
