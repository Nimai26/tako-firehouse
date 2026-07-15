/**
 * Normalizer Magic: The Gathering
 * Normalise les données de l'API Scryfall vers le format Tako_Api
 */

import { translateText } from '../../../shared/utils/translator.js';
import { logger } from '../../../shared/utils/logger.js';

/**
 * Helper pour extraire du texte ou traduction
 */
function extractText(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.translated) {
    return value.translated;
  }
  return typeof value === 'string' ? value : String(value);
}

/**
 * Normalise les résultats de recherche MTG
 */
export async function normalizeSearchResults(rawData, options = {}) {
  const { lang = 'en', autoTrad = false } = options;
  
  if (!rawData || !rawData.data || rawData.data.length === 0) {
    return [];
  }
  
  const cards = await Promise.all(rawData.data.map(async (card) => {
    // Image principale
    const thumbnail = card.image_uris?.normal || card.image_uris?.small || 
                     card.card_faces?.[0]?.image_uris?.normal || null;
    
    // Nom (localisé si disponible)
    const name = card.printed_name || card.name;
    
    // Description courte — utiliser printed_text (localisation native Scryfall) si disponible
    let description = card.printed_type_line || card.type_line || '';
    const oracleText = card.printed_text || card.oracle_text;
    if (oracleText) {
      const shortText = oracleText.substring(0, 150);
      description += ` - ${shortText}${oracleText.length > 150 ? '...' : ''}`;
    }
    
    // Traduire via Google Translate si pas de texte localisé natif
    if (autoTrad && lang !== 'en' && description && !card.printed_text) {
      try {
        const translated = await translateText(description, lang, { enabled: true, sourceLang: 'en' });
        if (translated.translated) description = translated.text;
      } catch (error) {
        logger.warn(`[MTG] Échec traduction pour ${name}`);
      }
    }
    
    return {
      id: `mtg:${card.id}`,
      type: 'tcg_card',
      source: 'mtg',
      sourceId: String(card.id),
      title: name,
      titleOriginal: null,
      description,
      year: card.released_at ? parseInt(card.released_at.split('-')[0]) : null,
      images: {
        primary: thumbnail,
        thumbnail,
        gallery: []
      },
      urls: {
        source: null,
        detail: `/api/tcg/mtg/card/${card.id}`
      },
      details: {
        collection: 'Magic: The Gathering',
        subtitle: card.type_line || null,
        set: {
          name: card.set_name || null,
          code: card.set || null,
          series: null,
          releaseDate: card.released_at || null
        },
        rarity: card.rarity || null,
        colors: card.colors || [],
        manaCost: card.mana_cost || null,
        cmc: card.cmc || 0,
        artist: card.artist || null,
        collectorNumber: card.collector_number || null,
        prices: {
          usd: card.prices?.usd || null,
          eur: card.prices?.eur || null,
          tix: card.prices?.tix || null
        }
      }
    };
  }));
  
  return cards;
}

/**
 * Normalise les détails d'une carte MTG
 */
