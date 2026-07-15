/**
 * Core Schemas - Content Types
 * 
 * Schémas Zod pour les types de contenu normalisés.
 * 
 * ARCHITECTURE DE NORMALISATION :
 * ==============================
 * 
 * Toutes les réponses suivent le même schéma :
 * 
 * {
 *   // ═══════════════════════════════════════════════════════
 *   // NOYAU COMMUN (OBLIGATOIRE - identique pour tous)
 *   // ═══════════════════════════════════════════════════════
 *   "id": "string",              // ID unique Tako (format: {source}:{sourceId})
 *   "type": "string",            // Type de contenu (construct_toy, book, game, etc.)
 *   "source": "string",          // Provider d'origine (brickset, rebrickable, etc.)
 *   "sourceId": "string",        // ID original chez le provider
 *   
 *   "title": "string",           // Titre principal (localisé si possible)
 *   "titleOriginal": "string?",  // Titre original (si différent)
 *   
 *   "description": "string?",    // Description/résumé
 *   "year": number | null,       // Année de sortie/publication
 *   
 *   "images": {
 *     "primary": "url?",         // Image principale
 *     "thumbnail": "url?",       // Miniature
 *     "gallery": ["url"]         // Galerie d'images
 *   },
 *   
 *   "urls": {
 *     "source": "url?",          // Lien vers la source originale
 *     "detail": "string"         // Endpoint Tako pour les détails
 *   },
 *   
 *   // ═══════════════════════════════════════════════════════
 *   // EXTENSIONS SPÉCIFIQUES AU DOMAINE
 *   // ═══════════════════════════════════════════════════════
 *   "details": {
 *     // Contenu variable selon le type/domaine
 *     // Ex pour construct_toy: brand, theme, pieceCount, minifigs...
 *     // Ex pour book: authors, publisher, isbn, pageCount...
 *   },
 *   
 *   // ═══════════════════════════════════════════════════════
 *   // DONNÉES BRUTES DU PROVIDER (optionnel, pour debug)
 *   // ═══════════════════════════════════════════════════════
 *   "_raw": { ... }  // Données originales non transformées (mode debug uniquement)
 * }
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// SCHÉMA D'IMAGES (commun à tous)
// ═══════════════════════════════════════════════════════════════════════════════

export const imagesSchema = z.object({
  primary: z.string().url().nullable().optional(),
  thumbnail: z.string().url().nullable().optional(),
  gallery: z.array(z.string().url()).default([])
}).default({
  primary: null,
  thumbnail: null,
  gallery: []
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHÉMA D'URLs (commun à tous)
// ═══════════════════════════════════════════════════════════════════════════════

export const urlsSchema = z.object({
  source: z.string().url().nullable().optional(),
  detail: z.string()
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOYAU COMMUN - BASE OBLIGATOIRE POUR TOUS LES ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

export const coreItemSchema = z.object({
  // Identification unique
  id: z.string(),                              // Format: {source}:{sourceId}
  type: z.string(),                            // Type de contenu
  source: z.string(),                          // Provider d'origine
  sourceId: z.string(),                        // ID chez le provider
  
  // Titres
  title: z.string(),                           // Titre principal (localisé)
  titleOriginal: z.string().nullable(),        // Titre original
  
  // Description et année
  description: z.string().nullable(),
  year: z.number().nullable(),
  
  // Médias et liens
  images: imagesSchema,
  urls: urlsSchema
});

/**
 * Crée un schéma complet avec le noyau + extensions spécifiques
 * @param {z.ZodObject} detailsSchema - Schéma des détails spécifiques
 */
export function createItemSchema(detailsSchema) {
  return coreItemSchema.extend({
    details: detailsSchema,
    _raw: z.any().optional()  // Données brutes (debug)
  });
}

// LEGACY baseItemSchema supprimé — seul coreItemSchema + createItemSchema subsistent

// ═══════════════════════════════════════════════════════════════════════════════
// DÉTAILS PAR DOMAINE - Schémas spécifiques pour la propriété "details"
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCT_TOY - LEGO, Playmobil, Mega Construx, etc.
// ─────────────────────────────────────────────────────────────────────────────

