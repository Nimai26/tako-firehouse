/**
 * Books Domain
 * 
 * Module principal du domaine des livres.
 * Exporte le router et les providers.
 */

// Router principal
export { default as router } from './routes.js';

// Providers
export { GoogleBooksProvider } from './providers/googlebooks.provider.js';
export { OpenLibraryProvider } from './providers/openlibrary.provider.js';
export { AbandonwareProvider } from './providers/abandonware.provider.js';

// Normalizers
export { GoogleBooksNormalizer } from './normalizers/googlebooks.normalizer.js';
export { OpenLibraryNormalizer } from './normalizers/openlibrary.normalizer.js';
export { AbandonwareNormalizer } from './normalizers/abandonware.normalizer.js';

// Informations du domaine
export const domain = {
  name: 'books',
  version: '1.0.0',
  description: 'API pour la recherche de livres via différentes sources',
  providers: ['googlebooks', 'openlibrary', 'abandonware']
};
