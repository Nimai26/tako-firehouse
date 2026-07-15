/**
 * BoardGameGeek (BGG) Provider
 * 
 * API XML provider for BoardGameGeek, the leading board game database.
 * Requires BGG API token (Bearer authentication).
 * 
 * Features:
 * - Game search
 * - Detailed game information (stats, categories, mechanics, designers)
 * - Rankings and ratings
 * 
 * @module providers/bgg
 */

import { logger } from '../../../shared/utils/logger.js';

const log = logger.create('BGGProvider');

const BGG_API_URL = 'https://boardgamegeek.com/xmlapi2';
const BGG_BASE_URL = 'https://boardgamegeek.com';
const BGG_FILES_API_URL = 'https://api.geekdo.com/api/files';
const BGG_DOWNLOAD_API_URL = 'https://api.geekdo.com/api/file/downloadurls';
const BGG_LOGIN_URL = 'https://boardgamegeek.com/login/api/v1';
const BGG_DEFAULT_MAX = 20;
const BGG_RATE_LIMIT_MS = 1000; // 1 second between requests

let lastRequestTime = 0;

// BGG session cache (SessionID for GeekAuth, expires 1h)
let bggSession = { sessionId: null, cookies: null, expiresAt: 0 };

/**
 * Login to BGG and cache session
 * @returns {Promise<string>} SessionID for GeekAuth
 */
async function getBggSessionId() {
  if (bggSession.sessionId && Date.now() < bggSession.expiresAt) {
    return bggSession.sessionId;
  }

  const username = process.env.BGG_USERNAME;
  const password = process.env.BGG_PASSWORD;

  if (!username || !password) {
    log.warn('[BGG] BGG_USERNAME/BGG_PASSWORD not configured, file download URLs unavailable');
    return null;
  }

  try {
    log.info('[BGG] Logging in to BGG...');

    const response = await fetch(BGG_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Tako_Api/1.0'
      },
      body: JSON.stringify({ credentials: { username, password } }),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });

    if (response.status !== 200 && response.status !== 204) {
      throw new Error(`BGG login failed: ${response.status}`);
    }

    // Extract SessionID from Set-Cookie headers
    const setCookies = response.headers.getSetCookie?.() || [];
    let sessionId = null;
    let bggCookies = [];

    for (const cookie of setCookies) {
      const match = cookie.match(/^([^=]+)=([^;]+)/);
      if (!match) continue;
      const [, name, value] = match;
      if (name === 'SessionID') sessionId = value;
      if (['bggusername', 'bggpassword', 'SessionID'].includes(name) && value !== 'deleted') {
        bggCookies.push(`${name}=${value}`);
      }
    }

    if (!sessionId) {
      throw new Error('BGG login: no SessionID in response');
    }

    // Cache session (refresh 10 min before expiry, SessionID lives 1h)
    bggSession = {
      sessionId,
      cookies: bggCookies.join('; '),
      expiresAt: Date.now() + 50 * 60 * 1000
    };

    log.info('[BGG] Logged in successfully');
    return sessionId;
  } catch (error) {
    log.error(`[BGG] Login error: ${error.message}`);
    bggSession = { sessionId: null, cookies: null, expiresAt: 0 };
    return null;
  }
}

/**
 * Respect BGG rate limit
 */
async function respectRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < BGG_RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, BGG_RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Build BGG API headers
 * @returns {object} HTTP headers
 */
