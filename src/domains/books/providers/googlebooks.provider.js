/**
 * Google Books Provider
 * 
 * Provider pour l'API Google Books.
 * Nécessite une clé API Google (GOOGLE_BOOKS_API_KEY).
 * 
 * @see https://developers.google.com/books/docs/v1/using
 * 
 * FEATURES:
 * - Recherche par titre, auteur, ISBN
 * - Détails complets avec synopsis, couvertures
 * - Support multi-langues
 * - Traduction automatique optionnelle
 * 
 * RATE LIMIT : 1000 req/jour (gratuit)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { GoogleBooksNormalizer } from '../normalizers/googlebooks.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';

// Configuration
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1';
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS_LIMIT = 40;

export class GoogleBooksProvider extends BaseProvider {
  constructor() {
    super({
      name: 'googlebooks',
      domain: 'books',
      baseUrl: GOOGLE_BOOKS_BASE_URL,
      timeout: 15000,
      retries: 2,
      retryDelay: 1000
    });

    this.normalizer = new GoogleBooksNormalizer();
    this.log = logger.create('GoogleBooksProvider');
    this.apiKey = GOOGLE_BOOKS_API_KEY;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES ISBN
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vérifie si une chaîne est un ISBN
   */
  isIsbn(query) {
    if (!query) return false;
    const cleaned = String(query).replace(/[-\s]/g, '').toUpperCase();
    return /^\d{13}$/.test(cleaned) || /^\d{9}[\dX]$/.test(cleaned);
  }

  /**
   * Valide un ISBN (checksum)
   */
  validateIsbn(isbn) {
    if (!isbn) return false;
    const cleaned = String(isbn).replace(/[-\s]/g, '').toUpperCase();

    if (/^\d{13}$/.test(cleaned)) {
      let sum = 0;
      for (let i = 0; i < 13; i++) {
        const digit = parseInt(cleaned[i], 10);
        sum += (i % 2 === 0) ? digit : digit * 3;
      }
      return sum % 10 === 0;
    }

    if (/^\d{9}[\dX]$/.test(cleaned)) {
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += (i + 1) * parseInt(cleaned[i], 10);
      }
      const check = sum % 11;
      const last = cleaned[9];
      if (check === 10) return last === 'X';
      return parseInt(last, 10) === check;
    }

    return false;
  }

  /**
   * Convertit ISBN-10 en ISBN-13
   */
  isbn10to13(isbn10) {
    const cleaned = String(isbn10).replace(/[-\s]/g, '').toUpperCase();
    if (!/^\d{9}[\dX]$/.test(cleaned)) return null;

    const core = '978' + cleaned.substring(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(core[i], 10);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const mod = sum % 10;
    const check = (mod === 0) ? 0 : (10 - mod);
    return core + check;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des livres
   * @param {string} query - Terme de recherche (titre, auteur ou ISBN)
   * @param {Object} options
   * @param {number} [options.maxResults=20] - Nombre de résultats (max 40)
   * @param {string} [options.lang] - Restriction de langue (fr, en, de, etc.)
   * @param {string} [options.orderBy=relevance] - Tri (relevance, newest)
   */
  async search(query, options = {}) {
    if (!this.apiKey) {
      throw new ValidationError('Clé API Google Books requise (GOOGLE_BOOKS_API_KEY)');
    }

    const {
      maxResults = DEFAULT_MAX_RESULTS,
      lang = null,
      orderBy = 'relevance'
    } = options;

    const limit = Math.min(Math.max(1, maxResults), MAX_RESULTS_LIMIT);
    const isIsbnQuery = this.isIsbn(query);
    const searchType = isIsbnQuery ? 'isbn' : 'text';

    this.log.debug(`Recherche ${searchType}: "${query}" (lang=${lang}, max=${limit})`);

    // Construire l'URL
    let url = `${GOOGLE_BOOKS_BASE_URL}/volumes?`;

    if (isIsbnQuery) {
      const cleanedIsbn = query.replace(/[-\s]/g, '');
      url += `q=isbn:${encodeURIComponent(cleanedIsbn)}`;
    } else {
      url += `q=${encodeURIComponent(query)}`;
    }

    url += `&key=${encodeURIComponent(this.apiKey)}`;
    url += `&maxResults=${limit}`;
    url += `&orderBy=${orderBy}`;

    if (lang) {
      const langCode = lang.substring(0, 2).toLowerCase();
      url += `&langRestrict=${langCode}`;
    }

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      if (response.status === 403) {
        throw new ValidationError('Clé API Google Books invalide ou quota dépassé');
      } else if (response.status === 429) {
        throw new BadGatewayError('Rate limit Google Books atteint');
      }
      throw new BadGatewayError(`Google Books HTTP ${response.status}`);
    }

    const data = await response.json();
    const items = data.items || [];
    const totalItems = data.totalItems || 0;

    const books = items.map(item => this.parseSearchItem(item));

    this.log.info(`✅ ${totalItems} résultats, ${books.length} retournés pour "${query}"`);

    return this.normalizer.normalizeSearchResponse(books, {
      query,
      searchType,
      total: totalItems,
      pagination: {
        page: 1,
        limit,
        hasMore: totalItems > limit
      },
      lang
    });
  }

  /**
   * Rechercher par auteur
   * @param {string} author - Nom de l'auteur
   * @param {Object} options
   */
  async searchByAuthor(author, options = {}) {
    const query = `inauthor:"${author}"`;
    return this.search(query, options);
  }

  /**
   * Récupérer les détails d'un livre par son ID Google Books
   * @param {string} volumeId - ID du volume
   * @param {Object} options
   */
  async getById(volumeId, options = {}) {
    if (!this.apiKey) {
      throw new ValidationError('Clé API Google Books requise');
    }

    const { lang = null } = options;

    this.log.debug(`Récupération volume: ${volumeId}`);

    const url = `${GOOGLE_BOOKS_BASE_URL}/volumes/${encodeURIComponent(volumeId)}?key=${encodeURIComponent(this.apiKey)}`;

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError(`Volume ${volumeId} non trouvé`);
      } else if (response.status === 403) {
        throw new ValidationError('Clé API Google Books invalide ou quota dépassé');
      }
      throw new BadGatewayError(`Google Books HTTP ${response.status}`);
    }

    const item = await response.json();
    const book = this.parseDetailItem(item);

    this.log.info(`✅ Volume récupéré: ${book.title}`);

    return this.normalizer.normalizeDetailResponse(book, { lang });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch avec retry
   * @private
   */
  async fetchWithRetry(url) {
    let lastError;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Tako-API/1.0'
          },
          signal: AbortSignal.timeout(this.timeout)
        });
        return response;
      } catch (error) {
        lastError = error;
        this.log.warn(`Tentative ${attempt}/${this.retries} échouée: ${error.message}`);
        if (attempt < this.retries) {
          await new Promise(r => setTimeout(r, this.retryDelay * attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Parser un item de recherche
   * @private
   */
  parseSearchItem(item) {
    const vol = item.volumeInfo || {};

    const identifiers = {};
    if (vol.industryIdentifiers) {
      for (const id of vol.industryIdentifiers) {
        if (id.type === 'ISBN_10') identifiers.isbn_10 = id.identifier;
        else if (id.type === 'ISBN_13') identifiers.isbn_13 = id.identifier;
        else if (id.type === 'OTHER') identifiers.other = id.identifier;
      }
    }

    let coverUrl = null;
    if (vol.imageLinks) {
      coverUrl = vol.imageLinks.extraLarge ||
                 vol.imageLinks.large ||
                 vol.imageLinks.medium ||
                 vol.imageLinks.small ||
                 vol.imageLinks.thumbnail;
      if (coverUrl) {
        coverUrl = coverUrl.replace(/&edge=curl/g, '')
                          .replace(/zoom=\d+/g, 'zoom=1')
                          .replace('http://', 'https://');
      }
    }

    return {
      id: item.id,
      title: vol.title || null,
      subtitle: vol.subtitle || null,
      authors: vol.authors || [],
      publisher: vol.publisher || null,
      publishedDate: vol.publishedDate || null,
      categories: vol.categories || [],
      pageCount: vol.pageCount || null,
      description: vol.description || null,
      language: vol.language || null,
      isbn: identifiers.isbn_13 || identifiers.isbn_10 || null,
      isbn10: identifiers.isbn_10 || null,
      isbn13: identifiers.isbn_13 || null,
      coverUrl,
      previewLink: vol.previewLink || null,
      infoLink: vol.infoLink || null,
      source: 'googlebooks'
    };
  }

  /**
   * Parser un item de détails
   * @private
   */
  parseDetailItem(item) {
    const vol = item.volumeInfo || {};

    const identifiers = {};
    if (vol.industryIdentifiers) {
      for (const id of vol.industryIdentifiers) {
        if (id.type === 'ISBN_10') identifiers.isbn_10 = id.identifier;
        else if (id.type === 'ISBN_13') identifiers.isbn_13 = id.identifier;
        else identifiers[id.type.toLowerCase()] = id.identifier;
      }
    }

    const covers = {};
    if (vol.imageLinks) {
      for (const [size, url] of Object.entries(vol.imageLinks)) {
        covers[size] = url.replace('http://', 'https://').replace(/&edge=curl/g, '');
      }
    }

    const bestCover = covers.extraLarge || covers.large || covers.medium || covers.small || covers.thumbnail || null;

    return {
      id: item.id,
      title: vol.title || null,
      subtitle: vol.subtitle || null,
      authors: vol.authors || [],
      publisher: vol.publisher || null,
      publishedDate: vol.publishedDate || null,
      categories: vol.categories || [],
      pageCount: vol.pageCount || null,
      description: vol.description || null,
      language: vol.language || null,
      isbn: identifiers.isbn_13 || identifiers.isbn_10 || null,
      isbn10: identifiers.isbn_10 || null,
      isbn13: identifiers.isbn_13 || null,
      identifiers,
      coverUrl: bestCover,
      covers,
      previewLink: vol.previewLink || null,
      infoLink: vol.infoLink || null,
      averageRating: vol.averageRating || null,
      ratingsCount: vol.ratingsCount || null,
      maturityRating: vol.maturityRating || null,
      printType: vol.printType || null,
      source: 'googlebooks'
    };
  }

  /**
   * Health check
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();

    if (!this.apiKey) {
      return {
        healthy: false,
        latency: 0,
        message: 'Clé API Google Books non configurée (GOOGLE_BOOKS_API_KEY)'
      };
    }

    try {
      // Recherche simple pour tester l'API
      const url = `${GOOGLE_BOOKS_BASE_URL}/volumes?q=test&key=${encodeURIComponent(this.apiKey)}&maxResults=1`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      return {
        healthy: response.ok,
        latency: Date.now() - startTime,
        message: response.ok ? 'Google Books API disponible' : `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: error.message
      };
    }
  }
}

export default GoogleBooksProvider;
