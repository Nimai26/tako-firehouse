/**
 * MangaUpdates Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API MangaUpdates vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Gère séries, auteurs, éditeurs, releases, recommandations.
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class MangaUpdatesNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'mangaupdates',
      type: 'manga',
      domain: 'anime-manga',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Nettoie le HTML d'une description
   */
  cleanHtml(html) {
    if (!html) return null;
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extrait l'année d'une date string
   */
  extractYearFromString(yearStr) {
    if (!yearStr) return null;
    const match = String(yearStr).match(/\d{4}/);
    return match ? parseInt(match[0]) : null;
  }

  /**
   * Construit l'objet images canonique à partir de l'image MangaUpdates
   */
  buildImages(series) {
    const img = series.image;
    if (!img?.url) {
      return { primary: null, thumbnail: null, gallery: [] };
    }
    return {
      primary: img.url.original || null,
      thumbnail: img.url.thumb || null,
      gallery: [img.url.original, img.url.thumb].filter(Boolean)
    };
  }

  /**
   * Construit l'objet images canonique à partir d'une URL simple
   */
  buildSimpleImages(url) {
    if (!url) return { primary: null, thumbnail: null, gallery: [] };
    return {
      primary: url,
      thumbnail: url,
      gallery: []
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION DE RECHERCHE (SÉRIES)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalise la réponse de recherche de séries
   */
  normalizeSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25 } = metadata;
    const results = data?.results || [];
    const totalHits = data?.total_hits || 0;
    const items = results.map((item, index) => this.normalizeSeriesItem(item.record, (page - 1) * pageSize + index + 1));

    return {
      success: true,
      provider: 'mangaupdates',
      domain: 'anime-manga',
      query,
      searchType: 'manga',
      total: totalHits,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: (page * pageSize) < totalHits
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Normalise un item de série pour la recherche
   */
  normalizeSeriesItem(series, position = null) {
    const sourceId = String(series.series_id);

    return {
      id: `mangaupdates:${sourceId}`,
      type: 'manga',
      source: 'mangaupdates',
      sourceId,
      title: series.title,
      titleOriginal: this.extractOriginalTitle(series),
      description: this.cleanHtml(series.description),
      year: this.extractYearFromString(series.year),
      images: this.buildImages(series),
      urls: {
        source: series.url || null,
        detail: `/api/anime-manga/mangaupdates/series/${sourceId}`
      },
      details: {
        position,
        resourceType: 'manga',
        format: series.type || 'Manga',
        status: this.extractStatus(series),
        volumes: this.parseVolumeCount(series.status),
        chapters: series.latest_chapter || null,
        titleAlternatives: this.extractAlternativeTitles(series),
        genres: this.extractGenres(series),
        rating: {
          score: series.bayesian_rating || null,
          votes: series.rating_votes || 0
        },
        latestChapter: series.latest_chapter || null,
        lastUpdated: series.last_updated?.as_rfc3339 || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION DÉTAILS SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalise les détails complets d'une série
   */
  normalizeSeriesDetails(series, options = {}) {
    const sourceId = String(series.series_id);

    const data = {
      id: `mangaupdates:${sourceId}`,
      type: 'manga',
      source: 'mangaupdates',
      sourceId,
      title: series.title,
      titleOriginal: this.extractOriginalTitle(series),
      description: this.cleanHtml(series.description),
      year: this.extractYearFromString(series.year),
      images: this.buildImages(series),
      urls: {
        source: series.url || null,
        detail: `/api/anime-manga/mangaupdates/series/${sourceId}`
      },
      details: {
        resourceType: 'manga',
        format: series.type || 'Manga',
        status: this.extractStatus(series),
        statusText: series.status || null,
        volumes: this.parseVolumeCount(series.status),
        chapters: series.latest_chapter || null,
        titleAlternatives: this.extractAlternativeTitles(series),
        titleFrench: null, // Sera enrichi par le service français

        // Statut détaillé
        statusDetails: {
          completed: series.completed ?? null,
          licensed: series.licensed ?? null,
          licensedEnglish: series.licensed_in_english ?? null,
          animeAdaptation: series.anime?.start ? true : false
        },

        // Classification
        genres: this.extractGenres(series),
        categories: this.extractCategories(series),

        // Notation
        rating: {
          score: series.bayesian_rating || null,
          votes: series.rating_votes || 0,
          distribution: series.rating_distribution || null
        },

        // Publication
        publications: this.extractPublications(series),
        
        // Auteurs
        authors: this.extractAuthors(series),
        
        // Éditeurs
        publishers: this.extractPublishers(series),
        
        // Séries liées
        relatedSeries: this.extractRelatedSeries(series),
        
        // Recommandations
        recommendations: this.extractRecommendations(series),

        // Anime
        anime: series.anime ? {
          startYear: series.anime.start,
          endYear: series.anime.end
        } : null,

        // Chapitre le plus récent
        latestChapter: series.latest_chapter || null,

        // Statistiques
        stats: {
          rankPosition: series.rank?.position || null,
          rankOldPosition: series.rank?.old_position || null,
          forumId: series.forum_id || null
        },

        lastUpdated: series.last_updated?.as_rfc3339 || null
      }
    };

    // Wrapper standardisé
    return {
      success: true,
      provider: this.source,
      domain: this.domain,
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'en',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION HELPERS (SÉRIES)
  // ═══════════════════════════════════════════════════════════════════════════

  extractOriginalTitle(series) {
    // Chercher un titre japonais dans les titres associés
    const associated = series.associated || [];
    const jpTitle = associated.find(t => 
      /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(t.title)
    );
    return jpTitle?.title || null;
  }

  extractAlternativeTitles(series) {
    const associated = series.associated || [];
    return associated.map(t => t.title).filter(Boolean);
  }

  extractStatus(series) {
    if (series.completed === true) return 'completed';
    if (series.completed === false) return 'ongoing';
    if (series.status) return series.status;
    return null;
  }

  /**
   * Parse le nombre de volumes depuis le champ status MangaUpdates
   * Ex: "72 Volumes (Complete)" → 72, "114 Volumes (Ongoing)" → 114
   */
  parseVolumeCount(status) {
    if (!status) return null;
    const firstLine = status.split('\n')[0];
    const match = firstLine.match(/(\d+)\+?\s+Volumes?/i);
    return match ? parseInt(match[1]) : null;
  }

  extractGenres(series) {
    const genres = series.genres || [];
    return genres.map(g => ({
      id: g.genre?.toLowerCase().replace(/\s+/g, '-') || null,
      name: g.genre
    }));
  }

  extractCategories(series) {
    const categories = series.categories || [];
    return categories.map(c => ({
      id: c.category_id || null,
      name: c.category,
      votes: c.votes || 0,
      votesPlus: c.votes_plus || 0,
      votesMinus: c.votes_minus || 0
    }));
  }

  extractPublications(series) {
    const publications = series.publications || [];
    return publications.map(p => ({
      name: p.publication_name,
      publisherId: p.publisher_id || null,
      publisherName: p.publisher_name || null
    }));
  }

  extractAuthors(series) {
    const authors = series.authors || [];
    return authors.map(a => ({
      id: a.author_id ? String(a.author_id) : null,
      name: a.name || a.author,
      type: a.type || 'Author' // Author, Artist, etc.
    }));
  }

  extractPublishers(series) {
    const publishers = series.publishers || [];
    return publishers.map(p => ({
      id: p.publisher_id ? String(p.publisher_id) : null,
      name: p.publisher_name || p.name,
      type: p.type || null,
      notes: p.notes || null
    }));
  }

  extractRelatedSeries(series) {
    const related = series.related_series || [];
    return related.map(r => ({
      id: r.related_series_id ? String(r.related_series_id) : null,
      name: r.related_series_name,
      type: r.relation_type || 'related',
      triggeredByRelation: r.triggered_by_relation || false
    }));
  }

  extractRecommendations(series) {
    const recs = series.recommendations || [];
    return recs.slice(0, 10).map(r => ({
      id: r.series_id ? String(r.series_id) : null,
      name: r.series_name || r.title,
      weight: r.weight || 0
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION AUTEURS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalise la réponse de recherche d'auteurs
   */
  normalizeAuthorSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25 } = metadata;
    const results = data?.results || [];
    const totalHits = data?.total_hits || 0;
    const items = results.map((item, index) => this.normalizeAuthorItem(item.record, (page - 1) * pageSize + index + 1));

    return {
      success: true,
      provider: 'mangaupdates',
      domain: 'anime-manga',
      query,
      searchType: 'author',
      total: totalHits,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: (page * pageSize) < totalHits
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Normalise un item auteur pour la recherche
   */
  normalizeAuthorItem(author, position = null) {
    // L'API utilise 'id' pour la recherche et 'author_id' pour les détails
    const sourceId = String(author.id || author.author_id);

    return {
      id: `mangaupdates:author:${sourceId}`,
      type: 'person',
      source: 'mangaupdates',
      sourceId,
      title: author.name,
      titleOriginal: null,
      description: null,
      year: null,
      images: this.buildSimpleImages(author.image?.url?.original || null),
      urls: {
        source: author.url || null,
        detail: `/api/anime-manga/mangaupdates/author/${sourceId}`
      },
      details: {
        position,
        resourceType: 'author',
        nameAlternatives: this.extractAuthorAltNames(author),
        genres: author.genres || [],
        stats: {
          totalSeries: author.stats?.total_series || 0
        }
      }
    };
  }

  /**
   * Normalise les détails complets d'un auteur
   */
  normalizeAuthorDetails(author) {
    // L'API utilise 'id' pour les détails, pas 'author_id'
    const sourceId = String(author.id || author.author_id);

    return {
      id: `mangaupdates:author:${sourceId}`,
      type: 'person',
      source: 'mangaupdates',
      sourceId,
      title: author.name,
      titleOriginal: null,
      description: null,
      year: null,
      images: this.buildSimpleImages(author.image?.url?.original || null),
      urls: {
        source: author.url || null,
        detail: `/api/anime-manga/mangaupdates/author/${sourceId}`,
        works: `/api/anime-manga/mangaupdates/author/${sourceId}/works`
      },
      details: {
        resourceType: 'author',
        nameAlternatives: this.extractAuthorAltNames(author),
        actualName: author.actualname || null,

        // Infos personnelles
        birthday: author.birthday || null,
        birthplace: author.birthplace || null,
        bloodtype: author.bloodtype || null,
        gender: author.gender || null,

        // Réseaux sociaux
        social: {
          website: author.social?.officialsite || null,
          facebook: author.social?.facebook || null,
          twitter: author.social?.twitter || null
        },

        // Statistiques
        stats: {
          totalSeries: author.stats?.total_series || 0,
          genres: author.genres || []
        },

        lastUpdated: author.last_updated?.as_rfc3339 || null
      }
    };
  }

  /**
   * Normalise les œuvres d'un auteur
   */
  normalizeAuthorWorks(data, authorId) {
    const series = data?.series_list || data || [];
    const list = Array.isArray(series) ? series : [];

    return {
      success: true,
      provider: 'mangaupdates',
      domain: 'anime-manga',
      query: null,
      total: list.length,
      count: list.length,
      data: list.map(s => ({
        id: s.series_id ? String(s.series_id) : null,
        title: s.title || s.series_name,
        type: s.type || null,
        year: s.year || null,
        url: s.url || null
      })),
      pagination: null,
      meta: {
        authorId: String(authorId),
        fetchedAt: new Date().toISOString()
      }
    };
  }

  extractAuthorAltNames(author) {
    const associated = author.associated || author.associated_names || [];
    if (Array.isArray(associated)) {
      return associated.map(n => typeof n === 'string' ? n : n.name).filter(Boolean);
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION ÉDITEURS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizePublisherSearchResponse(data, metadata = {}) {
    const { query, page = 1, pageSize = 25 } = metadata;
    const results = data?.results || [];
    const totalHits = data?.total_hits || 0;
    const items = results.map((item, index) => this.normalizePublisherItem(item.record, (page - 1) * pageSize + index + 1));

    return {
      success: true,
      provider: 'mangaupdates',
      domain: 'anime-manga',
      query,
      searchType: 'publisher',
      total: totalHits,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: (page * pageSize) < totalHits
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizePublisherItem(publisher, position = null) {
    const sourceId = String(publisher.publisher_id);

    return {
      id: `mangaupdates:publisher:${sourceId}`,
      type: 'organization',
      source: 'mangaupdates',
      sourceId,
      title: publisher.name || publisher.publisher_name,
      titleOriginal: null,
      description: publisher.info || null,
      year: null,
      images: { primary: null, thumbnail: null, gallery: [] },
      urls: {
        source: publisher.url || null,
        detail: `/api/anime-manga/mangaupdates/publisher/${sourceId}`
      },
      details: {
        position,
        resourceType: 'publisher',
        publisherType: publisher.type || null
      }
    };
  }

  normalizePublisherDetails(publisher) {
    const sourceId = String(publisher.publisher_id);

    return {
      id: `mangaupdates:publisher:${sourceId}`,
      type: 'organization',
      source: 'mangaupdates',
      sourceId,
      title: publisher.name || publisher.publisher_name,
      titleOriginal: null,
      description: publisher.info || null,
      year: null,
      images: { primary: null, thumbnail: null, gallery: [] },
      urls: {
        source: publisher.url || null,
        detail: `/api/anime-manga/mangaupdates/publisher/${sourceId}`
      },
      details: {
        resourceType: 'publisher',
        publisherType: publisher.type || null,
        site: publisher.site || null,
        stats: {
          totalSeries: publisher.stats?.total_series || 0
        },
        lastUpdated: publisher.last_updated?.as_rfc3339 || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION RELEASES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeReleasesResponse(data, metadata = {}) {
    const { search, page = 1, pageSize = 25 } = metadata;
    const results = data?.results || [];
    const totalHits = data?.total_hits || 0;
    const items = results.map((item, index) => this.normalizeReleaseItem(item.record, (page - 1) * pageSize + index + 1));

    return {
      success: true,
      provider: 'mangaupdates',
      domain: 'anime-manga',
      query: search || null,
      searchType: 'release',
      total: totalHits,
      count: items.length,
      data: items,
      pagination: {
        page,
        limit: pageSize,
        hasMore: (page * pageSize) < totalHits
      },
      meta: {
        fetchedAt: new Date().toISOString()
      }
    };
  }

  normalizeReleaseItem(release, position = null) {
    const sourceId = release.id ? String(release.id) : null;
    return {
      id: sourceId ? `mangaupdates:${sourceId}` : null,
      type: 'release',
      source: 'mangaupdates',
      sourceId,
      title: release.title || release.series?.title,
      titleOriginal: null,
      description: null,
      year: null,
      images: { primary: null, thumbnail: null, gallery: [] },
      urls: {
        source: null,
        detail: null
      },
      details: {
        position,
        resourceType: 'release',
        seriesId: release.series_id ? String(release.series_id) : null,
        chapter: release.chapter || null,
        volume: release.volume || null,
        groupName: release.group?.name || null,
        groupId: release.group?.group_id ? String(release.group.group_id) : null,
        releaseDate: release.release_date || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION RECOMMANDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeRecommendations(data, seriesId) {
    const recs = data?.recommendations || data || [];
    const list = Array.isArray(recs) ? recs : [];

    return {
      success: true,
      provider: 'mangaupdates',
      domain: 'anime-manga',
      query: null,
      total: list.length,
      count: list.length,
      data: list.map(r => ({
        id: r.series_id ? `mangaupdates:${r.series_id}` : null,
        type: 'manga',
        source: 'mangaupdates',
        sourceId: r.series_id ? String(r.series_id) : null,
        title: r.series_name || r.title,
        titleOriginal: null,
        description: null,
        year: null,
        images: { primary: null, thumbnail: null, gallery: [] },
        urls: {
          source: null,
          detail: r.series_id ? `/api/anime-manga/mangaupdates/series/${r.series_id}` : null
        },
        details: {
          weight: r.weight || 0
        }
      })),
      pagination: null,
      meta: {
        fetchedAt: new Date().toISOString(),
        seriesId: String(seriesId)
      }
    };
  }
}

export default MangaUpdatesNormalizer;