export const constructToyDetailsSchema = z.object({
  // Marque et classification
  brand: z.string(),                           // LEGO, Playmobil, Mega Construx...
  theme: z.string().nullable(),                // Star Wars, City, Friends...
  subtheme: z.string().nullable(),             // Episode IV, Police...
  category: z.string().nullable(),             // Normal, Gear, Books, etc.
  
  // Spécifications produit
  setNumber: z.string().nullable(),            // Numéro du set (ex: 75192)
  pieceCount: z.number().nullable(),           // Nombre de pièces
  minifigCount: z.number().nullable(),         // Nombre de minifigs
  
  // Âge recommandé
  ageRange: z.object({
    min: z.number().nullable(),
    max: z.number().nullable()
  }).nullable(),
  
  // Dimensions du produit assemblé
  dimensions: z.object({
    height: z.number().nullable(),             // cm
    width: z.number().nullable(),              // cm
    depth: z.number().nullable()               // cm
  }).nullable(),
  
  // Prix (MSRP)
  price: z.object({
    amount: z.number(),
    currency: z.string()                       // EUR, USD, GBP...
  }).nullable(),
  
  // Disponibilité et dates
  availability: z.enum([
    'available', 'retired', 'coming_soon', 
    'out_of_stock', 'exclusive', 'unknown'
  ]).default('unknown'),
  releaseDate: z.string().nullable(),          // ISO date
  retirementDate: z.string().nullable(),       // ISO date
  
  // Instructions / Manuels de montage
  instructionsUrl: z.string().url().nullable(),
  instructions: z.object({
    count: z.number().default(0),
    manuals: z.array(z.object({
      id: z.string().nullable(),
      description: z.string().nullable(),
      pdfUrl: z.string().url(),
      sequence: z.number().nullable()
    })).default([]),
    url: z.string().url().nullable()
  }).nullable(),
  
  // Identifiants supplémentaires
  barcodes: z.object({
    upc: z.string().nullable(),
    ean: z.string().nullable()
  }).nullable(),
  
  // Ratings/Reviews (si disponible)
  rating: z.object({
    average: z.number().nullable(),            // 0-5
    count: z.number().nullable()
  }).nullable(),
  
  // Vidéos (promotionnelles, instructions, etc.)
  videos: z.array(z.string().url()).default([])
});

