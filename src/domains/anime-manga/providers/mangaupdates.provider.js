/**
 * MangaUpdates Provider
 * 
 * Provider pour l'API MangaUpdates.
 * API REST gratuite, pas de clé API requise.
 * 
 * @see https://api.mangaupdates.com/v1/docs
 * 
 * FEATURES:
 * - Recherche manga/manhwa/manhua (séries, auteurs)
 * - Détails complets avec descriptions, genres, catégories
 * - Informations auteurs avec œuvres
 * - Pas de filtre adulte
 * - Traduction automatique optionnelle
 * 
 * TYPES SUPPORTÉS:
 * - Manga (Japon)
 * - Manhwa (Corée)
 * - Manhua (Chine)
 * - Novel, Light Novel
 * - Doujinshi
 * - Artbook
 * - OEL (Original English Language)
 * 
 * RATE LIMIT : Raisonnable (pas documenté officiellement)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { MangaUpdatesNormalizer } from '../normalizers/mangaupdates.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

// Configuration
const MANGAUPDATES_BASE_URL = 'https://api.mangaupdates.com/v1';
const DEFAULT_MAX_RESULTS = 25;
const MAX_RESULTS_LIMIT = 100;

export class MangaUpdatesProvider extends BaseProvider {
  constructor() {
    super({
      name: 'mangaupdates',
      domain: 'anime-manga',
      baseUrl: MANGAUPDATES_BASE_URL,
      timeout: 20000,
      retries: 2,
      retryDelay: 1000
    });

    this.normalizer = new MangaUpdatesNormalizer();
    this.log = createLogger('MangaUpdatesProvider');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construit l'URL avec les paramètres
   */
  buildUrl(endpoint) {
    return `${MANGAUPDATES_BASE_URL}${endpoint}`;
  }

  /**
   * Vérifie si le provider est configuré (toujours OK, pas de clé requise)
   */
  isConfigured() {
    return true;
  }

  /**
   * Fetch avec retry et gestion d'erreurs
   */
  async fetchWithRetry(url, options = {}, retries = this.retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Tako-API/1.0',
            ...options.headers
          },
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        this.log.warn(`Tentative ${attempt + 1} échouée, retry dans ${this.retryDelay}ms`);
        await new Promise(r => setTimeout(r, this.retryDelay));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  async healthCheck() {
    const start = Date.now();

    try {
      const url = this.buildUrl('/series/search');
      const data = await this.fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify({ search: 'test', perpage: 1 })
      });

      const latency = Date.now() - start;

      if (data && typeof data.total_hits !== 'undefined') {
        return {
          healthy: true,
          latency,
          message: 'MangaUpdates API disponible'
        };
      }

      return {
        healthy: false,
        latency,
        message: 'Réponse invalide'
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        message: error.message || 'Erreur de connexion'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE SÉRIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche de séries manga
   * @param {string} query - Terme de recherche
   * @param {Object} options - Options de recherche
   * @param {number} [options.page=1] - Page
   * @param {number} [options.maxResults=25] - Résultats par page
   * @param {string} [options.type] - Type: Manga, Manhwa, Manhua, Novel, etc.
   * @param {string[]} [options.genres] - Filtrer par genres
   * @param {number} [options.year] - Année de sortie
   * @param {boolean} [options.licensed] - Seulement les séries licenciées
   * @returns {Promise<Object>} Résultats normalisés
   */
  async search(query, options = {}) {
    const {
      page = 1,
      maxResults = DEFAULT_MAX_RESULTS,
      type,
      genres,
      year,
      licensed
    } = options;

    const perpage = Math.min(maxResults, MAX_RESULTS_LIMIT);
    // MangaUpdates API ignore perpage < 5 (retourne 25 par défaut)
    const apiPerpage = Math.max(perpage, 5);
    
    // Construire le body de la requête
    const body = {
      search: query,
      page,
      perpage: apiPerpage
    };

    // Filtres optionnels
    if (type) {
      body.type = type;
    }
    if (genres && genres.length > 0) {
      body.genres = genres;
    }
    if (year) {
      body.year = String(year);
    }
    if (licensed !== undefined) {
      body.licensed = licensed ? 'yes' : 'no';
    }

    try {
      const url = this.buildUrl('/series/search');
      const data = await this.fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      // Tronquer si on a demandé moins que le minimum API
      if (perpage < apiPerpage && data?.results) {
        data.results = data.results.slice(0, perpage);
      }

      return this.normalizer.normalizeSearchResponse(data, {
        query,
        page,
        pageSize: perpage
      });
    } catch (error) {
      this.log.error('Erreur recherche série:', error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  /**
   * Recherche par titre exact (pour correspondance)
   */
  async searchExact(title, options = {}) {
    return this.search(title, { ...options, maxResults: 10 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une série par son ID
   * @param {string|number} id - ID MangaUpdates
   * @returns {Promise<Object>} Détails normalisés
   */
  async getById(id) {
    if (!id) {
      throw new ValidationError('ID de série requis');
    }

    try {
      const url = this.buildUrl(`/series/${id}`);
      const data = await this.fetchWithRetry(url, { method: 'GET' });

      if (!data || !data.series_id) {
        throw new NotFoundError(`Série ${id} non trouvée`);
      }

      return this.normalizer.normalizeSeriesDetails(data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.log.error(`Erreur détails série ${id}:`, error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  /**
   * Alias pour getById
   */
  async getSeries(id) {
    return this.getById(id);
  }

  /**
   * Récupère les recommandations pour une série
   * @param {string|number} id - ID MangaUpdates
   * @returns {Promise<Object>} Recommandations normalisées
   */
  async getSeriesRecommendations(id) {
    if (!id) {
      throw new ValidationError('ID de série requis');
    }

    try {
      const url = this.buildUrl(`/series/${id}/recommendations`);
      const data = await this.fetchWithRetry(url, { method: 'GET' });

      return this.normalizer.normalizeRecommendations(data, id);
    } catch (error) {
      this.log.error(`Erreur recommandations série ${id}:`, error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTEURS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche d'auteurs
   * @param {string} query - Nom de l'auteur
   * @param {Object} options - Options
   * @returns {Promise<Object>} Auteurs normalisés
   */
  async searchAuthors(query, options = {}) {
    const { page = 1, maxResults = DEFAULT_MAX_RESULTS } = options;
    const perpage = Math.min(maxResults, MAX_RESULTS_LIMIT);

    try {
      const url = this.buildUrl('/authors/search');
      const data = await this.fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify({
          search: query,
          page,
          perpage
        })
      });

      return this.normalizer.normalizeAuthorSearchResponse(data, {
        query,
        page,
        pageSize: perpage
      });
    } catch (error) {
      this.log.error('Erreur recherche auteur:', error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  /**
   * Récupère les détails d'un auteur
   * @param {string|number} id - ID de l'auteur
   * @returns {Promise<Object>} Détails auteur normalisés
   */
  async getAuthor(id) {
    if (!id) {
      throw new ValidationError('ID auteur requis');
    }

    try {
      const url = this.buildUrl(`/authors/${id}`);
      const data = await this.fetchWithRetry(url, { method: 'GET' });

      // L'API retourne 'id' pas 'author_id'
      if (!data || !data.id) {
        throw new NotFoundError(`Auteur ${id} non trouvé`);
      }

      return this.normalizer.normalizeAuthorDetails(data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.log.error(`Erreur détails auteur ${id}:`, error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  /**
   * Récupère les œuvres d'un auteur
   * @param {string|number} id - ID de l'auteur
   * @param {Object} options - Options (page, maxResults)
   * @returns {Promise<Object>} Œuvres de l'auteur
   */
  async getAuthorWorks(id, options = {}) {
    if (!id) {
      throw new ValidationError('ID auteur requis');
    }

    try {
      const { orderBy = 'year' } = options;
      const url = this.buildUrl(`/authors/${id}/series`);
      // L'API MangaUpdates utilise POST pour cet endpoint
      const data = await this.fetchWithRetry(url, { 
        method: 'POST',
        body: JSON.stringify({
          orderby: orderBy
        })
      });

      return this.normalizer.normalizeAuthorWorks(data, id);
    } catch (error) {
      this.log.error(`Erreur œuvres auteur ${id}:`, error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENRES & CATÉGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Liste tous les genres disponibles
   * @returns {Promise<Object>} Liste des genres
   */
  async getGenres() {
    try {
      const url = this.buildUrl('/genres');
      const data = await this.fetchWithRetry(url, { method: 'GET' });

      return {
        data: data || [],
        total: data?.length || 0,
        source: 'mangaupdates'
      };
    } catch (error) {
      this.log.error('Erreur récupération genres:', error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  /**
   * Recherche de catégories
   * @param {string} query - Terme de recherche
   * @returns {Promise<Object>} Catégories trouvées
   */
  async searchCategories(query) {
    try {
      const url = this.buildUrl('/categories/search');
      const data = await this.fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify({ search: query })
      });

      return {
        data: data?.results || [],
        total: data?.total_hits || 0,
        source: 'mangaupdates'
      };
    } catch (error) {
      this.log.error('Erreur recherche catégories:', error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RELEASES (Sorties/Chapitres)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche les dernières releases
   * @param {Object} options - Options de recherche
   * @param {string} [options.search] - Terme de recherche
   * @param {number} [options.page=1] - Page
   * @param {number} [options.maxResults=25] - Résultats par page
   * @returns {Promise<Object>} Releases normalisées
   */
  async searchReleases(options = {}) {
    const { search, page = 1, maxResults = DEFAULT_MAX_RESULTS } = options;
    const perpage = Math.min(maxResults, MAX_RESULTS_LIMIT);

    const body = { page, perpage };
    if (search) {
      body.search = search;
    }

    try {
      const url = this.buildUrl('/releases/search');
      const data = await this.fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      return this.normalizer.normalizeReleasesResponse(data, {
        search,
        page,
        pageSize: perpage
      });
    } catch (error) {
      this.log.error('Erreur recherche releases:', error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLISHERS (Éditeurs)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche d'éditeurs
   * @param {string} query - Nom de l'éditeur
   * @param {Object} options - Options
   * @returns {Promise<Object>} Éditeurs normalisés
   */
  async searchPublishers(query, options = {}) {
    const { page = 1, maxResults = DEFAULT_MAX_RESULTS } = options;
    const perpage = Math.min(maxResults, MAX_RESULTS_LIMIT);

    try {
      const url = this.buildUrl('/publishers/search');
      const data = await this.fetchWithRetry(url, {
        method: 'POST',
        body: JSON.stringify({
          search: query,
          page,
          perpage
        })
      });

      return this.normalizer.normalizePublisherSearchResponse(data, {
        query,
        page,
        pageSize: perpage
      });
    } catch (error) {
      this.log.error('Erreur recherche éditeur:', error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }

  /**
   * Détails d'un éditeur
   * @param {string|number} id - ID de l'éditeur
   * @returns {Promise<Object>} Détails éditeur normalisés
   */
  async getPublisher(id) {
    if (!id) {
      throw new ValidationError('ID éditeur requis');
    }

    try {
      const url = this.buildUrl(`/publishers/${id}`);
      const data = await this.fetchWithRetry(url, { method: 'GET' });

      if (!data || !data.publisher_id) {
        throw new NotFoundError(`Éditeur ${id} non trouvé`);
      }

      return this.normalizer.normalizePublisherDetails(data);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.log.error(`Erreur détails éditeur ${id}:`, error.message);
      throw new BadGatewayError(`MangaUpdates: ${error.message}`);
    }
  }
}

export default MangaUpdatesProvider;
