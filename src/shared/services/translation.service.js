/**
 * src/shared/services/translation.service.js - Service de traduction intégré
 * Tako_Api
 * 
 * Remplace le container auto_trad par une intégration directe de google-translate-api-x.
 * Reproduit toutes les fonctionnalités de auto_trad:
 * - Découpe intelligente des textes longs (smart_truncate)
 * - Parallélisation limitée (MAX_CONCURRENT = 3)
 * - Retry en cas d'erreur
 * - Traduction batch
 * 
 * @module shared/services/translation
 */

import translate from 'google-translate-api-x';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TranslationService');

// Configuration
const MAX_CHUNK_LENGTH = 500;  // Longueur max d'un chunk (comme auto_trad)
const MAX_CONCURRENT = 10;     // Parallélisation (googleapis.com tolère bien la concurrence)
const MAX_RETRIES = 3;         // Nombre de retry en cas d'erreur
const RETRY_DELAY_MS = 1500;   // Délai entre les retry (augmenté)
const INTER_REQUEST_DELAY = 100; // Délai entre chaque requête (ms)

// Sémaphore simple pour limiter la concurrence
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next();
    }
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT);

/**
 * Request function personnalisée pour utiliser translate.googleapis.com
 * au lieu de translate.google.com (rate-limité).
 * La lib envoie un POST vers translate.google.com/translate_a/single?client=at
 * On le convertit en GET vers translate.googleapis.com/translate_a/single?client=gtx
 */
