# API Design Guidelines

Ce document définit les conventions de design de l'API Tako.

## 🔗 Structure des URLs

### Hiérarchie

```
/{domain}/{provider}/{action}
```

Exemples :
- `/construction-toys/lego/search`
- `/media/tmdb/details`
- `/tcg/pokemon/sets`

### Endpoints standard

Chaque provider expose au minimum :

| Endpoint | Description |
|----------|-------------|
| `GET /search` | Recherche avec paramètre `q` |
| `GET /details` | Détails via `detailUrl` |

Endpoints optionnels selon le provider :
- `GET /sets` - Liste des sets/collections
- `GET /categories` - Liste des catégories
- `GET /:id` - Accès direct par ID (legacy)

## 📥 Paramètres de requête

### Paramètres communs

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `q` | string | - | Terme de recherche (requis pour `/search`) |
| `lang` | string | `fr` | Code langue (2 lettres) |
| `locale` | string | `fr-FR` | Locale complète |
| `max` | number | `20` | Nombre max de résultats (1-100) |
| `autoTrad` | boolean | `false` | Activer la traduction automatique |
| `refresh` | boolean | `false` | Ignorer le cache |

### Paramètres de détails

| Paramètre | Type | Description |
|-----------|------|-------------|
| `detailUrl` | string | URL fournie par `/search` |
| `id` | string | ID direct (legacy) |

## 📤 Format des réponses

### Réponse de recherche

```json
{
  "success": true,
  "provider": "lego",
  "domain": "construction-toys",
  "query": "star wars",
  "total": 150,
  "count": 20,
  "data": [
    {
      "type": "construct_toy",
      "source": "lego",
      "sourceId": "75375",
      "name": "Millennium Falcon",
      "name_original": "Millennium Falcon",
      "description": "Vaisseau légendaire...",
      "year": 2024,
      "image": "https://...",
      "src_url": "https://lego.com/...",
      "detailUrl": "/construction-toys/lego/details?id=75375"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalPages": 8,
    "hasMore": true
  },
  "meta": {
    "fetchedAt": "2026-01-28T12:00:00Z",
    "lang": "fr",
    "locale": "fr-FR",
    "cached": true,
    "cacheAge": 120
  }
}
```

### Réponse de détails

```json
{
  "success": true,
  "provider": "lego",
  "domain": "construction-toys",
  "id": "75375",
  "data": {
    "type": "construct_toy",
    "source": "lego",
    "sourceId": "75375",
    "name": "Millennium Falcon",
    "description": "...",
    "brand": "LEGO",
    "theme": "Star Wars",
    "specs": {
      "pieceCount": 1351,
      "minAge": 12,
      "dimensions": { ... }
    },
    "price": {
      "amount": 169.99,
      "currency": "EUR"
    },
    "images": {
      "thumbnail": "...",
      "cover": "...",
      "gallery": [...]
    },
    "urls": {
      "official": "https://lego.com/..."
    }
  },
  "meta": {
    "fetchedAt": "2026-01-28T12:00:00Z",
    "lang": "fr"
  }
}
```

### Réponse d'erreur

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "Invalid request parameters",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "q",
      "message": "Required"
    }
  ]
}
```

## 🏷️ Types de contenu

Chaque élément retourné a un `type` qui indique sa nature :

| Type | Domaine | Description |
|------|---------|-------------|
| `construct_toy` | construction-toys | Jouet de construction |
| `book` | books | Livre |
| `videogame` | games | Jeu vidéo |
| `movie` | media | Film |
| `series` | media | Série TV |
| `anime` | anime-manga | Anime |
| `manga` | anime-manga | Manga |
| `comic` | comics | Comic/BD |
| `card` | tcg | Carte à collectionner |
| `collectible` | collectibles | Objet de collection |
| `album` | music | Album musical |
| `board_game` | board-games | Jeu de société |

## 🔒 Headers

### Headers de requête

| Header | Description |
|--------|-------------|
| `Accept-Language` | Langue préférée |
| `Content-Type` | `application/json` pour POST |

### Headers de réponse

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Identifiant unique de la requête |
| `X-Cache` | `HIT` ou `MISS` |
| `X-Cache-Age` | Âge du cache en secondes |
| `Cache-Control` | Directives de cache |

## ⚡ Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 400 | Paramètres invalides |
| 404 | Ressource non trouvée |
| 429 | Rate limit dépassé |
| 502 | Erreur du provider externe |
| 504 | Timeout du provider |
| 500 | Erreur serveur interne |

## 📊 Pagination

La pagination utilise le format suivant :

```json
{
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalResults": 150,
    "totalPages": 8,
    "hasMore": true
  }
}
```

Pour paginer, utiliser le paramètre `page` :
```
GET /construction-toys/lego/search?q=star%20wars&page=2
```

## 🌐 Internationalisation

- Le paramètre `lang` accepte les codes ISO 639-1 (2 lettres)
- Le paramètre `locale` accepte les formats `xx-XX`
- Si `autoTrad=true`, les textes sont traduits automatiquement via google-translate-api-x (intégré)
