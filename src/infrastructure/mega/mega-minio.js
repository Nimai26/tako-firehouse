/**
 * Infrastructure - MEGA MinIO Client
 * 
 * Client MinIO pour générer des URLs présignées vers les PDFs
 * et images archivés des produits MEGA Construx.
 * 
 * Serveur  : Louis (10.20.0.10:9000)
 * Bucket   : mega-pdfs
 * Structure: mega-pdfs/{category}/{sku}.pdf
 *            mega-pdfs/{category}/{sku}.jpg
 */

import * as Minio from 'minio';
import { env } from '../../config/env.js';
import { logger } from '../../shared/utils/logger.js';

const log = logger.create('MegaMinIO');

let client = null;
let isConnected = false;
let bucketName = 'mega-pdfs';

// Durée par défaut des URLs présignées (1 heure)
const DEFAULT_EXPIRY = 3600;

/**
 * Initialise le client MinIO pour MEGA
 */
export async function initMegaMinIO() {
  const minioConfig = env.mega?.minio;

  if (!minioConfig?.endpoint || !minioConfig?.accessKey) {
    log.warn('⚠️ MEGA MinIO non configuré (MEGA_MINIO_ENDPOINT manquant)');
    return false;
  }

  try {
    client = new Minio.Client({
      endPoint: minioConfig.endpoint,
      port: minioConfig.port || 9000,
      useSSL: minioConfig.useSSL || false,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey
    });

    bucketName = minioConfig.bucket || 'mega-pdfs';

    // Test de connexion : vérifier que le bucket existe
    const exists = await client.bucketExists(bucketName);
    if (!exists) {
      throw new Error(`Bucket "${bucketName}" n'existe pas`);
    }

    isConnected = true;
    log.info(`✅ MEGA MinIO connecté (bucket: ${bucketName})`);
    log.info(`   Endpoint: ${minioConfig.endpoint}:${minioConfig.port}`);

    return true;
  } catch (err) {
    log.error(`❌ MEGA MinIO connexion échouée: ${err.message}`);
    isConnected = false;
    return false;
  }
}

/**
 * Vérifie si MinIO MEGA est connecté
 */
export function isMegaMinIOConnected() {
  return isConnected;
}

/**
 * Génère une URL présignée pour un fichier
 * @param {string} objectPath - Chemin dans le bucket (ex: "halo/hnc57.pdf")
 * @param {number} [expiry=3600] - Durée de validité en secondes
 * @returns {Promise<string>} URL présignée
 */
export async function getPresignedUrl(objectPath, expiry = DEFAULT_EXPIRY) {
  if (!client || !isConnected) {
    return null;
  }

  try {
    return await client.presignedGetObject(bucketName, objectPath, expiry);
  } catch (err) {
    log.debug(`Erreur URL présignée pour ${objectPath}: ${err.message}`);
    return null;
  }
}

/**
 * Génère les URLs présignées pour un produit (PDF + image)
 * @param {string} category - Catégorie du produit (ex: "halo")
 * @param {string} sku - SKU en minuscules (ex: "hnc57")
 * @returns {Promise<Object>} { pdfUrl, imageUrl }
 */
export async function getProductUrls(category, sku) {
  if (!client || !isConnected) {
    return { pdfUrl: null, imageUrl: null };
  }

  const skuLower = sku.toLowerCase();
  const pdfPath = `${category}/${skuLower}.pdf`;
  const imagePath = `${category}/${skuLower}.jpg`;

  const [pdfUrl, imageUrl] = await Promise.all([
    getPresignedUrl(pdfPath).catch(() => null),
    getPresignedUrl(imagePath).catch(() => null)
  ]);

  return { pdfUrl, imageUrl };
}

/**
 * Liste les fichiers dans une catégorie
 * @param {string} category - Catégorie (ex: "pokemon")
 * @returns {Promise<string[]>} Liste des noms de fichiers
 */
export async function listCategoryFiles(category) {
  if (!client || !isConnected) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const files = [];
    const stream = client.listObjects(bucketName, `${category}/`, true);
    
    stream.on('data', (obj) => {
      if (obj.name) files.push(obj.name);
    });
    stream.on('end', () => resolve(files));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Statistiques du bucket
 * @returns {Promise<Object>} { totalObjects, totalSize, categories }
 */
export async function getBucketStats() {
  if (!client || !isConnected) {
    return null;
  }

  return new Promise((resolve, reject) => {
    let totalObjects = 0;
    let totalSize = 0;
    const categories = new Set();

    const stream = client.listObjects(bucketName, '', true);
    
    stream.on('data', (obj) => {
      if (obj.name) {
        totalObjects++;
        totalSize += obj.size || 0;
        const cat = obj.name.split('/')[0];
        if (cat) categories.add(cat);
      }
    });
    stream.on('end', () => resolve({
      totalObjects,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      categories: [...categories]
    }));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Récupère un objet MinIO en stream (pour proxy)
 * @param {string} objectPath - Chemin dans le bucket (ex: "pokemon/hnt96.pdf")
 * @returns {Promise<{stream: ReadableStream, stat: Object}>} Stream + métadonnées
 */
export async function getObjectStream(objectPath) {
  if (!client || !isConnected) {
    throw new Error('MinIO non connecté');
  }

  const stat = await client.statObject(bucketName, objectPath);
  const stream = await client.getObject(bucketName, objectPath);

  return { stream, stat };
}

/**
 * Récupère un objet dans un bucket spécifique (pour KRE-O et autres)
 * @param {string} bucket - Nom du bucket (ex: "kreo-archive")
 * @param {string} objectPath - Chemin dans le bucket (ex: "transformers/a2225.jpg")
 * @returns {Promise<{stream: ReadableStream, stat: Object}>} Stream + métadonnées
 */
export async function getObjectStreamFromBucket(bucket, objectPath) {
  if (!client || !isConnected) {
    throw new Error('MinIO non connecté');
  }

  const stat = await client.statObject(bucket, objectPath);
  const stream = await client.getObject(bucket, objectPath);

  return { stream, stat };
}

/**
 * Génère une URL présignée pour un fichier dans un bucket spécifique
 * @param {string} bucket - Nom du bucket
 * @param {string} objectPath - Chemin dans le bucket
 * @param {number} [expiry=3600] - Durée de validité en secondes
 * @returns {Promise<string>} URL présignée
 */
export async function getPresignedUrlFromBucket(bucket, objectPath, expiry = DEFAULT_EXPIRY) {
  if (!client || !isConnected) {
    return null;
  }

  try {
    return await client.presignedGetObject(bucket, objectPath, expiry);
  } catch (err) {
    log.debug(`Erreur URL présignée pour ${bucket}/${objectPath}: ${err.message}`);
    return null;
  }
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
