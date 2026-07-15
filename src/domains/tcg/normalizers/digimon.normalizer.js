/**
 * Normalizer Digimon Card Game
 * Transforme les réponses digimoncard.io en format Tako API unifié
 */

import { translateText } from '../../../shared/utils/translator.js';
import { translateDigimonName } from '../utils/digimon-names.js';

/**
 * Normaliser les résultats de recherche Digimon
 * @param {Object} rawData - Données brutes du provider { data: [...], total_cards: number }
 * @param {Object} options - Options de normalisation
 * @param {string} options.lang - Langue cible
 * @param {boolean} options.autoTrad - Activer la traduction automatique
 */
export async function normalizeSearchResults(rawData, options = {}) {
  const { lang = 'en', autoTrad = false } = options;
  
  if (!rawData || !rawData.data || rawData.data.length === 0) {
    return [];
  }
  
  const normalizedCards = await Promise.all(
    rawData.data.map(card => normalizeCardSummary(card, { lang, autoTrad }))
  );
  
  return normalizedCards;
}

/**
 * Normaliser un résumé de carte (pour les listes)
 */
async function normalizeCardSummary(rawCard, options = {}) {
  const { lang = 'en', autoTrad = false } = options;
  
  // Subtitle avec type et level/stage
  let subtitle = rawCard.type || 'Card';
  if (rawCard.level) {
    subtitle = `Lv.${rawCard.level} ${subtitle}`;
  } else if (rawCard.stage) {
    subtitle = `${rawCard.stage} ${subtitle}`;
  }
  
  // Description basique
  let description = rawCard.main_effect || rawCard.effect || '';
  
  // Traduction si nécessaire
  if (autoTrad && lang !== 'en' && description) {
    try {
      const result = await translateText(description, lang, { enabled: true, sourceLang: 'en' });
      if (result.translated) description = result.text;
    } catch (error) {
      // Conserver la version originale
    }
  }
  
  // Image (l'API ne fournit plus image_url, on construit l'URL)
  const cardId = rawCard.id || rawCard.cardnumber;
  const imageUrl = rawCard.image_url || (cardId ? `https://images.digimoncard.io/images/cards/${cardId}.jpg` : '');

  // Traduction du nom via dictionnaire (instantané, pas d'appel API)
  const displayName = (lang !== 'en') ? translateDigimonName(rawCard.name, lang) : rawCard.name;
  const titleOriginal = displayName !== rawCard.name ? rawCard.name : null;

  return {
    id: `digimon:${rawCard.id || rawCard.cardnumber}`,
    type: 'tcg_card',
    source: 'digimon',
    sourceId: String(rawCard.id || rawCard.cardnumber),
    title: displayName,
    titleOriginal,
    description: `${subtitle} - ${description.substring(0, 150)}${description.length > 150 ? '...' : ''}`,
    year: extractYear(rawCard),
    images: {
      primary: imageUrl || null,
      thumbnail: imageUrl || null,
      gallery: []
    },
    urls: {
      source: rawCard.id ? `https://digimoncard.io/card/${rawCard.id}` : null,
      detail: `/api/tcg/digimon/card/${encodeURIComponent(rawCard.id || rawCard.cardnumber)}`
    },
    details: {
      collection: 'Digimon Card Game',
      subtitle,
      cardNumber: rawCard.id,
      type: rawCard.type,
      color: rawCard.color,
      ...(rawCard.color2 && { color2: rawCard.color2 }),
      stage: rawCard.stage,
      level: rawCard.level,
      attribute: rawCard.attribute,
      rarity: rawCard.rarity,
      // Pour les Digimon
      ...(rawCard.dp !== undefined && { dp: rawCard.dp }),
      ...(rawCard.play_cost !== undefined && { playCost: rawCard.play_cost }),
      ...(rawCard.evolution_cost !== undefined && { evolutionCost: rawCard.evolution_cost }),
      ...(rawCard.digi_type && { digiType: rawCard.digi_type }),
      ...(rawCard.form && { form: rawCard.form }),
      set: {
        name: Array.isArray(rawCard.set_name) ? rawCard.set_name[0] : (rawCard.set_name || null),
        code: (rawCard.id || '').match(/^([A-Z]+-?\d*)/)?.[1] || null,
        series: rawCard.series || null,
        releaseDate: null
      }
    }
  };
}

/**
 * Normaliser les détails complets d'une carte
 */
