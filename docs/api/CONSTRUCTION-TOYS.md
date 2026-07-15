# API Reference - Construction Toys

Documentation complète des routes du domaine `construction-toys`.

## Vue d'ensemble

| Provider | Description | Auth | Rate Limit |
|----------|-------------|------|------------|
| **LEGO** | Site officiel LEGO.com | Aucune | ~18s/requête |
| **Rebrickable** | Base communautaire | API Key | 1 req/s |
| **Brickset** | Données officielles | API Key | Non spécifié |

## Base URL

```
http://localhost:3000/construction-toys
```

---

## Provider LEGO

Site officiel LEGO.com via FlareSolverr (bypass Cloudflare).

### `GET /lego/health`

Vérifie la disponibilité de FlareSolverr.

**Réponse:**
```json
{
  "healthy": true,
  "latency": 4,
  "message": "FlareSolverr disponible",
  "provider": "lego"
}
```

### `GET /lego/search`

Recherche de produits LEGO.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `q` | string | **requis** | Terme de recherche |
| `page` | number | 1 | Page de résultats |
| `pageSize` | number | 24 | Résultats par page (max 100) |
| `locale` | string | fr-FR | Locale |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/lego/search?q=millennium%20falcon"
```

**Temps de réponse:** ~9 secondes

### `GET /lego/:id`

Détails complets d'un produit LEGO.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `id` | string | **requis** | ID du produit (ex: 75192) |
| `locale` | string | fr-FR | Locale |
| `includeInstructions` | boolean | true | Inclure les manuels |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/lego/75192"
```

**Temps de réponse:** ~14-18 secondes

**Réponse (résumée):**
```json
{
  "success": true,
  "provider": "lego",
  "data": {
    "sourceId": "75192",
    "name": "Millennium Falcon™",
    "theme": "Star Wars™",
    "price": { "amount": 849.99, "currency": "EUR" },
    "pieces": 7541,
    "ageRange": { "min": 18 },
    "images": [...],
    "videos": [
      {
        "url": "https://www.lego.com/cdn/cs/set/assets/blt.../75192_v2.mp4",
        "proxyUrl": "/api/construction-toys/lego/proxy/video?url=...",
        "filename": "75192_v2.mp4"
      }
    ],
    "instructions": [...]
  }
}
```

### `GET /lego/proxy/video`

Proxy pour télécharger les vidéos depuis le CDN LEGO.  
Contourne le rate-limiting (429) en ajoutant les headers navigateur appropriés.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `url` | string | **requis** | URL CDN LEGO de la vidéo (encodée) |

**Sécurité:** Seules les URLs `https://www.lego.com/cdn/cs/set/assets/blt.../*.mp4` sont autorisées (whitelist regex anti-SSRF).

**Exemple:**
```bash
curl -o video.mp4 "http://localhost:3000/construction-toys/lego/proxy/video?url=https%3A%2F%2Fwww.lego.com%2Fcdn%2Fcs%2Fset%2Fassets%2Fblt2765cc6c1533654d%2F75192_v2.mp4"
```

**Réponse:** Stream binaire `video/mp4` avec `Content-Disposition: attachment`.

---

### `GET /lego/instructions/:id`

Manuels d'instructions pour un set LEGO.

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/lego/instructions/75192"
```

**Temps de réponse:** ~3 secondes

**Réponse:**
```json
{
  "success": true,
  "provider": "lego",
  "id": "75192",
  "name": "Millennium Falcon",
  "manuals": [
    {
      "id": "6564020",
      "description": "BI 3103, 648+4/65+200...",
      "pdfUrl": "https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6564020.pdf",
      "sequence": 1
    }
  ],
  "url": "https://www.lego.com/fr-fr/service/building-instructions/75192"
}
```

---

## Provider Rebrickable

Base de données LEGO communautaire.

**Authentification:** Requiert `REBRICKABLE_API_KEY` dans `.env`

### `GET /rebrickable/health`

Vérifie la disponibilité de l'API Rebrickable.

### `GET /rebrickable/search`

Recherche de sets LEGO.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `q` | string | - | Terme de recherche |
| `page` | number | 1 | Page |
| `pageSize` | number | 100 | Résultats par page (max 1000) |
| `themeId` | number | - | ID du thème |
| `minYear` | number | - | Année minimale |
| `maxYear` | number | - | Année maximale |
| `minParts` | number | - | Pièces minimum |
| `maxParts` | number | - | Pièces maximum |
| `ordering` | string | -year | Tri: year, -year, name, -name, num_parts |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/search?q=star%20wars&minYear=2020"
```

