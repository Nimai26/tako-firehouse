# Guide d'Utilisation - Traduction Française avec Tako API

**Date** : 25 février 2026  
**Version Tako API** : 1.0.11+

---

## 🌍 Problème

Par défaut, les données des providers externes (RAWG, IGDB, etc.) sont en **anglais**.  
Sans spécifier les paramètres de traduction, l'application externe reçoit les descriptions et genres en anglais.

---

## ✅ Solution : Utiliser les Paramètres de Traduction

### Paramètres Query Requis

Pour recevoir les données en français, ajoutez ces paramètres à vos requêtes :

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `autoTrad` | `true`, `1`, `"true"`, `"1"` | Active la traduction automatique |
| `lang` | `fr`, `fr-FR`, `en`, `en-US`, etc. | Code de langue cible |

---

## 📝 Exemples d'URLs

### ❌ INCORRECT (Anglais par défaut)

```
GET /api/videogames/rawg/game/kingdom-hearts
```

**Résultat** : Description en anglais
```json
{
  "success": true,
  "source": "rawg",
  "data": {
    "title": "Kingdom Hearts",
    "description": "Kingdom Hearts is the story of Sora, a 14-year-old boy whose world is shattered...",
    "genres": [
      { "name": "Action" },
      { "name": "RPG" }
    ]
  }
}
```

---

### ✅ CORRECT (Français avec traduction)

```
GET /api/videogames/rawg/game/kingdom-hearts?autoTrad=true&lang=fr
```

**Résultat** : Description traduite en français
```json
{
  "success": true,
  "source": "rawg",
  "data": {
    "title": "Kingdom Hearts",
    "description": "Kingdom Hearts est l'histoire de Sora, un garçon de 14 ans dont le monde est brisé...",
    "genres": [
      { "name": "Action" },
      { "name": "RPG" }
    ]
  }
}
```

---

## 🔧 Formats Acceptés

### Paramètre `autoTrad`

Toutes ces valeurs activent la traduction :
- `autoTrad=true`
- `autoTrad=1`
- `autoTrad="true"`
- `autoTrad="1"`

### Paramètre `lang`

Codes de langue supportés :
- **Français** : `fr`, `fr-FR`, `fr-CA`
- **Anglais** : `en`, `en-US`, `en-GB`
- **Espagnol** : `es`, `es-ES`, `es-MX`
- **Allemand** : `de`, `de-DE`
- **Italien** : `it`, `it-IT`
- **Japonais** : `ja`, `ja-JP`
- Etc.

---

## 🌐 Alternative : Header Accept-Language

Au lieu de `lang` en query param, vous pouvez utiliser le header HTTP :

```http
GET /api/videogames/rawg/game/kingdom-hearts?autoTrad=true
Accept-Language: fr-FR
```

---

## 📋 Exemples par Provider

### 1. RAWG Provider

#### Détails d'un jeu
```bash
# Français
curl "http://localhost:3000/api/videogames/rawg/game/kingdom-hearts?autoTrad=true&lang=fr"

# Anglais (défaut, pas besoin de paramètres)
curl "http://localhost:3000/api/videogames/rawg/game/kingdom-hearts"
```

#### Recherche
```bash
# Français
curl "http://localhost:3000/api/videogames/rawg/search?q=zelda&autoTrad=true&lang=fr"

# Anglais
curl "http://localhost:3000/api/videogames/rawg/search?q=zelda"
```

---

### 2. IGDB Provider

#### Détails d'un jeu
```bash
# Français
curl "http://localhost:3000/api/videogames/igdb/game/1942?autoTrad=true&lang=fr"

# Anglais
curl "http://localhost:3000/api/videogames/igdb/game/1942"
```

#### Recherche
```bash
# Français
curl "http://localhost:3000/api/videogames/igdb/search?q=witcher&autoTrad=true&lang=fr"
```

---

### 3. JVC Provider

**Note** : JVC (JeuxVideo.com) est **déjà en français par défaut**. Pas besoin de paramètres de traduction.

```bash
# Déjà en français
curl "http://localhost:3000/api/videogames/jvc/search?q=zelda"
```

---

## 🎯 Champs Traduits

### RAWG & IGDB

| Champ | Traduit | Note |
|-------|---------|------|
| `title` | ❌ Non | Titre original conservé |
| `description` | ✅ Oui | Traduit si `autoTrad=true` |
| `descriptionHtml` | ✅ Oui | Traduit si `autoTrad=true` |
| `genres[].name` | ✅ Oui | Traduit dans les recherches |
| `developers` | ❌ Non | Noms des studios conservés |
| `publishers` | ❌ Non | Noms des éditeurs conservés |

### JVC

| Champ | Langue |
|-------|--------|
| Tous | 🇫🇷 Français natif |

---

