# Architecture Decision Records (ADR)

Ce document trace les décisions d'architecture importantes pour Tako API.

---

## ADR-001: Architecture par domaines métier

**Date**: 2026-01-28  
**Statut**: Accepté

### Contexte

L'ancienne API `toys_api` avait une structure plate :
- `routes/` avec 28 fichiers
- `lib/providers/` avec 30+ fichiers
- `lib/normalizers/` avec 15 fichiers

Problèmes identifiés :
- Difficile de comprendre les dépendances
- Modification d'un provider risque de casser d'autres parties
- Tests difficiles à organiser

### Décision

Organiser le code par **domaine métier** :

```
src/domains/
├── construction-toys/   # LEGO, Playmobil, Mega, Rebrickable
├── books/               # Google Books, OpenLibrary
├── games/               # RAWG, IGDB, JVC
└── ...
```

Chaque domaine contient :
- `providers/` - Appels aux APIs externes
- `normalizers/` - Transformation des données
- `routes.js` - Endpoints HTTP
- `index.js` - Point d'entrée

### Conséquences

✅ **Avantages** :
- Un domaine = une unité autonome
- Facile à maintenir et tester
- Onboarding simplifié

❌ **Inconvénients** :
- Plus de fichiers à naviguer
- Risque de duplication si mal géré

---

## ADR-002: Classes de base pour providers et normalizers

**Date**: 2026-01-28  
**Statut**: Accepté

### Contexte

Dans `toys_api`, chaque provider avait sa propre implémentation :
- Duplication du code de retry, logging, cache
- Formats de retour inconsistants
- Difficile de garantir les contrats

### Décision

Créer des classes abstraites :

```javascript
// BaseProvider.js
export class BaseProvider {
  async search(query, options) { /* à implémenter */ }
  async getDetails(id, options) { /* à implémenter */ }
  
  // Méthodes communes fournies
  async fetchWithRetry(url, options) { ... }
  log(level, message, meta) { ... }
}
```

### Conséquences

✅ **Avantages** :
- Comportement uniforme (retry, timeout, logging)
- Contrat explicite pour chaque provider
- Facilite les tests (mock de la classe de base)

❌ **Inconvénients** :
- Courbe d'apprentissage pour les contributeurs
- Overhead pour les providers très simples

---

## ADR-003: Validation avec Zod

**Date**: 2026-01-28  
**Statut**: Accepté

### Contexte

`toys_api` n'avait pas de validation systématique :
- Paramètres de requête non validés
- Réponses des providers non typées
- Erreurs difficiles à debugger

### Décision

Utiliser **Zod** pour :
1. Valider les query params (`validateQuery` middleware)
2. Typer les réponses des providers
3. Documenter les schémas de données

```javascript
import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string().min(1),
  lang: z.string().length(2).default('fr'),
  max: z.coerce.number().min(1).max(100).default(20)
});
```

### Conséquences

✅ **Avantages** :
- Erreurs explicites en développement
- Documentation intégrée (inférence TypeScript)
- Parsing automatique des types

❌ **Inconvénients** :
- Dépendance supplémentaire
- Peut être verbeux pour des schémas complexes

---

## ADR-004: Séparation app.js / server.js

**Date**: 2026-01-28  
**Statut**: Accepté

### Contexte

`toys_api` avait tout dans `index.js` (600 lignes) :
- Configuration Express
- Import de tous les routers
- Démarrage du serveur
- Graceful shutdown

### Décision

Séparer en deux fichiers :

- **app.js** : Configure Express (middlewares, montage routes)
- **server.js** : Démarre le serveur, gère le lifecycle

### Conséquences

✅ **Avantages** :
- `app` exportable pour les tests (supertest)
- Séparation des responsabilités
- Plus facile à lire

❌ **Inconvénients** :
- Un fichier de plus

---

## ADR-005: Configuration typée et centralisée

**Date**: 2026-01-28  
**Statut**: Accepté

### Contexte

Dans `toys_api` :
- `lib/config.js` contenait 386 lignes
- Variables d'environnement lues partout dans le code
- Pas de validation des variables requises

### Décision

Structurer la configuration en modules :

```
src/config/
├── index.js    # Export centralisé
├── env.js      # Variables d'environnement (validées)
├── sources.js  # Configuration des providers
└── cache.js    # Configuration du cache
```

