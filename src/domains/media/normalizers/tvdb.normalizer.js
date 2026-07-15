/**
 * TVDB Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API TheTVDB vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Champs harmonisés avec le normalizer TMDB pour garantir l'interchangeabilité.
 * Gère films, séries, saisons, épisodes, listes, personnes.
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class TvdbNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'tvdb',
      type: 'media',
      domain: 'media',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  extractYear(dateString) {
    if (!dateString) return null;
    const match = String(dateString).match(/^(\d{4})/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Extrait backdrop et posterOriginal depuis les artworks TVDB
   * 
   * Types TVDB (films) : 14 = poster, 15 = background/backdrop
   * Types TVDB (séries) : 2 = poster, 3 = fanart/backdrop
   */
  extractKeyArtworks(artworks) {
    if (!Array.isArray(artworks) || artworks.length === 0) {
      return { backdrop: null, backdropOriginal: null, posterOriginal: null };
    }

    const backgrounds = artworks
      .filter(a => a.type === 15 || a.type === 3)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    const bestBg = backgrounds[0];

    const posters = artworks
      .filter(a => a.type === 14 || a.type === 2)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    const bestPoster = posters[0];

    return {
      backdrop: bestBg?.thumbnail || bestBg?.image || null,
      backdropOriginal: bestBg?.image || null,
      posterOriginal: bestPoster?.image || null
    };
  }

  /**
   * Construit l'objet images canonique pour les détails TVDB
   */
  buildDetailImages(posterUrl, artworks) {
    const { backdrop, backdropOriginal, posterOriginal } = this.extractKeyArtworks(artworks);
    return {
      primary: posterUrl || posterOriginal || null,
      thumbnail: posterUrl || null,
      gallery: [posterOriginal, backdrop, backdropOriginal].filter(Boolean)
    };
  }

  /**
   * Extrait la date de sortie la plus pertinente depuis releases[]
   */
  extractReleaseDate(releases) {
    if (!Array.isArray(releases) || releases.length === 0) return null;
    const sorted = [...releases]
      .filter(r => r.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted[0]?.date || null;
  }

  /**
   * Extrait les personnes par type (Director, Writer, etc.)
   */
  extractPeopleByType(item, types) {
    const typeArray = Array.isArray(types) ? types : [types];

    const fromCharacters = Array.isArray(item.characters)
      ? item.characters.filter(c => typeArray.includes(c.peopleType))
      : [];

    const fromPeople = Array.isArray(item.people)
      ? item.people.filter(p => typeArray.includes(p.peopleType) || typeArray.includes(p.role))
      : [];

    const combined = [...fromCharacters, ...fromPeople];

    const seen = new Set();
    return combined
      .filter(c => {
        const id = c.peopleId || c.id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(c => ({
        id: c.peopleId || c.id,
        name: c.personName || c.name,
        image: c.image || null
      }));
  }

  /**
   * Extrait les acteurs depuis characters[]
   */
  extractCast(characters) {
    if (!Array.isArray(characters)) return [];
    return characters
      .filter(c => c.peopleType === 'Actor' || c.isFeatured ||
        (c.personName && !['Director', 'Writer', 'Producer', 'Creator'].includes(c.peopleType)))
      .slice(0, 20)
      .map(c => ({
        id: c.peopleId || c.id,
        name: c.personName || c.name,
        character: c.name,
        order: c.sort || null,
        image: c.image || null
      }));
  }

  /**
   * Extrait la collection/saga principale
   */
  extractMainCollection(lists) {
    if (!Array.isArray(lists) || lists.length === 0) return null;

    const official = lists.find(l => l.isOfficial);
    const first = official || lists[0];

    return {
      id: first.id,
      name: first.name,
      overview: first.overview || null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSearchResponse(results, metadata = {}) {
    const { query, searchType, total, pagination } = metadata;
    const items = results.map((item, index) =>
      this.normalizeSearchItem(item, index + 1)
    );

    return {
      success: true,
      provider: 'tvdb',
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
        source: 'tvdb'
      }
    };
  }

  normalizeSearchItem(item, position) {
    const type = item.type || 'series';
    const sourceId = String(item.tvdb_id || item.id);
    const isMovie = type === 'movie';

    const sourceUrl = isMovie
      ? `https://thetvdb.com/movies/${item.slug || sourceId}`
      : `https://thetvdb.com/series/${item.slug || sourceId}`;

    const detailUrl = isMovie
      ? `/api/media/tvdb/movies/${sourceId}`
      : `/api/media/tvdb/series/${sourceId}`;

    const primaryImage = item.image || item.thumbnail || item.image_url || null;
    const thumbnailImage = item.thumbnail || item.image || null;

    return {
      id: `tvdb:${sourceId}`,
      type: type === 'movie' ? 'movie' : 'series',
      source: 'tvdb',
      sourceId,
      title: item.name || item.title,
      titleOriginal: item.name || null,
      description: item.overview || null,
      year: item.year || this.extractYear(item.first_air_time),
      images: {
        primary: primaryImage,
        thumbnail: thumbnailImage,
        gallery: []
      },
      urls: {
        source: sourceUrl,
        detail: detailUrl
      },
      details: {
        mediaType: type,
        slug: item.slug || null,
        status: item.status || null,
        network: item.network || null,
        country: item.country || null,
        primaryLanguage: item.primary_language || null,
        aliases: item.aliases || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAIL FILM
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeMovieDetail(movie, options = {}) {
    const { translations, baseOverview } = options;
    const genres = Array.isArray(movie.genres) ? movie.genres.map(g => g.name) : [];
    const overview = translations?.overview || baseOverview || null;
    const releaseDate = this.extractReleaseDate(movie.releases);

    return {
      id: `tvdb:${movie.id}`,
      type: 'movie',
      source: 'tvdb',
      sourceId: String(movie.id),
      title: translations?.name || movie.name,
      titleOriginal: movie.name || null,
      description: overview,
      year: movie.year || (releaseDate ? this.extractYear(releaseDate) : null),
      images: this.buildDetailImages(movie.image, movie.artworks),
      urls: {
        source: `https://thetvdb.com/movies/${movie.slug}`,
        detail: `/api/media/tvdb/movies/${movie.id}`
      },
      details: {
        mediaType: 'movie',
        slug: movie.slug || null,
        releaseDate,
        runtime: movie.runtime || null,
        status: movie.status?.name || null,

        // Genres
        genres,

        // Notes (TVDB score = popularité cumulative, pas une note /10)
        rating: null,
        popularityScore: movie.score || null,

        // Finances
        budget: movie.budget || null,
        revenue: movie.boxOffice || null,

        // Langues et pays
        originalLanguage: movie.originalLanguage || null,
        productionCountries: movie.originalCountry
          ? [{ code: movie.originalCountry }]
          : [],

        // Releases
        releases: Array.isArray(movie.releases)
          ? movie.releases.map(r => ({
              country: r.country,
              date: r.date,
              detail: r.detail
            }))
          : [],

        // Studios (companies + studios combinés)
        studios: [
          ...(Array.isArray(movie.companies) ? movie.companies.map(c => ({
            id: c.id,
            name: c.name,
            country: c.country || null,
            type: c.companyType?.name || c.companyType || null
          })) : []),
          ...(Array.isArray(movie.studios) ? movie.studios.map(s => ({
            id: s.id,
            name: s.name,
            country: s.country || null,
            type: 'studio'
          })) : [])
        ],

        // Casting
        cast: this.extractCast(movie.characters),

        // Équipe
        directors: this.extractPeopleByType(movie, 'Director'),
        crew: [
          ...this.extractPeopleByType(movie, ['Writer', 'Screenplay']).map(p => ({ ...p, job: 'Writer' })),
          ...this.extractPeopleByType(movie, 'Producer').map(p => ({ ...p, job: 'Producer' }))
        ],

        // Vidéos (trailers — aligné TMDB key: videos)
        videos: Array.isArray(movie.trailers)
          ? movie.trailers.map(t => ({
              id: t.id || null,
              name: t.name || null,
              url: t.url,
              type: 'Trailer',
              runtime: t.runtime || null,
              language: t.language || null
            }))
          : [],

        // Collection/Saga
        collection: this.extractMainCollection(movie.lists),

        // Certifications (contentRatings — aligné TMDB)
        contentRatings: Array.isArray(movie.contentRatings)
          ? movie.contentRatings.map(c => ({
              country: c.country,
              rating: c.name,
              fullName: c.fullName || null
            }))
          : [],

        // IDs externes
        externalIds: this.extractExternalIds(movie.remoteIds),

        // Artworks complets (TVDB-spécifique)
        artworks: movie.artworks?.slice(0, 20).map(a => ({
          id: a.id,
          type: a.type,
          image: a.image,
          thumbnail: a.thumbnail,
          language: a.language,
          score: a.score
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAIL SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSeriesDetail(series, options = {}) {
    const { translations } = options;
    const genres = Array.isArray(series.genres) ? series.genres.map(g => g.name) : [];

    return {
      id: `tvdb:${series.id}`,
      type: 'series',
      source: 'tvdb',
      sourceId: String(series.id),
      title: translations?.name || series.name,
      titleOriginal: series.name || null,
      description: translations?.overview || series.overview || null,
      year: series.year || (series.firstAired ? this.extractYear(series.firstAired) : null),
      images: this.buildDetailImages(series.image, series.artworks),
      urls: {
        source: `https://thetvdb.com/series/${series.slug}`,
        detail: `/api/media/tvdb/series/${series.id}`
      },
      details: {
        mediaType: 'tv',
        slug: series.slug || null,

        // Dates
        firstAirDate: series.firstAired || null,
        lastAirDate: series.lastAired || null,
        nextAirDate: series.nextAired || null,
        endYear: series.lastAired ? this.extractYear(series.lastAired) : null,

        // Statut
        status: series.status?.name || null,
        defaultSeasonType: series.defaultSeasonType || null,
        averageRuntime: series.averageRuntime || null,
        episodeRuntime: series.averageRuntime || null,

        // Épisodes / Saisons
        seasonCount: series.seasons?.filter(s => s.type?.id === 1).length || 0,
        episodeCount: series.episodes?.length || null,

        // Genres
        genres,

        // Noms alternatifs
        aliases: series.aliases || [],

        // Informations de diffusion
        broadcast: (series.airsDays || series.airsTime) ? {
          days: series.airsDays || null,
          time: series.airsTime || null,
          timeUTC: series.airsTimeUTC || null
        } : null,

        // Notes (TVDB score = popularité cumulative, pas une note /10)
        rating: null,
        popularityScore: series.score || null,

        // Langues et pays
        originalLanguage: series.originalLanguage || null,
        originalCountry: series.originalCountry
          ? [series.originalCountry]
          : [],

        // Saisons
        seasons: series.seasons
          ?.filter(s => s.type?.id === 1 || s.type?.name === 'Aired Order')
          .map(s => ({
            id: s.id,
            seasonNumber: s.number,
            name: s.name?.en || s.name || `Saison ${s.number}`,
            overview: null,
            episodeCount: null,
            airDate: null,
            poster: s.image || null,
            rating: null
          })) || [],

        // Networks
        networks: [
          series.originalNetwork ? {
            id: series.originalNetwork.id,
            name: series.originalNetwork.name,
            logo: null,
            country: series.originalNetwork.country
          } : null,
          series.latestNetwork && series.latestNetwork.id !== series.originalNetwork?.id ? {
            id: series.latestNetwork.id,
            name: series.latestNetwork.name,
            logo: null,
            country: series.latestNetwork.country
          } : null
        ].filter(Boolean),

        // Studios
        studios: Array.isArray(series.companies)
          ? series.companies.map(c => ({
              id: c.id,
              name: c.name,
              country: c.country || null,
              type: c.companyType?.name || c.companyType || null
            }))
          : [],

        // Casting
        cast: this.extractCast(series.characters),

        // Créateurs et équipe
        creators: this.extractPeopleByType(series, 'Creator'),
        directors: this.extractPeopleByType(series, 'Director'),
        crew: [
          ...this.extractPeopleByType(series, ['Writer', 'Screenplay']).map(p => ({ ...p, job: 'Writer' })),
          ...this.extractPeopleByType(series, 'Creator').map(p => ({ ...p, job: 'Creator' }))
        ],

        // Vidéos
        videos: Array.isArray(series.trailers)
          ? series.trailers.map(t => ({
              id: t.id || null,
              name: t.name || null,
              url: t.url,
              type: 'Trailer',
              runtime: t.runtime || null,
              language: t.language || null
            }))
          : [],

        // Collection/Saga
        collection: this.extractMainCollection(series.lists),

        // Certifications
        contentRatings: Array.isArray(series.contentRatings)
          ? series.contentRatings.map(c => ({
              country: c.country,
              rating: c.name || c.rating,
              fullName: c.fullName || null
            }))
          : [],

        // IDs externes
        externalIds: this.extractExternalIds(series.remoteIds),

        // Artworks complets (TVDB-spécifique)
        artworks: series.artworks?.slice(0, 20).map(a => ({
          id: a.id,
          type: a.type,
          image: a.image,
          thumbnail: a.thumbnail,
          language: a.language,
          score: a.score
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAISON
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSeasonDetail(season, options = {}) {
    const { translations } = options;

    return {
      id: `tvdb:${season.id}`,
      type: 'season',
      source: 'tvdb',
      sourceId: String(season.id),
      title: translations?.name || season.name?.en || season.name || `Saison ${season.number}`,
      titleOriginal: null,
      description: translations?.overview || season.overview || null,
      year: season.year || null,
      images: {
        primary: season.image || null,
        thumbnail: season.image || null,
        gallery: []
      },
      urls: {
        source: null,
        detail: `/api/media/tvdb/seasons/${season.id}`
      },
      details: {
        seriesId: season.seriesId || null,
        seasonNumber: season.number,
        seasonType: season.type?.name || 'Aired Order',
        episodeCount: season.episodes?.length || 0,

        episodes: season.episodes?.map(ep => this.normalizeEpisodeItem(ep)) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉPISODE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeEpisodeItem(episode) {
    return {
      id: `tvdb:${episode.id}`,
      type: 'episode',
      source: 'tvdb',
      sourceId: String(episode.id),
      title: episode.name,
      titleOriginal: null,
      description: episode.overview || null,
      year: this.extractYear(episode.aired),
      images: {
        primary: episode.image || null,
        thumbnail: episode.image || null,
        gallery: []
      },
      urls: {
        source: null,
        detail: `/api/media/tvdb/episodes/${episode.id}`
      },
      details: {
        seriesId: episode.seriesId || null,
        seasonNumber: episode.seasonNumber || null,
        episodeNumber: episode.number || null,
        absoluteNumber: episode.absoluteNumber || null,
        airDate: episode.aired || null,
        runtime: episode.runtime || null,
        productionCode: episode.productionCode || null,
        isMovie: episode.isMovie || false,
        finaleType: episode.finaleType || null,
        rating: episode.rating
          ? { average: episode.rating, voteCount: null }
          : null
      }
    };
  }

  normalizeEpisodeDetail(episode, options = {}) {
    const { translations } = options;
    const base = this.normalizeEpisodeItem(episode);

    return {
      ...base,
      title: translations?.name || base.title,
      description: translations?.overview || base.description,
      details: {
        ...base.details,

        // Équipe technique
        directors: this.extractPeopleByType({ characters: episode.characters }, 'Director'),
        crew: this.extractPeopleByType({ characters: episode.characters }, ['Writer', 'Screenplay'])
          .map(p => ({ ...p, job: 'Writer' })),

        // Guest stars
        guestStars: Array.isArray(episode.characters)
          ? episode.characters
              .filter(c => c.peopleType === 'Guest Star' || c.isFeatured)
              .map(c => ({
                id: c.peopleId || c.id,
                name: c.personName || c.name,
                character: c.name,
                image: c.image || null
              }))
          : [],

        // Artworks
        artworks: episode.artworks?.slice(0, 10) || [],

        // Vidéos
        videos: []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTE / SAGA
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeListDetail(list) {
    return {
      id: `tvdb:${list.id}`,
      type: 'list',
      source: 'tvdb',
      sourceId: String(list.id),
      title: list.name,
      titleOriginal: null,
      description: list.overview || null,
      year: null,
      images: {
        primary: null,
        thumbnail: null,
        gallery: []
      },
      urls: {
        source: list.url || null,
        detail: `/api/media/tvdb/lists/${list.id}`
      },
      details: {
        isOfficial: list.isOfficial || false,
        entities: (list.entities || []).map(e => ({
          id: e.entityId,
          type: e.type,
          order: e.order
        })),
        movieCount: (list.entities || []).filter(e => e.type === 'movie').length,
        seriesCount: (list.entities || []).filter(e => e.type === 'series').length,
        totalCount: list.entities?.length || 0
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizePersonDetail(person) {
    return {
      id: `tvdb:${person.id}`,
      type: 'person',
      source: 'tvdb',
      sourceId: String(person.id),
      title: person.name,
      titleOriginal: null,
      description: null,
      year: this.extractYear(person.birth),
      images: {
        primary: person.image || null,
        thumbnail: person.image || null,
        gallery: []
      },
      urls: {
        source: person.slug ? `https://thetvdb.com/people/${person.slug}` : null,
        detail: `/api/media/tvdb/persons/${person.id}`
      },
      details: {
        birthday: person.birth || null,
        deathday: person.death || null,
        placeOfBirth: person.birthPlace || null,
        gender: person.gender || null,

        // Biographies par langue
        biographies: person.biographies || [],

        // Crédits
        characters: person.characters?.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          peopleType: c.peopleType,
          seriesId: c.seriesId || null,
          movieId: c.movieId || null,
          image: c.image || null
        })) || [],

        // IDs externes
        externalIds: this.extractExternalIds(person.remoteIds)
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVÉS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extrait les IDs externes depuis remoteIds TVDB
   */
  extractExternalIds(remoteIds) {
    if (!Array.isArray(remoteIds)) return {};

    const ids = {};
    for (const remote of remoteIds) {
      // Type 2 = IMDB, Type 12 = TheMovieDB, etc.
      if (remote.type === 2 || remote.sourceName === 'IMDB') {
        ids.imdb = remote.id || null;
      } else if (remote.type === 12 || remote.sourceName === 'TheMovieDB.com') {
        ids.tmdb = remote.id || null;
      } else if (remote.sourceName === 'Facebook') {
        ids.facebook = remote.id || null;
      } else if (remote.sourceName === 'Twitter') {
        ids.twitter = remote.id || null;
      } else if (remote.sourceName === 'Instagram') {
        ids.instagram = remote.id || null;
      } else if (remote.sourceName === 'Wikidata') {
        ids.wikidata = remote.id || null;
      }
    }
    return ids;
  }
}