export async function normalizeCardDetails(rawCard, options = {}) {
  const { lang = 'en', autoTrad = false } = options;
  
  if (!rawCard) {
    throw new Error('Aucune donnée de carte fournie');
  }
  
  // Images
  const images = [];
  
  // Carte simple face
  if (rawCard.image_uris) {
    images.push({
      url: rawCard.image_uris.large || rawCard.image_uris.normal || rawCard.image_uris.small,
      thumbnail: rawCard.image_uris.small || rawCard.image_uris.normal,
      caption: 'Carte',
      isMain: true
    });
  }
  
  // Carte double face
  if (rawCard.card_faces && rawCard.card_faces.length > 0) {
    rawCard.card_faces.forEach((face, idx) => {
      if (face.image_uris) {
        images.push({
          url: face.image_uris.large || face.image_uris.normal || face.image_uris.small,
          thumbnail: face.image_uris.small || face.image_uris.normal,
          caption: face.name || `Face ${idx + 1}`,
          isMain: idx === 0
        });
      }
    });
  }
  
  // Description (oracle text) — utiliser printed_text (localisation native Scryfall) si disponible
  let description = rawCard.printed_text || rawCard.oracle_text || '';
  let flavorText = rawCard.flavor_text || null;
  
  // Traduction Google Translate si pas de texte localisé natif
  if (autoTrad && lang !== 'en') {
    if (description && !rawCard.printed_text) {
      try {
        const translated = await translateText(description, lang, { enabled: true, sourceLang: 'en' });
        if (translated.translated) description = translated.text;
      } catch (error) {
        logger.warn(`[MTG] Échec traduction oracle text ${rawCard.id}`);
      }
    }
    
    if (flavorText) {
      try {
        const translated = await translateText(flavorText, lang, { enabled: true, sourceLang: 'en' });
        if (translated.translated) flavorText = translated.text;
      } catch (error) {
        // Garder la version originale
      }
    }
  }
  
  // Nom (localisé si disponible)
  const name = rawCard.printed_name || rawCard.name;
  
  // Derive primary/thumbnail from gallery
  const primaryImage = images[0]?.url || null;
  const thumbnailImage = images[0]?.thumbnail || primaryImage;

  return {
    id: `mtg:${rawCard.id}`,
    type: 'tcg_card',
    source: 'mtg',
    sourceId: String(rawCard.id),
    title: name,
    titleOriginal: null,
    description,
    year: rawCard.released_at ? parseInt(rawCard.released_at.split('-')[0]) : null,
    images: {
      primary: primaryImage,
      thumbnail: thumbnailImage,
      gallery: images
    },
    urls: {
      source: rawCard.scryfall_uri || null,
      detail: `/api/tcg/mtg/card/${rawCard.id}`
    },
    details: {
      subtitle: rawCard.type_line || null,
      flavorText,

      // Set
      set: {
        name: rawCard.set_name || null,
        code: rawCard.set || null,
        series: null,
        releaseDate: rawCard.released_at || null
      },
      setId: rawCard.set_id || null,
      setType: rawCard.set_type || null,
      setIconSvg: rawCard.set_uri || null,
      
      // Identification
      scryfallId: rawCard.id,
      oracleId: rawCard.oracle_id || null,
      multiverseIds: rawCard.multiverse_ids || [],
      mtgoId: rawCard.mtgo_id || null,
      arenaId: rawCard.arena_id || null,
      collectorNumber: rawCard.collector_number || null,
      
      // Caractéristiques
      manaCost: rawCard.mana_cost || null,
      cmc: rawCard.cmc || 0,
      typeLine: rawCard.printed_type_line || rawCard.type_line || null,
      oracleText: description || null,
      power: rawCard.power || null,
      toughness: rawCard.toughness || null,
      loyalty: rawCard.loyalty || null,
      
      // Couleurs
      colors: rawCard.colors || [],
      colorIdentity: rawCard.color_identity || [],
      colorIndicator: rawCard.color_indicator || null,
      
      // Rareté et artiste
      rarity: rawCard.rarity || null,
      artist: rawCard.artist || null,
      artistIds: rawCard.artist_ids || [],
      
      // Cartes spéciales
      cardFaces: rawCard.card_faces || null,
      layout: rawCard.layout || null,
      
      // Mots-clés
      keywords: rawCard.keywords || [],
      
      // Légalité
      legalities: rawCard.legalities || {},
      
      // Infos supplémentaires
      reserved: rawCard.reserved || false,
      foil: rawCard.foil || false,
      nonfoil: rawCard.nonfoil || true,
      oversized: rawCard.oversized || false,
      promo: rawCard.promo || false,
      reprint: rawCard.reprint || false,
      variation: rawCard.variation || false,
      digital: rawCard.digital || false,
      
      // Langue
      lang: rawCard.lang || 'en',
      printedName: rawCard.printed_name || null,
      printedTypeLine: rawCard.printed_type_line || null,
      printedText: rawCard.printed_text || null,

      // Prix
      prices: {
        usd: rawCard.prices?.usd || null,
        usdFoil: rawCard.prices?.usd_foil || null,
        usdEtched: rawCard.prices?.usd_etched || null,
        eur: rawCard.prices?.eur || null,
        eurFoil: rawCard.prices?.eur_foil || null,
        eurEtched: rawCard.prices?.eur_etched || null,
        tix: rawCard.prices?.tix || null,
        currency: 'USD/EUR',
        source: 'scryfall',
        updatedAt: new Date().toISOString()
      },

      // Liens externes
      externalLinks: {
        scryfall: rawCard.scryfall_uri || null,
        tcgplayer: rawCard.purchase_uris?.tcgplayer || null,
        cardmarket: rawCard.purchase_uris?.cardmarket || null,
        cardhoarder: rawCard.purchase_uris?.cardhoarder || null
      },

      rulings: rawCard.rulings_uri || null
    }
  };
}

/**
 * Normalise la liste des sets MTG
 */
export async function normalizeSets(rawData, options = {}) {
  const { lang = 'en' } = options;
  
  if (!rawData || !rawData.data || rawData.data.length === 0) {
    return [];
  }
  
  const results = rawData.data.map(set => {
    const year = set.released_at ? parseInt(set.released_at.split('-')[0]) : null;
    
    return {
      id: `mtg:${set.id}`,
      type: 'tcg_set',
      source: 'mtg',
      sourceId: String(set.id),
      title: set.name,
      titleOriginal: null,
      description: null,
      year,
      images: {
        primary: set.icon_svg_uri || null,
        thumbnail: set.icon_svg_uri || null,
        gallery: []
      },
      urls: {
        source: set.scryfall_uri || null,
        detail: null
      },
      details: {
        subtitle: set.set_type || null,
        code: set.code || null,
        type: set.set_type || null,
        cardCount: set.card_count || 0,
        printedSize: set.printed_size || null,
        digital: set.digital || false,
        foilOnly: set.foil_only || false,
        nonfoilOnly: set.nonfoil_only || false,
        releaseDate: set.released_at || null,
        block: set.block || null,
        blockCode: set.block_code || null,
        parentSetCode: set.parent_set_code || null,
        externalLinks: {
          scryfall: set.scryfall_uri || null,
          searchUri: set.search_uri || null
        }
      }
    };
  });
  
  return results;
}