Accès unique via `config` :

```javascript
import { config } from './config/index.js';
config.env.port
config.sources.lego.baseUrl
config.cache.ttl
```

### Conséquences

✅ **Avantages** :
- Un seul point d'entrée
- Validation au démarrage
- Autocomplétion IDE

❌ **Inconvénients** :
- Import obligatoire depuis `config/`

---

## ADR-006: Format B — Noyau commun + objet `details`

**Date**: 2026-03  
**Statut**: Accepté — DÉFINITIF et NON NÉGOCIABLE

### Contexte

La migration v2.0.0 a produit un format plat (`...base, ...details`) contraire à la spécification.
La v2.0.1 a déclaré "100% conforme" alors que seul le wrapper externe avait été ajouté.
Résultat en v2.6.0 : **6 formats distincts coexistaient**, chaque domaine ayant son propre vocabulaire.

### Décision

**Format B** : Chaque item retourné par l'API possède exactement 11 clés au premier niveau :

```json
{
  "id": "source:sourceId",
  "type": "string",
  "source": "string",
  "sourceId": "string",
  "title": "string",
  "titleOriginal": "string | null",
  "description": "string | null",
  "year": "number | null",
  "images": { "primary": "url?", "thumbnail": "url?", "gallery": [] },
  "urls": { "source": "url?", "detail": "string" },
  "details": { /* variable selon type/provider */ }
}
```

**Pagination** : Uniquement `{page, limit, hasMore}`. Pas de `totalResults`, `totalPages`, `offset`, `pageSize`.

### Conséquences

- Les 37 providers × 12 domaines ont été migrés (audits v10-v13, commit `64ead00`)
- `coreItemSchema` + `createItemSchema(detailsSchema)` sont la source de vérité Zod
- Voir [RESPONSE-FORMAT.md](./RESPONSE-FORMAT.md) pour la spécification complète
- Voir l'Annexe A du [DEVELOPER_GUIDE](./DEVELOPER_GUIDE_TAKO_API.md) pour les champs `details` par provider

---

## ADR-007: Uniformisation du champ `set` dans les normalizers TCG

**Date**: 2026-03-13  
**Statut**: Accepté

### Contexte

Les 7 normalizers TCG (Pokemon, MTG, Yu-Gi-Oh, DBS, Digimon, Lorcana, One Piece) produisaient des formats de `set` incohérents :
- Pokemon : `{id, name, series, printedTotal, releaseDate, logo, symbol}` (7 champs)
- MTG : `{id, code, name, type, iconSvg}` (5 champs)
- Yu-Gi-Oh : pas de `set`, seulement un tableau `cardSets`
- DBS : un simple string `setCode`
- Digimon : un simple string `set`
- Lorcana : `setInfo: {code, name, number, collectorNumber, total}` (nom différent)
- One Piece : `{id, name, releaseDate}` (3 champs)

De plus, les 6 normalizers utilisant `translateText` ne déclenchaient jamais la traduction (argument `{ enabled: true }` manquant).

### Décision

1. **Champ `set` uniforme** conforme au schéma Zod `tcgCardDetailsSchema` :
   ```json
   { "name": "string", "code": "string|null", "series": "string|null", "releaseDate": "string|null" }
   ```
2. **Pas de perte de données** : les champs spécifiques aux providers (logo, symbol, printedTotal, setId, setType, iconSvg, collectorNumber, setSourceId) sont conservés comme champs plats dans `details` (préfixés `set*`).
3. **`translateText` corrigé** : tous les appels passent `{ enabled: true, sourceLang: 'en' }` en 3e argument.

### Conséquences

- Les 7 normalizers TCG produisent désormais un `set` identique en structure
- Les clients peuvent parser `details.set.name`, `.code`, `.series`, `.releaseDate` de manière uniforme quel que soit le provider
- Les données extra sont accessibles via `details.setLogo`, `details.setId`, etc.
- La traduction fonctionne effectivement sur les champs `description` / `flavorText` des cartes TCG

---

## ADR-008: Migration Pokémon TCG de pokemontcg.io vers TCGdex

**Date**: 2026-03-13  
**Statut**: Accepté

### Contexte

