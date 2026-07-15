/**
 * TMDB Provider
 * 
 * Provider pour l'API The Movie Database (TMDB).
 * Nécessite une clé API (TMDB_API_KEY).
 * 
 * @see https://developer.themoviedb.org/docs
 * 
 * FEATURES:
 * - Recherche multi (films, séries, personnes)
 * - Détails films avec credits, videos, recommendations
 * - Détails séries avec saisons, épisodes
 * - Collections/Sagas
 * - Filmographie réalisateurs
 * - Traduction automatique optionnelle (autoTrad)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { TmdbNormalizer } from '../normalizers/tmdb.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { createLogger } from '../../../shared/utils/logger.js';
import { env } from '../../../config/env.js';

// Configuration
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS_LIMIT = 100;

export class TmdbProvider extends BaseProvider {
  constructor() {
    super({
      name: 'tmdb',
      domain: 'media',
      baseUrl: TMDB_BASE_URL,
      timeout: 20000,
      retries: 2,
      retryDelay: 1000
    });

    this.normalizer = new TmdbNormalizer();
    this.log = createLogger('TmdbProvider');
    this.apiKey = env.TMDB_API_KEY || env.TMDB_KEY;
    this.imageBaseUrl = TMDB_IMAGE_BASE_URL;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  buildUrl(endpoint, params = {}) {
    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    
    return url.toString();
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async fetchWithRetry(url, retries = this.retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Tako-API/1.0'
          },
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
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
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche multi sur TMDB (films, séries, personnes)
   */
  async search(query, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const {
      page = 1,
      pageSize = DEFAULT_MAX_RESULTS,
      lang = 'fr-FR',
      type = 'multi',  // multi, movie, tv, person
      year = null,
      includeAdult = false
    } = options;

    this.log.debug(`Recherche: "${query}" (type: ${type}, lang: ${lang})`);

    const params = {
      query,
      language: lang,
      page,
      include_adult: includeAdult
    };

    if (year) {
      if (type === 'movie') params.primary_release_year = year;
      else if (type === 'tv') params.first_air_date_year = year;
      else params.year = year;
    }

    const url = this.buildUrl(`/search/${type}`, params);
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB: pas de réponse');
    }

    const results = (data.results || []).slice(0, pageSize);

    return this.normalizer.normalizeSearchResponse(results, {
      query,
      searchType: type,
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: results.length,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  /**
   * Recherche uniquement les films
   */
  async searchMovies(query, options = {}) {
    return this.search(query, { ...options, type: 'movie' });
  }

  /**
   * Recherche uniquement les séries
   */
  async searchSeries(query, options = {}) {
    return this.search(query, { ...options, type: 'tv' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS FILM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un film par ID
   */
  async getMovie(id, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { lang = 'fr-FR' } = options;

    this.log.debug(`Récupération film: ${id}`);

    const url = this.buildUrl(`/movie/${id}`, {
      language: lang,
      append_to_response: 'credits,videos,keywords,recommendations,similar,external_ids,release_dates'
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new NotFoundError(`Film TMDB ${id} non trouvé`);
    }

    return this.normalizer.normalizeMovieDetail(data, { imageBaseUrl: this.imageBaseUrl });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une série par ID
   */
  async getSeries(id, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { lang = 'fr-FR' } = options;

    this.log.debug(`Récupération série: ${id}`);

    const url = this.buildUrl(`/tv/${id}`, {
      language: lang,
      append_to_response: 'credits,videos,keywords,recommendations,similar,external_ids,content_ratings'
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new NotFoundError(`Série TMDB ${id} non trouvée`);
    }

    return this.normalizer.normalizeSeriesDetail(data, { imageBaseUrl: this.imageBaseUrl });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAISON
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une saison
   */
  async getSeason(seriesId, seasonNumber, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { lang = 'fr-FR' } = options;

    this.log.debug(`Récupération saison ${seasonNumber} de la série ${seriesId}`);

    const url = this.buildUrl(`/tv/${seriesId}/season/${seasonNumber}`, {
      language: lang,
      append_to_response: 'credits,videos'
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new NotFoundError(`Saison ${seasonNumber} de la série ${seriesId} non trouvée`);
    }

    return this.normalizer.normalizeSeasonDetail(data, { 
      seriesId, 
      imageBaseUrl: this.imageBaseUrl 
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉPISODE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un épisode
   */
  async getEpisode(seriesId, seasonNumber, episodeNumber, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { lang = 'fr-FR' } = options;

    this.log.debug(`Récupération épisode S${seasonNumber}E${episodeNumber} de la série ${seriesId}`);

    const url = this.buildUrl(`/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`, {
      language: lang,
      append_to_response: 'credits,videos'
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new NotFoundError(`Épisode S${seasonNumber}E${episodeNumber} de la série ${seriesId} non trouvé`);
    }

    return this.normalizer.normalizeEpisodeDetail(data, { 
      seriesId,
      seasonNumber,
      imageBaseUrl: this.imageBaseUrl 
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLECTION / SAGA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une collection/saga
   */
  async getCollection(id, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { lang = 'fr-FR' } = options;

    this.log.debug(`Récupération collection: ${id}`);

    const url = this.buildUrl(`/collection/${id}`, {
      language: lang
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new NotFoundError(`Collection TMDB ${id} non trouvée`);
    }

    return this.normalizer.normalizeCollectionDetail(data, { imageBaseUrl: this.imageBaseUrl });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNE / RÉALISATEUR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une personne
   */
  async getPerson(id, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { lang = 'fr-FR' } = options;

    this.log.debug(`Récupération personne: ${id}`);

    const url = this.buildUrl(`/person/${id}`, {
      language: lang,
      append_to_response: 'movie_credits,tv_credits,external_ids'
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new NotFoundError(`Personne TMDB ${id} non trouvée`);
    }

    return this.normalizer.normalizePersonDetail(data, { imageBaseUrl: this.imageBaseUrl });
  }

  /**
   * Récupère les films d'un réalisateur
   */
  async getDirectorMovies(id, options = {}) {
    const person = await this.getPerson(id, options);
    
    // person est normalisé Format B — movieCredits est dans details
    const directedMovies = (person.details?.movieCredits?.crew || [])
      .filter(credit => credit.job === 'Director')
      .sort((a, b) => {
        // Trier par date de sortie décroissante
        const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date(0);
        const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date(0);
        return dateB - dateA;
      });

    return {
      person: {
        id: person.id,
        name: person.title,
        profile: person.images?.primary,
        knownForDepartment: person.details?.knownForDepartment
      },
      movies: directedMovies,
      total: directedMovies.length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISCOVER (Bonus)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Découvrir des films selon critères
   */
  async discoverMovies(options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const {
      lang = 'fr-FR',
      page = 1,
      sortBy = 'popularity.desc',
      year = null,
      genre = null,
      withDirector = null
    } = options;

    const params = {
      language: lang,
      page,
      sort_by: sortBy
    };

    if (year) params.primary_release_year = year;
    if (genre) params.with_genres = genre;
    if (withDirector) params.with_crew = withDirector;

    const url = this.buildUrl('/discover/movie', params);
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB discover');
    }

    return this.normalizer.normalizeSearchResponse(data.results || [], {
      query: 'discover',
      searchType: 'movie',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: data.results?.length || 0,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  /**
   * Découvrir des séries selon critères
   */
  async discoverSeries(options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const {
      lang = 'fr-FR',
      page = 1,
      sortBy = 'popularity.desc',
      year = null,
      genre = null
    } = options;

    const params = {
      language: lang,
      page,
      sort_by: sortBy
    };

    if (year) params.first_air_date_year = year;
    if (genre) params.with_genres = genre;

    const url = this.buildUrl('/discover/tv', params);
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB discover series');
    }

    return this.normalizer.normalizeSearchResponse(data.results || [], {
      query: 'discover',
      searchType: 'series',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: data.results?.length || 0,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRENDING / POPULAR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les films/séries trending
   * @param {string} mediaType - Type de media (movie ou tv)
   * @param {string} timeWindow - Fenêtre temporelle (day ou week)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultats trending normalisés
   */
  async getTrending(mediaType = 'movie', timeWindow = 'week', options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    // Validation
    if (!['movie', 'tv'].includes(mediaType)) {
      throw new ValidationError('mediaType doit être "movie" ou "tv"');
    }

    if (!['day', 'week'].includes(timeWindow)) {
      throw new ValidationError('timeWindow doit être "day" ou "week"');
    }

    const { 
      limit = DEFAULT_MAX_RESULTS, 
      lang = 'fr-FR',
      page = 1 
    } = options;

    this.log.debug(`Trending ${mediaType} (${timeWindow}), limit: ${limit}`);

    const url = this.buildUrl(`/trending/${mediaType}/${timeWindow}`, {
      language: lang,
      page
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB trending');
    }

    // Limiter les résultats
    const results = (data.results || []).slice(0, Math.min(limit, MAX_RESULTS_LIMIT));

    return this.normalizer.normalizeSearchResponse(results, {
      query: `trending-${mediaType}-${timeWindow}`,
      searchType: mediaType === 'movie' ? 'movie' : 'tv',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: results.length,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  /**
   * Récupère les films/séries populaires
   * @param {string} mediaType - Type de media (movie ou tv)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultats populaires normalisés
   */
  async getPopular(mediaType = 'movie', options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    // Validation
    if (!['movie', 'tv'].includes(mediaType)) {
      throw new ValidationError('mediaType doit être "movie" ou "tv"');
    }

    const { 
      limit = DEFAULT_MAX_RESULTS, 
      lang = 'fr-FR',
      page = 1 
    } = options;

    this.log.debug(`Popular ${mediaType}, limit: ${limit}`);

    const url = this.buildUrl(`/${mediaType}/popular`, {
      language: lang,
      page
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB popular');
    }

    // Limiter les résultats
    const results = (data.results || []).slice(0, Math.min(limit, MAX_RESULTS_LIMIT));

    return this.normalizer.normalizeSearchResponse(results, {
      query: `popular-${mediaType}`,
      searchType: mediaType === 'movie' ? 'movie' : 'tv',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: results.length,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  /**
   * Récupère les films/séries top rated
   * @param {string} mediaType - Type de media (movie ou tv)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultats top rated normalisés
   */
  async getTopRated(mediaType = 'movie', options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    // Validation
    if (!['movie', 'tv'].includes(mediaType)) {
      throw new ValidationError('mediaType doit être "movie" ou "tv"');
    }

    const { 
      limit = DEFAULT_MAX_RESULTS, 
      lang = 'fr-FR',
      page = 1 
    } = options;

    this.log.debug(`Top rated ${mediaType}, limit: ${limit}`);

    const url = this.buildUrl(`/${mediaType}/top_rated`, {
      language: lang,
      page
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB top_rated');
    }

    // Limiter les résultats
    const results = (data.results || []).slice(0, Math.min(limit, MAX_RESULTS_LIMIT));

    return this.normalizer.normalizeSearchResponse(results, {
      query: `top-rated-${mediaType}`,
      searchType: mediaType === 'movie' ? 'movie' : 'tv',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: results.length,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  /**
   * Récupère les contenus à venir (upcoming)
   * Pour movies: API /movie/upcoming
   * Pour TV: Discover avec first_air_date >= today
   * @param {string} mediaType - Type de media (movie ou tv)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultats upcoming normalisés
   */
  async getUpcoming(mediaType = 'movie', options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    // Validation
    if (!['movie', 'tv'].includes(mediaType)) {
      throw new ValidationError('mediaType doit être "movie" ou "tv"');
    }

    const { 
      limit = DEFAULT_MAX_RESULTS, 
      lang = 'fr-FR',
      page = 1 
    } = options;

    this.log.debug(`Upcoming ${mediaType}, limit: ${limit}`);

    // Utiliser discover avec filtre de date pour les deux types
    // car /movie/upcoming retourne des films du passé
    const today = new Date().toISOString().split('T')[0];
    
    let url;
    if (mediaType === 'movie') {
      // Pour les films: discover avec release_date >= aujourd'hui
      // Tri par popularité pour avoir les films les plus attendus
      url = this.buildUrl('/discover/movie', {
        language: lang,
        page,
        'primary_release_date.gte': today,
        'sort_by': 'popularity.desc'
      });
    } else {
      // Pour les séries: discover avec first_air_date >= aujourd'hui
      // Tri par popularité pour avoir les séries les plus attendues
      url = this.buildUrl('/discover/tv', {
        language: lang,
        page,
        'first_air_date.gte': today,
        'sort_by': 'popularity.desc'
      });
    }

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError(`Erreur TMDB upcoming ${mediaType}`);
    }

    // Limiter les résultats
    const results = (data.results || []).slice(0, Math.min(limit, MAX_RESULTS_LIMIT));

    return this.normalizer.normalizeSearchResponse(results, {
      query: `upcoming-${mediaType}`,
      searchType: mediaType === 'movie' ? 'movie' : 'tv',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: results.length,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  /**
   * Récupère les séries en cours de diffusion (7 prochains jours)
   * API: /tv/on_the_air
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultats on the air normalisés
   */
  async getOnTheAir(options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { 
      limit = DEFAULT_MAX_RESULTS, 
      lang = 'fr-FR',
      page = 1 
    } = options;

    this.log.debug(`On the air, limit: ${limit}`);

    const url = this.buildUrl('/tv/on_the_air', {
      language: lang,
      page
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB on_the_air');
    }

    // Limiter les résultats
    const results = (data.results || []).slice(0, Math.min(limit, MAX_RESULTS_LIMIT));

    return this.normalizer.normalizeSearchResponse(results, {
      query: 'on-the-air',
      searchType: 'tv',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: results.length,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }

  /**
   * Récupère les séries diffusées aujourd'hui
   * API: /tv/airing_today
   * @param {Object} options - Options
   * @returns {Promise<Object>} Résultats airing today normalisés
   */
  async getAiringToday(options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TMDB_API_KEY non configurée');
    }

    const { 
      limit = DEFAULT_MAX_RESULTS, 
      lang = 'fr-FR',
      page = 1 
    } = options;

    this.log.debug(`Airing today, limit: ${limit}`);

    const url = this.buildUrl('/tv/airing_today', {
      language: lang,
      page
    });

    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur TMDB airing_today');
    }

    // Limiter les résultats
    const results = (data.results || []).slice(0, Math.min(limit, MAX_RESULTS_LIMIT));

    return this.normalizer.normalizeSearchResponse(results, {
      query: 'airing-today',
      searchType: 'tv',
      total: data.total_results,
      pagination: {
        page: data.page,
        limit: results.length,
        hasMore: data.page < data.total_pages
      },
      imageBaseUrl: this.imageBaseUrl
    });
  }
}

// Export singleton
export const tmdbProvider = new TmdbProvider();
