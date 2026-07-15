# Tako API 🐙

> **Version 2.6.1** - Architecture modulaire par domaines
> 
> **Migration toys_api ✅ Terminée** - 30 janvier 2026  
> **Dernière mise à jour** : 13 mars 2026 (TCG : fallback images Pokémon + fix Lorcana)

API REST multi-sources pour rechercher et récupérer des informations produits depuis **39 providers** répartis en **12 domaines**.

## 🏗️ Architecture

```
tako-api/
├── src/
│   ├── app.js                     # Configuration Express (middlewares)
│   ├── server.js                  # Démarrage serveur + graceful shutdown
│   │
│   ├── config/                    # Configuration centralisée
│   │   ├── index.js               # Export principal
│   │   ├── env.js                 # Variables d'environnement validées
│   │   ├── sources.js             # Configuration par source API
│   │   └── cache.js               # Configuration cache
│   │
│   ├── core/                      # Classes et contrats de base
│   │   ├── BaseProvider.js        # Classe abstraite provider
│   │   ├── BaseNormalizer.js      # Classe abstraite normalizer
│   │   ├── BaseRouter.js          # Factory pour routes standardisées
│   │   └── schemas/               # Schémas de validation Zod
│   │
│   ├── domains/                   # Regroupement par domaine métier
│   │   ├── construction-toys/     # LEGO, Playmobil, Mega, KRE-O, Rebrickable
│   │   ├── books/                 # GoogleBooks, OpenLibrary, Abandonware Magazines
│   │   ├── videogames/            # RAWG, IGDB, JVC, ConsoleVariations
│   │   ├── media/                 # TMDB, TVDB
│   │   ├── anime-manga/          # Jikan, MangaUpdates
│   │   ├── comics/                # ComicVine, Bedetheque
│   │   ├── tcg/                   # Pokémon TCG, MTG, Yu-Gi-Oh!, Lorcana, Digimon, One Piece, DBS
│   │   ├── collectibles/          # Coleka, LuluBerlu, Carddass
│   │   ├── music/                 # Discogs, Deezer, MusicBrainz, iTunes
│   │   ├── ecommerce/             # Amazon (8 marketplaces)
│   │   └── boardgames/            # BoardGameGeek
│   │
│   ├── infrastructure/            # Services techniques
│   │   ├── database/              # PostgreSQL (cache + données internes)
│   │   │   ├── connection.js      # Pool + auto-migration + auto-seed
│   │   │   ├── seeds/             # SQL embarqués (MEGA + KRE-O)
│   │   │   └── ...                # Repository, refresher, scheduler
│   │   ├── mega/                  # Archive MEGA + KRE-O (wrapper DB + storage)
│   │   ├── storage/               # Stockage fichiers (images, PDFs)
│   │   └── scraping/              # FlareSolverr, Puppeteer
│   │
│   └── shared/                    # Code partagé
│       ├── middleware/            # Express middlewares
│       ├── errors/                # Classes d'erreur
│       └── utils/                 # Helpers purs
│
├── docs/                          # Documentation
└── scripts/                       # Scripts utilitaires
```
│       └── utils/                 # Helpers purs
│
├── tests/                         # Tests (structure miroir de src/)
├── docs/                          # Documentation
└── scripts/                       # Scripts utilitaires
```

## 📦 Domaines & Providers

| Domaine | Providers | Status |
|---------|-----------|--------|
| `construction-toys` | Brickset, Rebrickable, LEGO, Playmobil, Klickypedia, Mega, KRE-O | ✅ Complet (7/7) |
| `books` | Google Books, OpenLibrary | ✅ Complet (2/2) |
| `comics` | ComicVine, Bedetheque | ✅ Complet (2/2) |
| `anime-manga` | Jikan (MyAnimeList), MangaUpdates | ✅ Complet (2/2) |
| `media` | TMDB, TVDB | ✅ Complet (2/2) |
| `videogames` | IGDB, RAWG, JeuxVideo.com, ConsoleVariations | ✅ Complet (4/4) |
| `boardgames` | BoardGameGeek | ✅ Complet (1/1) |
| `collectibles` | Coleka, LuluBerlu, Transformerland, Carddass | ✅ Complet (4/4) |
| `tcg` | Pokémon TCG, MTG, Yu-Gi-Oh!, Lorcana, Digimon, One Piece, **DBS** | ✅ Complet (7/7) |
| `music` | Discogs, Deezer, MusicBrainz, iTunes | ✅ Complet (4/4) |
| `ecommerce` | Amazon (8 marketplaces) | ✅ Complet (1/1) |

**Total : 11 domaines, 36 providers** - Migration toys_api **100% terminée** ✅

## ⚠️ FlareSolverr - IMPORTANT

Certains providers (LEGO, Playmobil, etc.) nécessitent FlareSolverr pour bypass Cloudflare.

> **🚨 ATTENTION** : Sans gestion correcte des sessions, FlareSolverr peut saturer le système !
> - Chaque session = 1 processus Chromium (~200-500 Mo RAM)
> - Sessions non détruites = accumulation exponentielle
> - Incident du 29/01/2026 : 301 Chromium, 32 Go RAM saturée, CPU 960%

### Règles obligatoires pour les providers

```javascript
// ✅ BON - Toujours utiliser try/finally
const fsr = new FlareSolverrClient('mon-provider');
try {
  const html = await fsr.get(url);
} finally {
  await fsr.destroySession(); // OBLIGATOIRE
}

