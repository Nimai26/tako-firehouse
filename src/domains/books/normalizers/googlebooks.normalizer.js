/**
 * Google Books Normalizer — Format Canonique Tako
 * 
 * Transforme les données de l'API Google Books vers le format canonique :
 * { id, type, source, sourceId, title, titleOriginal, description, year,
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ...domain-specific } }
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class GoogleBooksNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'googlebooks',
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
    const match = dateStr.match(/^(\d{4})/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Construit l'objet images canonique { primary, thumbnail, gallery }
   */
  buildImages(book) {
    const primary = book.coverUrl || book.covers?.extraLarge || book.covers?.large || null;
    const thumbnail = book.covers?.thumbnail || book.covers?.small || (primary ? primary : null);

    const gallery = [];
    if (book.covers) {
      const sizes = ['extraLarge', 'large', 'medium', 'small', 'thumbnail'];
      for (const size of sizes) {
        if (book.covers[size] && book.covers[size] !== primary) {
          gallery.push(book.covers[size]);
        }
      }
    }

    return { primary, thumbnail, gallery };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeSearchResponse(books, metadata = {}) {
    const { query, searchType, total, pagination, lang } = metadata;
    const items = books.map((book, index) => this.normalizeSearchItem(book, index + 1));

    return {
      success: true,
      provider: 'googlebooks',
      domain: 'books',
      query,
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
        lang: lang || 'en',
        cached: false,
        cacheAge: null
      }
    };
  }

  normalizeSearchItem(book, position) {
    const sourceId = String(book.id);
    const images = this.buildImages(book);

    return {
      id: `googlebooks:${sourceId}`,
      type: 'book',
      source: 'googlebooks',
      sourceId,
      title: book.title,
      titleOriginal: null,
      description: book.description || null,
      year: this.extractYear(book.publishedDate),
      images,
      urls: {
        source: book.infoLink || null,
        detail: `/api/books/googlebooks/${sourceId}`
      },
      details: {
        subtitle: book.subtitle || null,
        authors: book.authors || [],
        publisher: book.publisher || null,
        publishedDate: book.publishedDate || null,
        categories: book.categories || [],
        language: book.language || null,
        isbn: book.isbn || null,
        isbn10: book.isbn10 || null,
        isbn13: book.isbn13 || null,
        pageCount: book.pageCount || null,
        previewLink: book.previewLink || null,
        position
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS
  // ═══════════════════════════════════════════════════════════════════════════

  normalizeDetailResponse(book, options = {}) {
    const { lang } = options;
    const sourceId = String(book.id);
    const images = this.buildImages(book);
    const year = this.extractYear(book.publishedDate);

    const data = {
      id: `googlebooks:${sourceId}`,
      type: 'book',
      source: 'googlebooks',
      sourceId,
      title: book.title,
      titleOriginal: null,
      description: book.description || null,
      year,
      images,
      urls: {
        source: book.infoLink || null,
        detail: `/api/books/googlebooks/${sourceId}`
      },
      details: {
        subtitle: book.subtitle || null,
        fullTitle: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title,
        authors: book.authors || [],
        publisher: book.publisher || null,
        publishedDate: book.publishedDate || null,
        categories: book.categories || [],
        language: book.language || null,
        isbn: book.isbn || null,
        isbn10: book.isbn10 || null,
        isbn13: book.isbn13 || null,
        identifiers: book.identifiers || {},
        pageCount: book.pageCount || null,
        synopsis: book.description || null,
        rating: book.averageRating ? {
          value: book.averageRating,
          count: book.ratingsCount || 0
        } : null,
        printType: book.printType || null,
        maturityRating: book.maturityRating || null,
        previewLink: book.previewLink || null,
        covers: book.covers || null
      }
    };

    return {
      success: true,
      provider: 'googlebooks',
      domain: 'books',
      id: data.id,
      data,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: lang || 'en',
        cached: options.cached || false,
        cacheAge: options.cacheAge || null
      }
    };
  }
}

export default GoogleBooksNormalizer;
