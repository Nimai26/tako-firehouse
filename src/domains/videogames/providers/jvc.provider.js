/**
 * JeuxVideo.com (JVC) Provider
 * 
 * Scraping provider for JeuxVideo.com, the leading French gaming website.
 * Requires FlareSolverr to bypass Cloudflare protection.
 * 
 * Features:
 * - Game search
 * - Detailed game information (PEGI, platforms, release dates, ratings)
 * - French-native content
 * 
 * @module providers/jvc
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('JVCProvider');

const JVC_BASE_URL = 'https://www.jeuxvideo.com';
const JVC_DEFAULT_MAX = 20;
const FSR_BASE = process.env.FSR_URL || process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';

/**
 * Get or create FlareSolverr session
 * @returns {string} Session ID
 */
function getFsrSessionId() {
  // Use a persistent session ID for better performance
  return process.env.FSR_SESSION_ID || 'jvc_session_tako';
}

/**
 * Decode HTML entities
 * @param {string} str - String with HTML entities
 * @returns {string} Decoded string
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&nbsp;': ' ',
    '&eacute;': 'é',
    '&egrave;': 'è',
    '&ecirc;': 'ê',
    '&agrave;': 'à',
    '&acirc;': 'â',
    '&ocirc;': 'ô',
    '&icirc;': 'î',
    '&ucirc;': 'û',
    '&ccedil;': 'ç',
    '&hellip;': '...',
  };
  
  return str.replace(/&[a-z0-9#]+;/gi, match => entities[match.toLowerCase()] || match);
}

/**
 * Fetch via FlareSolverr proxy
 * @param {string} url - Target URL
 * @param {object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function fetchViaFlareSolverr(url, options = {}) {
  const fsrSessionId = getFsrSessionId();
  
  const payload = {
    cmd: 'request.get',
    url,
    maxTimeout: 30000,
    session: fsrSessionId,
    ...options
  };
  
  log.debug(`[JVC] FlareSolverr request: ${url}`);
  
  const response = await fetch(FSR_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`FlareSolverr HTTP error: ${response.status}`);
  }
  
  return response;
}

/**
 * Search games on JeuxVideo.com
 * @param {string} query - Search term
 * @param {object} options - Search options
 * @param {number} [options.limit=20] - Maximum results (max 50)
 * @returns {Promise<object>} Search results
 */
export async function search(query, options = {}) {
  const limit = Math.min(options.limit || JVC_DEFAULT_MAX, 50);
  
  try {
    log.info(`[JVC] Searching: "${query}" (limit: ${limit})`);
    
    // URL with m=9 to filter only games
    const searchUrl = `${JVC_BASE_URL}/rechercher.php?m=9&q=${encodeURIComponent(query)}`;
    
    const response = await fetchViaFlareSolverr(searchUrl);
    const data = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(`FlareSolverr error: ${data.message || 'Unknown error'}`);
    }
    
    const html = data.solution?.response || '';
    
    // Parse search results (2024 structure)
    const results = [];
    const seenIds = new Set();
    
    // Regex to extract game cards
    const cardRegex = /<div class="card card--small[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi;
    
    // Individual regex for each element
    const idTitleRegex = /href="\/jeux\/jeu-(\d+)\/"[^>]*class="[^"]*stretched-link[^"]*"[^>]*>\s*([^<]+)\s*<\/a>/i;
    const platformRegex = /card__contentType">([^<]+)</i;
    const imgRegex = /<img[^>]*src="(https:\/\/image\.jeuxvideo\.com[^"]+)"/i;
    
    let cardMatch;
    while ((cardMatch = cardRegex.exec(html)) !== null && results.length < limit) {
      const cardHtml = cardMatch[1];
      
      const idTitleMatch = idTitleRegex.exec(cardHtml);
      if (idTitleMatch) {
        const id = idTitleMatch[1];
        const title = decodeHtmlEntities(idTitleMatch[2].trim());
        
        if (!seenIds.has(id)) {
          seenIds.add(id);
          
          const platformMatch = platformRegex.exec(cardHtml);
          const imgMatch = imgRegex.exec(cardHtml);
          
          // Use medium size instead of xs
          const coverUrl = imgMatch ? imgMatch[1].replace('-xs/', '-md/') : null;
          
          results.push({
            id: parseInt(id),
            title,
            platform: platformMatch ? platformMatch[1].trim() : null,
            coverUrl,
            url: `${JVC_BASE_URL}/jeux/jeu-${id}/`
          });
        }
      }
    }
    
    log.info(`[JVC] Found ${results.length} games for "${query}"`);
    
    return {
      query,
      total: results.length,
      results
    };
    
  } catch (error) {
    log.error(`[JVC] Search error: ${error.message}`);
    throw error;
  }
}

