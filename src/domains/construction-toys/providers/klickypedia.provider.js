/**
 * Klickypedia Provider
 * 
 * Provider pour l'encyclopédie Playmobil communautaire Klickypedia.
 * Utilise le scraping HTML (pas d'API).
 * 
 * @see https://www.klickypedia.com
 * 
 * FEATURES:
 * - Recherche de sets Playmobil
 * - Détails avec traductions multilingues (fr, es, de, en)
 * - Informations sur le thème, format, année de sortie/fin
 * - Lien vers les instructions Playmobil officielles
 * 
 * RATE LIMIT : Respecter 1 req/s pour ne pas surcharger le site
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { KlickypediaNormalizer } from '../normalizers/klickypedia.normalizer.js';
import { NotFoundError, BadGatewayError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';

// Configuration Klickypedia
const KLICKYPEDIA_BASE_URL = 'https://www.klickypedia.com';
const PLAYMOBIL_INSTRUCTIONS_CDN = 'https://playmobil.a.bigcontent.io/v1/static';

// Mapping des langues
const LANG_MAP = {
  'fr': 'fr',
  'fr-fr': 'fr',
  'es': 'es',
  'es-es': 'es',
  'de': 'de',
  'de-de': 'de',
  'en': 'en',
  'en-us': 'en',
  'en-gb': 'en'
};

// Mapping des drapeaux vers les codes langue
const FLAG_TO_LANG = {
  'flag-france': 'fr',
  'flag-spain': 'es',
  'flag-germany': 'de',
  'flag-greatbritain': 'en'
};

export class KlickypediaProvider extends BaseProvider {
  constructor() {
    super({
      name: 'klickypedia',
      domain: 'construction-toys',
      baseUrl: KLICKYPEDIA_BASE_URL,
      timeout: 20000,
      retries: 3,
      retryDelay: 1500
    });

    this.normalizer = new KlickypediaNormalizer();
    this.log = logger.create('KlickypediaProvider');
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des sets Playmobil sur Klickypedia
   * @param {string} query - Terme de recherche
   * @param {Object} options
   * @param {number} [options.pageSize=24] - Résultats par page (max 100)
   * @param {string} [options.lang=fr] - Langue (fr, es, de, en)
   */
  async search(query, options = {}) {
    const {
      pageSize = 24,
      lang = 'fr'
    } = options;

    const normalizedLang = this.normalizeLocale(lang);
    const max = Math.min(pageSize, 100);

    this.log.debug(`Recherche: "${query}" (lang=${normalizedLang}, max=${max})`);

    const url = `${KLICKYPEDIA_BASE_URL}/?s=${encodeURIComponent(query)}&elang=${normalizedLang}`;

    const response = await this.fetchWithRetry(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${normalizedLang},en;q=0.5`
      }
    });

    if (!response.ok) {
      throw new BadGatewayError(`Klickypedia HTTP ${response.status}`);
    }

    const html = await response.text();
    const products = this.parseSearchResults(html, max);

    this.log.info(`✅ Trouvé ${products.length} sets pour "${query}"`);

    return this.normalizer.normalizeSearchResponse(products, {
      query,
      total: products.length,
      pagination: {
        page: 1,
        limit: max,
        hasMore: false
      },
      lang: normalizedLang
    });
  }

  /**
   * Récupérer les détails d'un set par son ID
   * @param {string} id - ID du produit (ex: 71148)
   * @param {Object} options
   * @param {string} [options.lang=fr] - Langue
   */
  async getById(id, options = {}) {
    const { lang = 'fr' } = options;
    const normalizedLang = this.normalizeLocale(lang);
    const cleanId = String(id).trim();

    this.log.debug(`Récupération détails: ${cleanId} (lang=${normalizedLang})`);

    // Rechercher d'abord pour obtenir l'URL exacte
    const searchResults = await this.search(cleanId, { pageSize: 10, lang: normalizedLang });

    // Trouver le produit exact
    const product = searchResults.data.find(p =>
      p.sourceId === cleanId ||
      p.sourceId?.startsWith(cleanId)
    );

    if (!product) {
      throw new NotFoundError(`Set Playmobil ${cleanId} non trouvé sur Klickypedia`);
    }

    // Récupérer la page de détails
    const productUrl = `${product.urls?.source}?elang=${normalizedLang}`;

    const response = await this.fetchWithRetry(productUrl, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${normalizedLang},en;q=0.5`
      }
    });

    if (!response.ok) {
      throw new BadGatewayError(`Klickypedia HTTP ${response.status}`);
    }

    const html = await response.text();
    const details = this.parseProductDetails(html, cleanId, normalizedLang);

    // Vérifier si des instructions Playmobil sont disponibles
    const instructions = await this.checkPlaymobilInstructions(cleanId);

    // Fusionner avec les données de recherche
    const result = {
      ...product,
      ...details,
      instructions: instructions.available ? {
        productId: cleanId,
        available: true,
        url: instructions.url,
        format: 'PDF',
        source: 'playmobil'
      } : null
    };

    this.log.info(`✅ Détails ${cleanId}: ${result.name}${instructions.available ? ' (+ instructions)' : ''}`);

    return this.normalizer.normalizeDetailResponse(result, {
      lang: normalizedLang
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES SPÉCIFIQUES KLICKYPEDIA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupérer les instructions de montage pour un set
   * @param {string} productId - ID du set
   */
  async getKlickypediaInstructions(productId) {
    const cleanId = String(productId).replace(/-[a-z]{2,3}$/i, '').trim();
    const instructions = await this.checkPlaymobilInstructions(cleanId);

    return {
      productId: cleanId,
      available: instructions.available,
      url: instructions.url,
      format: instructions.available ? 'PDF' : null,
      source: 'playmobil',
      note: instructions.available
        ? 'Instructions officielles Playmobil'
        : 'Instructions non disponibles pour ce set'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normaliser le code langue
   * @private
   */
  normalizeLocale(lang) {
    if (!lang) return 'fr';
    const lower = lang.toLowerCase();
    return LANG_MAP[lower] || LANG_MAP[lower.split('-')[0]] || 'fr';
  }

  /**
   * Fetch avec retry
   * @private
   */
  async fetchWithRetry(url, options = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(this.timeout)
        });
        return response;
      } catch (error) {
        lastError = error;
        this.log.warn(`Tentative ${attempt}/${this.retries} échouée: ${error.message}`);
        if (attempt < this.retries) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * Délai
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num))
      .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  /**
   * Extraire l'ID du produit depuis l'URL
   * @private
   */
  extractProductId(url) {
    const match = url.match(/\/sets\/(\d+(?:-[a-z]{2,3})?)-/i);
    return match ? match[1] : null;
  }

  /**
   * Extraire le slug depuis l'URL
   * @private
   */
  extractSlug(url) {
    const match = url.match(/\/sets\/([^\/]+)\/?$/);
    return match ? match[1] : null;
  }

  /**
   * Parser les résultats de recherche HTML
   * @private
   */
  parseSearchResults(html, maxResults) {
    const products = [];

    // Pattern pour extraire les items de recherche
    const itemPattern = /<div class="thumb-wrap"><a href="([^"]+)"[^>]*title="([^"]+)"[^>]*><img[^>]+src="([^"]+)"/gi;

    let match;
    let position = 0;

    while ((match = itemPattern.exec(html)) !== null && products.length < maxResults) {
      const [, url, titleAttr, thumb] = match;

      // Ne garder que les URLs de sets
      if (!url.includes('/sets/')) continue;

      position++;

      const productId = this.extractProductId(url);
      const slug = this.extractSlug(url);

      if (!productId) continue;

      // Extraire le nom depuis le title
      const cleanTitle = this.decodeHtmlEntities(titleAttr);
      const nameParts = cleanTitle.match(/^(\d+(?:-[a-z]{2,3})?)\s*-\s*(.+)$/i);
      const displayName = nameParts ? nameParts[2].trim() : cleanTitle;

      // Chercher les années dans le HTML suivant cet item
      const afterMatch = html.substring(match.index, match.index + 1000);
      const yearsMatch = afterMatch.match(/sets-contador[^>]*>.*?(\d{4}).*?(?:(\d{4}))?/i);
      const released = yearsMatch?.[1] ? parseInt(yearsMatch[1]) : null;
      const discontinued = yearsMatch?.[2] ? parseInt(yearsMatch[2]) : null;

      products.push({
        id: productId,
        productCode: productId,
        name: displayName,
        fullName: cleanTitle,
        slug,
        url: url.startsWith('http') ? url : `${KLICKYPEDIA_BASE_URL}${url}`,
        thumb,
        position,
        released,
        discontinued,
        source: 'klickypedia'
      });
    }

    return products;
  }

  /**
   * Parser les détails d'un produit depuis le HTML
   * @private
   */
  parseProductDetails(html, productId, lang) {
    const details = {
      id: productId,
      productCode: productId,
      translations: {},
      theme: null,
      format: null,
      released: null,
      discontinued: null,
      figureCount: null,
      tags: [],
      images: [],
      description: null
    };

    // Extraire le titre principal
    const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*>[\s\S]*?Playmobil\s*(\d+(?:-[a-z]{2,3})?)\s*-\s*([^<]+)<\/h1>/i);
    if (titleMatch) {
      details.name = this.decodeHtmlEntities(titleMatch[2].trim());
    }

    // Extraire les traductions
    const translationPattern = /flag-([a-z]+)\.png"[^>]*>\s*([^<]+)<br>/gi;
    let transMatch;
    while ((transMatch = translationPattern.exec(html)) !== null) {
      const [, flag, translatedName] = transMatch;
      const langCode = FLAG_TO_LANG[`flag-${flag}`];
      if (langCode && translatedName.trim()) {
        details.translations[langCode] = this.decodeHtmlEntities(translatedName.trim());
      }
    }

    // Utiliser la traduction pour la langue demandée
    if (details.translations[lang]) {
      details.name = details.translations[lang];
    }

    // Extraire le thème
    const themeMatch = html.match(/<strong>(?:Thème|Theme)\s*:<\/strong>\s*<a[^>]+>([^<]+)<\/a>/i);
    if (themeMatch) {
      details.theme = this.decodeHtmlEntities(themeMatch[1].trim());
    }

    // Extraire le format
    const formatMatch = html.match(/<strong>Format\s*:<\/strong>\s*<a[^>]+>([^<]+)<\/a>/i);
    if (formatMatch) {
      details.format = this.decodeHtmlEntities(formatMatch[1].trim());
    }

    // Extraire l'année de sortie
    const releasedMatch = html.match(/<strong>(?:Sortie|Released)\s*:<\/strong>\s*<a[^>]+>(\d{4})<\/a>/i);
    if (releasedMatch) {
      details.released = parseInt(releasedMatch[1]);
    }

    // Extraire l'année de fin de vie
    const discontinuedMatch = html.match(/<strong>(?:Fin de vie|Discontinued)\s*:<\/strong>\s*<a[^>]+>(\d{4})<\/a>/i);
    if (discontinuedMatch) {
      details.discontinued = parseInt(discontinuedMatch[1]);
    }

    // Extraire le nombre de figurines
    const figuresMatch = html.match(/<strong>(?:Chiffres|Figures)\s*:<\/strong>\s*(\d+)/i);
    if (figuresMatch) {
      details.figureCount = parseInt(figuresMatch[1]);
    }

    // Extraire les tags
    const tagsMatch = html.match(/<div class="settags">([\s\S]*?)<\/div>/i);
    if (tagsMatch) {
      const tagPattern = /<a[^>]+>([^<]+)<\/a>/gi;
      let tagMatch;
      while ((tagMatch = tagPattern.exec(tagsMatch[1])) !== null) {
        details.tags.push(this.decodeHtmlEntities(tagMatch[1].trim()));
      }
    }

    // Extraire l'image principale depuis og:image
    const ogImageMatch = html.match(/og:image"\s+content="([^"]+)"/);
    if (ogImageMatch) {
      details.images.push(ogImageMatch[1]);
    }

    // Extraire l'image depuis JSON-LD
    const jsonLdMatch = html.match(/"contentUrl":"([^"]+)"/);
    if (jsonLdMatch && !details.images.includes(jsonLdMatch[1])) {
      details.images.push(jsonLdMatch[1]);
    }

    return details;
  }

  /**
   * Vérifier si les instructions Playmobil existent pour un set
   * @private
   */
  async checkPlaymobilInstructions(productId) {
    const cleanId = productId.replace(/-[a-z]{2,3}$/i, '');

    if (!/^\d+$/.test(cleanId)) {
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
        this.log.debug(`✅ Instructions trouvées pour set ${cleanId}`);
        return { available: true, url };
      } else {
        this.log.debug(`❌ Pas d'instructions pour set ${cleanId}`);
        return { available: false, url: null };
      }
    } catch (error) {
      this.log.debug(`⚠️ Erreur vérification instructions ${cleanId}: ${error.message}`);
      return { available: false, url: null };
    }
  }

  /**
   * Health check spécifique
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await fetch(KLICKYPEDIA_BASE_URL, {
        method: 'HEAD',
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(5000)
      });

      return {
        healthy: response.ok,
        latency: Date.now() - startTime,
        message: response.ok ? 'Klickypedia disponible' : `HTTP ${response.status}`
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

export default KlickypediaProvider;
