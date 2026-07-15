/**
 * OpenLibrary Provider
 * 
 * Provider pour l'API OpenLibrary.
 * API gratuite, sans clé requise.
 * 
 * @see https://openlibrary.org/developers/api
 * 
 * FEATURES:
 * - Recherche par titre, auteur, ISBN
 * - Détails complets avec synopsis, couvertures
 * - Accès aux données de Works et Editions
 * - Support multi-langues
 * 
 * RATE LIMIT : Non spécifié, mais être respectueux
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { OpenLibraryNormalizer } from '../normalizers/openlibrary.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';

// Configuration
const OPENLIBRARY_BASE_URL = 'https://openlibrary.org';
const OPENLIBRARY_COVERS_URL = 'https://covers.openlibrary.org';
const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS_LIMIT = 100;

// Mapping langues
const LANG_MAP = {
  'en': 'eng', 'fr': 'fre', 'es': 'spa', 'de': 'ger',
  'it': 'ita', 'pt': 'por', 'nl': 'dut', 'ru': 'rus'
};

export class OpenLibraryProvider extends BaseProvider {
  constructor() {
    super({
      name: 'openlibrary',
      domain: 'books',
      baseUrl: OPENLIBRARY_BASE_URL,
      timeout: 20000,
      retries: 2,
      retryDelay: 1000
    });

    this.normalizer = new OpenLibraryNormalizer();
    this.log = logger.create('OpenLibraryProvider');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════════════

  isIsbn(query) {
    if (!query) return false;
    const cleaned = String(query).replace(/[-\s]/g, '').toUpperCase();
    return /^\d{13}$/.test(cleaned) || /^\d{9}[\dX]$/.test(cleaned);
  }

  normalizeLanguage(lang) {
    if (!lang) return null;
    const code = lang.substring(0, 2).toLowerCase();
    return LANG_MAP[code] || null;
  }

  parseYearFromDate(dateStr) {
    if (!dateStr) return null;

    // Format: YYYY ou YYYY-MM-DD
    const isoMatch = dateStr.match(/^(\d{4})(?:-\d{2})?(?:-\d{2})?$/);
    if (isoMatch) return parseInt(isoMatch[1], 10);

    // Format: DD/MM/YYYY
    const dmyMatch = dateStr.match(/^\d{1,2}\/\d{1,2}\/(\d{4})$/);
    if (dmyMatch) return parseInt(dmyMatch[1], 10);

    // Format: Month YYYY ou YYYY Month
    const yearMatch = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) return parseInt(yearMatch[1], 10);

    return null;
  }

  buildCoverUrl(coverId, size = 'L') {
    if (!coverId) return null;
    return `${OPENLIBRARY_COVERS_URL}/b/id/${coverId}-${size}.jpg`;
  }

  buildCoverUrlByIsbn(isbn, size = 'L') {
    if (!isbn) return null;
    return `${OPENLIBRARY_COVERS_URL}/b/isbn/${isbn}-${size}.jpg`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des livres
   * @param {string} query - Terme de recherche (titre ou ISBN)
   * @param {Object} options
   * @param {number} [options.maxResults=20] - Nombre de résultats (max 100)
   * @param {string} [options.lang] - Restriction de langue
   */
  async search(query, options = {}) {
    const {
      maxResults = DEFAULT_MAX_RESULTS,
      lang = null
    } = options;

    const limit = Math.min(Math.max(1, maxResults), MAX_RESULTS_LIMIT);
    const isIsbnQuery = this.isIsbn(query);
    const searchType = isIsbnQuery ? 'isbn' : 'text';

    this.log.debug(`Recherche ${searchType}: "${query}" (lang=${lang}, max=${limit})`);

    if (isIsbnQuery) {
      return this.searchByIsbn(query);
    }

    return this.searchByText(query, lang, limit);
  }

  /**
   * Rechercher par auteur
   * @param {string} author - Nom de l'auteur
   * @param {Object} options
   */
  async searchByAuthor(author, options = {}) {
    const {
      maxResults = DEFAULT_MAX_RESULTS,
      lang = null
    } = options;

    const limit = Math.min(Math.max(1, maxResults), MAX_RESULTS_LIMIT);

    this.log.debug(`Recherche par auteur: "${author}" (max=${limit})`);

    let url = `${OPENLIBRARY_BASE_URL}/search.json?author=${encodeURIComponent(author)}&limit=${limit}`;

    const langCode = this.normalizeLanguage(lang);
    if (langCode) {
      url += `&language=${langCode}`;
    }

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new BadGatewayError(`OpenLibrary HTTP ${response.status}`);
    }

    const data = await response.json();
    const docs = data.docs || [];
    const numFound = data.numFound || 0;

    const books = docs.map(doc => this.parseSearchDoc(doc));

    this.log.info(`✅ ${numFound} résultats, ${books.length} retournés pour auteur "${author}"`);

    return this.normalizer.normalizeSearchResponse(books, {
      query: author,
      searchType: 'author',
      total: numFound,
      pagination: {
        page: 1,
        limit,
        hasMore: numFound > limit
      },
      lang
    });
  }

  /**
   * Récupérer les détails d'un livre par son ID OpenLibrary
   * @param {string} olId - ID OpenLibrary (OL1234W pour work, OL1234M pour edition)
   * @param {Object} options
   */
  async getById(olId, options = {}) {
    const { lang = null } = options;

    this.log.debug(`Récupération: ${olId}`);

    const isWork = olId.endsWith('W');
    const isEdition = olId.endsWith('M');

    let url;
    if (isWork) {
      url = `${OPENLIBRARY_BASE_URL}/works/${olId}.json`;
    } else if (isEdition) {
      url = `${OPENLIBRARY_BASE_URL}/books/${olId}.json`;
    } else {
      // Essayer comme work
      url = `${OPENLIBRARY_BASE_URL}/works/OL${olId}W.json`;
    }

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError(`Livre ${olId} non trouvé sur OpenLibrary`);
      }
      throw new BadGatewayError(`OpenLibrary HTTP ${response.status}`);
    }

    const data = await response.json();

    // Parser selon le type
    let book;
    if (data.type?.key === '/type/work') {
      book = await this.parseWorkDetails(data, olId);
    } else {
      book = await this.parseEditionDetails(data, olId);
    }

    this.log.info(`✅ Récupéré: ${book.title}`);

    return this.normalizer.normalizeDetailResponse(book, { lang });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES PRIVÉES DE RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  async searchByIsbn(isbn) {
    const cleanedIsbn = isbn.replace(/[-\s]/g, '');
    const url = `${OPENLIBRARY_BASE_URL}/api/books?bibkeys=ISBN:${encodeURIComponent(cleanedIsbn)}&format=json&jscmd=data`;

    this.log.debug(`URL ISBN: ${url}`);

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new BadGatewayError(`OpenLibrary HTTP ${response.status}`);
    }

    const data = await response.json();
    const key = `ISBN:${cleanedIsbn}`;

    if (!data[key]) {
      return this.normalizer.normalizeSearchResponse([], {
        query: isbn,
        searchType: 'isbn',
        total: 0,
        pagination: { page: 1, limit: 0, hasMore: false }
      });
    }

    const book = this.parseBibkeyBook(data[key], cleanedIsbn);

    return this.normalizer.normalizeSearchResponse([book], {
      query: isbn,
      searchType: 'isbn',
      total: 1,
      pagination: { page: 1, limit: 1, hasMore: false }
    });
  }

  async searchByText(query, lang, limit) {
    let url = `${OPENLIBRARY_BASE_URL}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;

    const langCode = this.normalizeLanguage(lang);
    if (langCode) {
      url += `&language=${langCode}`;
    }

    this.log.debug(`URL texte: ${url}`);

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new BadGatewayError(`OpenLibrary HTTP ${response.status}`);
    }

    const data = await response.json();
    const docs = data.docs || [];
    const numFound = data.numFound || 0;

    const books = docs.map(doc => this.parseSearchDoc(doc));

    this.log.info(`✅ ${numFound} résultats, ${books.length} retournés pour "${query}"`);

    return this.normalizer.normalizeSearchResponse(books, {
      query,
      searchType: 'text',
      total: numFound,
      pagination: {
        page: 1,
        limit,
        hasMore: numFound > limit
      },
      lang
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARSERS
  // ═══════════════════════════════════════════════════════════════════════════

  parseSearchDoc(doc) {
    const title = doc.title || doc.title_suggest || null;
    const authors = doc.author_name || [];
    const publishers = doc.publisher || [];

    let releaseDate = null;
    if (doc.first_publish_year) {
      releaseDate = String(doc.first_publish_year);
    } else if (doc.publish_year && doc.publish_year.length > 0) {
      releaseDate = String(doc.publish_year[0]);
    }

    let isbn = null;
    if (doc.isbn && doc.isbn.length > 0) {
      for (const isb of doc.isbn) {
        const cleaned = isb.replace(/[-\s]/g, '');
        if (cleaned.length === 13) {
          isbn = cleaned;
          break;
        } else if (cleaned.length === 10 && !isbn) {
          isbn = cleaned;
        }
      }
    }

    const images = [];
    if (doc.cover_i) {
      images.push(this.buildCoverUrl(doc.cover_i, 'L'));  // Large
      images.push(this.buildCoverUrl(doc.cover_i, 'M'));  // Medium
      images.push(this.buildCoverUrl(doc.cover_i, 'S'));  // Small
    } else if (isbn) {
      images.push(this.buildCoverUrlByIsbn(isbn, 'L'));  // Large
      images.push(this.buildCoverUrlByIsbn(isbn, 'M'));  // Medium
      images.push(this.buildCoverUrlByIsbn(isbn, 'S'));  // Small
    }

    const olKey = doc.key || null;
    const olId = olKey ? olKey.replace('/works/', '') : null;
    const subjects = doc.subject ? doc.subject.slice(0, 10) : [];
    const language = doc.language ? doc.language[0] : null;

    return {
      id: olId,
      type: 'book',
      title,
      authors,
      publishers,
      publishedDate: releaseDate,
      subjects,
      language,
      isbn,
      images,
      key: olKey,
      url: olId ? `${OPENLIBRARY_BASE_URL}/works/${olId}` : null,
      source: 'openlibrary'
    };
  }

  parseBibkeyBook(book, isbn = null) {
    const authors = (book.authors || []).map(a => a.name).filter(Boolean);
    const publishers = (book.publishers || []).map(p => p.name).filter(Boolean);

    let isbnValue = null;
    if (book.identifiers) {
      if (book.identifiers.isbn_13?.[0]) {
        isbnValue = book.identifiers.isbn_13[0];
      } else if (book.identifiers.isbn_10?.[0]) {
        isbnValue = book.identifiers.isbn_10[0];
      }
    }
    if (!isbnValue && isbn) {
      isbnValue = isbn.replace(/[-\s]/g, '');
    }

    const olId = book.identifiers?.openlibrary?.[0] || null;

    const images = [];
    if (book.cover) {
      if (book.cover.large) images.push(book.cover.large);
      if (book.cover.medium) images.push(book.cover.medium);
      if (book.cover.small) images.push(book.cover.small);
    }

    const subjects = (book.subjects || []).map(s => s.name).filter(Boolean).slice(0, 10);

    let synopsis = null;
    if (book.excerpts && book.excerpts.length > 0) {
      synopsis = book.excerpts[0].text || null;
    } else if (book.notes) {
      synopsis = typeof book.notes === 'string' ? book.notes : book.notes.value || null;
    }

    return {
      id: olId,
      type: 'book',
      title: book.title || null,
      authors,
      publishers,
      publishedDate: book.publish_date || null,
      subjects,
      pageCount: book.number_of_pages || null,
      synopsis,
      isbn: isbnValue,
      images,
      url: book.url || (olId ? `${OPENLIBRARY_BASE_URL}/books/${olId}` : null),
      source: 'openlibrary'
    };
  }

  async parseWorkDetails(data, olId) {
    const images = [];
    if (data.covers && data.covers.length > 0) {
      const firstCover = data.covers[0];
      images.push(this.buildCoverUrl(firstCover, 'L'));  // Large
      images.push(this.buildCoverUrl(firstCover, 'M'));  // Medium
      images.push(this.buildCoverUrl(firstCover, 'S'));  // Small
    }

    const subjects = data.subjects || [];
    const synopsis = typeof data.description === 'string' ? data.description : data.description?.value || null;

    // Récupérer les auteurs
    let authors = [];
    if (data.authors?.length > 0) {
      const authorPromises = data.authors.slice(0, 5).map(async (authorRef) => {
        const authorKey = authorRef.author?.key || authorRef.key;
        if (!authorKey) return null;
        try {
          const authorResp = await fetch(`${OPENLIBRARY_BASE_URL}${authorKey}.json`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Tako-API/1.0' },
            signal: AbortSignal.timeout(5000)
          });
          if (authorResp.ok) {
            const authorData = await authorResp.json();
            return authorData.name || authorData.personal_name || null;
          }
        } catch (e) {
          this.log.debug(`Erreur récupération auteur: ${e.message}`);
        }
        return null;
      });
      const authorResults = await Promise.all(authorPromises);
      authors = authorResults.filter(Boolean);
    }

    // Récupérer éditions pour ISBN et plus
    let isbn = null;
    let publishers = [];
    let pageCount = null;
    let releaseDate = data.first_publish_date || null;
    let language = null;

    try {
      const editionsUrl = `${OPENLIBRARY_BASE_URL}/works/${olId}/editions.json?limit=10`;
      const editionsResp = await fetch(editionsUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Tako-API/1.0' },
        signal: AbortSignal.timeout(10000)
      });

      if (editionsResp.ok) {
        const editionsData = await editionsResp.json();
        const editions = editionsData.entries || [];

        for (const edition of editions) {
          if (!isbn) {
            isbn = edition.isbn_13?.[0] || edition.isbn_10?.[0] || null;
          }
          if (publishers.length === 0 && edition.publishers) {
            publishers = edition.publishers;
          }
          if (!pageCount && edition.number_of_pages) {
            pageCount = edition.number_of_pages;
          }
          if (!language && edition.languages) {
            language = edition.languages[0]?.key?.replace('/languages/', '') || null;
          }
        }
      }
    } catch (e) {
      this.log.debug(`Erreur récupération éditions: ${e.message}`);
    }

    return {
      id: olId,
      type: 'work',
      title: data.title || null,
      authors,
      publishers,
      publishedDate: releaseDate,
      subjects: subjects.slice(0, 15),
      pageCount,
      synopsis,
      language,
      isbn,
      images,
      url: `${OPENLIBRARY_BASE_URL}/works/${olId}`,
      subjectPlaces: data.subject_places || [],
      subjectTimes: data.subject_times || [],
      subjectPeople: data.subject_people || [],
      links: data.links || [],
      source: 'openlibrary'
    };
  }

  async parseEditionDetails(data, olId) {
    const images = [];
    if (data.covers && data.covers.length > 0) {
      const firstCover = data.covers[0];
      images.push(this.buildCoverUrl(firstCover, 'L'));  // Large
      images.push(this.buildCoverUrl(firstCover, 'M'));  // Medium
      images.push(this.buildCoverUrl(firstCover, 'S'));  // Small
    }

    const isbn = data.isbn_13?.[0] || data.isbn_10?.[0] || null;
    const synopsis = typeof data.description === 'string' ? data.description : data.description?.value || null;
    const languages = data.languages ? data.languages.map(l => l.key?.replace('/languages/', '')) : [];

    // Récupérer auteurs depuis work parent
    let authors = [];
    if (data.works?.[0]?.key) {
      try {
        const workResp = await fetch(`${OPENLIBRARY_BASE_URL}${data.works[0].key}.json`, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'Tako-API/1.0' },
          signal: AbortSignal.timeout(5000)
        });
        if (workResp.ok) {
          const workData = await workResp.json();
          if (workData.authors?.length > 0) {
            const authorPromises = workData.authors.slice(0, 5).map(async (authorRef) => {
              const authorKey = authorRef.author?.key || authorRef.key;
              if (!authorKey) return null;
              try {
                const authorResp = await fetch(`${OPENLIBRARY_BASE_URL}${authorKey}.json`, {
                  headers: { 'Accept': 'application/json' },
                  signal: AbortSignal.timeout(5000)
                });
                if (authorResp.ok) {
                  const authorData = await authorResp.json();
                  return authorData.name || authorData.personal_name || null;
                }
              } catch (e) {}
              return null;
            });
            const authorResults = await Promise.all(authorPromises);
            authors = authorResults.filter(Boolean);
          }
        }
      } catch (e) {
        this.log.debug(`Erreur récupération work parent: ${e.message}`);
      }
    }

    return {
      id: olId,
      type: 'edition',
      title: data.title || null,
      authors,
      publishers: data.publishers || [],
      publishedDate: data.publish_date || null,
      subjects: [],
      pageCount: data.number_of_pages || null,
      synopsis,
      language: languages[0] || null,
      isbn,
      images,
      url: `${OPENLIBRARY_BASE_URL}/books/${olId}`,
      physicalFormat: data.physical_format || null,
      workKey: data.works?.[0]?.key || null,
      allLanguages: languages,
      source: 'openlibrary'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTEURS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des auteurs
   * @param {string} query - Nom de l'auteur
   * @param {Object} options
   */
  async searchAuthors(query, options = {}) {
    const { maxResults = DEFAULT_MAX_RESULTS } = options;
    const limit = Math.min(Math.max(1, maxResults), MAX_RESULTS_LIMIT);

    this.log.debug(`Recherche auteurs: "${query}" (max=${limit})`);

    const url = `${OPENLIBRARY_BASE_URL}/search/authors.json?q=${encodeURIComponent(query)}&limit=${limit}`;

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new BadGatewayError(`OpenLibrary HTTP ${response.status}`);
    }

    const data = await response.json();
    const docs = data.docs || [];
    const numFound = data.numFound || 0;

    const authors = docs.map((doc, index) => this.parseAuthorDoc(doc, index + 1));

    this.log.info(`✅ ${numFound} auteurs trouvés, ${authors.length} retournés pour "${query}"`);

    return {
      success: true,
      provider: 'openlibrary',
      domain: 'books',
      query,
      searchType: 'authors',
      total: numFound,
      count: authors.length,
      pagination: {
        page: 1,
        limit,
        hasMore: numFound > limit
      },
      data: authors,
      meta: { fetchedAt: new Date().toISOString() }
    };
  }

  /**
   * Récupérer les détails d'un auteur
   * @param {string} authorId - ID OpenLibrary (ex: OL19981A)
   */
  async getAuthorDetails(authorId) {
    const cleanId = authorId.startsWith('OL') ? authorId : `OL${authorId}A`;

    this.log.debug(`Détails auteur: ${cleanId}`);

    const url = `${OPENLIBRARY_BASE_URL}/authors/${cleanId}.json`;

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError(`Auteur ${authorId} non trouvé`);
      }
      throw new BadGatewayError(`OpenLibrary HTTP ${response.status}`);
    }

    const data = await response.json();
    const author = this.parseAuthorDetail(data, cleanId);

    this.log.info(`✅ Auteur récupéré: ${author.name}`);

    return author;
  }

  /**
   * Récupérer les œuvres d'un auteur
   * @param {string} authorId - ID OpenLibrary (ex: OL19981A)
   * @param {Object} options
   */
  async getAuthorWorks(authorId, options = {}) {
    const cleanId = authorId.startsWith('OL') ? authorId : `OL${authorId}A`;
    const { limit: optLimit, offset: optOffset, page, maxResults } = options;
    
    // Supporte limit/offset OU page/maxResults
    const limit = Math.min(Math.max(1, optLimit || maxResults || 50), MAX_RESULTS_LIMIT);
    const offset = optOffset !== undefined ? optOffset : ((page || 1) - 1) * limit;
    const currentPage = Math.floor(offset / limit) + 1;

    this.log.debug(`Œuvres auteur ${cleanId}: offset=${offset}, limit=${limit}`);

    const url = `${OPENLIBRARY_BASE_URL}/authors/${cleanId}/works.json?limit=${limit}&offset=${offset}`;

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError(`Auteur ${authorId} non trouvé`);
      }
      throw new BadGatewayError(`OpenLibrary HTTP ${response.status}`);
    }

    const data = await response.json();
    const entries = data.entries || [];
    const totalWorks = data.size || 0;

    const works = entries.map((entry, index) => this.parseAuthorWork(entry, offset + index + 1));

    this.log.info(`✅ ${totalWorks} œuvres au total, ${works.length} retournées pour ${cleanId}`);

    return {
      success: true,
      provider: 'openlibrary',
      domain: 'books',
      query: cleanId,
      total: totalWorks,
      count: works.length,
      pagination: {
        page: currentPage,
        limit,
        hasMore: offset + works.length < totalWorks
      },
      data: works,
      meta: { fetchedAt: new Date().toISOString() }
    };
  }

  /**
   * Parser un document auteur de recherche → Format B canonique
   */
  parseAuthorDoc(doc, position) {
    const sourceId = doc.key || null;
    return {
      id: sourceId ? `openlibrary:${sourceId}` : null,
      type: 'author',
      source: 'openlibrary',
      sourceId,
      title: doc.name || null,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: null,
        thumbnail: null,
        gallery: []
      },
      urls: {
        source: sourceId ? `${OPENLIBRARY_BASE_URL}/authors/${sourceId}` : null,
        detail: sourceId ? `/api/books/openlibrary/author/${sourceId}` : null
      },
      details: {
        alternateNames: doc.alternate_names || [],
        birthDate: doc.birth_date || null,
        deathDate: doc.death_date || null,
        topWork: doc.top_work || null,
        workCount: doc.work_count || 0,
        topSubjects: doc.top_subjects?.slice(0, 5) || [],
        ratingsAverage: doc.ratings_average || null,
        ratingsCount: doc.ratings_count || 0,
        position
      }
    };
  }

  /**
   * Parser les détails d'un auteur → Format B canonique
   */
  parseAuthorDetail(data, authorId) {
    const bio = typeof data.bio === 'string' 
      ? data.bio 
      : data.bio?.value || null;

    const photos = (data.photos || []).filter(id => id > 0).map(id => ({
      small: `${OPENLIBRARY_COVERS_URL}/a/olid/${authorId}-S.jpg`,
      medium: `${OPENLIBRARY_COVERS_URL}/a/olid/${authorId}-M.jpg`,
      large: `${OPENLIBRARY_COVERS_URL}/a/olid/${authorId}-L.jpg`
    }));

    const primaryImg = photos.length > 0 ? photos[0].large : null;
    const thumbImg = photos.length > 0 ? photos[0].small : null;

    return {
      id: `openlibrary:${authorId}`,
      type: 'author',
      source: 'openlibrary',
      sourceId: authorId,
      title: data.name || null,
      titleOriginal: data.personal_name || null,
      description: bio,
      year: null,
      images: {
        primary: primaryImg,
        thumbnail: thumbImg,
        gallery: photos.map(p => p.large).filter(Boolean)
      },
      urls: {
        source: `${OPENLIBRARY_BASE_URL}/authors/${authorId}`,
        detail: `/api/books/openlibrary/author/${authorId}`
      },
      details: {
        alternateNames: data.alternate_names || [],
        personalName: data.personal_name || null,
        birthDate: data.birth_date || null,
        deathDate: data.death_date || null,
        wikipedia: data.wikipedia || null,
        remoteIds: data.remote_ids || null,
        links: (data.links || []).map(link => ({
          title: link.title,
          url: link.url
        })),
        photos,
        lastModified: data.last_modified?.value || null
      }
    };
  }

  /**
   * Parser une œuvre d'auteur → Format B canonique
   */
  parseAuthorWork(entry, position) {
    const workId = entry.key?.replace('/works/', '') || null;
    const coverIds = entry.covers || [];
    const coverUrl = coverIds.length > 0 
      ? `${OPENLIBRARY_COVERS_URL}/b/id/${coverIds[0]}-L.jpg`
      : null;
    const thumbUrl = coverIds.length > 0
      ? `${OPENLIBRARY_COVERS_URL}/b/id/${coverIds[0]}-M.jpg`
      : null;
    const desc = typeof entry.description === 'string'
      ? entry.description
      : entry.description?.value || null;

    return {
      id: workId ? `openlibrary:${workId}` : null,
      type: 'book',
      source: 'openlibrary',
      sourceId: workId,
      title: entry.title || null,
      titleOriginal: null,
      description: desc,
      year: entry.first_publish_date ? parseInt(String(entry.first_publish_date).match(/\d{4}/)?.[0]) || null : null,
      images: {
        primary: coverUrl,
        thumbnail: thumbUrl,
        gallery: coverUrl ? [coverUrl] : []
      },
      urls: {
        source: workId ? `${OPENLIBRARY_BASE_URL}/works/${workId}` : null,
        detail: workId ? `/api/books/openlibrary/${workId}` : null
      },
      details: {
        subjects: entry.subjects?.slice(0, 10) || [],
        subjectPlaces: entry.subject_places || [],
        subjectPeople: entry.subject_people || [],
        subjectTimes: entry.subject_times || [],
        created: entry.created?.value || null,
        position
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

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
   * Health check
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const url = `${OPENLIBRARY_BASE_URL}/search.json?q=test&limit=1`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Tako-API/1.0' },
        signal: AbortSignal.timeout(5000)
      });

      return {
        healthy: response.ok,
        latency: Date.now() - startTime,
        message: response.ok ? 'OpenLibrary API disponible' : `HTTP ${response.status}`
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

export default OpenLibraryProvider;
