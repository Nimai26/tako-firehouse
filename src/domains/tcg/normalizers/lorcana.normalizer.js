/**
 * Normalizer Disney Lorcana
 * Transforme les réponses LorcanaJSON en format Tako API unifié
 */

import { translateText } from '../../../shared/utils/translator.js';

/**
 * Normaliser les résultats de recherche Lorcana
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
  
  // Subtitle avec version et type
  let subtitle = rawCard.type || 'Card';
  if (rawCard.version) {
    subtitle = `${rawCard.version} - ${subtitle}`;
  }
  
  // Description basique
  let description = '';
  if (rawCard.abilities) {
    description = rawCard.abilities.map(a => a.text).join(' ');
  }
  
  // Traduction si nécessaire
  if (autoTrad && lang !== 'en' && description) {
    try {
      const result = await translateText(description, lang, { enabled: true, sourceLang: 'en' });
      if (result.translated) description = result.text;
    } catch (error) {
      // Conserver la version originale
    }
  }
  
  // Image
  const imageUrl = rawCard.images?.full || rawCard.images?.thumbnail || '';
  const thumbnailUrl = rawCard.images?.thumbnail || imageUrl;
  
  const setInfo = rawCard._set || {};
  
  return {
    id: `lorcana:${rawCard.fullIdentifier || String(rawCard.id)}`,
    type: 'tcg_card',
    source: 'lorcana',
    sourceId: String(rawCard.fullIdentifier || rawCard.id),
    title: rawCard.fullName || rawCard.name,
    titleOriginal: null,
    description: `${subtitle} - ${description.substring(0, 150)}${description.length > 150 ? '...' : ''}`,
    year: extractYearFromDate(setInfo.releaseDate),
    images: {
      primary: imageUrl || null,
      thumbnail: thumbnailUrl || null,
      gallery: []
    },
    urls: {
      source: rawCard.fullIdentifier ? `https://lorcanajson.org/cards/${rawCard.fullIdentifier}` : null,
      detail: `/api/tcg/lorcana/card/${rawCard.fullIdentifier || rawCard.id}`
    },
    details: {
      collection: 'Disney Lorcana',
      subtitle,
      name: rawCard.name,
      version: rawCard.version,
      type: rawCard.type,
      subtypes: rawCard.subtypes || [],
      color: rawCard.color,
      cost: rawCard.cost,
      inkwell: rawCard.inkwell,
      rarity: rawCard.rarity,
      artist: rawCard.artistsText || null,
      cardNumber: rawCard.number || null,
      story: rawCard.story || null,
      set: {
        name: setInfo.name || null,
        code: rawCard.setCode || null,
        series: null,
        releaseDate: setInfo.releaseDate || null
      },
      // Stats spécifiques aux personnages
      ...(rawCard.strength !== undefined && { strength: rawCard.strength }),
      ...(rawCard.willpower !== undefined && { willpower: rawCard.willpower }),
      ...(rawCard.lore !== undefined && { lore: rawCard.lore })
    }
  };
}

/**
 * Normaliser les détails complets d'une carte
 */
