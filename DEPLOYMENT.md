# 🚀 Tako API - Déploiement

> **Dernière mise à jour** : 6 mars 2026  
> **Version** : 2.6.1  
> **Statut** : ✅ Production Ready

---

## 📦 Ressources en ligne

### GitHub Repository
- **URL** : https://github.com/Nimai26/Tako_Api
- **Branche principale** : `main`
- **Version actuelle** : v2.6.0

### DockerHub
- **Image** : `nimai24/tako-api`
- **Tags disponibles** :
  - `nimai24/tako-api:2.6.0` (version actuelle)
  - `nimai24/tako-api:latest` (dernière version)
  - Tags historiques : `2.5.0`, `2.4.1`, `2.4.0`, `2.3.1`, `2.3.0`, `2.2.2`, `1.0.0`
- **Registry** : https://hub.docker.com/r/nimai24/tako-api

---

## 🐳 Utilisation Docker

### Pull l'image

```bash
# Version spécifique
docker pull nimai24/tako-api:2.6.0

# Dernière version
docker pull nimai24/tako-api:latest
```

### Démarrage rapide

```bash
# Avec docker run (standalone - sans DB ni FlareSolverr)
docker run -d \
  --name tako-api \
  -p 3000:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e DB_ENABLED=false \
  nimai24/tako-api:latest

# Accès API
curl http://localhost:3000/health
```

### Docker Compose (recommandé)

Le projet inclut un `docker-compose.yaml` complet avec :
- **Tako API** — application Node.js
- **PostgreSQL** (`tako_db`) — cache + données internes (MEGA, KRE-O)
- **FlareSolverr** — scraping anti-bot (Cloudflare bypass)
- **Gluetun** — VPN proxy HTTP (PIA OpenVPN) pour Amazon et scraping résistant au blocage

Au démarrage, l'API :
1. Se connecte à PostgreSQL
2. **Auto-migration** : crée les tables `discovery_cache`, `products`, `kreo_products` si absentes
3. **Auto-seed** : peuple les tables MEGA (199 produits), KRE-O (417 produits) et Carddass (7 tables) à partir des SQL embarqués
4. **Migrations externes** : tables DBS Card Game (dbs_sets, dbs_cards) + colonne source_site Carddass
5. Démarre le serveur HTTP

```bash
# Clone le repository
git clone https://github.com/Nimai26/Tako_Api.git
cd Tako_Api

# Créer .env avec les clés API
cp .env.example .env
nano .env

# Démarrer tous les services
docker compose up -d

# Vérifier les logs (auto-migration + auto-seed visibles)
docker compose logs -f tako-api

# Vérifier la santé
curl http://localhost:3000/health
```

---

## ⚙️ Configuration

### Variables d'environnement essentielles

```env
# Serveur
PORT=3000
NODE_ENV=production

# Base PostgreSQL interne (cache + données MEGA/KRE-O)
DB_HOST=tako-db
DB_PORT=5432
DB_NAME=tako_cache
DB_USER=tako
DB_PASSWORD=your_secure_password
DB_ENABLED=true

# Stockage fichiers (images, PDFs - optionnel)
STORAGE_PATH=/data/tako-storage
FILE_BASE_URL=https://your-domain.com/files

# Scraping
FSR_URL=http://flaresolverr:8191/v1

# VPN Proxy (Amazon et scraping anti-blocage)
VPN_PROXY_URL=http://gluetun:8888
GLUETUN_CONTROL_URL=http://gluetun:8000

# APIs (optionnelles mais recommandées)
BRICKSET_API_KEY=your_key
REBRICKABLE_API_KEY=your_key
TMDB_API_KEY=your_key
TVDB_API_KEY=your_key
IGDB_CLIENT_ID=your_twitch_client_id
IGDB_CLIENT_SECRET=your_twitch_client_secret
COMICVINE_API_KEY=your_key
DISCOGS_TOKEN=your_key
RAWG_API_KEY=your_key
BGG_API_TOKEN=your_key
```

### Clés API requises par domaine

| Domaine | Provider | Clé requise | Lien |
|---------|----------|-------------|------|
| Construction Toys | Brickset | `BRICKSET_API_KEY` | https://brickset.com/tools/webservices/requestkey |
| Construction Toys | Rebrickable | `REBRICKABLE_API_KEY` | https://rebrickable.com/api/ |
| Comics | ComicVine | `COMICVINE_API_KEY` | https://comicvine.gamespot.com/api/ |
| Media | TMDB | `TMDB_API_KEY` | https://www.themoviedb.org/settings/api |
| Media | TVDB | `TVDB_API_KEY` | https://thetvdb.com/dashboard/account/apikeys |
| Videogames | IGDB | `IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET` | https://api-docs.igdb.com/ (Twitch) |
| Videogames | RAWG | `RAWG_API_KEY` | https://rawg.io/apidocs |
| BoardGames | BGG | `BGG_API_TOKEN` | https://boardgamegeek.com/wiki/page/BGG_XML_API2 |
| Music | Discogs | `DISCOGS_TOKEN` | https://www.discogs.com/settings/developers |

---

## 📚 Documentation API

Une fois démarré, accédez à :
- **Documentation complète** : `/docs` (liste des specs OpenAPI)
- **Routes détaillées** : Voir [docs/API_ROUTES.md](docs/API_ROUTES.md)
- **Health check** : `/health`
- **Version** : `/version`

### Endpoints principaux