function customRequestFunction(url, fetchInit) {
  // Extraire les params du body POST (sl=auto&tl=fr&q=text)
  const bodyText = fetchInit?.body || '';
  const bodyParams = new URLSearchParams(bodyText);
  const sl = bodyParams.get('sl') || 'auto';
  const tl = bodyParams.get('tl') || 'fr';
  const q = bodyParams.get('q') || '';
  
  // Construire l'URL GET vers googleapis.com
  const newUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=rm&dj=1&q=${encodeURIComponent(q)}`;
  
  return fetch(newUrl, { credentials: 'omit' });
}

/**
 * Découpe une chaîne en morceaux de moins de 500 caractères
 * en respectant les limites des mots.
 * Reproduit exactement smart_truncate() de auto_trad
 * 
 * @param {string} content - Texte à découper
 * @param {number} splitLen - Longueur max par chunk (défaut: 500)
 * @returns {string[]} - Tableau de chunks
 */
function smartTruncate(content, splitLen = MAX_CHUNK_LENGTH) {
  if (!content || content.length <= splitLen) {
    return [content];
  }

  const words = content.split(/\s+/);
  const chunks = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length < splitLen) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        chunks.push(currentLine.trim());
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    chunks.push(currentLine.trim());
  }

  return chunks;
}

/**
 * Délai asynchrone
 * @param {number} ms - Millisecondes
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Traduit un seul chunk de texte avec retry
 * Reproduit translate_chunk() de auto_trad
 * 
 * @param {string} chunk - Texte à traduire
 * @param {string} destLang - Langue de destination
 * @returns {Promise<{text: string, from: string|null}>}
 */
async function translateChunk(chunk, destLang = 'fr') {
  if (!chunk || !chunk.trim()) {
    return { text: chunk, from: null };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await semaphore.acquire();
      
      const result = await translate(chunk, {
        to: destLang,
        autoCorrect: false,
        forceBatch: false,       // Utiliser endpoint single
        fallbackBatch: false,    // Ne pas fallback sur batch
        requestFunction: customRequestFunction  // Utiliser translate.googleapis.com
      });

      semaphore.release();

      return {
        text: result.text,
        from: result.from?.language?.iso || null
      };
    } catch (err) {
      semaphore.release();
      
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * (attempt + 1); // Backoff exponentiel
        log.warn(`Retry traduction (tentative ${attempt + 1}), attente ${delay}ms: ${err.message}`);
        await sleep(delay);
      } else {
        log.error(`Erreur de traduction pour: "${chunk.substring(0, 50)}..." - ${err.message}`);
        // Retourner l'original en cas d'échec
        return { text: chunk, from: null };
      }
    }
  }

  return { text: chunk, from: null };
}

/**
 * Traduit un texte vers la langue de destination.
 * Gère les textes longs en les découpant et traduit les chunks en parallèle.
 * Reproduit translate_text() de auto_trad
 * 
 * @param {string} text - Texte à traduire
 * @param {string} destLang - Langue de destination (défaut: 'fr')
 * @returns {Promise<{original: string, translated: string, source_lang: string|null, error: string|null}>}
 */
export async function translateText(text, destLang = 'fr') {
  if (!text || !text.trim()) {
    return {
      original: text,
      translated: text,
      source_lang: null,
      error: null
    };
  }

  // Découper le texte si nécessaire
  const chunks = smartTruncate(text, MAX_CHUNK_LENGTH);

  // Si un seul chunk, traduction simple
  if (chunks.length === 1) {
    const result = await translateChunk(chunks[0], destLang);
    return {
      original: text,
      translated: result.text,
      source_lang: result.from,
      error: null
    };
  }

  // Traduire les chunks (le sémaphore global gère la concurrence)
  log.debug(`Traduction de ${chunks.length} chunks vers ${destLang}`);
  
  const results = await Promise.all(
    chunks.map(chunk => translateChunk(chunk, destLang))
  );
  
  const translatedText = results.map(r => r.text).join(' ');
  const sourceLang = results.find(r => r.from)?.from || null;

  return {
    original: text,
    translated: translatedText,
    source_lang: sourceLang,
    error: null
  };
}

/**
 * Traduit plusieurs textes en parallèle (batch).
 * Reproduit translate_texts_parallel() de auto_trad
 * 
 * @param {string[]} texts - Tableau de textes à traduire
 * @param {string} destLang - Langue de destination (défaut: 'fr')
 * @returns {Promise<Array<{original: string, translated: string, source_lang: string|null, error: string|null}>>}
 */
export async function translateTexts(texts, destLang = 'fr') {
  if (!texts || !texts.length) {
    return [];
  }

  log.info(`Traduction batch de ${texts.length} texte(s) vers ${destLang}`);

  // Préparer tous les jobs: découper chaque texte en chunks
  const jobs = [];
  const textChunksMap = new Map(); // textIdx -> { numChunks, invalid }

  for (let textIdx = 0; textIdx < texts.length; textIdx++) {
    const text = texts[textIdx];
    
    if (typeof text !== 'string' || !text.trim()) {
      textChunksMap.set(textIdx, { numChunks: 0, invalid: true });
      continue;
    }

    const chunks = smartTruncate(text, MAX_CHUNK_LENGTH);
    textChunksMap.set(textIdx, { numChunks: chunks.length, invalid: false });

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      jobs.push({ textIdx, chunkIdx, chunk: chunks[chunkIdx] });
    }
  }

  // Exécuter tous les jobs séquentiellement pour éviter le rate-limit Google
  const resultsMap = new Map(); // "textIdx:chunkIdx" -> result

  for (const job of jobs) {
    const result = await translateChunk(job.chunk, destLang);
    resultsMap.set(`${job.textIdx}:${job.chunkIdx}`, result);
  }

  // Reconstruire les résultats
  const finalResults = [];

  for (let textIdx = 0; textIdx < texts.length; textIdx++) {
    const text = texts[textIdx];
    const meta = textChunksMap.get(textIdx);

    if (meta.invalid) {
      finalResults.push({
        original: text,
        translated: null,
        source_lang: null,
        error: 'Le texte doit être une chaîne de caractères non vide'
      });
      continue;
    }

    const translatedChunks = [];
    let sourceLang = null;

    for (let chunkIdx = 0; chunkIdx < meta.numChunks; chunkIdx++) {
      const result = resultsMap.get(`${textIdx}:${chunkIdx}`);
      if (result) {
        translatedChunks.push(result.text);
        if (!sourceLang && result.from) {
          sourceLang = result.from;
        }
      }
    }

    finalResults.push({
      original: text,
      translated: translatedChunks.join(' '),
      source_lang: sourceLang,
      error: null
    });
  }

  log.info(`Traduction terminée: ${finalResults.length} résultat(s)`);
  return finalResults;
}

/**
 * Détecte la langue d'un texte
 * 
 * @param {string} text - Texte à analyser
 * @returns {Promise<string|null>} - Code langue ISO ou null
 */
export async function detectLanguage(text) {
  if (!text || text.trim().length < 3) {
    return null;
  }

  if (text.length > 5000) {
    log.warn(`Texte trop long pour détection: ${text.length} caractères`);
    return null;
  }

  try {
    // Traduire vers anglais juste pour obtenir la langue source
    const result = await translate(text.substring(0, 500), {
      to: 'en',
      forceBatch: true
    });
    return result.from?.language?.iso || null;
  } catch (err) {
    log.error(`Erreur de détection de langue: ${err.message}`);
    return null;
  }
}

/**
 * Vérifie si le service de traduction est disponible
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    const result = await translate('test', { to: 'fr' });
    return result && result.text ? true : false;
  } catch (err) {
    log.error(`Health check échoué: ${err.message}`);
    return false;
  }
}

// Export par défaut pour compatibilité
export default {
  translateText,
  translateTexts,
  detectLanguage,
  healthCheck,
  smartTruncate
};