export const constructToySchema = createItemSchema(constructToyDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// BOOK - Livres, BD, Comics, Manga
// ─────────────────────────────────────────────────────────────────────────────

export const bookDetailsSchema = z.object({
  // Auteurs et contributeurs
  authors: z.array(z.string()).default([]),
  illustrators: z.array(z.string()).default([]),
  translators: z.array(z.string()).default([]),
  
  // Édition
  publisher: z.string().nullable(),
  imprint: z.string().nullable(),              // Collection/marque éditoriale
  edition: z.string().nullable(),              // "First Edition", "Collector"...
  
  // Identifiants
  isbn10: z.string().nullable(),
  isbn13: z.string().nullable(),
  asin: z.string().nullable(),
  
  // Format physique
  format: z.enum([
    'hardcover', 'paperback', 'ebook', 
    'audiobook', 'comic', 'manga', 'graphic_novel', 'unknown'
  ]).default('unknown'),
  pageCount: z.number().nullable(),
  
  // Langue et traduction
  language: z.string().nullable(),             // Code ISO (fr, en, ja...)
  originalLanguage: z.string().nullable(),
  
  // Classification
  genres: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  
  // Série/Collection
  series: z.object({
    name: z.string(),
    volume: z.number().nullable(),
    totalVolumes: z.number().nullable()
  }).nullable(),
  
  // Dates
  publicationDate: z.string().nullable(),
  originalPublicationDate: z.string().nullable(),
  
  // Ratings
  rating: z.object({
    average: z.number().nullable(),
    count: z.number().nullable()
  }).nullable()
});

export const bookSchema = createItemSchema(bookDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// VIDEOGAME - Jeux vidéo
// ─────────────────────────────────────────────────────────────────────────────

export const videogameDetailsSchema = z.object({
  // Studios
  developers: z.array(z.string()).default([]),
  publishers: z.array(z.string()).default([]),
  
  // Plateformes
  platforms: z.array(z.string()).default([]),  // PC, PS5, Switch...
  
  // Classification
  genres: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  
  // Dates
  releaseDate: z.string().nullable(),
  releaseDates: z.record(z.string(), z.string()).optional(), // Par plateforme
  
  // Ratings officiels
  esrb: z.string().nullable(),                 // E, T, M...
  pegi: z.number().nullable(),                 // 3, 7, 12, 16, 18
  
  // Scores/Reviews
  rating: z.object({
    metacritic: z.number().nullable(),         // 0-100
    userScore: z.number().nullable(),          // 0-10
    count: z.number().nullable()
  }).nullable(),
  
  // Multijoueur
  multiplayer: z.object({
    local: z.boolean().nullable(),
    online: z.boolean().nullable(),
    maxPlayers: z.number().nullable()
  }).nullable(),
  
  // DLC/Éditions
  dlc: z.array(z.string()).default([]),
  edition: z.string().nullable()               // Standard, Deluxe, GOTY...
});

export const videogameSchema = createItemSchema(videogameDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// MOVIE - Films
// ─────────────────────────────────────────────────────────────────────────────

export const movieDetailsSchema = z.object({
  // Équipe
  directors: z.array(z.string()).default([]),
  writers: z.array(z.string()).default([]),
  cast: z.array(z.object({
    name: z.string(),
    character: z.string().nullable(),
    order: z.number().optional()
  })).default([]),
  
  // Production
  studios: z.array(z.string()).default([]),
  productionCountries: z.array(z.string()).default([]),
  budget: z.number().nullable(),
  revenue: z.number().nullable(),
  
  // Classification
  genres: z.array(z.string()).default([]),
  
  // Durée et format
  runtime: z.number().nullable(),              // minutes
  
  // Langue
  originalLanguage: z.string().nullable(),
  spokenLanguages: z.array(z.string()).default([]),
  
  // Dates
  releaseDate: z.string().nullable(),
  theatricalRelease: z.string().nullable(),
  digitalRelease: z.string().nullable(),
  
  // Ratings
  rating: z.object({
    imdb: z.number().nullable(),               // 0-10
    tmdb: z.number().nullable(),               // 0-10
    rottenTomatoes: z.number().nullable(),     // 0-100
    voteCount: z.number().nullable()
  }).nullable(),
  
  // Certification
  certification: z.string().nullable(),        // PG-13, R, etc.
  
  // Appartenance à une franchise
  collection: z.object({
    name: z.string(),
    part: z.number().nullable()
  }).nullable()
});

export const movieSchema = createItemSchema(movieDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// SERIES - Séries TV
// ─────────────────────────────────────────────────────────────────────────────

export const seriesDetailsSchema = z.object({
  // Équipe
  creators: z.array(z.string()).default([]),
  cast: z.array(z.object({
    name: z.string(),
    character: z.string().nullable()
  })).default([]),
  
  // Production
  networks: z.array(z.string()).default([]),   // HBO, Netflix...
  studios: z.array(z.string()).default([]),
  
  // Classification
  genres: z.array(z.string()).default([]),
  
  // Épisodes
  seasonCount: z.number().nullable(),
  episodeCount: z.number().nullable(),
  episodeRuntime: z.number().nullable(),       // minutes par épisode
  
  // Statut
  status: z.enum([
    'returning', 'ended', 'canceled', 
    'in_production', 'planned', 'unknown'
  ]).default('unknown'),
  
  // Dates
  firstAirDate: z.string().nullable(),
  lastAirDate: z.string().nullable(),
  nextEpisodeDate: z.string().nullable(),
  
  // Langue
  originalLanguage: z.string().nullable(),
  
  // Ratings
  rating: z.object({
    imdb: z.number().nullable(),
    tmdb: z.number().nullable(),
    voteCount: z.number().nullable()
  }).nullable()
});

export const seriesSchema = createItemSchema(seriesDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// ANIME - Anime (films et séries)
// ─────────────────────────────────────────────────────────────────────────────

export const animeDetailsSchema = z.object({
  // Type
  mediaType: z.enum(['tv', 'movie', 'ova', 'ona', 'special', 'music', 'unknown']),
  
  // Studio
  studios: z.array(z.string()).default([]),
  
  // Classification
  genres: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),     // Isekai, Mecha, School...
  demographics: z.array(z.string()).default([]), // Shounen, Seinen, Josei...
  
  // Épisodes (pour séries)
  episodeCount: z.number().nullable(),
  episodeDuration: z.number().nullable(),      // minutes
  
  // Statut
  status: z.enum([
    'airing', 'finished', 'upcoming', 'unknown'
  ]).default('unknown'),
  
  // Dates
  airedFrom: z.string().nullable(),
  airedTo: z.string().nullable(),
  season: z.string().nullable(),               // "Winter 2024", "Summer 2023"
  
  // Adaptation
  source: z.enum([
    'manga', 'light_novel', 'visual_novel', 
    'game', 'original', 'web_manga', 'other', 'unknown'
  ]).default('unknown'),
  
  // Ratings
  rating: z.object({
    mal: z.number().nullable(),                // 0-10 MyAnimeList
    anilist: z.number().nullable(),            // 0-100 AniList
    count: z.number().nullable()
  }).nullable(),
  
  // Age rating
  ageRating: z.string().nullable()             // G, PG, PG-13, R, R+, Rx
});

export const animeSchema = createItemSchema(animeDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// MANGA - Manga et Light Novels
// ─────────────────────────────────────────────────────────────────────────────

export const mangaDetailsSchema = z.object({
  // Type
  mediaType: z.enum([
    'manga', 'light_novel', 'manhwa', 
    'manhua', 'one_shot', 'doujinshi', 'unknown'
  ]),
  
  // Auteurs
  authors: z.array(z.object({
    name: z.string(),
    role: z.enum(['author', 'artist', 'both']).default('both')
  })).default([]),
  
  // Publication
  serialization: z.string().nullable(),        // Magazine de publication
  
  // Classification
  genres: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  demographics: z.array(z.string()).default([]),
  
  // Volumes/Chapitres
  volumeCount: z.number().nullable(),
  chapterCount: z.number().nullable(),
  
  // Statut
  status: z.enum([
    'publishing', 'finished', 'hiatus', 
    'discontinued', 'upcoming', 'unknown'
  ]).default('unknown'),
  
  // Dates
  publishedFrom: z.string().nullable(),
  publishedTo: z.string().nullable(),
  
  // Ratings
  rating: z.object({
    mal: z.number().nullable(),
    anilist: z.number().nullable(),
    count: z.number().nullable()
  }).nullable()
});

export const mangaSchema = createItemSchema(mangaDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// TCG_CARD - Cartes à collectionner (Pokémon, Magic, Yu-Gi-Oh, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export const tcgCardDetailsSchema = z.object({
  // Jeu de cartes
  game: z.string(),                            // pokemon, magic, yugioh, onepiece...
  
  // Set/Extension
  set: z.object({
    name: z.string(),
    code: z.string().nullable(),
    series: z.string().nullable(),
    releaseDate: z.string().nullable()
  }),
  
  // Position dans le set
  number: z.string().nullable(),               // "025/198"
  totalInSet: z.number().nullable(),
  
  // Rareté et finition
  rarity: z.string().nullable(),               // Common, Rare, Ultra Rare...
  finish: z.array(z.string()).default([]),     // Holofoil, Reverse Holo...
  
  // Caractéristiques de jeu (varient selon le TCG)
  attributes: z.record(z.string(), z.any()).optional(),
  
  // Artiste
  artist: z.string().nullable(),
  
  // Prix marché
  prices: z.object({
    market: z.number().nullable(),
    low: z.number().nullable(),
    mid: z.number().nullable(),
    high: z.number().nullable(),
    currency: z.string().default('USD'),
    lastUpdated: z.string().nullable()
  }).nullable(),
  
  // Légalité (pour les jeux compétitifs)
  legality: z.record(z.string(), z.enum([
    'legal', 'banned', 'restricted', 'not_legal'
  ])).optional()
});

export const tcgCardSchema = createItemSchema(tcgCardDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// BOARD_GAME - Jeux de société
// ─────────────────────────────────────────────────────────────────────────────

export const boardGameDetailsSchema = z.object({
  // Designers et artistes
  designers: z.array(z.string()).default([]),
  artists: z.array(z.string()).default([]),
  publishers: z.array(z.string()).default([]),
  
  // Joueurs
  players: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    recommended: z.number().nullable()
  }).nullable(),
  
  // Durée de partie
  playingTime: z.object({
    min: z.number().nullable(),                // minutes
    max: z.number().nullable()
  }).nullable(),
  
  // Âge et complexité
  minAge: z.number().nullable(),
  complexity: z.number().nullable(),           // 1-5 (BGG weight)
  
  // Classification
  categories: z.array(z.string()).default([]), // Strategy, Family, Party...
  mechanics: z.array(z.string()).default([]),  // Deck Building, Worker Placement...
  
  // Ratings
  rating: z.object({
    bgg: z.number().nullable(),                // 0-10 BoardGameGeek
    count: z.number().nullable(),
    rank: z.number().nullable()                // Classement BGG
  }).nullable(),
  
  // Extensions et versions
  isExpansion: z.boolean().default(false),
  baseGame: z.string().nullable(),             // Si expansion, ID du jeu de base
  expansions: z.array(z.string()).default([])  // IDs des extensions
});

export const boardGameSchema = createItemSchema(boardGameDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// MUSIC - Albums et morceaux
// ─────────────────────────────────────────────────────────────────────────────

export const musicDetailsSchema = z.object({
  // Type
  mediaType: z.enum(['album', 'single', 'ep', 'compilation', 'soundtrack', 'unknown']),
  
  // Artistes
  artists: z.array(z.object({
    name: z.string(),
    role: z.string().optional()                // Main, Featured, Producer...
  })).default([]),
  
  // Label
  label: z.string().nullable(),
  
  // Classification
  genres: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  
  // Pistes (pour albums)
  trackCount: z.number().nullable(),
  totalDuration: z.number().nullable(),        // secondes
  tracks: z.array(z.object({
    position: z.number(),
    title: z.string(),
    duration: z.number().nullable()
  })).optional(),
  
  // Identifiants
  barcode: z.string().nullable(),
  catalogNumber: z.string().nullable(),
  
  // Dates
  releaseDate: z.string().nullable(),
  
  // Ratings
  rating: z.object({
    average: z.number().nullable(),
    count: z.number().nullable()
  }).nullable()
});

export const musicSchema = createItemSchema(musicDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTIBLE - Figurines, objets de collection
// ─────────────────────────────────────────────────────────────────────────────

export const collectibleDetailsSchema = z.object({
  // Type de collectible
  category: z.string(),                        // Figure, Statue, Plush, Prop Replica...
  
  // Fabricant
  manufacturer: z.string().nullable(),
  brand: z.string().nullable(),                // Funko, Hot Toys, Bandai...
  series: z.string().nullable(),               // Pop!, S.H. Figuarts...
  
  // Franchise/Licence
  franchise: z.string().nullable(),
  character: z.string().nullable(),
  
  // Spécifications
  scale: z.string().nullable(),                // 1:6, 1:12, etc.
  material: z.array(z.string()).default([]),   // PVC, ABS, Die-cast...
  dimensions: z.object({
    height: z.number().nullable(),
    width: z.number().nullable(),
    depth: z.number().nullable()
  }).nullable(),
  
  // Édition
  edition: z.string().nullable(),              // Standard, Exclusive, Limited...
  limitedTo: z.number().nullable(),            // Nombre d'exemplaires
  
  // Prix
  price: z.object({
    msrp: z.number().nullable(),
    currency: z.string().default('USD')
  }).nullable(),
  
  // Disponibilité
  availability: z.enum([
    'available', 'preorder', 'sold_out', 
    'exclusive', 'discontinued', 'unknown'
  ]).default('unknown'),
  releaseDate: z.string().nullable()
});

export const collectibleSchema = createItemSchema(collectibleDetailsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT - Produits e-commerce génériques
// ─────────────────────────────────────────────────────────────────────────────

export const productDetailsSchema = z.object({
  // Vendeur/Marque
  brand: z.string().nullable(),
  seller: z.string().nullable(),
  
  // Catégories
  categories: z.array(z.string()).default([]),
  
  // Prix
  price: z.object({
    current: z.number(),
    original: z.number().nullable(),           // Si en promo
    currency: z.string().default('EUR')
  }),
  
  // Disponibilité
  availability: z.enum([
    'in_stock', 'out_of_stock', 
    'preorder', 'unknown'
  ]).default('unknown'),
  stock: z.number().nullable(),
  
  // Condition
  condition: z.enum([
    'new', 'like_new', 'very_good', 
    'good', 'acceptable', 'unknown'
  ]).default('unknown'),
  
  // Expédition
  shipping: z.object({
    price: z.number().nullable(),
    freeAbove: z.number().nullable(),
    estimatedDays: z.number().nullable()
  }).nullable(),
  
  // Ratings
  rating: z.object({
    average: z.number().nullable(),
    count: z.number().nullable()
  }).nullable(),
  
  // Variantes
  variants: z.array(z.object({
    name: z.string(),
    options: z.array(z.string())
  })).optional()
});

export const productSchema = createItemSchema(productDetailsSchema);

// ═══════════════════════════════════════════════════════════════════════════════
// INDEX DES SCHÉMAS PAR TYPE
// ═══════════════════════════════════════════════════════════════════════════════

export const detailSchemasByType = {
  construct_toy: constructToyDetailsSchema,
  book: bookDetailsSchema,
  videogame: videogameDetailsSchema,
  movie: movieDetailsSchema,
  series: seriesDetailsSchema,
  anime: animeDetailsSchema,
  manga: mangaDetailsSchema,
  tcg_card: tcgCardDetailsSchema,
  board_game: boardGameDetailsSchema,
  music: musicDetailsSchema,
  collectible: collectibleDetailsSchema,
  product: productDetailsSchema
};

export const itemSchemasByType = {
  construct_toy: constructToySchema,
  book: bookSchema,
  videogame: videogameSchema,
  movie: movieSchema,
  series: seriesSchema,
  anime: animeSchema,
  manga: mangaSchema,
  tcg_card: tcgCardSchema,
  board_game: boardGameSchema,
  music: musicSchema,
  collectible: collectibleSchema,
  product: productSchema
};
