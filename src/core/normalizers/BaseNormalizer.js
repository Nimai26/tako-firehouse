/**
 * BaseNormalizer - Classe de base pour la normalisation des données
 * 
 * RESPONSABILITÉ :
 * Transformer les données brutes d'un provider en format Tako normalisé.
 * 
 * STRUCTURE DE SORTIE GARANTIE :
 * Chaque item normalisé respecte TOUJOURS le schéma :
 * 
 * {
 *   id: "source:sourceId",        // ID Tako unique
 *   type: "construct_toy",        // Type de contenu
 *   source: "brickset",           // Provider d'origine
 *   sourceId: "75192",            // ID chez le provider
 *   title: "Millennium Falcon",   // Titre principal
 *   titleOriginal: null,          // Titre original (si différent)
 *   description: "...",           // Description
 *   year: 2017,                   // Année
 *   images: { primary, thumbnail, gallery },
 *   urls: { source, detail },
 *   details: { ... },             // Données spécifiques au domaine
 *   _raw: { ... }                 // Données brutes (optionnel, debug)
 * }
 */

import { coreItemSchema, detailSchemasByType } from '../schemas/content-types.js';
import { logger } from '../../shared/utils/logger.js';

export class BaseNormalizer {
  /**
   * @param {Object} config
   * @param {string} config.source - Nom du provider (ex: 'brickset')
   * @param {string} config.type - Type de contenu (ex: 'construct_toy')
   * @param {string} config.domain - Domaine Tako (ex: 'construction-toys')
   * @param {boolean} [config.includeRaw=false] - Inclure les données brutes
   */
  constructor({ source, type, domain, includeRaw = false }) {
    if (!source || !type || !domain) {
      throw new Error('BaseNormalizer: source, type et domain sont requis');
    }
    
    this.source = source;
    this.type = type;
    this.domain = domain;
    this.includeRaw = includeRaw;
    
    // Récupérer le schéma de détails approprié
    this.detailsSchema = detailSchemasByType[type];
    if (!this.detailsSchema) {
      logger.warn(`Pas de schéma de détails pour le type "${type}", utilisation d'un schéma permissif`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES ABSTRAITES - À implémenter dans les classes filles
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire l'ID source depuis les données brutes
   * @abstract
   * @param {Object} raw - Données brutes du provider
   * @returns {string} ID source
   */
  extractSourceId(raw) {
    throw new Error('extractSourceId() doit être implémenté');
  }

  /**
   * Extraire le titre depuis les données brutes
   * @abstract
   * @param {Object} raw - Données brutes
   * @returns {string} Titre
   */
  extractTitle(raw) {
    throw new Error('extractTitle() doit être implémenté');
  }

  /**
   * Extraire les détails spécifiques au domaine
   * @abstract
   * @param {Object} raw - Données brutes
   * @returns {Object} Détails normalisés
   */
  extractDetails(raw) {
    throw new Error('extractDetails() doit être implémenté');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES OPTIONNELLES - Peuvent être surchargées si nécessaire
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire le titre original (si différent du titre)
   * @param {Object} raw - Données brutes
   * @returns {string|null}
   */
  extractTitleOriginal(raw) {
    return null;
  }

  /**
   * Extraire la description
   * @param {Object} raw - Données brutes
   * @returns {string|null}
   */
  extractDescription(raw) {
    return null;
  }

  /**
   * Extraire l'année
   * @param {Object} raw - Données brutes
   * @returns {number|null}
   */
  extractYear(raw) {
    return null;
  }

  /**
   * Extraire les images
   * @param {Object} raw - Données brutes
   * @returns {{ primary: string|null, thumbnail: string|null, gallery: string[] }}
   */
  extractImages(raw) {
    return {
      primary: null,
      thumbnail: null,
      gallery: []
    };
  }

  /**
   * Extraire l'URL source
   * @param {Object} raw - Données brutes
   * @returns {string|null}
   */
  extractSourceUrl(raw) {
    return null;
  }

  /**
   * Construire l'URL de détail Tako
   * @param {string} sourceId - ID source
   * @returns {string}
   */
  buildDetailUrl(sourceId) {
    return `/api/${this.domain}/${this.source}/${sourceId}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES UTILITAIRES - Helpers pour les implémentations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Nettoyer une chaîne (trim, null si vide)
   * @param {any} value 
   * @returns {string|null}
   */
  cleanString(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
  }

  /**
   * Parser un nombre, null si invalide
   * @param {any} value 
   * @returns {number|null}
   */
  parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  /**
   * Parser un entier, null si invalide
   * @param {any} value 
   * @returns {number|null}
   */
  parseInt(value) {
    const num = this.parseNumber(value);
    return num !== null ? Math.floor(num) : null;
  }

  /**
   * Parser une année depuis une chaîne ou nombre
   * @param {any} value 
   * @returns {number|null}
   */
  parseYear(value) {
    if (!value) return null;
    
    // Si c'est un nombre
    const num = this.parseInt(value);
    if (num !== null && num >= 1800 && num <= 2100) {
      return num;
    }
    
    // Si c'est une date ISO ou chaîne contenant une année
    const str = String(value);
    const match = str.match(/\b(19|20)\d{2}\b/);
    if (match) {
      return parseInt(match[0], 10);
    }
    
    return null;
  }

  /**
   * Parser une URL, null si invalide
   * @param {any} value 
   * @returns {string|null}
   */
  parseUrl(value) {
    if (!value) return null;
    const str = String(value).trim();
    
    try {
      new URL(str);
      return str;
    } catch {
      // Tenter d'ajouter https://
      if (!str.startsWith('http')) {
        try {
          new URL(`https://${str}`);
          return `https://${str}`;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Convertir un tableau ou valeur unique en tableau
   * @param {any} value 
   * @returns {any[]}
   */
  toArray(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Extraire une valeur d'un objet par chemin (ex: 'a.b.c')
   * @param {Object} obj 
   * @param {string} path 
   * @param {any} defaultValue 
   * @returns {any}
   */
  getPath(obj, path, defaultValue = null) {
    if (!obj || !path) return defaultValue;
    
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined) {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current !== undefined ? current : defaultValue;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODE PRINCIPALE - Normalisation d'un item
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser un item brut en format Tako
   * @param {Object} raw - Données brutes du provider
   * @returns {Object} Item normalisé
   */
  normalize(raw) {
    if (!raw) {
      throw new Error('normalize() : données brutes manquantes');
    }

    try {
      const sourceId = this.extractSourceId(raw);
      const title = this.extractTitle(raw);
      
      if (!sourceId) {
        throw new Error('sourceId manquant dans les données');
      }
      if (!title) {
        throw new Error('title manquant dans les données');
      }

      // Construire l'item normalisé
      const normalized = {
        // Identification
        id: `${this.source}:${sourceId}`,
        type: this.type,
        source: this.source,
        sourceId: String(sourceId),
        
        // Titres
        title: this.cleanString(title),
        titleOriginal: this.cleanString(this.extractTitleOriginal(raw)),
        
        // Description et année
        description: this.cleanString(this.extractDescription(raw)),
        year: this.parseYear(this.extractYear(raw)),
        
        // Images
        images: this.normalizeImages(this.extractImages(raw)),
        
        // URLs
        urls: {
          source: this.parseUrl(this.extractSourceUrl(raw)),
          detail: this.buildDetailUrl(sourceId)
        },
        
        // Détails spécifiques au domaine
        details: this.extractDetails(raw)
      };

      // Ajouter les données brutes si demandé (debug)
      if (this.includeRaw) {
        normalized._raw = raw;
      }

      // Valider avec Zod si un schéma de détails existe
      if (this.detailsSchema) {
        try {
          normalized.details = this.detailsSchema.parse(normalized.details);
        } catch (zodError) {
          logger.warn(`Validation des détails échouée pour ${normalized.id}:`, {
            errors: zodError.errors?.map(e => `${e.path.join('.')}: ${e.message}`)
          });
          // On continue avec les données non validées
        }
      }

      return normalized;

    } catch (error) {
      logger.error(`Erreur de normalisation [${this.source}]:`, {
        error: error.message,
        raw: JSON.stringify(raw).substring(0, 500)
      });
      throw error;
    }
  }

  /**
   * Normaliser la structure images
   * @private
   */
  normalizeImages(images) {
    return {
      primary: this.parseUrl(images?.primary) || null,
      thumbnail: this.parseUrl(images?.thumbnail) || this.parseUrl(images?.primary) || null,
      gallery: this.toArray(images?.gallery)
        .map(url => this.parseUrl(url))
        .filter(Boolean)
    };
  }

  /**
   * Normaliser une liste d'items
   * @param {Object[]} rawItems - Liste de données brutes
   * @returns {{ items: Object[], errors: Object[] }}
   */
  normalizeMany(rawItems) {
    const items = [];
    const errors = [];

    for (let i = 0; i < rawItems.length; i++) {
      try {
        items.push(this.normalize(rawItems[i]));
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          raw: rawItems[i]
        });
      }
    }

    if (errors.length > 0) {
      logger.warn(`${errors.length}/${rawItems.length} items en erreur lors de la normalisation`);
    }

    return { items, errors };
  }

  /**
   * Normaliser pour une réponse de recherche
   * @param {Object[]} rawItems - Données brutes
   * @param {Object} meta - Métadonnées de recherche
   * @returns {Object} Réponse formatée
   */
  normalizeSearchResponse(rawItems, meta = {}) {
    const { items, errors } = this.normalizeMany(rawItems);
    
    return {
      success: true,
      provider: this.source,
      domain: this.domain,
      query: meta.query || '',
      total: meta.total ?? items.length,
      count: items.length,
      data: items,
      pagination: meta.pagination ? {
        page: meta.pagination.page,
        limit: meta.pagination.limit || meta.pagination.pageSize,
        hasMore: meta.pagination.hasMore ?? false
      } : null,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: meta.lang || 'en',
        cached: meta.cached || false,
        cacheAge: meta.cacheAge || null,
        errors: errors.length > 0 ? errors.length : undefined
      }
    };
  }

  /**
   * Normaliser pour une réponse de détail
   * @param {Object} rawItem - Données brutes
   * @param {Object} meta - Métadonnées
   * @returns {Object} Réponse formatée
   */
  normalizeDetailResponse(rawItem, meta = {}) {
    const normalized = this.normalize(rawItem);
    
    return {
      success: true,
      provider: this.source,
      domain: this.domain,
      id: normalized.id,
      data: normalized,
      meta: {
        fetchedAt: new Date().toISOString(),
        lang: meta.lang || 'en',
        cached: meta.cached || false,
        cacheAge: meta.cacheAge || null
      }
    };
  }
}

export default BaseNormalizer;
