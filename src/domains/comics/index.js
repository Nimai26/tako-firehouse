/**
 * Comics Domain
 * 
 * Module principal du domaine des comics et BD.
 * Exporte le router et les providers.
 */

// Router principal
export { default as router } from './routes.js';

// Providers
export { ComicVineProvider } from './providers/comicvine.provider.js';
export { BedethequeProvider } from './providers/bedetheque.provider.js';

// Normalizers
export { ComicVineNormalizer } from './normalizers/comicvine.normalizer.js';
export { BedethequeNormalizer } from './normalizers/bedetheque.normalizer.js';

// Informations du domaine
export const domain = {
  name: 'comics',
  version: '1.0.0',
  description: 'API pour la recherche de comics et BD via différentes sources',
  providers: ['comicvine', 'bedetheque']
};
