/**
 * Nautiljon Normalizer — Format Canonique Tako
 * 
 * Transforme les données scrapées de Nautiljon vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Gère séries manga, listes de volumes, et détails de volumes individuels.
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class NautiljonNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'nautiljon',
      type: 'manga',
      domain: 'anime-manga',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalise les résultats de recherche
   */
  normalizeSearchResponse(results, metadata = {}) {
    const { query, total = 0 } = metadata;
    const items = results.map((item, index) => this.normalizeSearchItem(item, index + 1));

    return {
      success: true,
      provider: 'nautiljon',
      domain: 'anime-manga',
      query,
      searchType: 'manga',
      total,
      count: items.length,
      data: items,
      pagination: {
        page: 1,
        limit: items.length,
        hasMore: false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: 'fr',
        note: 'Données Nautiljon (français)'
      }
    };
  }

  /**
   * Normalise un item de recherche
   */
  normalizeSearchItem(item, position = null) {
    return {
      id: `nautiljon:${item.slug}`,
      type: 'manga',
      source: 'nautiljon',
      sourceId: item.slug,
      title: item.title,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: item.image || null,
        thumbnail: item.image || null,
        gallery: item.image ? [item.image] : []
      },
      urls: {
        source: item.url,
        detail: `/api/anime-manga/nautiljon/series/${encodeURIComponent(item.slug)}`
      },
      details: {
        position,
        resourceType: 'manga',
        slug: item.slug
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalise les détails d'une série
   */
  normalizeSeriesResponse(series) {
    const data = {
      id: `nautiljon:${series.slug}`,
      type: 'manga',
      source: 'nautiljon',
      sourceId: series.slug,
      title: series.title,
      titleOriginal: series.titleOriginal,
      description: series.synopsis,
      year: this.extractYear(series.startDate),
      images: {
        primary: series.image || null,
        thumbnail: series.image || null,
        gallery: series.image ? [series.image] : []
      },
      urls: {
        source: series.url,
        detail: `/api/anime-manga/nautiljon/series/${encodeURIComponent(series.slug)}`
      },
      details: {
        resourceType: 'manga',
        format: series.type || 'Manga',
        origin: series.origin,
        status: series.status,
        volumes: series.volumes,
        genres: series.genres,
        themes: series.themes,
        authors: series.authors,
        publishers: series.publishers,
        editions: series.editions,
        volumesList: series.volumesList.map(v => ({
          id: v.id,
          number: v.number,
          label: v.label,
          cover: v.cover,
          detailUrl: `/api/anime-manga/nautiljon/series/${encodeURIComponent(series.slug)}/volume/${v.id}?name=${encodeURIComponent(v.number)}`
        })),
        volumesCount: series.volumesList.length
      }
    };

    return {
      success: true,
      provider: 'nautiljon',
      domain: 'anime-manga',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: 'fr'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION LISTE DE VOLUMES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalise la liste des volumes d'une série
   */
  normalizeVolumesListResponse(series) {
    const volumes = series.volumesList.map((v, index) => ({
      id: `nautiljon:vol:${v.id}`,
      type: 'manga_volume',
      source: 'nautiljon',
      sourceId: v.id,
      title: v.label ? `${series.title} - ${v.label}` : `${series.title} - Volume ${v.number}`,
      titleOriginal: series.titleOriginal || null,
      description: series.synopsis || null,
      year: this.extractYear(series.startDate),
      images: {
        primary: v.cover || null,
        thumbnail: v.cover || null,
        gallery: v.cover ? [v.cover] : []
      },
      urls: {
        source: v.url || `https://www.nautiljon.com/mangas/${series.slug}/volume-${v.number},${v.id}.html`,
        detail: `/api/anime-manga/nautiljon/series/${encodeURIComponent(series.slug)}/volume/${v.id}?name=${encodeURIComponent(v.number)}`
      },
      details: {
        position: index + 1,
        resourceType: 'volume',
        volumeNumber: v.number,
        volumeLabel: v.label || null,
        seriesTitle: series.title,
        seriesSlug: series.slug,
        seriesTitleOriginal: series.titleOriginal || null,
        format: series.type || 'Manga',
        origin: series.origin || null,
        status: series.status || null,
        totalVolumes: series.volumes || series.volumesList.length,
        genres: series.genres || [],
        themes: series.themes || [],
        authors: series.authors || [],
        publishers: series.publishers || {},
        seriesImage: series.image || null
      }
    }));

    return {
      success: true,
      provider: 'nautiljon',
      domain: 'anime-manga',
      query: null,
      searchType: 'manga_volume',
      total: volumes.length,
      count: volumes.length,
      data: volumes,
      pagination: {
        page: 1,
        limit: volumes.length,
        hasMore: false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: 'fr',
        seriesId: `nautiljon:${series.slug}`,
        seriesTitle: series.title,
        seriesTitleOriginal: series.titleOriginal || null,
        totalVolumesVO: series.volumes || null,
        note: 'Données Nautiljon (français)'
      }
    };
  }

  /**
   * Normalise la réponse de recherche de volumes (searchVolumes)
   */
  normalizeVolumesSearchResponse(series, metadata = {}) {
    const response = this.normalizeVolumesListResponse(series);
    response.query = metadata.query || null;
    if (metadata.volumeFilter) {
      response.meta.volumeFilter = metadata.volumeFilter;
    }
    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION DÉTAILS VOLUME
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalise les détails d'un volume
   */
  normalizeVolumeResponse(volume) {
    const covers = [volume.covers?.fr, volume.covers?.jp].filter(Boolean);

    const data = {
      id: `nautiljon:vol:${volume.id}`,
      type: 'manga_volume',
      source: 'nautiljon',
      sourceId: volume.id,
      title: volume.title || `Volume ${volume.number}`,
      titleOriginal: null,
      description: volume.synopsis,
      year: this.extractYear(volume.dates?.fr || volume.dates?.jp),
      images: {
        primary: volume.covers?.fr || volume.covers?.jp || null,
        thumbnail: volume.covers?.fr || volume.covers?.jp || null,
        gallery: covers
      },
      urls: {
        source: volume.url,
        detail: `/api/anime-manga/nautiljon/series/${encodeURIComponent(volume.slug)}/volume/${volume.id}?name=${encodeURIComponent(volume.number)}`
      },
      details: {
        resourceType: 'volume',
        volumeNumber: volume.number,
        seriesTitle: volume.seriesTitle,
        seriesSlug: volume.slug,
        isbn: volume.isbn,
        pages: volume.pages,
        price: volume.price,
        dates: volume.dates,
        publishers: volume.publishers,
        covers: volume.covers,
        chapters: volume.chapters,
        chaptersCount: volume.chapters?.length || 0,
        edition: volume.edition
      }
    };

    return {
      success: true,
      provider: 'nautiljon',
      domain: 'anime-manga',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: 'fr'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════════════

  extractSourceId(raw) {
    return raw?.slug || raw?.id || 'unknown';
  }

  extractTitle(raw) {
    return raw?.title || 'Sans titre';
  }

  extractDetails(raw) {
    return raw?.details || {};
  }

  /**
   * Extrait l'année d'une date string (DD/MM/YYYY ou YYYY)
   */
  extractYear(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
  }
}
