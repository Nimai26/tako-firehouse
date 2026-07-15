/**
 * Shared Utils - Helpers
 * Fonctions utilitaires pures (sans état)
 */

/**
 * Pause l'exécution pendant un délai donné
 * @param {number} ms - Délai en millisecondes
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Réessaie une fonction avec backoff exponentiel
 * @param {Function} fn - Fonction à exécuter
 * @param {object} options - Options
 * @param {number} options.maxRetries - Nombre max de tentatives (défaut: 3)
 * @param {number} options.baseDelay - Délai initial en ms (défaut: 1000)
 * @param {Function} options.shouldRetry - Fonction pour déterminer si on réessaie
 */
export async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    shouldRetry = () => true
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      if (attempt === maxRetries - 1 || !shouldRetry(err)) {
        throw err;
      }
      
      // Backoff exponentiel avec jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Divise un tableau en chunks de taille donnée
 * @param {Array} array - Tableau à diviser
 * @param {number} size - Taille des chunks
 */
export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Extrait l'année d'une date
 * @param {string|Date|number} date - Date ou année
 * @returns {number|null}
 */
export function extractYear(date) {
  if (!date) return null;
  
  if (typeof date === 'number') {
    return date > 1800 && date < 2200 ? date : null;
  }
  
  if (date instanceof Date) {
    return date.getFullYear();
  }
  
  const str = String(date);
  const match = str.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Décode les entités HTML
 * @param {string} html - Chaîne avec entités HTML
 */
export function decodeHtmlEntities(html) {
  if (!html) return html;
  
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&apos;': "'"
  };
  
  return html.replace(/&[#\w]+;/g, entity => entities[entity] || entity);
}

/**
 * Nettoie une chaîne (trim, supprime doublons d'espaces)
 * @param {string} str - Chaîne à nettoyer
 */
export function cleanString(str) {
  if (!str) return null;
  return String(str).trim().replace(/\s+/g, ' ') || null;
}

/**
 * Normalise un code langue vers format court (fr, en, de)
 * @param {string} lang - Code langue ou locale
 */
export function normalizeLanguage(lang) {
  if (!lang) return 'fr';
  if (lang.includes('-') || lang.includes('_')) {
    return lang.split(/[-_]/)[0].toLowerCase();
  }
  return lang.toLowerCase().substring(0, 2);
}

/**
 * Normalise vers une locale complète (fr-FR, en-US)
 * @param {string} input - Code langue ou locale
 */
export function normalizeLocale(input) {
  if (!input) return 'fr-FR';
  
  const langMap = {
    'fr': 'fr-FR',
    'en': 'en-US',
    'de': 'de-DE',
    'es': 'es-ES',
    'it': 'it-IT',
    'pt': 'pt-PT',
    'nl': 'nl-NL',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN'
  };
  
  // Déjà une locale complète
  if (input.includes('-') || input.includes('_')) {
    return input.replace('_', '-');
  }
  
  return langMap[input.toLowerCase()] || `${input.toLowerCase()}-${input.toUpperCase()}`;
}
