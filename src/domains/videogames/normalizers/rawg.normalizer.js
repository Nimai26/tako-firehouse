/**
 * Normalizer RAWG — Format Canonique B
 *
 * Transforme les données RAWG en format Tako standardisé.
 * La traduction est gérée au niveau des routes, pas ici.
 *
 * @module domains/videogames/normalizers/rawg
 */

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrait l'année depuis une date string (YYYY-MM-DD)
 */
function yearFromDateStr(dateStr) {
  if (!dateStr) return null;
  const y = parseInt(dateStr.split('-')[0], 10);
  return Number.isNaN(y) ? null : y;
}

// ============================================================================
// ITEM NORMALIZERS
// ============================================================================

/**
 * Normalise un jeu depuis les résultats de recherche RAWG
 */
export function normalizeSearchResult(game) {
  const sourceId = String(game.id);

  return {
    id: `rawg:${sourceId}`,
    type: 'videogame',
    source: 'rawg',
    sourceId,
    title: game.name,
    titleOriginal: null,
    description: null,
    year: yearFromDateStr(game.released),
    images: {
      primary: game.background_image || null,
      thumbnail: game.background_image || null,
      gallery: game.short_screenshots?.map(s => s.image).filter(Boolean) || []
    },
    urls: {
      source: game.slug ? `https://rawg.io/games/${game.slug}` : null,
      detail: `/api/videogames/rawg/game/${sourceId}`
    },
    details: {
      slug: game.slug || null,
      releaseDate: game.released || null,
      rating: game.rating ? Math.round(game.rating * 20) / 10 : null,
      ratingTop: game.rating_top || 5,
      ratingsCount: game.ratings_count || 0,
      metacritic: game.metacritic || null,
      playtime: game.playtime || null,
      platforms: game.platforms?.map(p => p.platform?.name || p.name) || [],
      genres: game.genres?.map(g => g.name || g) || [],
      stores: game.stores?.map(s => s.store?.name || s.name) || [],
      tags: game.tags?.slice(0, 10).map(t => t.name || t) || [],
      esrbRating: game.esrb_rating?.name || null,
      added: game.added || 0,
      updated: game.updated || null
    }
  };
}

/**
 * Normalise un jeu avec tous les détails
 */
export function normalizeGame(game) {
  const sourceId = String(game.id);

  return {
    id: `rawg:${sourceId}`,
    type: 'videogame',
    source: 'rawg',
    sourceId,
    title: game.name,
    titleOriginal: game.name_original || null,
    description: game.description_raw || game.description || null,
    year: yearFromDateStr(game.released),
    images: {
      primary: game.background_image || null,
      thumbnail: game.background_image || null,
      gallery: [game.background_image, game.background_image_additional].filter(Boolean)
    },
    urls: {
      source: game.slug ? `https://rawg.io/games/${game.slug}` : null,
      detail: `/api/videogames/rawg/game/${sourceId}`
    },
    details: {
      // Basic info
      slug: game.slug || null,
      descriptionHtml: game.description || null,

      // Dates
      releaseDate: game.released || null,
      tba: game.tba || false,
      updated: game.updated || null,

      // Ratings
      rating: game.rating ? Math.round(game.rating * 20) / 10 : null,
      ratingTop: game.rating_top || 5,
      ratingsCount: game.ratings_count || 0,
      ratingsBreakdown: game.ratings?.map(r => ({
        id: r.id,
        title: r.title,
        count: r.count,
        percent: r.percent
      })) || [],
      metacritic: game.metacritic || null,
      metacriticUrl: game.metacritic_url || null,
      metacriticPlatforms: game.metacritic_platforms?.map(mp => ({
        platform: mp.platform?.name || mp.platform,
        score: mp.metascore,
        url: mp.url
      })) || [],

      // Statistics
      playtime: game.playtime || null,
      achievementsCount: game.achievements_count || 0,
      reviewsCount: game.reviews_count || 0,
      suggestionsCount: game.suggestions_count || 0,
      added: game.added || 0,
      addedByStatus: game.added_by_status || {},

      // Classification
      esrbRating: game.esrb_rating ? {
        id: game.esrb_rating.id,
        name: game.esrb_rating.name,
        slug: game.esrb_rating.slug
      } : null,

      // Media
      backgroundAdditional: game.background_image_additional || null,
      website: game.website || null,

      // Taxonomy
      genres: game.genres?.map(g => ({
        id: g.id,
        name: g.name,
        slug: g.slug
      })) || [],
      tags: game.tags?.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        language: t.language || 'eng',
        gamesCount: t.games_count || 0
      })) || [],

      // Platforms
      platforms: game.platforms?.map(p => ({
        id: p.platform?.id || p.id,
        name: p.platform?.name || p.name,
        slug: p.platform?.slug || p.slug,
        released: p.released_at || null,
        requirements: p.requirements || null
      })) || [],
      parentPlatforms: game.parent_platforms?.map(p => ({
        id: p.platform?.id || p.id,
        name: p.platform?.name || p.name,
        slug: p.platform?.slug || p.slug
      })) || [],

      // Companies
      developers: game.developers?.map(d => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        gamesCount: d.games_count || 0,
        image: d.image_background || null
      })) || [],
      publishers: game.publishers?.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        gamesCount: p.games_count || 0,
        image: p.image_background || null
      })) || [],

      // Stores
      stores: game.stores?.map(s => ({
        id: s.store?.id || s.id,
        name: s.store?.name || s.name,
        slug: s.store?.slug || s.slug,
        domain: s.store?.domain || s.domain,
        url: s.url || null
      })) || [],

      // Clip
      clip: game.clip ? {
        clip: game.clip.clip,
        preview: game.clip.preview,
        video: game.clip.video
      } : null,

      // Reactions
      reactions: game.reactions || {},

      // Reddit
      redditUrl: game.reddit_url || null,
      redditName: game.reddit_name || null,
      redditDescription: game.reddit_description || null,
      redditLogo: game.reddit_logo || null,
      redditCount: game.reddit_count || 0,

      // Twitch
      twitchCount: game.twitch_count || 0,

      // YouTube
      youtubeCount: game.youtube_count || 0,

      // Misc
      alternativeNames: game.alternative_names || [],
      saturatedColor: game.saturated_color || null,
      dominantColor: game.dominant_color || null
    }
  };
}

