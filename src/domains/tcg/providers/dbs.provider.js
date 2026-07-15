/**
 * Provider Dragon Ball Super Card Game
 * Source: PostgreSQL local (données DeckPlanet API + Bandai Official)
 * Couvre: DBS Masters + Fusion World
 * 
 * Tables: dbs_cards, dbs_sets
 */

import pg from 'pg';
import { logger } from '../../../shared/utils/logger.js';
import { cache as cacheConfig } from '../../../config/cache.js';

const DB_CONFIG = {
  host: cacheConfig.database.host,
  port: cacheConfig.database.port,
  database: cacheConfig.database.name,
  user: cacheConfig.database.user,
  password: cacheConfig.database.password,
  max: 5,
};

let pool = null;

function getPool() {
  if (!pool) {
    pool = new pg.Pool(DB_CONFIG);
    pool.on('error', (err) => {
      logger.error(`[DBS TCG] Pool error: ${err.message}`);
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const client = await getPool().connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Recherche de cartes DBS
 * @param {string} searchQuery - Texte de recherche
 * @param {object} options - Options de recherche
 * @param {string} options.game - 'masters', 'fusion_world', ou null pour les deux
 * @param {string} options.color - Filtre par couleur
 * @param {string} options.type - Filtre par type (LEADER, BATTLE, EXTRA, etc.)
 * @param {string} options.rarity - Filtre par rareté
 * @param {string} options.set - Filtre par set_code
 * @param {number} options.max - Max résultats (défaut 20)
 * @param {number} options.page - Page (défaut 1)
 * @returns {Promise<object>}
 */
export async function searchDBSCards(searchQuery, options = {}) {
  const {
    game = null,
    color = null,
    type = null,
    rarity = null,
    set = null,
    max = 20,
    page = 1,
  } = options;

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  // Full-text search
  if (searchQuery && searchQuery.trim()) {
    conditions.push(`(
      to_tsvector('english', COALESCE(card_name, '') || ' ' || COALESCE(card_number, '') || ' ' || COALESCE(card_type, '') || ' ' || COALESCE(card_color, ''))
      @@ plainto_tsquery('english', $${paramIdx})
      OR card_name ILIKE $${paramIdx + 1}
      OR card_number ILIKE $${paramIdx + 1}
    )`);
    params.push(searchQuery, `%${searchQuery}%`);
    paramIdx += 2;
  }

  // Filters
  if (game) {
    conditions.push(`game = $${paramIdx}`);
    params.push(game);
    paramIdx++;
  }
  if (color) {
    conditions.push(`card_color ILIKE $${paramIdx}`);
    params.push(`%${color}%`);
    paramIdx++;
  }
  if (type) {
    conditions.push(`card_type ILIKE $${paramIdx}`);
    params.push(type);
    paramIdx++;
  }
  if (rarity) {
    conditions.push(`card_rarity ILIKE $${paramIdx}`);
    params.push(`%${rarity}%`);
    paramIdx++;
  }
  if (set) {
    conditions.push(`set_code = $${paramIdx}`);
    params.push(set);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * max;

  try {
    logger.info(`[DBS TCG] Recherche: "${searchQuery}" (game=${game}, page=${page})`);

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM dbs_cards ${where}`, params),
      query(
        `SELECT * FROM dbs_cards ${where} ORDER BY card_number ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, max, offset]
      ),
    ]);

    const total = parseInt(countRes.rows[0].total);

    logger.info(`[DBS TCG] Trouvé ${dataRes.rows.length} résultats (total: ${total})`);

    return {
      results: dataRes.rows,
      total,
      page,
      limit: max,
      count: dataRes.rows.length,
    };
  } catch (error) {
    logger.error(`[DBS TCG] Erreur recherche: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// CARD DETAILS
// ============================================================================

/**
 * Détails d'une carte par ID ou card_number
 * @param {string} cardId - ID numérique ou card_number (ex: "BT1-001")
 * @param {object} options
 * @param {string} options.game - 'masters' ou 'fusion_world'
 * @returns {Promise<object>}
 */
export async function getDBSCardDetails(cardId, options = {}) {
  const { game = null } = options;

  try {
    logger.info(`[DBS TCG] Récupération carte: ${cardId}`);

    let result;
    const isNumeric = /^\d+$/.test(cardId);

    if (isNumeric) {
      result = await query('SELECT * FROM dbs_cards WHERE id = $1', [parseInt(cardId)]);
    } else if (game) {
      result = await query(
        'SELECT * FROM dbs_cards WHERE card_number = $1 AND game = $2',
        [cardId, game]
      );
    } else {
      // Try both games, prefer masters
      result = await query(
        'SELECT * FROM dbs_cards WHERE card_number = $1 ORDER BY game ASC',
        [cardId]
      );
    }

    if (result.rows.length === 0) {
      throw new Error(`Carte ${cardId} non trouvée`);
    }

    logger.info(`[DBS TCG] Carte récupérée: ${result.rows[0].card_name}`);

    return result.rows[0];
  } catch (error) {
    logger.error(`[DBS TCG] Erreur détails carte: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// SETS
// ============================================================================

/**
 * Liste des sets DBS
 * @param {object} options
 * @param {string} options.game - 'masters' ou 'fusion_world'
 * @returns {Promise<object>}
 */
export async function getDBSSets(options = {}) {
  const { game = null } = options;

  try {
    let result;
    if (game) {
      result = await query(
        'SELECT * FROM dbs_sets WHERE game = $1 ORDER BY set_code ASC',
        [game]
      );
    } else {
      result = await query('SELECT * FROM dbs_sets ORDER BY game ASC, set_code ASC');
    }

    logger.info(`[DBS TCG] ${result.rows.length} sets récupérés`);

    return {
      sets: result.rows,
      total: result.rows.length,
    };
  } catch (error) {
    logger.error(`[DBS TCG] Erreur sets: ${error.message}`);
    throw error;
  }
}

/**
 * Détails d'un set spécifique
 * @param {string} setCode - Code du set (ex: "BT1", "FB01")
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function getDBSSetDetails(setCode, options = {}) {
  const { game = null } = options;

  try {
    let setResult;
    if (game) {
      setResult = await query(
        'SELECT * FROM dbs_sets WHERE set_code = $1 AND game = $2',
        [setCode, game]
      );
    } else {
      setResult = await query(
        'SELECT * FROM dbs_sets WHERE set_code = $1',
        [setCode]
      );
    }

    if (setResult.rows.length === 0) {
      throw new Error(`Set ${setCode} non trouvé`);
    }

    const set = setResult.rows[0];

    // Get cards in this set
    const cardsResult = await query(
      'SELECT * FROM dbs_cards WHERE set_code = $1 AND game = $2 ORDER BY card_number ASC',
      [setCode, set.game]
    );

    return {
      ...set,
      cards: cardsResult.rows,
    };
  } catch (error) {
    logger.error(`[DBS TCG] Erreur set details: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// STATS
// ============================================================================

/**
 * Statistiques de la base DBS
 */
export async function getDBSStats() {
  try {
    const [mastersCards, fwCards, mastersSets, fwSets, byColor, byType, byRarity] = await Promise.all([
      query("SELECT COUNT(*) as c FROM dbs_cards WHERE game = 'masters'"),
      query("SELECT COUNT(*) as c FROM dbs_cards WHERE game = 'fusion_world'"),
      query("SELECT COUNT(*) as c FROM dbs_sets WHERE game = 'masters'"),
      query("SELECT COUNT(*) as c FROM dbs_sets WHERE game = 'fusion_world'"),
      query("SELECT card_color, game, COUNT(*) as count FROM dbs_cards GROUP BY card_color, game ORDER BY count DESC LIMIT 20"),
      query("SELECT card_type, game, COUNT(*) as count FROM dbs_cards GROUP BY card_type, game ORDER BY count DESC"),
      query("SELECT card_rarity, game, COUNT(*) as count FROM dbs_cards GROUP BY card_rarity, game ORDER BY count DESC LIMIT 20"),
    ]);

    return {
      masters: {
        cards: parseInt(mastersCards.rows[0].c),
        sets: parseInt(mastersSets.rows[0].c),
      },
      fusion_world: {
        cards: parseInt(fwCards.rows[0].c),
        sets: parseInt(fwSets.rows[0].c),
      },
      total: {
        cards: parseInt(mastersCards.rows[0].c) + parseInt(fwCards.rows[0].c),
        sets: parseInt(mastersSets.rows[0].c) + parseInt(fwSets.rows[0].c),
      },
      breakdown: {
        byColor: byColor.rows,
        byType: byType.rows,
        byRarity: byRarity.rows,
      },
    };
  } catch (error) {
    logger.error(`[DBS TCG] Erreur stats: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function healthCheck() {
  try {
    const result = await query('SELECT COUNT(*) as total FROM dbs_cards');
    const total = parseInt(result.rows[0].total);

    return {
      healthy: total > 0,
      provider: 'dbs',
      source: 'postgresql_local',
      games: ['masters', 'fusion_world'],
      totalCards: total,
      message: total > 0 ? `${total} cartes disponibles` : 'Base vide',
    };
  } catch (error) {
    return {
      healthy: false,
      provider: 'dbs',
      message: error.message,
    };
  }
}
