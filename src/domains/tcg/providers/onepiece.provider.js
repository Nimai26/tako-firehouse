/**
 * Provider One Piece Card Game (onepiece-cardgame.dev)
 * API: https://www.onepiece-cardgame.dev/cards.json
 * 
 * Format: JSON statique téléchargé et mis en cache
 * Protection Cloudflare/ModSecurity => BESOIN de FlareSolverr
 */

import { logger } from '../../../shared/utils/logger.js';
import { FlareSolverrClient } from '../../../infrastructure/scraping/FlareSolverrClient.js';

const CARDS_URL = 'https://www.onepiece-cardgame.dev/cards.json';
const META_URL = 'https://www.onepiece-cardgame.dev/meta.json';
const CACHE_TTL = 1800000; // 30 minutes

// Cache en mémoire
let cardsCache = { data: null, timestamp: 0 };
let metaCache = { data: null, timestamp: 0 };

// Client FlareSolverr
let fsrClient = null;

/**
 * Récupère ou crée le client FlareSolverr
 * @returns {FlareSolverrClient}
 */
function getFsrClient() {
  if (!fsrClient) {
    fsrClient = new FlareSolverrClient('OnePiece');
  }
  return fsrClient;
}

/**
 * Télécharger les cartes One Piece via FlareSolverr
 * @returns {Promise<Array>} - Liste des cartes
 */
async function fetchOnePieceCards() {
  // Vérifier le cache
  if (cardsCache.data && (Date.now() - cardsCache.timestamp) < CACHE_TTL) {
    logger.debug(`[One Piece] Cache hit for cards`);
    return cardsCache.data;
  }
  
  try {
    logger.info(`[One Piece] Downloading cards.json via FlareSolverr...`);
    
    const client = getFsrClient();
    
    // Récupérer le HTML via FlareSolverr
    const cardsHtml = await client.get(CARDS_URL);
    
    // Extraire le JSON du <pre> tag
    // FlareSolverr retourne: <html><body><pre>[...]</pre></body></html>
    const preMatch = cardsHtml.match(/<pre[^>]*>([\s\S]*)<\/pre>/i);
    const cardsJson = preMatch ? preMatch[1] : cardsHtml;
    
    const cards = JSON.parse(cardsJson);
    
    // Télécharger aussi les métadonnées
    let meta = null;
    try {
      const metaHtml = await client.get(META_URL);
      const metaPreMatch = metaHtml.match(/<pre[^>]*>([\s\S]*)<\/pre>/i);
      const metaJson = metaPreMatch ? metaPreMatch[1] : metaHtml;
      meta = JSON.parse(metaJson);
      metaCache = { data: meta, timestamp: Date.now() };
    } catch (metaError) {
      logger.warn(`[One Piece] Failed to load meta: ${metaError.message}`);
    }
    
    // Enrichir les cartes avec les métadonnées
    const enrichedCards = enrichCardsWithMeta(cards, meta);
    
    // Mettre en cache
    cardsCache = { data: enrichedCards, timestamp: Date.now() };
    
    logger.info(`[One Piece] ${enrichedCards.length} cards loaded and cached`);
    
    return enrichedCards;
    
  } catch (error) {
    logger.error(`[One Piece] Download failed: ${error.message}`);
    throw error;
  }
}

/**
 * Enrichit les cartes avec les métadonnées (types, couleurs, raretés)
 */
function enrichCardsWithMeta(cards, meta) {
  if (!meta) return cards;
  
  // Créer des maps pour recherche rapide
  const typesMap = {};
  const colorsMap = {};
  const raritiesMap = {};
  const attributesMap = {};
  const setsMap = {};
  
  if (meta.t) meta.t.forEach(t => typesMap[t.type_id] = t.name);
  if (meta.c) meta.c.forEach(c => colorsMap[c.color_id] = c.name);
  if (meta.r) meta.r.forEach(r => raritiesMap[r.rarity_id] = r.name);
  if (meta.a) meta.a.forEach(a => attributesMap[a.atk_id] = a.name);
  if (meta.s) meta.s.forEach(s => setsMap[s.src_id] = s);
  
  return cards.map(card => ({
    ...card,
    type_name: typesMap[card.t] || 'Unknown',
    color_name: colorsMap[card.col] || 'Unknown',
    rarity_name: raritiesMap[card.r] || 'Unknown',
    attribute_name: attributesMap[card.a] || 'N/A',
    set_info: setsMap[card.srcId] || null
  }));
}

/**
 * Recherche des cartes One Piece par nom
 * @param {string} query - Nom de la carte (recherche fuzzy)
 * @param {object} options - Options de filtrage
 * @returns {Promise<Array>} Cartes trouvées
 */
