/**
 * Playmobil Normalizer
 * 
 * Transforme les données du site officiel Playmobil vers le format Tako unifié.
 * 
 * FORMAT V2.0.6 (complet) :
 * - Structure plate héritée de BaseNormalizer
 * - Méthodes d'extraction standard (extractSourceId, extractTitle, etc.)
 * - Utilise normalize() pour un format cohérent avec tous les providers
 * 
 * SOURCES DE DONNÉES :
 * - Scraping HTML via FlareSolverr
 * - Données commerciales avec prix
 * - Images haute résolution
 * - Support multi-locales
 * - Instructions PDF officielles
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class PlaymobilNormalizer extends BaseNormalizer {
  constructor() {
    super({
      source: 'playmobil',
      type: 'construct_toy',
      domain: 'construction-toys',
      includeRaw: false
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES D'EXTRACTION STANDARD (Pattern BaseNormalizer)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser un item Playmobil en format Tako avec structure plate
   * @override BaseNormalizer.normalize()
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

      // Construire l'objet de base avec le tronc commun
      const base = {
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
        }
      };

      // Extraire les détails spécifiques et les aplatir directement
      const details = this.extractDetails(raw);

      // Format canonique : noyau commun + details imbriqué
      const normalized = {
        ...base,
        details
      };

      // Ajouter les données brutes si demandé (debug)
      if (this.includeRaw) {
        normalized._raw = raw;
      }

      return normalized;

    } catch (error) {
      throw error;
    }
  }

  /**
   * Extraire l'ID source du produit
   * @override
   */
  extractSourceId(raw) {
    return String(raw.id || raw.productCode || '').trim();
  }

  /**
   * Extraire le titre
   * @override
   */
  extractTitle(raw) {
    const id = this.extractSourceId(raw);
    const name = raw.name || `Playmobil ${id}`;
    
    // Ajouter l'ID au début si pas déjà présent
    if (id && !name.startsWith(id)) {
      return `${id} ${name}`;
    }
    return name;
  }

  /**
   * Extraire le titre original (même que title pour Playmobil)
   * @override
   */
  extractTitleOriginal(raw) {
    return raw.name || null;
  }

  /**
   * Extraire la description
   * @override
   */
  extractDescription(raw) {
    return this.cleanString(raw.description);
  }

  /**
   * Extraire l'année (non disponible dans les données Playmobil)
   * @override
   */
  extractYear(raw) {
    return raw.year || null;
  }

  /**
   * Extraire les images
   * @override
   */
  extractImages(raw) {
    const images = {
      primary: null,
      thumbnail: null,
      gallery: []
    };

    // Images depuis le tableau images
    if (Array.isArray(raw.images) && raw.images.length > 0) {
      images.gallery = raw.images;
      images.primary = raw.images[0];
      images.thumbnail = raw.images[0];
    }

    // Thumb
    if (raw.thumb) {
      if (!images.thumbnail) images.thumbnail = raw.thumb;
      if (!images.primary) images.primary = raw.thumb;
      if (!images.gallery.includes(raw.thumb)) {
        images.gallery.unshift(raw.thumb);
      }
    }

    // Base image URL
    if (raw.baseImgUrl) {
      if (!images.primary) images.primary = raw.baseImgUrl;
      if (!images.gallery.includes(raw.baseImgUrl)) {
        images.gallery.push(raw.baseImgUrl);
      }
    }

    // Image de recherche
    if (raw.src_image_url) {
      if (!images.thumbnail) images.thumbnail = raw.src_image_url;
      if (!images.primary) images.primary = raw.src_image_url;
      if (!images.gallery.includes(raw.src_image_url)) {
        images.gallery.push(raw.src_image_url);
      }
    }

    return images;
  }

  /**
   * Extraire l'URL source
   * @override
   */
  extractSourceUrl(raw) {
    return raw.url || raw.src_url || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION DES DÉTAILS SPÉCIFIQUES PLAYMOBIL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire les détails spécifiques à Playmobil
   * @override
   */
  extractDetails(raw) {
    return {
      // Marque et classification
      brand: 'Playmobil',
      category: raw.category || null,
      category2: raw.category2 || null,
      theme: raw.theme || null,

      // Spécifications standardisées
      set_number: raw.productCode || raw.id || null,
      pieces: this.parseInt(raw.pieceCount),
      minifigs: this.parseInt(raw.figureCount),

      // Codes produit (spécifiques Playmobil)
      productCode: raw.productCode || raw.id || null,
      slug: this.generateSlug(raw.name || raw.id),
      figureCount: this.parseInt(raw.figureCount),

      // Prix
      price: this.normalizePrice(raw.price, raw.currency),
      listPrice: raw.listPrice ? this.normalizePrice(raw.listPrice, raw.currency) : null,
      discountPrice: raw.discountPrice ? this.normalizePrice(raw.discountPrice, raw.currency) : null,
      discount: raw.discount || null,
      currency: raw.currency || 'EUR',
      onSale: Boolean(raw.discountPrice && raw.price && raw.discountPrice < raw.price),

      // Âge
      ageRange: this.parseAgeRange(raw.ageRange),

      // Disponibilité
      availability: raw.availability || 'unknown',
      canAddToBag: Boolean(raw.canAddToBag ?? true),
      inStock: Boolean(raw.inStock ?? true),

      // Instructions (format unifié avec LEGO)
      instructions: this.extractInstructions(raw),
      instructionsUrl: raw.instructionsUrl || null,

      // Métadonnées additionnelles
      attributes: raw.attributes || null,

      // URLs supplémentaires (compatibilité)
      playmobil_url: raw.url || raw.src_url || null,
      
      // Métadonnées de position (pour recherche)
      position: raw.position || null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire les instructions/manuels (format unifié avec LEGO)
   * @private
   */
  extractInstructions(raw) {
    if (!raw.instructions) {
      return null;
    }

    const instructions = raw.instructions;

    // Si c'est déjà au format unifié LEGO (avec manuals[])
    if (instructions.manuals && Array.isArray(instructions.manuals)) {
      return instructions;
    }

    // Convertir le format Playmobil simple vers le format unifié
    if (instructions.available && instructions.url) {
      const productId = instructions.productId || raw.id || raw.productCode;
      return {
        count: 1,
        manuals: [
          {
            id: productId,
            description: `Notice de montage ${productId}`,
            pdfUrl: instructions.url,
            sequence: null
          }
        ],
        url: instructions.url
      };
    }

    // Si pas disponible
    return null;
  }

  /**
   * Normaliser le prix
   * @private
   */
  normalizePrice(price, currency = 'EUR') {
    if (price === null || price === undefined) return null;
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return null;

    return {
      amount: numPrice,
      currency: currency || 'EUR',
      formatted: `${numPrice.toFixed(2)} ${currency || 'EUR'}`
    };
  }

  /**
   * Parser une tranche d'âge Playmobil
   * @private
   */
  parseAgeRange(ageRange) {
    if (!ageRange) return null;
    
    const str = String(ageRange).trim();
    
    // Format "4+" ou "6+"
    const plusMatch = str.match(/(\d+)\s*\+/);
    if (plusMatch) {
      return {
        min: parseInt(plusMatch[1], 10),
        max: null
      };
    }
    
    // Format "4-10"
    const rangeMatch = str.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
      return {
        min: parseInt(rangeMatch[1], 10),
        max: parseInt(rangeMatch[2], 10)
      };
    }
    
    // Format "4 ans et +"
    const ageMatch = str.match(/(\d+)\s*ans?\s*et\s*\+/i);
    if (ageMatch) {
      return {
        min: parseInt(ageMatch[1], 10),
        max: null
      };
    }
    
    return null;
  }

  /**
   * Générer un slug depuis le nom
   * @private
   */
  generateSlug(name) {
    if (!name) return '';
    return String(name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

export default PlaymobilNormalizer;
