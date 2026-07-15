/**
 * OpenLibrary Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API OpenLibrary vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class OpenLibraryNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'openlibrary',
      type: 'book',
      domain: 'books',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  extractYear(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/\b(19\d{2}|20\d{2})\b/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Construit l'objet images canonique à partir des covers OpenLibrary
   */
  buildImages(book) {
    const large = book.images?.[0] || null;
    const medium = book.images?.[1] || null;
    const small = book.images?.[2] || null;

    return {
      primary: large || medium || null,
      thumbnail: small || medium || null,
      gallery: [large, medium, small].filter(Boolean)
    };
  }

  /**
   * Construit l'objet covers (large/medium/small) pour le détail
   */
  buildCovers(book) {
    return {
      large: book.images?.[0] || null,
      medium: book.images?.[1] || null,
      small: book.images?.[2] || null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser une réponse de recherche
   * @param {Array} books - Liste de livres parsés
   * @param {Object} metadata - Métadonnées de recherche
   */
  normalizeSearchResponse(books, metadata = {}) {
    const { query, searchType, total = 0, pagination = {}, lang = null } = metadata;
    const items = books.map((book, index) => this.normalizeSearchItem(book, index + 1));

    return {
      success: true,
      provider: 'openlibrary',
      domain: 'books',
      query,
      total,
      count: items.length,
      data: items,
      pagination: pagination && Object.keys(pagination).length > 0 ? pagination : {
        page: 1,
        limit: items.length,
        hasMore: false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: lang || 'en',
        cached: false,
        cacheAge: null
      }
    };
  }

  /**
   * Normaliser un item de recherche
   * @param {Object} book - Livre parsé
   * @param {number} position - Position dans les résultats
   */
  normalizeSearchItem(book, position = null) {
    const sourceId = String(book.id);
    const year = this.extractYear(book.publishedDate);
    const images = this.buildImages(book);
    const categories = (book.subjects || []).slice(0, 10);

    return {
      id: `openlibrary:${sourceId}`,
      type: 'book',
      source: 'openlibrary',
      sourceId,
      title: book.title,
      titleOriginal: null,
      description: book.synopsis || null,
      year,
      images,
      urls: {
        source: book.url || null,
        detail: `/api/books/openlibrary/${sourceId}`
      },
      details: {
        subtitle: null,
        authors: book.authors || [],
        publisher: book.publishers?.[0] || null,
        publishedDate: book.publishedDate || null,
        categories,
        language: book.language || null,
        identifiers: {
          openlibrary: sourceId,
          isbn: book.isbn || null
        },
        covers: this.buildCovers(book),
        pageCount: book.pageCount || null,
        position
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser une réponse de détails
   * @param {Object} book - Livre parsé
   * @param {Object} options
   */
  normalizeDetailResponse(book, options = {}) {
    const { lang = null } = options;
    const sourceId = String(book.id);
    const year = this.extractYear(book.publishedDate);
    const images = this.buildImages(book);
    const categories = (book.subjects || []).slice(0, 15);
    const covers = this.buildCovers(book);

    // Métadonnées additionnelles spécifiques OpenLibrary
    const additionalMeta = {};
    if (book.subjectPlaces?.length > 0) {
      additionalMeta.places = book.subjectPlaces.slice(0, 10);
    }
    if (book.subjectTimes?.length > 0) {
      additionalMeta.times = book.subjectTimes.slice(0, 10);
    }
    if (book.subjectPeople?.length > 0) {
      additionalMeta.people = book.subjectPeople.slice(0, 10);
    }
    if (book.links?.length > 0) {
      additionalMeta.externalLinks = book.links.slice(0, 5).map(link => ({
        title: link.title || 'Link',
        url: link.url
      }));
    }
    if (book.physicalFormat) {
      additionalMeta.format = book.physicalFormat;
    }
    if (book.workKey) {
      additionalMeta.workId = book.workKey.replace('/works/', '');
    }
    if (book.allLanguages?.length > 1) {
      additionalMeta.availableLanguages = book.allLanguages;
    }

    const data = {
      id: `openlibrary:${sourceId}`,
      type: book.type || 'book',
      source: 'openlibrary',
      sourceId,
      title: book.title,
      titleOriginal: null,
      description: book.synopsis || null,
      year,
      images,
      urls: {
        source: book.url || null,
        detail: `/api/books/openlibrary/${sourceId}`
      },
      details: {
        subtitle: null,
        authors: book.authors || [],
        publishers: book.publishers || [],
        publisher: book.publishers?.[0] || null,
        publishedDate: book.publishedDate || null,
        categories,
        language: book.language || null,
        identifiers: {
          openlibrary: sourceId,
          isbn: book.isbn || null
        },
        covers,
        pageCount: book.pageCount || null,
        ...additionalMeta
      }
    };

    return {
      success: true,
      provider: 'openlibrary',
      domain: 'books',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang,
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }
}

export default OpenLibraryNormalizer;