// ❌ MAUVAIS - Jamais sans nettoyage
const html = await fsr.get(url);
// Session orpheline = Chromium zombie !
```

### Configuration Docker recommandée

```yaml
flaresolverr:
  environment:
    - MAX_SESSIONS=3       # Limite critique
    - SESSION_TTL=300000   # Auto-destruction 5 min
  deploy:
    resources:
      limits:
        memory: 2G
        cpus: '2'
```

Voir `src/infrastructure/scraping/FlareSolverrClient.js` pour le client partagé.

## 🔒 Gluetun VPN — Proxy HTTP pour Amazon

Amazon bloque les requêtes provenant d'IPs de datacenters. **Gluetun** fournit un tunnel VPN (PIA OpenVPN) avec un proxy HTTP que FlareSolverr utilise pour ses requêtes Chromium.

| Composant | Rôle |
|-----------|------|
| **Gluetun** | Tunnel VPN PIA OpenVPN → proxy HTTP `:8888` |
| **FlareSolverr** | Chromium headless, route via le proxy Gluetun |
| **fetchAmazonPage()** | Warm-up session (5s) + détection WAF + retry auto |

```yaml
# docker-compose.yaml (extrait)
gluetun:
  image: qmcgaw/gluetun:latest
  cap_add: [NET_ADMIN]
  environment:
    - VPN_SERVICE_PROVIDER=private internet access
    - VPN_TYPE=openvpn
    - HTTPPROXY=on
    - HTTPPROXY_LISTENING_ADDRESS=:8888
```

La variable `VPN_PROXY_URL=http://gluetun:8888` est injectée dans l'API — le provider Amazon l'utilise automatiquement.

## ✨ Principes d'architecture

### 1. Séparation des responsabilités

```
Provider (appel API) → Normalizer (transformation) → Router (HTTP)
```

- **Provider** : Appelle l'API externe, gère auth/retry
- **Normalizer** : Transforme vers le schéma unifié
- **Router** : Expose les endpoints HTTP, gère cache

### 2. Contrats uniformes

Chaque domaine expose la même interface :
- `GET /{domain}/search` - Recherche
- `GET /{domain}/details` - Détails via detailUrl
- `GET /{domain}/{provider}/search` - Recherche spécifique
- `GET /{domain}/{provider}/details` - Détails spécifiques

### 3. Schémas validés

Utilisation de **Zod** pour valider :
- Les paramètres d'entrée (query params)
- Les réponses des providers
- Les données normalisées

### 4. Format de réponse unifié

Toutes les réponses suivent le **même schéma** :
```json
{
  "id": "source:sourceId",
  "type": "construct_toy",
  "source": "rebrickable",
  "title": "75192 Millennium Falcon",
  "description": "...",
  "year": 2017,
  "images": { "primary": "...", "thumbnail": "...", "gallery": [] },
  "urls": { "source": "...", "detail": "/api/..." },
  "details": { /* spécifique au type */ }
}
```

Voir [docs/RESPONSE-FORMAT.md](docs/RESPONSE-FORMAT.md) pour la documentation complète.

### 4. Configuration centralisée

Un seul point d'entrée pour la configuration :
```javascript
import { config } from './config/index.js';

config.sources.lego.baseUrl  // URL de l'API
config.cache.ttl             // TTL du cache
config.env.port              // Port du serveur
```

## 🚀 Démarrage rapide

```bash
# Installation
npm install

# Développement (avec watch)
npm run dev

# Production
npm start

# Tests
npm test
```

## 🔧 Variables d'environnement

