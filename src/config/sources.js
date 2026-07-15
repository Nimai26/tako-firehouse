/**
 * Configuration - Sources API
 * 
 * Configuration de toutes les sources de données externes
 * Organisée par domaine pour correspondre à l'architecture
 */

// ===========================================
// CONSTRUCTION TOYS
// ===========================================

export const constructionToys = {
  lego: {
    name: 'LEGO',
    graphqlUrl: 'https://www.lego.com/api/graphql/SearchProductsQuery',
    baseUrl: 'https://www.lego.com',
    requiresFsr: true,  // Cloudflare
    defaultMax: 20,
    maxLimit: 100
  },
  
  playmobil: {
    name: 'Playmobil',
    baseUrl: 'https://www.playmobil.com',
    requiresFsr: true,
    defaultMax: 24,
    maxLimit: 100
  },
  
  klickypedia: {
    name: 'Klickypedia',
    baseUrl: 'https://www.klickypedia.com',
    defaultMax: 24,
    maxLimit: 100
  },
  
  mega: {
    name: 'Mega Construx',
    apis: {
      us: {
        url: 'https://ck4bj7.a.searchspring.io/api/search/search.json',
        siteId: 'ck4bj7',
        baseUrl: 'https://shop.mattel.com'
      },
      eu: {
        url: 'https://0w0shw.a.searchspring.io/api/search/search.json',
        siteId: '0w0shw',
        baseUrl: 'https://shopping.mattel.com'
      }
    },
    defaultMax: 20,
    maxLimit: 100,
    defaultLang: 'fr-FR'
  },
  
  rebrickable: {
    name: 'Rebrickable',
    baseUrl: 'https://rebrickable.com/api/v3',
    apiKeyEnv: 'REBRICKABLE_API_KEY',  // Clé stockée dans .env
    defaultMax: 100,
    maxLimit: 1000
  }
};

// ===========================================
// BOOKS
// ===========================================

export const books = {
  googleBooks: {
    name: 'Google Books',
    baseUrl: 'https://www.googleapis.com/books/v1',
    apiKeyEnv: 'GOOGLE_BOOKS_API_KEY',  // Optionnel, augmente les quotas
    defaultMax: 20,
    maxLimit: 40
  },
  
  openLibrary: {
    name: 'OpenLibrary',
    baseUrl: 'https://openlibrary.org',
    defaultMax: 20,
    maxLimit: 100
  }
};

// ===========================================
// GAMES (Jeux vidéo)
// ===========================================

export const games = {
  rawg: {
    name: 'RAWG',
    baseUrl: 'https://api.rawg.io/api',
    apiKeyEnv: 'RAWG_API_KEY',
    defaultMax: 20,
    maxLimit: 40
  },
  
  igdb: {
    name: 'IGDB',
    baseUrl: 'https://api.igdb.com/v4',
    authUrl: 'https://id.twitch.tv/oauth2/token',
    clientIdEnv: 'IGDB_CLIENT_ID',
    clientSecretEnv: 'IGDB_CLIENT_SECRET',
    defaultMax: 20,
    maxLimit: 500
  },
  
  jeuxvideo: {
    name: 'JeuxVideo.com',
    baseUrl: 'https://www.jeuxvideo.com',
    requiresFsr: true,  // Scraping
    defaultMax: 20
  }
};

// ===========================================
// MEDIA (Films & Séries)
// ===========================================

export const media = {
  tmdb: {
    name: 'TMDB',
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p',
    apiKeyEnv: 'TMDB_API_KEY',
    defaultMax: 20,
    maxLimit: 20
  },
  
  tvdb: {
    name: 'TVDB',
    baseUrl: 'https://api4.thetvdb.com/v4',
    apiKeyEnv: 'TVDB_API_KEY',
    defaultMax: 20,
    maxLimit: 100
  },
  
  imdb: {
    name: 'IMDB',
    baseUrl: 'https://api.imdbapi.dev',
    defaultMax: 20,
    maxLimit: 50
  }
};

// ===========================================
// ANIME & MANGA
// ===========================================

export const animeManga = {
  jikan: {
    name: 'Jikan (MyAnimeList)',
    baseUrl: 'https://api.jikan.moe/v4',
    defaultMax: 25,
    maxLimit: 25,
    rateLimit: 3  // req/sec
  },
  
  mangadex: {
    name: 'MangaDex',
    baseUrl: 'https://api.mangadex.org',
    coversUrl: 'https://uploads.mangadex.org/covers',
    defaultMax: 20,
    maxLimit: 100
  }
};

// ===========================================
// COMICS & BD
// ===========================================

export const comics = {
  comicvine: {
    name: 'Comic Vine',
    baseUrl: 'https://comicvine.gamespot.com/api',
    apiKeyEnv: 'COMICVINE_API_KEY',
    defaultMax: 20,
    maxLimit: 100
  },
  
  bedetheque: {
    name: 'Bedetheque',
    baseUrl: 'https://www.bedetheque.com',
    requiresFsr: true,  // Scraping
    defaultMax: 20
  }
};

