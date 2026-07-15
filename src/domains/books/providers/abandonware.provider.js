/**
 * Abandonware Magazines Provider
 * 
 * Provider pour l'archive de magazines via l'API native d'abandonware-magazines.org.
 * L'API utilise un format texte brut avec séparateurs " ; " et lignes "<br>".
 * 
 * Endpoints API :
 * - choixapi=12 → Liste de tous les magazines (id, nom, classement)
 * - choixapi=13&choixmagazine={id} → Numéros d'un magazine
 * 
 * FEATURES:
 * - Recherche de magazines par nom
 * - Liste de tous les magazines disponibles
 * - Détails d'un magazine avec ses numéros
 * - Covers des numéros
 * 
 * Pas de clé API requise. Pas de rate limit documenté.
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { AbandonwareNormalizer } from '../normalizers/abandonware.normalizer.js';
import { NotFoundError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';

const BASE_URL = 'https://www.abandonware-magazines.org';
const API_SEPARATOR = ' ; ';

export class AbandonwareProvider extends BaseProvider {
  constructor() {
    super({
      name: 'abandonware',
      domain: 'books',
      baseUrl: BASE_URL,
      timeout: 30000,
      retries: 2,
      retryDelay: 1000
    });

    this.normalizer = new AbandonwareNormalizer();
    this.log = logger.create('AbandonwareProvider');

    // Cache interne de la liste des magazines
    this._magazinesCache = null;
    this._magazinesCacheTime = 0;
    this._magazinesCacheTTL = 3600000; // 1h
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API INTERNE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Appelle l'API native et retourne le texte brut
   */
  async _fetchApi(choixapi, params = {}) {
    const url = new URL(`${BASE_URL}/api-dev.php`);
    url.searchParams.set('choixapi', String(choixapi));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    this.log.debug(`API call: choixapi=${choixapi}, params=${JSON.stringify(params)}`);

    // request() accepte une URL complète (commence par http)
    // parseResponse retourne du texte pour les réponses non-JSON
    return this.request(url.toString());
  }

  /**
   * Parse la réponse API (format point-virgule avec lignes <br>)
   */
  _parseApiResponse(text, expectedFields) {
    const results = [];
    const lines = text.split('<br>');

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const fields = line.split(API_SEPARATOR).map(f => f.trim());

      // Ignorer la ligne d'en-tête
      if (fields.length >= expectedFields && !['identifiant', 'nom du magazine', 'classement'].includes(fields[0].toLowerCase())) {
        results.push(fields);
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHARGEMENT DES MAGAZINES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Charge (ou retourne du cache) la liste de tous les magazines
   */
  async _getMagazinesList() {
    const now = Date.now();
    if (this._magazinesCache && (now - this._magazinesCacheTime) < this._magazinesCacheTTL) {
      return this._magazinesCache;
    }

    const text = await this._fetchApi(12);
    const entries = this._parseApiResponse(text, 3);

    const magazines = [];
    for (const entry of entries) {
      try {
        const id = parseInt(entry[0], 10);
        const name = entry[1]?.trim();
        if (id && name) {
          magazines.push({ id, name });
        }
      } catch {
        continue;
      }
    }

    this._magazinesCache = magazines;
    this._magazinesCacheTime = now;
    this.log.info(`${magazines.length} magazines chargés depuis l'API`);
    return magazines;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche de magazines par nom
   */
  async search(query, options = {}) {
    const { maxResults = 20 } = options;
    const magazines = await this._getMagazinesList();
    const queryLower = query.toLowerCase();

    const matching = magazines.filter(m => m.name.toLowerCase().includes(queryLower));
    const limited = matching.slice(0, maxResults);

    return this.normalizer.normalizeSearchResponse(limited, {
      query,
      total: matching.length,
      count: limited.length
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTE COMPLÈTE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retourne la liste de tous les magazines disponibles
   */
  async listMagazines(options = {}) {
    const { page = 1, limit = 50 } = options;
    const magazines = await this._getMagazinesList();

    const start = (page - 1) * limit;
    const paged = magazines.slice(start, start + limit);

    return this.normalizer.normalizeMagazineListResponse(paged, {
      total: magazines.length,
      page,
      limit,
      hasMore: start + limit < magazines.length
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS D'UN MAGAZINE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un magazine avec la liste de ses numéros
   */
  async getMagazineDetails(magazineId) {
    const magazines = await this._getMagazinesList();
    const magazine = magazines.find(m => m.id === magazineId);

    if (!magazine) {
      throw new NotFoundError(`Magazine ${magazineId} non trouvé`);
    }

    const issues = await this._fetchIssues(magazineId);

    return this.normalizer.normalizeDetailResponse(magazine, issues);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NUMÉROS D'UN MAGAZINE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les numéros d'un magazine (avec pagination)
   */
  async getMagazineIssues(magazineId, options = {}) {
    const { page = 1, limit = 50 } = options;

    const magazines = await this._getMagazinesList();
    const magazine = magazines.find(m => m.id === magazineId);
    if (!magazine) {
      throw new NotFoundError(`Magazine ${magazineId} non trouvé`);
    }

    const allIssues = await this._fetchIssues(magazineId);

    const start = (page - 1) * limit;
    const paged = allIssues.slice(start, start + limit);

    return this.normalizer.normalizeIssuesResponse(magazine, paged, {
      total: allIssues.length,
      page,
      limit,
      hasMore: start + limit < allIssues.length
    });
  }

  /**
   * Fetch brut des numéros depuis l'API
   */
  async _fetchIssues(magazineId) {
    const text = await this._fetchApi(13, { choixmagazine: magazineId });
    const entries = this._parseApiResponse(text, 9);

    const issues = [];
    for (const entry of entries) {
      try {
        // Format: Nom ; mag_id ; num_id ; CD ; HS ; Numéro ; Filename ; Date ; cover_url
        const issue = {
          magazineName: entry[0]?.trim(),
          magazineId: parseInt(entry[1], 10),
          issueId: parseInt(entry[2], 10),
          isCd: entry[3]?.trim().toUpperCase() === 'CD',
          isHs: !!entry[4]?.trim(),
          issueNumber: entry[5]?.trim() || '',
          filename: entry[6]?.trim() || '',
          date: entry[7]?.trim() || '',
          coverUrl: entry[8]?.trim() || ''
        };
        if (issue.issueId) {
          issues.push(issue);
        }
      } catch {
        continue;
      }
    }

    this.log.info(`Magazine ${magazineId}: ${issues.length} numéros récupérés`);
    return issues;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  async healthCheck() {
    const start = Date.now();
    try {
      // Tester un appel léger à l'API
      await this._fetchApi(12);
      return {
        healthy: true,
        latency: Date.now() - start,
        message: 'Abandonware Magazines API accessible'
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        message: error.message
      };
    }
  }
}
