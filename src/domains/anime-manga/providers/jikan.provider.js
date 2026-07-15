/**
 * Jikan Provider (MyAnimeList API)
 * 
 * Provider pour l'API Jikan (unofficial MAL API).
 * API REST gratuite, pas de clé API requise.
 * 
 * @see https://docs.api.jikan.moe/
 * 
 * FEATURES:
 * - Recherche anime et manga (SANS filtre hentai/adulte)
 * - Détails complets avec épisodes, personnages, staff
 * - Saisons anime (par année/saison)
 * - Classements (top anime/manga)
 * - Recommandations
 * - Informations studios/producteurs
 * 
 * IMPORTANT: Aucune restriction sur le contenu adulte/hentai
 * Le paramètre sfw=false est TOUJOURS utilisé pour inclure tout le contenu.
 * 
 * RATE LIMIT : 
 * - 3 requêtes/seconde
 * - 60 requêtes/minute
 * - Retry automatique avec backoff
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { JikanNormalizer } from '../normalizers/jikan.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

// Configuration
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const DEFAULT_MAX_RESULTS = 25;
const MAX_RESULTS_LIMIT = 25; // Jikan limite à 25 par page
const RATE_LIMIT_DELAY = 350; // ~3 req/sec

// Dernier appel pour respecter le rate limit
let lastRequestTime = 0;

export class JikanProvider extends BaseProvider {
  constructor() {
    super({
      name: 'jikan',
      domain: 'anime-manga',
      baseUrl: JIKAN_BASE_URL,
      timeout: 30000,
      retries: 3,
      retryDelay: 1500
    });

    this.normalizer = new JikanNormalizer();
    this.log = createLogger('JikanProvider');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Respecte le rate limit de Jikan
   */
  async respectRateLimit() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY - elapsed));
    }
    lastRequestTime = Date.now();
  }

  /**
   * Récupère les images/artworks d'un anime (pour backdrop)
   * @param {number} malId - ID MyAnimeList
   * @returns {Promise<Array>} Liste des images
   */
  async getAnimePictures(malId) {
    try {
      const url = `${this.baseUrl}/anime/${malId}/pictures`;
      const response = await this.fetchWithRetry(url);
      return response.data || [];
    } catch (error) {
      this.log.warn(`Impossible de récupérer pictures pour anime ${malId}:`, error.message);
      return [];
    }
  }

  /**
   * Sélectionne le meilleur backdrop depuis les pictures
   * Priorité: artwork paysage > première image > null
   * @param {Array} pictures - Tableau de pictures Jikan
   * @returns {string|null} URL du backdrop
   */
  selectBackdrop(pictures) {
    if (!pictures || pictures.length === 0) return null;
    
    // Prendre la première image large disponible (key visual)
    const firstPicture = pictures[0];
    return firstPicture?.jpg?.large_image_url || 
           firstPicture?.jpg?.image_url || 
           firstPicture?.webp?.large_image_url ||
           firstPicture?.webp?.image_url || 
           null;
  }

  /**
   * Enrichit un tableau d'anime avec des backdrops
   * @param {Array} animeList - Liste d'items anime normalisés
   * @returns {Promise<Array>} - Liste enrichie
   */
  async enrichAnimeWithBackdrops(animeList) {
    if (!animeList || !Array.isArray(animeList) || animeList.length === 0) {
      this.log.debug('enrichAnimeWithBackdrops: no data to enrich');
      return animeList;
    }

    this.log.debug(`enrichAnimeWithBackdrops: processing ${animeList.length} items`);

    // Enrichir en parallèle (limite 3 req/sec respectée par getAnimePictures)
    const enriched = await Promise.all(
      animeList.map(async (anime) => {
        if (!anime.sourceId) {
          this.log.warn(`enrichAnimeWithBackdrops: item has no sourceId`, anime.id);
          return anime;
        }
        
        try {
          const pictures = await this.getAnimePictures(anime.sourceId);
          const backdrop = this.selectBackdrop(pictures);
          this.log.debug(`Backdrop for ${anime.sourceId}: ${backdrop ? 'found' : 'null'}`);
          return { ...anime, images: { ...anime.images, backdrop }, details: { ...anime.details, backdrop } };
        } catch (error) {
          this.log.warn(`Backdrop unavailable for ${anime.sourceId}:`, error.message);
          return anime;
        }
      })
    );

    return enriched;
  }

  /**
   * Vérifie si le provider est configuré (toujours OK, pas de clé requise)
   */
  isConfigured() {
    return true;
  }

  /**
   * Fetch avec rate limit et retry
   */
  async fetchWithRetry(url, retries = this.retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.respectRateLimit();

        this.log.debug(`Fetch: ${url}`);
        
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Tako-API/1.0'
          },
          signal: AbortSignal.timeout(this.timeout)
        });

        // Gestion du rate limit (429)
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
          this.log.warn(`Rate limit atteint, attente de ${retryAfter}s`);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        const delay = this.retryDelay * Math.pow(2, attempt);
        this.log.warn(`Tentative ${attempt + 1} échouée, retry dans ${delay}ms: ${error.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  async healthCheck() {
    const start = Date.now();

    try {
      const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/anime/1`);
      const latency = Date.now() - start;

      if (data?.data) {
        return {
          healthy: true,
          latency,
          message: 'Jikan API disponible'
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
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche d'anime
   * @param {string} query - Terme de recherche
   * @param {Object} options - Options
   */
  async searchAnime(query, options = {}) {
    const {
      page = 1,
      maxResults = DEFAULT_MAX_RESULTS,
      type = null,        // tv, movie, ova, special, ona, music
      status = null,      // airing, complete, upcoming
      rating = null,      // g, pg, pg13, r17, r, rx (rx = hentai)
      minScore = null,
      year = null,
      season = null,      // winter, spring, summer, fall
      genres = null,      // IDs de genres
      orderBy = null,     // mal_id, title, score, episodes, etc.
      sort = 'desc',
      sfw = 'all'         // all (défaut), sfw (sans hentai), nsfw (hentai uniquement)
    } = options;

    this.log.debug(`Recherche anime: "${query}" (page: ${page}, sfw: ${sfw})`);

    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(Math.min(maxResults, MAX_RESULTS_LIMIT))
    });

    // Gestion du filtrage SFW/NSFW
    if (sfw === 'sfw') {
      params.append('sfw', 'true');   // API filtre le hentai
    } else if (sfw === 'nsfw') {
      params.append('sfw', 'false');  // Tout inclure
      params.append('rating', 'rx');  // Mais filtrer sur rating Hentai uniquement
    } else {
      params.append('sfw', 'false');  // Défaut: tout inclure
    }

    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (rating) params.append('rating', rating);
    if (minScore) params.append('min_score', String(minScore));
    if (year) params.append('start_date', `${year}-01-01`);
    if (season) params.append('season', season);
    if (genres) params.append('genres', genres);
    if (orderBy) {
      params.append('order_by', orderBy);
      params.append('sort', sort);
    }

    const url = `${JIKAN_BASE_URL}/anime?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur Jikan: pas de réponse');
    }

    return this.normalizer.normalizeAnimeSearchResponse(data, {
      query,
      page,
      pageSize: maxResults,
      searchType: 'anime'
    });
  }

  /**
   * Recherche de manga
   * @param {string} query - Terme de recherche
   * @param {Object} options - Options
   */
  async searchManga(query, options = {}) {
    const {
      page = 1,
      maxResults = DEFAULT_MAX_RESULTS,
      type = null,        // manga, novel, lightnovel, oneshot, doujin, manhwa, manhua
      status = null,      // publishing, complete, hiatus, discontinued, upcoming
      minScore = null,
      genres = null,
      orderBy = null,
      sort = 'desc',
      sfw = 'all'         // all (défaut), sfw (sans hentai), nsfw (hentai uniquement)
    } = options;

    this.log.debug(`Recherche manga: "${query}" (page: ${page}, sfw: ${sfw})`);

    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(Math.min(maxResults, MAX_RESULTS_LIMIT))
    });

    // Gestion du filtrage SFW/NSFW
    if (sfw === 'sfw') {
      params.append('sfw', 'true');   // API filtre le hentai
    } else if (sfw === 'nsfw') {
      params.append('sfw', 'false');  // Tout inclure
      params.append('rating', 'rx');  // Mais filtrer sur rating Hentai uniquement
    } else {
      params.append('sfw', 'false');  // Défaut: tout inclure
    }

    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (minScore) params.append('min_score', String(minScore));
    if (genres) params.append('genres', genres);
    if (orderBy) {
      params.append('order_by', orderBy);
      params.append('sort', sort);
    }

    const url = `${JIKAN_BASE_URL}/manga?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur Jikan: pas de réponse');
    }

    return this.normalizer.normalizeMangaSearchResponse(data, {
      query,
      page,
      pageSize: maxResults,
      searchType: 'manga'
    });
  }

  /**
   * Recherche globale (anime + manga)
   */
  async search(query, options = {}) {
    const { type = 'all' } = options;

    if (type === 'anime') {
      return this.searchAnime(query, options);
    } else if (type === 'manga') {
      return this.searchManga(query, options);
    }

    // Recherche parallèle anime + manga
    const [animeResults, mangaResults] = await Promise.all([
      this.searchAnime(query, { ...options, maxResults: Math.ceil((options.maxResults || 20) / 2) }).catch(() => null),
      this.searchManga(query, { ...options, maxResults: Math.ceil((options.maxResults || 20) / 2) }).catch(() => null)
    ]);

    return this.normalizer.normalizeCombinedSearchResponse(animeResults, mangaResults, {
      query,
      page: options.page || 1,
      pageSize: options.maxResults || 20
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIME DÉTAILS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un anime
   * @param {number|string} id - MAL ID
   */
  async getAnime(id) {
    this.log.debug(`Récupération anime: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/anime/${id}/full`);

    if (!data?.data) {
      throw new NotFoundError(`Anime MAL ${id} non trouvé`);
    }

    return this.normalizer.normalizeAnimeDetail(data.data);
  }

  /**
   * Récupère les épisodes d'un anime
   * @param {number|string} id - MAL ID
   * @param {Object} options - Options de pagination
   */
  async getAnimeEpisodes(id, options = {}) {
    const { page = 1 } = options;
    this.log.debug(`Récupération épisodes anime: ${id} (page ${page})`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/anime/${id}/episodes?page=${page}`);

    if (!data) {
      throw new NotFoundError(`Épisodes de l'anime MAL ${id} non trouvés`);
    }

    return this.normalizer.normalizeEpisodesResponse(data, { animeId: id, page });
  }

  /**
   * Récupère les personnages d'un anime
   * @param {number|string} id - MAL ID
   */
  async getAnimeCharacters(id) {
    this.log.debug(`Récupération personnages anime: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/anime/${id}/characters`);

    if (!data) {
      throw new NotFoundError(`Personnages de l'anime MAL ${id} non trouvés`);
    }

    return this.normalizer.normalizeCharactersResponse(data, { animeId: id });
  }

  /**
   * Récupère le staff d'un anime
   * @param {number|string} id - MAL ID
   */
  async getAnimeStaff(id) {
    this.log.debug(`Récupération staff anime: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/anime/${id}/staff`);

    if (!data) {
      throw new NotFoundError(`Staff de l'anime MAL ${id} non trouvé`);
    }

    return this.normalizer.normalizeStaffResponse(data, { animeId: id });
  }

  /**
   * Récupère les recommandations pour un anime
   * @param {number|string} id - MAL ID
   */
  async getAnimeRecommendations(id) {
    this.log.debug(`Récupération recommandations anime: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/anime/${id}/recommendations`);

    if (!data) {
      return { data: [], total: 0 };
    }

    return this.normalizer.normalizeRecommendationsResponse(data, { sourceId: id, type: 'anime' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANGA DÉTAILS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un manga
   * @param {number|string} id - MAL ID
   */
  async getManga(id) {
    this.log.debug(`Récupération manga: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/manga/${id}/full`);

    if (!data?.data) {
      throw new NotFoundError(`Manga MAL ${id} non trouvé`);
    }

    return this.normalizer.normalizeMangaDetail(data.data);
  }

  /**
   * Récupère les personnages d'un manga
   * @param {number|string} id - MAL ID
   */
  async getMangaCharacters(id) {
    this.log.debug(`Récupération personnages manga: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/manga/${id}/characters`);

    if (!data) {
      throw new NotFoundError(`Personnages du manga MAL ${id} non trouvés`);
    }

    return this.normalizer.normalizeCharactersResponse(data, { mangaId: id });
  }

  /**
   * Récupère les recommandations pour un manga
   * @param {number|string} id - MAL ID
   */
  async getMangaRecommendations(id) {
    this.log.debug(`Récupération recommandations manga: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/manga/${id}/recommendations`);

    if (!data) {
      return { data: [], total: 0 };
    }

    return this.normalizer.normalizeRecommendationsResponse(data, { sourceId: id, type: 'manga' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAISONS
  // ═══════════════════════════════════════════════════════════════════════════

  // NOTE: getSeason() et getCurrentSeason() sont définis plus bas dans la section DISCOVERY
  // Ils retournent: { data, total, count, pagination: {page, limit, hasMore} }

  /**
   * Récupère la liste des saisons disponibles
   */
  async getSeasonsList() {
    this.log.debug('Récupération liste des saisons');

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/seasons`);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération des saisons');
    }

    return {
      data: data.data,
      total: data.data.length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP / CLASSEMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère le top anime
   * @param {Object} options - Options
   */
  async getTopAnime(options = {}) {
    const { 
      page = 1, 
      type = null,     // tv, movie, ova, special, ona, music
      filter = null    // airing, upcoming, bypopularity, favorite
    } = options;

    this.log.debug(`Récupération top anime (page ${page})`);

    const params = new URLSearchParams({
      page: String(page),
      sfw: 'false'  // Inclure tout le contenu
    });

    if (type) params.append('type', type);
    if (filter) params.append('filter', filter);

    const url = `${JIKAN_BASE_URL}/top/anime?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur lors de la récupération du top anime');
    }

    return this.normalizer.normalizeTopResponse(data, { page, contentType: 'anime' });
  }

  /**
   * Récupère le top manga
   * @param {Object} options - Options
   */
  async getTopManga(options = {}) {
    const { 
      page = 1, 
      type = null,     // manga, novel, lightnovel, oneshot, doujin, manhwa, manhua
      filter = null    // publishing, upcoming, bypopularity, favorite
    } = options;

    this.log.debug(`Récupération top manga (page ${page})`);

    const params = new URLSearchParams({
      page: String(page),
      sfw: 'false'  // Inclure tout le contenu
    });

    if (type) params.append('type', type);
    if (filter) params.append('filter', filter);

    const url = `${JIKAN_BASE_URL}/top/manga?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur lors de la récupération du top manga');
    }

    return this.normalizer.normalizeTopResponse(data, { page, contentType: 'manga' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNES / STAFF
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche de personnes (seiyuu, staff)
   * @param {string} query - Terme de recherche
   * @param {Object} options - Options
   */
  async searchPeople(query, options = {}) {
    const { page = 1, maxResults = DEFAULT_MAX_RESULTS } = options;

    this.log.debug(`Recherche personnes: "${query}" (page ${page})`);

    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(Math.min(maxResults, MAX_RESULTS_LIMIT))
    });

    const url = `${JIKAN_BASE_URL}/people?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur Jikan: pas de réponse');
    }

    return this.normalizer.normalizePeopleSearchResponse(data, { query, page, pageSize: maxResults });
  }

  /**
   * Récupère les détails d'une personne
   * @param {number|string} id - MAL ID
   */
  async getPerson(id) {
    this.log.debug(`Récupération personne: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/people/${id}/full`);

    if (!data?.data) {
      throw new NotFoundError(`Personne MAL ${id} non trouvée`);
    }

    return this.normalizer.normalizePersonDetail(data.data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNAGES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche de personnages
   * @param {string} query - Terme de recherche
   * @param {Object} options - Options
   */
  async searchCharacters(query, options = {}) {
    const { page = 1, maxResults = DEFAULT_MAX_RESULTS } = options;

    this.log.debug(`Recherche personnages: "${query}" (page ${page})`);

    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(Math.min(maxResults, MAX_RESULTS_LIMIT))
    });

    const url = `${JIKAN_BASE_URL}/characters?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur Jikan: pas de réponse');
    }

    return this.normalizer.normalizeCharactersSearchResponse(data, { query, page, pageSize: maxResults });
  }

  /**
   * Récupère les détails d'un personnage
   * @param {number|string} id - MAL ID
   */
  async getCharacter(id) {
    this.log.debug(`Récupération personnage: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/characters/${id}/full`);

    if (!data?.data) {
      throw new NotFoundError(`Personnage MAL ${id} non trouvé`);
    }

    return this.normalizer.normalizeCharacterDetail(data.data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENRES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère la liste des genres anime
   */
  async getAnimeGenres() {
    this.log.debug('Récupération genres anime');

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/genres/anime`);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération des genres');
    }

    return this.normalizer.normalizeGenresResponse(data, { type: 'anime' });
  }

  /**
   * Récupère la liste des genres manga
   */
  async getMangaGenres() {
    this.log.debug('Récupération genres manga');

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/genres/manga`);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération des genres');
    }

    return this.normalizer.normalizeGenresResponse(data, { type: 'manga' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTEURS / STUDIOS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un studio/producteur
   * @param {number|string} id - MAL ID
   */
  async getProducer(id) {
    this.log.debug(`Récupération producteur: ${id}`);

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/producers/${id}/full`);

    if (!data?.data) {
      throw new NotFoundError(`Producteur MAL ${id} non trouvé`);
    }

    return this.normalizer.normalizeProducerDetail(data.data);
  }

  /**
   * Recherche de studios/producteurs
   * @param {string} query - Terme de recherche
   * @param {Object} options - Options
   */
  async searchProducers(query, options = {}) {
    const { page = 1, maxResults = DEFAULT_MAX_RESULTS } = options;

    this.log.debug(`Recherche producteurs: "${query}" (page ${page})`);

    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(Math.min(maxResults, MAX_RESULTS_LIMIT))
    });

    const url = `${JIKAN_BASE_URL}/producers?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur Jikan: pas de réponse');
    }

    return this.normalizer.normalizeProducersSearchResponse(data, { query, page, pageSize: maxResults });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RANDOM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère un anime aléatoire
   */
  async getRandomAnime() {
    this.log.debug('Récupération anime aléatoire');

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/random/anime`);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération d\'un anime aléatoire');
    }

    return this.normalizer.normalizeAnimeDetail(data.data);
  }

  /**
   * Récupère un manga aléatoire
   */
  async getRandomManga() {
    this.log.debug('Récupération manga aléatoire');

    const data = await this.fetchWithRetry(`${JIKAN_BASE_URL}/random/manga`);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération d\'un manga aléatoire');
    }

    return this.normalizer.normalizeMangaDetail(data.data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère le programme de diffusion
   * @param {string} day - Jour (monday, tuesday, etc.) ou null pour tous
   */
  async getSchedules(day = null, options = {}) {
    const { page = 1 } = options;

    this.log.debug(`Récupération planning${day ? ` (${day})` : ''}`);

    const params = new URLSearchParams({
      page: String(page),
      sfw: 'false'  // Inclure tout le contenu
    });

    const endpoint = day ? `${JIKAN_BASE_URL}/schedules/${day}` : `${JIKAN_BASE_URL}/schedules`;
    const url = `${endpoint}?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data) {
      throw new BadGatewayError('Erreur lors de la récupération du planning');
    }

    return this.normalizer.normalizeScheduleResponse(data, { day, page });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP / TRENDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère le top anime ou manga
   * @param {string} type - Type (anime ou manga)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Top anime/manga normalisés
   */
  async getTop(type = 'anime', options = {}) {
    // Validation
    if (!['anime', 'manga'].includes(type)) {
      throw new ValidationError('type doit être "anime" ou "manga"');
    }

    const {
      limit = DEFAULT_MAX_RESULTS,
      page = 1,
      filter = 'bypopularity',  // bypopularity, favorite, airing (anime), publishing (manga)
      subtype = null,           // tv, movie, ova, special (anime) / manga, novel, lightnovel, etc. (manga)
      sfw = 'all'               // all, sfw, nsfw
    } = options;

    this.log.debug(`Top ${type} (filter: ${filter}, sfw: ${sfw}, limit: ${limit})`);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(Math.min(limit, MAX_RESULTS_LIMIT))
    });

    // Gestion du filtre SFW
    if (sfw === 'sfw') {
      params.append('sfw', 'true');
    } else if (sfw === 'nsfw') {
      params.append('sfw', 'false');
      params.append('rating', 'rx');  // Hentai uniquement (Rx - Hentai)
    } else {
      params.append('sfw', 'false');  // Tout inclure (défaut)
    }

    if (filter) params.append('filter', filter);
    if (subtype) params.append('type', subtype);

    const url = `${JIKAN_BASE_URL}/top/${type}?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data?.data) {
      throw new BadGatewayError(`Erreur lors de la récupération du top ${type}`);
    }

    // Normaliser les résultats
    const normalizedData = data.data.map(item =>
      type === 'anime'
        ? this.normalizer.normalizeAnimeItem(item)
        : this.normalizer.normalizeMangaItem(item)
    );

    return {
      data: normalizedData,
      pagination: data.pagination || {
        current_page: page,
        has_next_page: data.pagination?.has_next_page || false,
        items: {
          count: normalizedData.length,
          total: data.pagination?.items?.total || normalizedData.length,
          per_page: Math.min(limit, MAX_RESULTS_LIMIT)
        }
      },
      type,
      filter
    };
  }

  /**
   * Récupère les anime de la saison en cours (trending)
   * @param {Object} options - Options
   * @param {string} options.sfw - Filtre contenu: 'all' (défaut), 'sfw' (sans hentai), 'nsfw' (hentai uniquement)
   * @returns {Promise<Object>} Anime de la saison actuelle normalisés
   */
  async getCurrentSeason(options = {}) {
    const {
      limit = DEFAULT_MAX_RESULTS,
      page = 1,
      filter = null,  // tv, movie, ova, special, ona, music
      sfw = 'all'     // all, sfw, nsfw
    } = options;

    this.log.debug(`Saison actuelle (limit: ${limit}, sfw: ${sfw})`);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(Math.min(limit, MAX_RESULTS_LIMIT))
    });

    // Gestion du filtrage SFW/NSFW
    if (sfw === 'sfw') {
      params.append('sfw', 'true');   // API filtre le hentai
    } else if (sfw === 'nsfw') {
      params.append('sfw', 'false');  // Tout inclure
      params.append('rating', 'rx');  // Mais filtrer sur rating Hentai uniquement
    } else {
      params.append('sfw', 'false');  // Défaut: tout inclure
    }

    if (filter) params.append('filter', filter);

    const url = `${JIKAN_BASE_URL}/seasons/now?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération de la saison actuelle');
    }

    // Normaliser les résultats
    const normalizedData = data.data.map(item =>
      this.normalizer.normalizeAnimeItem(item)
    );

    const pag = data.pagination || {};

    return {
      total: pag.items?.total || normalizedData.length,
      count: normalizedData.length,
      data: normalizedData,
      pagination: {
        page,
        limit: pag.items?.per_page || Math.min(limit, MAX_RESULTS_LIMIT),
        hasMore: pag.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        season: data.season || 'current',
        year: data.year || new Date().getFullYear()
      }
    };
  }

  /**
   * Récupère les anime d'une saison spécifique
   * @param {number} year - Année
   * @param {string} season - Saison (winter, spring, summer, fall)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Anime de la saison normalisés
   */
  async getSeason(year, season, options = {}) {
    // Validation
    const validSeasons = ['winter', 'spring', 'summer', 'fall'];
    if (!validSeasons.includes(season)) {
      throw new ValidationError(`season doit être l'une de: ${validSeasons.join(', ')}`);
    }

    const {
      limit = DEFAULT_MAX_RESULTS,
      page = 1,
      filter = null
    } = options;

    this.log.debug(`Saison ${season} ${year} (limit: ${limit})`);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(Math.min(limit, MAX_RESULTS_LIMIT)),
      sfw: 'false'
    });

    if (filter) params.append('filter', filter);

    const url = `${JIKAN_BASE_URL}/seasons/${year}/${season}?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data?.data) {
      throw new BadGatewayError(`Erreur lors de la récupération de la saison ${season} ${year}`);
    }

    // Normaliser les résultats
    const normalizedData = data.data.map(item =>
      this.normalizer.normalizeAnimeItem(item)
    );

    const pag = data.pagination || {};

    return {
      total: pag.items?.total || normalizedData.length,
      count: normalizedData.length,
      data: normalizedData,
      pagination: {
        page,
        limit: pag.items?.per_page || Math.min(limit, MAX_RESULTS_LIMIT),
        hasMore: pag.has_next_page || false
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        season,
        year
      }
    };
  }

  /**
   * Récupère les anime à venir (prochaine saison)
   * API: /seasons/upcoming
   * @param {Object} options - Options
   * @param {string} options.sfw - Filtre contenu: 'all' (défaut), 'sfw' (sans hentai), 'nsfw' (hentai uniquement)
   * @returns {Promise<Object>} Anime upcoming normalisés
   */
  async getUpcoming(options = {}) {
    const {
      limit = DEFAULT_MAX_RESULTS,
      page = 1,
      filter = null,
      sfw = 'all'
    } = options;

    this.log.debug(`Upcoming anime (limit: ${limit}, sfw: ${sfw})`);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(Math.min(limit, MAX_RESULTS_LIMIT))
    });

    // Gestion du filtrage SFW/NSFW
    if (sfw === 'sfw') {
      params.append('sfw', 'true');   // API filtre le hentai
    } else if (sfw === 'nsfw') {
      params.append('sfw', 'false');  // Tout inclure
      params.append('rating', 'rx');  // Mais filtrer sur rating Hentai uniquement
    } else {
      params.append('sfw', 'false');  // Défaut: tout inclure
    }

    if (filter) params.append('filter', filter);

    const url = `${JIKAN_BASE_URL}/seasons/upcoming?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération des anime upcoming');
    }

    // Normaliser les résultats
    const normalizedData = data.data.map(item =>
      this.normalizer.normalizeAnimeItem(item)
    );

    return {
      data: normalizedData,
      pagination: data.pagination || {
        current_page: page,
        has_next_page: data.pagination?.has_next_page || false,
        items: {
          count: normalizedData.length,
          total: data.pagination?.items?.total || normalizedData.length,
          per_page: Math.min(limit, MAX_RESULTS_LIMIT)
        }
      }
    };
  }

  /**
   * Récupère le planning de diffusion par jour
   * API: /schedules?filter=day
   * @param {string} day - Jour (monday, tuesday, wednesday, thursday, friday, saturday, sunday, unknown, other)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Planning normalisé
   */
  async getSchedule(day = null, options = {}) {
    const {
      limit = DEFAULT_MAX_RESULTS,
      page = 1
    } = options;

    // Validation
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'unknown', 'other'];
    if (day && !validDays.includes(day)) {
      throw new ValidationError(`day doit être l'un de: ${validDays.join(', ')}`);
    }

    this.log.debug(`Schedule${day ? ` for ${day}` : ''} (limit: ${limit})`);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(Math.min(limit, MAX_RESULTS_LIMIT)),
      sfw: 'false'  // Schedule inclut tout le contenu par défaut
    });

    if (day) params.append('filter', day);

    const url = `${JIKAN_BASE_URL}/schedules?${params.toString()}`;
    const data = await this.fetchWithRetry(url);

    if (!data?.data) {
      throw new BadGatewayError('Erreur lors de la récupération du planning');
    }

    // Normaliser les résultats
    const normalizedData = data.data.map(item =>
      this.normalizer.normalizeAnimeItem(item)
    );

    return {
      data: normalizedData,
      pagination: data.pagination || {
        current_page: page,
        has_next_page: data.pagination?.has_next_page || false,
        items: {
          count: normalizedData.length,
          total: data.pagination?.items?.total || normalizedData.length,
          per_page: Math.min(limit, MAX_RESULTS_LIMIT)
        }
      },
      day: day || 'all'
    };
  }
}

// Export singleton
export const jikanProvider = new JikanProvider();
