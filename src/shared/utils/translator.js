/**
 * src/shared/utils/translator.js - Service de traduction automatique
 * Tako_Api
 * 
 * Fonction réutilisable pour traduire des champs.
 * Activée uniquement si autoTrad=1 est passé explicitement dans la requête.
 * 
 * Utilise des dictionnaires locaux pour les traductions rapides (fast path)
 * avec fallback sur le service de traduction intégré (google-translate-api-x).
 * 
 * @module shared/utils/translator
 */

import { createLogger } from './logger.js';
import { config } from '../../config/index.js';
import {
  MEDIA_GENRES,
  VIDEOGAME_GENRES,
  MUSIC_GENRES,
  BOOK_GENRES,
  BOARDGAME_GENRES,
  TOY_CATEGORIES,
  lookupInDictionary,
  lookupInAllDictionaries
} from './genre-dictionaries.js';
import {
  translateText as translateViaService,
  translateTexts as translateBatchViaService
} from '../services/translation.service.js';

const log = createLogger('Translator');

// Configuration de traduction (activée par défaut maintenant que c'est intégré)
const TRANSLATION_ENABLED = config.env.autoTrad?.enabled !== false;

// ============================================================================
// EXPORT DES DICTIONNAIRES
// ============================================================================

export {
  MEDIA_GENRES,
  VIDEOGAME_GENRES,
  MUSIC_GENRES,
  BOOK_GENRES,
  BOARDGAME_GENRES,
  TOY_CATEGORIES,
  lookupInDictionary,
  lookupInAllDictionaries
};

// Alias pour rétrocompatibilité
const GENRE_TRANSLATIONS = MEDIA_GENRES;

// Cache pour les traductions de genres via API (évite les appels répétés)
const genreApiCache = new Map();

// ============================================================================
// DÉTECTION DE LANGUE
// ============================================================================

/**
 * Détecte si un texte est probablement en anglais (heuristique simple)
 * @param {string} text - Texte à analyser
 * @returns {boolean} - true si probablement en anglais
 */
function isLikelyEnglish(text) {
  if (!text || text.length < 20) return false;
  
  // Mots anglais très courants
  const englishWords = /\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|can|of|in|to|for|with|on|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|also|now|and|but|or|if|because|until|while|although|though|whether|either|neither|both|which|what|who|whom|whose|this|that|these|those|it|its|they|their|them|he|she|him|her|his|we|us|our|you|your|i|my|me)\b/gi;
  
  const matches = text.match(englishWords) || [];
  const wordCount = text.split(/\s+/).length;
  const ratio = matches.length / wordCount;
  
  // Si plus de 25% de mots anglais courants, probablement en anglais
  return ratio > 0.25;
}

/**
 * Extrait le code langue court (fr, de, es) depuis un locale complet (fr-FR, de-DE)
 * @param {string|string[]} lang - Code langue (ex: "fr-FR", "fr", "de-DE")
 * @returns {string} - Code court (ex: "fr", "de")
 */
export function extractLangCode(lang) {
  if (!lang) return 'en';
  // Si lang est un tableau (multiples paramètres), prendre le premier
  const langStr = Array.isArray(lang) ? lang[0] : lang;
  if (typeof langStr !== 'string') return 'en';
  // Support both formats: fr-FR and fr_FR
  return langStr.split(/[-_]/)[0].toLowerCase();
}

// ============================================================================
// TRADUCTION DE GENRES
// ============================================================================

/**
 * Extrait le nom d'un genre (gère string ou objet)
 * @param {string|object} genre - Genre (string ou {name: "Action"})
 * @returns {string|null} - Nom du genre ou null
 */
function extractGenreName(genre) {
  if (!genre) return null;
  if (typeof genre === 'string') return genre;
  if (typeof genre === 'object') {
    return genre.name || genre.label || genre.title || null;
  }
  return null;
}

/**
 * Traduit un genre en utilisant les dictionnaires locaux (tous les domaines)
 * Cherche d'abord dans MEDIA_GENRES, puis dans tous les autres dictionnaires
 * @param {string|object} genre - Genre en anglais (string ou objet avec name)
 * @param {string} lang - Code langue cible (fr, de, es, it, pt)
 * @returns {string|null} - Genre traduit ou null si non trouvé dans les dictionnaires
 */
function translateGenreFromDict(genre, lang) {
  const genreName = extractGenreName(genre);
  if (!genreName || !lang || lang === 'en') return genreName || genre;
  
  // Chercher dans tous les dictionnaires (media d'abord, puis videogame, music, book, boardgame, toy)
  const translated = lookupInAllDictionaries(genreName, lang);
  if (translated !== null) {
    return translated;
  }
  
  return null;
}

