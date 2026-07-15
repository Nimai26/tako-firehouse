/**
 * Normalizer Dragon Ball Super Card Game
 * Normalise les données PostgreSQL vers le format Tako_Api unifié
 */

import { logger } from '../../../shared/utils/logger.js';
import { translateText } from '../../../shared/utils/translator.js';

/**
 * Normalise les résultats de recherche DBS
 */
export async function normalizeSearchResults(rawData, options = {}) {
  const { lang = 'fr', autoTrad = false } = options;

  if (!rawData || !rawData.results || rawData.results.length === 0) {
    return [];
  }

  const cards = rawData.results.map(card => normalizeCard(card));

  // Traduire les descriptions si demandé
  if (autoTrad && lang !== 'en') {
    await Promise.all(cards.map(async (card) => {
      if (card.description) {
        try {
          const translated = await translateText(card.description, lang, { enabled: true, sourceLang: 'en' });
          if (translated.translated) card.description = translated.text;
        } catch (error) {
          // Garder la version originale
        }
      }
    }));
  }

  return cards;
}

/**
 * Normalise les détails d'une carte DBS
 */
export async function normalizeCardDetails(rawCard, options = {}) {
  const { lang = 'fr', autoTrad = false } = options;

  if (!rawCard) {
    throw new Error('Aucune donnée de carte fournie');
  }

  const base = normalizeCard(rawCard);

  // Enrichir avec données complètes
  const gallery = [];
  if (rawCard.image_url) {
    gallery.push({
      url: rawCard.image_url,
      thumbnail: rawCard.image_url,
      caption: 'Front',
      type: 'front',
    });
  }
  if (rawCard.image_back_url) {
    gallery.push({
      url: rawCard.image_back_url,
      thumbnail: rawCard.image_back_url,
      caption: 'Back',
      type: 'back',
    });
  }

  const primaryImage = gallery[0]?.url || null;
  const thumbnailImage = gallery[0]?.thumbnail || primaryImage;

  // Parse JSON fields safely
  const traits = safeJsonParse(rawCard.card_traits);
  const character = safeJsonParse(rawCard.card_character);
  const era = safeJsonParse(rawCard.card_era);
  const keywords = safeJsonParse(rawCard.keywords);
  const erratas = safeJsonParse(rawCard.erratas);
  const variants = safeJsonParse(rawCard.variants);
  const backTraits = safeJsonParse(rawCard.card_back_traits);
  const backCharacter = safeJsonParse(rawCard.card_back_character);
  const backEra = safeJsonParse(rawCard.card_back_era);

  const result = {
    ...base,
    description: rawCard.card_skill_text || rawCard.card_skill || null,
    images: {
      primary: primaryImage,
      thumbnail: thumbnailImage,
      gallery,
    },
    details: {
      ...base.details,
      traits,
      character,
      era,
      keywords,
      energyCost: rawCard.card_energy_cost || null,
      comboCost: rawCard.card_combo_cost || null,
      comboPower: rawCard.card_combo_power || null,
      skillHtml: rawCard.card_skill || null,
      skillText: rawCard.card_skill_text || null,
      back: rawCard.card_back_name ? {
        name: rawCard.card_back_name,
        power: rawCard.card_back_power,
        skillHtml: rawCard.card_back_skill,
        skillText: rawCard.card_back_skill_text,
        traits: backTraits,
        character: backCharacter,
        era: backEra,
      } : null,
      bans: {
        isBanned: rawCard.is_banned || false,
        isLimited: rawCard.is_limited || false,
        limitedTo: rawCard.limited_to,
      },
      errata: {
        hasErrata: rawCard.has_errata || false,
        erratas,
      },
      variants,
      source: rawCard.source || null,
      discoveredAt: rawCard.discovered_at,
      updatedAt: rawCard.updated_at,
    },
  };

  // Traduire les textes si demandé
  if (autoTrad && lang !== 'en') {
    const fieldsToTranslate = [
      { get: () => result.description, set: (v) => { result.description = v; } },
      { get: () => result.details.skillText, set: (v) => { result.details.skillText = v; } },
      { get: () => result.details.back?.skillText, set: (v) => { if (result.details.back) result.details.back.skillText = v; } },
    ];

    await Promise.all(fieldsToTranslate.map(async ({ get, set }) => {
      const text = get();
      if (text) {
        try {
          const translated = await translateText(text, lang, { enabled: true, sourceLang: 'en' });
          if (translated.translated) set(translated.text);
        } catch (error) {
          // Garder la version originale
        }
      }
    }));
  }

  return result;
}

/**
 * Normalise les sets DBS
 */
export async function normalizeSets(rawData, options = {}) {
  if (!rawData || !rawData.sets) return [];

  return rawData.sets.map(set => ({
    id: `dbs:${set.set_code}`,
    type: 'tcg_set',
    source: 'dbs',
    sourceId: String(set.set_code),
    title: set.name,
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: null,
      thumbnail: null,
      gallery: []
    },
    urls: {
      source: null,
      detail: null
    },
    details: {
      subtitle: set.game || null,
      game: set.game,
      cardCount: set.card_count || 0,
      source: set.source,
    }
  }));
}

/**
 * Normalise un set avec ses cartes
 */
export async function normalizeSetDetails(rawData, options = {}) {
  if (!rawData) return null;

  return {
    id: `dbs:${rawData.set_code}`,
    type: 'tcg_set',
    source: 'dbs',
    sourceId: String(rawData.set_code),
    title: rawData.name,
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: null,
      thumbnail: null,
      gallery: []
    },
    urls: {
      source: null,
      detail: null
    },
    details: {
      subtitle: rawData.game || null,
      game: rawData.game,
      cardCount: rawData.card_count || 0,
      source: rawData.source,
      cards: (rawData.cards || []).map(card => normalizeCard(card)),
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeCard(card) {
  const gameLabel = card.game === 'masters' ? 'DBS Masters' : 'Fusion World';

  return {
    id: `dbs:${card.card_number}`,
    type: 'tcg_card',
    source: 'dbs',
    sourceId: String(card.card_number),
    title: card.card_name,
    titleOriginal: null,
    description: card.card_skill_text || null,
    year: null,
    images: {
      primary: card.image_url || null,
      thumbnail: card.image_url || null,
      gallery: []
    },
    urls: {
      source: null,
      detail: `/api/tcg/dbs/card/${encodeURIComponent(card.card_number)}${card.game ? `?game=${card.game}` : ''}`
    },
    details: {
      collection: `Dragon Ball Super - ${gameLabel}`,
      subtitle: [card.card_type, card.card_color].filter(Boolean).join(' · '),
      internalId: card.id,
      game: card.game,
      cardNumber: card.card_number,
      cardType: card.card_type,
      color: card.card_color,
      rarity: card.card_rarity,
      power: card.card_power,
      set: {
        name: null,
        code: card.set_code || null,
        series: card.game === 'masters' ? 'DBS Masters' : card.game === 'fusion_world' ? 'Fusion World' : null,
        releaseDate: null
      },
    },
  };
}

function safeJsonParse(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return typeof value === 'string' ? [value] : [];
  }
}