/**
 * Get game details by ID
 * @param {string|number} gameId - Game ID
 * @returns {Promise<object>} Game details
 */
export async function getGame(gameId) {
  try {
    log.info(`[JVC] Fetching game: ${gameId}`);
    
    const gameUrl = `${JVC_BASE_URL}/jeux/jeu-${gameId}/`;
    
    const response = await fetchViaFlareSolverr(gameUrl);
    const data = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(`FlareSolverr error: ${data.message || 'Unknown error'}`);
    }
    
    const html = data.solution?.response || '';
    
    // Extract title
    const titleMatch = html.match(/gameHeaderBanner__title[^>]*>([^<]+)/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null;
    
    if (!title) {
      throw new Error(`Game not found: ${gameId}`);
    }
    
    // Initialize data
    let genres = [];
    let publisher = null;
    let developer = null;
    let releaseDate = null;
    let pegi = null;
    let platforms = [];
    let nbPlayers = null;
    let isMultiplayer = false;
    
    // Parse analyticsMetadata (JSON in HTML)
    const analyticsMatch = html.match(/window\.jvc\.analyticsMetadata\s*=\s*(\{[^}]+\})/i);
    if (analyticsMatch) {
      try {
        const analytics = JSON.parse(analyticsMatch[1]);
        
        if (analytics.genre_tags_name) {
          genres = analytics.genre_tags_name.split('|').map(g => g.trim()).filter(Boolean);
        }
        if (analytics.publisher_tags_name) {
          publisher = analytics.publisher_tags_name;
        }
        if (analytics.developer_tags_name) {
          developer = analytics.developer_tags_name;
        }
        if (analytics.masterfiche_game_release_date) {
          releaseDate = analytics.masterfiche_game_release_date;
        }
        if (analytics.pegi_tags_name) {
          pegi = analytics.pegi_tags_name;
        }
      } catch (e) {
        log.debug(`[JVC] Error parsing analyticsMetadata: ${e.message}`);
      }
    }
    
    // Parse dataLayer for platforms
    const dataLayerMatch = html.match(/dataLayer\s*=\s*\[(\{[^}]+\})\]/i);
    if (dataLayerMatch) {
      try {
        const dataLayer = JSON.parse(dataLayerMatch[1]);
        
        if (dataLayer.platform && Array.isArray(dataLayer.platform)) {
          const platformMap = {
            'switch': 'Nintendo Switch',
            'switch-2': 'Nintendo Switch 2',
            'wiiu': 'Wii U',
            'ps5': 'PlayStation 5',
            'ps4': 'PlayStation 4',
            'ps3': 'PlayStation 3',
            'ps2': 'PlayStation 2',
            'psp': 'PSP',
            'xboxone': 'Xbox One',
            'xboxseries': 'Xbox Series X|S',
            'xbox360': 'Xbox 360',
            'pc': 'PC',
            '3ds': 'Nintendo 3DS',
            'ds': 'Nintendo DS',
            'vita': 'PS Vita',
            'android': 'Android',
            'ios': 'iOS',
            'stadia': 'Stadia',
            'luna': 'Amazon Luna'
          };
          platforms = dataLayer.platform.map(p => platformMap[p.toLowerCase()] || p.toUpperCase());
        }
        
        if (!developer && dataLayer.game_developer && Array.isArray(dataLayer.game_developer)) {
          developer = dataLayer.game_developer[0];
        }
      } catch (e) {
        log.debug(`[JVC] Error parsing dataLayer: ${e.message}`);
      }
    }
    
    // Fallback: extract developer from HTML
    if (!developer) {
      const devMatch = html.match(/Développeur[^:]*:\s*<[^>]+>([^<]+)</i) ||
                       html.match(/developer[^"]*"[^>]*>([^<]+)</i);
      if (devMatch) {
        developer = decodeHtmlEntities(devMatch[1].trim());
      }
    }
    
    // Extract number of players
    const playersMatch = html.match(/Nombre de joueurs[^:]*:\s*<[^>]*>([^<]+)</i) ||
                         html.match(/Nombre de joueurs[^:]*:\s*([0-9][^<]*)</i) ||
                         html.match(/"nb_players"\s*:\s*"([^"]+)"/i);
    if (playersMatch) {
      const rawPlayers = playersMatch[1].trim();
      if (/\d/.test(rawPlayers) && rawPlayers.length < 50) {
        nbPlayers = rawPlayers;
        const numMatch = nbPlayers.match(/(\d+)\s*(?:à|-)?\s*(\d+)?/);
        if (numMatch) {
          const maxPlayers = parseInt(numMatch[2] || numMatch[1]);
          isMultiplayer = maxPlayers > 1;
        }
        if (/multijoueur|multi|en ligne|online|coop|co-op/i.test(nbPlayers)) {
          isMultiplayer = true;
        }
      }
    }
    
    // Detect multiplayer from genres or HTML
    if (!isMultiplayer) {
      const multiMatch = html.match(/multijoueur|multiplayer|en ligne|online|co-op|coop/i);
      if (multiMatch) {
        isMultiplayer = true;
      }
    }
    
    // Fallback: extract platforms from header
    if (platforms.length === 0) {
      const platformRegex = /gameHeaderBanner__platformLink[^>]*>([^<]+)</gi;
      let platformMatch;
      while ((platformMatch = platformRegex.exec(html)) !== null) {
        const platformName = platformMatch[1].trim();
        if (platformName && !platforms.includes(platformName)) {
          platforms.push(platformName);
        }
      }
    }
    
    // Extract description from meta tags
    const descMatch = html.match(/name="description"[^>]*content="([^"]+)"/i) ||
                      html.match(/property="og:description"[^>]*content="([^"]+)"/i);
    let description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : null;
    
    if (description) {
      // Clean up generic JVC description prefix
      const cleanDesc = description.replace(/^[^:]+:\s*retrouvez toutes les informations et actualités du jeu sur tous ses supports\.\s*/i, '');
      description = cleanDesc || description;
    }
    
    // Extract OG image
    const ogImageMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/i);
    const cover = ogImageMatch ? ogImageMatch[1] : null;
    
    // Extract test/review link
    const testMatch = html.match(/href="(\/test\/[^"]+\.htm)"/i);
    const testUrl = testMatch ? `${JVC_BASE_URL}${testMatch[1]}` : null;
    
    // Extract ratings
    let testRating = null;
    const ratingMatch = html.match(/"game_tester_rating"\s*:\s*"(\d+(?:\.\d+)?)"/i);
    if (ratingMatch) {
      testRating = parseFloat(ratingMatch[1]);
    }
    
    let userRating = null;
    const userRatingMatch = html.match(/"game_usr_rating"\s*:\s*"(\d+(?:\.\d+)?)"/i);
    if (userRatingMatch) {
      userRating = parseFloat(userRatingMatch[1]);
    }
    
    // Extract minimum age from PEGI
    let minAge = null;
    if (pegi) {
      const ageMatch = pegi.match(/\+?(\d+)/);
      if (ageMatch) {
        minAge = parseInt(ageMatch[1]);
      }
    }
    
    // Extract media (Cartridge, CD, DVD, eShop, etc.)
    const media = [];
    const supportSectionMatch = html.match(/Support\(s\)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    if (supportSectionMatch) {
      const supportHtml = supportSectionMatch[1];
      const supportRegex = /gameCharacteristicsDetailed__characValue[^>]*>\s*([^<]+)/gi;
      let supportMatch;
      while ((supportMatch = supportRegex.exec(supportHtml)) !== null) {
        const support = supportMatch[1].trim();
        if (support && !media.includes(support)) {
          media.push(support);
        }
      }
    }
    
    log.info(`[JVC] Game fetched: ${title}`);
    
    return {
      id: parseInt(gameId),
      title,
      description,
      cover,
      releaseDate,
      platforms: platforms.length > 0 ? platforms : [],
      genres: genres.length > 0 ? genres : [],
      publisher,
      developer,
      pegi,
      minAge,
      nbPlayers,
      isMultiplayer,
      media: media.length > 0 ? media : [],
      ratings: {
        test: testRating,
        users: userRating
      },
      testUrl,
      url: gameUrl
    };
    
  } catch (error) {
    log.error(`[JVC] Get game error: ${error.message}`);
    throw error;
  }
}

/**
 * Health check for JVC provider
 * @returns {Promise<object>} Health status
 */
export async function healthCheck() {
  try {
    // Test FlareSolverr connectivity
    const response = await fetch(FSR_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'sessions.list' })
    });
    
    if (!response.ok) {
      throw new Error(`FlareSolverr HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      status: 'ok',
      provider: 'jvc',
      flareSolverr: {
        url: FSR_BASE,
        status: data.status || 'unknown',
        sessions: data.sessions?.length || 0
      }
    };
    
  } catch (error) {
    log.error(`[JVC] Health check failed: ${error.message}`);
    return {
      status: 'error',
      provider: 'jvc',
      error: error.message
    };
  }
}
