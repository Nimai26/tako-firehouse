/**
 * Bedetheque Provider
 * 
 * Provider pour la base de données BD francophone Bedetheque.
 * Utilise une combinaison d'APIs AJAX et de scraping HTML via FlareSolverr.
 * 
 * @see https://www.bedetheque.com
 * 
 * FEATURES:
 * - Recherche de séries (API AJAX)
 * - Recherche d'auteurs (API AJAX)
 * - Recherche d'albums (FlareSolverr + HTML parsing)
 * - Albums d'une série (FlareSolverr + HTML parsing)
 * - Œuvres d'un auteur (FlareSolverr + HTML parsing)
 * - Détails des albums
 * 
 * APIs AJAX disponibles:
 * - /ajax/tout?term=xxx        - Recherche globale (séries S + auteurs A)
 * - /ajax/series?term=xxx      - Autocomplete séries
 * - /ajax/auteurs?term=xxx     - Autocomplete auteurs
 * - /ajax/serie_id?SERIE=xxx   - ID d'une série par nom
 * - /ajax/auteur_id?AUTEUR=xxx - ID d'un auteur par nom
 * - /ajax/resume/album/{id}    - Résumé d'un album
 * - /ajax/commentaire/serie/{id} - Commentaire d'une série
 * 
 * NOTE: Site principalement francophone
 * RATE LIMIT : Respecter 1 req/s pour ne pas surcharger le site
 */

import { BaseProvider } from '../../../core/providers/index.js';
import { BedethequeNormalizer } from '../normalizers/bedetheque.normalizer.js';
import { NotFoundError, BadGatewayError } from '../../../shared/errors/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

// Configuration
const BEDETHEQUE_BASE_URL = 'https://www.bedetheque.com';
const BDGEST_URL = 'https://www.bdgest.com';
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1';
const DEFAULT_MAX_RESULTS = 20;
const RATE_LIMIT_DELAY = 1000; // 1 seconde entre les requêtes

