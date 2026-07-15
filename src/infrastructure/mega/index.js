/**
 * Infrastructure - Archive Interne (MEGA + KRE-O)
 * 
 * Point d'entrée pour l'infrastructure archive :
 * - PostgreSQL (tables products / kreo_products dans tako_cache)
 * - Stockage fichiers (filesystem local via express.static)
 * 
 * Depuis v2.4.0 : le pool MEGA est unifié avec le pool principal.
 */

export {
  initMegaDatabase,
  closeMegaDatabase,
  isMegaConnected,
  megaQuery,
  megaQueryOne,
  megaQueryAll
} from './mega-database.js';

// Réexporter le stockage fichiers pour rétrocompatibilité
export {
  isStorageReady as isMegaMinIOConnected,
  getFileUrl,
  fileExists,
  getAbsolutePath,
  getArchiveStats as getBucketStats
} from '../storage/index.js';

/**
 * Initialise l'infrastructure archive (vérification tables + stockage fichiers)
 * La connexion DB est déjà gérée par connection.js
 */
export async function initMegaInfrastructure() {
  const { initMegaDatabase } = await import('./mega-database.js');
  const { initStorage } = await import('../storage/index.js');

  const dbOk = await initMegaDatabase();
  const storageOk = initStorage();

  return { db: dbOk, storage: storageOk, minio: storageOk };
}
