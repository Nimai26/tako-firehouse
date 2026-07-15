/**
 * Domain: Anime & Manga
 * 
 * Manga, Manhwa, Manhua, Light Novels et Anime.
 * 
 * Providers:
 * - MangaUpdates: Base de données manga complète (gratuit, pas de clé)
 * - Jikan: MyAnimeList API (anime + manga)
 * - Nautiljon: Base de données manga française avec détails par volume (scraping)
 * 
 * Features:
 * - Recherche multi-types (Manga, Manhwa, Manhua, Novel, etc.)
 * - Détails séries avec auteurs, éditeurs, genres
 * - Détails par volume (ISBN, pages, prix, chapitres, couvertures)
 * - Enrichissement titres français via Nautiljon
 * - Traduction automatique des descriptions
 * - Pas de filtre sur le contenu adulte
 */
export { default as router } from './routes.js';