/**
 * Traduit un genre via le service de traduction intégré (fallback)
 * @param {string|object} genre - Genre en anglais (string ou objet avec name)
 * @param {string} lang - Code langue cible
 * @returns {Promise<string>} - Genre traduit ou original si échec
 */
async function translateGenreViaService(genre, lang) {
  const genreName = extractGenreName(genre);
  if (!genreName || !TRANSLATION_ENABLED) {
    return genreName || genre;
  }
  
  // Vérifier le cache
  const cacheKey = `${genreName.toLowerCase()}_${lang}`;
  if (genreApiCache.has(cacheKey)) {
    return genreApiCache.get(cacheKey);
  }
  
  try {
    const result = await translateViaService(genreName, lang);
    
    if (result && result.translated && result.translated !== genreName) {
      const translated = result.translated;
      // Mettre en cache pour les prochaines fois
      genreApiCache.set(cacheKey, translated);
      log.debug(`Genre traduit: ${genreName} → ${translated} (${lang})`);
      return translated;
    }
    
    return genreName;
  } catch (err) {
    log.debug(`Échec traduction genre: ${genreName} (${err.message})`);
    return genreName;
  }
}

/**
 * Traduit un genre avec approche hybride : dictionnaire d'abord, puis service si non trouvé
 * @param {string|object} genre - Genre à traduire (string ou objet avec name)
 * @param {string} lang - Code langue cible
 * @returns {Promise<string>} - Genre traduit
 */
export async function translateGenre(genre, lang) {
  const genreName = extractGenreName(genre);
  if (!genreName || !lang) return genreName || genre;
  
  // 1. Essayer le dictionnaire local (rapide)
  const fromDict = translateGenreFromDict(genreName, lang);
  if (fromDict !== null) {
    return fromDict;
  }
  
  // 2. Fallback sur le service de traduction intégré
  return await translateGenreViaService(genreName, lang);
}

/**
 * Traduit un tableau de genres (approche hybride)
 * @param {string[]} genres - Tableau de genres en anglais
 * @param {string} lang - Code langue cible
 * @param {object} options - Options de traduction
 * @param {string} options.sourceLang - Langue source connue (optionnel)
 * @returns {Promise<{genres: string[], genresOriginal: string[], genresTranslated: boolean}>}
 */
export async function translateGenres(genres, lang, options = {}) {
  const { sourceLang = null } = options;
  
  if (!genres || !genres.length || !lang) {
    return { genres, genresOriginal: undefined, genresTranslated: false };
  }
  
  const targetLang = extractLangCode(lang);
  const sourceLanguage = sourceLang ? extractLangCode(sourceLang) : null;
  
  // Si langue source connue et identique à la cible, pas de traduction
  if (sourceLanguage && sourceLanguage === targetLang) {
    return { genres, genresOriginal: undefined, genresTranslated: false };
  }
  
  // Traduire tous les genres (en parallèle pour les appels API)
  const translatedGenres = await Promise.all(
    genres.map(g => translateGenre(g, targetLang))
  );
  
  const hasTranslations = translatedGenres.some((g, i) => g !== genres[i]);
  
  return {
    genres: translatedGenres,
    genresOriginal: hasTranslations ? genres : undefined,
    genresTranslated: hasTranslations
  };
}

// ============================================================================
// TRADUCTION DE TEXTE
// ============================================================================

/**
 * Traduit un texte via le service de traduction intégré
 * 
 * @param {string} text - Texte à traduire
 * @param {string} destLang - Langue de destination (ex: "fr", "fr-FR", "de", "es")
 * @param {object} options - Options de traduction
 * @param {boolean} options.enabled - Si la traduction est activée (paramètre autoTrad)
 * @param {string} options.fallback - Langue de fallback si échec (défaut: texte original)
 * @param {boolean} options.detectEnglish - Détecte si déjà en anglais pour éviter traduction inutile
 * @param {string} options.sourceLang - Langue source connue (optionnel)
 * @returns {Promise<{text: string, translated: boolean, from?: string, to?: string}>}
 */
