/**
 * LEGO Normalizer
 * 
 * Transforme les données du site LEGO.com en format Tako normalisé.
 * 
 * SOURCES DE DONNÉES :
 * - GraphQL API (SearchProductsQuery)
 * - Scraping HTML (__NEXT_DATA__, data-test attributes)
 * - JSON-LD structured data
 * 
 * EXEMPLE DE DONNÉES BRUTES (GraphQL) :
 * {
 *   "id": "75192",
 *   "productCode": "75192",
 *   "name": "Millennium Falcon™",
 *   "slug": "millennium-falcon-75192",
 *   "primaryImage": "https://...",
 *   "variant": {
 *     "sku": "6175771",
 *     "price": { "centAmount": 84999, "currencyCode": "EUR" },
 *     "attributes": {
 *       "pieceCount": 7541,
 *       "ageRange": "18+",
 *       "availabilityStatus": "E_AVAILABLE"
 *     }
 *   }
 * }
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

/**
 * Mapping des statuts LEGO vers Tako
 */
const AVAILABILITY_MAP = {
  // Codes API internes LEGO
  'E_AVAILABLE': 'available',
  'F_BACKORDER_FOR_DATE': 'available',  // Précommande
  'C_OUT_OF_STOCK': 'out_of_stock',
  'D_TEMPORARILY_SOLD_OUT': 'out_of_stock',
  // Codes anglais
  'AVAILABLE': 'available',
  'OUT_OF_STOCK': 'out_of_stock',
  'COMING_SOON': 'coming_soon',
  'RETIRED': 'retired',
  // Textes français (scraping)
  'Disponible': 'available',
  'En stock': 'available',
  'Rupture de stock': 'out_of_stock',
  'Épuisé': 'out_of_stock',
  'Temporairement en rupture': 'out_of_stock',
  'Bientôt disponible': 'coming_soon',
  'Prochainement': 'coming_soon',
  'Retiré': 'retired'
};

/**
 * IDs de produits à exclure des résultats
 * Ce sont des outils, services ou produits non-physiques
 */
const EXCLUDED_PRODUCT_IDS = new Set([
  '40179',  // Mosaic Maker - outil de personnalisation
  '40154',  // Brick Calendar - calendrier
  '40178',  // Mini VIP Store - cadeau VIP
  '40488',  // Coffee Cart - GWP
  '501020',  // Set fantôme - n'existe pas mais apparaît dans les recherches
  '5006290', // BrickLink Designer Program
  '5006291', // BrickLink Designer Program
]);

/**
 * Patterns de noms à exclure
 */
const EXCLUDED_NAME_PATTERNS = [
  /mosaic maker/i,
  /gift card/i,
  /carte cadeau/i,
  /vip reward/i,
  /minifigure factory/i,
];