```env
# Serveur
PORT=3000
NODE_ENV=development

# Base PostgreSQL interne (cache + données MEGA/KRE-O)
DB_HOST=tako-db
DB_PORT=5432
DB_NAME=tako_cache
DB_USER=tako
DB_PASSWORD=secret
DB_ENABLED=true

# Stockage fichiers (images, PDFs)
STORAGE_PATH=/data/tako-storage
FILE_BASE_URL=https://tako.snowmanprod.fr/files

# Scraping
FSR_URL=http://flaresolverr:8191/v1

# VPN Proxy (requis pour Amazon)
VPN_PROXY_URL=http://gluetun:8888
GLUETUN_CONTROL_URL=http://gluetun:8000

# APIs (optionnelles)
BRICKSET_API_KEY=
BRICKSET_USERNAME=
BRICKSET_PASSWORD=
REBRICKABLE_API_KEY=
TMDB_API_KEY=
TVDB_API_KEY=
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
COMICVINE_API_KEY=
DISCOGS_TOKEN=
RAWG_API_KEY=

# Traduction (intégrée, activée par défaut)
AUTO_TRAD_ENABLED=true
```

## 🗄️ Base de données & Auto-provisioning

Tako API utilise **un seul conteneur PostgreSQL** (`tako_db`) pour tout :
- **Cache discovery** : table `discovery_cache` — cache des endpoints discovery (trending, popular, etc.)
- **Archive MEGA Construx** : table `products` — 199 produits archivés
- **Archive KRE-O** : table `kreo_products` — 417 produits archivés
- **Archive Carddass** : 7 tables — 122 200 cartes archivées (animecollection.fr + dbzcollection.fr)
- **Archive DBS Card Game** : 2 tables — 7 902 cartes (Masters 6 213 + Fusion World 1 689), 119 sets

### Auto-migration
Au démarrage, `runMigrations()` crée automatiquement toutes les tables + indexes si absents. Aucune intervention manuelle requise.

### Auto-seed
Au démarrage, `runSeeds()` applique les fichiers SQL de `src/infrastructure/database/seeds/` :
- Tracking par **SHA-256** dans la table `_seed_migrations`
- Seeds déjà appliqués avec le même checksum = ignorés
- Seeds modifiés = ré-appliqués automatiquement (ex: lors d'un rebuild d'image)
- **3 seeds embarqués** : MEGA (199 produits), KRE-O (417 produits), Carddass (7 tables)
- **5 migrations externes** : discovery_cache, DBS tables, source_site multi-sources

**Résultat** : un simple `docker compose up -d` sur une machine vierge donne une API fonctionnelle avec toutes les données.

## 📦 Stockage fichiers

Les fichiers statiques (images produits, PDFs d'instructions) sont servis depuis le disque :
- **Volume** : `/mnt/egon/websites/tako-storage` monté en **read-only** sur `/data/tako-storage`
- **Contenu** : 235 817+ fichiers (~11 Go) — MEGA + KRE-O + Carddass + DBS archives
- **URLs** : `https://tako.snowmanprod.fr/files/{mega-archive,kreo-archive,carddass-archive,dbs-archive}/...`
- **Pas d'expiration** : URLs stables (contrairement aux presigned URLs MinIO)

## 📖 Documentation API

La documentation OpenAPI est disponible à `/docs` une fois le serveur démarré.

---

## 🔄 Migration depuis toys_api

Ce projet est une refonte complète de `toys_api` avec :
- ✅ Architecture par domaines métier (11 domaines)
- ✅ 32 providers migrés (100% de toys_api)
- ✅ Classes de base pour uniformiser le code
- ✅ Validation des données avec Zod
- ✅ Format de réponse normalisé
- ✅ Documentation complète (API_ROUTES.md)
- ✅ Tests systématiques
- ✅ FlareSolverr correctement géré (sessions auto-nettoyées)

**Statut de migration** : ✅ **TERMINÉE** (30 janvier 2026)  
**Dernière version** : v2.6.1 (13 mars 2026) — TCG : champ set uniforme + traductions corrigées

### Améliorations par rapport à toys_api

1. **Architecture modulaire** : Code organisé par domaines métier
2. **Session FlareSolverr sécurisée** : Plus de fuites mémoire Chromium
3. **Format unifié** : Toutes les réponses suivent le même schéma
4. **Traduction intégrée** : Support multi-langue via API interne
5. **Documentation auto-générée** : OpenAPI specs pour chaque domaine
6. **Tests complets** : Couverture de tous les providers
7. **Docker optimisé** : Limites mémoire, health checks, graceful shutdown

Voir [docs/API_ROUTES.md](docs/API_ROUTES.md) pour la liste complète des endpoints.
