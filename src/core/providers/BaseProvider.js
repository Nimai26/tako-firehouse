/**
 * BaseProvider - Classe de base pour les providers de données
 * 
 * RESPONSABILITÉ :
 * Gérer la communication avec une source de données externe (API, scraping).
 * 
 * WORKFLOW TYPE :
 * 1. Provider reçoit une requête (search, getById, etc.)
 * 2. Provider appelle la source externe
 * 3. Provider passe les données brutes au Normalizer
 * 4. Normalizer retourne les données au format Tako
 * 5. Provider retourne la réponse normalisée
 */

import { logger } from '../../shared/utils/logger.js';
import { AppError, NotFoundError, BadGatewayError } from '../../shared/errors/index.js';

export class BaseProvider {
  /**
   * @param {Object} config
   * @param {string} config.name - Nom du provider (ex: 'brickset')
   * @param {string} config.domain - Domaine Tako (ex: 'construction-toys')
   * @param {string} config.baseUrl - URL de base de l'API
   * @param {Object} [config.normalizer] - Instance du normalizer associé
   * @param {Object} [config.defaultHeaders] - Headers par défaut
   * @param {number} [config.timeout=30000] - Timeout en ms
   * @param {number} [config.retries=2] - Nombre de tentatives
   * @param {number} [config.retryDelay=1000] - Délai entre tentatives (ms)
   */
  constructor({
    name,
    domain,
    baseUrl,
    normalizer = null,
    defaultHeaders = {},
    timeout = 30000,
    retries = 2,
    retryDelay = 1000
  }) {
    if (!name || !domain) {
      throw new Error('BaseProvider: name et domain sont requis');
    }

    this.name = name;
    this.domain = domain;
    this.baseUrl = baseUrl?.replace(/\/$/, ''); // Remove trailing slash
    this.normalizer = normalizer;
    this.defaultHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Tako-API/1.0',
      ...defaultHeaders
    };
    this.timeout = timeout;
    this.retries = retries;
    this.retryDelay = retryDelay;

