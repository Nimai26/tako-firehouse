/**
 * TMDB Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API TMDB vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Gère films, séries, saisons, épisodes, collections, personnes.
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export class TmdbNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'tmdb',
      type: 'media',
      domain: 'media',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  buildImageUrl(path, size = 'w500') {
    if (!path) return null;
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  }

  extractYear(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date.getFullYear();
  }

  /**
   * Construit l'objet images canonique à partir des paths TMDB
   */
  buildImages(posterPath, backdropPath) {
    return {
      primary: this.buildImageUrl(posterPath, 'w500'),
      thumbnail: this.buildImageUrl(posterPath, 'w185'),
      gallery: [
        this.buildImageUrl(posterPath, 'original'),
        this.buildImageUrl(backdropPath, 'w1280'),
        this.buildImageUrl(backdropPath, 'original')
      ].filter(Boolean)
    };
  }

  /**
   * Construit l'objet images simplifié pour les résultats de recherche
   */
  buildSearchImages(posterPath, backdropPath) {
    return {
      primary: this.buildImageUrl(posterPath, 'w500'),
      thumbnail: this.buildImageUrl(posterPath, 'w185'),
      gallery: [this.buildImageUrl(backdropPath, 'w1280')].filter(Boolean)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSearchResponse(results, metadata = {}) {
    const { query, searchType, total, pagination } = metadata;
    const items = results.map((item, index) =>
      this.normalizeSearchItem(item, searchType, index + 1)
    );

    return {
      success: true,
      provider: 'tmdb',
      domain: 'media',
      query,
      searchType,
      total,
      count: items.length,
      data: items,
      pagination: pagination || {
        page: 1,
        limit: items.length,
        hasMore: false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        source: 'tmdb'
      }
    };
  }

  normalizeSearchItem(item, searchType, position) {
    const mediaType = item.media_type || searchType;

    if (mediaType === 'movie') {
      return this.normalizeMovieSearchItem(item, position);
    } else if (mediaType === 'tv') {
      return this.normalizeSeriesSearchItem(item, position);
    } else if (mediaType === 'person') {
      return this.normalizePersonSearchItem(item, position);
    }

    // Multi search — détection auto
    if (item.title || item.release_date) {
      return this.normalizeMovieSearchItem(item, position);
    } else if (item.name && (item.first_air_date || item.origin_country)) {
      return this.normalizeSeriesSearchItem(item, position);
    } else if (item.known_for_department) {
      return this.normalizePersonSearchItem(item, position);
    }

    return this.normalizeMovieSearchItem(item, position);
  }

  normalizeMovieSearchItem(movie, position = null) {
    return {
      id: `tmdb:${movie.id}`,
      type: 'movie',
      source: 'tmdb',
      sourceId: String(movie.id),
      title: movie.title,
      titleOriginal: movie.original_title || null,
      description: movie.overview || null,
      year: this.extractYear(movie.release_date),
      images: this.buildSearchImages(movie.poster_path, movie.backdrop_path),
      urls: {
        source: `https://www.themoviedb.org/movie/${movie.id}`,
        detail: `/api/media/tmdb/movies/${movie.id}`
      },
      details: {
        mediaType: 'movie',
        releaseDate: movie.release_date || null,
        genreIds: movie.genre_ids || [],
        rating: movie.vote_average
          ? { average: movie.vote_average, voteCount: movie.vote_count }
          : null,
        popularity: movie.popularity || null,
        originalLanguage: movie.original_language || null,
        adult: movie.adult || false
      }
    };
  }

  normalizeSeriesSearchItem(series, position = null) {
    return {
      id: `tmdb:${series.id}`,
      type: 'series',
      source: 'tmdb',
      sourceId: String(series.id),
      title: series.name,
      titleOriginal: series.original_name || null,
      description: series.overview || null,
      year: this.extractYear(series.first_air_date),
      images: this.buildSearchImages(series.poster_path, series.backdrop_path),
      urls: {
        source: `https://www.themoviedb.org/tv/${series.id}`,
        detail: `/api/media/tmdb/series/${series.id}`
      },
      details: {
        mediaType: 'tv',
        firstAirDate: series.first_air_date || null,
        genreIds: series.genre_ids || [],
        rating: series.vote_average
          ? { average: series.vote_average, voteCount: series.vote_count }
          : null,
        popularity: series.popularity || null,
        originalLanguage: series.original_language || null,
        originalCountry: series.origin_country || []
      }
    };
  }

  normalizePersonSearchItem(person, position = null) {
    return {
      id: `tmdb:${person.id}`,
      type: 'person',
      source: 'tmdb',
      sourceId: String(person.id),
      title: person.name,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: this.buildImageUrl(person.profile_path, 'w185'),
        thumbnail: this.buildImageUrl(person.profile_path, 'w185'),
        gallery: []
      },
      urls: {
        source: `https://www.themoviedb.org/person/${person.id}`,
        detail: `/api/media/tmdb/persons/${person.id}`
      },
      details: {
        knownForDepartment: person.known_for_department || null,
        popularity: person.popularity || null,
        gender: person.gender ?? null,
        adult: person.adult || false,
        knownFor: (person.known_for || []).map(item => ({
          sourceId: String(item.id),
          mediaType: item.media_type,
          title: item.title || item.name,
          poster: this.buildImageUrl(item.poster_path, 'w185'),
          year: this.extractYear(item.release_date || item.first_air_date),
          rating: item.vote_average || null,
          overview: item.overview || null
        }))
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAIL FILM
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeMovieDetail(movie, options = {}) {
    return {
      id: `tmdb:${movie.id}`,
      type: 'movie',
      source: 'tmdb',
      sourceId: String(movie.id),
      title: movie.title,
      titleOriginal: movie.original_title || null,
      description: movie.overview || null,
      year: this.extractYear(movie.release_date),
      images: this.buildImages(movie.poster_path, movie.backdrop_path),
      urls: {
        source: `https://www.themoviedb.org/movie/${movie.id}`,
        detail: `/api/media/tmdb/movies/${movie.id}`,
        homepage: movie.homepage || null
      },
      details: {
        mediaType: 'movie',
        tagline: movie.tagline || null,
        releaseDate: movie.release_date || null,
        runtime: movie.runtime || null,
        status: movie.status || null,
        adult: movie.adult || false,

        // Genres
        genres: movie.genres?.map(g => g.name) || [],

        // Notes
        rating: {
          average: movie.vote_average ?? null,
          voteCount: movie.vote_count ?? null
        },
        popularity: movie.popularity || null,

        // Finances
        budget: movie.budget || null,
        revenue: movie.revenue || null,

        // Langues et pays
        originalLanguage: movie.original_language || null,
        spokenLanguages: movie.spoken_languages?.map(l => ({
          code: l.iso_639_1,
          name: l.name,
          englishName: l.english_name
        })) || [],
        productionCountries: movie.production_countries?.map(c => ({
          code: c.iso_3166_1,
          name: c.name
        })) || [],

        // Collection / Saga
        collection: movie.belongs_to_collection ? {
          id: movie.belongs_to_collection.id,
          name: movie.belongs_to_collection.name,
          poster: this.buildImageUrl(movie.belongs_to_collection.poster_path, 'w500'),
          backdrop: this.buildImageUrl(movie.belongs_to_collection.backdrop_path, 'w1280')
        } : null,

        // Studios (production companies)
        studios: movie.production_companies?.map(c => ({
          id: c.id,
          name: c.name,
          logo: this.buildImageUrl(c.logo_path, 'w185'),
          country: c.origin_country
        })) || [],

        // Casting
        cast: movie.credits?.cast?.slice(0, 20).map(c => ({
          id: c.id,
          name: c.name,
          character: c.character,
          order: c.order,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Équipe technique
        crew: movie.credits?.crew?.filter(c =>
          ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Original Music Composer'].includes(c.job)
        ).map(c => ({
          id: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Réalisateurs (extraction directe)
        directors: movie.credits?.crew?.filter(c => c.job === 'Director').map(c => ({
          id: c.id,
          name: c.name,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Vidéos (trailers, etc.)
        videos: movie.videos?.results?.filter(v => v.site === 'YouTube').map(v => ({
          id: v.id,
          key: v.key,
          name: v.name,
          type: v.type,
          official: v.official,
          url: `https://www.youtube.com/watch?v=${v.key}`
        })) || [],

        // Mots-clés
        keywords: movie.keywords?.keywords?.map(k => k.name) || [],

        // IDs externes
        externalIds: {
          imdb: movie.external_ids?.imdb_id || movie.imdb_id || null,
          facebook: movie.external_ids?.facebook_id || null,
          instagram: movie.external_ids?.instagram_id || null,
          twitter: movie.external_ids?.twitter_id || null,
          wikidata: movie.external_ids?.wikidata_id || null
        },

        // Certifications (contentRatings — aligné TVDB)
        contentRatings: movie.release_dates?.results?.map(r => ({
          country: r.iso_3166_1,
          rating: r.release_dates?.[0]?.certification || null,
          releaseDate: r.release_dates?.[0]?.release_date || null
        })).filter(c => c.rating) || [],

        // Recommandations
        recommendations: movie.recommendations?.results?.slice(0, 10).map(r => ({
          sourceId: String(r.id),
          title: r.title,
          year: this.extractYear(r.release_date),
          poster: this.buildImageUrl(r.poster_path, 'w185'),
          rating: r.vote_average || null
        })) || [],

        // Films similaires
        similar: movie.similar?.results?.slice(0, 10).map(s => ({
          sourceId: String(s.id),
          title: s.title,
          year: this.extractYear(s.release_date),
          poster: this.buildImageUrl(s.poster_path, 'w185'),
          rating: s.vote_average || null
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAIL SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSeriesDetail(series, options = {}) {
    return {
      id: `tmdb:${series.id}`,
      type: 'series',
      source: 'tmdb',
      sourceId: String(series.id),
      title: series.name,
      titleOriginal: series.original_name || null,
      description: series.overview || null,
      year: this.extractYear(series.first_air_date),
      images: this.buildImages(series.poster_path, series.backdrop_path),
      urls: {
        source: `https://www.themoviedb.org/tv/${series.id}`,
        detail: `/api/media/tmdb/series/${series.id}`,
        homepage: series.homepage || null
      },
      details: {
        mediaType: 'tv',
        seriesType: series.type || null,
        tagline: series.tagline || null,

        // Dates
        firstAirDate: series.first_air_date || null,
        lastAirDate: series.last_air_date || null,
        endYear: this.extractYear(series.last_air_date),

        // Statut
        status: series.status || null,
        inProduction: series.in_production || false,
        adult: series.adult || false,

        // Épisodes / Saisons
        seasonCount: series.number_of_seasons || null,
        episodeCount: series.number_of_episodes || null,
        episodeRuntime: series.episode_run_time?.[0] || null,

        // Genres
        genres: series.genres?.map(g => g.name) || [],

        // Notes
        rating: {
          average: series.vote_average ?? null,
          voteCount: series.vote_count ?? null
        },
        popularity: series.popularity || null,

        // Langues et pays
        originalLanguage: series.original_language || null,
        languages: series.languages || [],
        originalCountry: series.origin_country || [],
        spokenLanguages: series.spoken_languages?.map(l => ({
          code: l.iso_639_1,
          name: l.name,
          englishName: l.english_name
        })) || [],
        productionCountries: series.production_countries?.map(c => ({
          code: c.iso_3166_1,
          name: c.name
        })) || [],

        // Dernier / Prochain épisode
        lastEpisodeToAir: series.last_episode_to_air ? {
          id: series.last_episode_to_air.id,
          name: series.last_episode_to_air.name,
          overview: series.last_episode_to_air.overview,
          airDate: series.last_episode_to_air.air_date,
          seasonNumber: series.last_episode_to_air.season_number,
          episodeNumber: series.last_episode_to_air.episode_number,
          runtime: series.last_episode_to_air.runtime || null,
          still: this.buildImageUrl(series.last_episode_to_air.still_path, 'w300'),
          episodeType: series.last_episode_to_air.episode_type || null,
          rating: series.last_episode_to_air.vote_average || null
        } : null,
        nextEpisodeToAir: series.next_episode_to_air ? {
          id: series.next_episode_to_air.id,
          name: series.next_episode_to_air.name,
          overview: series.next_episode_to_air.overview,
          airDate: series.next_episode_to_air.air_date,
          seasonNumber: series.next_episode_to_air.season_number,
          episodeNumber: series.next_episode_to_air.episode_number
        } : null,

        // Networks
        networks: series.networks?.map(n => ({
          id: n.id,
          name: n.name,
          logo: this.buildImageUrl(n.logo_path, 'w185'),
          country: n.origin_country
        })) || [],

        // Studios
        studios: series.production_companies?.map(c => ({
          id: c.id,
          name: c.name,
          logo: this.buildImageUrl(c.logo_path, 'w185'),
          country: c.origin_country
        })) || [],

        // Créateurs
        creators: series.created_by?.map(c => ({
          id: c.id,
          name: c.name,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Saisons
        seasons: series.seasons?.map(s => ({
          id: s.id,
          seasonNumber: s.season_number,
          name: s.name,
          overview: s.overview,
          episodeCount: s.episode_count,
          airDate: s.air_date,
          poster: this.buildImageUrl(s.poster_path, 'w185'),
          rating: s.vote_average || null
        })) || [],

        // Casting
        cast: series.credits?.cast?.slice(0, 20).map(c => ({
          id: c.id,
          name: c.name,
          character: c.character,
          order: c.order,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Équipe technique
        crew: series.credits?.crew?.filter(c =>
          ['Executive Producer', 'Creator', 'Original Music Composer', 'Director of Photography'].includes(c.job)
        ).map(c => ({
          id: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Vidéos
        videos: series.videos?.results?.filter(v => v.site === 'YouTube').map(v => ({
          id: v.id,
          key: v.key,
          name: v.name,
          type: v.type,
          official: v.official,
          url: `https://www.youtube.com/watch?v=${v.key}`
        })) || [],

        // Mots-clés
        keywords: series.keywords?.results?.map(k => k.name) || [],

        // IDs externes
        externalIds: {
          imdb: series.external_ids?.imdb_id || null,
          tvdb: series.external_ids?.tvdb_id || null,
          facebook: series.external_ids?.facebook_id || null,
          instagram: series.external_ids?.instagram_id || null,
          twitter: series.external_ids?.twitter_id || null,
          wikidata: series.external_ids?.wikidata_id || null
        },

        // Certifications (contentRatings — aligné TVDB)
        contentRatings: series.content_ratings?.results?.map(r => ({
          country: r.iso_3166_1,
          rating: r.rating
        })) || [],

        // Recommandations
        recommendations: series.recommendations?.results?.slice(0, 10).map(r => ({
          sourceId: String(r.id),
          title: r.name,
          year: this.extractYear(r.first_air_date),
          poster: this.buildImageUrl(r.poster_path, 'w185'),
          rating: r.vote_average || null
        })) || [],

        // Séries similaires
        similar: series.similar?.results?.slice(0, 10).map(s => ({
          sourceId: String(s.id),
          title: s.name,
          year: this.extractYear(s.first_air_date),
          poster: this.buildImageUrl(s.poster_path, 'w185'),
          rating: s.vote_average || null
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAISON
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSeasonDetail(season, options = {}) {
    const { seriesId } = options;

    return {
      id: `tmdb:${season.id}`,
      type: 'season',
      source: 'tmdb',
      sourceId: String(season.id),
      title: season.name,
      titleOriginal: null,
      description: season.overview || null,
      year: this.extractYear(season.air_date),
      images: {
        primary: this.buildImageUrl(season.poster_path, 'w500'),
        thumbnail: this.buildImageUrl(season.poster_path, 'w185'),
        gallery: []
      },
      urls: {
        source: seriesId
          ? `https://www.themoviedb.org/tv/${seriesId}/season/${season.season_number}`
          : null,
        detail: seriesId
          ? `/api/media/tmdb/series/${seriesId}/season/${season.season_number}`
          : null
      },
      details: {
        seriesId: seriesId || null,
        seasonNumber: season.season_number,
        episodeCount: season.episodes?.length || 0,
        rating: season.vote_average != null ? {
          average: season.vote_average,
          voteCount: season.vote_count || 0
        } : null,

        episodes: season.episodes?.map(ep => ({
          id: ep.id,
          episodeNumber: ep.episode_number,
          name: ep.name,
          description: ep.overview || null,
          airDate: ep.air_date,
          runtime: ep.runtime,
          still: this.buildImageUrl(ep.still_path, 'w300'),
          rating: ep.vote_average
            ? { average: ep.vote_average, voteCount: ep.vote_count }
            : null,
          crew: ep.crew?.slice(0, 5).map(c => ({
            id: c.id,
            name: c.name,
            job: c.job
          })) || [],
          guestStars: ep.guest_stars?.slice(0, 10).map(g => ({
            id: g.id,
            name: g.name,
            character: g.character,
            image: this.buildImageUrl(g.profile_path, 'w185')
          })) || []
        })) || [],

        // Casting de la saison
        cast: season.credits?.cast?.slice(0, 15).map(c => ({
          id: c.id,
          name: c.name,
          character: c.character,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Vidéos de la saison
        videos: season.videos?.results?.filter(v => v.site === 'YouTube').map(v => ({
          id: v.id,
          key: v.key,
          name: v.name,
          type: v.type,
          url: `https://www.youtube.com/watch?v=${v.key}`
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉPISODE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeEpisodeDetail(episode, options = {}) {
    const { seriesId, seasonNumber } = options;
    const sn = seasonNumber || episode.season_number;

    return {
      id: `tmdb:${episode.id}`,
      type: 'episode',
      source: 'tmdb',
      sourceId: String(episode.id),
      title: episode.name,
      titleOriginal: null,
      description: episode.overview || null,
      year: this.extractYear(episode.air_date),
      images: {
        primary: this.buildImageUrl(episode.still_path, 'w500'),
        thumbnail: this.buildImageUrl(episode.still_path, 'w300'),
        gallery: [this.buildImageUrl(episode.still_path, 'original')].filter(Boolean)
      },
      urls: {
        source: seriesId
          ? `https://www.themoviedb.org/tv/${seriesId}/season/${sn}/episode/${episode.episode_number}`
          : null,
        detail: seriesId
          ? `/api/media/tmdb/series/${seriesId}/season/${sn}/episode/${episode.episode_number}`
          : null
      },
      details: {
        seriesId: seriesId || null,
        seasonNumber: sn,
        episodeNumber: episode.episode_number,
        airDate: episode.air_date || null,
        runtime: episode.runtime || null,

        rating: episode.vote_average
          ? { average: episode.vote_average, voteCount: episode.vote_count }
          : null,

        // Équipe technique
        crew: episode.crew?.map(c => ({
          id: c.id,
          name: c.name,
          job: c.job,
          department: c.department,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        directors: episode.crew?.filter(c => c.job === 'Director').map(c => ({
          id: c.id,
          name: c.name,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        writers: episode.crew?.filter(c => c.job === 'Writer' || c.job === 'Screenplay').map(c => ({
          id: c.id,
          name: c.name,
          image: this.buildImageUrl(c.profile_path, 'w185')
        })) || [],

        // Guest stars
        guestStars: episode.guest_stars?.map(g => ({
          id: g.id,
          name: g.name,
          character: g.character,
          order: g.order,
          image: this.buildImageUrl(g.profile_path, 'w185')
        })) || [],

        // Vidéos
        videos: episode.videos?.results?.filter(v => v.site === 'YouTube').map(v => ({
          id: v.id,
          key: v.key,
          name: v.name,
          type: v.type,
          url: `https://www.youtube.com/watch?v=${v.key}`
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTION / SAGA
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeCollectionDetail(collection, options = {}) {
    return {
      id: `tmdb:${collection.id}`,
      type: 'collection',
      source: 'tmdb',
      sourceId: String(collection.id),
      title: collection.name,
      titleOriginal: null,
      description: collection.overview || null,
      year: null,
      images: this.buildImages(collection.poster_path, collection.backdrop_path),
      urls: {
        source: `https://www.themoviedb.org/collection/${collection.id}`,
        detail: `/api/media/tmdb/collections/${collection.id}`
      },
      details: {
        movieCount: collection.parts?.length || 0,

        // Films de la collection, triés par date
        parts: (collection.parts || [])
          .sort((a, b) => {
            const dateA = a.release_date ? new Date(a.release_date) : new Date(0);
            const dateB = b.release_date ? new Date(b.release_date) : new Date(0);
            return dateA - dateB;
          })
          .map((movie, index) => ({
            sourceId: String(movie.id),
            title: movie.title,
            titleOriginal: movie.original_title || null,
            description: movie.overview || null,
            releaseDate: movie.release_date || null,
            year: this.extractYear(movie.release_date),
            poster: this.buildImageUrl(movie.poster_path, 'w185'),
            backdrop: this.buildImageUrl(movie.backdrop_path, 'w780'),
            rating: movie.vote_average
              ? { average: movie.vote_average, voteCount: movie.vote_count }
              : null,
            popularity: movie.popularity || null,
            order: index + 1
          }))
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizePersonDetail(person, options = {}) {
    return {
      id: `tmdb:${person.id}`,
      type: 'person',
      source: 'tmdb',
      sourceId: String(person.id),
      title: person.name,
      titleOriginal: null,
      description: person.biography || null,
      year: this.extractYear(person.birthday),
      images: {
        primary: this.buildImageUrl(person.profile_path, 'w500'),
        thumbnail: this.buildImageUrl(person.profile_path, 'w185'),
        gallery: [this.buildImageUrl(person.profile_path, 'original')].filter(Boolean)
      },
      urls: {
        source: `https://www.themoviedb.org/person/${person.id}`,
        detail: `/api/media/tmdb/persons/${person.id}`,
        homepage: person.homepage || null
      },
      details: {
        alsoKnownAs: person.also_known_as || [],
        birthday: person.birthday || null,
        deathday: person.deathday || null,
        placeOfBirth: person.place_of_birth || null,
        gender: person.gender,
        knownForDepartment: person.known_for_department || null,
        popularity: person.popularity || null,
        adult: person.adult || false,

        // IDs externes
        externalIds: {
          imdb: person.external_ids?.imdb_id || null,
          facebook: person.external_ids?.facebook_id || null,
          instagram: person.external_ids?.instagram_id || null,
          twitter: person.external_ids?.twitter_id || null,
          tiktok: person.external_ids?.tiktok_id || null,
          youtube: person.external_ids?.youtube_id || null
        },

        // Crédits films
        movieCredits: {
          cast: person.movie_credits?.cast?.map(m => ({
            sourceId: String(m.id),
            title: m.title,
            character: m.character,
            releaseDate: m.release_date || null,
            year: this.extractYear(m.release_date),
            poster: this.buildImageUrl(m.poster_path, 'w185'),
            rating: m.vote_average || null,
            popularity: m.popularity || null
          })) || [],
          crew: person.movie_credits?.crew?.map(m => ({
            sourceId: String(m.id),
            title: m.title,
            job: m.job,
            department: m.department,
            releaseDate: m.release_date || null,
            year: this.extractYear(m.release_date),
            poster: this.buildImageUrl(m.poster_path, 'w185'),
            rating: m.vote_average || null,
            popularity: m.popularity || null
          })) || []
        },

        // Crédits TV
        tvCredits: {
          cast: person.tv_credits?.cast?.map(t => ({
            sourceId: String(t.id),
            title: t.name,
            character: t.character,
            firstAirDate: t.first_air_date || null,
            year: this.extractYear(t.first_air_date),
            poster: this.buildImageUrl(t.poster_path, 'w185'),
            rating: t.vote_average || null,
            episodeCount: t.episode_count || null
          })) || [],
          crew: person.tv_credits?.crew?.map(t => ({
            sourceId: String(t.id),
            title: t.name,
            job: t.job,
            department: t.department,
            firstAirDate: t.first_air_date || null,
            year: this.extractYear(t.first_air_date),
            poster: this.buildImageUrl(t.poster_path, 'w185'),
            rating: t.vote_average || null,
            episodeCount: t.episode_count || null
          })) || []
        }
      }
    };
  }
}
