/**
 * Normalizer Pokémon TCG
 * Normalise les données de l'API TCGdex vers le format canonique Tako_Api (Format B)
 * Migration depuis pokemontcg.io → TCGdex (api.tcgdex.net)
 */

import { translateText } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

/**
 * Normalise les résultats de recherche Pokemon TCG (Format B)
 * Note: TCGdex search renvoie des résultats légers {id, localId, name, image}
 */
const TCGDEX_WEB = 'https://api.tcgdex.net/v2';

export async function normalizeSearchResults(rawData, options = {}) {
  const { lang = 'fr', autoTrad = false } = options;

  if (!rawData || !rawData.results || rawData.results.length === 0) {
    return [];
  }

  const apiLang = lang || 'fr';

  const results = rawData.results.map(card => {
    return {
      id: `pokemon:${card.id}`,
      type: 'tcg_card',
      source: 'pokemon',
      sourceId: String(card.id),
      title: card.name,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: card.image ? `${card.image}/high.webp` : null,
        thumbnail: card.image ? `${card.image}/low.webp` : null,
        gallery: []
      },
      urls: {
        source: `${TCGDEX_WEB}/${apiLang}/cards/${card.id}`,
        detail: `/api/tcg/pokemon/card/${card.id}`
      },
      details: {
        collection: 'Pokémon TCG',
        subtitle: null,
        set: {
          name: null,
          code: null,
          series: null,
          releaseDate: null
        },
        cardNumber: card.localId || null,
        rarity: null,
        types: [],
        hp: null,
        artist: null
      }
    };
  });

  return results;
}

/**
 * Normalise les détails d'une carte Pokemon TCG (Format B)
 * Mapping TCGdex → Format B
 */
export async function normalizeCardDetails(rawCard, options = {}) {
  const { lang = 'fr', autoTrad = false } = options;

  if (!rawCard) {
    throw new Error('Aucune donnée de carte fournie');
  }

  // Gallery images
  const gallery = [];
  if (rawCard.image) {
    gallery.push({
      url: `${rawCard.image}/high.webp`,
      thumbnail: `${rawCard.image}/low.webp`,
      caption: 'Carte',
      isMain: true
    });
  }

  // Description (capacités et attaques)
  let description = '';
  
  if (rawCard.abilities && rawCard.abilities.length > 0) {
    const abilitiesText = rawCard.abilities.map(a => {
      const abilityType = a.type || 'Capacité';
      return `**${a.name}** (${abilityType}): ${a.effect || 'Pas de description'}`;
    }).join('\n\n');
    description += abilitiesText;
  }
  
  if (rawCard.attacks && rawCard.attacks.length > 0) {
    if (description) description += '\n\n';
    const attacksText = rawCard.attacks.map(a => {
      const cost = a.cost ? a.cost.join(' ') : '';
      const damage = a.damage != null ? String(a.damage) : '';
      return `**${a.name}** ${cost ? `(${cost})` : ''}: ${a.effect || ''} ${damage ? `[${damage}]` : ''}`.trim();
    }).join('\n\n');
    description += attacksText;
  }

  // Traduction automatique si demandée et langue ≠ langue source
  // TCGdex renvoie nativement dans la langue demandée, donc traduction rarement nécessaire
  if (autoTrad && description && lang !== 'en') {
    try {
      const translated = await translateText(description, lang, { enabled: true, sourceLang: 'en' });
      if (translated.translated) description = translated.text;
    } catch (error) {
      logger.warn(`[Pokemon TCG] Échec traduction carte ${rawCard.id}`);
    }
  }

  // Flavor text (= description dans TCGdex)
  let flavorText = rawCard.description || null;
  if (autoTrad && flavorText && lang !== 'en') {
    try {
      const translated = await translateText(flavorText, lang, { enabled: true, sourceLang: 'en' });
      if (translated.translated) flavorText = translated.text;
    } catch (error) {
      // Garder la version originale
    }
  }

  // Set et année
  const setTotal = rawCard.set?.cardCount?.official || rawCard.set?.cardCount?.total || null;
  const year = null; // TCGdex card detail ne contient pas releaseDate du set

  // Prix TCGdex
  let prices = null;
  if (rawCard.pricing?.tcgplayer) {
    const tcgPrices = rawCard.pricing.tcgplayer;
    
    // Trouver le premier variant disponible pour les prix principaux
    const variantKeys = Object.keys(tcgPrices).filter(k => !['updated', 'unit'].includes(k));
    const priceVariant = tcgPrices['holofoil'] || tcgPrices['normal'] || 
                         tcgPrices['reverse-holofoil'] ||
                         (variantKeys.length > 0 ? tcgPrices[variantKeys[0]] : null);
    
    if (priceVariant) {
      prices = {
        currency: tcgPrices.unit || 'USD',
        low: priceVariant.lowPrice || null,
        mid: priceVariant.midPrice || null,
        high: priceVariant.highPrice || null,
        market: priceVariant.marketPrice || null,
        source: 'tcgplayer',
        updatedAt: tcgPrices.updated || null,
        variants: Object.fromEntries(
          variantKeys.map(variant => [variant, {
            low: tcgPrices[variant].lowPrice || null,
            mid: tcgPrices[variant].midPrice || null,
            high: tcgPrices[variant].highPrice || null,
            market: tcgPrices[variant].marketPrice || null,
            directLow: tcgPrices[variant].directLowPrice || null
          }])
        )
      };
    }
  }

  // Cardmarket prices (Europe)
  if (rawCard.pricing?.cardmarket) {
    const cm = rawCard.pricing.cardmarket;
    if (!prices) prices = {};
    prices.cardmarket = {
      currency: cm.unit || 'EUR',
      averageSellPrice: cm.avg || null,
      lowPrice: cm.low || null,
      trendPrice: cm.trend || null,
      source: 'cardmarket',
      updatedAt: cm.updated || null
    };
  }

  // Retreat cost : TCGdex donne un nombre, on reconstitue le tableau
  const retreatCost = rawCard.retreat != null 
    ? Array(rawCard.retreat).fill('Colorless') 
    : [];

  return {
    id: `pokemon:${rawCard.id}`,
    type: 'tcg_card',
    source: 'pokemon',
    sourceId: String(rawCard.id),
    title: rawCard.name,
    titleOriginal: null,
    description,
    year,
    images: {
      primary: rawCard.image ? `${rawCard.image}/high.webp` : null,
      thumbnail: rawCard.image ? `${rawCard.image}/low.webp` : null,
      gallery
    },
    urls: {
      source: `${TCGDEX_WEB}/${lang || 'fr'}/cards/${rawCard.id}`,
      detail: `/api/tcg/pokemon/card/${rawCard.id}`
    },
    details: {
      subtitle: rawCard.category || null,
      flavorText,

      // Informations du set
      set: {
        name: rawCard.set?.name || null,
        code: rawCard.set?.id || null,
        series: null, // pas disponible dans le card detail TCGdex
        releaseDate: null // pas disponible dans le card detail TCGdex
      },
      setLogo: rawCard.set?.logo || null,
      setSymbol: rawCard.set?.symbol || null,
      setTotal,
      
      // Numérotation
      number: rawCard.localId || null,
      cardNumber: rawCard.localId ? `${rawCard.localId}/${setTotal || '?'}` : null,
      
      // Caractéristiques
      supertype: rawCard.category || null, // Pokemon, Trainer, Energy
      subtypes: rawCard.suffix ? [rawCard.suffix] : [],
      types: rawCard.types || [],
      hp: rawCard.hp != null ? String(rawCard.hp) : null,
      rarity: rawCard.rarity || null,
      artist: rawCard.illustrator || null,
      stage: rawCard.stage || null,
      
      // Évolution
      evolvesFrom: rawCard.evolveFrom || null,
      evolvesTo: [],
      
      // Combat
      attacks: rawCard.attacks || [],
      abilities: rawCard.abilities || [],
      weaknesses: rawCard.weaknesses || [],
      resistances: rawCard.resistances || [],
      retreatCost,
      
      // Règles spéciales
      rules: rawCard.rules || [],
      regulationMark: rawCard.regulationMark || null,
      
      // Légalité
      legalities: rawCard.legal || {},
      
      // Identifiants
      nationalPokedexNumbers: rawCard.dexId || [],

      // Prix
      prices,

      // Liens externes
      externalLinks: {
        tcgplayer: null,
        cardmarket: null
      }
    }
  };
}