export class LegoNormalizer extends BaseNormalizer {
  constructor(options = {}) {
    super({
      source: 'lego',
      type: 'construct_toy',
      domain: 'construction-toys',
      ...options
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION AVEC STRUCTURE PLATE (v2.0.0)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser un item LEGO en format Tako avec structure plate
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

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION DU NOYAU COMMUN
  // ═══════════════════════════════════════════════════════════════════════════

  extractSourceId(raw) {
    // Priorité: productCode > id, nettoyé des suffixes
    const id = raw.productCode || raw.id;
    return this.cleanProductId(id);
  }

  extractTitle(raw) {
    const id = this.extractSourceId(raw);
    const name = raw.name || raw.productName || 'Unknown Set';
    
    // Nettoyer le titre des suffixes marketing
    const cleanName = this.cleanTitle(name);
    
    // Ajouter l'ID au début si pas déjà présent
    if (id && !cleanName.startsWith(id)) {
      return `${id} ${cleanName}`;
    }
    return cleanName;
  }

  extractDescription(raw) {
    return this.cleanString(raw.description);
  }

  extractYear(raw) {
    // LEGO ne fournit pas l'année directement dans l'API
    // On pourrait l'extraire du slug ou de métadonnées supplémentaires
    return raw.year || null;
  }

  extractImages(raw) {
    const images = {
      primary: null,
      thumbnail: null,
      gallery: []
    };

    // Image principale
    images.primary = raw.baseImgUrl || raw.primaryImage || raw.image || null;
    images.thumbnail = raw.primaryImage || raw.thumb || raw.image || null;

    // Galerie d'images (pour les détails)
    if (Array.isArray(raw.images)) {
      images.gallery = raw.images
        .filter(img => typeof img === 'string' || img?.url)
        .map(img => typeof img === 'string' ? img : img.url);
      
      // Si pas d'image primaire mais galerie non vide, utiliser la première
      if (!images.primary && images.gallery.length > 0) {
        images.primary = images.gallery[0];
      }
      if (!images.thumbnail && images.gallery.length > 0) {
        images.thumbnail = images.gallery[0];
      }
    }

    return images;
  }

  extractSourceUrl(raw) {
    if (raw.url) return raw.url;
    
    const id = this.extractSourceId(raw);
    const slug = raw.slug || id;
    // URL par défaut (sera surchargée selon la locale)
    return `https://www.lego.com/fr-fr/product/${slug}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION DES DÉTAILS SPÉCIFIQUES
  // ═══════════════════════════════════════════════════════════════════════════

  extractDetails(raw) {
    const variant = raw.variant || {};
    const attributes = variant.attributes || {};
    const price = variant.price || {};
    const listPrice = variant.listPrice || {};

    // Les données peuvent être dans attributes (GraphQL) ou à la racine (scraping)
    const pieceCount = attributes.pieceCount || raw.pieceCount;
    const minifigCount = attributes.minifiguresCount || raw.minifiguresCount || raw.minifigCount;
    const ageRange = attributes.ageRange || raw.ageRange;
    const availabilityStatus = attributes.availabilityStatus || raw.availability;
    const availabilityText = attributes.availabilityText || raw.availabilityText;
    const theme = raw.theme || this.extractTheme(raw);

    return {
      // Marque et classification
      brand: 'LEGO',
      theme: theme,
      subtheme: raw.subtheme || null,
      category: raw.category || null,

      // Spécifications standardisées
      set_number: this.extractSourceId(raw),
      pieces: this.parseInt(pieceCount),
      minifigs: this.parseInt(minifigCount),

      // Âge
      ageRange: this.parseAgeRange(ageRange),

      // Dimensions (non disponibles dans l'API standard)
      dimensions: null,

      // Prix
      price: this.extractPrice(price) || this.extractPriceFromRaw(raw),
      listPrice: this.extractPrice(listPrice),
      onSale: attributes.onSale || false,
      salePercentage: this.parseInt(variant.salePercentage),

      // Disponibilité
      availability: this.mapAvailability(availabilityStatus),
      availabilityText: availabilityText || null,
      canAddToBag: attributes.canAddToBag ?? null,
      isNew: attributes.isNew || false,

      // Dates (non disponibles dans l'API standard)
      releaseDate: raw.releaseDate || null,
      retirementDate: null,

      // Instructions / Manuels
      instructionsUrl: this.extractSourceId(raw) 
        ? `https://www.lego.com/service/buildinginstructions/${this.extractSourceId(raw)}`
        : null,
      instructions: this.extractInstructions(raw),

      // Identifiants additionnels
      barcodes: null,
      sku: variant.sku || raw.sku || null,
      slug: raw.slug || null,

      // Ratings
      rating: raw.rating ? {
        average: this.parseNumber(raw.rating),
        count: this.parseInt(raw.reviewCount)
      } : null,

      // Vidéos (pour les détails)
      videos: Array.isArray(raw.videos) ? raw.videos.map(url => ({
        url,
        proxyUrl: `/api/construction-toys/lego/proxy/video?url=${encodeURIComponent(url)}`,
        filename: url.split('/').pop()
      })) : []
    };
  }

  /**
   * Extraire les instructions/manuels
   */
  extractInstructions(raw) {
    if (!raw.instructions) {
      return null;
    }
    
    const instructions = raw.instructions;
    return {
      count: instructions.manuals?.length || 0,
      manuals: (instructions.manuals || []).map(m => ({
        id: m.id || null,
        description: m.description || null,
        pdfUrl: m.pdfUrl,
        sequence: m.sequence || null
      })),
      url: instructions.url || null
    };
  }

  /**
   * Extraire le prix depuis les données brutes du scraping
   */
  extractPriceFromRaw(raw) {
    if (raw.price && typeof raw.price === 'string') {
      // Format "849.99 €" ou "849,99€"
      const match = raw.price.match(/(\d+[.,]?\d*)/);
      if (match) {
        const value = parseFloat(match[1].replace(',', '.'));
        return {
          amount: value,  // Pour validation Zod
          value: value,
          currency: 'EUR',
          display: raw.price.trim()
        };
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS SPÉCIFIQUES LEGO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Nettoyer un ID produit LEGO (enlever suffixes, slugs, etc.)
   */
  cleanProductId(id) {
    if (!id) return null;
    
    const idStr = String(id);
    
    // Extraire l'ID numérique (4-6 chiffres)
    const numericMatch = idStr.match(/(\d{4,6})/);
    if (numericMatch) {
      return numericMatch[1];
    }
    
    return idStr;
  }

  /**
   * Valider un ID produit LEGO
   */
  isValidProductId(id) {
    if (!id) return false;
    const idStr = String(id);
    
    // Exclure les IDs invalides
    if (/[?&=]/.test(idStr)) return false;
    if (idStr.includes('tbd') || idStr.includes('icmp')) return false;
    
    // Doit être 4-6 chiffres
    return /^\d{4,6}$/.test(idStr);
  }

  /**
   * Nettoyer un titre LEGO
   */
  cleanTitle(title) {
    if (!title) return '';
    
    return title
      // Supprimer le symbole ® et ™
      .replace(/[®™]/g, '')
      // Supprimer les suffixes d'âge
      .replace(/\s*[-–]\s*(?:Jouet|Briques?)\s*[Dd]e\s*[Cc]onstruction\s*[-–]\s*\d+\s*[Aa]ns?\s*[Ee]t\s*\+/gi, '')
      .replace(/\s*[-–]\s*\d+\s*[Aa]ns?\s*[Ee]t\s*\+/gi, '')
      // Supprimer les mentions de pièces entre parenthèses
      .replace(/\s*\(\d+\s*(?:Pieces?|Pcs?|pièces?)\)/gi, '')
      .trim();
  }

  /**
   * Extraire le thème depuis les données
   */
  extractTheme(raw) {
    // Si explicitement fourni
    if (raw.theme) return raw.theme;
    if (raw.themes && raw.themes.length > 0) return raw.themes[0];
    
    // Essayer d'extraire du nom
    const themesKnown = [
      'Star Wars', 'City', 'Technic', 'Creator', 'Friends', 'Ninjago',
      'Marvel', 'DC', 'Harry Potter', 'Disney', 'Architecture', 
      'Speed Champions', 'Ideas', 'Icons', 'Minecraft', 'Jurassic',
      'Super Mario', 'Sonic', 'Botanical Collection', 'Art'
    ];
    
    const name = (raw.name || '').toLowerCase();
    for (const theme of themesKnown) {
      if (name.includes(theme.toLowerCase())) {
        return theme;
      }
    }
    
    return null;
  }

  /**
   * Parser une tranche d'âge LEGO
   */
  parseAgeRange(ageRange) {
    if (!ageRange) return null;
    
    const str = String(ageRange).trim();
    
    // Format "18+" ou "6+"
    const plusMatch = str.match(/(\d+)\s*\+/);
    if (plusMatch) {
      return {
        min: parseInt(plusMatch[1], 10),
        max: null
      };
    }
    
    // Format "6-12"
    const rangeMatch = str.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
      return {
        min: parseInt(rangeMatch[1], 10),
        max: parseInt(rangeMatch[2], 10)
      };
    }
    
    return null;
  }

  /**
   * Extraire le prix depuis l'objet price LEGO
   */
  extractPrice(priceObj) {
    if (!priceObj) return null;
    
    // Format centAmount
    if (priceObj.centAmount !== undefined) {
      return {
        amount: priceObj.centAmount / 100,
        currency: priceObj.currencyCode || 'EUR',
        formatted: priceObj.formattedAmount || null
      };
    }
    
    // Format direct
    if (priceObj.amount !== undefined) {
      return {
        amount: priceObj.amount,
        currency: priceObj.currency || 'EUR',
        formatted: null
      };
    }
    
    return null;
  }

  /**
   * Mapper le statut de disponibilité LEGO vers Tako
   */
  mapAvailability(status) {
    if (!status) return 'unknown';
    return AVAILABILITY_MAP[status] || AVAILABILITY_MAP[status.toUpperCase()] || 'unknown';
  }

  /**
   * Vérifier si un produit doit être exclu
   */
  isExcludedProduct(product) {
    const id = this.cleanProductId(product.productCode || product.id);
    const name = product.name || '';

    // Vérifier l'ID
    if (EXCLUDED_PRODUCT_IDS.has(id)) {
      return true;
    }

    // Vérifier le nom
    for (const pattern of EXCLUDED_NAME_PATTERNS) {
      if (pattern.test(name)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Filtrer les produits valides d'une liste
   */
  filterValidProducts(products) {
    return products.filter(p => {
      const id = p.productCode || p.id;
      const cleanId = this.cleanProductId(id);
      
      // Doit avoir un ID valide
      if (!this.isValidProductId(cleanId)) {
        return false;
      }

      // Ne doit pas être dans la liste d'exclusion
      if (this.isExcludedProduct(p)) {
        return false;
      }

      return true;
    });
  }
}

export default LegoNormalizer;
