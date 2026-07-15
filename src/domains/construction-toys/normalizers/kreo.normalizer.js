/**
 * KRE-O Normalizer (Database + Filesystem)
 * 
 * Transforme les données de la table kreo_products en format Tako normalisé.
 * 
 * COLONNES TABLE kreo_products :
 *   id, set_number, name, franchise, sub_line, year, piece_count,
 *   kreons_count, kreons_included, description, price_retail,
 *   product_type, image_url, image_path, pdf_url, pdf_path,
 *   wiki_url, wiki_image_url, discovered_at, updated_at
 * 
 * COLONNES ENRICHIES (ajoutées par le provider via stockage fichiers) :
 *   image_file_url, pdf_file_url
 */

import { BaseNormalizer } from '../../../core/normalizers/index.js';

export class KreoNormalizer extends BaseNormalizer {
  constructor(options = {}) {
    super({
      source: 'kreo',
      type: 'construct_toy',
      domain: 'construction-toys',
      ...options
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALISATION PRINCIPALE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser un item KRE-O en format Tako (structure plate)
   * @override BaseNormalizer.normalize()
   */
  normalize(raw) {
    if (!raw) {
      throw new Error('normalize() : données brutes manquantes');
    }

    try {
      const sourceId = this.extractSourceId(raw);
      const title = this.extractTitle(raw);

      if (!sourceId) throw new Error('sourceId manquant');
      if (!title) throw new Error('title manquant');

      const base = {
        // Identification
        id: `${this.source}:${sourceId}`,
        type: this.type,
        source: this.source,
        sourceId: String(sourceId),

        // Titres
        title: this.cleanString(title),
        titleOriginal: this.cleanString(raw.name),

        // Description
        description: this.cleanString(raw.description),
        year: this.parseYear(raw.year),

        // Images
        images: this.normalizeImages(this.extractImages(raw)),

        // URLs
        urls: {
          source: raw.wiki_url || null,
          detail: this.buildDetailUrl(sourceId)
        }
      };

      const details = this.extractDetails(raw);

      return {
        ...base,
        details
      };

    } catch (error) {
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION DU NOYAU COMMUN
  // ═══════════════════════════════════════════════════════════════════════════

  extractSourceId(raw) {
    return raw.set_number || raw.id || null;
  }

  extractTitle(raw) {
    return raw.name || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS SPÉCIFIQUES KRE-O
  // ═══════════════════════════════════════════════════════════════════════════

  extractDetails(raw) {
    return {
      // Marque et classification
      brand: 'KRE-O',
      theme: raw.sub_line || null,
      category: raw.franchise || null,

      // Spécifications
      set_number: raw.set_number || null,
      pieces: raw.piece_count ? parseInt(raw.piece_count) : null,
      minifigs: raw.kreons_count ? parseInt(raw.kreons_count) : null,

      // Identifiants
      sku: raw.set_number || null,
      upc: null,

      // Tranche d'âge
      ageRange: null,

      // Franchise KRE-O (Transformers, Battleship, G.I. Joe, etc.)
      franchise: raw.franchise || null,
      subLine: raw.sub_line || null,

      // Kreons spécifiques
      kreonsIncluded: this.formatKreonsList(raw.kreons_included),
      kreonsCount: raw.kreons_count ? parseInt(raw.kreons_count) : null,

      // Type de produit (building_set, micro_changer, combiner, custom_kreon, etc.)
      productType: raw.product_type || 'building_set',

      // Prix
      price: raw.price_retail ? parseFloat(raw.price_retail) : null,
      listPrice: raw.price_retail ? parseFloat(raw.price_retail) : null,
      onSale: false,

      // Disponibilité (archivé = plus en vente)
      availability: {
        status: 'archived',
        inStock: false
      },

      // Notes
      rating: null,

      // Instructions
      instructions: this.extractInstructions(raw),
      instructionsUrl: raw.pdf_file_url || raw.pdf_proxy_url || raw.pdf_url || null,

      // Caractéristiques
      features: null,

      // Métadonnées enrichies
      metadata: {
        source: 'kreo',
        type: 'construction_toy',
        dataSource: 'database',
        franchise: raw.franchise,
        subLine: raw.sub_line,
        productType: raw.product_type,
        archivedAt: raw.discovered_at || null,
        updatedAt: raw.updated_at || null,
        wikiUrl: raw.wiki_url || null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS SPÉCIFIQUES KRE-O
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire les instructions au format unifié
   */
  extractInstructions(raw) {
    const pdfUrl = raw.pdf_file_url || raw.pdf_proxy_url || raw.pdf_url || null;
    if (!pdfUrl) return null;

    const setNum = (raw.set_number || '').toUpperCase();
    return {
      count: 1,
      manuals: [{
        id: setNum,
        description: `Notice de montage KRE-O ${setNum}`,
        pdfUrl,
        sequence: null
      }],
      url: pdfUrl
    };
  }

  /**
   * Formatter la liste de Kreons
   * @param {string} kreonsStr - Ex: "Sentinel Prime, Soundwave, Thundercracker"
   * @returns {string[]|null}
   */
  formatKreonsList(kreonsStr) {
    if (!kreonsStr) return null;
    return kreonsStr
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);
  }

  /**
   * Extraire les images
   */
  extractImages(raw) {
    const primary = raw.image_file_url || raw.image_proxy_url || raw.wiki_image_url || null;
    return {
      primary,
      thumbnail: primary,
      gallery: primary ? [primary] : []
    };
  }

  /**
   * Override normalizeImages pour ne pas altérer les URLs proxy
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
  // NORMALISATION RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

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

export default KreoNormalizer;
