/**
 * FlareSolverr Client
 * 
 * Client partagé pour interagir avec FlareSolverr.
 * Gère automatiquement les sessions et le nettoyage des ressources.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️  IMPORTANT - GESTION DES RESSOURCES
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * FlareSolverr lance un navigateur Chromium pour chaque session.
 * Sans gestion correcte, cela peut causer :
 * - Explosion de la RAM (chaque Chromium = ~200-500 Mo)
 * - CPU à 100% (301 Chromium = 960% CPU !)
 * - Système inutilisable
 * 
 * RÈGLES OBLIGATOIRES :
 * 1. TOUJOURS appeler destroySession() après utilisation
 * 2. Utiliser try/finally pour garantir le nettoyage
 * 3. Ne PAS créer plusieurs instances du client pour le même provider
 * 4. Réutiliser la session tant qu'elle est valide (SESSION_TTL)
 * 
 * EXEMPLE D'UTILISATION :
 * ```javascript
 * const fsr = new FlareSolverrClient('mon-provider');
 * try {
 *   const html = await fsr.get('https://example.com');
 *   // ... traitement
 * } finally {
 *   await fsr.destroySession();
 * }
 * ```
 * 
 * CONFIGURATION DOCKER RECOMMANDÉE :
 * ```yaml
 * flaresolverr:
 *   environment:
 *     - MAX_SESSIONS=3          # Limite le nombre de sessions
 *     - SESSION_TTL=300000      # Auto-destruction après 5 min
 *     - HEADLESS=true
 *   deploy:
 *     resources:
 *       limits:
 *         memory: 2G
 *         cpus: '2'
 * ```
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { env } from '../../config/env.js';
import { logger } from '../../shared/utils/logger.js';
import { BadGatewayError } from '../../shared/errors/index.js';

// Durée de validité d'une session (5 minutes)
const SESSION_TTL = 5 * 60 * 1000;

// Timeout par défaut pour les requêtes (60 secondes)
const DEFAULT_TIMEOUT = 60000;

export class FlareSolverrClient {
  /**
   * @param {string} providerName - Nom du provider (pour les logs)
   * @param {Object} options
   * @param {string} [options.fsrUrl] - URL de FlareSolverr
   * @param {number} [options.timeout] - Timeout en ms
   */
  constructor(providerName, options = {}) {
    this.providerName = providerName;
    this.fsrUrl = options.fsrUrl || env.fsr?.url || 'http://flaresolverr:8191/v1';
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    
    // État de session (UNE session par client)
    this._session = {
      id: null,
      cookies: [],
      lastVisit: 0
    };
    
    // Nettoyage automatique à la fermeture du processus
    const cleanup = () => this.destroySession();
    process.on('beforeExit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    logger.debug(`[${this.providerName}] FlareSolverr client créé (${this.fsrUrl})`);
  }

  /**
   * Effectuer une requête GET via FlareSolverr
   * @param {string} url - URL à visiter
   * @param {Object} options
   * @param {number} [options.waitInSeconds=2] - Temps d'attente après chargement
   * @param {string} [options.proxy] - URL du proxy HTTP (ex: http://gluetun:8888)
   * @returns {Promise<string>} - HTML de la page
   */
  async get(url, options = {}) {
    const response = await this._request('request.get', url, options);
    return response.response || '';
  }

  /**
   * Effectuer une requête POST via FlareSolverr
   * @param {string} url - URL cible
   * @param {string} postData - Données POST (JSON stringifié)
   * @param {Object} options
   * @returns {Promise<string>} - Réponse
   */
  async post(url, postData, options = {}) {
    const response = await this._request('request.post', url, {
      ...options,
      postData
    });
    return response.response || '';
  }

  /**
   * S'assurer qu'on a une session valide avec cookies
   * @param {string} siteUrl - URL du site pour initialiser les cookies
   * @param {Object} [options] - Options additionnelles (ex: { proxy })
   */
  async ensureSession(siteUrl, options = {}) {
    const now = Date.now();
    
    // Si session récente, ne rien faire
    if (this._session.lastVisit && (now - this._session.lastVisit) < SESSION_TTL) {
      return;
    }

    logger.debug(`[${this.providerName}] Rafraîchissement de la session...`);

    // Créer une session si nécessaire
    if (!this._session.id) {
      await this._createSession();
    }

    // Visiter la page pour obtenir les cookies (wait 5s pour laisser le JS s'exécuter)
    try {
      await this._request('request.get', siteUrl, { waitInSeconds: 5, ...options });
      this._session.lastVisit = now;
    } catch (e) {
      logger.warn(`[${this.providerName}] Erreur visite initiale: ${e.message}`);
    }
  }

  /**
   * Détruire la session FlareSolverr pour libérer les ressources
   * ⚠️ TOUJOURS appeler cette méthode après utilisation !
   */
  async destroySession() {
    if (!this._session.id) return;
    
    const sessionId = this._session.id;
    
    try {
      logger.debug(`[${this.providerName}] Destruction session: ${sessionId}`);
      await fetch(this.fsrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cmd: 'sessions.destroy',
          session: sessionId 
        })
      });
      logger.debug(`[${this.providerName}] Session ${sessionId} détruite`);
    } catch (e) {
      logger.warn(`[${this.providerName}] Erreur destruction session: ${e.message}`);
    } finally {
      this._session.id = null;
      this._session.cookies = [];
      this._session.lastVisit = 0;
    }
  }

  /**
   * Vérifier si FlareSolverr est disponible
   * @returns {Promise<{healthy: boolean, latency: number, message: string}>}
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.fsrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'sessions.list' })
      });
      
      const json = await response.json();
      const sessionCount = json.sessions?.length || 0;
      
      return {
        healthy: json.status === 'ok',
        latency: Date.now() - startTime,
        message: json.status === 'ok' 
          ? `FlareSolverr disponible (${sessionCount} sessions actives)` 
          : 'FlareSolverr indisponible',
        sessions: sessionCount
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: `FlareSolverr error: ${error.message}`,
        sessions: 0
      };
    }
  }

  /**
   * Obtenir les cookies de la session courante
   * @returns {Array} Cookies
   */
  getCookies() {
    return this._session.cookies;
  }

  /**
   * Vérifier si une session est active
   * @returns {boolean}
   */
  hasSession() {
    return !!this._session.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES PRIVÉES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Créer une nouvelle session FlareSolverr
   * @private
   */
  async _createSession() {
    try {
      const response = await fetch(this.fsrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'sessions.create' })
      });
      const json = await response.json();
      if (json.session) {
        this._session.id = json.session;
        logger.debug(`[${this.providerName}] Session créée: ${json.session}`);
      }
    } catch (e) {
      logger.warn(`[${this.providerName}] Impossible de créer une session: ${e.message}`);
    }
  }

  /**
   * Effectuer une requête FlareSolverr
   * @private
   */
  async _request(cmd, url, options = {}) {
    // Extraire le proxy des options avant de spreader
    const { proxy, ...restOptions } = options;
    
    const body = {
      cmd,
      url,
      maxTimeout: this.timeout,
      ...restOptions
    };

    // Ajouter le proxy si spécifié (FlareSolverr le passe à Chromium)
    if (proxy) {
      body.proxy = { url: proxy };
      logger.debug(`[${this.providerName}] Requête via proxy: ${proxy}`);
    }

    // Ajouter la session si disponible
    if (this._session.id) {
      body.session = this._session.id;
    }

    let response;
    try {
      response = await fetch(this.fsrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (fetchError) {
      // Erreur réseau - détruire la session pour recommencer proprement
      await this.destroySession();
      throw new BadGatewayError(`FlareSolverr unreachable: ${fetchError.message}`);
    }

    if (!response.ok) {
      await this.destroySession();
      throw new BadGatewayError(`FlareSolverr error: ${response.status}`);
    }

    const json = await response.json();
    
    if (json.status !== 'ok') {
      // Session peut être corrompue - la détruire
      await this.destroySession();
      throw new BadGatewayError(`FlareSolverr failed: ${json.message || 'Unknown error'}`);
    }

    // Mettre à jour les cookies
    if (json.solution?.cookies) {
      this._session.cookies = json.solution.cookies;
    }

    return json.solution || {};
  }
}

export default FlareSolverrClient;
