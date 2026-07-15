/**
 * Rebrickable Normalizer
 * 
 * Transforme les données de l'API Rebrickable en format Tako normalisé.
 * 
 * @see https://rebrickable.com/api/v3/docs/
 * 
 * EXEMPLE DE DONNÉES BRUTES REBRICKABLE (set) :
 * {
 *   "set_num": "75192-1",
 *   "name": "Millennium Falcon",
 *   "year": 2017,
 *   "theme_id": 158,
 *   "num_parts": 7541,
 *   "set_img_url": "https://cdn.rebrickable.com/media/sets/75192-1/12345.jpg",
 *   "set_url": "https://rebrickable.com/sets/75192-1/millennium-falcon/",
 *   "last_modified_dt": "2024-01-15T12:00:00Z"
 * }
 * 
 * AVEC ENRICHISSEMENT (parts + minifigs) :
 * {
 *   ...set,
 *   "parts": { "count": 7541, "results": [...] },
 *   "minifigs": { "count": 8, "results": [...] }
 * }
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

/**
 * Mapping theme_id Rebrickable → nom du thème
 * Source: https://rebrickable.com/api/v3/lego/themes/
 */
const THEME_MAP = {
  1: 'Technic',
  50: 'Town',
  52: 'City',
  67: 'Duplo',
  111: 'Monkie Kid',
  126: 'Space',
  158: 'Star Wars',
  171: 'Super Heroes',
  186: 'Super Heroes Marvel',
  206: 'Racers',
  227: 'Creator',
  233: 'Seasonal',
  246: 'City',
  252: 'Trains',
  284: 'Castle',
  324: 'Classic',
  334: 'Ideas',
  407: 'Collectible Minifigures',
  425: 'BrickHeadz',
  435: 'Friends',
  494: 'NINJAGO',
  501: 'Jurassic World',
  535: 'Harry Potter',
  540: 'Overwatch',
  569: 'Hidden Side',
  577: 'Minecraft',
  599: 'Disney',
  610: 'Ideas',
  621: 'DOTS',
  673: 'Speed Champions',
  687: 'Creator Expert',
  688: 'Architecture',
  695: 'Botanical Collection',
  696: 'Art',
  697: 'Icons',
  704: 'VIDIYO',
  710: 'Powered Up',
  725: 'Bricktober',
  726: 'DREAMZzz'
};

export class RebrickableNormalizer extends BaseNormalizer {
  constructor(options = {}) {
    super({
      source: 'rebrickable',
      type: 'construct_toy',
      domain: 'construction-toys',
      ...options
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION AVEC STRUCTURE PLATE (v2.0.0)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser un item Rebrickable en format Tako avec structure plate
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
    return raw.set_num;
  }

  extractTitle(raw) {
    // Extraire le numéro de set (sans le suffixe -1)
    const setNumber = raw.set_num ? raw.set_num.replace(/-\d+$/, '') : '';
    const name = raw.name || 'Unknown Set';
    return setNumber ? `${setNumber} ${name}` : name;
  }

  extractTitleOriginal(raw) {
    // Rebrickable n'a pas de titre original distinct
    return null;
  }

  extractDescription(raw) {
    // Construire une description depuis les données disponibles
    const parts = [];
    
    const theme = this.getThemeName(raw.theme_id);
    if (theme) parts.push(theme);
    
    if (raw.num_parts) parts.push(`${raw.num_parts} pièces`);
    
    if (raw.minifigs?.count) {
      parts.push(`${raw.minifigs.count} minifig${raw.minifigs.count > 1 ? 's' : ''}`);
    }
    
    return parts.length > 0 ? parts.join(' • ') : null;
  }

  extractYear(raw) {
    return raw.year;
  }

  extractImages(raw) {
    return {
      primary: raw.set_img_url || null,
      thumbnail: raw.set_img_url || null,  // Rebrickable utilise la même image
      gallery: []
    };
  }

  extractSourceUrl(raw) {
    return raw.set_url || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION DES DÉTAILS SPÉCIFIQUES
  // ═══════════════════════════════════════════════════════════════════════════

  extractDetails(raw) {
    return {
      // Marque et classification
      brand: 'LEGO',
      theme: this.getThemeName(raw.theme_id),
      subtheme: null,  // Rebrickable n'a pas de sous-thème dans l'API sets
      category: null,
      
      // Spécifications standardisées
      set_number: raw.set_num ? raw.set_num.replace(/-\d+$/, '') : null,
      pieces: this.parseInt(raw.num_parts),
      minifigs: this.extractMinifigCount(raw),
      
      // Âge (non disponible via Rebrickable)
      ageRange: null,
      
      // Dimensions (non disponibles via Rebrickable)
      dimensions: null,
      
      // Prix (non disponible via Rebrickable)
      price: null,
      
      // Disponibilité
      availability: 'unknown',
      releaseDate: raw.year ? `${raw.year}-01-01` : null,
      retirementDate: null,
      
      // Instructions (non disponible directement)
      instructionsUrl: null,
      
      // Barcodes (non disponibles)
      barcodes: null,
      
      // Ratings (non disponibles)
      rating: null,
      
      // ══════════════════════════════════════════════════════════════════════
      // DONNÉES ENRICHIES REBRICKABLE (optionnelles)
      // ══════════════════════════════════════════════════════════════════════
      
      // Pièces détaillées (si enrichi)
      parts: this.extractParts(raw),
      
      // Minifigs détaillées (si enrichi)
      minifigsDetails: this.extractMinifigs(raw),
      
      // Métadonnées Rebrickable
      rebrickable: {
        setNum: raw.set_num,
        themeId: raw.theme_id,
        lastModified: raw.last_modified_dt || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS SPÉCIFIQUES REBRICKABLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Obtenir le nom du thème depuis son ID
   */
  getThemeName(themeId) {
    if (!themeId) return null;
    return THEME_MAP[themeId] || null;
  }

  /**
   * Extraire le nombre de minifigs
   */
  extractMinifigCount(raw) {
    // Depuis les données enrichies
    if (raw.minifigs?.count !== undefined) {
      return raw.minifigs.count;
    }
    // Depuis les données de liste (si disponible)
    if (raw.num_minifigs !== undefined) {
      return raw.num_minifigs;
    }
    return null;
  }

  /**
   * Extraire les détails des pièces (si enrichi)
   */
  extractParts(raw) {
    if (!raw.parts?.results) return null;
    
    return {
      totalCount: raw.num_parts,
      uniqueCount: raw.parts.count || raw.parts.results.length,
      spareCount: raw.parts.results.filter(p => p.is_spare).length,
      items: raw.parts.results.slice(0, 100).map(p => ({
        partNum: p.part?.part_num,
        name: p.part?.name,
        category: p.part?.part_cat_id,
        color: p.color?.name,
        colorRgb: p.color?.rgb ? `#${p.color.rgb}` : null,
        quantity: p.quantity,
        isSpare: p.is_spare,
        imageUrl: p.part?.part_img_url,
        elementId: p.element_id
      }))
    };
  }

  /**
   * Extraire les détails des minifigs (si enrichi)
   */
  extractMinifigs(raw) {
    if (!raw.minifigs?.results) return null;
    
    return {
      count: raw.minifigs.count || raw.minifigs.results.length,
      items: raw.minifigs.results.map(m => ({
        figNum: m.set_num,
        name: m.set_name,
        quantity: m.quantity,
        numParts: m.num_parts,
        imageUrl: m.set_img_url
      }))
    };
  }
}

export default RebrickableNormalizer;