export async function normalizeCardDetails(rawCard, options = {}) {
  const { lang = 'en', autoTrad = false } = options;
  
  // Traduction des textes
  let flavorText = rawCard.flavorText || null;
  let abilities = rawCard.abilities || [];
  
  if (autoTrad && lang !== 'en') {
    try {
      if (flavorText) {
        const r = await translateText(flavorText, lang, { enabled: true, sourceLang: 'en' });
        if (r.translated) flavorText = r.text;
      }
      if (abilities.length > 0) {
        abilities = await Promise.all(
          abilities.map(async (ability) => {
            const r = await translateText(ability.text, lang, { enabled: true, sourceLang: 'en' });
            return { ...ability, text: r.translated ? r.text : ability.text };
          })
        );
      }
    } catch (error) {
      // Conserver les versions originales
    }
  }
  
  // Images multiples si disponibles
  const images = [];
  if (rawCard.images) {
    if (rawCard.images.full) {
      images.push({
        url: rawCard.images.full,
        thumbnail: rawCard.images.thumbnail || rawCard.images.full,
        caption: 'Carte complète',
        isMain: true
      });
    }
    if (rawCard.images.foilMask && rawCard.images.foilMask !== rawCard.images.full) {
      images.push({
        url: rawCard.images.foilMask,
        thumbnail: rawCard.images.thumbnail,
        caption: 'Version foil',
        isMain: false
      });
    }
  }
  
  const setInfo = rawCard._set || {};
  
  return {
    id: `lorcana:${rawCard.fullIdentifier || String(rawCard.id)}`,
    type: 'tcg_card',
    source: 'lorcana',
    sourceId: String(rawCard.fullIdentifier || rawCard.id),
    title: rawCard.fullName || rawCard.name,
    titleOriginal: null,
    description: abilities.map(a => a.text).join('\n\n'),
    year: extractYearFromDate(setInfo.releaseDate),
    images: {
      primary: images[0]?.url || null,
      thumbnail: images[0]?.thumbnail || images[0]?.url || null,
      gallery: images
    },
    urls: {
      source: rawCard.fullIdentifier ? `https://lorcanajson.org/cards/${rawCard.fullIdentifier}` : null,
      detail: `/api/tcg/lorcana/card/${rawCard.fullIdentifier || rawCard.id}`
    },
    details: {
      subtitle: rawCard.version ? `${rawCard.version} - ${rawCard.type}` : rawCard.type,
      flavorText,

      // Informations de base
      name: rawCard.name,
      version: rawCard.version,
      fullName: rawCard.fullName,
      type: rawCard.type,
      subtypes: rawCard.subtypes || [],
      
      // Attributs de jeu
      color: rawCard.color,
      cost: rawCard.cost,
      inkwell: rawCard.inkwell,
      
      // Stats (personnages)
      ...(rawCard.strength !== undefined && { strength: rawCard.strength }),
      ...(rawCard.willpower !== undefined && { willpower: rawCard.willpower }),
      ...(rawCard.lore !== undefined && { lore: rawCard.lore }),
      
      // Stats (lieux)
      ...(rawCard.moveCost !== undefined && { moveCost: rawCard.moveCost }),
      
      // Abilities détaillées
      abilities: abilities.map(a => ({
        type: a.type,
        name: a.name,
        text: a.text,
        effect: a.effect
      })),
      
      // Set info
      set: {
        name: setInfo.name || null,
        code: rawCard.setCode || null,
        series: null,
        releaseDate: setInfo.releaseDate || null
      },
      cardNumber: rawCard.number || null,
      
      // Rareté et édition
      rarity: rawCard.rarity,
      foilTypes: rawCard.foilTypes || [],
      
      // Artiste
      artist: rawCard.artistsText || null,
      
      // Identifiants
      code: rawCard.code,
      fullIdentifier: rawCard.fullIdentifier,
      
      // Franchise / Story
      story: rawCard.story || null,
      
      // Légalité
      legalities: rawCard.allowedInFormats || {},

      // Liens externes
      externalLinks: {
        lorcanajson: `https://lorcanajson.org/cards/${rawCard.fullIdentifier}`,
        ...(rawCard.externalLinks?.tcgPlayerUrl && { tcgplayer: rawCard.externalLinks.tcgPlayerUrl }),
        ...(rawCard.externalLinks?.cardmarketUrl && { cardmarket: rawCard.externalLinks.cardmarketUrl }),
        ...(rawCard.externalLinks?.cardTraderUrl && { cardTrader: rawCard.externalLinks.cardTraderUrl })
      }
    }
  };
}

/**
 * Normaliser la liste des sets
 */
export async function normalizeSets(rawData, options = {}) {
  const { lang = 'en' } = options;
  
  if (!rawData || !Array.isArray(rawData)) {
    return [];
  }
  
  return rawData.map(set => ({
    id: `lorcana:${set.code}`,
    type: 'tcg_set',
    source: 'lorcana',
    sourceId: String(set.code),
    title: set.name,
    titleOriginal: null,
    description: null,
    year: extractYearFromDate(set.releaseDate),
    images: {
      primary: set.icon || null,
      thumbnail: set.icon || null,
      gallery: []
    },
    urls: {
      source: null,
      detail: null
    },
    details: {
      subtitle: 'Set',
      code: set.code,
      name: set.name,
      releaseDate: set.releaseDate,
      total: set.total,
      icon: set.icon
    }
  }));
}

/**
 * Extraire l'année de sortie d'une carte
 */
function extractYear(card) {
  // Essayer depuis le set
  if (card.setReleaseDate) {
    return extractYearFromDate(card.setReleaseDate);
  }
  
  // Mapping manuel des sets Lorcana
  const setYears = {
    'TFC': 2023, // The First Chapter
    'ROF': 2023, // Rise of the Floodborn
    'ITI': 2024, // Into the Inklands
    'URR': 2024, // Ursula's Return
    'SHI': 2024, // Shimmering Skies
    'AZU': 2025  // Azurite Sea
  };
  
  return setYears[card.setCode] || null;
}

/**
 * Extraire l'année depuis une date
 */
function extractYearFromDate(dateString) {
  if (!dateString) return null;
  
  const match = dateString.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : null;
}