```bash
# Health check global
curl http://localhost:3000/health

# Info domaine construction-toys
curl http://localhost:3000/construction-toys

# Recherche LEGO
curl "http://localhost:3000/construction-toys/lego/search?q=75192"

# Détails produit Brickset
curl "http://localhost:3000/construction-toys/brickset/set/75192-1"

# Recherche carte Pokémon
curl "http://localhost:3000/api/tcg/pokemon/search?q=charizard"

# Recherche Amazon
curl "http://localhost:3000/api/ecommerce/amazon/search?q=lego&country=fr"
```

---

## 🔧 Maintenance

### Logs

```bash
# Logs en temps réel
docker compose logs -f tako-api

# Logs FlareSolverr (important pour debugging)
docker compose logs -f flaresolverr

# Logs PostgreSQL
docker compose logs -f postgres
```

### Redémarrage

```bash
# Redémarrage complet
docker compose restart

# Redémarrage Tako API uniquement
docker compose restart tako-api

# Rebuild après modification code
docker compose up -d --build tako-api
```

### Health Checks

```bash
# Health global API
curl http://localhost:3000/health

# Health par domaine
curl http://localhost:3000/api/ecommerce/health
curl http://localhost:3000/api/tcg/health

# Health FlareSolverr (critique)
curl http://localhost:8191/health
```

### Monitoring FlareSolverr

⚠️ **IMPORTANT** : FlareSolverr peut saturer la mémoire si mal géré.

```bash
# Vérifier les sessions actives
docker exec flaresolverr curl -s http://localhost:8191/v1/sessions

# Vérifier la RAM utilisée
docker stats flaresolverr

# Redémarrer si trop de sessions (> 3)
docker compose restart flaresolverr
```

**Configuration recommandée dans `docker-compose.yaml`** :
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

---

## 🆕 Mises à jour

### Pull dernière version

```bash
# Arrêter les services
docker compose down

# Pull dernière image
docker pull nimai24/tako-api:latest

# Redémarrer (auto-migration + auto-seed appliqués automatiquement)
docker compose up -d

# Vérifier version
curl http://localhost:3000/version
```

### Mise à jour des données seeds

Les données embarquées (MEGA, KRE-O) sont versionnées dans l'image Docker.
Lors d'un `docker pull` + restart, si les fichiers seeds ont changé (checksum SHA-256 différent),
les nouvelles données sont **automatiquement appliquées** via UPSERT (pas de perte de données).

### Build depuis sources

```bash
# Clone repository
git clone https://github.com/Nimai26/Tako_Api.git
cd Tako_Api

# Pull dernières modifications
git pull origin main

# Rebuild image locale
docker compose build tako-api

# Redémarrer
docker compose up -d
```

---

## 📊 Statistiques Projet

### Migration toys_api → Tako_Api

- ✅ **11 domaines** migrés (100%)
- ✅ **36 providers** fonctionnels (100%)
- ✅ **Auto-migration** des tables au démarrage
- ✅ **Auto-seed** des données (MEGA + KRE-O + Carddass) au démarrage
- ✅ **Migrations externes** : DBS Card Game tables + multi-sources Carddass
- ✅ **Stockage fichiers** en clair (plus de MinIO)

### Domaines & Providers

| Domaine | Providers | Status |
|---------|-----------|--------|
| Construction Toys | 7 providers | ✅ Complet |
| Books | 2 providers | ✅ Complet |
| Comics | 2 providers | ✅ Complet |
| Anime-Manga | 2 providers | ✅ Complet |
| Media | 2 providers | ✅ Complet |
| Videogames | 4 providers | ✅ Complet |
| BoardGames | 1 provider | ✅ Complet |
| Collectibles | 4 providers | ✅ Complet |
| TCG | 7 providers | ✅ Complet |
| Music | 4 providers | ✅ Complet |
| E-commerce | 1 provider (8 marketplaces) | ✅ Complet |

---

## 🐛 Troubleshooting

### API ne démarre pas

```bash
# Vérifier logs
docker compose logs tako-api

# Vérifier configuration
docker compose config

# Vérifier .env
cat .env
```

### FlareSolverr timeout

```bash
# Augmenter timeout dans .env
FSR_TIMEOUT=60000

# Redémarrer FlareSolverr
docker compose restart flaresolverr
```

### Amazon retourne 0 résultats

Amazon bloque les requêtes sans VPN. Le service Gluetun fournit un proxy HTTP via PIA VPN :

```bash
# Vérifier que Gluetun est connecté
docker logs tako_gluetun --tail 5

# Vérifier l'IP VPN
curl --proxy http://localhost:8889 https://httpbin.org/ip

# Vérifier que l'API utilise le proxy
docker exec tako_api env | grep VPN_PROXY_URL

# Redémarrer Gluetun si déconnecté
docker compose restart gluetun
```

La première requête Amazon déclenche un challenge AWS WAF que FlareSolverr résout automatiquement via warm-up session (5s). Les requêtes suivantes passent instantanément grâce aux cookies de session.

### Erreur PostgreSQL

```bash
# Vérifier connexion
docker compose exec postgres psql -U tako -d tako_cache -c "SELECT 1"

# Reset cache (DANGER: perte données)
docker compose down -v
docker compose up -d
```

### Rate limit API externe

Certaines APIs ont des limites strictes :
- ComicVine : 200 req/15min
- TMDB : 40 req/10s
- IGDB : 4 req/s

Solution : Activer cache PostgreSQL (`DB_ENABLED=true`)

---

## 📞 Support

- **Issues GitHub** : https://github.com/Nimai26/Tako_Api/issues
- **Documentation** : https://github.com/Nimai26/Tako_Api/tree/main/docs
- **Pull Requests** : Contributions bienvenues !

---

## 📜 License

Voir fichier LICENSE dans le repository.

---

**Déployé avec ❤️ — version 2.6.1 (6 mars 2026)**
