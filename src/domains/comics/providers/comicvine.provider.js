/**
 * ComicVine Provider
 * 
 * Provider pour l'API ComicVine (GameSpot).
 * Nécessite une clé API (COMICVINE_API_KEY).
 * 
 * @see https://comicvine.gamespot.com/api/documentation
 * 
 * FEATURES:
 * - Recherche comics (issues, volumes, characters, publishers)
 * - Détails complets avec descriptions, couvertures
 * - Support multi-ressources
 * - Traduction automatique optionnelle
 * 
 * RATE LIMIT : 200 req/15 min (API key)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { ComicVineNormalizer } from '../normalizers/comicvine.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

// Configuration
const COMICVINE_BASE_URL = 'https://comicvine.gamespot.com/api';
const COMICVINE_API_KEY = process.env.COMICVINE_API_KEY;
const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS_LIMIT = 100;

export class ComicVineProvider extends BaseProvider {
  constructor() {
    super({
      name: 'comicvine',
      domain: 'comics',
      baseUrl: COMICVINE_BASE_URL,
      timeout: 20000,
      retries: 2,
      retryDelay: 1000
    });

    this.normalizer = new ComicVineNormalizer();
    this.log = createLogger('ComicVineProvider');
    this.apiKey = COMICVINE_API_KEY;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construit l'URL avec les paramètres
   */
  buildUrl(endpoint, params = {}) {
    const url = new URL(`${COMICVINE_BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('format', 'json');
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    
    return url.toString();
  }

  /**
   * Vérifie si le provider est configuré
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Fetch avec retry et gestion d'erreurs
   */
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

    if (!this.isConfigured()) {
      return {
        healthy: false,
        latency: 0,
        message: 'API key non configurée (COMICVINE_API_KEY)'
      };
    }

    try {
      const url = this.buildUrl('/search/', {
        query: 'Batman',
        resources: 'volume',
        limit: 1
      });

      const data = await this.fetchWithRetry(url);
      const latency = Date.now() - start;

      if (data?.error === 'OK' || data?.status_code === 1) {
        return {
          healthy: true,
          latency,
          message: 'ComicVine API disponible'
        };
      }

      return {
        healthy: false,
        latency,
        message: data?.error || 'Réponse invalide'
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
   * Recherche générale de comics
   */
  async search(query, options = {}) {
    const {
      maxResults = DEFAULT_MAX_RESULTS,
      resourceType = 'volume',
      page = 1
    } = options;

    if (!this.isConfigured()) {
      throw new BadGatewayError('ComicVine API key non configurée');
    }

    const limit = Math.min(Math.max(parseInt(maxResults) || DEFAULT_MAX_RESULTS, 1), MAX_RESULTS_LIMIT);
    const offset = (page - 1) * limit;

    const resourceMap = {
      issue: 'issue',
      volume: 'volume',
      character: 'character',
      publisher: 'publisher',
      story_arc: 'story_arc',
      team: 'team',
      person: 'person'
    };

    const resources = resourceMap[resourceType] || 'volume';

    try {
      this.log.debug(`Recherche ComicVine: "${query}" (type: ${resources})`);

      const url = this.buildUrl('/search/', {
        query,
        resources,
        limit,
        offset,
        field_list: this.getFieldList(resources)
      });

      const data = await this.fetchWithRetry(url);

      if (data?.error !== 'OK' && data?.status_code !== 1) {
        throw new BadGatewayError(`ComicVine: ${data?.error || 'Erreur inconnue'}`);
      }

      const results = data.results || [];
      const totalResults = data.number_of_total_results || results.length;

      return this.normalizer.normalizeSearchResponse(results, {
        query,
        searchType: resources,
        total: totalResults,
        pagination: {
          page,
          limit,
          hasMore: offset + results.length < totalResults
        }
      });
    } catch (error) {
      if (error.name === 'BadGatewayError') throw error;
      this.log.error(`Erreur recherche ComicVine: ${error.message}`);
      throw new BadGatewayError(`Erreur ComicVine: ${error.message}`);
    }
  }

  /**
   * Recherche spécifique de volumes (séries)
   */
  async searchVolumes(query, options = {}) {
    return this.search(query, { ...options, resourceType: 'volume' });
  }

  /**
   * Recherche spécifique d'issues (numéros)
   */
  async searchIssues(query, options = {}) {
    return this.search(query, { ...options, resourceType: 'issue' });
  }

  /**
   * Recherche de personnages
   */
  async searchCharacters(query, options = {}) {
    return this.search(query, { ...options, resourceType: 'character' });
  }

  /**
   * Recherche d'éditeurs
   */
  async searchPublishers(query, options = {}) {
    return this.search(query, { ...options, resourceType: 'publisher' });
  }

  /**
   * Recherche de créateurs (auteurs, dessinateurs, etc.)
   */
  async searchCreators(query, options = {}) {
    return this.search(query, { ...options, resourceType: 'person' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un volume (série)
   */
  async getVolumeDetails(volumeId) {
    if (!this.isConfigured()) {
      throw new BadGatewayError('ComicVine API key non configurée');
    }

    const cleanId = String(volumeId).includes('-') ? volumeId : `4050-${volumeId}`;

    try {
      this.log.debug(`Détails volume ComicVine: ${cleanId}`);

      const url = this.buildUrl(`/volume/${cleanId}/`, {
        field_list: 'id,name,deck,description,image,start_year,publisher,count_of_issues,issues,site_detail_url,aliases,first_issue,last_issue'
      });

      const data = await this.fetchWithRetry(url);

      if (data?.error !== 'OK' && data?.status_code !== 1) {
        if (data?.status_code === 101) {
          throw new NotFoundError(`Volume ${volumeId} non trouvé`);
        }
        throw new BadGatewayError(`ComicVine: ${data?.error || 'Erreur inconnue'}`);
      }

      const volume = data.results;
      if (!volume) {
        throw new NotFoundError(`Volume ${volumeId} non trouvé`);
      }

      return this.normalizer.normalizeVolumeDetail(volume);
    } catch (error) {
      if (error.name === 'NotFoundError' || error.name === 'BadGatewayError') throw error;
      this.log.error(`Erreur détails volume: ${error.message}`);
      throw new BadGatewayError(`Erreur ComicVine: ${error.message}`);
    }
  }

  /**
   * Récupère les détails d'un issue (numéro)
   */
  async getIssueDetails(issueId) {
    if (!this.isConfigured()) {
      throw new BadGatewayError('ComicVine API key non configurée');
    }

    const cleanId = String(issueId).includes('-') ? issueId : `4000-${issueId}`;

    try {
      this.log.debug(`Détails issue ComicVine: ${cleanId}`);

      const url = this.buildUrl(`/issue/${cleanId}/`, {
        field_list: 'id,name,deck,description,image,issue_number,cover_date,store_date,volume,site_detail_url,character_credits,person_credits,team_credits,story_arc_credits'
      });

      const data = await this.fetchWithRetry(url);

      if (data?.error !== 'OK' && data?.status_code !== 1) {
        if (data?.status_code === 101) {
          throw new NotFoundError(`Issue ${issueId} non trouvé`);
        }
        throw new BadGatewayError(`ComicVine: ${data?.error || 'Erreur inconnue'}`);
      }

      const issue = data.results;
      if (!issue) {
        throw new NotFoundError(`Issue ${issueId} non trouvé`);
      }

      return this.normalizer.normalizeIssueDetail(issue);
    } catch (error) {
      if (error.name === 'NotFoundError' || error.name === 'BadGatewayError') throw error;
      this.log.error(`Erreur détails issue: ${error.message}`);
      throw new BadGatewayError(`Erreur ComicVine: ${error.message}`);
    }
  }

  /**
   * Récupère les détails d'un personnage
   */
  async getCharacterDetails(characterId) {
    if (!this.isConfigured()) {
      throw new BadGatewayError('ComicVine API key non configurée');
    }

    const cleanId = String(characterId).includes('-') ? characterId : `4005-${characterId}`;

    try {
      this.log.debug(`Détails personnage ComicVine: ${cleanId}`);

      const url = this.buildUrl(`/character/${cleanId}/`, {
        field_list: 'id,name,deck,description,image,real_name,aliases,birth,gender,origin,publisher,first_appeared_in_issue,site_detail_url,powers,teams,enemies,friends'
      });

      const data = await this.fetchWithRetry(url);

      if (data?.error !== 'OK' && data?.status_code !== 1) {
        if (data?.status_code === 101) {
          throw new NotFoundError(`Personnage ${characterId} non trouvé`);
        }
        throw new BadGatewayError(`ComicVine: ${data?.error || 'Erreur inconnue'}`);
      }

      const character = data.results;
      if (!character) {
        throw new NotFoundError(`Personnage ${characterId} non trouvé`);
      }

      return this.normalizer.normalizeCharacterDetail(character);
    } catch (error) {
      if (error.name === 'NotFoundError' || error.name === 'BadGatewayError') throw error;
      this.log.error(`Erreur détails personnage: ${error.message}`);
      throw new BadGatewayError(`Erreur ComicVine: ${error.message}`);
    }
  }

  /**
   * Récupère les détails d'un créateur (person)
   */
  async getCreatorDetails(creatorId) {
    if (!this.isConfigured()) {
      throw new BadGatewayError('ComicVine API key non configurée');
    }

    const cleanId = String(creatorId).includes('-') ? creatorId : `4040-${creatorId}`;

    try {
      this.log.debug(`Détails créateur ComicVine: ${cleanId}`);

      const url = this.buildUrl(`/person/${cleanId}/`, {
        field_list: 'id,name,deck,description,image,birth,death,gender,hometown,country,website,aliases,site_detail_url,created_characters'
      });

      const data = await this.fetchWithRetry(url);

      if (data?.error !== 'OK' && data?.status_code !== 1) {
        if (data?.status_code === 101) {
          throw new NotFoundError(`Créateur ${creatorId} non trouvé`);
        }
        throw new BadGatewayError(`ComicVine: ${data?.error || 'Erreur inconnue'}`);
      }

      const creator = data.results;
      if (!creator) {
        throw new NotFoundError(`Créateur ${creatorId} non trouvé`);
      }

      return this.normalizer.normalizeCreatorDetail(creator);
    } catch (error) {
      if (error.name === 'NotFoundError' || error.name === 'BadGatewayError') throw error;
      this.log.error(`Erreur détails créateur: ${error.message}`);
      throw new BadGatewayError(`Erreur ComicVine: ${error.message}`);
    }
  }

  /**
   * Récupère les œuvres (volumes) d'un créateur
   */
  async getCreatorWorks(creatorId, options = {}) {
    if (!this.isConfigured()) {
      throw new BadGatewayError('ComicVine API key non configurée');
    }

    const cleanId = String(creatorId).includes('-') ? creatorId : `4040-${creatorId}`;
    const { page = 1, maxResults = 100 } = options;
    const limit = Math.min(maxResults, MAX_RESULTS_LIMIT);
    const offset = (page - 1) * limit;

    try {
      this.log.debug(`Œuvres du créateur ${creatorId}`);

      // Récupérer les volume_credits du créateur
      const url = this.buildUrl(`/person/${cleanId}/`, {
        field_list: 'id,name,volume_credits'
      });

      const data = await this.fetchWithRetry(url);

      if (data?.error !== 'OK' && data?.status_code !== 1) {
        if (data?.status_code === 101) {
          throw new NotFoundError(`Créateur ${creatorId} non trouvé`);
        }
        throw new BadGatewayError(`ComicVine: ${data?.error || 'Erreur inconnue'}`);
      }

      const creator = data.results;
      if (!creator) {
        throw new NotFoundError(`Créateur ${creatorId} non trouvé`);
      }

      const allVolumes = creator.volume_credits || [];
      const totalResults = allVolumes.length;
      
      // Pagination manuelle car l'API retourne tout
      const paginatedVolumes = allVolumes.slice(offset, offset + limit);

      const pagination = {
        page,
        limit,
        hasMore: offset + paginatedVolumes.length < totalResults
      };

      return this.normalizer.normalizeCreatorWorks(paginatedVolumes, {
        creatorId: String(creatorId),
        total: totalResults,
        pagination
      });
    } catch (error) {
      if (error.name === 'NotFoundError' || error.name === 'BadGatewayError') throw error;
      this.log.error(`Erreur œuvres créateur: ${error.message}`);
      throw new BadGatewayError(`Erreur ComicVine: ${error.message}`);
    }
  }

  /**
   * Récupère les issues d'un volume
   */
  async getVolumeIssues(volumeId, options = {}) {
    if (!this.isConfigured()) {
      throw new BadGatewayError('ComicVine API key non configurée');
    }

    const { page = 1, maxResults = 20 } = options;
    const limit = Math.min(maxResults, MAX_RESULTS_LIMIT);
    const offset = (page - 1) * limit;

    try {
      this.log.debug(`Issues du volume ${volumeId}`);

      const url = this.buildUrl('/issues/', {
        filter: `volume:${volumeId}`,
        sort: 'issue_number:asc',
        limit,
        offset,
        field_list: 'id,name,issue_number,cover_date,image,deck,site_detail_url'
      });

      const data = await this.fetchWithRetry(url);

      if (data?.error !== 'OK' && data?.status_code !== 1) {
        throw new BadGatewayError(`ComicVine: ${data?.error || 'Erreur inconnue'}`);
      }

      const results = data.results || [];
      const totalResults = data.number_of_total_results || results.length;

      return this.normalizer.normalizeIssuesList(results, {
        volumeId,
        total: totalResults,
        pagination: {
          page,
          limit,
          hasMore: offset + results.length < totalResults
        }
      });
    } catch (error) {
      if (error.name === 'BadGatewayError') throw error;
      this.log.error(`Erreur liste issues: ${error.message}`);
      throw new BadGatewayError(`Erreur ComicVine: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retourne la liste des champs selon le type de ressource
   */
  getFieldList(resourceType) {
    const fieldLists = {
      volume: 'id,name,deck,image,start_year,publisher,count_of_issues,site_detail_url',
      issue: 'id,name,deck,image,issue_number,cover_date,volume,site_detail_url',
      character: 'id,name,deck,image,real_name,publisher,first_appeared_in_issue,site_detail_url',
      publisher: 'id,name,deck,image,location_city,location_state,site_detail_url',
      story_arc: 'id,name,deck,image,publisher,site_detail_url',
      team: 'id,name,deck,image,publisher,site_detail_url',
      person: 'id,name,deck,image,birth,death,hometown,country,site_detail_url,count_of_issue_appearances'
    };

    return fieldLists[resourceType] || fieldLists.volume;
  }
}