    // Statistiques internes
    this._stats = {
      requests: 0,
      errors: 0,
      lastRequest: null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES ABSTRAITES - À implémenter dans les classes filles
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des items
   * @abstract
   * @param {string} query - Terme de recherche
   * @param {Object} [options] - Options de recherche
   * @param {number} [options.page=1] - Page
   * @param {number} [options.pageSize=20] - Taille de page
   * @param {string} [options.lang='en'] - Langue
   * @returns {Promise<Object>} Réponse normalisée
   */
  async search(query, options = {}) {
    throw new Error('search() doit être implémenté');
  }

  /**
   * Récupérer un item par son ID
   * @abstract
   * @param {string} id - ID de l'item
   * @param {Object} [options] - Options
   * @returns {Promise<Object>} Réponse normalisée
   */
  async getById(id, options = {}) {
    throw new Error('getById() doit être implémenté');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES OPTIONNELLES - Peuvent être surchargées
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialiser le provider (connexion, auth, etc.)
   * Appelé au démarrage de l'app
   */
  async initialize() {
    logger.debug(`Provider [${this.name}] initialisé`);
  }

  /**
   * Vérifier la santé du provider
   * @returns {Promise<{ healthy: boolean, latency?: number, message?: string }>}
   */
  async healthCheck() {
    return { healthy: true };
  }

  /**
   * Nettoyer les ressources (fermer connexions, etc.)
   */
  async shutdown() {
    logger.debug(`Provider [${this.name}] fermé`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES HTTP - Helpers pour les requêtes
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Effectuer une requête HTTP avec retry
   * @param {string} endpoint - Endpoint (relatif à baseUrl)
   * @param {Object} [options] - Options fetch
   * @returns {Promise<any>} Données de la réponse
   */
  async request(endpoint, options = {}) {
    const url = this.buildUrl(endpoint, options.params);
    const fetchOptions = this.buildFetchOptions(options);

    this._stats.requests++;
    this._stats.lastRequest = new Date();

    let lastError;
    
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const startTime = Date.now();
        
        const response = await this.fetchWithTimeout(url, fetchOptions);
        const data = await this.parseResponse(response);
        
        const duration = Date.now() - startTime;
        logger.debug(`[${this.name}] ${options.method || 'GET'} ${endpoint} - ${response.status} (${duration}ms)`);
        
        return data;

      } catch (error) {
        lastError = error;
        this._stats.errors++;

        // Ne pas retry sur certaines erreurs
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < this.retries) {
          const delay = this.retryDelay * Math.pow(2, attempt); // Backoff exponentiel
          logger.warn(`[${this.name}] Tentative ${attempt + 1}/${this.retries + 1} échouée, retry dans ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    throw this.wrapError(lastError, url);
  }

  /**
   * Requête GET
   */
  async get(endpoint, params = {}) {
    return this.request(endpoint, { method: 'GET', params });
  }

  /**
   * Requête POST
   */
  async post(endpoint, body, params = {}) {
    return this.request(endpoint, { 
      method: 'POST', 
      params,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Construire l'URL complète
   * @private
   */
  buildUrl(endpoint, params = {}) {
    let url;
    
    // Si endpoint est une URL complète, l'utiliser directement
    if (endpoint.startsWith('http')) {
      url = new URL(endpoint);
    } else {
      if (!this.baseUrl) {
        throw new Error(`baseUrl non définie pour le provider ${this.name}`);
      }
      const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      url = new URL(`${this.baseUrl}${path}`);
    }

    // Ajouter les query params
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    return url.toString();
  }

  /**
   * Construire les options fetch
   * @private
   */
  buildFetchOptions(options) {
    return {
      method: options.method || 'GET',
      headers: {
        ...this.defaultHeaders,
        ...options.headers
      },
      body: options.body
    };
  }

  /**
   * Fetch avec timeout
   * @private
   */
  async fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parser la réponse HTTP
   * @private
   */
  async parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      const errorBody = await response.text();
      throw new HttpError(response.status, errorBody);
    }

    if (contentType.includes('application/json')) {
      return response.json();
    }
    
    return response.text();
  }

  /**
   * Déterminer si l'erreur ne doit pas être retentée
   * @private
   */
  isNonRetryableError(error) {
    // Pas de retry sur erreurs 4xx (sauf 429)
    if (error instanceof HttpError) {
      const status = error.statusCode;
      return status >= 400 && status < 500 && status !== 429;
    }
    return false;
  }

  /**
   * Envelopper une erreur dans une AppError
   * @private
   */
  wrapError(error, url) {
    if (error instanceof AppError) {
      return error;
    }

    if (error.name === 'AbortError') {
      return new BadGatewayError(`Timeout après ${this.timeout}ms pour ${this.name}`);
    }

    if (error instanceof HttpError) {
      if (error.statusCode === 404) {
        return new NotFoundError(`Ressource non trouvée sur ${this.name}`);
      }
      return new BadGatewayError(`Erreur ${error.statusCode} de ${this.name}: ${error.message}`);
    }

    return new BadGatewayError(`Erreur de connexion à ${this.name}: ${error.message}`);
  }

  /**
   * Sleep utilitaire
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTIQUES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Obtenir les statistiques du provider
   */
  getStats() {
    return {
      name: this.name,
      domain: this.domain,
      ...this._stats,
      errorRate: this._stats.requests > 0 
        ? (this._stats.errors / this._stats.requests * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Réinitialiser les statistiques
   */
  resetStats() {
    this._stats = {
      requests: 0,
      errors: 0,
      lastRequest: null
    };
  }
}

/**
 * Erreur HTTP interne (utilisée avant transformation en AppError)
 * @private
 */
class HttpError extends Error {
  constructor(statusCode, body) {
    super(`HTTP ${statusCode}`);
    this.statusCode = statusCode;
    this.body = body;
    this.name = 'HttpError';
  }
}

export default BaseProvider;