### `GET /rebrickable/sets/:id`

Détails d'un set.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `id` | string | **requis** | Numéro du set (75192 ou 75192-1) |
| `includeParts` | boolean | false | Inclure les pièces |
| `includeMinifigs` | boolean | false | Inclure les minifigs |
| `maxParts` | number | 500 | Limite de pièces |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/sets/75192-1?includeParts=true&includeMinifigs=true"
```

### `GET /rebrickable/sets/:id/parts`

Pièces d'un set.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `id` | string | **requis** | Numéro du set |
| `page` | number | 1 | Page |
| `pageSize` | number | 500 | Pièces par page (max 1000) |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/sets/75192-1/parts"
```

### `GET /rebrickable/sets/:id/minifigs`

Minifigures d'un set.

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/sets/75192-1/minifigs"
```

### `GET /rebrickable/themes`

Liste des thèmes LEGO.

**Paramètres:**

| Param | Type | Description |
|-------|------|-------------|
| `parentId` | number | Filtrer par thème parent |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/themes"
```

### `GET /rebrickable/colors`

Liste des couleurs LEGO.

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/colors"
```

### `GET /rebrickable/parts`

Recherche de pièces LEGO.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `q` | string | **requis** | Terme de recherche |
| `page` | number | 1 | Page |
| `pageSize` | number | 100 | Résultats par page |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/parts?q=brick%202x4"
```

### `GET /rebrickable/minifigs`

Recherche de minifigures.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `q` | string | **requis** | Terme de recherche |
| `page` | number | 1 | Page |
| `pageSize` | number | 100 | Résultats par page |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/rebrickable/minifigs?q=luke%20skywalker"
```

---

## Provider Brickset

Données LEGO officielles via API Brickset.

**Authentification:** Requiert `BRICKSET_API_KEY` dans `.env`

### `GET /brickset/health`

Vérifie la disponibilité de l'API Brickset.

### `GET /brickset/search`

Recherche de sets LEGO.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `q` | string | - | Terme de recherche |
| `page` | number | 1 | Page |
| `pageSize` | number | 20 | Résultats par page (max 500) |
| `theme` | string | - | Nom du thème |
| `year` | number | - | Année |
| `orderBy` | string | Name | Tri: Name, Number, Year, Pieces, Rating |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/brickset/search?q=millennium&theme=Star%20Wars&year=2024"
```

### `GET /brickset/sets/:id`

Détails d'un set.

**Paramètres:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | string | ID Brickset ou numéro de set |
| `lang` | string | Langue (défaut: en) |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/brickset/sets/75192"
```

### `GET /brickset/themes`

Liste des thèmes.

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/brickset/themes"
```

### `GET /brickset/themes/:theme/subthemes`

Sous-thèmes d'un thème.

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/brickset/themes/Star%20Wars/subthemes"
```

### `GET /brickset/years`

Années disponibles.

**Paramètres:**

| Param | Type | Description |
|-------|------|-------------|
| `theme` | string | Filtrer par thème (optionnel) |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/brickset/years?theme=Star%20Wars"
```

### `GET /brickset/recently-updated`

Sets récemment mis à jour.

**Paramètres:**

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `minutesAgo` | number | 10080 | Minutes depuis la mise à jour (défaut: 7 jours) |

**Exemple:**
```bash
curl "http://localhost:3000/construction-toys/brickset/recently-updated?minutesAgo=1440"
```

---

## Codes d'erreur

| Code | Description |
|------|-------------|
| 200 | Succès |
| 400 | Paramètre invalide ou manquant |
| 404 | Ressource non trouvée |
| 503 | Provider indisponible |

## Configuration requise

Variables d'environnement dans `.env`:

```env
# Rebrickable (obligatoire pour /rebrickable/*)
REBRICKABLE_API_KEY=your_key_here

# Brickset (obligatoire pour /brickset/*)
BRICKSET_API_KEY=your_key_here

# FlareSolverr (obligatoire pour /lego/*)
FLARESOLVERR_URL=http://localhost:8191
```

## Obtenir les clés API

- **Rebrickable**: https://rebrickable.com/api/
- **Brickset**: https://brickset.com/tools/webservices/requestkey