export async function normalizeCardDetails(rawCard, options = {}) {
  const { lang = 'en', autoTrad = false } = options;
  
  // Traduction des effets
  let mainEffect = rawCard.main_effect || rawCard.effect || '';
  let inheritedEffect = rawCard.source_effect || '';
  let securityEffect = rawCard.alt_effect || '';
  
  if (autoTrad && lang !== 'en') {
    try {
      if (mainEffect) {
        const r = await translateText(mainEffect, lang, { enabled: true, sourceLang: 'en' });
        if (r.translated) mainEffect = r.text;
      }
      if (inheritedEffect) {
        const r = await translateText(inheritedEffect, lang, { enabled: true, sourceLang: 'en' });
        if (r.translated) inheritedEffect = r.text;
      }
      if (securityEffect) {
        const r = await translateText(securityEffect, lang, { enabled: true, sourceLang: 'en' });
        if (r.translated) securityEffect = r.text;
      }
    } catch (error) {
      // Conserver les versions originales
    }
  }
  
  // Images (l'API ne fournit plus image_url, on construit l'URL)
  const cardId = rawCard.id || rawCard.cardnumber;
  const imageUrl = rawCard.image_url || (cardId ? `https://images.digimoncard.io/images/cards/${cardId}.jpg` : null);
  const images = [];
  if (imageUrl) {
    images.push({
      url: imageUrl,
      thumbnail: imageUrl,
      caption: 'Carte',
      isMain: true
    });
  }
  
  // Construire la description complète
  let fullDescription = mainEffect;
  if (inheritedEffect) {
    fullDescription += `\n\n[Inherited Effect]\n${inheritedEffect}`;
  }
  if (securityEffect) {
    fullDescription += `\n\n[Security]\n${securityEffect}`;
  }
  
  // Traduction du nom via dictionnaire (instantané, pas d'appel API)
  const displayName = (lang !== 'en') ? translateDigimonName(rawCard.name, lang) : rawCard.name;
  const titleOriginal = displayName !== rawCard.name ? rawCard.name : null;

  return {
    id: `digimon:${rawCard.id || rawCard.cardnumber}`,
    type: 'tcg_card',
    source: 'digimon',
    sourceId: String(rawCard.id || rawCard.cardnumber),
    title: displayName,
    titleOriginal,
    description: fullDescription,
    year: extractYear(rawCard),
    images: {
      primary: images[0]?.url || null,
      thumbnail: images[0]?.thumbnail || images[0]?.url || null,
      gallery: images
    },
    urls: {
      source: rawCard.id ? `https://digimoncard.io/card/${rawCard.id}` : null,
      detail: `/api/tcg/digimon/card/${encodeURIComponent(rawCard.id || rawCard.cardnumber)}`
    },
    details: {
      subtitle: buildSubtitle(rawCard),

      // Identifiants
      cardNumber: rawCard.id,
      id: rawCard.id,
      
      // Type et attributs
      type: rawCard.type,
      color: rawCard.color,
      ...(rawCard.color2 && { color2: rawCard.color2 }),
      stage: rawCard.stage,
      level: rawCard.level,
      attribute: rawCard.attribute,
      
      // Digimon spécifique
      ...(rawCard.dp !== undefined && { dp: rawCard.dp }),
      ...(rawCard.play_cost !== undefined && { playCost: rawCard.play_cost }),
      ...(rawCard.evolution_cost !== undefined && { evolutionCost: rawCard.evolution_cost }),
      ...(rawCard.evolution_level !== undefined && { evolutionLevel: rawCard.evolution_level }),
      ...(rawCard.evolution_color && { evolutionColor: rawCard.evolution_color }),
      ...(rawCard.xros_req && { xrosRequirement: rawCard.xros_req }),
      
      // Informations additionnelles
      digiType: [rawCard.digi_type, rawCard.digi_type2, rawCard.digi_type3, rawCard.digi_type4].filter(Boolean).join(' / ') || null,
      form: rawCard.form,
      
      // Effets détaillés
      mainEffect,
      ...(inheritedEffect && { inheritedEffect }),
      ...(securityEffect && { securityEffect }),
      
      // Rareté et set
      rarity: rawCard.rarity,
      set: {
        name: Array.isArray(rawCard.set_name) ? rawCard.set_name[0] : (rawCard.set_name || null),
        code: (rawCard.id || '').match(/^([A-Z]+-?\d*)/)?.[1] || null,
        series: rawCard.series || null,
        releaseDate: null
      },
      
      // Artiste
      illustrator: rawCard.artist,
      
      // TCGPlayer
      ...(rawCard.tcgplayer_id && { tcgplayerId: rawCard.tcgplayer_id }),

      // Liens externes
      externalLinks: {
        digimoncard: rawCard.id ? `https://digimoncard.io/card/${rawCard.id}` : null
      }
    }
  };
}

/**
 * Construire le subtitle avec toutes les infos pertinentes
 */
function buildSubtitle(card) {
  const parts = [];
  
  if (card.level) {
    parts.push(`Lv.${card.level}`);
  } else if (card.stage) {
    parts.push(card.stage);
  }
  
  if (card.type) {
    parts.push(card.type);
  }
  
  if (card.attribute) {
    parts.push(card.attribute);
  }
  
  return parts.join(' / ');
}

/**
 * Extraire l'année de sortie d'une carte
 */
function extractYear(card) {
  // Mapping des sets Digimon par préfixe
  const setYears = {
    'ST': 2020,  // Starter Decks
    'BT': 2020,  // Booster Sets (BT1-BT17+)
    'EX': 2021,  // Special Booster
    'P': null,   // Promo cards (variable)
    'RB': 2021,  // Release Special Booster
    'DC': 2024   // Digimon Con
  };
  
  // Extraire le préfixe du card number
  if (card.id) {
    const cardId = card.id;
    const prefix = cardId.match(/^([A-Z]+)/)?.[1];
    
    if (prefix && setYears[prefix] !== undefined) {
      return setYears[prefix];
    }
    
    // Estimation basée sur le numéro de booster (BT1=2020, +1 an tous les ~6 sets)
    if (prefix === 'BT') {
      const setNum = parseInt(cardId.match(/\d+/)?.[0]);
      if (setNum) {
        return 2020 + Math.floor(setNum / 6);
      }
    }
  }
  
  return null;
}
