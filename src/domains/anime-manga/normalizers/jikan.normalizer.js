/**
 * Jikan Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API Jikan (MyAnimeList) vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Gère anime, manga, personnages, personnes, producteurs, genres, saisons, planning.
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class JikanNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'jikan',
      type: 'anime-manga',
      domain: 'anime-manga',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extrait la meilleure image (grande, WebP de préférence)
   */
  extractImage(images, preferWebp = true) {
    if (!images) return null;
    
    if (preferWebp && images.webp) {
      return images.webp.large_image_url || images.webp.image_url;
    }
    if (images.jpg) {
      return images.jpg.large_image_url || images.jpg.image_url;
    }
    return null;
  }

  /**
   * Extrait la miniature (petite image)
   */
  extractThumbnail(images) {
    if (!images) return null;
    
    if (images.webp) {
      return images.webp.small_image_url || images.webp.image_url;
    }
    if (images.jpg) {
      return images.jpg.small_image_url || images.jpg.image_url;
    }
    return null;
  }

  /**
   * Extrait toutes les images disponibles (URLs uniquement, dédupliquées)
   */
  extractAllImages(images) {
    if (!images) return [];
    
    const urls = [];
    
    // WebP d'abord (meilleure qualité/poids)
    if (images.webp?.large_image_url) urls.push(images.webp.large_image_url);
    if (images.webp?.image_url) urls.push(images.webp.image_url);
    
    // JPG en fallback
    if (images.jpg?.large_image_url) urls.push(images.jpg.large_image_url);
    if (images.jpg?.image_url) urls.push(images.jpg.image_url);
    
    return [...new Set(urls)];
  }

  /**
   * Construit l'objet images canonique à partir des images Jikan
   */
  buildImages(jikanImages) {
    return {
      primary: this.extractImage(jikanImages),
      thumbnail: this.extractThumbnail(jikanImages),
      gallery: this.extractAllImages(jikanImages)
    };
  }

  /**
   * Extrait les noms d'une liste d'objets avec nom
   */
  extractNames(items) {
    if (!items || !Array.isArray(items)) return [];
    return items.map(item => ({
      id: item.mal_id,
      name: item.name,
      url: item.url
    }));
  }

  /**
   * Convertit le rating MAL en catégorie d'âge
   */
  normalizeRating(rating) {
    if (!rating) return null;
    
    // G - All Ages, PG - Children, PG-13, R - 17+, R+ - Mild Nudity, Rx - Hentai
    const ratingMap = {
      'G - All Ages': { code: 'G', label: 'Tous publics', minAge: 0 },
      'PG - Children': { code: 'PG', label: 'Enfants', minAge: 0 },
      'PG-13 - Teens 13 or older': { code: 'PG-13', label: '13+', minAge: 13 },
      'R - 17+ (violence & profanity)': { code: 'R', label: '17+', minAge: 17 },
      'R+ - Mild Nudity': { code: 'R+', label: '17+ (nudité légère)', minAge: 17 },
      'Rx - Hentai': { code: 'Rx', label: 'Hentai (18+)', minAge: 18 }
    };
    
    return ratingMap[rating] || { code: 'Unknown', label: rating, minAge: null };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE ANIME
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeAnimeSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25, searchType = 'anime' } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};
    const items = results.map((item, index) => this.normalizeAnimeItem(item, (page - 1) * pageSize + index + 1));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query,
      searchType,
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizeAnimeItem(anime, position = null) {
    const sourceId = String(anime.mal_id);

    return {
      id: `jikan:${sourceId}`,
      type: 'anime',
      source: 'jikan',
      sourceId,
      title: anime.title,
      titleOriginal: anime.title_japanese || null,
      description: anime.synopsis || null,
      year: anime.year || (anime.aired?.from ? new Date(anime.aired.from).getFullYear() : null),
      images: this.buildImages(anime.images),
      urls: {
        source: anime.url || null,
        detail: `/api/anime-manga/jikan/anime/${sourceId}`
      },
      details: {
        position,
        malId: anime.mal_id,
        resourceType: anime.type?.toLowerCase() || 'anime',
        titleEnglish: anime.title_english,
        titleAlternatives: anime.titles?.map(t => ({ type: t.type, title: t.title })) || [],
        trailer: anime.trailer ? {
          url: anime.trailer.url || null,
          embedUrl: anime.trailer.embed_url || null,
          youtubeId: anime.trailer.youtube_id || null,
          images: anime.trailer.images ? {
            default: anime.trailer.images.image_url || null,
            small: anime.trailer.images.small_image_url || null,
            medium: anime.trailer.images.medium_image_url || null,
            large: anime.trailer.images.large_image_url || null,
            maximum: anime.trailer.images.maximum_image_url || null
          } : null
        } : null,
        format: anime.type,
        sourceMaterial: anime.source,
        episodes: anime.episodes,
        status: anime.status,
        airing: anime.airing,
        aired: {
          from: anime.aired?.from,
          to: anime.aired?.to,
          string: anime.aired?.string
        },
        duration: anime.duration,
        rating: this.normalizeRating(anime.rating),
        score: anime.score,
        scoredBy: anime.scored_by,
        rank: anime.rank,
        popularity: anime.popularity,
        members: anime.members,
        favorites: anime.favorites,
        season: anime.season,
        studios: this.extractNames(anime.studios),
        producers: this.extractNames(anime.producers),
        licensors: this.extractNames(anime.licensors),
        genres: this.extractNames(anime.genres),
        explicitGenres: this.extractNames(anime.explicit_genres),
        themes: this.extractNames(anime.themes),
        demographics: this.extractNames(anime.demographics),
        titleSynonyms: anime.title_synonyms || [],
        broadcast: anime.broadcast ? {
          day: anime.broadcast.day,
          time: anime.broadcast.time,
          timezone: anime.broadcast.timezone,
          string: anime.broadcast.string
        } : null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE MANGA
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeMangaSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25, searchType = 'manga' } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};
    const items = results.map((item, index) => this.normalizeMangaItem(item, (page - 1) * pageSize + index + 1));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query,
      searchType,
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizeMangaItem(manga, position = null) {
    const sourceId = String(manga.mal_id);

    return {
      id: `jikan:${sourceId}`,
      type: 'manga',
      source: 'jikan',
      sourceId,
      title: manga.title,
      titleOriginal: manga.title_japanese || null,
      description: manga.synopsis || null,
      year: manga.published?.from ? new Date(manga.published.from).getFullYear() : null,
      images: this.buildImages(manga.images),
      urls: {
        source: manga.url || null,
        detail: `/api/anime-manga/jikan/manga/${sourceId}`
      },
      details: {
        position,
        malId: manga.mal_id,
        resourceType: manga.type?.toLowerCase() || 'manga',
        titleEnglish: manga.title_english,
        titleAlternatives: manga.titles?.map(t => ({ type: t.type, title: t.title })) || [],
        format: manga.type,
        chapters: manga.chapters,
        volumes: manga.volumes,
        status: manga.status,
        publishing: manga.publishing,
        published: {
          from: manga.published?.from,
          to: manga.published?.to,
          string: manga.published?.string
        },
        score: manga.score,
        scoredBy: manga.scored_by,
        rank: manga.rank,
        popularity: manga.popularity,
        members: manga.members,
        favorites: manga.favorites,
        authors: manga.authors?.map(a => ({
          id: a.mal_id,
          name: a.name,
          url: a.url
        })) || [],
        serializations: manga.serializations?.map(s => ({
          id: s.mal_id,
          name: s.name,
          url: s.url
        })) || [],
        genres: this.extractNames(manga.genres),
        explicitGenres: this.extractNames(manga.explicit_genres),
        themes: this.extractNames(manga.themes),
        demographics: this.extractNames(manga.demographics),
        titleSynonyms: manga.title_synonyms || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE COMBINÉE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeCombinedSearchResponse(animeResults, mangaResults, metadata = {}) {
    const { query, page = 1, pageSize = 20 } = metadata;
    
    const animeData = animeResults?.data || [];
    const mangaData = mangaResults?.data || [];
    
    // Fusionner et alterner les résultats
    const combined = [];
    const maxLen = Math.max(animeData.length, mangaData.length);
    
    for (let i = 0; i < maxLen; i++) {
      if (animeData[i]) combined.push(animeData[i]);
      if (mangaData[i]) combined.push(mangaData[i]);
    }
    
    // Mettre à jour les positions
    combined.forEach((item, idx) => {
      if (!item.details) item.details = {};
      item.details.position = idx + 1;
    });
    
    const totalAnime = animeResults?.total || 0;
    const totalManga = mangaResults?.total || 0;
    const sliced = combined.slice(0, pageSize);

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query,
      searchType: 'all',
      total: totalAnime + totalManga,
      count: sliced.length,
      breakdown: {
        anime: totalAnime,
        manga: totalManga
      },
      data: sliced,
      pagination: {
        page,
        limit: pageSize,
        hasMore: (animeResults?.pagination?.hasMore || false) || (mangaResults?.pagination?.hasMore || false)
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS ANIME
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeAnimeDetail(anime, options = {}) {
    const base = this.normalizeAnimeItem(anime);
    
    return {
      ...base,
      details: {
        ...base.details,

        // Informations supplémentaires du /full
        background: anime.background,

        // Relations
        relations: anime.relations?.map(rel => ({
          relation: rel.relation,
          entries: rel.entry?.map(e => ({
            id: e.mal_id,
            type: e.type,
            name: e.name,
            url: e.url
          })) || []
        })) || [],
        
        // Thèmes musicaux
        openingThemes: anime.theme?.openings || [],
        endingThemes: anime.theme?.endings || [],
        
        // Streaming
        streaming: anime.streaming?.map(s => ({
          name: s.name,
          url: s.url
        })) || [],
        
        // External links
        externalLinks: anime.external?.map(e => ({
          name: e.name,
          url: e.url
        })) || [],

        detailLevel: 'full'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS MANGA
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeMangaDetail(manga, options = {}) {
    const base = this.normalizeMangaItem(manga);
    
    return {
      ...base,
      details: {
        ...base.details,

        // Informations supplémentaires du /full
        background: manga.background,

        // Relations
        relations: manga.relations?.map(rel => ({
          relation: rel.relation,
          entries: rel.entry?.map(e => ({
            id: e.mal_id,
            type: e.type,
            name: e.name,
            url: e.url
          })) || []
        })) || [],
        
        // External links
        externalLinks: manga.external?.map(e => ({
          name: e.name,
          url: e.url
        })) || [],

        detailLevel: 'full'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉPISODES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeEpisodesResponse(data, metadata = {}) {
    const { animeId, page = 1 } = metadata;
    const episodes = data?.data || [];
    const pagination = data?.pagination || {};

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query: null,
      total: pagination.items?.total || episodes.length,
      count: episodes.length,
      data: episodes.map(ep => ({
        id: ep.mal_id,
        number: ep.mal_id,
        title: ep.title,
        titleJapanese: ep.title_japanese,
        titleRomanji: ep.title_romanji,
        aired: ep.aired,
        score: ep.score ?? null,
        url: ep.url || null,
        filler: ep.filler,
        recap: ep.recap,
        forumUrl: ep.forum_url
      })),
      pagination: {
        page,
        limit: pagination.items?.per_page || 100,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        animeId,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNAGES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeCharactersResponse(data, metadata = {}) {
    const { animeId, mangaId } = metadata;
    const characters = data?.data || [];

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query: null,
      total: characters.length,
      count: characters.length,
      data: characters.map(item => ({
        id: `jikan:character:${item.character?.mal_id}`,
        type: 'character',
        source: 'jikan',
        sourceId: String(item.character?.mal_id),
        title: item.character?.name,
        titleOriginal: null,
        description: null,
        year: null,
        images: this.buildImages(item.character?.images),
        urls: {
          source: item.character?.url || null,
          detail: `/api/anime-manga/jikan/characters/${item.character?.mal_id}`
        },
        details: {
          role: item.role,
          favorites: item.favorites,
          voiceActors: item.voice_actors?.map(va => ({
            id: va.person?.mal_id,
            name: va.person?.name,
            image: this.extractImage(va.person?.images),
            language: va.language
          })) || []
        }
      })),
      pagination: null,
      meta: {
        animeId,
        mangaId,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizeCharactersSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25 } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};
    const items = results.map((item, index) => ({
      id: `jikan:character:${item.mal_id}`,
      type: 'character',
      source: 'jikan',
      sourceId: String(item.mal_id),
      title: item.name,
      titleOriginal: item.name_kanji || null,
      description: item.about || null,
      year: null,
      images: {
        primary: this.extractImage(item.images),
        thumbnail: this.extractThumbnail(item.images),
        gallery: this.extractAllImages(item.images)
      },
      urls: {
        source: item.url || null,
        detail: `/api/anime-manga/jikan/characters/${item.mal_id}`
      },
      details: {
        malId: item.mal_id,
        nicknames: item.nicknames || [],
        favorites: item.favorites,
        position: (page - 1) * pageSize + index + 1
      }
    }));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query,
      searchType: 'characters',
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizeCharacterDetail(character) {
    const sourceId = String(character.mal_id);

    return {
      id: `jikan:character:${sourceId}`,
      type: 'character',
      source: 'jikan',
      sourceId,
      title: character.name,
      titleOriginal: character.name_kanji || null,
      description: character.about || null,
      year: null,
      images: this.buildImages(character.images),
      urls: {
        source: character.url || null,
        detail: `/api/anime-manga/jikan/characters/${sourceId}`
      },
      details: {
        malId: character.mal_id,
        nicknames: character.nicknames || [],
        favorites: character.favorites,

        // Apparitions dans les anime
        anime: character.anime?.map(a => ({
          id: a.anime?.mal_id,
          title: a.anime?.title,
          image: this.extractImage(a.anime?.images),
          url: a.anime?.url,
          role: a.role
        })) || [],
        
        // Apparitions dans les manga
        manga: character.manga?.map(m => ({
          id: m.manga?.mal_id,
          title: m.manga?.title,
          image: this.extractImage(m.manga?.images),
          url: m.manga?.url,
          role: m.role
        })) || [],
        
        // Doubleurs
        voiceActors: character.voices?.map(v => ({
          id: v.person?.mal_id,
          name: v.person?.name,
          image: this.extractImage(v.person?.images),
          language: v.language
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFF
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeStaffResponse(data, metadata = {}) {
    const { animeId } = metadata;
    const staff = data?.data || [];

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query: null,
      total: staff.length,
      count: staff.length,
      data: staff.map(item => ({
        id: `jikan:person:${item.person?.mal_id}`,
        type: 'person',
        source: 'jikan',
        sourceId: String(item.person?.mal_id),
        title: item.person?.name,
        titleOriginal: null,
        description: null,
        year: null,
        images: {
          primary: this.extractImage(item.person?.images),
          thumbnail: this.extractThumbnail(item.person?.images),
          gallery: []
        },
        urls: {
          source: item.person?.url || null,
          detail: `/api/anime-manga/jikan/people/${item.person?.mal_id}`
        },
        details: {
          positions: item.positions || []
        }
      })),
      pagination: null,
      meta: {
        animeId,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMANDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeRecommendationsResponse(data, metadata = {}) {
    const { sourceId, type } = metadata;
    const recommendations = data?.data || [];

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query: null,
      total: recommendations.length,
      count: recommendations.length,
      data: recommendations.map(rec => ({
        id: `jikan:${rec.entry?.mal_id}`,
        type: type || 'anime',
        source: 'jikan',
        sourceId: String(rec.entry?.mal_id),
        title: rec.entry?.title,
        titleOriginal: null,
        description: null,
        year: null,
        images: this.buildImages(rec.entry?.images),
        urls: {
          source: rec.entry?.url || null,
          detail: `/api/anime-manga/jikan/${type || 'anime'}/${rec.entry?.mal_id}`
        },
        details: {
          malId: rec.entry?.mal_id,
          votes: rec.votes
        }
      })),
      pagination: null,
      meta: {
        sourceId,
        sourceType: type,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAISONS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSeasonResponse(data, metadata = {}) {
    const { year, season, current, page = 1 } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};
    const items = results.map((item, index) => this.normalizeAnimeItem(item, (page - 1) * 25 + index + 1));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query: null,
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pagination.items?.per_page || 25,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        year,
        season,
        current: current || false,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP / CLASSEMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeTopResponse(data, metadata = {}) {
    const { page = 1, contentType = 'anime' } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};

    const normalizeFunc = contentType === 'anime' 
      ? this.normalizeAnimeItem.bind(this) 
      : this.normalizeMangaItem.bind(this);

    const items = results.map((item, index) => normalizeFunc(item, (page - 1) * 25 + index + 1));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      contentType,
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pagination.items?.per_page || 25,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizePeopleSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25 } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};
    const items = results.map((item, index) => ({
      id: `jikan:person:${item.mal_id}`,
      type: 'person',
      source: 'jikan',
      sourceId: String(item.mal_id),
      title: item.name,
      titleOriginal: null,
      description: item.about || null,
      year: null,
      images: {
        primary: this.extractImage(item.images),
        thumbnail: this.extractThumbnail(item.images),
        gallery: this.extractAllImages(item.images)
      },
      urls: {
        source: item.url || null,
        detail: `/api/anime-manga/jikan/people/${item.mal_id}`
      },
      details: {
        malId: item.mal_id,
        givenName: item.given_name,
        familyName: item.family_name,
        alternateNames: item.alternate_names || [],
        birthday: item.birthday,
        favorites: item.favorites,
        position: (page - 1) * pageSize + index + 1
      }
    }));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query,
      searchType: 'people',
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizePersonDetail(person) {
    const sourceId = String(person.mal_id);

    return {
      id: `jikan:person:${sourceId}`,
      type: 'person',
      source: 'jikan',
      sourceId,
      title: person.name,
      titleOriginal: null,
      description: person.about || null,
      year: null,
      images: this.buildImages(person.images),
      urls: {
        source: person.url || null,
        detail: `/api/anime-manga/jikan/people/${sourceId}`
      },
      details: {
        malId: person.mal_id,
        givenName: person.given_name,
        familyName: person.family_name,
        alternateNames: person.alternate_names || [],
        birthday: person.birthday,
        favorites: person.favorites,
        websiteUrl: person.website_url,
        
        // Rôles de doublage
        voiceActing: person.voices?.map(v => ({
          character: {
            id: v.character?.mal_id,
            name: v.character?.name,
            image: this.extractImage(v.character?.images)
          },
          anime: {
            id: v.anime?.mal_id,
            title: v.anime?.title,
            image: this.extractImage(v.anime?.images)
          },
          role: v.role
        })) || [],
        
        // Travail sur anime
        animeStaff: person.anime?.map(a => ({
          id: a.anime?.mal_id,
          title: a.anime?.title,
          image: this.extractImage(a.anime?.images),
          position: a.position
        })) || [],
        
        // Travail sur manga
        mangaStaff: person.manga?.map(m => ({
          id: m.manga?.mal_id,
          title: m.manga?.title,
          image: this.extractImage(m.manga?.images),
          position: m.position
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTEURS / STUDIOS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeProducersSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25 } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};
    const items = results.map((item, index) => ({
      id: `jikan:producer:${item.mal_id}`,
      type: 'producer',
      source: 'jikan',
      sourceId: String(item.mal_id),
      title: item.titles?.[0]?.title || item.name,
      titleOriginal: item.titles?.find(t => t.type === 'Japanese')?.title || null,
      description: item.about || null,
      year: null,
      images: {
        primary: this.extractImage(item.images),
        thumbnail: this.extractThumbnail(item.images),
        gallery: this.extractAllImages(item.images)
      },
      urls: {
        source: item.url || null,
        detail: `/api/anime-manga/jikan/producers/${item.mal_id}`
      },
      details: {
        malId: item.mal_id,
        titles: item.titles || [],
        established: item.established,
        favorites: item.favorites,
        count: item.count,
        position: (page - 1) * pageSize + index + 1
      }
    }));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query,
      searchType: 'producers',
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizeProducerDetail(producer) {
    const sourceId = String(producer.mal_id);

    return {
      id: `jikan:producer:${sourceId}`,
      type: 'producer',
      source: 'jikan',
      sourceId,
      title: producer.titles?.[0]?.title || producer.name,
      titleOriginal: producer.titles?.find(t => t.type === 'Japanese')?.title || null,
      description: producer.about || null,
      year: null,
      images: this.buildImages(producer.images),
      urls: {
        source: producer.url || null,
        detail: `/api/anime-manga/jikan/producers/${sourceId}`
      },
      details: {
        malId: producer.mal_id,
        titles: producer.titles || [],
        established: producer.established,
        favorites: producer.favorites,
        count: producer.count,

        // Links externes
        externalLinks: producer.external?.map(e => ({
          name: e.name,
          url: e.url
        })) || []
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENRES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeGenresResponse(data, metadata = {}) {
    const { type } = metadata;
    const genres = data?.data || [];

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      type,
      total: genres.length,
      count: genres.length,
      data: genres.map(g => ({
        id: g.mal_id,
        name: g.name,
        url: g.url,
        count: g.count
      })),
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLANNING / SCHEDULES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeScheduleResponse(data, metadata = {}) {
    const { day, page = 1 } = metadata;
    const results = data?.data || [];
    const pagination = data?.pagination || {};
    const items = results.map((item, index) => this.normalizeAnimeItem(item, (page - 1) * 25 + index + 1));

    return {
      success: true,
      provider: 'jikan',
      domain: 'anime-manga',
      query: day || null,
      total: pagination.items?.total || results.length,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pagination.items?.per_page || 25,
        hasMore: pagination.has_next_page || false
      },
      meta: {
        day: day || 'all',
        fetchedAt: new Date().toISOString()
      }
    };
  }
}
