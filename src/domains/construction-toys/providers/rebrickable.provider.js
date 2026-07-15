/**
 * Rebrickable Provider
 * 
 * Provider pour l'API Rebrickable (base de données LEGO communautaire).
 * 
 * @see https://rebrickable.com/api/v3/docs/
 * 
 * ENDPOINTS PRINCIPAUX :
 * - /lego/sets/         : Recherche et liste de sets
 * - /lego/sets/{id}/    : Détails d'un set
 * - /lego/sets/{id}/parts/     : Pièces d'un set
 * - /lego/sets/{id}/minifigs/  : Minifigs d'un set
 * - /lego/themes/       : Liste des thèmes
 * - /lego/parts/        : Recherche de pièces
 * - /lego/minifigs/     : Recherche de minifigs
 * 
 * AUTHENTIFICATION :
 * Header "Authorization: key YOUR_API_KEY"
 * 
 * RATE LIMIT :
 * - 1 requête/seconde pour utilisateurs gratuits
 * - Quotas selon le plan
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { RebrickableNormalizer } from '../normalizers/rebrickable.normalizer.js';
import { env } from '../../../config/env.js';
import { NotFoundError, ValidationError, BadGatewayError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';

export class RebrickableProvider extends BaseProvider {
  constructor() {
    super({
      name: 'rebrickable',
      domain: 'construction-toys',
      baseUrl: 'https://rebrickable.com/api/v3',
      timeout: 20000,
      retries: 2,
      retryDelay: 1500  // Respecter le rate limit
    });

    this.normalizer = new RebrickableNormalizer();
    this.apiKey = env.REBRICKABLE_API_KEY;
    
    // Override des headers par défaut
    this.defaultHeaders = {
      'Accept': 'application/json',
      'Authorization': `key ${this.apiKey}`
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des sets LEGO
   * @param {string} query - Terme de recherche
   * @param {Object} options
   * @param {number} [options.page=1] - Page (1-indexed)
   * @param {number} [options.pageSize=100] - Résultats par page (max 1000)
   * @param {number} [options.themeId] - Filtrer par ID de thème
   * @param {number} [options.minYear] - Année minimale
   * @param {number} [options.maxYear] - Année maximale
   * @param {number} [options.minParts] - Nombre minimum de pièces
   * @param {number} [options.maxParts] - Nombre maximum de pièces
   * @param {string} [options.ordering='-year'] - Tri (year, -year, name, -name, num_parts)
   */
  async search(query, options = {}) {
    this.checkApiKey();
    
    const {
      page = 1,
      pageSize = 100,
      themeId,
      minYear,
      maxYear,
      minParts,
      maxParts,
      ordering = '-year'
    } = options;

    // Construire les paramètres
    const params = {
      search: query || '',
      page,
      page_size: Math.min(pageSize, 1000),
      ordering
    };

    // Filtres optionnels
    if (themeId) params.theme_id = themeId;
    if (minYear) params.min_year = minYear;
    if (maxYear) params.max_year = maxYear;
    if (minParts) params.min_parts = minParts;
    if (maxParts) params.max_parts = maxParts;

    // Appel API
    const response = await this.get('/lego/sets/', params);

    // Extraire les données
    const sets = response.results || [];
    const total = response.count || sets.length;

    // Normaliser et retourner
    return this.normalizer.normalizeSearchResponse(sets, {
      query,
      total,
      pagination: {
        page,
        limit: pageSize,
        hasMore: response.next !== null
      },
      lang: 'en'
    });
  }

  /**
   * Récupérer les détails d'un set par son numéro
   * @param {string} id - Numéro du set (ex: "75192" ou "75192-1")
   * @param {Object} options
   * @param {boolean} [options.includeParts=false] - Inclure les pièces
   * @param {boolean} [options.includeMinifigs=false] - Inclure les minifigs
   * @param {number} [options.maxParts=500] - Limite de pièces à retourner
   */
  async getById(id, options = {}) {
    this.checkApiKey();
    
    const {
      includeParts = false,
      includeMinifigs = false,
      maxParts = 500
    } = options;

    // Normaliser le numéro de set (ajouter -1 si nécessaire)
    const setNum = this.normalizeSetNumber(id);

    // Récupérer les infos de base
    let setData;
    try {
      setData = await this.get(`/lego/sets/${setNum}/`);
    } catch (error) {
      if (error.message?.includes('404')) {
        throw new NotFoundError(`Set LEGO "${id}" non trouvé sur Rebrickable`);
      }
      throw error;
    }

    // Enrichir avec les pièces si demandé
    if (includeParts) {
      try {
        const partsData = await this.get(`/lego/sets/${setNum}/parts/`, {
          page_size: Math.min(maxParts, 1000)
        });
        setData.parts = partsData;
      } catch (error) {
        logger.warn(`Impossible de récupérer les pièces pour ${setNum}:`, error.message);
      }
    }

    // Enrichir avec les minifigs si demandé
    if (includeMinifigs) {
      try {
        const minifigsData = await this.get(`/lego/sets/${setNum}/minifigs/`);
        setData.minifigs = minifigsData;
      } catch (error) {
        logger.warn(`Impossible de récupérer les minifigs pour ${setNum}:`, error.message);
      }
    }

    return this.normalizer.normalizeDetailResponse(setData, {
      lang: options.lang || 'en'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES SPÉCIFIQUES REBRICKABLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupérer les pièces d'un set
   * @param {string} setNum - Numéro du set
   * @param {Object} options
   * @param {number} [options.page=1] - Page
   * @param {number} [options.pageSize=500] - Pièces par page
   */
  async getSetParts(setNum, options = {}) {
    this.checkApiKey();
    
    const { page = 1, pageSize = 500 } = options;
    const normalizedNum = this.normalizeSetNumber(setNum);

    const response = await this.get(`/lego/sets/${normalizedNum}/parts/`, {
      page,
      page_size: Math.min(pageSize, 1000)
    });

    return {
      setNum: normalizedNum,
      count: response.count,
      parts: response.results.map(p => ({
        partNum: p.part?.part_num,
        name: p.part?.name,
        categoryId: p.part?.part_cat_id,
        imageUrl: p.part?.part_img_url,
        colorId: p.color?.id,
        colorName: p.color?.name,
        colorRgb: p.color?.rgb ? `#${p.color.rgb}` : null,
        quantity: p.quantity,
        isSpare: p.is_spare,
        elementId: p.element_id
      })),
      pagination: {
        page,
        limit: pageSize,
        hasMore: response.next !== null
      }
    };
  }

  /**
   * Récupérer les minifigs d'un set
   * @param {string} setNum - Numéro du set
   */
  async getSetMinifigs(setNum) {
    this.checkApiKey();
    
    const normalizedNum = this.normalizeSetNumber(setNum);
    const response = await this.get(`/lego/sets/${normalizedNum}/minifigs/`);

    return {
      setNum: normalizedNum,
      count: response.count,
      minifigs: response.results.map(m => ({
        figNum: m.set_num,
        name: m.set_name,
        quantity: m.quantity,
        numParts: m.num_parts,
        imageUrl: m.set_img_url
      }))
    };
  }

  /**
   * Récupérer la liste des thèmes
   * @param {number} [parentId] - ID du thème parent (pour les sous-thèmes)
   */
  async getThemes(parentId = null) {
    this.checkApiKey();
    
    const params = { page_size: 1000 };
    if (parentId) params.parent_id = parentId;

    const response = await this.get('/lego/themes/', params);

    return {
      count: response.count,
      themes: response.results.map(t => ({
        id: t.id,
        name: t.name,
        parentId: t.parent_id
      }))
    };
  }

  /**
   * Rechercher des pièces
   * @param {string} query - Terme de recherche
   * @param {Object} options
   */
  async searchParts(query, options = {}) {
    this.checkApiKey();
    
    const { page = 1, pageSize = 100 } = options;

    const response = await this.get('/lego/parts/', {
      search: query,
      page,
      page_size: Math.min(pageSize, 1000)
    });

    return {
      count: response.count,
      parts: response.results.map(p => ({
        partNum: p.part_num,
        name: p.name,
        categoryId: p.part_cat_id,
        imageUrl: p.part_img_url,
        partUrl: p.part_url
      })),
      pagination: {
        page,
        limit: pageSize,
        hasMore: response.next !== null
      }
    };
  }

  /**
   * Rechercher des minifigs
   * @param {string} query - Terme de recherche
   * @param {Object} options
   */
  async searchMinifigs(query, options = {}) {
    this.checkApiKey();
    
    const { page = 1, pageSize = 100 } = options;

    const response = await this.get('/lego/minifigs/', {
      search: query,
      page,
      page_size: Math.min(pageSize, 1000)
    });

    return {
      count: response.count,
      minifigs: response.results.map(m => ({
        figNum: m.set_num,
        name: m.name,
        numParts: m.num_parts,
        imageUrl: m.set_img_url
      })),
      pagination: {
        page,
        limit: pageSize,
        hasMore: response.next !== null
      }
    };
  }

  /**
   * Récupérer les couleurs disponibles
   */
  async getColors() {
    this.checkApiKey();
    
    const response = await this.get('/lego/colors/', { page_size: 500 });

    return {
      count: response.count,
      colors: response.results.map(c => ({
        id: c.id,
        name: c.name,
        rgb: c.rgb ? `#${c.rgb}` : null,
        isTrans: c.is_trans
      }))
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vérifier que la clé API est configurée
   * @private
   */
  checkApiKey() {
    if (!this.apiKey) {
      throw new ValidationError(
        'Clé API Rebrickable manquante. Configurez REBRICKABLE_API_KEY dans .env'
      );
    }
  }

  /**
   * Normaliser un numéro de set (ajouter -1 si nécessaire)
   * @private
   */
  normalizeSetNumber(setNum) {
    if (!setNum) {
      throw new ValidationError('Numéro de set requis');
    }
    
    const num = String(setNum).trim();
    
    // Si déjà au format "75192-1", retourner tel quel
    if (/-\d+$/.test(num)) {
      return num;
    }
    
    // Sinon ajouter -1 (variant par défaut)
    return `${num}-1`;
  }

  /**
   * Health check spécifique
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Test léger avec les thèmes
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

export default RebrickableProvider;