// ============================================================================
// ENTITY NORMALIZERS (genres, platforms, companies, etc.)
// ============================================================================

/**
 * Normalise un genre RAWG
 */
export function normalizeGenre(genre) {
  return {
    id: genre.id,
    name: genre.name,
    slug: genre.slug,
    gamesCount: genre.games_count || 0,
    image: genre.image_background || null,
    description: genre.description || null
  };
}

/**
 * Normalise une plateforme RAWG
 */
export function normalizePlatform(platform) {
  return {
    id: platform.id,
    name: platform.name,
    slug: platform.slug,
    gamesCount: platform.games_count || 0,
    image: platform.image_background || null,
    yearStart: platform.year_start || null,
    yearEnd: platform.year_end || null,
    description: platform.description || null
  };
}

/**
 * Normalise un développeur/éditeur
 */
export function normalizeCompany(company) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    gamesCount: company.games_count || 0,
    image: company.image_background || null,
    description: company.description || null,
    games: company.games?.map(g => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      added: g.added || 0
    })) || []
  };
}

/**
 * Normalise un store
 */
export function normalizeStore(store) {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    domain: store.domain || null,
    gamesCount: store.games_count || 0,
    image: store.image_background || null,
    description: store.description || null
  };
}

/**
 * Normalise un tag
 */
export function normalizeTag(tag) {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    language: tag.language || 'eng',
    gamesCount: tag.games_count || 0,
    image: tag.image_background || null,
    description: tag.description || null
  };
}

/**
 * Normalise un créateur
 */
export function normalizeCreator(creator) {
  return {
    id: creator.id,
    name: creator.name,
    slug: creator.slug,
    image: creator.image || null,
    imageBackground: creator.image_background || null,
    gamesCount: creator.games_count || 0,
    positions: creator.positions?.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug
    })) || [],
    games: creator.games?.map(g => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      added: g.added || 0
    })) || []
  };
}

/**
 * Normalise un screenshot
 */
export function normalizeScreenshot(screenshot) {
  return {
    id: screenshot.id,
    url: screenshot.image,
    width: screenshot.width || null,
    height: screenshot.height || null,
    isDeleted: screenshot.is_deleted || false
  };
}

/**
 * Normalise un achievement
 */
export function normalizeAchievement(achievement) {
  return {
    id: achievement.id,
    name: achievement.name,
    description: achievement.description || null,
    image: achievement.image || null,
    percent: achievement.percent ? parseFloat(achievement.percent) : null
  };
}

/**
 * Normalise un movie/trailer
 */
export function normalizeMovie(movie) {
  return {
    id: movie.id,
    name: movie.name || null,
    preview: movie.preview || null,
    data: movie.data ? {
      '480': movie.data['480'] || null,
      max: movie.data.max || null
    } : null
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  normalizeSearchResult,
  normalizeGame,
  normalizeGenre,
  normalizePlatform,
  normalizeCompany,
  normalizeStore,
  normalizeTag,
  normalizeCreator,
  normalizeScreenshot,
  normalizeAchievement,
  normalizeMovie
};
