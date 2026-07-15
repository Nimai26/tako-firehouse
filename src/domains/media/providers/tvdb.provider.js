/**
 * TVDB Provider
 * 
 * Provider pour l'API TheTVDB v4.
 * Nécessite une clé API (TVDB_API_KEY).
 * 
 * @see https://thetvdb.github.io/v4-api/
 * 
 * FEATURES:
 * - Recherche (séries, films, personnes)
 * - Détails films et séries
 * - Saisons et épisodes
 * - Support des traductions natives TVDB
 * - Traduction automatique optionnelle (autoTrad)
 * 
 * NOTE: TVDB utilise ISO 639-2 (fra, eng) au lieu de ISO 639-1 (fr, en)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { TvdbNormalizer } from '../normalizers/tvdb.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { createLogger } from '../../../shared/utils/logger.js';
import { env } from '../../../config/env.js';

// Configuration
const TVDB_BASE_URL = 'https://api4.thetvdb.com/v4';
const DEFAULT_MAX_RESULTS = 20;

// Conversion ISO 639-1 → ISO 639-2
const ISO_639_1_TO_2 = {
  'fr': 'fra', 'en': 'eng', 'de': 'deu', 'es': 'spa', 'it': 'ita',
  'pt': 'por', 'nl': 'nld', 'ru': 'rus', 'ja': 'jpn', 'ko': 'kor',
  'zh': 'zho', 'ar': 'ara', 'pl': 'pol', 'sv': 'swe', 'da': 'dan',
  'no': 'nor', 'fi': 'fin', 'cs': 'ces', 'hu': 'hun', 'el': 'ell',
  'tr': 'tur', 'he': 'heb', 'th': 'tha', 'vi': 'vie', 'id': 'ind',
  'uk': 'ukr', 'ro': 'ron', 'bg': 'bul', 'hr': 'hrv', 'sk': 'slk'
};

// Cache global pour le token
const tokenCache = {
  token: null,
  expiresAt: 0
};

export class TvdbProvider extends BaseProvider {
  constructor() {
    super({
      name: 'tvdb',
      domain: 'media',
      baseUrl: TVDB_BASE_URL,
      timeout: 20000,
      retries: 2,
      retryDelay: 1000
    });

    this.normalizer = new TvdbNormalizer();
    this.log = createLogger('TvdbProvider');
    this.apiKey = env.TVDB_API_KEY || env.TVDB_KEY;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convertit un code langue ISO 639-1 en ISO 639-2
   */
  toIso6392(lang) {
    if (!lang) return null;
    const code = lang.toLowerCase().split('-')[0];
    if (code.length === 3) return code; // Déjà ISO 639-2
    return ISO_639_1_TO_2[code] || null;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Obtient un token d'authentification TVDB (valide ~1 mois)
   */
  async getToken() {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
      return tokenCache.token;
    }

    this.log.debug('Obtention d\'un nouveau token TVDB...');

    const response = await fetch(`${TVDB_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ apikey: this.apiKey })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadGatewayError(`Erreur login TVDB ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Cache pour 25 jours
    tokenCache.token = data.data.token;
    tokenCache.expiresAt = Date.now() + (25 * 24 * 60 * 60 * 1000);

    this.log.debug('Token TVDB obtenu, valide 25 jours');
    return tokenCache.token;
  }

  async fetchWithAuth(url, options = {}) {
    const token = await this.getToken();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'Tako-API/1.0',
        ...options.headers
      },
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const errorText = await response.text();
      throw new Error(`TVDB ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Récupère les traductions pour une ressource
   */
  async getTranslations(resourceType, id, lang) {
    if (!lang) return null;
    
    const tvdbLang = this.toIso6392(lang);
    if (!tvdbLang) return null;

    try {
      const url = `${TVDB_BASE_URL}/${resourceType}/${id}/translations/${tvdbLang}`;
      const data = await this.fetchWithAuth(url);
      return data?.data || null;
    } catch (error) {
      this.log.debug(`Pas de traduction ${tvdbLang} pour ${resourceType}/${id}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche sur TVDB
   */
  async search(query, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    const {
      pageSize = DEFAULT_MAX_RESULTS,
      lang = null,
      type = null,  // series, movie, person, company
      year = null
    } = options;

    const tvdbLang = this.toIso6392(lang);
    this.log.debug(`Recherche: "${query}" (type: ${type || 'all'}, lang: ${tvdbLang || 'default'})`);

    const params = new URLSearchParams({ query });
    if (type) params.append('type', type);
    if (tvdbLang) params.append('language', tvdbLang);
    if (year) params.append('year', year);
    params.append('limit', Math.min(pageSize, 50));

    const url = `${TVDB_BASE_URL}/search?${params.toString()}`;
    const data = await this.fetchWithAuth(url);

    if (!data) {
      throw new BadGatewayError('Erreur TVDB: pas de réponse');
    }

    const results = (data.data || []).slice(0, pageSize);

    return this.normalizer.normalizeSearchResponse(results, {
      query,
      searchType: type || 'all',
      total: results.length,
      pagination: {
        page: 1,
        limit: results.length,
        hasMore: false // TVDB ne pagine pas vraiment
      }
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
    return this.search(query, { ...options, type: 'series' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS FILM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un film
   */
  async getMovie(id, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    const { lang = null } = options;

    this.log.debug(`Récupération film: ${id}`);

    // Récupère les données étendues avec people
    const url = `${TVDB_BASE_URL}/movies/${id}/extended?meta=people`;
    const data = await this.fetchWithAuth(url);

    if (!data?.data) {
      throw new NotFoundError(`Film TVDB ${id} non trouvé`);
    }

    const movie = data.data;

    // Récupère les traductions si langue spécifiée
    const translations = await this.getTranslations('movies', id, lang);

    // Récupère l'overview en anglais si pas de traduction
    let baseOverview = null;
    if (movie.overviewTranslations?.includes('eng')) {
      const engTrans = await this.getTranslations('movies', id, 'en');
      baseOverview = engTrans?.overview;
    }

    return this.normalizer.normalizeMovieDetail(movie, {
      translations,
      baseOverview
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une série
   */
  async getSeries(id, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    const { lang = null } = options;

    this.log.debug(`Récupération série: ${id}`);

    const url = `${TVDB_BASE_URL}/series/${id}/extended?short=false`;
    const data = await this.fetchWithAuth(url);

    if (!data?.data) {
      throw new NotFoundError(`Série TVDB ${id} non trouvée`);
    }

    const series = data.data;

    // Récupère les traductions
    const translations = await this.getTranslations('series', id, lang);

    return this.normalizer.normalizeSeriesDetail(series, { translations });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAISONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une saison
   */
  async getSeason(seasonId, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    const { lang = null } = options;

    this.log.debug(`Récupération saison: ${seasonId}`);

    const url = `${TVDB_BASE_URL}/seasons/${seasonId}/extended`;
    const data = await this.fetchWithAuth(url);

    if (!data?.data) {
      throw new NotFoundError(`Saison TVDB ${seasonId} non trouvée`);
    }

    const season = data.data;
    const translations = await this.getTranslations('seasons', seasonId, lang);

    return this.normalizer.normalizeSeasonDetail(season, { translations });
  }

  /**
   * Récupère les saisons d'une série
   */
  async getSeriesSeasons(seriesId, options = {}) {
    const series = await this.getSeries(seriesId, options);
    
    // Format canonique : seasons dans details.seasons, titre au top-level
    const seasons = series.details?.seasons || [];

    return {
      seriesId,
      seriesName: series.title,
      seasons,
      total: seasons.length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÉPISODES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un épisode
   */
  async getEpisode(episodeId, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    const { lang = null } = options;

    this.log.debug(`Récupération épisode: ${episodeId}`);

    const url = `${TVDB_BASE_URL}/episodes/${episodeId}/extended`;
    const data = await this.fetchWithAuth(url);

    if (!data?.data) {
      throw new NotFoundError(`Épisode TVDB ${episodeId} non trouvé`);
    }

    const episode = data.data;
    const translations = await this.getTranslations('episodes', episodeId, lang);

    return this.normalizer.normalizeEpisodeDetail(episode, { translations });
  }

  /**
   * Récupère les épisodes d'une série
   */
  async getSeriesEpisodes(seriesId, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    const { lang = null, season = null, page = 0 } = options;

    this.log.debug(`Récupération épisodes série: ${seriesId} (saison: ${season || 'toutes'})`);

    const params = new URLSearchParams();
    if (season !== null) params.append('season', season);
    params.append('page', page);

    const url = `${TVDB_BASE_URL}/series/${seriesId}/episodes/default?${params.toString()}`;
    const data = await this.fetchWithAuth(url);

    if (!data?.data) {
      return { episodes: [], total: 0 };
    }

    const episodes = data.data.episodes || [];

    return {
      seriesId,
      season,
      episodes: episodes.map(ep => this.normalizer.normalizeEpisodeItem(ep)),
      total: episodes.length,
      links: data.links // Pour pagination
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTES / SAGAS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère une liste TVDB (peut être une saga/franchise)
   */
  async getList(listId, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    this.log.debug(`Récupération liste: ${listId}`);

    const url = `${TVDB_BASE_URL}/lists/${listId}/extended`;
    const data = await this.fetchWithAuth(url);

    if (!data?.data) {
      throw new NotFoundError(`Liste TVDB ${listId} non trouvée`);
    }

    return this.normalizer.normalizeListDetail(data.data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONNES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une personne
   */
  async getPerson(id, options = {}) {
    if (!this.isConfigured()) {
      throw new ValidationError('TVDB_API_KEY non configurée');
    }

    this.log.debug(`Récupération personne: ${id}`);

    const url = `${TVDB_BASE_URL}/people/${id}/extended`;
    const data = await this.fetchWithAuth(url);

    if (!data?.data) {
      throw new NotFoundError(`Personne TVDB ${id} non trouvée`);
    }

    return this.normalizer.normalizePersonDetail(data.data);
  }

  /**
   * Récupère les films/séries où une personne a été réalisateur
   */
  async getDirectorWorks(id, options = {}) {
    const person = await this.getPerson(id, options);
    
    // Filtrer les crédits où la personne est Director
    const directedMovies = (person.details?.characters || [])
      .filter(c => c.peopleType === 'Director' && c.type === 'movie')
      .map(c => ({
        id: c.movieId,
        name: c.name,
        type: 'movie'
      }));

    const directedSeries = (person.details?.characters || [])
      .filter(c => c.peopleType === 'Director' && c.type === 'series')
      .map(c => ({
        id: c.seriesId,
        name: c.name,
        type: 'series'
      }));

    return {
      person: {
        id: person.sourceId,
        name: person.title,
        image: person.images?.primary
      },
      movies: directedMovies,
      series: directedSeries,
      totalMovies: directedMovies.length,
      totalSeries: directedSeries.length
    };
  }
}

// Export singleton
export const tvdbProvider = new TvdbProvider();