/**
 * Normalise la liste des sets Pokemon TCG (Format B)
 * TCGdex sets list: {id, name, logo, symbol?, cardCount: {total, official}}
 */
export async function normalizeSets(rawData, options = {}) {
  const { lang = 'fr', autoTrad = false } = options;

  if (!rawData || !rawData.results || rawData.results.length === 0) {
    return [];
  }

  const apiLang = lang || 'fr';

  const results = rawData.results.map(set => {
    return {
      id: `pokemon:${set.id}`,
      type: 'tcg_set',
      source: 'pokemon',
      sourceId: String(set.id),
      title: set.name,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: set.logo || null,
        thumbnail: set.symbol || set.logo || null,
        gallery: []
      },
      urls: {
        source: `${TCGDEX_WEB}/${apiLang}/sets/${set.id}`,
        detail: `/api/tcg/pokemon/sets/${set.id}`
      },
      details: {
        subtitle: null,
        total: set.cardCount?.official || set.cardCount?.total || 0,
        printedTotal: set.cardCount?.official || null,
        releaseDate: null,
        legalities: {},
        series: null
      }
    };
  });

  return results;
}

/**
 * Normalise les détails d'un set Pokemon TCG (Format B)
 * TCGdex set detail: {id, name, logo, symbol, releaseDate, serie, cardCount, cards, ...}
 */
export async function normalizeSetDetails(rawSet, options = {}) {
  const { lang = 'fr' } = options;

  if (!rawSet) {
    throw new Error('Aucune donnée de set fournie');
  }

  const year = rawSet.releaseDate ? parseInt(rawSet.releaseDate.split('-')[0]) : null;

  return {
    id: `pokemon:${rawSet.id}`,
    type: 'tcg_set',
    source: 'pokemon',
    sourceId: String(rawSet.id),
    title: rawSet.name,
    titleOriginal: null,
    description: null,
    year,
    images: {
      primary: rawSet.logo || null,
      thumbnail: rawSet.symbol || rawSet.logo || null,
      gallery: []
    },
    urls: {
      source: `${TCGDEX_WEB}/${lang || 'fr'}/sets/${rawSet.id}`,
      detail: `/api/tcg/pokemon/sets/${rawSet.id}`
    },
    details: {
      subtitle: rawSet.serie?.name || null,
      set: {
        name: rawSet.name,
        code: rawSet.id,
        series: rawSet.serie?.name || null,
        releaseDate: rawSet.releaseDate || null
      },
      total: rawSet.cardCount?.official || rawSet.cardCount?.total || 0,
      printedTotal: rawSet.cardCount?.official || null,
      releaseDate: rawSet.releaseDate || null,
      legalities: rawSet.legal || {},
      series: rawSet.serie?.name || null,
      abbreviation: rawSet.abbreviation?.official || rawSet.tcgOnline || null,
      cards: (rawSet.cards || []).map(c => ({
        id: c.id,
        name: c.name,
        localId: c.localId,
        image: c.image ? `${c.image}/low.webp` : null
      }))
    }
  };
}
