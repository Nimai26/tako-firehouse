/**
 * Shared Utils - Export centralisé
 */

export { logger, createLogger } from './logger.js';
export { asyncHandler } from './async-handler.js';
export { sleep, retry, chunk } from './helpers.js';

// Translator exports
export {
  translateText,
  translateFields,
  translateGenre,
  translateGenres,
  translateByCategory,
  translateTermsByCategory,
  translateVideoGameGenres,
  translateMusicGenres,
  translateBookGenres,
  translateBoardGameCategories,
  translateToyCategories,
  translateToEnglish,
  translateSearchDescriptions,
  translateSearchResults,
  isAutoTradEnabled,
  extractLangCode
} from './translator.js';

// Genre dictionaries exports
export {
  MEDIA_GENRES,
  VIDEOGAME_GENRES,
  MUSIC_GENRES,
  BOOK_GENRES,
  BOARDGAME_GENRES,
  TOY_CATEGORIES,
  ALL_DICTIONARIES,
  lookupInDictionary,
  lookupInAllDictionaries
} from './genre-dictionaries.js';