export async function translateText(text, destLang, options = {}) {
  const {
    enabled = false,
    fallback = null,
    detectEnglish = true,
    sourceLang = null
  } = options;
  
  const result = { text, translated: false };
  
  // Ne traduit QUE si autoTrad=1 est passé explicitement
  if (!text || !enabled || !TRANSLATION_ENABLED) {
    return result;
  }
  
  const targetLang = extractLangCode(destLang);
  const sourceLanguage = sourceLang ? extractLangCode(sourceLang) : null;
  
  // Si langue source connue et identique à la cible, pas de traduction
  if (sourceLanguage && sourceLanguage === targetLang) {
    return result;
  }
  
  // Si pas de langue source connue, utiliser la détection heuristique
  if (!sourceLanguage && detectEnglish) {
    // Si on veut traduire vers anglais et que le texte semble déjà anglais, skip
    if (targetLang === 'en' && isLikelyEnglish(text)) {
      log.debug(`Texte probablement déjà en anglais, traduction ignorée`);
      return result;
    }
    // Si on veut traduire vers français et que le texte semble déjà français, skip
    if (targetLang === 'fr' && !isLikelyEnglish(text)) {
      log.debug(`Texte probablement déjà en français, traduction ignorée`);
      return result;
    }
  }
  
  try {
    log.debug(`Traduction vers ${targetLang}: "${text.substring(0, 50)}..."`);
    
    const data = await translateViaService(text, targetLang);
    
    if (data && data.translated && data.translated !== text) {
      const translatedText = data.translated;
      const detectedLang = data.source_lang || 'en';
      
      log.debug(`✅ Traduit de ${detectedLang} vers ${targetLang}`);
      
      return {
        text: translatedText,
        translated: true,
        from: detectedLang,
        to: targetLang
      };
    }
    
    return result;
  } catch (err) {
    log.warn(`Erreur de traduction: ${err.message}`);
    return fallback ? { text: fallback, translated: false } : result;
  }
}

/**
 * Traduit plusieurs champs d'un objet
 * 
 * @param {object} obj - Objet contenant les champs à traduire
 * @param {string[]} fields - Liste des champs à traduire
 * @param {string} destLang - Langue de destination
 * @param {object} options - Options de traduction
 * @returns {Promise<object>} - Objet avec champs traduits + métadonnées
 */
export async function translateFields(obj, fields, destLang, options = {}) {
  if (!obj || !fields || !fields.length) return obj;
  
  const translations = {};
  
  for (const field of fields) {
    const value = obj[field];
    if (typeof value === 'string' && value.trim()) {
      const result = await translateText(value, destLang, options);
      if (result.translated) {
        obj[field] = result.text;
        translations[field] = {
          from: result.from,
          to: result.to
        };
      }
    }
  }
  
  // Ajouter les métadonnées de traduction si au moins un champ traduit
  if (Object.keys(translations).length > 0) {
    obj._translations = translations;
  }
  
  return obj;
}

/**
 * Helper pour vérifier si autoTrad est activé depuis une requête
 * @param {object} query - req.query de Express
 * @returns {boolean}
 */
export function isAutoTradEnabled(query) {
  return query.autoTrad === '1' || query.autoTrad === 'true' || query.autoTrad === true;
}

// ============================================================================
// FONCTIONS DE TRADUCTION PAR DOMAINE
// ============================================================================

/**
 * Traduit un genre/catégorie avec dictionnaire spécifique au domaine
 * @param {string} term - Terme à traduire
 * @param {string} lang - Code langue cible
 * @param {string} category - Catégorie (media, videogame, music, book, boardgame, toy)
 * @returns {Promise<string>} - Terme traduit
 */
export async function translateByCategory(term, lang, category = 'media') {
  if (!term || !lang || lang === 'en') return term;
  
  // 1. Essayer le dictionnaire spécifique au domaine
  const fromDict = lookupInDictionary(term, lang, category);
  if (fromDict !== null) {
    return fromDict;
  }
  
  // 2. Fallback sur le service de traduction intégré
  return await translateGenreViaService(term, lang);
}

/**
 * Traduit un tableau de termes par catégorie
 * @param {string[]} terms - Termes à traduire
 * @param {string} lang - Code langue cible
 * @param {string} category - Catégorie de dictionnaire
 * @returns {Promise<{terms: string[], termsOriginal: string[], termsTranslated: boolean}>}
 */
export async function translateTermsByCategory(terms, lang, category = 'media') {
  if (!terms || !terms.length || !lang || lang === 'en') {
    return { terms, termsOriginal: undefined, termsTranslated: false };
  }
  
  const translatedTerms = await Promise.all(
    terms.map(t => translateByCategory(t, lang, category))
  );
  
  const hasTranslations = translatedTerms.some((t, i) => t !== terms[i]);
  
  return {
    terms: translatedTerms,
    termsOriginal: hasTranslations ? terms : undefined,
    termsTranslated: hasTranslations
  };
}

