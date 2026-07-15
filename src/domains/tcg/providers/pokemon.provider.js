/**
 * Provider Pokémon TCG
 * API: https://tcgdex.dev/
 * Documentation: https://tcgdex.dev/rest
 * 
 * Source: TCGdex (gratuit, sans clé API, multi-langues natif)
 * Langues supportées: fr, en, de, es, it, pt
 * Migration depuis pokemontcg.io (arrêté, migré vers Scrydex payant)
 */

import { logger } from '../../../shared/utils/logger.js';

const TCGDEX_API = 'https://api.tcgdex.net/v2';

// Langues supportées par TCGdex
const SUPPORTED_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt'];

function getLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : 'en';
}

/**
 * Recherche de cartes Pokémon TCG via TCGdex
 * @param {string} query - Nom de la carte à rechercher
 * @param {object} options - Options de recherche
 * @param {string} options.lang - Code langue (fr, en, de, es, it, pt)
 * @param {number} options.max - Nombre max de résultats (défaut: 20)
 * @param {number} options.page - Page de résultats (défaut: 1)
 * @param {string} options.set - Filtrer par set ID (ex: base1, swsh1)
 * @param {string} options.type - Filtrer par type (ex: Fire, Water, Grass)
 * @param {string} options.rarity - Filtrer par rareté (ex: Common, Rare)
 * @param {string} options.supertype - Filtrer par catégorie (Pokemon, Trainer, Energy)
 * @param {string} options.subtype - Filtrer par suffixe (ex: V, EX, VMAX)
 * @returns {Promise<object>} - Résultats avec pagination côté client
 */
export async function searchPokemonCards(query, options = {}) {
  const {
    lang = 'en',
    max = 20,
    page = 1,
    set = null,
    type = null,
    rarity = null,
    supertype = null,
    subtype = null
  } = options;

  const apiLang = getLang(lang);
  const params = new URLSearchParams();
  params.set('name', query);
  if (set) params.set('set', set);
  if (type) params.set('types', type);
  if (rarity) params.set('rarity', rarity);
  if (supertype) params.set('category', supertype);
  if (subtype) params.set('suffix', subtype);

  const url = `${TCGDEX_API}/${apiLang}/cards?${params.toString()}`;

  try {
    logger.info(`[Pokemon TCG] Recherche: ${query} (lang ${apiLang}, page ${page}, max ${max})`);
    
    // Fetch localized results (+ EN in parallel for image fallback if lang != en)
    const fetches = [fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Tako_Api/1.0' }
    })];
    
    const needsFallback = apiLang !== 'en';
    if (needsFallback) {
      const enUrl = `${TCGDEX_API}/en/cards?${params.toString()}`;
      fetches.push(fetch(enUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Tako_Api/1.0' }
      }));
    }
    
    const responses = await Promise.all(fetches);
    
    if (!responses[0].ok) {
      throw new Error(`TCGdex API error: ${responses[0].status} ${responses[0].statusText}`);
    }

    const allResults = await responses[0].json();
    
    // Inject EN images as fallback for cards missing localized images
    if (needsFallback && responses[1]?.ok) {
      try {
        const enResults = await responses[1].json();
        const enImageMap = new Map();
        for (const card of enResults) {
          if (card.image) enImageMap.set(card.id, card.image);
        }
        for (const card of allResults) {
          if (!card.image && enImageMap.has(card.id)) {
            card.image = enImageMap.get(card.id);
          }
        }
      } catch (e) {
        logger.warn(`[Pokemon TCG] Fallback EN images échoué: ${e.message}`);
      }
    }
    
    // TCGdex renvoie tous les résultats — pagination côté client
    const total = allResults.length;
    const start = (page - 1) * max;
    const paged = allResults.slice(start, start + max);
    
    logger.info(`[Pokemon TCG] Trouvé ${total} résultats pour: ${query} (page ${page}/${Math.ceil(total / max)})`);
    
    return {
      results: paged,
      total,
      page,
      pageSize: max,
      count: paged.length
    };
  } catch (error) {
    logger.error(`[Pokemon TCG] Erreur recherche: ${error.message}`);
    throw error;
  }
}

/**
 * Détails d'une carte Pokémon TCG via TCGdex
 * @param {string} cardId - ID unique de la carte (ex: base1-58, swsh1-25)
 * @param {object} options - Options
 * @param {string} options.lang - Code langue (défaut: en)
 * @returns {Promise<object>} - Données complètes de la carte
 */
