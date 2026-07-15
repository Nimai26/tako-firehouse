/**
 * Infrastructure - Stockage Fichiers (Filesystem)
 * 
 * Remplace MinIO par un stockage filesystem local.
 * Les fichiers sont servis directement par express.static via /files/*.
 * 
 * Structure :
 *   /data/tako-storage/
 *   ├── mega-archive/       (PDFs + images MEGA Construx)
 *   │   ├── pokemon/
 *   │   ├── halo/
 *   │   └── ...
 *   └── kreo-archive/       (images + PDFs KRE-O)
 *       ├── transformers/
 *       ├── pdfs/
 *       ├── instructions/
 *       └── ...
 * 
 * Serveur  : Louis (10.20.0.10)
 * Chemin   : /mnt/egon/websites/tako-storage/
 * URL      : https://tako.snowmanprod.fr/files/
 */

import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { env } from '../../config/env.js';
import { logger } from '../../shared/utils/logger.js';

const log = logger.create('Storage');

let storagePath = null;
let fileBaseUrl = null;
let isReady = false;

/**
 * Initialise le stockage fichiers
 * @returns {boolean} true si le dossier est accessible
 */
export function initStorage() {
  storagePath = env.storage?.path || '/data/tako-storage';
  fileBaseUrl = env.storage?.fileBaseUrl || `${env.apiBaseUrl}/files`;

  if (!existsSync(storagePath)) {
    log.warn(`⚠️ Dossier de stockage introuvable: ${storagePath}`);
    isReady = false;
    return false;
  }

  // Vérifier les sous-dossiers connus
  const expectedDirs = ['mega-archive', 'kreo-archive', 'carddass-archive'];
  const found = [];
  const missing = [];

  for (const dir of expectedDirs) {
    const fullPath = join(storagePath, dir);
    if (existsSync(fullPath)) {
      found.push(dir);
    } else {
      missing.push(dir);
    }
  }

  isReady = true;
  log.info(`✅ Stockage fichiers initialisé: ${storagePath}`);
  log.info(`   Dossiers trouvés: ${found.join(', ') || 'aucun'}`);
  if (missing.length) {
    log.warn(`   Dossiers manquants: ${missing.join(', ')}`);
  }
  log.info(`   URL de base: ${fileBaseUrl}`);

  return true;
}

/**
 * Vérifie si le stockage est prêt
 */
export function isStorageReady() {
  return isReady;
}

/**
 * Retourne le chemin absolu du dossier de stockage
 */
export function getStoragePath() {
  return storagePath;
}

/**
 * Retourne l'URL de base pour les fichiers
 */
export function getFileBaseUrl() {
  return fileBaseUrl;
}

/**
 * Construit l'URL publique d'un fichier
 * @param {string} archive - Nom de l'archive (ex: 'mega-archive', 'kreo-archive')
 * @param {string} relativePath - Chemin relatif dans l'archive (ex: 'pokemon/hnt96.pdf')
 * @returns {string|null} URL publique ou null si le fichier n'existe pas
 */
export function getFileUrl(archive, relativePath) {
  if (!isReady || !relativePath) return null;
  return `${fileBaseUrl}/${archive}/${relativePath}`;
}

/**
 * Vérifie si un fichier existe sur le disque
 * @param {string} archive - Nom de l'archive
 * @param {string} relativePath - Chemin relatif dans l'archive
 * @returns {boolean}
 */
export function fileExists(archive, relativePath) {
  if (!storagePath || !relativePath) return false;
  const fullPath = join(storagePath, archive, relativePath);
  return existsSync(fullPath);
}

/**
 * Retourne le chemin absolu d'un fichier
 * @param {string} archive - Nom de l'archive
 * @param {string} relativePath - Chemin relatif
 * @returns {string}
 */
export function getAbsolutePath(archive, relativePath) {
  return join(storagePath, archive, relativePath);
}

/**
 * Statistiques d'une archive
 * @param {string} archive - Nom de l'archive (ex: 'mega-archive')
 * @returns {Object|null} { totalFiles, totalSize, directories }
 */
export function getArchiveStats(archive) {
  if (!storagePath) return null;
  const archivePath = join(storagePath, archive);
  if (!existsSync(archivePath)) return null;

  let totalFiles = 0;
  let totalSize = 0;
  const directories = [];

  function walk(dir, depth = 0) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth === 0) directories.push(entry.name);
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          totalFiles++;
          try {
            totalSize += statSync(fullPath).size;
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  walk(archivePath);

  return {
    totalFiles,
    totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    directories
  };
}

/**
 * Formater les bytes
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