// Fonctions spécialisées par domaine (shortcuts)

/**
 * Traduit des genres de jeux vidéo
 */
export async function translateVideoGameGenres(genres, lang) {
  return translateTermsByCategory(genres, lang, 'videogame');
}

/**
 * Traduit des genres musicaux
 */
export async function translateMusicGenres(genres, lang) {
  return translateTermsByCategory(genres, lang, 'music');
}

/**
 * Traduit des genres littéraires
 */
export async function translateBookGenres(genres, lang) {
  return translateTermsByCategory(genres, lang, 'book');
}

/**
 * Traduit des catégories de jeux de société
 */
export async function translateBoardGameCategories(categories, lang) {
  return translateTermsByCategory(categories, lang, 'boardgame');
}

/**
 * Traduit des catégories de jouets
 */
export async function translateToyCategories(categories, lang) {
  return translateTermsByCategory(categories, lang, 'toy');
}

/**
 * Traduit un texte vers l'anglais (pour les recherches dans les APIs anglophones)
 * Utile pour Rebrickable, IMDB, etc. qui indexent en anglais
 * 
 * @param {string} text - Texte à traduire
 * @param {string} [sourceLang] - Langue source (auto-détection si non spécifié)
 * @returns {Promise<{text: string, translated: boolean, originalText?: string}>}
 */
export async function translateToEnglish(text, sourceLang = null) {
  const result = { text, translated: false };
  
  if (!text || !TRANSLATION_ENABLED) {
    return result;
  }
  
  // Si la langue source est explicitement anglais, ne pas traduire
  if (sourceLang === 'en') {
    return result;
  }
  
  // Ne pas essayer de traduire les numéros de sets (ex: 75192, 75192-1)
  if (/^\d+(-\d+)?$/.test(text.trim())) {
    return result;
  }
  
  try {
    log.debug(`Traduction vers anglais: "${text}" (source: ${sourceLang || 'auto'})`);
    
    const data = await translateViaService(text, 'en');
    
    if (data && data.translated && data.translated !== text) {
      let translatedText = data.translated;
      const detectedLang = data.source_lang || 'unknown';
      
      // Vérifier si le texte a vraiment été traduit (différent de l'original)
      if (translatedText.toLowerCase().trim() !== text.toLowerCase().trim()) {
        // Retirer les articles anglais du début pour optimiser les recherches API
        const originalTranslated = translatedText;
        translatedText = translatedText.replace(/^(the|a|an)\s+/i, '').trim();
        
        if (translatedText !== originalTranslated) {
          log.debug(`Article retiré: "${originalTranslated}" → "${translatedText}"`);
        }
        
        log.info(`✅ Traduit "${text}" → "${translatedText}" (${detectedLang} → en)`);
        
        return {
          text: translatedText,
          translated: true,
          originalText: text,
          from: detectedLang
        };
      } else {
        log.debug(`Texte inchangé après traduction (probablement déjà en anglais)`);
        return result;
      }
    }
    
    return result;
  } catch (err) {
    log.warn(`Traduction vers EN échouée: ${err.message}`);
    return result;
  }
}

/**
 * Traduit les descriptions des résultats de recherche si autoTrad est activé
 * Fonction utilitaire partagée pour toutes les routes /search
 * 
 * @param {Array} items - Les items à traduire
 * @param {boolean} autoTrad - Si la traduction automatique est activée
 * @param {string} lang - La langue cible (fr, es, de, etc.)
 * @returns {Promise<Array>} - Les items avec descriptions traduites
 */
export async function translateSearchDescriptions(items, autoTrad, lang) {
  // Ne pas traduire si autoTrad désactivé ou langue anglaise demandée
  if (!autoTrad || !lang || lang === 'en') {
    return items;
  }
  
  // Limiter la traduction aux 10 premiers résultats pour éviter les timeouts
  const MAX_TRANSLATIONS = 10;
  const toTranslate = items.slice(0, MAX_TRANSLATIONS);
  const remaining = items.slice(MAX_TRANSLATIONS);
  
  // Traduire en parallèle
  const translatedBatch = await Promise.all(
    toTranslate.map(async (item) => {
      if (!item.description) return item;
      
      const translated = await translateText(item.description, lang, { enabled: true });
      return {
        ...item,
        description: translated.text,
        descriptionTranslated: translated.translated
      };
    })
  );
  
  // Retourner les traduits + les non-traduits
  return [...translatedBatch, ...remaining];
}

