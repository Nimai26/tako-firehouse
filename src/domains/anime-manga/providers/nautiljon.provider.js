/**
 * Nautiljon Provider
 * 
 * Provider pour la base de données manga francophone Nautiljon.
 * Scraping HTML pour les données manga par volume (pas d'API).
 * 
 * @see https://www.nautiljon.com
 * 
 * FEATURES:
 * - Recherche de mangas
 * - Détails d'une série (liste de volumes, synopsis, infos)
 * - Détails d'un volume (ISBN, pages, prix, chapitres, couvertures)
 * 
 * DONNÉES VOLUME DISPONIBLES:
 * - EAN/ISBN, nombre de pages, prix FR/JP
 * - Dates de sortie FR et VO
 * - Éditeurs FR et VO
 * - Synopsis français
 * - Liste des chapitres
 * - Couvertures FR et JP
 * - Éditions multiples (standard, collector, coffret, etc.)
 * 
 * NOTE: Site francophone, données en français
 * RATE LIMIT : 1 req/seconde (respectueux du site)
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { NautiljonNormalizer } from '../normalizers/nautiljon.normalizer.js';
import { NotFoundError, BadGatewayError } from '../../../shared/errors/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

// Configuration
const NAUTILJON_BASE_URL = 'https://www.nautiljon.com';
const SEARCH_URL = `${NAUTILJON_BASE_URL}/mangas/`;
const USER_AGENT = 'Mozilla/5.0 (compatible; Tako-API/1.0; +https://github.com/tako-api)';
const RATE_LIMIT_DELAY = 1000; // 1 seconde entre les requêtes
const REQUEST_TIMEOUT = 15000;

export class NautiljonProvider extends BaseProvider {
  constructor() {
    super({
      name: 'nautiljon',
      domain: 'anime-manga',
      baseUrl: NAUTILJON_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      retries: 2,
      retryDelay: 2000
    });

    this.normalizer = new NautiljonNormalizer();
    this.log = createLogger('NautiljonProvider');
    this.lastRequestTime = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rate limiting — respecter 1 req/s
   */
  async respectRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch HTML d'une page Nautiljon
   */
  async fetchPage(url) {
    await this.respectRateLimit();
    this.log.debug(`Fetch: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError(`Page non trouvée: ${url}`);
      }
      throw new BadGatewayError(`Nautiljon HTTP ${response.status}`);
    }

    return await response.text();
  }

  /**
   * Décode les entités HTML
   */
  decodeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
      .trim();
  }

  /**
   * Nettoie les tags HTML
   */
  stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche de mangas sur Nautiljon
   * @param {string} query - Terme de recherche
   * @param {Object} options
   * @param {number} [options.maxResults=20] - Nombre max de résultats
   * @returns {Promise<Object>} Résultats normalisés
   */
  async search(query, options = {}) {
    const { maxResults = 20 } = options;

    if (!query || typeof query !== 'string') {
      throw new Error('Query requise pour la recherche');
    }

    const searchUrl = `${SEARCH_URL}?q=${encodeURIComponent(query.trim())}`;
    const html = await this.fetchPage(searchUrl);
    const results = this.parseSearchResults(html, query);

    return this.normalizer.normalizeSearchResponse(results.slice(0, maxResults), {
      query: query.trim(),
      total: results.length
    });
  }

  /**
   * Parse les résultats de recherche HTML
   */
  parseSearchResults(html, query) {
    const results = [];

    // Pattern principal : éléments de résultat avec lien, image et titre
    // Structure: <div class="elt">...<a href="/mangas/SLUG.html">...<img src="...">...<span class="title">TITRE</span>...
    const eltPattern = /<div[^>]*class="[^"]*elt[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(\/mangas\/[^"]+\.html)"[^>]*>[\s\S]*?(?:<img[^>]*src="([^"]*)"[^>]*>)?[\s\S]*?<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<\/div>/gi;

    let match;
    while ((match = eltPattern.exec(html)) !== null) {
      const url = match[1];
      const image = match[2] || null;
      const title = this.decodeHtml(match[3]);

      // Ignorer les volumes individuels dans la recherche (on veut les séries)
      if (url.includes('/volume-')) continue;

      const slug = url.replace('/mangas/', '').replace('.html', '');
      results.push({ title, slug, url: `${NAUTILJON_BASE_URL}${url}`, image });
    }

    // Fallback : pattern simplifié si le pattern principal ne match pas
    if (results.length === 0) {
      const simplePattern = /<a[^>]*href="(\/mangas\/([^"]+)\.html)"[^>]*>[^<]*<[^>]*>([^<]+)<\/[^>]*>/gi;
      while ((match = simplePattern.exec(html)) !== null) {
        const url = match[1];
        const slug = match[2];
        const title = this.decodeHtml(match[3]);

        if (url.includes('/volume-')) continue;
        if (title.length < 2) continue;
        if (/^(page|suivant|pr[ée]c[ée]dent|accueil)$/i.test(title)) continue;
        if (results.some(r => r.slug === slug)) continue;

        results.push({ title, slug, url: `${NAUTILJON_BASE_URL}${url}`, image: null });
      }
    }

    // Pattern encore plus large pour les résultats de liste
    if (results.length === 0) {
      const listPattern = /href="(\/mangas\/([^"/]+)\.html)"[^>]*>\s*([^<]{2,})\s*</gi;
      while ((match = listPattern.exec(html)) !== null) {
        const url = match[1];
        const slug = match[2];
        const title = this.decodeHtml(match[3]);

        if (url.includes('/volume-')) continue;
        if (/^(page|suivant|pr[ée]c[ée]dent|accueil|manga|mangas)$/i.test(title)) continue;
        if (results.some(r => r.slug === slug)) continue;

        results.push({ title, slug, url: `${NAUTILJON_BASE_URL}${url}`, image: null });
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une série manga
   * @param {string} slug - Slug Nautiljon (ex: "one+piece")
   * @returns {Promise<Object>} Détails normalisés
   */
  async getSeries(slug) {
    if (!slug) throw new NotFoundError('Slug requis');

    const url = `${NAUTILJON_BASE_URL}/mangas/${encodeURIComponent(slug)}.html`;
    const html = await this.fetchPage(url);
    const series = this.parseSeriesPage(html, slug);

    return this.normalizer.normalizeSeriesResponse(series);
  }

  /**
   * Parse la page série Nautiljon
   */
  parseSeriesPage(html, slug) {
    const series = {
      slug,
      url: `${NAUTILJON_BASE_URL}/mangas/${slug}.html`,
      title: null,
      titleOriginal: null,
      titleAlternative: null,
      synopsis: null,
      image: null,
      type: null,
      origin: null,
      status: null,
      startDate: null,
      endDate: null,
      volumes: null,
      volumesVF: null,
      genres: [],
      themes: [],
      authors: [],
      publishers: { fr: null, jp: null },
      editions: [],
      volumesList: []
    };

    // Titre principal — <span itemprop="name">One Piece</span> inside <h1 class="h1titre">
    const h1Match = html.match(/<h1[^>]*class="h1titre"[^>]*>[\s\S]*?<span\s+itemprop="name"[^>]*>([^<]+)<\/span>/i);
    if (h1Match) {
      series.title = this.decodeHtml(h1Match[1]);
    }

    // Titre original — <span class="bold">Titre original : </span> ワンピース
    const origMatch = html.match(/Titre original\s*:\s*<\/span>\s*([^<]+)/i);
    if (origMatch) {
      series.titleOriginal = this.decodeHtml(origMatch[1]);
    }

    // Synopsis — <meta name="description" content="...">
    const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    if (metaDescMatch) {
      series.synopsis = this.decodeHtml(metaDescMatch[1]);
    }
    // Fallback: itemprop description div
    if (!series.synopsis) {
      const descDiv = html.match(/<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
      if (descDiv) {
        series.synopsis = this.stripHtml(descDiv[1]);
      }
    }

    // Image principale — <img itemprop="image" src="...">
    const imgMatch = html.match(/<img[^>]*itemprop="image"[^>]*src="([^"]+)"/i)
      || html.match(/src="([^"]*)"[^>]*itemprop="image"/i);
    if (imgMatch) {
      series.image = imgMatch[1].startsWith('http') ? imgMatch[1] : `${NAUTILJON_BASE_URL}${imgMatch[1]}`;
    }

    // Type — <span class="bold">Type : </span> <a...>Shonen</a>
    const typeMatch = html.match(/Type\s*:\s*<\/span>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (typeMatch) {
      series.type = this.decodeHtml(typeMatch[1]);
    }

    // Origine — <span class="bold">Origine : </span> <img...> Japon
    const originMatch = html.match(/Origine\s*:\s*<\/span>[\s\S]*?<img[^>]*alt="([^"]+)"/i);
    if (originMatch) {
      series.origin = this.decodeHtml(originMatch[1]);
    }

    // Date de publication — itemprop="datePublished" content="1997-07"
    const dateMatch = html.match(/itemprop="datePublished"\s+content="([^"]+)"/i);
    if (dateMatch) {
      series.startDate = dateMatch[1];
    }

    // Nb volumes VO — <span class="bold">Nb volumes VO : </span> 114 (En cours)
    const volVoMatch = html.match(/Nb\s*volumes?\s*VO\s*:\s*<\/span>\s*(\d+)\s*\(([^)]+)\)/i);
    if (volVoMatch) {
      series.volumes = parseInt(volVoMatch[1]);
      series.status = this.decodeHtml(volVoMatch[2]);
    }

    // Nb volumes VF
    const volVfMatch = html.match(/Nb\s*volumes?\s*VF\s*:\s*<\/span>\s*(\d+)/i);
    if (volVfMatch) {
      series.volumesVF = parseInt(volVfMatch[1]);
    }

    // Genres — <span class="bold">Genres : </span> <a...><span itemprop="genre">Action</span></a> - <a...
    const genreSection = html.match(/Genres?\s*:\s*<\/span>\s*([\s\S]*?)(?:<\/li>)/i);
    if (genreSection) {
      const genreMatches = genreSection[1].matchAll(/itemprop="genre"[^>]*>([^<]+)<\/span>/gi);
      for (const g of genreMatches) {
        const genre = this.decodeHtml(g[1]);
        if (genre.length > 1) series.genres.push(genre);
      }
      // Fallback: regular anchors in genre section
      if (series.genres.length === 0) {
        const anchorMatches = genreSection[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi);
        for (const g of anchorMatches) {
          const genre = this.decodeHtml(g[1]);
          if (genre.length > 1) series.genres.push(genre);
        }
      }
    }

    // Thèmes — <span class="bold">Thèmes : </span> <a...>Amitié</a> - <a...
    const themeSection = html.match(/Th[èe]mes?\s*:\s*<\/span>\s*([\s\S]*?)(?:<\/li>)/i);
    if (themeSection) {
      const themeMatches = themeSection[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi);
      for (const t of themeMatches) {
        const theme = this.decodeHtml(t[1]);
        if (theme.length > 1) series.themes.push(theme);
      }
    }

    // Auteur — <span class="bold">Auteur : </span> <span itemprop="author"...><a...><span itemprop="name">Oda Eiichirô</span></a>
    const authorSection = html.match(/Auteur\s*:\s*<\/span>\s*([\s\S]*?)(?:<\/li>)/i);
    if (authorSection) {
      const authorMatches = authorSection[1].matchAll(/itemprop="name"[^>]*>([^<]+)<\/span>/gi);
      for (const a of authorMatches) {
        const author = this.decodeHtml(a[1]);
        if (author.length > 1) series.authors.push(author);
      }
    }

    // Éditeur VF — itemprop="legalName">Glénat</span> after "Éditeur VF"
    const pubVfMatch = html.match(/[ÉE]diteur\s*VF\s*:\s*<\/span>[\s\S]*?itemprop="legalName"[^>]*>([^<]+)<\/span>/i);
    if (pubVfMatch) {
      series.publishers.fr = this.decodeHtml(pubVfMatch[1]);
    }

    // Éditeur VO — itemprop="legalName">Shueisha</span> after "Éditeur VO"
    const pubVoMatch = html.match(/[ÉE]diteur\s*VO\s*:\s*<\/span>[\s\S]*?itemprop="legalName"[^>]*>([^<]+)<\/span>/i);
    if (pubVoMatch) {
      series.publishers.jp = this.decodeHtml(pubVoMatch[1]);
    }

    // Liste des volumes
    series.volumesList = this.parseVolumesList(html, slug);

    return series;
  }

  /**
   * Parse la liste des volumes depuis la page série
   */
  parseVolumesList(html, slug) {
    const volumes = [];

    // Pattern: lien vers les volumes individuels
    // Ex: <a href="/mangas/one+piece/volume-1,98.html">Volume 1</a>
    // ou <a href="/mangas/one+piece/volume-1,98.html"><img src="...cover...">
    const volumePattern = /href="(\/mangas\/[^"]*\/volume-([^,]+),(\d+)\.html)"[^>]*>[\s\S]*?(?:<img[^>]*src="([^"]*)"[^>]*>)?\s*(?:<[^>]*>)*\s*([^<]*)/gi;

    let match;
    while ((match = volumePattern.exec(html)) !== null) {
      const url = match[1];
      const volumeName = this.decodeHtml(match[2].replace(/\+/g, ' '));
      const volumeId = match[3];
      const cover = match[4] || null;
      const label = this.decodeHtml(match[5] || '');

      // Dédupliquer
      if (volumes.some(v => v.id === volumeId)) continue;

      volumes.push({
        id: volumeId,
        number: volumeName,
        label: label || `Volume ${volumeName}`,
        url: `${NAUTILJON_BASE_URL}${url}`,
        cover: cover ? (cover.startsWith('http') ? cover : `${NAUTILJON_BASE_URL}${cover}`) : null
      });
    }

    // Trier par numéro de volume
    volumes.sort((a, b) => {
      const numA = parseFloat(a.number) || 0;
      const numB = parseFloat(b.number) || 0;
      return numA - numB;
    });

    return volumes;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS VOLUME
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un volume précis
   * @param {string} slug - Slug série (ex: "one+piece")
   * @param {string} volumeId - ID volume Nautiljon (ex: "98")
   * @param {string} volumeName - Nom/numéro du volume (ex: "1")
   * @returns {Promise<Object>} Détails normalisés
   */
  async getVolume(slug, volumeId, volumeName = '1') {
    if (!slug || !volumeId) throw new NotFoundError('Slug et volumeId requis');

    const url = `${NAUTILJON_BASE_URL}/mangas/${encodeURIComponent(slug)}/volume-${encodeURIComponent(volumeName)},${volumeId}.html`;
    const html = await this.fetchPage(url);
    const volume = this.parseVolumePage(html, slug, volumeId, volumeName);

    return this.normalizer.normalizeVolumeResponse(volume);
  }

  /**
   * Parse la page détail d'un volume
   */
  parseVolumePage(html, slug, volumeId, volumeName) {
    const volume = {
      id: volumeId,
      slug,
      number: volumeName,
      url: `${NAUTILJON_BASE_URL}/mangas/${slug}/volume-${volumeName},${volumeId}.html`,
      title: null,
      seriesTitle: null,
      synopsis: null,
      isbn: null,
      pages: null,
      price: { fr: null, jp: null },
      dates: { fr: null, jp: null },
      publishers: { fr: null, jp: null },
      covers: { fr: null, jp: null },
      chapters: [],
      edition: null
    };

    // Titre du volume — <h1 class="h1titre">...<span itemprop="name">One Piece Vol. 1</span></h1>
    const h1Match = html.match(/<h1[^>]*class="h1titre"[^>]*>[\s\S]*?<span\s+itemprop="name"[^>]*>([^<]+)<\/span>/i);
    if (h1Match) {
      volume.title = this.decodeHtml(h1Match[1]);
    }

    // Titre de la série (from breadcrumb or meta)
    const metaDesc = html.match(/<meta\s+name="description"\s+content="[^"]*:\s*([^,]+)/i);
    if (metaDesc) {
      // "Volume de manga : One Piece Vol. 1, Date..."
      const seriesFromMeta = this.decodeHtml(metaDesc[1]).replace(/\s*Vol\.\s*\d+.*/, '').trim();
      if (seriesFromMeta.length > 1) volume.seriesTitle = seriesFromMeta;
    }

    // Synopsis — meta description as fallback
    const synopsisMatch = html.match(/<meta\s+name="description"\s+content="[^"]*?\.\s*([^"]{20,})"/i);
    if (synopsisMatch) {
      volume.synopsis = this.decodeHtml(synopsisMatch[1]);
    }
    // Better: itemprop description
    const descDiv = html.match(/<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    if (descDiv) {
      const cleaned = this.stripHtml(descDiv[1]);
      if (cleaned.length > 10) volume.synopsis = cleaned;
    }

    // Code EAN / ISBN — <span itemprop="isbn">9782723433358</span>
    const isbnMatch = html.match(/itemprop="isbn"[^>]*>(\d[\d-]+)<\/span>/i);
    if (isbnMatch) {
      volume.isbn = isbnMatch[1].replace(/[\s-]/g, '');
    }

    // Nombre de pages — <span itemprop="numberOfPages">192</span>
    const pagesMatch = html.match(/itemprop="numberOfPages"[^>]*>(\d+)<\/span>/i);
    if (pagesMatch) {
      volume.pages = parseInt(pagesMatch[1]);
    }

    // Prix — <span class="bold">Prix : </span> 7.20 € / 432 ¥
    const priceMatch = html.match(/Prix\s*:\s*<\/span>\s*([\d,.]+)\s*€(?:\s*\/\s*([\d,.]+)\s*¥)?/i);
    if (priceMatch) {
      volume.price.fr = priceMatch[1].replace(',', '.');
      if (priceMatch[2]) volume.price.jp = priceMatch[2].replace(',', '.');
    }

    // Date de parution VF — <span class="bold">Date de parution VF : </span> 20/09/2000
    const dateFrMatch = html.match(/Date\s*de\s*parution\s*VF\s*:\s*<\/span>\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dateFrMatch) {
      volume.dates.fr = dateFrMatch[1];
    }

    // Date de parution VO — itemprop="datePublished" content="1997-12-24">24/12/1997
    const dateVoMatch = html.match(/Date\s*de\s*parution\s*VO[\s\S]*?itemprop="datePublished"[^>]*>(\d{2}\/\d{2}\/\d{4})<\/span>/i)
      || html.match(/Date\s*de\s*parution\s*VO\s*:\s*<\/span>\s*(?:<[^>]*>)*\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dateVoMatch) {
      volume.dates.jp = dateVoMatch[1];
    }

    // Éditeur VF — after "Éditeur VF", itemprop="legalName">Glénat</span>
    const pubVfMatch = html.match(/[ÉE]diteur\s*VF\s*:\s*<\/span>[\s\S]*?itemprop="legalName"[^>]*>([^<]+)<\/span>/i);
    if (pubVfMatch) {
      volume.publishers.fr = this.decodeHtml(pubVfMatch[1]);
    }

    // Éditeur VO
    const pubVoMatch = html.match(/[ÉE]diteur\s*VO\s*:\s*<\/span>[\s\S]*?itemprop="legalName"[^>]*>([^<]+)<\/span>/i);
    if (pubVoMatch) {
      volume.publishers.jp = this.decodeHtml(pubVoMatch[1]);
    }

    // Couverture VF — first <img itemprop="image" src="...">
    const coverMatch = html.match(/<img[^>]*itemprop="image"[^>]*src="([^"]+)"/i)
      || html.match(/src="([^"]*)"[^>]*itemprop="image"/i);
    if (coverMatch) {
      volume.covers.fr = coverMatch[1].startsWith('http') ? coverMatch[1] : `${NAUTILJON_BASE_URL}${coverMatch[1]}`;
    }

    // Couverture VO (look for couverture japonaise/VO image)
    const coverJpMatch = html.match(/couverture\s*(?:VO|japonais|originale)[\s\S]*?<img[^>]*src="([^"]+)"/i);
    if (coverJpMatch) {
      volume.covers.jp = coverJpMatch[1].startsWith('http') ? coverJpMatch[1] : `${NAUTILJON_BASE_URL}${coverJpMatch[1]}`;
    }

    // Liste des chapitres — within the page content
    const chaptersSection = html.match(/(?:Chapitre|Chapter)s?\s*(?:contenus?|inclus)?\s*:?\s*([\s\S]*?)(?:<\/(?:div|ul|table|p)>)/i);
    if (chaptersSection) {
      const chapterPattern = /(?:Ch(?:apitre|\.)\s*)?(\d+(?:\.\d+)?)\s*(?:[-:]\s*(.+?))?(?:<|$)/gi;
      let chMatch;
      while ((chMatch = chapterPattern.exec(chaptersSection[1])) !== null) {
        const chNum = chMatch[1];
        const chTitle = chMatch[2] ? this.stripHtml(chMatch[2]).trim() : null;
        if (chNum && !volume.chapters.some(c => c.number === chNum)) {
          volume.chapters.push({
            number: chNum,
            title: chTitle || null
          });
        }
      }
    }

    // Édition
    const editionMatch = html.match(/[ÉE]dition\s*:\s*<\/span>\s*([^<]+)/i);
    if (editionMatch) {
      volume.edition = this.decodeHtml(editionMatch[1]);
    }

    return volume;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTE VOLUMES D'UNE SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère la liste des volumes d'une série
   * @param {string} slug - Slug Nautiljon
   * @returns {Promise<Object>} Liste normalisée
   */
  async getVolumes(slug) {
    if (!slug) throw new NotFoundError('Slug requis');

    const url = `${NAUTILJON_BASE_URL}/mangas/${encodeURIComponent(slug)}.html`;
    const html = await this.fetchPage(url);
    const seriesData = this.parseSeriesPage(html, slug);

    return this.normalizer.normalizeVolumesListResponse(seriesData);
  }

  /**
   * Recherche un manga et retourne directement ses volumes
   * Combine search + getVolumes en un seul appel
   * @param {string} query - Terme de recherche
   * @param {Object} options - { volume, maxResults }
   * @returns {Promise<Object>} Liste de volumes normalisée
   */
  async searchVolumes(query, options = {}) {
    const { volume = null, maxResults = 50 } = options;

    if (!query || typeof query !== 'string') {
      throw new Error('Query requise pour la recherche');
    }

    // 1. Rechercher la série
    const searchUrl = `${SEARCH_URL}?q=${encodeURIComponent(query.trim())}`;
    const searchHtml = await this.fetchPage(searchUrl);
    const results = this.parseSearchResults(searchHtml, query);

    if (results.length === 0) {
      throw new NotFoundError(`Aucun manga trouvé pour "${query}"`);
    }

    // 2. Prendre le meilleur résultat
    const bestMatch = results[0];
    this.log.info(`searchVolumes: "${query}" → série "${bestMatch.title}" (${bestMatch.slug})`);

    // 3. Récupérer la page série pour avoir la liste des volumes
    await this.respectRateLimit();
    const seriesUrl = `${NAUTILJON_BASE_URL}/mangas/${encodeURIComponent(bestMatch.slug)}.html`;
    const seriesHtml = await this.fetchPage(seriesUrl);
    const seriesData = this.parseSeriesPage(seriesHtml, bestMatch.slug);

    // 4. Filtrer par numéro de volume si demandé
    if (volume !== null) {
      const volumeStr = String(volume).toLowerCase();
      seriesData.volumesList = seriesData.volumesList.filter(v => {
        const num = String(v.number).toLowerCase();
        return num === volumeStr || num.startsWith(volumeStr + ' ');
      });
    }

    // 5. Limiter les résultats
    seriesData.volumesList = seriesData.volumesList.slice(0, maxResults);

    return this.normalizer.normalizeVolumesSearchResponse(seriesData, {
      query: query.trim(),
      volumeFilter: volume
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  async healthCheck() {
    const start = Date.now();
    try {
      const response = await fetch(NAUTILJON_BASE_URL, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000)
      });
      return {
        healthy: response.ok,
        latency: Date.now() - start,
        message: response.ok ? 'Nautiljon accessible' : `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        message: error.message
      };
    }
  }
}