L'API `pokemontcg.io` utilisée comme source du provider Pokémon TCG a été arrêtée et migrée vers **Scrydex**, un service payant ($29+/mois). L'API ne répond plus : la connexion TCP et le handshake TLS réussissent, mais le backend ne traite plus les requêtes HTTP (RST_STREAM).

### Alternatives évaluées

| Option | Coût | Multi-langue | Mêmes IDs | Verdict |
|--------|------|-------------|-----------|---------|
| Scrydex | $29+/mois | ❌ | ❓ | Rejeté (payant, pas de FR natif) |
| TCGdex | Gratuit | ✅ (FR, EN, DE, ES, IT, PT) | ✅ (`base1-58` = même format) | **Retenu** |

### Décision

Migrer vers **TCGdex** (`api.tcgdex.net`) :
- API REST gratuite, sans clé API, sans rate limit
- Support multi-langues natif (6 langues, dont FR)
- Mêmes IDs de cartes que pokemontcg.io → migration transparente pour les clients
- Prix TCGPlayer + Cardmarket inclus
- Pagination côté client (l'API renvoie tous les résultats, le provider pagine en mémoire)

### Fichiers modifiés

- `src/domains/tcg/providers/pokemon.provider.js` — Réécriture complète (pokemontcg.io → TCGdex)
- `src/domains/tcg/normalizers/pokemon.normalizer.js` — Adapté aux champs TCGdex + ajout `normalizeSetDetails()`
- `src/domains/tcg/routes/pokemon.routes.js` — Ajout route `/sets/:id`, passage `lang` au provider

### Conséquences

✅ **Avantages** :
- Plus de dépendance à une clé API payante
- Données nativement en français (pas besoin de `translateText` pour la plupart des usages)
- Route `/sets/:id` ajoutée (liste complète des cartes d'un set)
- Mêmes IDs de cartes → aucun breaking change côté client

❌ **Inconvénients** :
- Filtres localisés : `type=Fire` ne fonctionne qu'en `lang=en`, il faut `type=Feu` en `lang=fr`
- `series` et `releaseDate` non disponibles dans le détail de carte (uniquement dans le détail de set)
- Pas de liens directs vers TCGPlayer/Cardmarket (le champ `externalLinks` est null)
- `evolvesTo` non fourni par TCGdex (toujours tableau vide)
- Images absentes pour certaines langues (cartes non imprimées physiquement) → résolu par fallback EN (ADR-009)

---

## ADR-009: Fallback images EN pour TCGdex + Correction données Lorcana

**Date**: 2026-03-13  
**Statut**: Accepté

### Contexte — Pokémon TCG (images)

TCGdex ne fournit le champ `image` que pour les langues où la carte a été physiquement imprimée. En recherche FR "pikachu", seulement 124/176 cartes (70%) avaient une image. Beaucoup de promos et cartes anciennes n'existent qu'en anglais.

### Décision

Fallback automatique vers les images EN quand l'image locale est absente :
- **Recherche** : appel EN en parallèle + injection par correspondance d'ID de carte
- **Détail** : second appel EN si le champ `image` est absent dans la réponse localisée
- Résultat : 153/176 (87%) images en FR, les 23 restants n'ont d'image dans aucune langue

### Contexte — Lorcana (données manquantes)

Le normalizer Lorcana utilisait des noms de champs incorrects par rapport à la structure LorcanaJSON :
- `artist` au lieu de `artistsText` → artiste toujours `null`
- `classifications` au lieu de `subtypes` → sous-types perdus
- `collectorNumber` au lieu de `number` → numéro de carte `null`
- `setName`/`setReleaseDate` non enrichis → les cartes n'avaient pas le nom de leur set

De plus, le provider ne croisait pas les cartes avec les métadonnées des sets disponibles dans `data.sets`.

### Décision

- Provider enrichit chaque carte avec `_set` depuis `data.sets` avant normalisation
- Normalizer corrigé pour utiliser les vrais noms de champs LorcanaJSON
- Ajout des champs manquants : `story`, `foilTypes`, `legalities`, vrais `externalLinks` (tcgplayer, cardmarket, cardTrader)
- Conversion des sets de l'objet `{code: setData}` vers un tableau pour `normalizeSets()`

### Fichiers modifiés

- `src/domains/tcg/providers/pokemon.provider.js` — Fallback EN images (search + detail)
- `src/domains/tcg/normalizers/pokemon.normalizer.js` — Ajout `urls.source` (TCGdex API URL)
- `src/domains/tcg/providers/lorcana.provider.js` — Enrichissement `_set`, conversion sets
- `src/domains/tcg/normalizers/lorcana.normalizer.js` — Correction noms de champs, ajout données manquantes

---

## ADR-010: Correction images et données One Piece TCG

**Date**: 2026-03-13  
**Statut**: Accepté

### Contexte

Le normalizer One Piece TCG avait plusieurs bugs de mapping des données brutes de `onepiece-cardgame.dev/cards.json` :

1. **Images cassées** — Le normalizer construisait `https://onepiece-cardgame.dev/images/cards/{cid}.png`, une URL fictive. Le site étant un SPA React, cette URL retourne le HTML de l'application (2 KB, `text/html`) au lieu d'une image. L'API source fournit la vraie URL dans le champ `iu` (ex: `ST01-001_85f00c_jp.jpg`, ~600 KB, `image/jpeg`).

2. **Champs inexistants** — Le normalizer lisait :
   - `rawCard.co` pour counter → le vrai champ est `cp`
   - `rawCard.lf` pour life → le vrai champ est `l`
   - `rawCard.set_info` (enrichi via `srcId`) → `srcId` n'existe pas dans les données brutes

3. **Données disponibles ignorées** — Les champs `srcN` (nom du set) et `srcD` (date de sortie) sont directement présents sur chaque carte brute mais n'étaient pas utilisés.

4. **Mauvaise sémantique** — Le champ `tr` contient les affiliations/traits du personnage (ex: "Supernovas/Straw Hat Crew"), pas un effet trigger. Il était nommé `triggerEffect` dans le détail.

### Décision

- Utiliser `rawCard.iu` pour les images (URL réelle avec hash)
- Corriger les noms de champs : `cp` (counter), `l` (life)
- Utiliser `srcN`/`srcD` directement pour set name/releaseDate
- Renommer `trigger`/`triggerEffect` en `traits`
- Ajouter `urls.source` en recherche (était `null`)

### Fichiers modifiés

- `src/domains/tcg/normalizers/onepiece.normalizer.js` — Toutes les corrections ci-dessus

---

## ADR-011: Proxy image One Piece via FlareSolverr

**Date**: 2026-03-13  
**Statut**: Accepté

### Contexte

Les images des cartes One Piece (`onepiece-cardgame.dev/images/cards/*.jpg`) sont protégées par Cloudflare JS Challenge. Les requêtes directes (fetch backend ou navigateur) reçoivent une réponse 403.

Tako utilise déjà FlareSolverr pour accéder à `cards.json` (données des cartes). La session FlareSolverr obtient des cookies Cloudflare valides après résolution du challenge.

### Décision

Ajouter un endpoint proxy image `GET /api/tcg/onepiece/image/:cardId` qui :
1. Récupère l'URL réelle de l'image (`iu`) depuis les données de la carte
2. Utilise `ensureSession()` pour obtenir des cookies CF valides
3. Fetch l'image directement avec les cookies (pas via FlareSolverr, qui retourne du HTML)
4. Valide que la réponse est une vraie image (pas une page challenge)
5. Cache en mémoire (1h TTL, max 200 entrées, LRU eviction)
6. Retourne le binaire avec le bon `Content-Type`

Le normalizer pointe désormais `images.primary`/`thumbnail` vers `/api/tcg/onepiece/image/{cardId}` (chemin relatif) au lieu de l'URL directe Cloudflare.

### Conséquences

- Les applications tierces accèdent aux images sans blocage Cloudflare
- La bande passante Tako augmente (proxy des images) mais est atténuée par le cache mémoire + `Cache-Control: public, max-age=3600`
- Pas de dépendance externe supplémentaire (réutilise FlareSolverr déjà présent)

### Fichiers modifiés

- `src/domains/tcg/providers/onepiece.provider.js` — `fetchOnePieceImage()`, `getCardImageUrl()`
- `src/domains/tcg/routes/onepiece.routes.js` — Route `GET /image/:cardId`
- `src/domains/tcg/normalizers/onepiece.normalizer.js` — URLs images → proxy
