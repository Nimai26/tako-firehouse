/**
 * LEGO Provider
 * 
 * Provider pour le site officiel LEGO.com
 * Utilise le scraping HTML via FlareSolverr pour bypass Cloudflare
 * 
 * STRATÉGIE :
 * - Scraper la page de recherche via FlareSolverr
 * - Extraire les données depuis __NEXT_DATA__ ou HTML
 * 
 * DÉPENDANCES :
 * - FlareSolverr (FSR_URL dans .env)
 * 
 * ENDPOINTS :
 * - search: Recherche de produits
 * - getById: Détails d'un produit par ID
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { LegoNormalizer } from '../normalizers/lego.normalizer.js';
import { env } from '../../../config/env.js';
import { NotFoundError, BadGatewayError, ValidationError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/utils/logger.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const LEGO_BASE_URL = 'https://www.lego.com';

// Durée de validité des cookies de session (5 minutes)
const SESSION_TTL = 5 * 60 * 1000;

export class LegoProvider extends BaseProvider {
  constructor() {
    super({
      name: 'lego',
      domain: 'construction-toys',
      baseUrl: LEGO_BASE_URL,
      timeout: 60000,  // LEGO est lent
      retries: 2
    });

    this.normalizer = new LegoNormalizer();
    this.fsrUrl = env.fsr?.url || 'http://flaresolverr:8191/v1';
    
    // État de session FlareSolverr (singleton - UNE session par provider)
    this._session = {
      id: null,
      cookies: [],
      lastVisit: 0
    };
    
    // Nettoyage automatique à la fermeture du processus
    process.on('beforeExit', () => this.destroySession());
    process.on('SIGINT', () => this.destroySession());
    process.on('SIGTERM', () => this.destroySession());
  }
  
  /**
   * Détruire la session FlareSolverr pour libérer les ressources
   */
  async destroySession() {
    if (!this._session.id) return;
    
    try {
      logger.debug(`[LEGO] Destruction session: ${this._session.id}`);
      await fetch(this.fsrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cmd: 'sessions.destroy',
          session: this._session.id 
        })
      });
    } catch (e) {
      logger.warn(`[LEGO] Erreur destruction session: ${e.message}`);
    } finally {
      this._session.id = null;
      this._session.cookies = [];
      this._session.lastVisit = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPLÉMENTATION DES MÉTHODES ABSTRAITES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rechercher des produits LEGO
   * @param {string} query - Terme de recherche
   * @param {Object} options
   * @param {number} [options.page=1] - Page
   * @param {number} [options.pageSize=24] - Résultats par page (max 100)
   * @param {string} [options.locale='fr-FR'] - Locale (fr-FR, en-US, etc.)
   */
  async search(query, options = {}) {
    const {
      page = 1,
      pageSize = 24,
      locale = env.defaultLocale || 'fr-FR'
    } = options;

    if (!query || query.trim().length === 0) {
      throw new ValidationError('Le terme de recherche est requis');
    }

    logger.debug(`[LEGO] Recherche: "${query}" (page ${page}, locale ${locale})`);

    // Scraper via FlareSolverr
    const scrapedResult = await this.searchViaScraping(query, locale);
    return this.formatSearchResponse(scrapedResult, query, page, pageSize);
  }

  /**
   * Récupérer les détails d'un produit par son ID
   * @param {string} id - ID du produit (ex: "75192")
   * @param {Object} options
   * @param {string} [options.locale='fr-FR'] - Locale
   * @param {boolean} [options.includeInstructions=true] - Inclure les manuels
   */
  async getById(id, options = {}) {
    const { 
      locale = env.defaultLocale || 'fr-FR',
      includeInstructions = true 
    } = options;

    const cleanId = this.normalizer.cleanProductId(id);
    if (!cleanId || !this.normalizer.isValidProductId(cleanId)) {
      throw new ValidationError(`ID produit LEGO invalide: "${id}"`);
    }

    logger.debug(`[LEGO] Détails produit: ${cleanId} (locale ${locale})`);

    // NOTE: Impossible de paralléliser car FlareSolverr ne supporte qu'une
    // requête à la fois par session. Deux sessions = double RAM (Chromium).
    // Solution: Cache pour éviter les appels répétés.

    const productData = await this.scrapeProductPage(cleanId, locale);
    
    if (!productData || !productData.name) {
      throw new NotFoundError(`Produit LEGO "${cleanId}" non trouvé`);
    }

    // Enrichir avec les manuels d'instructions
    if (includeInstructions) {
      try {
        const instructions = await this.getLegoInstructions(cleanId, { locale });
        productData.instructions = instructions;
        
        // Si l'année est présente dans les instructions et absente du produit, l'ajouter
        if (instructions.year && !productData.year) {
          productData.year = instructions.year;
          logger.debug(`[LEGO] Année enrichie depuis les instructions: ${instructions.year}`);
        }
      } catch (err) {
        logger.warn(`[LEGO] Impossible de récupérer les instructions: ${err.message}`);
        productData.instructions = { manuals: [] };
      }
    }

    return this.normalizer.normalizeDetailResponse(productData, {
      lang: locale.split('-')[0]
    });
  }

  /**
   * Récupérer les manuels d'instructions LEGO
   * @param {string} id - ID du produit (ex: "75192")
   * @param {Object} options
   * @param {string} [options.locale='fr-FR'] - Locale
   * @returns {Promise<Object>} Manuels d'instructions
   */
  async getLegoInstructions(id, options = {}) {
    const { locale = env.defaultLocale || 'fr-FR' } = options;

    const cleanId = this.normalizer.cleanProductId(id);
    if (!cleanId || !this.normalizer.isValidProductId(cleanId)) {
      throw new ValidationError(`ID produit LEGO invalide: "${id}"`);
    }

    logger.debug(`[LEGO] Instructions produit: ${cleanId} (locale ${locale})`);

    await this.ensureValidSession(locale);

    const instructionsUrl = `${LEGO_BASE_URL}/${locale.toLowerCase()}/service/building-instructions/${cleanId}`;
    
    const response = await this.fsrRequest('request.get', instructionsUrl, {
      waitInSeconds: 2
    });

    const html = response.response || '';
    
    // Vérifier que c'est une page d'instructions valide
    const isInstructionsPage = html.includes('building-instructions') || 
                               html.includes('BuildingInstruction') ||
                               html.includes('.pdf');
    
    if (!isInstructionsPage && (html.includes("Cette page n'existe pas") || html.length < 50000)) {
      logger.warn(`[LEGO] Page instructions non trouvée pour ${cleanId}`);
      return { 
        id: cleanId, 
        manuals: [],
        url: instructionsUrl 
      };
    }

    return this.extractLegoInstructionsFromHtml(html, cleanId, instructionsUrl);
  }

  /**
   * Extraire les manuels d'instructions depuis le HTML
   * @private
   */
  extractLegoInstructionsFromHtml(html, productId, url) {
    const instructions = {
      id: productId,
      name: null,
      manuals: [],
      url
    };

    // Chercher dans __NEXT_DATA__
    const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const pageProps = nextData?.props?.pageProps;
        
        // Infos produit
        const productData = pageProps?.product || pageProps?.data?.product;
        if (productData?.name) {
          instructions.name = productData.name;
        }
        
        // Manuels depuis buildingInstructions
        const buildingInstructions = pageProps?.buildingInstructions || 
                                     pageProps?.data?.buildingInstructions ||
                                     pageProps?.instructions;
        
        if (Array.isArray(buildingInstructions)) {
          for (const instr of buildingInstructions) {
            const pdfUrl = instr.pdfUrl || instr.pdfLocation || instr.url;
            if (pdfUrl && this.isValidManualUrl(pdfUrl)) {
              instructions.manuals.push({
                id: instr.id || null,
                description: instr.description || instr.name || null,
                pdfUrl: pdfUrl,
                sequence: instr.sequence || instr.sequenceNumber || null
              });
            }
          }
        }
        
        // Chercher aussi dans Apollo State
        const apolloState = pageProps?.__APOLLO_STATE__ || pageProps?.initialApolloState || {};
        
        for (const key of Object.keys(apolloState)) {
          const data = apolloState[key];
          
          // Nom du produit
          if ((key.startsWith("Product:") || key.startsWith("SingleVariantProduct:")) && data.name && !instructions.name) {
            instructions.name = data.name;
          }
          
          // Manuels
          if (key.includes("BuildingInstruction") || (data && data.pdfLocation)) {
            if (data.pdfLocation && this.isValidManualUrl(data.pdfLocation)) {
              const exists = instructions.manuals.find(m => m.pdfUrl === data.pdfLocation);
              if (!exists) {
                instructions.manuals.push({
                  id: data.id || key,
                  description: data.description || data.name || null,
                  pdfUrl: data.pdfLocation,
                  sequence: data.sequence || data.sequenceNumber || null
                });
              }
            }
          }
        }
        
      } catch (parseErr) {
        logger.warn(`[LEGO] Erreur parsing __NEXT_DATA__ instructions: ${parseErr.message}`);
      }
    }

    // Fallback: chercher les PDFs dans le HTML
    if (instructions.manuals.length === 0) {
      instructions.manuals = this.extractPdfsFromHtml(html, productId);
    }

    // Extraire l'année depuis le HTML (présente sur la page des manuels)
    instructions.year = this.extractYearFromInstructionsHtml(html);

    // Trier les manuels par séquence
    instructions.manuals.sort((a, b) => {
      if (a.sequence === null && b.sequence === null) return 0;
      if (a.sequence === null) return 1;
      if (b.sequence === null) return -1;
      return a.sequence - b.sequence;
    });

    logger.info(`[LEGO] Trouvé ${instructions.manuals.length} manuels pour ${productId}`);
    
    return instructions;
  }

  /**
   * Extraire l'année depuis le HTML de la page des manuels
   * @private
   * @param {string} html - HTML de la page
   * @returns {number|null} Année ou null si non trouvée
   */
  extractYearFromInstructionsHtml(html) {
    // Pattern pour extraire l'année du HTML
    // Ex: <p class="ds-heading-lg _setId__productDetails__aQ9pA">Année : 2023</p>
    const yearPatterns = [
      /Année\s*:\s*(\d{4})/i,
      /Year\s*:\s*(\d{4})/i,
      /<p[^>]*>\s*Année\s*:\s*(\d{4})\s*<\/p>/i,
      /<p[^>]*>\s*Year\s*:\s*(\d{4})\s*<\/p>/i
    ];

    for (const pattern of yearPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const year = parseInt(match[1], 10);
        // Vérifier que l'année est plausible (entre 1949 et maintenant + 2 ans)
        const currentYear = new Date().getFullYear();
        if (year >= 1949 && year <= currentYear + 2) {
          logger.debug(`[LEGO] Année extraite: ${year}`);
          return year;
        }
      }
    }

    return null;
  }

  /**
   * Valider une URL de manuel PDF
   * @private
   */
  isValidManualUrl(url) {
    if (!url) return false;
    // Exclure les URLs génériques type "product.bi.xxx.pdf" sans fichier après
    if (/product\.bi\.[^\/]+\.pdf\/?$/i.test(url)) return false;
    // Doit se terminer par .pdf avec un vrai nom de fichier
    return /\/[^\/]+\.pdf$/i.test(url);
  }

  /**
   * Extraire les PDFs depuis le HTML brut
   * @private
   */
  extractPdfsFromHtml(html, productId) {
    const manuals = [];
    const seenPdfs = new Set();
    
    const pdfPatterns = [
      /href="(https?:\/\/[^"]+\.pdf)"/gi,
      /"pdfUrl"\s*:\s*"([^"]+\.pdf)"/gi,
      /"pdfLocation"\s*:\s*"([^"]+\.pdf)"/gi,
      /(https?:\/\/[^"\s]+\.pdf)/gi
    ];
    
    // Patterns à exclure (documents légaux, rapports, etc.)
    const excludePatterns = [
      /slavery/i, /transparency/i, /statement/i, /policy/i,
      /report/i, /annual/i, /legal/i, /terms/i, /privacy/i
    ];
    
    for (const pattern of pdfPatterns) {
      for (const match of html.matchAll(pattern)) {
        let pdfUrl = match[1]
          .replace(/\\u002F/g, '/')
          .replace(/\\/g, '');
        
        if (pdfUrl.startsWith('//')) {
          pdfUrl = 'https:' + pdfUrl;
        }
        
        if (seenPdfs.has(pdfUrl)) continue;
        seenPdfs.add(pdfUrl);
        
        // Extraire le nom du fichier
        const fileNameMatch = pdfUrl.match(/\/([^\/]+)\.pdf$/i);
        const fileName = fileNameMatch ? fileNameMatch[1] : null;
        
        // Vérifier exclusions
        const isExcluded = excludePatterns.some(p => p.test(fileName || pdfUrl));
        if (isExcluded) continue;
        
        // Valider l'URL
        if (!this.isValidManualUrl(pdfUrl)) continue;
        
        // Extraire le numéro de séquence si présent
        let sequence = null;
        const seqMatch = fileName?.match(/_(?:BK)?(\d+)(?:_|$)/i);
        if (seqMatch) {
          sequence = parseInt(seqMatch[1], 10);
        }
        
        manuals.push({
          id: fileName || String(manuals.length + 1),
          description: fileName ? `Manuel ${fileName}` : null,
          pdfUrl: pdfUrl,
          sequence: sequence
        });
      }
    }
    
    return manuals;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTHODES DE RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche via scraping de page
   * @private
   */
  async searchViaScraping(query, locale) {
    await this.ensureValidSession(locale);

    const searchUrl = `${LEGO_BASE_URL}/${locale.toLowerCase()}/search?q=${encodeURIComponent(query)}`;
    
    const response = await this.fsrRequest('request.get', searchUrl, {
      waitInSeconds: 2
    });

    const html = response.response || '';
    logger.debug(`[LEGO] Page recherche reçue: ${html.length} caractères`);

    // Extraire les produits
    let products = this.extractProductsFromNextData(html);
    
    if (products.length === 0) {
      products = this.extractProductsFromHTML(html);
    }

    // Filtrer les produits valides
    const validProducts = this.normalizer.filterValidProducts(products);

    return {
      products: validProducts,
      total: validProducts.length,
      count: validProducts.length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION DE DONNÉES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire les produits depuis __NEXT_DATA__
   * @private
   */
  extractProductsFromNextData(html) {
    const products = [];
    
    const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) return products;

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__ 
                       || nextData?.props?.pageProps?.initialApolloState 
                       || {};

      // Trouver les clés de produits
      const productKeys = Object.keys(apolloState).filter(k => 
        k.startsWith('SingleVariantProduct:') || 
        k.startsWith('Product:') ||
        k.startsWith('MultiVariantProduct:')
      );

      for (const key of productKeys) {
        const product = apolloState[key];
        if (!product?.name) continue;

        // Résoudre les références (__ref)
        let variantData = product.variant;
        if (variantData?.__ref) {
          variantData = apolloState[variantData.__ref];
        }

        let priceData = variantData?.price;
        if (priceData?.__ref) {
          priceData = apolloState[priceData.__ref];
        }

        products.push({
          id: product.id,
          productCode: product.productCode,
          name: product.name,
          slug: product.slug,
          primaryImage: product.primaryImage,
          baseImgUrl: product.baseImgUrl,
          variant: variantData ? {
            id: variantData.id,
            sku: variantData.sku,
            price: priceData,
            attributes: variantData.attributes
          } : null
        });
      }

      logger.debug(`[LEGO] Extrait ${products.length} produits depuis __NEXT_DATA__`);
    } catch (error) {
      logger.warn(`[LEGO] Erreur parsing __NEXT_DATA__: ${error.message}`);
    }

    return products;
  }

  /**
   * Extraire les produits depuis le HTML (fallback)
   * @private
   */
  extractProductsFromHTML(html) {
    const products = [];
    const seenIds = new Set();

    // Pattern pour les liens produits
    const productLinkPattern = /href="\/[a-z]{2}-[a-z]{2}\/product\/([^"]+)"/gi;
    
    // Extraire les images par ID produit
    const productImages = this.extractProductImages(html);
    
    // Extraire les noms par slug
    const productNames = this.extractProductNames(html);

    for (const match of html.matchAll(productLinkPattern)) {
      const slug = match[1];
      
      // Filtrer les slugs invalides
      if (slug.includes('?') || slug.includes('icmp') || slug.includes('tbd')) {
        continue;
      }

      // Extraire l'ID numérique
      const idMatch = slug.match(/(\d{4,6})/);
      if (!idMatch) continue;
      
      const productCode = idMatch[1];
      
      // Éviter les doublons
      if (seenIds.has(productCode)) continue;
      seenIds.add(productCode);

      // Valider l'ID
      if (!this.normalizer.isValidProductId(productCode)) continue;

      products.push({
        id: productCode,
        productCode,
        name: productNames.get(slug) || this.slugToName(slug),
        slug,
        primaryImage: productImages.get(productCode),
        baseImgUrl: productImages.get(productCode),
        variant: null
      });
    }

    logger.debug(`[LEGO] Extrait ${products.length} produits depuis HTML`);
    return products;
  }

  /**
   * Extraire les images des produits depuis le HTML
   * @private
   */
  extractProductImages(html) {
    const images = new Map();
    
    // Patterns pour les URLs d'images LEGO
    const imgPatterns = [
      // Images officielles LEGO
      /src="(https:\/\/[^"]*(?:lego\.com|cloudfront)[^"]*\/(?:products|set\/assets|images\/products)[^"]*\.(jpg|png|webp)[^"]*)"/gi,
      // Lazy loading
      /data-src="(https:\/\/[^"]*lego[^"]*\.(jpg|png|webp)[^"]*)"/gi,
      // Images cdn
      /src="(https:\/\/www\.lego\.com\/cdn\/[^"]+)"/gi
    ];

    for (const pattern of imgPatterns) {
      for (const match of html.matchAll(pattern)) {
        const url = match[1].replace(/&amp;/g, '&');
        
        // Extraire l'ID produit de l'URL (4-6 chiffres)
        const idMatch = url.match(/\/(\d{4,6})(?:\/|_|\.|$|-)/);
        if (idMatch && !images.has(idMatch[1])) {
          images.set(idMatch[1], url);
        }
      }
    }

    // Aussi chercher dans les srcset
    const srcsetPattern = /srcset="([^"]+)"/gi;
    for (const match of html.matchAll(srcsetPattern)) {
      const srcset = match[1];
      // Prendre la première URL du srcset
      const urlMatch = srcset.match(/(https:\/\/[^\s,]+)/);
      if (urlMatch) {
        const url = urlMatch[1].replace(/&amp;/g, '&');
        const idMatch = url.match(/\/(\d{4,6})(?:\/|_|\.|$|-)/);
        if (idMatch && !images.has(idMatch[1])) {
          images.set(idMatch[1], url);
        }
      }
    }

    return images;
  }

  /**
   * Extraire les noms des produits depuis le HTML
   * @private
   */
  extractProductNames(html) {
    const names = new Map();
    
    // Pattern aria-label avant ou après href
    const patterns = [
      /aria-label="([^"]+)"[^>]*href="\/[a-z]{2}-[a-z]{2}\/product\/([^"]+)"/gi,
      /href="\/[a-z]{2}-[a-z]{2}\/product\/([^"]+)"[^>]*aria-label="([^"]+)"/gi
    ];

    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        const name = pattern.source.startsWith('aria') ? match[1] : match[2];
        const slug = pattern.source.startsWith('aria') ? match[2] : match[1];
        
        if (name && slug && !names.has(slug)) {
          names.set(slug, name.trim());
        }
      }
    }

    return names;
  }

  /**
   * Convertir un slug en nom lisible
   * @private
   */
  slugToName(slug) {
    return slug
      .replace(/-\d+$/, '')  // Enlever l'ID à la fin
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())  // Capitalize
      .trim();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCRAPING PAGE PRODUIT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Scraper la page d'un produit
   * @private
   */
  async scrapeProductPage(productId, locale) {
    await this.ensureValidSession(locale);

    const productUrl = `${LEGO_BASE_URL}/${locale.toLowerCase()}/product/${productId}`;
    
    const response = await this.fsrRequest('request.get', productUrl, {
      waitInSeconds: 2
    });

    const html = response.response || '';
    
    // Vérifier que c'est bien une page produit
    if (html.includes("Cette page n'existe pas") || html.length < 50000) {
      return null;
    }

    const product = {
      id: productId,
      productCode: productId,
      name: null,
      description: null,
      images: [],
      videos: [],
      ageRange: null,
      pieceCount: null,
      minifiguresCount: null,
      rating: null,
      reviewCount: null,
      availability: null,
      availabilityText: null,
      url: productUrl
    };

    // Extraire depuis JSON-LD
    this.extractFromJsonLD(html, product);
    
    // Extraire depuis __NEXT_DATA__
    this.extractFromNextData(html, product);
    
    // Extraire depuis HTML (data-test attributes)
    this.extractFromDataTestAttributes(html, product);
    
    // Fallback: titre de la page
    if (!product.name) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        const parts = titleMatch[1].split(/\s*[|·]\s*/);
        if (parts[0] && !parts[0].includes('LEGO.com')) {
          product.name = parts[0].trim();
        }
      }
    }

    // Extraire les images et vidéos
    product.images = this.extractProductImagesFromDetail(html, productId);
    product.videos = this.extractProductVideosFromDetail(html, productId);

    return product;
  }

  /**
   * Extraire les données depuis JSON-LD
   * @private
   */
  extractFromJsonLD(html, product) {
    const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    
    for (const match of jsonLdMatches) {
      try {
        const data = JSON.parse(match[1]);
        const items = Array.isArray(data) ? data : [data];
        
        for (const item of items) {
          if (item['@type'] === 'Product') {
            if (item.name && !product.name) {
              product.name = item.name.trim();
            }
            if (item.description && !product.description) {
              product.description = item.description;
            }
            break;
          }
        }
      } catch (e) {
        // Ignorer les erreurs de parsing
      }
    }
  }

  /**
   * Extraire les données depuis __NEXT_DATA__
   * @private
   */
  extractFromNextData(html, product) {
    const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return;

    try {
      const data = JSON.parse(match[1]);
      const apolloState = data?.props?.pageProps?.__APOLLO_STATE__ || {};
      
      // Trouver le produit dans Apollo State
      for (const [key, value] of Object.entries(apolloState)) {
        if ((key.startsWith('SingleVariantProduct:') || key.startsWith('Product:')) && value.name) {
          if (!product.name) product.name = value.name;
          if (!product.description) product.description = value.description;
          
          // Extraire les attributs de la variante
          let variant = value.variant;
          if (variant?.__ref) {
            variant = apolloState[variant.__ref];
          }
          
          if (variant?.attributes) {
            const attrs = variant.attributes;
            if (!product.ageRange) product.ageRange = attrs.ageRange;
            if (!product.pieceCount) product.pieceCount = attrs.pieceCount;
            if (!product.availability) product.availability = attrs.availabilityStatus;
            if (!product.availabilityText) product.availabilityText = attrs.availabilityText;
          }
          
          break;
        }
      }
    } catch (e) {
      logger.debug(`[LEGO] Erreur extraction __NEXT_DATA__: ${e.message}`);
    }
  }

  /**
   * Extraire les données depuis les attributs data-test
   * @private
   */
  extractFromDataTestAttributes(html, product) {
    // Patterns originaux avec data-test
    const dataTestPatterns = {
      name: /data-test="product-overview-name"[^>]*>([^<]+)</i,
      ageRange: /data-test="product-details-ages"[^>]*>([^<]+)</i,
      pieceCount: /data-test="product-details-pieces"[^>]*>([^<]+)</i,
      minifiguresCount: /data-test="product-details-minifigures"[^>]*>([^<]+)</i,
      availability: /data-test="product-overview-availability"[^>]*>([^<]+)</i,
    };

    // Patterns alternatifs basés sur le contenu HTML typique de LEGO
    const fallbackPatterns = {
      // Patterns pour les specs dans les divs
      pieceCount: [
        /Pièces[^<]*<[^>]+>(\d+)/i,
        /Pieces[^<]*<[^>]+>(\d+)/i,
        /"pieceCount"\s*:\s*(\d+)/i,
        /(\d{2,5})\s*(?:pièces|pieces|Pieces|Pièces)/i,
      ],
      ageRange: [
        /Âges?[^<]*<[^>]+>([^<]+)</i,
        /Ages?[^<]*<[^>]+>([^<]+)</i,
        /"ageRange"\s*:\s*"([^"]+)"/i,
        /(\d+\+|\d+-\d+)\s*(?:ans|years)/i,
      ],
      minifiguresCount: [
        /Minifigurines?[^<]*<[^>]+>(\d+)/i,
        /Minifigs?[^<]*<[^>]+>(\d+)/i,
        /"minifigureCount"\s*:\s*(\d+)/i,
        /(\d+)\s*minifig/i,
      ],
      theme: [
        // Lien thème dans ProductOverview
        /class="ProductOverview_themeLink[^"]*"[^>]*>([^<]+)</i,
        /href="\/[a-z]{2}-[a-z]{2}\/themes\/[^"]+">([^<]+)</i,
        // data-test
        /data-test="product-details-theme"[^>]*>([^<]+)</i,
        // Breadcrumb
        /"primaryBrand"\s*:\s*"([^"]+)"/i,
      ],
      price: [
        /"centAmount"\s*:\s*(\d+)/i,
        /"formattedAmount"\s*:\s*"([^"]+)"/i,
        /(\d+[,\.]\d{2})\s*€/,
      ],
    };

    // D'abord essayer les patterns data-test
    for (const [key, pattern] of Object.entries(dataTestPatterns)) {
      if (product[key]) continue;
      
      const match = html.match(pattern);
      if (match) {
        let value = match[1].trim().replace(/<[^>]+>/g, '');
        if (['pieceCount', 'minifiguresCount'].includes(key)) {
          value = parseInt(value.replace(/\D/g, ''), 10) || null;
        }
        product[key] = value;
        logger.debug(`[LEGO] Extrait ${key} via data-test: ${value}`);
      }
    }

    // Ensuite essayer les patterns de fallback
    // Valeurs invalides à ignorer pour certains champs
    const invalidValues = {
      theme: ['dark', 'light', 'auto', 'system', 'default'],
    };

    for (const [key, patterns] of Object.entries(fallbackPatterns)) {
      if (product[key]) continue;
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          let value = match[1].trim();
          
          // Ignorer les valeurs invalides
          if (invalidValues[key]?.includes(value.toLowerCase())) {
            continue;
          }
          
          // Convertir en nombre si approprié
          if (['pieceCount', 'minifiguresCount'].includes(key)) {
            value = parseInt(value.replace(/\D/g, ''), 10) || null;
          } else if (key === 'price' && /^\d+$/.test(value)) {
            // centAmount -> euros
            value = (parseInt(value, 10) / 100).toFixed(2) + ' €';
          }
          
          if (value) {
            product[key] = value;
            logger.debug(`[LEGO] Extrait ${key} via fallback: ${value}`);
            break;
          }
        }
      }
    }
  }

  /**
   * Extraire les images depuis la page de détail
   * @private
   */
  extractProductImagesFromDetail(html, productId) {
    const images = [];
    const seen = new Set();
    
    // Pattern pour les images produit dans /set/assets/ avec l'ID produit
    const pattern = /src="(https:\/\/www\.lego\.com\/cdn\/cs\/set\/assets\/[^"]+)"/gi;

    for (const match of html.matchAll(pattern)) {
      let url = match[1].replace(/&amp;/g, '&');
      
      // Vérifier que c'est une image du produit (contient l'ID)
      if (!url.includes(productId)) {
        continue;
      }
      
      // Extraire le nom du fichier pour vérifier l'extension
      const fileMatch = url.match(/\/([^/?]+)\?/);
      if (!fileMatch) continue;
      
      const filename = fileMatch[1].toLowerCase();
      
      // Ignorer les vidéos et thumbnails vidéo
      if (filename.includes('.mp4') || filename.includes('_v1') || filename.includes('_v2') || filename.includes('thumbnail')) {
        continue;
      }
      
      // Ne garder que les images (jpg, png, webp)
      if (!filename.match(/\.(jpg|jpeg|png|webp)$/i)) {
        continue;
      }
      
      // Extraire le nom de base de l'asset pour dédupliquer
      const assetMatch = url.match(/\/assets\/([^?]+)/);
      if (!assetMatch) continue;
      
      const assetKey = assetMatch[1];
      
      if (!seen.has(assetKey)) {
        seen.add(assetKey);
        images.push(url);
      }
    }

    return images;
  }

  /**
   * Extraire les vidéos depuis la page de détail
   * @private
   */
  extractProductVideosFromDetail(html, productId) {
    const videos = [];
    const seen = new Set();
    
    // Patterns pour les vidéos (peuvent être dans src, data-src, href, ou en JSON)
    const patterns = [
      /src="(https:\/\/www\.lego\.com\/cdn\/cs\/set\/assets\/[^"]+\.mp4[^"]*)"/gi,
      /"(https:\/\/www\.lego\.com\/cdn\/cs\/set\/assets\/[^"]+\.mp4[^"]*)"/gi,
      /(https:\/\/www\.lego\.com\/cdn\/cs\/set\/assets\/[^\s"'\\]+\.mp4)/gi,
      // Pattern pour les URLs échappées en JSON
      /(https:\\u002F\\u002Fwww\.lego\.com\\u002Fcdn\\u002Fcs\\u002Fset\\u002Fassets\\u002F[^"]+\.mp4)/gi,
    ];
    
    // Patterns à EXCLURE :
    // - Feature clips (micro-vidéos de fonctionnalités : Cockpit, Engine, Ramp, etc.)
    // - Variantes de taille (Small, Medium, Large)
    // - Hero videos (versions marketing alternatives)
    const excludePatterns = [
      /-Feature-/i,           // Micro-clips de fonctionnalités
      /-Hero-/i,              // Vidéos Hero (alternatives marketing)
      /-Small\.mp4$/i,        // Variante petite taille
      /-Medium\.mp4$/i,       // Variante moyenne taille
      /-Large\.mp4$/i,        // Variante grande taille
    ];

    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        let url = match[1]
          .replace(/&amp;/g, '&')
          .replace(/\\u002F/g, '/')
          .replace(/\\/g, '');
        
        // Vérifier que c'est une vidéo du produit (contient l'ID)
        if (!url.includes(productId)) {
          continue;
        }
        
        // Enlever le timestamp (#t=0.01) et les paramètres pour déduplication
        const cleanUrl = url.split('#')[0].split('?')[0];
        
        // Extraire le nom du fichier
        const fileMatch = cleanUrl.match(/\/([^/]+\.mp4)$/i);
        if (!fileMatch) continue;
        
        const filename = fileMatch[1];
        
        // Exclure les Feature clips et variantes de taille
        if (excludePatterns.some(p => p.test(filename))) {
          continue;
        }
        
        if (!seen.has(filename)) {
          seen.add(filename);
          videos.push(cleanUrl);
          logger.debug(`[LEGO] Vidéo trouvée: ${filename}`);
        }
      }
    }

    // Si pas de vidéos trouvées dans le HTML, chercher dans __NEXT_DATA__
    if (videos.length === 0) {
      const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        const mp4Matches = nextDataMatch[1].match(/[^"]*75192[^"]*\.mp4/gi) || [];
        for (const mp4 of mp4Matches) {
          const url = mp4.replace(/\\u002F/g, '/').replace(/\\/g, '');
          if (url.includes('lego.com') && !seen.has(url)) {
            const fileMatch = url.match(/\/([^/]+\.mp4)$/i);
            if (fileMatch && !seen.has(fileMatch[1])) {
              seen.add(fileMatch[1]);
              const fullUrl = url.startsWith('http') ? url : `https://www.lego.com${url}`;
              videos.push(fullUrl.split('#')[0].split('?')[0]);
              logger.debug(`[LEGO] Vidéo trouvée (NEXT_DATA): ${fileMatch[1]}`);
            }
          }
        }
      }
    }

    return videos;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLARESOLVERR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Effectuer une requête via FlareSolverr
   * @private
   */
  async fsrRequest(cmd, url, options = {}) {
    const body = {
      cmd,
      url,
      maxTimeout: this.timeout,
      ...options
    };

    // Ajouter la session si disponible
    if (this._session.id) {
      body.session = this._session.id;
    }

    let response;
    try {
      response = await fetch(this.fsrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (fetchError) {
      // Erreur réseau - détruire la session pour recommencer proprement
      await this.destroySession();
      throw new BadGatewayError(`FlareSolverr unreachable: ${fetchError.message}`);
    }

    if (!response.ok) {
      await this.destroySession();
      throw new BadGatewayError(`FlareSolverr error: ${response.status}`);
    }

    const json = await response.json();
    
    if (json.status !== 'ok') {
      // Session peut être corrompue - la détruire
      await this.destroySession();
      throw new BadGatewayError(`FlareSolverr failed: ${json.message || 'Unknown error'}`);
    }

    // Mettre à jour les cookies
    if (json.solution?.cookies) {
      this._session.cookies = json.solution.cookies;
    }

    return json.solution || {};
  }

  /**
   * S'assurer qu'on a une session valide
   * @private
   */
  async ensureValidSession(locale) {
    const now = Date.now();
    
    // Si session récente, ne rien faire
    if (this._session.lastVisit && (now - this._session.lastVisit) < SESSION_TTL) {
      return;
    }

    logger.debug('[LEGO] Rafraîchissement de la session...');

    // Créer une session si nécessaire
    if (!this._session.id) {
      try {
        const response = await fetch(this.fsrUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'sessions.create' })
        });
        const json = await response.json();
        if (json.session) {
          this._session.id = json.session;
          logger.debug(`[LEGO] Session créée: ${json.session}`);
        }
      } catch (e) {
        logger.warn(`[LEGO] Impossible de créer une session: ${e.message}`);
      }
    }

    // Visiter la page d'accueil pour obtenir les cookies
    try {
      await this.fsrRequest('request.get', `${LEGO_BASE_URL}/${locale.toLowerCase()}/`);
      this._session.lastVisit = now;
    } catch (e) {
      logger.warn(`[LEGO] Erreur visite page accueil: ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMATAGE DES RÉPONSES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Formater la réponse de recherche
   * @private
   */
  formatSearchResponse(result, query, page, pageSize) {
    return this.normalizer.normalizeSearchResponse(result.products, {
      query,
      total: result.total,
      pagination: {
        page,
        limit: pageSize,
        hasMore: page * pageSize < result.total
      },
      lang: 'fr'
    });
  }

  /**
   * Health check
   * @override
   */
  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Test simple: vérifier que FlareSolverr répond
      const response = await fetch(this.fsrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'sessions.list' })
      });
      
      const json = await response.json();
      
      return {
        healthy: json.status === 'ok',
        latency: Date.now() - startTime,
        message: json.status === 'ok' ? 'FlareSolverr disponible' : 'FlareSolverr indisponible'
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message: `FlareSolverr error: ${error.message}`
      };
    }
  }
}

export default LegoProvider;