export async function searchOnePieceCards(query, options = {}) {
  const { max = 100, color, type, rarity, cost } = options;
  
  logger.info(`[One Piece] Searching: "${query}" (max: ${max})`);
  
  try {
    const allCards = await fetchOnePieceCards();
    
    if (!query || query.trim() === '') {
      // Retourner toutes les cartes (avec filtres optionnels)
      let filtered = allCards;
      
      if (color) filtered = filtered.filter(c => c.color_name?.toLowerCase() === color.toLowerCase());
      if (type) filtered = filtered.filter(c => c.type_name?.toLowerCase() === type.toLowerCase());
      if (rarity) filtered = filtered.filter(c => c.rarity_name?.toLowerCase() === rarity.toLowerCase());
      if (cost !== undefined) filtered = filtered.filter(c => parseInt(c.cs) === parseInt(cost));
      
      return filtered.slice(0, max);
    }
    
    // Recherche fuzzy par nom
    const searchLower = query.toLowerCase();
    let results = allCards.filter(card => 
      card.n?.toLowerCase().includes(searchLower)
    );
    
    // Appliquer les filtres additionnels
    if (color) results = results.filter(c => c.color_name?.toLowerCase() === color.toLowerCase());
    if (type) results = results.filter(c => c.type_name?.toLowerCase() === type.toLowerCase());
    if (rarity) results = results.filter(c => c.rarity_name?.toLowerCase() === rarity.toLowerCase());
    if (cost !== undefined) results = results.filter(c => parseInt(c.cs) === parseInt(cost));
    
    logger.info(`[One Piece] Found ${results.length} results for: ${query}`);
    
    return results.slice(0, max);
    
  } catch (error) {
    logger.error(`[One Piece] Search error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupère une carte One Piece par ID
 * @param {string} cardId - ID de la carte (ex: OP01-047)
 * @param {object} options - Options
 * @returns {Promise<object|null>} Carte trouvée
 */
export async function getOnePieceCardDetails(cardId, options = {}) {
  logger.info(`[One Piece] Fetching card: ${cardId}`);
  
  try {
    const allCards = await fetchOnePieceCards();
    
    const card = allCards.find(c => c.cid === cardId);
    
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }
    
    logger.info(`[One Piece] Card fetched: ${card.n}`);
    
    return card;
    
  } catch (error) {
    logger.error(`[One Piece] Card fetch error: ${error.message}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Image proxy — Cloudflare bloque les requêtes directes aux images
// On utilise les cookies CF obtenus par FlareSolverr pour les télécharger
// ═══════════════════════════════════════════════════════════════════════════

const IMAGE_CACHE_TTL = 3600000; // 1 heure
const imageCache = new Map();

/**
 * Télécharger une image One Piece via les cookies FlareSolverr
 * @param {string} imageUrl - URL de l'image (champ iu de la carte)
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function fetchOnePieceImage(imageUrl) {
  // Vérifier le cache
  const cached = imageCache.get(imageUrl);
  if (cached && (Date.now() - cached.timestamp) < IMAGE_CACHE_TTL) {
    logger.debug(`[One Piece] Image cache hit: ${imageUrl}`);
    return { buffer: cached.buffer, contentType: cached.contentType };
  }

  logger.info(`[One Piece] Downloading image: ${imageUrl}`);

  // S'assurer qu'on a une session FlareSolverr avec des cookies valides
  const client = getFsrClient();
  await client.ensureSession('https://onepiece-cardgame.dev');

  // Construire le cookie header depuis les cookies FlareSolverr
  const cookies = client.getCookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Fetch l'image directement avec les cookies CF
  const response = await fetch(imageUrl, {
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Referer': 'https://onepiece-cardgame.dev/',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Valider que c'est bien une image (pas du HTML Cloudflare)
  if (contentType.includes('text/html') || buffer.length < 1000) {
    throw new Error('Cloudflare challenge — image non téléchargeable');
  }

  // Mettre en cache
  imageCache.set(imageUrl, { buffer, contentType, timestamp: Date.now() });

  // Nettoyage du cache si trop gros (> 200 images)
  if (imageCache.size > 200) {
    const oldest = [...imageCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 50);
    for (const [key] of oldest) imageCache.delete(key);
  }

  logger.info(`[One Piece] Image downloaded: ${buffer.length} bytes (${contentType})`);
  return { buffer, contentType };
}

/**
 * Récupérer l'URL de l'image d'une carte par son ID
 * @param {string} cardId - ID de la carte
 * @returns {Promise<string|null>} URL de l'image
 */
export async function getCardImageUrl(cardId) {
  const allCards = await fetchOnePieceCards();
  const card = allCards.find(c => c.cid === cardId);
  return card?.iu || null;
}

/**
 * Health check API One Piece
 */
export async function healthCheck() {
  try {
    const client = getFsrClient();
    // Tester avec une petite requête
    await client.get(CARDS_URL);
    
    return {
      healthy: true,
      status: 200,
      message: 'One Piece API is accessible'
    };
  } catch (error) {
    return {
      healthy: false,
      status: 0,
      message: `Connection failed: ${error.message}`
    };
  }
}
