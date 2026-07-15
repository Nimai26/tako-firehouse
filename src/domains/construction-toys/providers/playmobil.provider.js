/**
 * Playmobil Provider
 * 
 * Provider pour le site officiel Playmobil.
 * Utilise FlareSolverr car le site est protégé par Cloudflare.
 * 
 * @see https://www.playmobil.com
 * 
 * FEATURES:
 * - Recherche de produits
 * - Détails avec prix, description, images
 * - Instructions de montage (PDF)
 * - Support multi-locales (fr-FR, en-US, de-DE, etc.)
 * 
 * ATTENTION: Nécessite FlareSolverr (~18s/requête)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { PlaymobilNormalizer } from '../normalizers/playmobil.normalizer.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';
import { env } from '../../../config/env.js';

// Configuration Playmobil
const PLAYMOBIL_BASE_URL = 'https://www.playmobil.com';
const PLAYMOBIL_MEDIA_URL = 'https://media.playmobil.com/i/playmobil';
const PLAYMOBIL_INSTRUCTIONS_CDN = 'https://playmobil.a.bigcontent.io/v1/static';

// Mapping des locales
const LOCALE_MAP = {
  'fr-fr': 'fr-fr', 'fr-be': 'fr-be', 'fr-ch': 'fr-ch', 'fr-ca': 'fr-ca',
  'en-us': 'en-us', 'en-gb': 'en-gb', 'en-ca': 'en-ca',
  'de-de': 'de-de', 'de-at': 'de-at', 'de-ch': 'de-ch',
  'es-es': 'es-es', 'es-mx': 'es-mx',
  'it-it': 'it-it',
  'nl-nl': 'nl-nl', 'nl-be': 'nl-be',
  'pt-pt': 'pt-pt',
  // Raccourcis
  'fr': 'fr-fr', 'en': 'en-us', 'de': 'de-de', 'es': 'es-es', 'it': 'it-it', 'nl': 'nl-nl', 'pt': 'pt-pt'
};

export class PlaymobilProvider extends BaseProvider {
  constructor() {
    super({
      name: 'playmobil',
      domain: 'construction-toys',
      baseUrl: PLAYMOBIL_BASE_URL,
      timeout: 60000, // FlareSolverr est lent
      retries: 2,
      retryDelay: 3000
    });

    this.normalizer = new PlaymobilNormalizer();
    this.log = logger.create('PlaymobilProvider');
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.fsrUrl = env.fsr?.url || 'http://flaresolverr:8191/v1';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des produits Playmobil
   * @param {string} query - Terme de recherche
   * @param {Object} options
   * @param {number} [options.pageSize=24] - Résultats par page (max 100)
   * @param {string} [options.lang=fr-FR] - Locale (fr-FR, en-US, de-DE, etc.)
   */
  async search(query, options = {}) {
    const {
      pageSize = 24,
      lang = 'fr-FR'
    } = options;

    const locale = this.normalizeLocale(lang);
    const max = Math.min(pageSize, 100);

    this.log.debug(`Recherche: "${query}" (locale=${locale}, max=${max})`);

    const searchUrl = `${PLAYMOBIL_BASE_URL}/${locale}/resultat-de-la-recherche/?q=${encodeURIComponent(query)}`;
    const html = await this.fetchViaFlaresolverr(searchUrl, locale);

    const products = this.parseSearchResults(html, max);

    this.log.info(`✅ Trouvé ${products.length} produits pour "${query}"`);

    return this.normalizer.normalizeSearchResponse(products, {
      query,
      total: products.length,
      pagination: {
        page: 1,
        limit: max,
        hasMore: false
      },
      lang: locale
    });
  }

  /**
   * Récupérer les détails d'un produit par son ID
   * @param {string} id - ID du produit (ex: 71148)
   * @param {Object} options
   * @param {string} [options.lang=fr-FR] - Locale
   */
  async getById(id, options = {}) {
    const { lang = 'fr-FR' } = options;
    const locale = this.normalizeLocale(lang);
    const cleanId = this.extractProductId(id);

    if (!cleanId || !this.isValidProductId(cleanId)) {
      throw new ValidationError(`ID produit Playmobil invalide: ${id}`);
    }

    this.log.debug(`Récupération détails: ${cleanId} (locale=${locale})`);

    // D'abord rechercher pour obtenir l'URL exacte
    const searchResults = await this.search(cleanId, { pageSize: 5, lang: locale });
    let productUrl = null;

    if (searchResults.data.length > 0) {
      const found = searchResults.data.find(p =>
        p.sourceId === cleanId ||
        p.details?.productCode === cleanId
      );
      if (found && found.urls?.source) {
        productUrl = found.urls.source;
      }
    }

    // Fallback: URL générique
    if (!productUrl) {
      productUrl = `${PLAYMOBIL_BASE_URL}/${locale}/product/${cleanId}.html`;
    }

    const html = await this.fetchViaFlaresolverr(productUrl, locale);
    const details = this.parseProductDetails(html, cleanId, locale);

    // Ajouter l'URL des instructions
    const instructions = await this.checkPlaymobilInstructions(cleanId);

    const result = {
      ...details,
      url: productUrl,
      instructions: instructions.available ? {
        productId: cleanId,
        available: true,
        url: instructions.url,
        format: 'PDF',
        source: 'playmobil'
      } : null
    };

    this.log.info(`✅ Produit Playmobil ${cleanId}: ${result.name}`);

    return this.normalizer.normalizeDetailResponse(result, { lang: locale });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES SPÉCIFIQUES PLAYMOBIL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupérer les instructions de montage pour un produit
   * @param {string} productId - ID du produit
   */
  async getPlaymobilInstructions(productId) {
    const cleanId = this.extractProductId(productId);

    if (!cleanId || !this.isValidProductId(cleanId)) {
      throw new ValidationError(`ID produit invalide: ${productId}`);
    }

    return this.checkPlaymobilInstructions(cleanId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS - FlareSolverr
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch une URL via FlareSolverr (bypass Cloudflare)
   * @private
   */
  async fetchViaFlaresolverr(url, locale = 'fr-fr') {
    this.log.debug(`FlareSolverr request: ${url}`);

    const payload = {
      cmd: 'request.get',
      url,
      maxTimeout: 60000
    };

    const response = await fetch(this.fsrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new BadGatewayError(`FlareSolverr HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new BadGatewayError(`FlareSolverr error: ${data.message || 'Unknown'}`);
    }

    this.log.debug(`FlareSolverr response: ${data.solution?.response?.length || 0} chars`);

    return data.solution?.response || '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS - Parsing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser la locale
   * @private
   */
  normalizeLocale(lang) {
    if (!lang) return 'fr-fr';
    const lower = lang.toLowerCase().replace('_', '-');
    return LOCALE_MAP[lower] || LOCALE_MAP[lower.split('-')[0]] || 'fr-fr';
  }

  /**
   * Extraire l'ID produit d'une URL ou chaîne
   * @private
   */
  extractProductId(input) {
    if (!input) return null;
    const str = String(input);

    // ID numérique direct (4-6 chiffres)
    const numericMatch = str.match(/^(\d{4,6})$/);
    if (numericMatch) return numericMatch[1];

    // Extraction depuis URL: /product-name/71148.html
    const urlMatch = str.match(/\/(\d{4,6})\.html/);
    if (urlMatch) return urlMatch[1];

    // Extraction depuis slug avec ID
    const slugMatch = str.match(/(\d{4,6})(?:\?|$)/);
    if (slugMatch) return slugMatch[1];

    return null;
  }

  /**
   * Valider un ID produit
   * @private
   */
  isValidProductId(id) {
    return /^\d{4,6}$/.test(String(id));
  }

  /**
   * Construire l'URL d'image
   * @private
   */
  buildImageUrl(productId, size = 512) {
    return `${PLAYMOBIL_MEDIA_URL}/${productId}_product_detail?w=${size}&fmt=auto&strip=true&qlt=80`;
  }

  /**
   * Construire l'URL du thumbnail
   * @private
   */
  buildThumbnailUrl(productId) {
    return `${PLAYMOBIL_MEDIA_URL}/${productId}_product_detail?w=200&sm=aspect&aspect=1:1&fmt=auto&strip=true&qlt=80`;
  }

  /**
   * Décoder les entités HTML
   * @private
   */
  decodeHtmlEntities(text) {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num))
      .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  /**
   * Parser le JSON depuis data-datalayer-impression
   * @private
   */
  parseDataLayerJson(dataStr) {
    try {
      const decoded = this.decodeHtmlEntities(dataStr);
      return JSON.parse(decoded);
    } catch (err) {
      this.log.debug(`Erreur parsing JSON: ${err.message}`);
      return null;
    }
  }

  /**
   * Parser les résultats de recherche HTML
   * @private
   */
  parseSearchResults(html, maxResults) {
    const products = [];
    const seenIds = new Set();

    // Méthode 1: data-datalayer-impression (données les plus complètes)
    const dataLayerPattern = /data-datalayer-impression="(\{[^"]+\})"/g;
    let match;

    while ((match = dataLayerPattern.exec(html)) !== null && products.length < maxResults) {
      const data = this.parseDataLayerJson(match[1]);
      if (!data?.ecommerce?.items?.[0]) continue;

      const item = data.ecommerce.items[0];
      const productId = item.item_id;

      if (!productId || seenIds.has(productId) || !this.isValidProductId(productId)) continue;
      seenIds.add(productId);

      products.push({
        id: productId,
        productCode: item.item_sku || productId,
        name: this.decodeHtmlEntities(item.item_name || ''),
        brand: item.item_brand || 'Playmobil',
        price: item.price,
        discountPrice: item.discount_price,
        discount: item.discount || null,
        currency: item.currency || 'EUR',
        category: item.item_category || null,
        category2: item.item_category2 || null,
        thumb: this.buildThumbnailUrl(productId),
        baseImgUrl: this.buildImageUrl(productId),
        source: 'playmobil'
      });
    }

    // Méthode 2: JSON-LD ItemList (backup)
    if (products.length === 0) {
      const itemListMatch = html.match(/"@type"\s*:\s*"ItemList"[^}]*"itemListElement"\s*:\s*\[([\s\S]*?)\]\s*\}/);
      if (itemListMatch) {
        try {
          const itemListJson = `{"itemListElement":[${itemListMatch[1]}]}`;
          const itemList = JSON.parse(itemListJson);

          for (const item of itemList.itemListElement || []) {
            if (item.url && products.length < maxResults) {
              const productId = this.extractProductId(item.url);
              if (productId && !seenIds.has(productId) && this.isValidProductId(productId)) {
                seenIds.add(productId);
                products.push({
                  id: productId,
                  productCode: productId,
                  url: item.url,
                  position: item.position,
                  thumb: this.buildThumbnailUrl(productId),
                  baseImgUrl: this.buildImageUrl(productId),
                  source: 'playmobil'
                });
              }
            }
          }
        } catch (parseErr) {
          this.log.debug(`Erreur parsing JSON-LD: ${parseErr.message}`);
        }
      }
    }

    // Enrichir les produits sans nom
    for (const product of products) {
      if (!product.name) {
        const namePattern = new RegExp(`item_id&quot;:&quot;${product.id}&quot;[^}]*item_name&quot;:&quot;([^&]+)&quot;`);
        const nameMatch = html.match(namePattern);
        if (nameMatch) {
          product.name = this.decodeHtmlEntities(nameMatch[1]);
        } else {
          product.name = `Playmobil ${product.id}`;
        }
      }
    }

    return products;
  }

  /**
   * Parser les détails d'un produit
   * @private
   */
  parseProductDetails(html, productId, locale) {
    const details = {
      id: productId,
      productCode: productId,
      name: null,
      description: null,
      price: null,
      discountPrice: null,
      currency: 'EUR',
      category: null,
      pieceCount: null,
      ageRange: null,
      images: [],
      thumb: this.buildThumbnailUrl(productId),
      brand: 'Playmobil',
      source: 'playmobil',
      lang: locale
    };

    // Extraire depuis data-datalayer (view_item event)
    const allDataLayers = html.matchAll(/data-datalayer="([^"]+)"/g);
    for (const match of allDataLayers) {
      const rawJson = match[1];
      if (rawJson.includes('view_item')) {
        try {
          const decoded = this.decodeHtmlEntities(rawJson);
          const dataArray = JSON.parse(decoded);
          const viewItem = Array.isArray(dataArray)
            ? dataArray.find(d => d.event === 'view_item')
            : (dataArray.event === 'view_item' ? dataArray : null);

          if (viewItem?.ecommerce?.items?.[0]) {
            const item = viewItem.ecommerce.items[0];
            details.name = this.decodeHtmlEntities(item.item_name || '');
            details.price = parseFloat(item.price) || null;
            details.discountPrice = parseFloat(item.discount_price) || null;
            details.currency = item.currency || 'EUR';
            details.category = item.item_category || null;
            break;
          }
        } catch (parseErr) {
          this.log.debug(`Erreur parsing dataLayer: ${parseErr.message}`);
        }
      }
    }

    // Fallback titre depuis HTML
    if (!details.name) {
      const titleMatch = html.match(/pdpMain__productTitle[^>]*>([^<]+)</);
      if (titleMatch) {
        details.name = this.decodeHtmlEntities(titleMatch[1].trim());
      }
    }
    if (!details.name) {
      details.name = `Playmobil ${productId}`;
    }

    // Description depuis les items de liste
    const descItems = [];
    const descPattern = /<li[^>]*>\s*<span[^>]*>[\s\S]*?<\/span>\s*([^<]+)<\/li>/gi;
    let descMatch;
    while ((descMatch = descPattern.exec(html)) !== null) {
      const text = descMatch[1].trim();
      if (text && text.length > 10 && !text.includes('svg') && !text.includes('icon')) {
        descItems.push(this.decodeHtmlEntities(text));
      }
    }
    if (descItems.length > 0) {
      details.description = descItems.join('\n');
    }

    // Nombre de pièces
    const pieceMatch = html.match(/(\d+)\s*pi[eè]ces/i);
    if (pieceMatch) {
      details.pieceCount = parseInt(pieceMatch[1], 10);
    }

    // Âge recommandé
    const ageMatch = html.match(/(\d+)\s*[-–]\s*(\d+)\s*ans|(\d+)\+?\s*ans/i);
    if (ageMatch) {
      if (ageMatch[1] && ageMatch[2]) {
        details.ageRange = `${ageMatch[1]}-${ageMatch[2]}`;
      } else if (ageMatch[3]) {
        details.ageRange = `${ageMatch[3]}+`;
      }
    }

    // Images
    const imagePattern = new RegExp(`media\\.playmobil\\.com/i/playmobil/${productId}_[^"'&\\s]+`, 'g');
    const seenImages = new Set();
    let imgMatch;
    while ((imgMatch = imagePattern.exec(html)) !== null) {
      const imgUrl = `https://${imgMatch[0].split('?')[0]}`;
      if (!seenImages.has(imgUrl)) {
        seenImages.add(imgUrl);
        details.images.push(imgUrl);
      }
    }

    // Fallback image
    if (details.images.length === 0) {
      details.images.push(this.buildImageUrl(productId, 1024));
    }

    return details;
  }

  /**
   * Vérifier si les instructions existent
   * @private
   */
  async checkPlaymobilInstructions(productId) {
    const cleanId = String(productId).replace(/[^0-9]/g, '');

    if (!/^\d{4,6}$/.test(cleanId)) {
      return { available: false, url: null };
    }

    const url = `${PLAYMOBIL_INSTRUCTIONS_CDN}/${cleanId}_buildinginstruction`;

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        this.log.debug(`✅ Instructions trouvées pour ${cleanId}`);
        return {
          productId: cleanId,
          available: true,
          url,
          format: 'PDF',
          source: 'playmobil'
        };
      } else {
        this.log.debug(`❌ Pas d'instructions pour ${cleanId}`);
        return { productId: cleanId, available: false, url: null };
      }
    } catch (error) {
      this.log.debug(`⚠️ Erreur vérification instructions ${cleanId}: ${error.message}`);
      return { productId: cleanId, available: false, url: null, error: error.message };
    }
  }

  /**
   * Health check
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      // Test simple sans FlareSolverr (juste le CDN media)
      const response = await fetch(`${PLAYMOBIL_MEDIA_URL}/71148_product_detail?w=100`, {
        method: 'HEAD',
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(5000)
      });

      // Test FlareSolverr
      let flaresolverrOk = false;
      try {
        const fsResponse = await fetch(this.fsrUrl.replace('/v1', ''), {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        flaresolverrOk = fsResponse.ok;
      } catch {
        flaresolverrOk = false;
      }

      return {
        healthy: response.ok && flaresolverrOk,
        latency: Date.now() - startTime,
        message: response.ok
          ? (flaresolverrOk ? 'Playmobil + FlareSolverr disponibles' : 'Playmobil OK, FlareSolverr indisponible')
          : `Playmobil HTTP ${response.status}`,
        details: {
          playmobil: response.ok,
          flaresolverr: flaresolverrOk
        }
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

export default PlaymobilProvider;