export async function getPokemonCardDetails(cardId, options = {}) {
  const { lang = 'en' } = options;
  const apiLang = getLang(lang);
  const url = `${TCGDEX_API}/${apiLang}/cards/${encodeURIComponent(cardId)}`;

  try {
    logger.info(`[Pokemon TCG] Récupération carte: ${cardId} (lang ${apiLang})`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Tako_Api/1.0' }
    });
    
    if (!response.ok) {
      throw new Error(`TCGdex API error: ${response.status} ${response.statusText}`);
    }

    const card = await response.json();
    
    // Fallback EN si pas d'image dans la langue demandée
    if (!card.image && apiLang !== 'en') {
      try {
        const enUrl = `${TCGDEX_API}/en/cards/${encodeURIComponent(cardId)}`;
        const enResponse = await fetch(enUrl, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'Tako_Api/1.0' }
        });
        if (enResponse.ok) {
          const enCard = await enResponse.json();
          if (enCard.image) {
            card.image = enCard.image;
            logger.info(`[Pokemon TCG] Image EN fallback pour: ${cardId}`);
          }
        }
      } catch (e) {
        logger.warn(`[Pokemon TCG] Fallback EN image échoué pour ${cardId}: ${e.message}`);
      }
    }
    
    logger.info(`[Pokemon TCG] Carte récupérée: ${card.name || cardId}`);
    
    return card;
  } catch (error) {
    logger.error(`[Pokemon TCG] Erreur détails carte: ${error.message}`);
    throw error;
  }
}

/**
 * Liste des sets Pokémon TCG via TCGdex
 * @param {object} options - Options de filtrage
 * @param {string} options.lang - Code langue (défaut: en)
 * @param {number} options.max - Nombre max de résultats (défaut: 250)
 * @returns {Promise<object>} - Liste des sets
 */
export async function getPokemonSets(options = {}) {
  const { lang = 'en', max = 250 } = options;
  const apiLang = getLang(lang);
  const url = `${TCGDEX_API}/${apiLang}/sets`;

  try {
    logger.info(`[Pokemon TCG] Récupération sets (lang ${apiLang})`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Tako_Api/1.0' }
    });
    
    if (!response.ok) {
      throw new Error(`TCGdex API error: ${response.status} ${response.statusText}`);
    }

    const allSets = await response.json();
    const limited = allSets.slice(0, max);
    
    logger.info(`[Pokemon TCG] Trouvé ${allSets.length} sets`);
    
    return {
      results: limited,
      total: allSets.length,
      count: limited.length
    };
  } catch (error) {
    logger.error(`[Pokemon TCG] Erreur récupération sets: ${error.message}`);
    throw error;
  }
}

/**
 * Détails d'un set Pokémon TCG via TCGdex
 * @param {string} setId - ID du set (ex: base1, swsh1)
 * @param {object} options - Options
 * @param {string} options.lang - Code langue (défaut: en)
 * @returns {Promise<object>} - Données complètes du set
 */
export async function getPokemonSetDetails(setId, options = {}) {
  const { lang = 'en' } = options;
  const apiLang = getLang(lang);
  const url = `${TCGDEX_API}/${apiLang}/sets/${encodeURIComponent(setId)}`;

  try {
    logger.info(`[Pokemon TCG] Récupération set: ${setId} (lang ${apiLang})`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Tako_Api/1.0' }
    });
    
    if (!response.ok) {
      throw new Error(`TCGdex API error: ${response.status} ${response.statusText}`);
    }

    const set = await response.json();
    
    logger.info(`[Pokemon TCG] Set récupéré: ${set.name || setId}`);
    
    return set;
  } catch (error) {
    logger.error(`[Pokemon TCG] Erreur détails set: ${error.message}`);
    throw error;
  }
}

/**
 * Health check TCGdex API
 * @returns {Promise<object>} - Statut de l'API
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${TCGDEX_API}/en/cards?name=pikachu`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Tako_Api/1.0' }
    });
    
    return {
      healthy: response.ok,
      status: response.status,
      source: 'tcgdex',
      message: response.ok ? 'API TCGdex disponible' : `Erreur ${response.status}`
    };
  } catch (error) {
    logger.error(`[Pokemon TCG] Health check error: ${error.message}`);
    return {
      healthy: false,
      source: 'tcgdex',
      message: error.message
    };
  }
}
