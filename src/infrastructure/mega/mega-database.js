/**
 * Infrastructure - Base de données interne (ex-MEGA Archive)
 * 
 * Depuis v2.4.0 : unifié avec le pool principal (tako_cache).
 * Plus de pool séparé — ce module réexporte connection.js
 * pour maintenir la rétrocompatibilité des imports.
 * 
 * Tables concernées : products (MEGA), kreo_products (KRE-O)
 */

import { getIsConnected, query, queryOne, queryAll } from '../database/connection.js';
import { logger } from '../../shared/utils/logger.js';

const log = logger.create('InterneDB');

/**
 * Vérifie la disponibilité des tables internes via le pool principal
 */
export async function initMegaDatabase() {
  if (!getIsConnected()) {
    log.warn('⚠️ Base interne non disponible (pool principal non connecté)');
    return false;
  }

  try {
    const megaResult = await queryOne('SELECT COUNT(*) as count FROM products');
    const kreoResult = await queryOne('SELECT COUNT(*) as count FROM kreo_products');
    log.info(`✅ Base interne disponible (${megaResult?.count || 0} produits MEGA, ${kreoResult?.count || 0} produits KRE-O)`);
    return true;
  } catch (err) {
    log.warn(`⚠️ Tables internes non accessibles: ${err.message}`);
    return false;
  }
}

/**
 * Ferme le pool — no-op, géré par connection.js
 */
export async function closeMegaDatabase() {
  // La fermeture est centralisée dans connection.js
}

/**
 * Vérifie si la DB interne est connectée
 */
export function isMegaConnected() {
  return getIsConnected();
}

/**
 * Exécute une requête SQL sur les tables internes
 */
export async function megaQuery(sql, params = []) {
  return query(sql, params);
}

/**
 * Retourne une seule ligne
 */
export async function megaQueryOne(sql, params = []) {
  return queryOne(sql, params);
}

/**
 * Retourne toutes les lignes
 */
export async function megaQueryAll(sql, params = []) {
  return queryAll(sql, params);
}
