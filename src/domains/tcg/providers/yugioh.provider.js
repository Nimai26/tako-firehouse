/**
 * Provider Yu-Gi-Oh! (YGOPRODeck API)
 * Documentation: https://ygoprodeck.com/api-guide/
 * 
 * Endpoints:
 * - Card Info: https://db.ygoprodeck.com/api/v7/cardinfo.php
 * - Card Sets: https://db.ygoprodeck.com/api/v7/cardsets.php
 * 
 * Rate Limit: 20 requests/second (pas de clé requise)
 * Délai recommandé: 50ms entre requêtes
 */

import { logger } from '../../../shared/utils/logger.js';

const BASE_URL = 'https://db.ygoprodeck.com/api/v7';
const RATE_LIMIT_DELAY = 50; // 50ms entre requêtes (20 req/s)
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
 * Faire une requête à l'API YGOPRODeck
 */
async function ygoprodeckRequest(endpoint, params = {}) {
  await waitForRateLimit();
  
  const queryParams = new URLSearchParams(params);
  const url = `${BASE_URL}${endpoint}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  try {
    logger.debug(`[Yu-Gi-Oh!] Request: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TakoAPI/1.0 (YGOPRODeck Integration)'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`YGOPRODeck API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error(`[Yu-Gi-Oh!] Request failed: ${error.message}`);
    throw error;
  }
}

/**
 * Rechercher des cartes Yu-Gi-Oh!
 * @param {string} query - Nom de la carte à rechercher
 * @param {Object} options - Options de recherche
 * @param {string} options.type - Type de carte (Monster, Spell, Trap)
 * @param {string} options.race - Race/Type (Dragon, Spellcaster, etc.)
 * @param {string} options.attribute - Attribut (DARK, LIGHT, etc.)
 * @param {number} options.level - Niveau
 * @param {string} options.archetype - Archétype
 * @param {number} options.max - Nombre maximum de résultats
 * @param {string} options.sort - Tri (name, atk, def, level)
 * @param {string} options.lang - Langue (en, fr, de, it, pt)
 */
export async function searchYuGiOhCards(query, options = {}) {
  const {
    type,
    race,
    attribute,
    level,
    archetype,
    max = 20,
    sort = 'name',
    lang = 'en'
  } = options;
  
  logger.info(`[Yu-Gi-Oh!] Searching: ${query} (max ${max}, lang ${lang})`);
  
  try {
    // Construire les paramètres de recherche
    const params = {
      fname: query  // Fuzzy name search
    };
    
    // Ajouter le paramètre language pour YGOPRODeck
    // Langues supportées: en, fr, de, it, pt
    if (lang && lang !== 'en' && ['fr', 'de', 'it', 'pt'].includes(lang)) {
      params.language = lang;
    }
    
    if (type) params.type = type;
    if (race) params.race = race;
    if (attribute) params.attribute = attribute;
    if (level) params.level = level;
    if (archetype) params.archetype = archetype;
    if (sort) params.sort = sort;
    
    // YGOPRODeck renvoie 400 « No card matching » quand le nom cherché n'existe pas dans la
    // langue demandée (ex « Dark Magician » avec language=fr, dont le nom FR est « Magicien
    // Sombre »). On retente alors sur la base anglaise (complète) plutôt que d'échouer.
    let data;
    try {
      data = await ygoprodeckRequest('/cardinfo.php', params);
    } catch (err) {
      if (params.language) {
        logger.warn(`[Yu-Gi-Oh!] Recherche ${params.language} échouée, repli sur l'anglais`);
        delete params.language;
        data = await ygoprodeckRequest('/cardinfo.php', params);
      } else {
        throw err;
      }
    }

    // Limiter les résultats
    const cards = data.data ? data.data.slice(0, max) : [];
    
    const result = {
      total_cards: data.data ? data.data.length : 0,
      data: cards
    };
    
    logger.info(`[Yu-Gi-Oh!] Found ${cards.length} results for: ${query}`);
    
    return result;
    
  } catch (error) {
    logger.error(`[Yu-Gi-Oh!] Search error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupérer les détails d'une carte Yu-Gi-Oh! par ID
 * @param {string|number} cardId - ID de la carte
 * @param {Object} options - Options
 * @param {string} options.lang - Langue (en, fr, de, it, pt)
 */
export async function getYuGiOhCardDetails(cardId, options = {}) {
  const { lang = 'en' } = options;
  
  logger.info(`[Yu-Gi-Oh!] Fetching card: ${cardId} (lang ${lang})`);
  
  try {
    // Construire les paramètres
    const params = { id: cardId };
    if (lang && lang !== 'en' && ['fr', 'de', 'it', 'pt'].includes(lang)) {
      params.language = lang;
    }
    
    // Récupérer la carte par ID
    const data = await ygoprodeckRequest('/cardinfo.php', params);
    
    if (!data.data || data.data.length === 0) {
      throw new Error(`Card not found: ${cardId}`);
    }
    
    const card = data.data[0];
    
    logger.info(`[Yu-Gi-Oh!] Card fetched: ${card.name}`);
    
    return card;
    
  } catch (error) {
    logger.error(`[Yu-Gi-Oh!] Card fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupérer la liste des sets/archétypes Yu-Gi-Oh!
 * @param {Object} options - Options
 */
export async function getYuGiOhSets(options = {}) {
  logger.info(`[Yu-Gi-Oh!] Fetching sets/archetypes`);
  
  try {
    // Récupérer la liste des sets
    const data = await ygoprodeckRequest('/cardsets.php');
    
    logger.info(`[Yu-Gi-Oh!] Sets fetched: ${data?.length || 0} sets`);
    
    return data;
    
  } catch (error) {
    logger.error(`[Yu-Gi-Oh!] Sets fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * Rechercher des cartes par archétype
 * @param {string} archetype - Nom de l'archétype
 * @param {Object} options - Options
 */
export async function searchByArchetype(archetype, options = {}) {
  const { max = 20 } = options;
  
  logger.info(`[Yu-Gi-Oh!] Searching archetype: ${archetype}`);
  
  try {
    const data = await ygoprodeckRequest('/cardinfo.php', { archetype });
    
    const cards = data.data ? data.data.slice(0, max) : [];
    
    const result = {
      archetype,
      total_cards: data.data ? data.data.length : 0,
      data: cards
    };
    
    logger.info(`[Yu-Gi-Oh!] Found ${cards.length} results for archetype: ${archetype}`);
    
    return result;
    
  } catch (error) {
    logger.error(`[Yu-Gi-Oh!] Archetype search error: ${error.message}`);
    throw error;
  }
}

/**
 * Health check API YGOPRODeck
 */
export async function healthCheck() {
  try {
    // Tester avec une recherche simple
    const response = await fetch(`${BASE_URL}/cardinfo.php?fname=Dark Magician`, {
      headers: { 'Accept': 'application/json' }
    });
    
    return {
      healthy: response.ok,
      status: response.status,
      message: response.ok ? 'YGOPRODeck API is accessible' : `API returned ${response.status}`
    };
  } catch (error) {
    return {
      healthy: false,
      status: 0,
      message: `Connection failed: ${error.message}`
    };
  }
}
