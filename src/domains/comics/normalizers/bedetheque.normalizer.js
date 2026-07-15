/**
 * Bedetheque Normalizer — Format Canonique Tako
 * 
 * Transforme les données scrapées de Bedetheque vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 * 
 * Gère albums, séries, auteurs.
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class BedethequeNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'bedetheque',
      type: 'comic',
      domain: 'comics',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extrait l'année d'une date
   */
  extractYear(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Construit l'objet images canonique
   */
  buildImages(imageUrl) {
    return {
      primary: imageUrl || null,
      thumbnail: imageUrl || null,
      gallery: imageUrl ? [imageUrl] : []
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSearchResponse(results, metadata = {}) {
    const { query, searchType, total, pagination } = metadata;
    const items = results.map((item, index) => this.normalizeSearchItem(item, index + 1));

    return {
      success: true,
      provider: 'bedetheque',
      domain: 'comics',
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
        lang: 'fr',
        cached: false,
        cacheAge: null
      }
    };
  }

  normalizeSearchItem(item, position) {
    const itemType = item.type || 'album';
    const sourceId = String(item.id);
    const imageUrl = item.image || item.coverUrl || null;
    const images = this.buildImages(imageUrl);

    // Construire l'URL detail selon le type de ressource
    const detailUrlMap = {
      serie: `/api/comics/bedetheque/serie/${sourceId}`,
      album: `/api/comics/bedetheque/album/${sourceId}`,
      author: null // Pas de route /author/:id
    };

    const base = {
      id: `bedetheque:${sourceId}`,
      type: itemType,
      source: 'bedetheque',
      sourceId,
      titleOriginal: null,
      description: null,
      year: null,
      images,
      urls: {
        source: item.url || null,
        detail: detailUrlMap[itemType] || null
      }
    };

    if (itemType === 'author') {
      return {
        ...base,
        title: item.name || item.title,
        details: {
          resourceType: 'author',
          position
        }
      };
    }

    return {
      ...base,
      title: item.title,
      details: {
        resourceType: itemType,
        serie: item.serie || null,
        tome: item.tome || null,
        authors: item.author ? [item.author] : [],
        position
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS — ALBUMS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeAlbumDetail(album, options = {}) {
    const sourceId = String(album.id);
    const year = this.extractYear(album.dateParution);
    const images = this.buildImages(album.coverUrl);

    // Construire la liste des auteurs
    const authors = [];
    if (album.scenariste) {
      authors.push({ name: album.scenariste, role: 'scénariste' });
    }
    if (album.dessinateur) {
      authors.push({ name: album.dessinateur, role: 'dessinateur' });
    }
    if (album.coloriste) {
      authors.push({ name: album.coloriste, role: 'coloriste' });
    }

    const data = {
      id: `bedetheque:${sourceId}`,
      type: 'album',
      source: 'bedetheque',
      sourceId,
      title: album.title,
      titleOriginal: null,
      description: album.description || null,
      year,
      images,
      urls: {
        source: album.url || null,
        detail: `/api/comics/bedetheque/album/${sourceId}`
      },
      details: {
        resourceType: 'album',
        serie: album.serie || null,
        tome: album.tome || null,
        authors,
        publisher: album.editeur || null,
        releaseDate: album.dateParution || null,
        isbn: album.isbn || null,
        pages: album.pages || null,
        format: album.format || null,
        detailLevel: 'full',
        language: 'fr'
      }
    };

    return {
      success: true,
      provider: 'bedetheque',
      domain: 'comics',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'fr',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS — SÉRIES
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSerieDetail(serie, options = {}) {
    const sourceId = String(serie.id);
    const year = this.extractYear(serie.firstPublished);
    const images = this.buildImages(serie.coverUrl);

    const data = {
      id: `bedetheque:${sourceId}`,
      type: 'serie',
      source: 'bedetheque',
      sourceId,
      title: serie.title,
      titleOriginal: null,
      description: serie.description || null,
      year,
      images,
      urls: {
        source: serie.url || null,
        detail: `/api/comics/bedetheque/serie/${sourceId}`
      },
      details: {
        resourceType: 'serie',
        genre: serie.genre || null,
        status: serie.status || null,
        numberOfAlbums: serie.numberOfAlbums || null,
        origin: serie.origin || null,
        firstPublished: serie.firstPublished || null,
        publisher: serie.publisher || null,
        authors: serie.authors || [],
        recommendations: serie.recommendations || [],
        detailLevel: 'full',
        language: 'fr'
      }
    };

    return {
      success: true,
      provider: 'bedetheque',
      domain: 'comics',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'fr',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS — AUTEURS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeAuthorDetail(author, options = {}) {
    const sourceId = String(author.id);
    const images = this.buildImages(author.photoUrl);

    const data = {
      id: `bedetheque:${sourceId}`,
      type: 'author',
      source: 'bedetheque',
      sourceId,
      title: author.name,
      titleOriginal: null,
      description: null,
      year: null,
      images,
      urls: {
        source: author.url || `https://www.bedetheque.com/auteur/index/a/${sourceId}`,
        detail: null
      },
      details: {
        resourceType: 'author',
        name: author.name,
        biography: author.biography || null,
        birthDate: author.birthDate || null,
        nationality: author.nationality || null,
        detailLevel: 'full',
        language: 'fr'
      }
    };

    return {
      success: true,
      provider: 'bedetheque',
      domain: 'comics',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: options.lang || 'fr',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }
}