/**
 * Traduit les noms ET descriptions des résultats de recherche (pour providers US/internationaux)
 * 
 * Supporte deux conventions d'appel :
 *   Convention A : translateSearchResults(items[], autoTrad, lang)
 *     → Utilisée par klickypedia, googlebooks, brickset, rebrickable, openlibrary, igdb
 *   Convention B : translateSearchResults(responseObj, targetLang, { fields })
 *     → Utilisée par tmdb, tvdb, mangaupdates, jikan, bedetheque, comicvine
 * 
 * @param {Array|Object} input - Tableau d'items OU objet réponse avec .data[]
 * @param {boolean|string} secondArg - autoTrad (Convention A) ou targetLang (Convention B)
 * @param {string|Object} thirdArg - lang (Convention A) ou { fields: string[] } (Convention B)
 * @returns {Promise<Array|Object>} - Les items traduits, dans le même format que l'input
 */
export async function translateSearchResults(input, secondArg, thirdArg) {
  // ── Normalisation des arguments (2 conventions supportées) ──────────────
  let items, destLang, fieldsToTranslate, isResponseObject;

  if (Array.isArray(input)) {
    // Convention A : translateSearchResults(items[], autoTrad, lang)
    if (!secondArg) return input;
    destLang = extractLangCode(thirdArg);
    if (!destLang || destLang === 'en') return input;
    items = input;
    fieldsToTranslate = null; // tous les champs par défaut
    isResponseObject = false;
  } else if (input && Array.isArray(input.data)) {
    // Convention B : translateSearchResults(responseObj, targetLang, { fields })
    destLang = typeof secondArg === 'string' ? secondArg : null;
    if (!destLang || destLang === 'en') return input;
    items = input.data;
    const options = (typeof thirdArg === 'object' && thirdArg !== null) ? thirdArg : {};
    fieldsToTranslate = options.fields || options.fieldsToTranslate || null;
    isResponseObject = true;
  } else {
    return input;
  }

  if (!items.length) return input;

  // ── Traduction ──────────────────────────────────────────────────────────
  const MAX_TRANSLATIONS = 25;
  const toTranslate = items.slice(0, MAX_TRANSLATIONS);
  const remaining = items.slice(MAX_TRANSLATIONS);

  const translatedBatch = await Promise.all(
    toTranslate.map(async (item) => {
      const result = { ...item };

      // Si des champs spécifiques sont demandés (Convention B)
      if (fieldsToTranslate) {
        for (const field of fieldsToTranslate) {
          if (!item[field]) continue;
          const tr = await translateText(item[field], destLang, { enabled: true, sourceLang: 'en' });
          if (tr.translated) {
            result[`${field}Original`] = item[field];
            result[field] = tr.text;
          }
        }
        return result;
      }

      // Sinon, traduire tous les champs par défaut (Convention A)
      if (item.name) {
        const nameResult = await translateText(item.name, destLang, { enabled: true, sourceLang: 'en' });
        if (nameResult.translated) {
          result.name = nameResult.text;
          result.name_translated = nameResult.text;
        }
      }

      if (item.title) {
        const titleResult = await translateText(item.title, destLang, { enabled: true, sourceLang: 'en' });
        if (titleResult.translated) {
          result.titleOriginal = item.title;
          result.title = titleResult.text;
          result.title_translated = titleResult.text;
        }
      }

      if (item.description) {
        const descResult = await translateText(item.description, destLang, { enabled: true, sourceLang: 'en' });
        if (descResult.translated) {
          result.description = descResult.text;
          result.description_translated = descResult.text;
        }
      }

      if (item.synopsis) {
        const synopsisResult = await translateText(item.synopsis, destLang, { enabled: true, sourceLang: 'en' });
        if (synopsisResult.translated) {
          result.synopsis = synopsisResult.text;
          result.synopsis_translated = synopsisResult.text;
        }
      }

      if (item.about) {
        log.debug(`[Translator] Tentative traduction about (length: ${item.about.length}): "${item.about.substring(0, 50)}..."`);
        const aboutResult = await translateText(item.about, destLang, { enabled: true, sourceLang: 'en' });
        log.debug(`[Translator] Résultat traduction about: translated=${aboutResult.translated}`);
        if (aboutResult.translated) {
          result.about = aboutResult.text;
          result.about_translated = aboutResult.text;
        }
      }

      return result;
    })
  );

  const translatedItems = [...translatedBatch, ...remaining];

  // Retourner dans le même format que l'input
  if (isResponseObject) {
    return { ...input, data: translatedItems };
  }
  return translatedItems;
}
