/**
 * Provider Disney Lorcana (LorcanaJSON)
 * Documentation: https://lorcanajson.org/
 * GitHub: https://github.com/LorcanaJSON/LorcanaJSON
 * 
 * Source de données:
 * - https://lorcanajson.org/files/current/{lang}/allCards.json
 * 
 * Langues supportées: en, fr, de, it
 * Format: JSON statique (mise à jour régulière)
 */

import { logger } from '../../../shared/utils/logger.js';

const BASE_URL = 'https://lorcanajson.org/files/current';
const CACHE_TTL = 3600000; // 1 heure (les JSON sont statiques)

// Cache en mémoire des données par langue
const cardsCache = {
  en: { data: null, timestamp: 0 },
  fr: { data: null, timestamp: 0 },
  de: { data: null, timestamp: 0 },
  it: { data: null, timestamp: 0 }
};

/**
 * Télécharger les cartes Lorcana pour une langue donnée
 * @param {string} lang - Code langue (en, fr, de, it)
 * @returns {Promise<Object>} - Données complètes { cards, sets, metadata }
 */
async function fetchLorcanaData(lang = 'en') {
  // Vérifier le cache
  const cached = cardsCache[lang];
  if (cached.data && (Date.now() - cached.timestamp) < CACHE_TTL) {
    logger.debug(`[Lorcana] Cache hit for lang: ${lang}`);
    return cached.data;
  }
  
  const url = `${BASE_URL}/${lang}/allCards.json`;
  
  try {
    logger.info(`[Lorcana] Downloading data for lang: ${lang}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TakoAPI/1.0 (LorcanaJSON Integration)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`LorcanaJSON error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Mettre en cache
    cardsCache[lang] = {
      data,
      timestamp: Date.now()
    };
    
    logger.info(`[Lorcana] Loaded ${data.cards?.length || 0} cards for lang: ${lang}`);
    
    return data;
  } catch (error) {
    logger.error(`[Lorcana] Download failed for ${lang}: ${error.message}`);
    throw error;
  }
}

/**
 * Rechercher des cartes Lorcana
 * @param {string} query - Nom de la carte à rechercher
 * @param {Object} options - Options de recherche
 */
export async function searchLorcanaCards(query, options = {}) {
  const {
    lang = 'en',
    color,
    type,
    rarity,
    set,
    cost,
    inkable,
    max = 100,
    page = 1
  } = options;
  
  logger.info(`[Lorcana] Searching: "${query}" (lang: ${lang}, max: ${max})`);
  
  try {
    // Charger les données dans la langue demandée
    const data = await fetchLorcanaData(lang);
    const allCards = data.cards || [];
    
    // Filtrer les cartes
    let filtered = allCards;
    
    // Recherche par nom (insensible à la casse)
    if (query) {
      const searchLower = query.toLowerCase();
      filtered = filtered.filter(card => 
        card.name?.toLowerCase().includes(searchLower) ||
        card.fullName?.toLowerCase().includes(searchLower)
      );
    }
    
    // Filtres additionnels
    if (color) {
      // Mapping EN→FR pour les couleurs
      const colorMap = {
        'amber': 'Ambre',
        'amethyst': 'Améthyste',
        'emerald': 'Émeraude', 
        'ruby': 'Rubis',
        'sapphire': 'Saphir',
        'steel': 'Acier'
      };
      const targetColor = lang === 'fr' ? (colorMap[color.toLowerCase()] || color) : color;
      filtered = filtered.filter(card => card.color?.toLowerCase() === targetColor.toLowerCase());
    }
    
    if (type) {
      // Mapping EN→FR pour les types
      const typeMap = {
        'character': 'Personnage',
        'action': 'Action',
        'item': 'Objet',
        'location': 'Lieu'
      };
      const targetType = lang === 'fr' ? (typeMap[type.toLowerCase()] || type) : type;
      filtered = filtered.filter(card => card.type?.toLowerCase() === targetType.toLowerCase());
    }
    
    if (rarity) {
      filtered = filtered.filter(card => card.rarity === rarity);
    }
    
    if (set) {
      filtered = filtered.filter(card => card.setCode === set);
    }
    
    if (cost !== undefined) {
      filtered = filtered.filter(card => card.cost === cost);
    }
    
    if (inkable !== undefined) {
      filtered = filtered.filter(card => card.inkwell === inkable);
    }
    
    // Pagination
    const start = (page - 1) * max;
    const end = start + max;
    const paginated = filtered.slice(start, end);
    
    // Enrichir avec les données du set
    const sets = data.sets || {};
    const enriched = paginated.map(card => {
      const setInfo = sets[card.setCode];
      return setInfo ? { ...card, _set: setInfo } : card;
    });
    
    const result = {
      total_cards: filtered.length,
      page,
      page_size: max,
      total_pages: Math.ceil(filtered.length / max),
      data: enriched,
      metadata: data.metadata
    };
    
    logger.info(`[Lorcana] Found ${filtered.length} results (returning ${paginated.length})`);
    
    return result;
    
  } catch (error) {
    logger.error(`[Lorcana] Search error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupérer les détails d'une carte Lorcana par ID
 * @param {string} cardId - ID de la carte
 * @param {Object} options - Options { lang }
 */
export async function getLorcanaCardDetails(cardId, options = {}) {
  const { lang = 'en' } = options;
  
  logger.info(`[Lorcana] Fetching card: ${cardId} (lang: ${lang})`);
  
  try {
    const data = await fetchLorcanaData(lang);
    const allCards = data.cards || [];
    
    const card = allCards.find(c => 
      c.id === parseInt(cardId) || 
      c.code === cardId ||
      c.fullIdentifier === cardId
    );
    
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }
    
    // Enrichir avec les données du set
    const sets = data.sets || {};
    const setInfo = sets[card.setCode];
    const enriched = setInfo ? { ...card, _set: setInfo } : card;
    
    logger.info(`[Lorcana] Card fetched: ${card.fullName}`);
    
    return enriched;
    
  } catch (error) {
    logger.error(`[Lorcana] Card fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * Récupérer la liste des sets Lorcana
 * @param {Object} options - Options { lang }
 */
export async function getLorcanaSets(options = {}) {
  const { lang = 'en' } = options;
  
  logger.info(`[Lorcana] Fetching sets (lang: ${lang})`);
  
  try {
    const data = await fetchLorcanaData(lang);
    
    // data.sets est un objet {code: setData}, le convertir en tableau
    const setsObj = data.sets || {};
    const setsArray = Object.entries(setsObj).map(([code, set]) => ({
      ...set,
      code
    }));
    
    logger.info(`[Lorcana] Sets fetched: ${setsArray.length}`);
    
    return setsArray;
    
  } catch (error) {
    logger.error(`[Lorcana] Sets fetch error: ${error.message}`);
    throw error;
  }
}

/**
 * Health check API LorcanaJSON
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${BASE_URL}/en/allCards.json`, {
      method: 'HEAD',
      headers: { 'Accept': 'application/json' }
    });
    
    return {
      healthy: response.ok,
      status: response.status,
      message: response.ok ? 'LorcanaJSON is accessible' : `API returned ${response.status}`
    };
  } catch (error) {
    return {
      healthy: false,
      status: 0,
      message: `Connection failed: ${error.message}`
    };
  }
}
