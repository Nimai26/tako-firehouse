/**
 * Brickset Provider
 * 
 * Provider pour l'API Brickset (données LEGO officielles).
 * 
 * @see https://brickset.com/api/v3.asmx
 * 
 * ENDPOINTS DISPONIBLES :
 * - getSets: Recherche de sets
 * - getSet: Détails d'un set
 * - getThemes: Liste des thèmes
 * - getSubthemes: Sous-thèmes
 * - getYears: Années disponibles
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { BricksetNormalizer } from '../normalizers/brickset.normalizer.js';
import { env } from '../../../config/env.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js';

export class BricksetProvider extends BaseProvider {
  constructor() {
    super({
      name: 'brickset',
      domain: 'construction-toys',
      baseUrl: 'https://brickset.com/api/v3.asmx',
      timeout: 15000,
      retries: 2
    });

    this.normalizer = new BricksetNormalizer();
    this.apiKey = env.BRICKSET_API_KEY;
    
    // Authentification API v3 (requis pour getSets et autres endpoints)
    this.userHash = env.BRICKSET_USER_HASH || null;
    this.username = env.BRICKSET_USERNAME || null;
    this.password = env.BRICKSET_PASSWORD || null;
    
    // Initialiser le userHash au démarrage si credentials disponibles
    if (!this.userHash && this.username && this.password) {
      this.login().catch(err => {
        console.warn(`[Brickset] Impossible de se connecter: ${err.message}`);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTIFICATION API v3
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Se connecter à Brickset et obtenir un userHash
   * @returns {Promise<string>} UserHash
   */
  async login() {
    if (!this.username || !this.password) {
      throw new ValidationError('BRICKSET_USERNAME et BRICKSET_PASSWORD requis pour l\'authentification');
    }

    const response = await this.post('/login', {
      apiKey: this.apiKey,
      username: this.username,
      password: this.password
    });

    if (response.status === 'error' || !response.hash) {
      throw new ValidationError('Échec de connexion Brickset: ' + (response.message || 'Invalid credentials'));
    }

    this.userHash = response.hash;
    console.log(`[Brickset] ✅ Authentification réussie (userHash: ${this.userHash.slice(0, 8)}...)`);
    return this.userHash;
  }

  /**
   * Assurer qu'un userHash est disponible
   * @private
   */
  async ensureAuthenticated() {
    if (this.userHash) return;
    
    if (this.username && this.password) {
      await this.login();
    } else {
      throw new ValidationError(
        'Brickset API v3 requiert authentification. ' +
        'Configurez BRICKSET_USER_HASH ou BRICKSET_USERNAME+PASSWORD dans .env'
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des sets LEGO
   * @param {string} query - Terme de recherche (nom ou numéro de set)
   * @param {Object} options
   * @param {number} [options.page=1] - Page
   * @param {number} [options.pageSize=20] - Résultats par page (max 500)
   * @param {string} [options.theme] - Filtrer par thème
   * @param {number} [options.year] - Filtrer par année
   * @param {string} [options.orderBy='Name'] - Tri (Name, Number, Year, Pieces, Rating)
   */
  async search(query, options = {}) {
    await this.ensureAuthenticated();

    const {
      page = 1,
      pageSize = 20,
      theme,
      year,
      orderBy = 'Name'
    } = options;

    // Construire les paramètres de recherche (format API v3)
    const searchParams = {
      query: query || '',
      pageNumber: page,
      pageSize: Math.min(pageSize, 500),
      orderBy
    };

    // Filtres optionnels
    if (theme) searchParams.theme = theme;
    if (year) searchParams.year = year;

    // Appel API v3 avec userHash
    const response = await this.post('/getSets', {
      apiKey: this.apiKey,
      userHash: this.userHash,
      params: searchParams
    });
    
    // Vérifier le succès
    this.checkApiResponse(response);

    // Extraire les données
    const sets = response.sets || [];
    const total = response.matches || sets.length;

    // Normaliser et retourner
    return this.normalizer.normalizeSearchResponse(sets, {
      query,
      total,
      pagination: {
        page,
        limit: pageSize,
        hasMore: page * pageSize < total
      },
      lang: 'en'
    });
  }

  /**
   * Récupérer les détails d'un set par son ID
   * @param {string} id - ID Brickset (setID) ou numéro de set (75192-1)
   */
  async getById(id, options = {}) {
    await this.ensureAuthenticated();

    const searchParams = {};

    // Détecter si c'est un setID numérique ou un numéro de set
    if (/^\d+$/.test(id)) {
      searchParams.setID = id;
    } else {
      // Format attendu: "75192-1" ou "75192"
      const [number, variant = 1] = id.split('-');
      searchParams.setNumber = number;
      searchParams.setNumberVariant = variant;
    }

    const response = await this.post('/getSets', {
      apiKey: this.apiKey,
      userHash: this.userHash,
      params: searchParams
    });
    this.checkApiResponse(response);

    const sets = response.sets || [];
    if (sets.length === 0) {
      throw new NotFoundError(`Set LEGO "${id}" non trouvé`);
    }

    return this.normalizer.normalizeDetailResponse(sets[0], {
      lang: options.lang || 'en'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES SPÉCIFIQUES BRICKSET
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupérer la liste des thèmes
   */
  async getThemes() {
    const response = await this.post('/getThemes', {
      apiKey: this.apiKey
    });
    
    this.checkApiResponse(response);
    return response.themes || [];
  }

  /**
   * Récupérer les sous-thèmes d'un thème
   * @param {string} theme - Nom du thème
   */
  async getSubthemes(theme) {
    if (!theme) {
      throw new ValidationError('Le paramètre "theme" est requis');
    }

    const response = await this.post('/getSubthemes', {
      apiKey: this.apiKey,
      theme
    });
    
    this.checkApiResponse(response);
    return response.subthemes || [];
  }

  /**
   * Récupérer les années disponibles pour un thème
   * @param {string} [theme] - Nom du thème (optionnel)
   */
  async getYears(theme = null) {
    const params = { apiKey: this.apiKey };
    if (theme) params.theme = theme;

    const response = await this.post('/getYears', params);
    this.checkApiResponse(response);
    
    return response.years || [];
  }

  /**
   * Récupérer les sets récemment mis à jour
   * @param {number} [minutesAgo=10080] - Minutes depuis la mise à jour (défaut: 7 jours)
   */
  async getRecentlyUpdated(minutesAgo = 10080) {
    const response = await this.post('/getRecentlyUpdatedSets', {
      apiKey: this.apiKey,
      minutesAgo
    });
    
    this.checkApiResponse(response);
    const sets = response.sets || [];
    
    return this.normalizer.normalizeSearchResponse(sets, {
      query: 'recently_updated',
      total: sets.length
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vérifier la réponse API et lever une erreur si nécessaire
   * @private
   */
  checkApiResponse(response) {
    if (response.status === 'error') {
      throw new ValidationError(response.message || 'Erreur API Brickset');
    }
  }

  /**
   * Override de buildFetchOptions pour Brickset API v3 (utilise form-urlencoded)
   * @override
   */
  buildFetchOptions(options) {
    // Brickset API v3 utilise form-urlencoded
    if (options.method === 'POST' && options.body) {
      const body = JSON.parse(options.body);
      const formData = new URLSearchParams();
      
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // Si c'est 'params', JSON.stringify le
          if (key === 'params' && typeof value === 'object') {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });

      return {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      };
    }

    return super.buildFetchOptions(options);
  }

  /**
   * Health check spécifique
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Test avec getThemes (léger)
      await this.getThemes();
      
      return {
        healthy: true,
        latency: Date.now() - startTime
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

export default BricksetProvider;
