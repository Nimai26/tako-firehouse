/**
 * Music Domain
 * 
 * APIs de musique - Albums, artistes, tracks
 * 
 * Providers:
 * - Discogs: Base de données vinyle/CD
 * - Deezer: Streaming musical
 * - MusicBrainz: Base de données libre
 * - iTunes: Catalogue Apple Music
 * 
 * @module domains/music
 */

import router from './routes.js';

// Export des providers
export * as discogsProvider from './providers/discogs.provider.js';
export * as deezerProvider from './providers/deezer.provider.js';
export * as musicbrainzProvider from './providers/musicbrainz.provider.js';
export * as itunesProvider from './providers/itunes.provider.js';

// Export des normalizers
export * as discogsNormalizer from './normalizers/discogs.normalizer.js';
export * as deezerNormalizer from './normalizers/deezer.normalizer.js';
export * as musicbrainzNormalizer from './normalizers/musicbrainz.normalizer.js';
export * as itunesNormalizer from './normalizers/itunes.normalizer.js';

// Export du router
export { router };
