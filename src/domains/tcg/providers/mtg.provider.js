/**
 * Provider Magic: The Gathering (Scryfall API)
 * Documentation: https://scryfall.com/docs/api
 * 
 * Endpoints:
 * - Search: https://api.scryfall.com/cards/search?q={query}
 * - Card: https://api.scryfall.com/cards/{id}
 * - Sets: https://api.scryfall.com/sets
 * 
 * Rate Limit: 10 requests/second (pas de clé requise)
 * Délai recommandé: 100ms entre requêtes
 */

import { logger } from '../../../shared/utils/logger.js';

const BASE_URL = 'https://api.scryfall.com';
const RATE_LIMIT_DELAY = 100; // 100ms entre requêtes
let lastRequestTime = 0;

/**
 * Attendre pour respecter la rate limit
 */
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Faire une requête à l'API Scryfall
 */
async function scryfallRequest(endpoint, options = {}) {
  await waitForRateLimit();
  
  const url = `${BASE_URL}${endpoint}`;
  
  try {
    logger.debug(`[MTG] Request: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TakoAPI/1.0 (Scryfall Integration)'
      },
      ...options
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Scryfall API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error(`[MTG] Request failed: ${error.message}`);
    throw error;
  }
}

/**
 * Rechercher des cartes Magic
 * @param {string} query - Recherche (nom ou syntaxe Scryfall)
 * @param {Object} options - Options de recherche
 * @param {string} options.lang - Code langue (en, fr, es, de, it, pt, ja, ko, ru, zh-Hans, zh-Hant)
 * @param {number} options.max - Nombre maximum de résultats
 * @param {string} options.order - Ordre de tri (name, set, released, rarity, color, usd, tix, eur, cmc, power, toughness, edhrec, penny, artist, review)
 * @param {string} options.unique - Mode unicité (cards, art, prints)
 * @param {string} options.dir - Direction tri (auto, asc, desc)
 */
export async function searchMTGCards(query, options = {}) {
  const {
    lang = 'en',
    max = 20,
    order = 'name',
    unique = 'cards',
    dir = 'auto'
  } = options;
  
  logger.info(`[MTG] Searching: ${query} (max ${max}, lang ${lang})`);
  
  try {
    // Construire la requête Scryfall
    // Si la query ne contient pas d'opérateurs, chercher dans le nom
    let searchQuery = query.includes(':') ? query : `name:${query}`;
    
    // Ajouter le filtre de langue si différent de 'any'
    if (lang && lang !== 'any') {
      searchQuery += ` lang:${lang}`;
    }
    
    const params = new URLSearchParams({
      q: searchQuery,
      unique: unique,
      order: order,
      dir: dir,
      page: 1
    });
    
    const data = await scryfallRequest(`/cards/search?${params}`);
    
    // Limiter les résultats
    const cards = data.data ? data.data.slice(0, max) : [];
    
    const result = {
      total_cards: data.total_cards || 0,
      has_more: data.has_more || false,
      data: cards
    };
    
    logger.info(`[MTG] Found ${cards.length} results for: ${query}`);
    
    return result;
    
  } catch (error) {
    logger.error(`[MTG] Search error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupérer les détails d'une carte Magic par ID
 * @param {string} cardId - ID Scryfall de la carte (UUID ou set/collector_number)
 * @param {Object} options - Options
 * @param {string} options.lang - Code langue
 */
export async function getMTGCardDetails(cardId, options = {}) {
  const { lang = 'en' } = options;
  
  logger.info(`[MTG] Fetching card: ${cardId} (lang: ${lang})`);
  
  try {
    // Récupérer la carte avec la langue spécifiée
    let endpoint;
    
    if (cardId.includes('/')) {
      // Format set/collector_number - ajouter la langue
      endpoint = `/cards/${cardId}/${lang}`;
    } else {
      // Format ID Scryfall
      endpoint = `/cards/${cardId}`;
    }
    
    let card;
    try {
      card = await scryfallRequest(endpoint);
    } catch (error) {
      // Si la carte n'existe pas dans cette langue, fallback vers EN
      if (error.message.includes('404') && lang !== 'en') {
        logger.warn(`[MTG] Card ${cardId} not available in ${lang}, falling back to EN`);
        const fallbackEndpoint = cardId.includes('/') 
          ? `/cards/${cardId}/en` 
          : `/cards/${cardId}`;
        card = await scryfallRequest(fallbackEndpoint);
      } else {
        throw error;
      }
    }
    
    logger.info(`[MTG] Card fetched: ${card.name}`);
    
    return card;
    
  } catch (error) {
    logger.error(`[MTG] Card fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupérer la liste des sets Magic
 * @param {Object} options - Options de filtrage
 */
export async function getMTGSets(options = {}) {
  logger.info(`[MTG] Fetching sets`);
  
  try {
    const data = await scryfallRequest('/sets');
    
    logger.info(`[MTG] Sets fetched: ${data.data?.length || 0} sets`);
    
    return data;
    
  } catch (error) {
    logger.error(`[MTG] Sets fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * Health check API Scryfall
 */
export async function healthCheck() {
  try {
    // Tester avec une carte aléatoire
    const response = await fetch(`${BASE_URL}/cards/random`, {
      headers: { 'Accept': 'application/json' }
    });
    
    return {
      healthy: response.ok,
      status: response.status,
      message: response.ok ? 'Scryfall API is accessible' : `API returned ${response.status}`
    };
  } catch (error) {
    return {
      healthy: false,
      status: 0,
      message: `Connection failed: ${error.message}`
    };
  }
}