function buildBGGHeaders() {
  const token = process.env.BGG_API_TOKEN;
  const headers = {
    'User-Agent': 'Tako_Api/1.0'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * Simple XML parser (no external dependencies)
 * @param {string} xml - XML content
 * @returns {object} Parser utilities
 */
function parseXML(xml) {
  const getAttribute = (str, attr) => {
    const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
    const match = str.match(regex);
    return match ? match[1] : null;
  };
  
  const getTagWithAttrs = (str, tag) => {
    const regex = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>|<${tag}\\b([^>]*?)\\/>`, 'gi');
    const results = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
      const attrs = match[1] || match[3] || '';
      const content = match[2] || '';
      results.push({ attrs, content: content.trim() });
    }
    return results;
  };
  
  return { getAttribute, getTagWithAttrs };
}

/**
 * Decode HTML entities
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  if (!text) return '';
  
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * Search board games on BGG
 * @param {string} query - Search term
 * @param {object} options - Search options
 * @param {number} [options.limit=20] - Maximum results
 * @returns {Promise<object>} Search results
 */
export async function search(query, options = {}) {
  const limit = Math.min(options.limit || BGG_DEFAULT_MAX, 100);
  
  if (!query || query.trim().length < 2) {
    return { results: [], total: 0, query };
  }
  
  await respectRateLimit();
  
  try {
    log.info(`[BGG] Searching: "${query}" (limit: ${limit})`);
    
    const url = `${BGG_API_URL}/search?query=${encodeURIComponent(query)}&type=boardgame`;
    
    const response = await fetch(url, {
      headers: buildBGGHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('BGG API: Bearer token required or invalid');
      }
      throw new Error(`BGG API error: ${response.status}`);
    }
    
    const xml = await response.text();
    const parser = parseXML(xml);
    
    // Extract items
    const items = parser.getTagWithAttrs(xml, 'item');
    const results = [];
    
    for (const item of items.slice(0, limit)) {
      const id = parser.getAttribute(item.attrs, 'id');
      const type = parser.getAttribute(item.attrs, 'type');
      
      // Extract name (first <name> with type="primary")
      const nameMatches = item.content.match(/<name[^>]*value="([^"]*)"[^>]*>/gi);
      let name = '';
      if (nameMatches && nameMatches.length > 0) {
        const primaryMatch = nameMatches.find(m => m.includes('type="primary"'));
        const matchToUse = primaryMatch || nameMatches[0];
        const valueMatch = matchToUse.match(/value="([^"]*)"/);
        if (valueMatch) name = decodeHtmlEntities(valueMatch[1]);
      }
      
      // Extract year
      const yearMatch = item.content.match(/<yearpublished[^>]*value="([^"]*)"/i);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      
      if (id && name) {
        results.push({
          id,
          type,
          name,
          year,
          url: `${BGG_BASE_URL}/boardgame/${id}`
        });
      }
    }
    
    log.info(`[BGG] Found ${results.length} games for "${query}"`);
    
    // Enrich with thumbnails via batch /thing request
    if (results.length > 0) {
      await enrichWithThumbnails(results);
    }
    
    return {
      results,
      total: items.length,
      query
    };
    
  } catch (error) {
    log.error(`[BGG] Search error: ${error.message}`);
    throw error;
  }
}

/**
 * Enrich search results with thumbnails via batch /thing request
 * @param {Array} results - Search results to enrich (mutated in place)
 */
async function enrichWithThumbnails(results) {
  try {
    await respectRateLimit();
    
    const ids = results.map(r => r.id).join(',');
    const url = `${BGG_API_URL}/thing?id=${ids}`;
    
    const response = await fetch(url, {
      headers: buildBGGHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      log.warn(`[BGG] Thumbnail enrichment failed: ${response.status}`);
      return;
    }
    
    const xml = await response.text();
    
    // Extract thumbnail and image per item ID
    const itemRegex = /<item\b[^>]*id="(\d+)"[^>]*>[\s\S]*?<\/item>/gi;
    let match;
    const imageMap = new Map();
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemId = match[1];
      const itemXml = match[0];
      const thumbMatch = itemXml.match(/<thumbnail>([^<]*)<\/thumbnail>/);
      const imgMatch = itemXml.match(/<image>([^<]*)<\/image>/);
      imageMap.set(itemId, {
        thumbnail: thumbMatch ? thumbMatch[1] : null,
        image: imgMatch ? imgMatch[1] : null
      });
    }
    
    for (const result of results) {
      const images = imageMap.get(String(result.id));
      if (images) {
        result.thumbnail = images.thumbnail;
        result.image = images.image;
      }
    }
    
    log.info(`[BGG] Enriched ${imageMap.size}/${results.length} results with thumbnails`);
  } catch (error) {
    log.warn(`[BGG] Thumbnail enrichment error: ${error.message}`);
  }
}

/**
 * Get game details by ID
 * @param {string|number} bggId - BGG game ID
 * @returns {Promise<object>} Game details
 */
export async function getGame(bggId) {
  if (!bggId) {
    throw new Error('BGG ID required');
  }
  
  await respectRateLimit();
  
  try {
    log.info(`[BGG] Fetching game: ${bggId}`);
    
    const url = `${BGG_API_URL}/thing?id=${bggId}&stats=1`;
    
    const response = await fetch(url, {
      headers: buildBGGHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('BGG API: Bearer token required or invalid');
      }
      throw new Error(`BGG API error: ${response.status}`);
    }
    
    const xml = await response.text();
    
    // Check if game exists
    if (xml.includes('<items total="0"') || !xml.includes('<item')) {
      throw new Error(`Game not found: ${bggId}`);
    }
    
    const parser = parseXML(xml);
    
    // Extract basic info
    const itemMatch = xml.match(/<item[^>]*type="([^"]*)"[^>]*id="([^"]*)"/);
    const type = itemMatch ? itemMatch[1] : 'boardgame';
    const id = itemMatch ? itemMatch[2] : bggId;
    
    // Primary name
    const primaryNameMatch = xml.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/);
    const name = primaryNameMatch ? decodeHtmlEntities(primaryNameMatch[1]) : '';
    
    // Alternate names
    const altNames = [];
    const altNameMatches = xml.matchAll(/<name[^>]*type="alternate"[^>]*value="([^"]*)"/g);
    for (const m of altNameMatches) {
      altNames.push(decodeHtmlEntities(m[1]));
    }
    
    // Description
    const descMatch = xml.match(/<description>([^<]*)<\/description>/);
    const description = descMatch ? decodeHtmlEntities(descMatch[1]) : '';
    
    // Year
    const yearMatch = xml.match(/<yearpublished[^>]*value="([^"]*)"/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    
    // Players
    const minPlayersMatch = xml.match(/<minplayers[^>]*value="([^"]*)"/);
    const maxPlayersMatch = xml.match(/<maxplayers[^>]*value="([^"]*)"/);
    const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1]) : null;
    const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1]) : null;
    
    // Play time
    const minPlaytimeMatch = xml.match(/<minplaytime[^>]*value="([^"]*)"/);
    const maxPlaytimeMatch = xml.match(/<maxplaytime[^>]*value="([^"]*)"/);
    const playingTimeMatch = xml.match(/<playingtime[^>]*value="([^"]*)"/);
    const minPlaytime = minPlaytimeMatch ? parseInt(minPlaytimeMatch[1]) : null;
    const maxPlaytime = maxPlaytimeMatch ? parseInt(maxPlaytimeMatch[1]) : null;
    const playingTime = playingTimeMatch ? parseInt(playingTimeMatch[1]) : null;
    
    // Min age
    const minAgeMatch = xml.match(/<minage[^>]*value="([^"]*)"/);
    const minAge = minAgeMatch ? parseInt(minAgeMatch[1]) : null;
    
    // Images
    const imageMatch = xml.match(/<image>([^<]*)<\/image>/);
    const thumbnailMatch = xml.match(/<thumbnail>([^<]*)<\/thumbnail>/);
    const image = imageMatch ? imageMatch[1] : null;
    const thumbnail = thumbnailMatch ? thumbnailMatch[1] : null;
    
    // Statistics
    const avgRatingMatch = xml.match(/<average[^>]*value="([^"]*)"/);
    const numRatingsMatch = xml.match(/<usersrated[^>]*value="([^"]*)"/);
    const rankMatch = xml.match(/<rank[^>]*type="subtype"[^>]*name="boardgame"[^>]*value="([^"]*)"/);
    const weightMatch = xml.match(/<averageweight[^>]*value="([^"]*)"/);
    
    const rating = avgRatingMatch ? parseFloat(avgRatingMatch[1]) : null;
    const numRatings = numRatingsMatch ? parseInt(numRatingsMatch[1]) : null;
    const rank = rankMatch && rankMatch[1] !== 'Not Ranked' ? parseInt(rankMatch[1]) : null;
    const complexity = weightMatch ? parseFloat(weightMatch[1]) : null;
    
    // Categories
    const categories = [];
    const categoryMatches = xml.matchAll(/<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/g);
    for (const m of categoryMatches) {
      categories.push(decodeHtmlEntities(m[1]));
    }
    
    // Mechanics
    const mechanics = [];
    const mechanicMatches = xml.matchAll(/<link[^>]*type="boardgamemechanic"[^>]*value="([^"]*)"/g);
    for (const m of mechanicMatches) {
      mechanics.push(decodeHtmlEntities(m[1]));
    }
    
    // Designers
    const designers = [];
    const designerMatches = xml.matchAll(/<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/g);
    for (const m of designerMatches) {
      designers.push(decodeHtmlEntities(m[1]));
    }
    
    // Publishers
    const publishers = [];
    const publisherMatches = xml.matchAll(/<link[^>]*type="boardgamepublisher"[^>]*value="([^"]*)"/g);
    for (const m of publisherMatches) {
      publishers.push(decodeHtmlEntities(m[1]));
    }
    
    // Artists
    const artists = [];
    const artistMatches = xml.matchAll(/<link[^>]*type="boardgameartist"[^>]*value="([^"]*)"/g);
    for (const m of artistMatches) {
      artists.push(decodeHtmlEntities(m[1]));
    }
    
    // Fetch files/instructions
    const files = await fetchFiles(id);
    
    log.info(`[BGG] Game fetched: ${name} (${files.length} files)`);
    
    return {
      id,
      type,
      name,
      alternateNames: altNames,
      description,
      year,
      players: {
        min: minPlayers,
        max: maxPlayers
      },
      playTime: {
        min: minPlaytime,
        max: maxPlaytime,
        average: playingTime
      },
      minAge,
      image,
      thumbnail,
      stats: {
        rating: rating ? Math.round(rating * 10) / 10 : null,
        numRatings,
        rank,
        complexity: complexity ? Math.round(complexity * 100) / 100 : null
      },
      categories,
      mechanics,
      designers,
      artists,
      publishers,
      files,
      url: `${BGG_BASE_URL}/boardgame/${id}`
    };
    
  } catch (error) {
    log.error(`[BGG] Get game error: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch game files/instructions from BGG Files API
 * @param {string|number} bggId - BGG game ID
 * @returns {Promise<Array>} Array of file objects
 */
async function fetchFiles(bggId) {
  try {
    await respectRateLimit();
    
    const url = `${BGG_FILES_API_URL}?objectid=${bggId}&objecttype=thing&filetype=Rules&page=1&sort=hot`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Tako_Api/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      log.warn(`[BGG] Files API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.files || !Array.isArray(data.files)) return [];
    
    const files = data.files.map(f => {
      const filename = f.filename || f.title;
      const ext = filename ? filename.split('.').pop().toLowerCase() : null;
      const mimeTypes = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
      // Strip HTML tags and decode entities from description
      const rawDesc = f.description?.rendered || null;
      const cleanDesc = rawDesc
        ? rawDesc.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim()
        : null;
      return {
        id: f.fileid,
        filename,
        title: filename ? filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() : null,
        description: cleanDesc,
        mimeType: (ext && mimeTypes[ext]) || 'application/octet-stream',
        language: f.language || null,
        size: f.size ? parseInt(f.size, 10) : null,
        url: f.href ? `${BGG_BASE_URL}${f.href}` : null,
        downloadUrl: null,
        votes: f.numpositive ? parseInt(f.numpositive, 10) : 0,
        date: f.postdate || null
      };
    });

    // Resolve direct download URLs via GeekAuth
    if (files.length > 0) {
      await enrichWithDownloadUrls(files);
    }

    return files;
  } catch (error) {
    log.warn(`[BGG] Files fetch error: ${error.message}`);
    return [];
  }
}

/**
 * Enrich files with direct download URLs via BGG download API
 * @param {Array} files - File objects to enrich (mutated in place)
 */
async function enrichWithDownloadUrls(files) {
  const sessionId = await getBggSessionId();
  if (!sessionId) return;

  try {
    const ids = files.map(f => f.id).join(',');
    const url = `${BGG_DOWNLOAD_API_URL}?ids=${ids}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `GeekAuth ${sessionId}`,
        'User-Agent': 'Tako_Api/1.0',
        'Origin': 'https://boardgamegeek.com',
        'Referer': 'https://boardgamegeek.com/'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 401) {
      log.warn('[BGG] GeekAuth expired, clearing session');
      bggSession = { sessionId: null, cookies: null, expiresAt: 0 };
      return;
    }

    if (!response.ok) {
      log.warn(`[BGG] Download URLs API error: ${response.status}`);
      return;
    }

    const data = await response.json();

    if (!data.downloadUrls || !Array.isArray(data.downloadUrls)) return;

    const urlMap = new Map(
      data.downloadUrls.map(d => [String(d.id), `${BGG_BASE_URL}${d.url}`])
    );

    for (const file of files) {
      const dlUrl = urlMap.get(String(file.id));
      if (dlUrl) {
        file.downloadUrl = dlUrl;
        file.url = dlUrl;
      }
    }

    log.info(`[BGG] Resolved ${urlMap.size}/${files.length} download URLs`);
  } catch (error) {
    log.warn(`[BGG] Download URLs error: ${error.message}`);
  }
}

/**
 * Search games by category
 * @param {string} category - Category name
 * @param {object} options - Search options
 * @returns {Promise<object>} Search results
 */
export async function searchByCategory(category, options = {}) {
  // BGG doesn't have direct category search, so we search by category name
  // and filter results. For a real implementation, you'd need to use the
  // category ID and search through all games (which requires pagination).
  return search(category, options);
}

/**
 * Health check for BGG provider
 * @returns {Promise<object>} Health status
 */
export async function healthCheck() {
  try {
    const token = process.env.BGG_API_TOKEN;
    
    if (!token) {
      return {
        status: 'error',
        provider: 'bgg',
        error: 'BGG_API_TOKEN not configured'
      };
    }
    
    // Test with a simple search
    await search('catan', { limit: 1 });
    
    return {
      status: 'ok',
      provider: 'bgg',
      hasToken: !!token
    };
    
  } catch (error) {
    log.error(`[BGG] Health check failed: ${error.message}`);
    return {
      status: 'error',
      provider: 'bgg',
      error: error.message
    };
  }
}
