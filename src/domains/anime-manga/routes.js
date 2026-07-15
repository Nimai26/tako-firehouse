/**
 * Anime & Manga Domain Routes
 * 
 * Point d'entrée des routes pour le domaine anime et manga.
 * Agrège les sous-routes de chaque provider.
 */

import { Router } from 'express';
import mangaUpdatesRoutes from './routes/mangaupdates.routes.js';
import jikanRoutes from './routes/jikan.routes.js';
import nautiljonRoutes from './routes/nautiljon.routes.js';
import { createAmazonAliasRouter } from '../ecommerce/routes/amazon-alias.factory.js';

const router = Router();

// Informations du domaine
const domainInfo = {
  domain: 'anime-manga',
  version: '1.1.0',
  description: 'API pour la recherche de manga, manhwa, manhua et anime via différentes sources',
  providers: [
    {
      name: 'mangaupdates',
      path: '/mangaupdates',
      description: 'MangaUpdates API - Base de données manga/manhwa/manhua complète',
      requiresKey: false,
      rateLimit: 'Raisonnable (non documenté)',
      features: [
        'Recherche séries avec filtres (type, année, genres)',
        'Détails complets (auteurs, éditeurs, genres, catégories)',
        'Informations auteurs avec leurs œuvres',
        'Recommandations de séries similaires',
        'Pas de filtre sur le contenu adulte',
        'Enrichissement avec titres français (Nautiljon)',
        'Traduction automatique des descriptions'
      ],
      types: ['Manga', 'Manhwa', 'Manhua', 'Novel', 'Light Novel', 'Doujinshi', 'Artbook', 'OEL']
    },
    {
      name: 'jikan',
      path: '/jikan',
      description: 'Jikan API (MyAnimeList) - Base de données anime et manga',
      requiresKey: false,
      rateLimit: '3 requêtes/seconde, 60 requêtes/minute',
      features: [
        'Recherche anime/manga SANS restriction adulte/hentai',
        'Détails complets avec épisodes, personnages, staff',
        'Saisons anime par année',
        'Top anime/manga (classements)',
        'Programme de diffusion hebdomadaire',
        'Informations studios/producteurs',
        'Recommandations',
        'Traduction automatique des descriptions'
      ],
      types: ['TV', 'Movie', 'OVA', 'Special', 'ONA', 'Music', 'Manga', 'Novel', 'Light Novel', 'Oneshot', 'Doujin', 'Manhwa', 'Manhua'],
      note: 'Contenu adulte/hentai NON filtré (sfw=false)'
    },
    {
      name: 'nautiljon',
      path: '/nautiljon',
      description: 'Nautiljon - Base de données manga française avec détails par volume',
      requiresKey: false,
      rateLimit: '1 requête/seconde',
      features: [
        'Recherche de mangas',
        'Détails séries avec liste de volumes',
        'Détails par volume (ISBN, pages, prix, chapitres)',
        'Couvertures FR et JP',
        'Dates de sortie FR et VO',
        'Éditeurs FR et VO',
        'Synopsis en français'
      ],
      types: ['Manga'],
      note: 'Données en français (source Nautiljon.com), scraping HTML'
    }
  ]
};

/**
 * GET /
 * Informations sur le domaine anime-manga
 */