## 🚀 Exemples JavaScript

### Fetch API

```javascript
// Avec traduction française
const response = await fetch(
  'http://localhost:3000/api/videogames/rawg/game/kingdom-hearts?autoTrad=true&lang=fr'
);
const data = await response.json();

console.log(data.data.description); // En français
```

### Axios

```javascript
import axios from 'axios';

// Avec traduction française
const { data } = await axios.get(
  '/api/videogames/rawg/game/kingdom-hearts',
  {
    params: {
      autoTrad: true,
      lang: 'fr'
    }
  }
);

console.log(data.data.description); // En français
```

### Avec Accept-Language Header

```javascript
const response = await fetch(
  'http://localhost:3000/api/videogames/rawg/game/kingdom-hearts?autoTrad=true',
  {
    headers: {
      'Accept-Language': 'fr-FR'
    }
  }
);
```

---

## 🧪 Test avec cURL

### Test complet Kingdom Hearts

```bash
# 1. Sans traduction (anglais)
echo "=== SANS TRADUCTION ==="
curl -s "http://localhost:3000/api/videogames/rawg/game/kingdom-hearts" \
  | jq '.data.description' | head -c 100

# 2. Avec traduction (français)
echo -e "\n\n=== AVEC TRADUCTION ==="
curl -s "http://localhost:3000/api/videogames/rawg/game/kingdom-hearts?autoTrad=true&lang=fr" \
  | jq '.data.description' | head -c 100
```

**Résultat attendu** :
```
=== SANS TRADUCTION ===
"Kingdom Hearts is the story of Sora, a 14-year-old boy whose world is shattered..."

=== AVEC TRADUCTION ===
"Kingdom Hearts est l'histoire de Sora, un garçon de 14 ans dont le monde est brisé..."
```

---

## ⚙️ Configuration Recommandée

### Pour Applications Frontend

Dans votre configuration API client :

```javascript
// config/api.js
export const API_BASE_URL = 'http://localhost:3000';

export const API_DEFAULTS = {
  autoTrad: true,
  lang: 'fr' // ou récupérer depuis navigator.language
};

// Fonction helper
export function buildGameUrl(provider, idOrSlug, options = {}) {
  const params = new URLSearchParams({
    autoTrad: options.autoTrad ?? API_DEFAULTS.autoTrad,
    lang: options.lang ?? API_DEFAULTS.lang
  });
  
  return `${API_BASE_URL}/api/videogames/${provider}/game/${idOrSlug}?${params}`;
}

// Usage
const url = buildGameUrl('rawg', 'kingdom-hearts');
// → http://localhost:3000/api/videogames/rawg/game/kingdom-hearts?autoTrad=true&lang=fr
```

---

## 📊 Résumé Comparatif

| Scénario | URL | Langue Résultat |
|----------|-----|-----------------|
| Par défaut | `/rawg/game/kingdom-hearts` | 🇬🇧 Anglais |
| Avec traduction | `/rawg/game/kingdom-hearts?autoTrad=true&lang=fr` | 🇫🇷 Français |
| JVC natif | `/jvc/search?q=zelda` | 🇫🇷 Français |

---

## 🔍 Débogage

### Vérifier si la traduction est activée

Ajoutez ce log dans votre code :

```javascript
const response = await fetch(url);
const data = await response.json();

// Vérifier la langue de la description
const isFrench = /[àâäéèêëïîôùûüÿç]/.test(data.data.description);
console.log('Description en français?', isFrench);
```

### Logs Tako API

Vérifiez les logs du serveur Tako API :

```
DEBUG [Translator] Traduction vers fr: "Kingdom Hearts is the story..."
DEBUG [TranslationService] Traduction de 2 chunks vers fr
DEBUG [Translator] ✅ Traduit de en vers fr
```

Si vous ne voyez pas ces logs, la traduction n'est pas activée.

---

## ⚠️ Points Importants

1. **`autoTrad` est REQUIS** : Sans ce paramètre, pas de traduction même avec `lang=fr`
2. **Les titres ne sont pas traduits** : Seuls les descriptions et genres le sont
3. **JVC est déjà en français** : Pas besoin de traduction pour ce provider
4. **Cache** : Les traductions sont mises en cache pour améliorer les performances

---

## 📞 Support

Si la traduction ne fonctionne pas :

1. ✅ Vérifier que `autoTrad=true` est présent dans l'URL
2. ✅ Vérifier que `lang=fr` est présent
3. ✅ Vérifier les logs côté serveur Tako API
4. ✅ Tester avec curl pour isoler le problème
5. ✅ Vérifier que Tako API version ≥ 1.0.11

---

**Dernière mise à jour** : 25 février 2026  
**Documentation** : [GitHub Tako_Api](https://github.com/Nimai26/Tako_Api)