// ===========================================
// TCG (Trading Card Games)
// ===========================================

export const tcg = {
  pokemon: {
    name: 'Pokémon TCG',
    officialUrl: 'https://www.pokemon.com',
    tcgApiUrl: 'https://api.pokemontcg.io/v2',
    defaultMax: 20
  },
  
  mtg: {
    name: 'Magic: The Gathering',
    scryfallUrl: 'https://api.scryfall.com',
    defaultMax: 20
  },
  
  yugioh: {
    name: 'Yu-Gi-Oh!',
    baseUrl: 'https://db.ygoprodeck.com/api/v7',
    defaultMax: 20
  },
  
  lorcana: {
    name: 'Disney Lorcana',
    baseUrl: 'https://api.lorcana-api.com',
    defaultMax: 20
  },
  
  digimon: {
    name: 'Digimon TCG',
    baseUrl: 'https://digimoncard.io/api-public',
    defaultMax: 20
  },
  
  onepiece: {
    name: 'One Piece TCG',
    baseUrl: 'https://onepiece-cardgame.com',
    requiresFsr: true,
    defaultMax: 20
  }
};

// ===========================================
// COLLECTIBLES
// ===========================================

export const collectibles = {
  coleka: {
    name: 'Coleka',
    baseUrl: 'https://www.coleka.com',
    defaultMax: 24
  },
  
  luluberlu: {
    name: 'Lulu-Berlu',
    baseUrl: 'https://www.lulu-berlu.com',
    searchUrl: 'https://www.lulu-berlu.com/dhtml/resultat_recherche.php',
    defaultMax: 24
  },
  
  consolevariations: {
    name: 'ConsoleVariations',
    baseUrl: 'https://consolevariations.com',
    cdnUrl: 'https://cdn.consolevariations.com',
    requiresFsr: true,
    defaultMax: 20
  },
  
  transformerland: {
    name: 'Transformerland',
    baseUrl: 'https://www.transformerland.com',
    searchUrl: 'https://www.transformerland.com/show_parent_g12.php',
    defaultMax: 50
  },
  
  paninimania: {
    name: 'Paninimania',
    baseUrl: 'https://www.paninimania.com',
    defaultMax: 20
  },
  
  carddass: {
    name: 'Carddass (animecollection.fr)',
    baseUrl: 'http://www.animecollection.fr',
    dataSource: 'database',
    storage: 'carddass-archive',
    defaultMax: 50,
    description: 'Archive complète de cartes Carddass japonaises (~31,685 cartes)',
    hierarchy: ['licenses', 'collections', 'series', 'cards']
  }
};

// ===========================================
// MUSIC
// ===========================================

export const music = {
  musicbrainz: {
    name: 'MusicBrainz',
    baseUrl: 'https://musicbrainz.org/ws/2',
    coverUrl: 'https://coverartarchive.org',
    defaultMax: 20
  },
  
  deezer: {
    name: 'Deezer',
    baseUrl: 'https://api.deezer.com',
    defaultMax: 20
  },
  
  itunes: {
    name: 'iTunes',
    baseUrl: 'https://itunes.apple.com',
    defaultMax: 20
  },
  
  discogs: {
    name: 'Discogs',
    baseUrl: 'https://api.discogs.com',
    apiKeyEnv: 'DISCOGS_TOKEN',
    defaultMax: 20
  }
};

// ===========================================
// ECOMMERCE
// ===========================================

export const ecommerce = {
  amazon: {
    name: 'Amazon',
    marketplaces: {
      fr: 'https://www.amazon.fr',
      us: 'https://www.amazon.com',
      uk: 'https://www.amazon.co.uk',
      de: 'https://www.amazon.de',
      es: 'https://www.amazon.es',
      it: 'https://www.amazon.it',
      jp: 'https://www.amazon.co.jp',
      ca: 'https://www.amazon.ca'
    },
    requiresVpn: true,  // Puppeteer via VPN
    defaultMax: 20,
    cacheTtl: 600000  // 10 min (prix volatiles)
  }
};

// ===========================================
// BOARD GAMES
// ===========================================

export const boardGames = {
  bgg: {
    name: 'BoardGameGeek',
    apiUrl: 'https://boardgamegeek.com/xmlapi2',
    baseUrl: 'https://boardgamegeek.com',
    defaultMax: 20,
    maxLimit: 100,
    rateLimitMs: 1000  // 1 req/sec
  }
};

// ===========================================
// BARCODE / IDENTIFICATION
// ===========================================

export const barcode = {
  upcitemdb: {
    name: 'UPCitemdb',
    baseUrl: 'https://api.upcitemdb.com/prod/trial/lookup'
  },
  
  openfoodfacts: {
    name: 'OpenFoodFacts',
    baseUrl: 'https://world.openfoodfacts.org/api/v2/product'
  }
};

// ===========================================
// Export centralisé
// ===========================================

export const sources = {
  constructionToys,
  books,
  games,
  media,
  animeManga,
  comics,
  tcg,
  collectibles,
  music,
  ecommerce,
  boardGames,
  barcode
};