export class BedethequeProvider extends BaseProvider {
  constructor() {
    super({
      name: 'bedetheque',
      domain: 'comics',
      baseUrl: BEDETHEQUE_BASE_URL,
      timeout: 30000,
      retries: 2,
      retryDelay: 2000
    });

    this.normalizer = new BedethequeNormalizer();
    this.log = createLogger('BedethequeProvider');
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.lastRequestTime = 0;
    
    // Session FlareSolverr (cookies, CSRF)
    this.session = null;
    this.csrfToken = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rate limiting - attendre entre les requêtes
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
   * Requête AJAX simple (pour les APIs qui fonctionnent sans session)
   */
  async ajaxRequest(endpoint, params = {}) {
    await this.respectRateLimit();

    const url = new URL(endpoint, BEDETHEQUE_BASE_URL);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, value);
      }
    });

    this.log.debug(`AJAX Request: ${url.toString()}`);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': BEDETHEQUE_BASE_URL
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      
      // Essayer de parser en JSON (l'API peut retourner text/html comme content-type)
      try {
        return JSON.parse(text);
      } catch {
        // Si ce n'est pas du JSON, retourner le texte brut
        return text;
      }
    } catch (error) {
      this.log.error(`AJAX Error: ${error.message}`);
      throw new BadGatewayError(`Erreur Bedetheque AJAX: ${error.message}`);
    }
  }

  /**
   * Requête via FlareSolverr (pour les pages protégées)
   */
  async flaresolverrRequest(url, method = 'GET') {
    await this.respectRateLimit();

    this.log.debug(`FlareSolverr Request: ${url}`);

    try {
      const payload = {
        cmd: method === 'GET' ? 'request.get' : 'request.post',
        url: url,
        maxTimeout: 60000
      };

      // Utiliser la session si disponible
      if (this.session) {
        payload.session = this.session;
      }

      const response = await fetch(FLARESOLVERR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(65000)
      });

      if (!response.ok) {
        throw new Error(`FlareSolverr HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'ok') {
        throw new Error(data.message || 'FlareSolverr error');
      }

      // Mettre à jour la session
      if (data.session) {
        this.session = data.session;
      }

      // Extraire le token CSRF si présent
      const csrfMatch = data.solution?.response?.match(/csrf_cookie_bel["\s]*[:=]\s*["']([^"']+)["']/);
      if (csrfMatch) {
        this.csrfToken = csrfMatch[1];
      }

      return data.solution?.response || '';
    } catch (error) {
      this.log.error(`FlareSolverr Error: ${error.message}`);
      throw new BadGatewayError(`Erreur FlareSolverr: ${error.message}`);
    }
  }

  /**
   * Nettoie le HTML
   */
  cleanHtml(html) {
    if (!html) return null;
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Décode les entités Unicode JSON
   */
  decodeUnicode(str) {
    if (!str) return str;
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => 
      String.fromCharCode(parseInt(code, 16))
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  async healthCheck() {
    const start = Date.now();

    try {
      // Tester l'API AJAX simple
      const result = await this.ajaxRequest('/ajax/series', { term: 'test' });
      const latency = Date.now() - start;

      const isValid = Array.isArray(result) || typeof result === 'string';

      return {
        healthy: isValid,
        latency,
        message: isValid ? 'Bedetheque API accessible' : 'Réponse invalide'
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        message: error.message || 'Erreur de connexion'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENRICHISSEMENT DES COVERS (via FlareSolverr)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enrichit les résultats de recherche AJAX avec les images de couverture
   * en récupérant les pages détail via FlareSolverr (en parallèle)
   * @param {Array} results - Résultats bruts (avant normalisation)
   * @param {number} maxEnrich - Nombre max de résultats à enrichir
   */
  async enrichWithCovers(results, maxEnrich = 10) {
    if (!results.length) return results;

    const toEnrich = results.slice(0, maxEnrich);

    this.log.debug(`Enrichissement covers: ${toEnrich.length}/${results.length} résultats`);

    const promises = toEnrich.map(async (item) => {
      try {
        if (item.type === 'serie') {
          const url = `${BEDETHEQUE_BASE_URL}/serie/index/s/${item.id}`;
          const html = await this.flaresolverrRequest(url);
          const coverMatch = html.match(/<img[^>]*class="[^"]*couv[^"]*"[^>]*src="([^"]+)"/i) ||
                            html.match(/property="og:image"[^>]*content="([^"]+)"/i);
          if (coverMatch) item.coverUrl = coverMatch[1];
        } else if (item.type === 'author') {
          const url = `${BEDETHEQUE_BASE_URL}/auteur/index/a/${item.id}`;
          const html = await this.flaresolverrRequest(url);
          const photoMatch = html.match(/<img[^>]*class="[^"]*auteur-image[^"]*"[^>]*src="([^"]+)"/i);
          if (photoMatch) item.image = photoMatch[1];
        }
      } catch (err) {
        this.log.warn(`Enrichissement cover échoué pour ${item.type}/${item.id}: ${err.message}`);
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE VIA API AJAX
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche globale (séries + auteurs)
   * @param {string} query - Terme de recherche
   * @param {Object} options - Options
   */
  async search(query, options = {}) {
    const { maxResults = DEFAULT_MAX_RESULTS, searchType = 'all', enrichCovers = true } = options;

    try {
      this.log.debug(`Recherche Bedetheque: "${query}" (type: ${searchType})`);

      let results = [];

      if (searchType === 'all' || searchType === 'global') {
        // Recherche globale (séries + auteurs)
        const data = await this.ajaxRequest('/ajax/tout', { term: query });
        results = this.parseGlobalResults(data, maxResults);
        // Enrichir avec les covers via FlareSolverr
        if (enrichCovers) {
          await this.enrichWithCovers(results);
        }
      } else if (searchType === 'series') {
        results = await this.searchSeries(query, options);
        return results; // Déjà normalisé
      } else if (searchType === 'auteurs' || searchType === 'authors') {
        results = await this.searchAuthors(query, options);
        return results; // Déjà normalisé
      } else if (searchType === 'albums') {
        // Recherche d'albums via FlareSolverr
        return await this.searchAlbums(query, options);
      }

      return this.normalizer.normalizeSearchResponse(results, {
        query,
        searchType,
        total: results.length,
        pagination: {
          page: 1,
          limit: maxResults,
          hasMore: false
        }
      });
    } catch (error) {
      this.log.error(`Erreur recherche: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse les résultats de la recherche globale /ajax/tout
   */
  parseGlobalResults(data, maxResults) {
    if (!Array.isArray(data)) return [];

    return data.slice(0, maxResults).map(item => {
      const id = item.id || '';
      const isAuthor = id.startsWith('A');
      const isSerie = id.startsWith('S');
      const numericId = id.replace(/^[AS]/, '');

      return {
        id: numericId,
        type: isAuthor ? 'author' : 'serie',
        title: this.decodeUnicode(item.label || item.value || ''),
        category: item.category || (isAuthor ? 'Auteurs' : 'Séries'),
        flag: item.desc ? `${BDGEST_URL}/${item.desc}` : null,
        url: isAuthor 
          ? `${BEDETHEQUE_BASE_URL}/auteur/index/a/${numericId}`
          : `${BEDETHEQUE_BASE_URL}/serie/index/s/${numericId}`
      };
    });
  }

  /**
   * Recherche de séries
   */
  async searchSeries(query, options = {}) {
    const { maxResults = DEFAULT_MAX_RESULTS, enrichCovers = true } = options;

    const data = await this.ajaxRequest('/ajax/series', { term: query });

    if (!Array.isArray(data)) {
      return this.normalizer.normalizeSearchResponse([], { query, searchType: 'series' });
    }

    const results = data.slice(0, maxResults).map(item => ({
      id: item.id,
      type: 'serie',
      title: this.decodeUnicode(item.label || item.value || ''),
      flag: item.desc ? `${BDGEST_URL}/${item.desc}` : null,
      url: `${BEDETHEQUE_BASE_URL}/serie/index/s/${item.id}`
    }));

    // Enrichir avec les covers via FlareSolverr
    if (enrichCovers) {
      await this.enrichWithCovers(results);
    }

    return this.normalizer.normalizeSearchResponse(results, {
      query,
      searchType: 'series',
      total: results.length,
      pagination: {
        page: 1,
        limit: maxResults,
        hasMore: false
      }
    });
  }

  /**
   * Recherche d'auteurs
   */
  async searchAuthors(query, options = {}) {
    const { maxResults = DEFAULT_MAX_RESULTS, enrichCovers = true } = options;

    const data = await this.ajaxRequest('/ajax/auteurs', { term: query });

    if (!Array.isArray(data)) {
      return this.normalizer.normalizeSearchResponse([], { query, searchType: 'authors' });
    }

    const results = data.slice(0, maxResults).map(item => ({
      id: item.id,
      type: 'author',
      name: this.decodeUnicode(item.label || item.value || ''),
      url: `${BEDETHEQUE_BASE_URL}/auteur/index/a/${item.id}`
    }));

    // Enrichir avec les photos via FlareSolverr
    if (enrichCovers) {
      await this.enrichWithCovers(results);
    }

    return this.normalizer.normalizeSearchResponse(results, {
      query,
      searchType: 'authors',
      total: results.length,
      pagination: {
        page: 1,
        limit: maxResults,
        hasMore: false
      }
    });
  }

  /**
   * Obtenir l'ID d'une série par son nom
   */
  async getSerieId(serieName) {
    const result = await this.ajaxRequest('/ajax/serie_id', { SERIE: serieName });
    return result ? String(result).trim() : null;
  }

  /**
   * Obtenir l'ID d'un auteur par son nom
   */
  async getAuthorId(authorName) {
    const result = await this.ajaxRequest('/ajax/auteur_id', { AUTEUR: authorName });
    return result ? String(result).trim() : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECHERCHE D'ALBUMS (via FlareSolverr)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recherche d'albums par titre
   * Stratégie : chercher les séries correspondantes via AJAX, puis récupérer
   * les albums de chaque série via FlareSolverr (en parallèle).
   * La recherche avancée Bedetheque nécessite un token CSRF et ne fonctionne
   * pas en scraping direct.
   */
  async searchAlbums(query, options = {}) {
    const { maxResults = DEFAULT_MAX_RESULTS, maxSeries = 3 } = options;

    try {
      this.log.debug(`Recherche albums Bedetheque: "${query}"`);

      // Étape 1 : Chercher les séries correspondantes via AJAX (rapide, pas de FlareSolverr)
      const seriesData = await this.ajaxRequest('/ajax/series', { term: query });

      if (!Array.isArray(seriesData) || seriesData.length === 0) {
        return this.normalizer.normalizeSearchResponse([], {
          query,
          searchType: 'albums',
          total: 0
        });
      }

      // Étape 2 : Pour chaque série (max maxSeries), récupérer les albums via FlareSolverr
      const seriesToFetch = seriesData.slice(0, maxSeries);
      this.log.debug(`Récupération albums de ${seriesToFetch.length} séries`);

      const albumPromises = seriesToFetch.map(async (serie) => {
        try {
          const serieId = serie.id;
          const serieName = this.decodeUnicode(serie.label || serie.value || '');
          const url = `${BEDETHEQUE_BASE_URL}/serie/index/s/${serieId}`;
          const html = await this.flaresolverrRequest(url);
          const albums = this.parseSerieAlbums(html, maxResults);

          // Ajouter le nom de la série et le serieId à chaque album
          return albums.map(album => ({
            ...album,
            serie: serieName,
            serieId
          }));
        } catch (err) {
          this.log.warn(`Erreur récupération albums série ${serie.id}: ${err.message}`);
          return [];
        }
      });

      const albumArrays = await Promise.allSettled(albumPromises);

      // Combiner les albums de toutes les séries
      let allAlbums = [];
      for (const result of albumArrays) {
        if (result.status === 'fulfilled') {
          allAlbums.push(...result.value);
        }
      }

      // Filtrer par le terme de recherche si les albums viennent de plusieurs séries
      if (seriesToFetch.length > 1) {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

        // Garder les albums dont le titre ou la série match le query
        const filtered = allAlbums.filter(album => {
          const titleLower = (album.title || '').toLowerCase();
          const serieLower = (album.serie || '').toLowerCase();
          const combined = `${serieLower} ${titleLower}`;
          return queryWords.some(word => combined.includes(word));
        });

        // Utiliser les filtés si on en a trouvé, sinon garder tout
        if (filtered.length > 0) {
          allAlbums = filtered;
        }
      }

      // Limiter au maxResults
      allAlbums = allAlbums.slice(0, maxResults);

      return this.normalizer.normalizeSearchResponse(allAlbums, {
        query,
        searchType: 'albums',
        total: allAlbums.length,
        pagination: {
          page: 1,
          limit: maxResults,
          hasMore: false
        }
      });
    } catch (error) {
      this.log.error(`Erreur recherche albums: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse les résultats de recherche d'albums depuis le HTML
   */
  parseAlbumSearchResults(html, maxResults) {
    const albums = [];

    // Pattern pour les albums dans les résultats de recherche
    // Format: <li class="item-album">...<a href="BD-xxx-yyy-123456.html">...</a>...</li>
    const albumPattern = /<li[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;

    while ((match = albumPattern.exec(html)) !== null && albums.length < maxResults) {
      const itemHtml = match[1];
      const album = this.parseAlbumItem(itemHtml);
      if (album) {
        albums.push(album);
      }
    }

    // Fallback: chercher les liens BD-xxx directement
    if (albums.length === 0) {
      const linkPattern = /href="([^"]*BD-([^"]+)-(\d+)\.html)"[^>]*>([^<]*)</gi;
      while ((match = linkPattern.exec(html)) !== null && albums.length < maxResults) {
        const url = match[1].startsWith('http') ? match[1] : `${BEDETHEQUE_BASE_URL}/${match[1]}`;
        const slug = match[2];
        const id = match[3];
        const title = this.cleanHtml(match[4]);

        if (title && title.length > 2) {
          // Extraire série et tome du slug
          const slugParts = slug.split('-');
          const serie = slugParts[0] || null;
          const tomeMatch = slug.match(/Tome-(\d+)/i);
          const tome = tomeMatch ? tomeMatch[1] : null;

          albums.push({
            id,
            type: 'album',
            title: title,
            serie: serie ? this.decodeUnicode(serie.replace(/-/g, ' ')) : null,
            tome,
            url,
            coverUrl: null
          });
        }
      }
    }

    return albums;
  }

  /**
   * Parse un item d'album individuel
   */
  parseAlbumItem(html) {
    try {
      // Extraire le lien et l'ID
      const linkMatch = html.match(/href="([^"]*BD-[^"]*-(\d+)\.html)"/i);
      if (!linkMatch) return null;

      const url = linkMatch[1].startsWith('http') ? linkMatch[1] : `${BEDETHEQUE_BASE_URL}/${linkMatch[1]}`;
      const id = linkMatch[2];

      // Extraire le titre
      const titleMatch = html.match(/<a[^>]*class="[^"]*titre[^"]*"[^>]*>([^<]+)<\/a>/i) ||
                        html.match(/title="([^"]+)"/i) ||
                        html.match(/<span[^>]*>([^<]+)<\/span>/i);
      const title = titleMatch ? this.cleanHtml(titleMatch[1]) : 'Sans titre';

      // Extraire la série
      const serieMatch = html.match(/class="[^"]*serie[^"]*"[^>]*>([^<]+)</i) ||
                        html.match(/href="[^"]*serie-[^"]*">([^<]+)</i);
      const serie = serieMatch ? this.cleanHtml(serieMatch[1]) : null;

      // Extraire l'image de couverture
      const imgMatch = html.match(/<img[^>]*src="([^"]*Couv[^"]+)"/i) ||
                      html.match(/<img[^>]*src="([^"]+)"/i);
      const coverUrl = imgMatch ? imgMatch[1] : null;

      // Extraire le tome
      const tomeMatch = html.match(/Tome[:\s]*(\d+)/i) ||
                       title.match(/Tome[:\s]*(\d+)/i);
      const tome = tomeMatch ? tomeMatch[1] : null;

      return {
        id,
        type: 'album',
        title,
        serie,
        tome,
        url,
        coverUrl
      };
    } catch (err) {
      this.log.warn(`Erreur parsing album item: ${err.message}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALBUMS D'UNE SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère tous les albums d'une série
   * @param {string} serieId - ID de la série
   */
  async getSerieAlbums(serieId, options = {}) {
    const { maxResults = 100 } = options;

    try {
      this.log.debug(`Albums de la série: ${serieId}`);

      // Charger la page de la série via FlareSolverr
      const url = `${BEDETHEQUE_BASE_URL}/serie/index/s/${serieId}`;
      const html = await this.flaresolverrRequest(url);

      // Parser les informations de la série
      const serie = this.parseSerieInfo(html, serieId);

      // Parser les albums
      const albums = this.parseSerieAlbums(html, maxResults);

      return {
        success: true,
        provider: 'bedetheque',
        domain: 'comics',
        query: null,
        total: albums.length,
        count: albums.length,
        data: albums,
        pagination: null,
        meta: {
          fetchedAt: new Date().toISOString(),
          serieId,
          serieTitle: serie.title
        }
      };
    } catch (error) {
      this.log.error(`Erreur albums série: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse les informations d'une série depuis le HTML
   */
  parseSerieInfo(html, serieId) {
    const serie = {
      id: serieId,
      type: 'serie'
    };

    // Titre — extraire depuis <h1><a>...</a></h1> ou og:title
    const titleInLink = html.match(/<h1[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
    const titleDirect = html.match(/<h1[^>]*>([^<]+)</i);
    const ogTitle = html.match(/og:title"[^>]*content="([^"]+)"/i);
    if (titleInLink) {
      serie.title = this.cleanHtml(titleInLink[1]);
    } else if (titleDirect) {
      serie.title = this.cleanHtml(titleDirect[1]);
    } else if (ogTitle) {
      // og:title contient souvent des suffixes comme " - BD, informations, cotes"
      serie.title = ogTitle[1].replace(/\s*-\s*BD,.*$/, '').trim();
    } else {
      serie.title = null;
    }

    // Description
    const descMatch = html.match(/<div[^>]*id="p-serie"[^>]*>([\s\S]*?)<\/div>/i);
    serie.description = descMatch ? this.cleanHtml(descMatch[1]) : null;

    // Image de couverture
    const coverMatch = html.match(/<img[^>]*class="[^"]*couv[^"]*"[^>]*src="([^"]+)"/i) ||
                      html.match(/og:image"[^>]*content="([^"]+)"/i);
    serie.coverUrl = coverMatch ? coverMatch[1] : null;

    // Nombre de tomes
    const tomesMatch = html.match(/Tomes?\s*:\s*(\d+)/i);
    serie.numberOfAlbums = tomesMatch ? parseInt(tomesMatch[1]) : 0;

    // Origine/Pays
    const origineMatch = html.match(/Origine\s*:\s*<[^>]*>([^<]+)/i);
    serie.origin = origineMatch ? this.cleanHtml(origineMatch[1]) : null;

    return serie;
  }

  /**
   * Parse les albums d'une série depuis le HTML
   */
  parseSerieAlbums(html, maxResults) {
    const albums = [];

    // Pattern pour les liens BD : BD-{slug complet}-{id}.html
    // Ex: BD-Wonder-Woman-Deesse-de-la-guerre-Tome-1-Insurrection-269516.html
    // On capture le slug complet et l'ID numérique final
    const albumPattern = /href="([^"]*BD-(.+?)-(\d+)\.html)"/gi;
    
    let match;
    const seen = new Set();

    while ((match = albumPattern.exec(html)) !== null && albums.length < maxResults) {
      const fullUrl = match[1];
      const url = fullUrl.startsWith('http') ? fullUrl : `${BEDETHEQUE_BASE_URL}/${fullUrl}`;
      const slug = match[2];
      const id = match[3];

      // Éviter les doublons
      if (seen.has(id)) continue;
      seen.add(id);

      // Extraire le tome depuis le slug
      const tomeMatch = slug.match(/Tome-(\d+)/i);
      const tome = tomeMatch ? tomeMatch[1] : null;

      // Extraire le titre album : partie après "Tome-N-" si présent
      let title;
      if (tomeMatch) {
        const afterTome = slug.replace(/.*Tome-\d+-/i, '');
        title = afterTome
          ? afterTome.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
          : null;
      } else {
        // Pas de tome — le slug est série + titre, on prend tout
        title = slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
      }

      if (title) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      } else {
        title = `Album ${id}`;
      }

      // Chercher l'image de couverture à proximité du lien
      const contextStart = Math.max(0, match.index - 500);
      const contextEnd = Math.min(html.length, match.index + match[0].length + 500);
      const nearby = html.substring(contextStart, contextEnd);
      const imgMatch = nearby.match(/<img[^>]*src="([^"]*Couv[^"]+)"/i) ||
                       nearby.match(/<img[^>]*src="([^"]*media[^"]+)"/i);
      const coverUrl = imgMatch ? imgMatch[1] : null;

      albums.push({
        id,
        type: 'album',
        title,
        tome,
        url,
        coverUrl
      });
    }

    // Tri par numéro de tome
    albums.sort((a, b) => {
      const tomeA = parseInt(a.tome) || 999;
      const tomeB = parseInt(b.tome) || 999;
      return tomeA - tomeB;
    });

    return albums;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ŒUVRES D'UN AUTEUR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les œuvres d'un auteur
   * @param {string} authorId - ID de l'auteur
   */
  async getAuthorWorks(authorId, options = {}) {
    const { maxResults = 100 } = options;

    try {
      this.log.debug(`Œuvres de l'auteur: ${authorId}`);

      // Charger la page de l'auteur via FlareSolverr
      const url = `${BEDETHEQUE_BASE_URL}/auteur/index/a/${authorId}`;
      const html = await this.flaresolverrRequest(url);

      // Parser les informations de l'auteur
      const author = this.parseAuthorInfo(html, authorId);

      // Parser les séries
      const series = this.parseAuthorSeries(html, maxResults);

      return {
        success: true,
        provider: 'bedetheque',
        domain: 'comics',
        query: null,
        total: series.length,
        count: series.length,
        data: series,
        pagination: null,
        meta: {
          fetchedAt: new Date().toISOString(),
          authorId,
          authorName: author.name
        }
      };
    } catch (error) {
      this.log.error(`Erreur œuvres auteur: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse les informations d'un auteur depuis le HTML
   */
  parseAuthorInfo(html, authorId) {
    const author = {
      id: authorId,
      type: 'author'
    };

    // Nom
    const nameMatch = html.match(/<h1[^>]*class="[^"]*auteur-nom[^"]*"[^>]*>([^<]+)/i) ||
                     html.match(/<title>([^<,]+)/i);
    author.name = nameMatch ? this.cleanHtml(nameMatch[1]) : null;

    // Photo
    const photoMatch = html.match(/<img[^>]*class="[^"]*auteur-image[^"]*"[^>]*src="([^"]+)"/i);
    author.photoUrl = photoMatch ? photoMatch[1] : null;

    // Biographie
    const bioMatch = html.match(/<div[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    author.biography = bioMatch ? this.cleanHtml(bioMatch[1]) : null;

    // Date de naissance
    const birthMatch = html.match(/Naissance\s*:\s*(?:le\s*)?([0-9/]+)/i);
    author.birthDate = birthMatch ? birthMatch[1] : null;

    // Nationalité
    const nationalityMatch = html.match(/<img[^>]*src="[^"]*flags\/([^."]+)/i);
    author.nationality = nationalityMatch ? nationalityMatch[1] : null;

    return author;
  }

  /**
   * Parse les séries d'un auteur depuis le HTML
   */
  parseAuthorSeries(html, maxResults) {
    const series = [];
    const seen = new Set();

    // Pattern pour les séries
    const seriePattern = /href="([^"]*serie-(\d+)-BD-[^"]+\.html)"[^>]*>([^<]+)</gi;
    
    let match;
    while ((match = seriePattern.exec(html)) !== null && series.length < maxResults) {
      const url = match[1].startsWith('http') ? match[1] : `${BEDETHEQUE_BASE_URL}/${match[1]}`;
      const id = match[2];
      const title = this.cleanHtml(match[3]);

      // Éviter les doublons
      if (seen.has(id)) continue;
      seen.add(id);

      series.push({
        id,
        type: 'serie',
        title,
        url
      });
    }

    return series;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS D'UN ALBUM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'un album
   * @param {string} albumId - ID de l'album
   */
  async getAlbumDetails(albumId, options = {}) {
    try {
      this.log.debug(`Détails album: ${albumId}`);

      // Essayer d'abord de récupérer le résumé via AJAX
      let resume = null;
      try {
        resume = await this.ajaxRequest(`/ajax/resume/album/${albumId}`);
      } catch (e) {
        this.log.debug(`Résumé AJAX non disponible: ${e.message}`);
      }

      // Déterminer l'URL de la page album
      // Bedetheque n'a pas d'URL courte pour les albums (contrairement aux séries)
      // Le format est BD-{slug}-{id}.html — le slug est nécessaire
      let url;
      if (options.url) {
        // URL fournie par le client (provenant de la liste d'albums)
        url = options.url;
      } else {
        // Fallback: essayer la recherche via FlareSolverr
        url = await this.findAlbumUrl(albumId);
      }

      if (!url) {
        throw new NotFoundError(`Album ${albumId} non trouvé — passez le paramètre url pour accéder à cet album`);
      }

      const html = await this.flaresolverrRequest(url);

      // Vérifier si la page existe
      if (html.includes('Page introuvable') || html.includes('404')) {
        throw new NotFoundError(`Album ${albumId} non trouvé`);
      }

      // Valider que la page correspond bien à l'album demandé
      const ogUrl = html.match(/property="og:url"[^>]*content="([^"]+)"/i);
      if (ogUrl && !ogUrl[1].includes(`-${albumId}.html`)) {
        this.log.warn(`URL mismatch: demandé ${albumId}, page réelle ${ogUrl[1]}`);
        throw new NotFoundError(`Album ${albumId} non trouvé`);
      }

      const album = this.parseAlbumDetails(html, albumId, ogUrl ? ogUrl[1] : url);

      // Ajouter le résumé AJAX s'il est disponible
      if (resume && typeof resume === 'string') {
        album.description = this.cleanHtml(resume) || album.description;
      }

      return this.normalizer.normalizeAlbumDetail(album);
    } catch (error) {
      if (error.name === 'NotFoundError') throw error;
      this.log.error(`Erreur détails album: ${error.message}`);
      throw new BadGatewayError(`Erreur Bedetheque: ${error.message}`);
    }
  }

  /**
   * Cherche l'URL d'un album par son ID via la page de recherche
   * @param {string} albumId - ID numérique de l'album
   * @returns {string|null} URL complète ou null
   */
  async findAlbumUrl(albumId) {
    try {
      // Tenter de résoudre l'URL via le site Bedetheque
      // Le pattern BD--{id}.html redirige parfois correctement pour les vrais album IDs
      const testUrl = `${BEDETHEQUE_BASE_URL}/BD--${albumId}.html`;
      const html = await this.flaresolverrRequest(testUrl);

      // Vérifier que la page obtenue correspond bien à notre album
      const ogUrl = html.match(/property="og:url"[^>]*content="([^"]+)"/i);
      if (ogUrl && ogUrl[1].includes(`-${albumId}.html`)) {
        return ogUrl[1];
      }

      this.log.debug(`findAlbumUrl: BD--${albumId}.html n'a pas résolu vers le bon album`);
      return null;
    } catch (e) {
      this.log.debug(`findAlbumUrl: échec pour ${albumId}: ${e.message}`);
      return null;
    }
  }

  /**
   * Parse les détails d'un album depuis le HTML
   */
  parseAlbumDetails(html, albumId, url) {
    const album = {
      id: albumId,
      type: 'album',
      url
    };

    // Titre depuis la balise meta og:title ou title
    const ogTitleMatch = html.match(/property="og:title"[^>]*content="([^"]+)"/i) ||
                        html.match(/name="og:title"[^>]*content="([^"]+)"/i);
    if (ogTitleMatch) {
      // Format: "Astérix -1- Astérix le Gaulois" -> extraire le titre après le numéro
      const fullTitle = this.decodeUnicode(ogTitleMatch[1]);
      const titleParts = fullTitle.match(/-\d+-\s*(.+)$/);
      album.title = titleParts ? titleParts[1].trim() : fullTitle;
    } else {
      // Fallback: extraire depuis <title>
      const titleMatch = html.match(/<title>([^<]+)</i);
      album.title = titleMatch ? this.cleanHtml(titleMatch[1].split('|')[0].split('-').pop()) : null;
    }

    // Série depuis le lien
    const serieMatch = html.match(/href="[^"]*serie-(\d+)-BD-([^"]+)\.html"[^>]*>([^<]*)</i);
    if (serieMatch) {
      album.serieId = serieMatch[1];
      album.serie = this.cleanHtml(serieMatch[3]) || serieMatch[2].replace(/-/g, ' ');
    }

    // Tome depuis le titre ou l'URL
    const tomeFromTitle = album.title ? album.title.match(/Tome[\s.:]*(\d+)/i) : null;
    const tomeFromUrl = url.match(/Tome-(\d+)/i);
    const tomeFromOg = ogTitleMatch ? ogTitleMatch[1].match(/-(\d+)-/i) : null;
    album.tome = tomeFromTitle?.[1] || tomeFromOg?.[1] || tomeFromUrl?.[1] || null;

    // Synopsis/Résumé - Pattern amélioré
    const synopsisPatterns = [
      /<div[^>]*id="[^"]*resume[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*resume[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class="[^"]*resume[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
      /property="og:description"[^>]*content="([^"]+)"/i
    ];
    for (const pattern of synopsisPatterns) {
      const match = html.match(pattern);
      if (match && match[1]?.length > 20) {
        album.description = this.cleanHtml(match[1]);
        break;
      }
    }

    // Image de couverture depuis og:image
    const coverMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/i) ||
                      html.match(/class="[^"]*couv[^"]*"[^>]*src="([^"]+)"/i);
    album.coverUrl = coverMatch ? coverMatch[1] : null;

    // Scénariste
    const scenaristeMatch = html.match(/Sc[ée]nario\s*:[\s\S]*?<a[^>]*href="[^"]*auteur[^"]*"[^>]*>([^<]+)</i);
    album.scenariste = scenaristeMatch ? this.cleanHtml(scenaristeMatch[1]) : null;

    // Dessinateur
    const dessinateurMatch = html.match(/Dessin\s*:[\s\S]*?<a[^>]*href="[^"]*auteur[^"]*"[^>]*>([^<]+)</i);
    album.dessinateur = dessinateurMatch ? this.cleanHtml(dessinateurMatch[1]) : null;

    // Coloriste
    const coloristeMatch = html.match(/Couleurs?\s*:[\s\S]*?<a[^>]*href="[^"]*auteur[^"]*"[^>]*>([^<]+)</i);
    album.coloriste = coloristeMatch ? this.cleanHtml(coloristeMatch[1]) : null;

    // Éditeur
    const editeurMatch = html.match(/[EÉ]diteur\s*:[\s\S]*?<a[^>]*>([^<]+)</i);
    album.editeur = editeurMatch ? this.cleanHtml(editeurMatch[1]) : null;

    // Dépôt légal - format: "01/1999" ou "Janvier 1999"
    const dateMatch = html.match(/D[ée]p[oô]t\s*l[ée]gal\s*:\s*(?:<[^>]*>)*([^<\n]+)/i);
    album.dateParution = dateMatch ? this.cleanHtml(dateMatch[1]) : null;

    // ISBN
    const isbnMatch = html.match(/ISBN\s*:\s*(?:<[^>]*>)*([0-9X-]+)/i);
    album.isbn = isbnMatch ? isbnMatch[1].trim() : null;

    // Nombre de planches/pages
    const pagesMatch = html.match(/(\d+)\s*(?:pages?|planches?)/i);
    album.pages = pagesMatch ? parseInt(pagesMatch[1]) : null;

    // Format (ex: "Format normal")
    const formatMatch = html.match(/Format\s*:\s*(?:<[^>]*>)*([^<\n,]+)/i);
    if (formatMatch && !formatMatch[1].includes('http')) {
      album.format = this.cleanHtml(formatMatch[1]);
    }

    // Note moyenne
    const noteMatch = html.match(/itemprop="ratingValue"[^>]*>(\d+(?:[.,]\d+)?)</i) ||
                     html.match(/class="[^"]*note[^"]*"[^>]*>(\d+(?:[.,]\d+)?)/i);
    album.rating = noteMatch ? parseFloat(noteMatch[1].replace(',', '.')) : null;

    // Cote argus
    const coteMatch = html.match(/Cote\s*(?:en vente)?\s*:[\s\S]*?(\d+(?:[.,]\d+)?\s*€)/i);
    album.cote = coteMatch ? coteMatch[1].trim() : null;

    return album;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DÉTAILS D'UNE SÉRIE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Récupère les détails d'une série
   * @param {string} serieId - ID de la série
   */
  async getSerieDetails(serieId) {
    try {
      this.log.debug(`Détails série: ${serieId}`);

      // Charger la page via FlareSolverr
      const url = `${BEDETHEQUE_BASE_URL}/serie/index/s/${serieId}`;
      const html = await this.flaresolverrRequest(url);

      // Vérifier si la page existe
      if (html.includes('Page introuvable') || html.includes('404')) {
        throw new NotFoundError(`Série ${serieId} non trouvé`);
      }

      const serie = this.parseSerieDetails(html, serieId);

      // Vérifier que le parsing a bien trouvé un titre (page vide = pas une vraie série)
      if (!serie.title) {
        throw new NotFoundError(`Série ${serieId} non trouvé`);
      }

      return this.normalizer.normalizeSerieDetail(serie);
    } catch (error) {
      if (error.name === 'NotFoundError') throw error;
      this.log.error(`Erreur détails série: ${error.message}`);
      throw new BadGatewayError(`Erreur Bedetheque: ${error.message}`);
    }
  }

  /**
   * Parse les détails d'une série
   */
  parseSerieDetails(html, serieId) {
    const serie = this.parseSerieInfo(html, serieId);

    // URL finale
    const urlMatch = html.match(/og:url"[^>]*content="([^"]+)"/i);
    serie.url = urlMatch ? urlMatch[1] : `${BEDETHEQUE_BASE_URL}/serie/index/s/${serieId}`;

    // Genre/Style
    const styleMatch = html.match(/Genre[^:]*:\s*<[^>]*>([^<]+)/i);
    serie.genre = styleMatch ? this.cleanHtml(styleMatch[1]) : null;

    // Statut
    const statutMatch = html.match(/Statut[^:]*:\s*([^<\n]+)/i);
    serie.status = statutMatch ? this.cleanHtml(statutMatch[1]) : null;

    // Première parution
    const firstDateMatch = html.match(/Première parution[^:]*:\s*([^<\n]+)/i);
    serie.firstPublished = firstDateMatch ? this.cleanHtml(firstDateMatch[1]) : null;

    // Éditeur principal
    const editeurMatch = html.match(/[EÉ]diteur[^:]*:\s*<[^>]*>([^<]+)/i);
    serie.publisher = editeurMatch ? this.cleanHtml(editeurMatch[1]) : null;

    // Auteurs
    serie.authors = [];
    const authorPattern = /href="[^"]*auteur-(\d+)[^"]*">([^<]+)</gi;
    let match;
    const seenAuthors = new Set();
    while ((match = authorPattern.exec(html)) !== null) {
      const authorId = match[1];
      const authorName = this.cleanHtml(match[2]);
      if (!seenAuthors.has(authorId)) {
        seenAuthors.add(authorId);
        serie.authors.push({
          id: authorId,
          name: authorName,
          url: `${BEDETHEQUE_BASE_URL}/auteur/index/a/${authorId}`
        });
      }
    }

    // Séries recommandées (À lire aussi)
    serie.recommendations = [];
    const recoMatch = html.match(/class="[^"]*alire[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (recoMatch) {
      const recoPattern = /href="[^"]*serie-(\d+)[^"]*">([^<]+)</gi;
      while ((match = recoPattern.exec(recoMatch[1])) !== null) {
        serie.recommendations.push({
          id: match[1],
          title: this.cleanHtml(match[2])
        });
      }
    }

    return serie;
  }
}
