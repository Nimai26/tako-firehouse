/**
 * Provider Digimon Card Game (DigimonCard.io)
 * Documentation: https://digimoncard.io/api-public/
 * 
 * Endpoints:
 * - Search: https://digimoncard.io/api-public/search
 * 
 * Rate Limit: 20 req/s recommandé
 * Authentification: Aucune requise
 */

import { logger } from '../../../shared/utils/logger.js';

const BASE_URL = 'https://digimoncard.io/api-public';
const RATE_LIMIT_MS = 50; // 20 req/s
let lastRequestTime = 0;

/**
 * Appliquer le rate limiting
 */
async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Faire une requête à l'API Digimon
 */
async function digimonRequest(endpoint, params = {}) {
  await rateLimit();
  
  const queryParams = new URLSearchParams(params);
  const url = `${BASE_URL}${endpoint}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  try {
    logger.debug(`[Digimon] Request: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TakoAPI/1.0 (Digimon Integration)'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Digimon API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Gérer les erreurs dans la réponse
    if (data.error) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    logger.error(`[Digimon] Request failed: ${error.message}`);
    throw error;
  }
}

/**
 * Rechercher des cartes Digimon
 * @param {string} query - Nom de la carte à rechercher
 * @param {Object} options - Options de recherche
 * @param {string} options.type - Type (Digimon, Digi-Egg, Tamer, Option)
 * @param {string} options.color - Couleur (Red, Blue, Yellow, Green, Black, Purple, White)
 * @param {string} options.level - Niveau (2-7)
 * @param {string} options.series - Série (Digimon Card Game, Digimon Digi-Battle Card Game)
 * @param {string} options.attribute - Attribut (Vaccine, Virus, Data, Free, Variable)
 * @param {string} options.rarity - Rareté (c, u, r, sr, sec)
 * @param {string} options.stage - Stage (In-Training, Rookie, Champion, Ultimate, Mega)
 * @param {number} options.max - Nombre maximum de résultats (défaut: 100)
 */
export async function searchDigimonCards(query, options = {}) {
  const {
    type,
    color,
    level,
    series,
    attribute,
    rarity,
    stage,
    max = 100
  } = options;
  
  logger.info(`[Digimon] Searching: ${query} (series: ${series || 'all'}, max ${max})`);
  
  try {
    // Construire les paramètres de recherche
    const params = {
      n: query // n = name
    };
    
    // Filtres additionnels (series inclus seulement si explicitement demandé)
    if (series) params.series = series;
    if (type) params.type = type;
    if (color) params.color = color;
    if (level) params.level = level;
    if (attribute) params.attribute = attribute;
    if (rarity) params.rarity = rarity;
    if (stage) params.stage = stage;
    
    const data = await digimonRequest('/search', params);
    
    // Limiter les résultats
    const limitedData = Array.isArray(data) ? data.slice(0, max) : [];
    
    const result = {
      total_cards: Array.isArray(data) ? data.length : 0,
      returned: limitedData.length,
      data: limitedData
    };
    
    logger.info(`[Digimon] Found ${result.total_cards} results (returned ${result.returned}) for: ${query}`);
    
    return result;
    
  } catch (error) {
    logger.error(`[Digimon] Search error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupérer une carte Digimon par ID exact
 * @param {string} cardId - ID de la carte (ex: BT1-084)
 * @param {Object} options - Options
 */
export async function getDigimonCardDetails(cardId, options = {}) {
  logger.info(`[Digimon] Getting card details: ${cardId}`);
  
  try {
    // Rechercher par card ID exact (paramètre 'card')
    const params = { card: cardId };
    
    const data = await digimonRequest('/search', params);
    
    // L'API retourne un tableau, prendre la première carte
    const card = Array.isArray(data) && data.length > 0 ? data[0] : null;
    
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }
    
    return card;
    
  } catch (error) {
    logger.error(`[Digimon] Card details error: ${error.message}`);
    throw error;
  }
}

/**
 * Health check API Digimon
 */
export async function healthCheck() {
  try {
    // Tester avec une recherche simple
    const response = await fetch(`${BASE_URL}/search?n=Agumon`, {
      headers: { 'Accept': 'application/json' }
    });
    
    return {
      healthy: response.ok,
      status: response.status,
      message: response.ok ? 'Digimon API is accessible' : `API returned ${response.status}`
    };
  } catch (error) {
    return {
      healthy: false,
      status: 0,
      message: `Connection failed: ${error.message}`
    };
  }
}
