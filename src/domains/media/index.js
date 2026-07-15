/**
 * Media Domain
 * 
 * Films, séries TV, saisons, épisodes, collections/sagas
 * 
 * PROVIDERS:
 * - TMDB (The Movie Database)
 * - TVDB (TheTVDB)
 */

import { router } from './routes.js';

export { router };

// Exports nommés pour accès direct
export { TmdbProvider } from './providers/tmdb.provider.js';
export { TvdbProvider } from './providers/tvdb.provider.js';
export { TmdbNormalizer } from './normalizers/tmdb.normalizer.js';
export { TvdbNormalizer } from './normalizers/tvdb.normalizer.js';