router.get('/', (req, res) => {
  const mangaUpdatesRoutes = [
    { method: 'GET', path: '/health', description: 'Health check' },
    { method: 'GET', path: '/search', description: 'Recherche de séries manga' },
    { method: 'GET', path: '/search/authors', description: 'Rechercher des auteurs' },
    { method: 'GET', path: '/search/publishers', description: 'Rechercher des éditeurs' },
    { method: 'GET', path: '/series/:id', description: 'Détails d\'une série' },
    { method: 'GET', path: '/series/:id/recommendations', description: 'Recommandations' },
    { method: 'GET', path: '/author/:id', description: 'Détails d\'un auteur' },
    { method: 'GET', path: '/author/:id/works', description: 'Œuvres d\'un auteur' },
    { method: 'GET', path: '/publisher/:id', description: 'Détails d\'un éditeur' },
    { method: 'GET', path: '/genres', description: 'Liste des genres' },
    { method: 'GET', path: '/releases', description: 'Dernières sorties' }
  ];

  const jikanRoutesInfo = [
    { method: 'GET', path: '/health', description: 'Health check' },
    { method: 'GET', path: '/search', description: 'Recherche globale (anime + manga)' },
    { method: 'GET', path: '/search/anime', description: 'Recherche anime' },
    { method: 'GET', path: '/search/manga', description: 'Recherche manga' },
    { method: 'GET', path: '/search/characters', description: 'Recherche personnages' },
    { method: 'GET', path: '/search/people', description: 'Recherche personnes (seiyuu, staff)' },
    { method: 'GET', path: '/search/producers', description: 'Recherche studios/producteurs' },
    { method: 'GET', path: '/anime/:id', description: 'Détails d\'un anime' },
    { method: 'GET', path: '/anime/:id/episodes', description: 'Épisodes d\'un anime' },
    { method: 'GET', path: '/anime/:id/characters', description: 'Personnages d\'un anime' },
    { method: 'GET', path: '/anime/:id/staff', description: 'Staff d\'un anime' },
    { method: 'GET', path: '/anime/:id/recommendations', description: 'Recommandations anime' },
    { method: 'GET', path: '/anime/random', description: 'Anime aléatoire' },
    { method: 'GET', path: '/manga/:id', description: 'Détails d\'un manga' },
    { method: 'GET', path: '/manga/:id/characters', description: 'Personnages d\'un manga' },
    { method: 'GET', path: '/manga/:id/recommendations', description: 'Recommandations manga' },
    { method: 'GET', path: '/manga/random', description: 'Manga aléatoire' },
    { method: 'GET', path: '/seasons', description: 'Liste des saisons' },
    { method: 'GET', path: '/seasons/now', description: 'Saison actuelle' },
    { method: 'GET', path: '/seasons/:year/:season', description: 'Anime d\'une saison' },
    { method: 'GET', path: '/top/anime', description: 'Top anime' },
    { method: 'GET', path: '/top/manga', description: 'Top manga' },
    { method: 'GET', path: '/schedules', description: 'Programme de diffusion' },
    { method: 'GET', path: '/schedules/:day', description: 'Programme d\'un jour' },
    { method: 'GET', path: '/genres/anime', description: 'Genres anime' },
    { method: 'GET', path: '/genres/manga', description: 'Genres manga' },
    { method: 'GET', path: '/characters/:id', description: 'Détails d\'un personnage' },
    { method: 'GET', path: '/people/:id', description: 'Détails d\'une personne' },
    { method: 'GET', path: '/producers/:id', description: 'Détails d\'un studio' }
  ];

  const nautiljonRoutesInfo = [
    { method: 'GET', path: '/health', description: 'Health check' },
    { method: 'GET', path: '/search', description: 'Recherche de mangas (séries)' },
    { method: 'GET', path: '/search/volumes', description: 'Recherche → liste de volumes directe' },
    { method: 'GET', path: '/series/:slug', description: 'Détails d\'une série' },
    { method: 'GET', path: '/series/:slug/volumes', description: 'Liste des volumes' },
    { method: 'GET', path: '/series/:slug/volume/:volumeId', description: 'Détails d\'un volume' }
  ];

  const routesByProvider = {
    mangaupdates: mangaUpdatesRoutes,
    jikan: jikanRoutesInfo,
    nautiljon: nautiljonRoutesInfo
  };

  res.json({
    status: 'ok',
    ...domainInfo,
    endpoints: domainInfo.providers.map(p => ({
      provider: p.name,
      basePath: `/api/anime-manga${p.path}`,
      routes: routesByProvider[p.name] || []
    })),
    params: {
      search: {
        q: 'Terme de recherche (requis)',
        type: 'Type: Manga, Manhwa, Manhua, Novel, Doujinshi, etc.',
        maxResults: 'Nombre de résultats (max 100, défaut 25)',
        page: 'Numéro de page (défaut 1)',
        year: 'Année de sortie',
        licensed: 'Seulement les séries licenciées (1 ou true)',
        lang: 'Langue cible pour traduction (fr, de, es, it, pt)',
        autoTrad: 'Activer traduction automatique (1 ou true)',
        frenchTitle: 'Enrichir avec titres français via Nautiljon (1 ou true)'
      }
    }
  });
});

// Montage des routes par provider
router.use('/mangaupdates', mangaUpdatesRoutes);
router.use('/jikan', jikanRoutes);
router.use('/nautiljon', nautiljonRoutes);
router.use('/amazon', createAmazonAliasRouter({ domain: 'anime-manga', category: 'books', categoryLabel: 'Livres' }));

export default router;
