/**
 * Mega Construx Normalizer (v2.1 - Database + Filesystem)
 * 
 * Transforme les données de la base PostgreSQL MEGA en format Tako normalisé.
 * 
 * COLONNES TABLE products :
 *   id, sku, name, category, pdf_url, image_url, pdf_path, image_path, discovered_at
 * 
 * COLONNES ENRICHIES (ajoutées par le provider via stockage fichiers) :
 *   pdf_file_url, image_file_url
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class MegaNormalizer extends BaseNormalizer {
  constructor(options = {}) {
    super({
      source: 'mega',
      type: 'construct_toy',
      domain: 'construction-toys',
      ...options
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION AVEC STRUCTURE PLATE (v2.0.0)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser un item Mega en format Tako avec structure plate
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
    return raw.sku || raw.id || null;
  }

  extractTitle(raw) {
    // Nettoyer le nom original (enlever les infos de pièces)
    return this.cleanProductName(raw.name);
  }

  extractTitleOriginal(raw) {
    return raw.name || null;
  }

  extractPieceCount(raw) {
    return this.extractPieces(raw);
  }

  extractDescription(raw) {
    return null; // La BDD ne stocke pas de description
  }

  extractYear(raw) {
    // Extraire l'année depuis discovered_at si disponible
    if (raw.discovered_at) {
      return new Date(raw.discovered_at).getFullYear();
    }
    return null;
  }

  extractImage(raw) {
    // Priorité : URL fichier statique > URL image originale Mattel
    return raw.image_file_url || raw.image_proxy_url || raw.image_url || null;
  }

  extractSourceUrl(raw) {
    // Pas d'URL source dans la BDD, construire depuis le SKU
    if (raw.sku) {
      return `https://shopping.mattel.com/fr-fr/search?q=${raw.sku}`;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION DES DÉTAILS SPÉCIFIQUES
  // ═══════════════════════════════════════════════════════════════════════════

  extractDetails(raw) {
    return {
      // Marque et classification
      brand: 'MEGA',
      theme: null,
      category: raw.category || null,

      // Spécifications standardisées
      set_number: raw.sku || null,
      pieces: this.extractPieceCount(raw),
      minifigs: null,
      
      // SKU
      sku: raw.sku || null,
      upc: null,
      
      // Tranche d'âge
      ageRange: null,
      
      // Franchise (détectée depuis le nom ou la catégorie)
      franchise: raw.category || this.detectFranchise(raw.name),
      
      // Prix (non disponible dans l'archive)
      price: null,
      listPrice: null,
      onSale: false,
      
      // Disponibilité (archivé = plus en vente)
      availability: {
        status: 'archived',
        inStock: false
      },
      
      // Note et avis (non disponible dans l'archive)
      rating: null,
      
      // Instructions PDF (format unifié avec LEGO/Playmobil)
      instructions: this.extractInstructions(raw),
      instructionsUrl: raw.pdf_file_url || raw.pdf_proxy_url || raw.pdf_url || null,
      
      // Caractéristiques
      features: null,
      
      // Métadonnées enrichies
      metadata: {
        source: 'mega',
        type: 'construction_toy',
        dataSource: 'database',
        archivedAt: raw.discovered_at || null,
        pdfOriginalUrl: raw.pdf_url || null,
        imageOriginalUrl: raw.image_url || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS SPÉCIFIQUES MEGA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire les instructions au format unifié (compatible LEGO/Playmobil)
   * Format: { count, manuals: [{ id, description, pdfUrl, sequence }], url }
   */
  extractInstructions(raw) {
    const pdfUrl = raw.pdf_file_url || raw.pdf_proxy_url || raw.pdf_url || null;
    
    if (!pdfUrl) {
      return null;
    }

    const sku = (raw.sku || '').toUpperCase();
    return {
      count: 1,
      manuals: [{
        id: sku,
        description: `Notice de montage ${sku}`,
        pdfUrl: pdfUrl,
        sequence: null
      }],
      url: pdfUrl
    };
  }

  /**
   * Nettoyer le nom du produit (enlever les infos de pièces)
   */
  cleanProductName(name) {
    if (!name) return null;
    // Enlever "(XXX Pieces)" ou "(XXX Pcs)" du nom
    return name
      .replace(/\s*\(\d+\s*(?:Pieces?|Pcs?|pièces?|Onderdelen|Teile|Pezzi)\)/i, '')
      .trim();
  }

  /**
   * Extraire le nombre de pièces du nom
   */
  extractPieces(raw) {
    if (!raw.name) return null;
    const match = raw.name.match(/\((\d+)\s*(?:Pieces?|Pcs?|pièces?|Onderdelen|Teile|Pezzi)\)/i);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Parser la tranche d'âge
   */
  parseAgeRange(ageString) {
    if (!ageString) return null;

    // Format "8+" ou "8-12" ou "Ages 8+"
    const match = ageString.match(/(\d+)(?:\s*[-+]\s*(\d+)?)?/);
    if (!match) return null;

    const min = parseInt(match[1]);
    const max = match[2] ? parseInt(match[2]) : null;

    return {
      min,
      max,
      display: ageString.replace(/Ages?\s*/i, '').trim()
    };
  }

  /**
   * Détecter la franchise depuis le nom
   */
  detectFranchise(name) {
    if (!name) return null;
    
    const franchises = {
      'pokemon': /pok[eé]mon/i,
      'halo': /\bhalo\b/i,
      'hot-wheels': /hot\s*wheels/i,
      'barbie': /\bbarbie\b/i,
      'masters-of-the-universe': /masters?\s*of\s*the\s*universe|he-?man|skeletor/i,
      'minecraft': /minecraft/i,
      'call-of-duty': /call\s*of\s*duty|cod\b/i,
      'hello-kitty': /hello\s*kitty/i,
      'game-of-thrones': /game\s*of\s*thrones|got\b/i,
      'star-trek': /star\s*trek/i,
      'teenage-mutant-ninja-turtles': /ninja\s*turtles|tmnt/i
    };

    for (const [franchise, pattern] of Object.entries(franchises)) {
      if (pattern.test(name)) return franchise;
    }

    return null;
  }

  /**
   * Extraire toutes les images
   * Priorité : URL présignée MinIO > URL originale Mattel
   * Retourne le format attendu par BaseNormalizer.normalizeImages()
   */
  extractImages(raw) {
    // Priorité : URL fichier statique > URL proxy > URL originale Mattel
    const primary = raw.image_file_url || raw.image_proxy_url || raw.image_url || null;

    return {
      primary,
      thumbnail: primary,
      gallery: primary ? [primary] : []
    };
  }

  /**
   * Override normalizeImages pour ne pas altérer les URLs proxy relatives
   * BaseNormalizer.parseUrl() ajoute https:// aux chemins relatifs, ce qui casse les URLs proxy
   * @override
   */
  normalizeImages(images) {
    return {
      primary: images?.primary || null,
      thumbnail: images?.thumbnail || images?.primary || null,
      gallery: Array.isArray(images?.gallery) ? images.gallery.filter(Boolean) : []
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES DE NORMALISATION DE LA RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser la réponse de recherche complète
   * @override BaseNormalizer.normalizeSearchResponse()
   */
  normalizeSearchResponse(results, context = {}) {
    return {
      success: true,
      provider: this.source,
      domain: this.domain,
      query: context.query || '',
      total: context.total || results.length,
      count: results.length,
      data: results.map(item => this.normalize(item)),
      pagination: context.pagination ? {
        page: context.pagination.page,
        limit: context.pagination.limit || context.pagination.pageSize,
        hasMore: context.pagination.hasMore ?? false
      } : null,
      meta: {
        fetchedAt: new Date().toISOString(),
        source: 'database'
      }
    };
  }
}

export default MegaNormalizer;
