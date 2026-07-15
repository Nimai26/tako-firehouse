/**
 * Carddass Provider (Database + Filesystem)
 * 
 * Provider pour les cartes Carddass archivées depuis animecollection.fr.
 * Utilise la base de données PostgreSQL (tako_cache) + stockage fichiers (filesystem).
 * 
 * ARCHITECTURE :
 * - PostgreSQL (Louis 10.20.0.10:5434) : Catalogue de ~31 685 cartes archivées
 * - Filesystem (/data/tako-storage/carddass-archive/) : Images HD + packagings
 * 
 * TABLES :
 *   carddass_licenses  — 80 licences (Dragon Ball, Yu Yu Hakusho, etc.)
 *   carddass_collections — 336 collections
 *   carddass_series — 733 séries
 *   carddass_cards — ~31 685 cartes
 *   carddass_extra_images — ~6 386 images supplémentaires (verso, variantes)
 *   carddass_packagings — ~1 734 packagings (display boxes, dos des cartes)
 * 
 * HIÉRARCHIE :
 *   License → Collection → Série → Carte → Extra Images
 *                                        → Packagings
 * 
 * @module domains/collectibles/providers/carddass
 */

import { logger } from '../../../shared/utils/logger.js';
import {
  isMegaConnected as isDbConnected,
  megaQueryOne as queryOne,
  megaQueryAll as queryAll
} from '../../../infrastructure/mega/index.js';
import {
  isStorageReady,
  getFileUrl
} from '../../../infrastructure/storage/index.js';

const log = logger.create('CarddassProvider');

const CARDDASS_ARCHIVE = 'carddass-archive';
const ANIMECOLLECTION_BASE = 'http://www.animecollection.fr';
const DBZCOLLECTION_BASE = 'http://www.dbzcollection.fr';
const STORAGE_PREFIX = '/mnt/egon/websites/tako-storage/carddass-archive/';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Vérifie que la DB est connectée, sinon throw
 */
function ensureConnected() {
  if (!isDbConnected()) {
    throw new Error('Base de données non disponible. Vérifiez la connexion PostgreSQL.');
  }
}

/**
 * Construit l'URL publique d'une image carddass depuis un chemin absolu en BDD.
 * Les chemins en BDD sont absolus (/mnt/egon/websites/tako-storage/carddass-archive/...).
 * On extrait le chemin relatif pour le passer à getFileUrl().
 * 
 * @param {string} absolutePath - Chemin absolu stocké en BDD
 * @returns {string|null} URL publique
 */
function getImageUrl(absolutePath) {
  if (!absolutePath) return null;
  // Extraire le chemin relatif dans l'archive
  const relativePath = absolutePath.startsWith(STORAGE_PREFIX)
    ? absolutePath.substring(STORAGE_PREFIX.length)
    : absolutePath;
  return getFileUrl(CARDDASS_ARCHIVE, relativePath);
}

/**
 * Construit l'URL source originale sur animecollection.fr ou dbzcollection.fr
 * Utilisé uniquement pour les URLs de pages web (pas d'images).
 * @param {string} relativePath - Chemin relatif de l'image
 * @param {string} sourceSite - 'animecollection' ou 'dbzcollection'
 * @returns {string|null} URL source
 */
function getSourceUrl(relativePath, sourceSite = 'animecollection') {
  if (!relativePath) return null;
  const base = sourceSite === 'dbzcollection' ? DBZCOLLECTION_BASE : ANIMECOLLECTION_BASE;
  return `${base}/${relativePath}`;
}

/**
 * Résout une paire thumbnail/hd en URLs locales.
 * Toutes les images archivées sont en HD (h3000). Les thumbnails (h100) n'ont
 * pas été téléchargées — on utilise l'image HD comme fallback pour le thumbnail
 * plutôt que de renvoyer vers animecollection.fr (site source potentiellement
 * inaccessible / IP banned).
 */
function resolveImagePair(thumbPath, hdPath) {
  const hd = getImageUrl(hdPath);
  const thumbnail = getImageUrl(thumbPath) || hd;
  return { thumbnail, hd };
}

/**
 * Résout une image unique (licence, capsule, packaging…) en URL locale.
 * Fallback: null (jamais d'URL externe).
 */
function resolveImage(localPath) {
  return getImageUrl(localPath) || null;
}

// ============================================================================
// LICENSES
// ============================================================================

/**
 * Récupère toutes les licences
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.pageSize=50]
 * @returns {Promise<Object>}
 */
export async function getLicenses(options = {}) {
  ensureConnected();

  const { page = 1, pageSize = 50, site = null } = options;
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  const siteFilter = site ? ' WHERE source_site = $1' : '';
  const siteParams = site ? [site] : [];
  const limitIdx = siteParams.length + 1;

  const [countResult, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) as total FROM carddass_licenses${siteFilter}`, siteParams),
    queryAll(
      `SELECT * FROM carddass_licenses${siteFilter} ORDER BY name LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
      [...siteParams, limit, offset]
    )
  ]);

  const total = parseInt(countResult?.total || 0);

  return {
    items: rows.map(row => {
      const base = row.source_site === 'dbzcollection' ? DBZCOLLECTION_BASE : ANIMECOLLECTION_BASE;
      return {
        id: row.id,
        sourceId: row.source_id,
        sourceSite: row.source_site || 'animecollection',
        name: row.name,
        description: row.description || null,
        image: resolveImage(row.image_path),
        banner: resolveImage(row.banner_path),
        url: `${base}/cartes.php?idl=${row.source_id}`
      };
    }),
    total,
    pagination: {
      page,
      limit,
      hasMore: offset + rows.length < total
    }
  };
}

/**
 * Récupère une licence par ID
 * @param {number|string} licenseId - ID interne ou source_id
 * @returns {Promise<Object|null>}
 */
export async function getLicenseById(licenseId) {
  ensureConnected();

  const row = await queryOne(
    `SELECT l.*, 
       (SELECT COUNT(*) FROM carddass_collections c WHERE c.license_id = l.id) as collection_count,
       (SELECT COUNT(*) FROM carddass_cards ca 
        JOIN carddass_series s ON ca.series_id = s.id 
        JOIN carddass_collections c ON s.collection_id = c.id 
        WHERE c.license_id = l.id) as card_count
     FROM carddass_licenses l 
     WHERE l.id = $1 OR l.source_id = $1`,
    [licenseId]
  );

  if (!row) return null;

  const base = row.source_site === 'dbzcollection' ? DBZCOLLECTION_BASE : ANIMECOLLECTION_BASE;

  return {
    id: row.id,
    sourceId: row.source_id,
    sourceSite: row.source_site || 'animecollection',
    name: row.name,
    description: row.description || null,
    image: resolveImage(row.image_path),
    banner: resolveImage(row.banner_path),
    collectionCount: parseInt(row.collection_count || 0),
    cardCount: parseInt(row.card_count || 0),
    url: `${base}/cartes.php?idl=${row.source_id}`
  };
}

// ============================================================================
// COLLECTIONS
// ============================================================================

/**
 * Récupère les collections d'une licence
 * @param {number|string} licenseId - ID de la licence
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function getCollections(licenseId, options = {}) {
  ensureConnected();

  const { page = 1, pageSize = 50 } = options;
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  // Résoudre l'ID interne de la licence
  const license = await queryOne(
    'SELECT id, source_id, name FROM carddass_licenses WHERE id = $1 OR source_id = $1',
    [licenseId]
  );

  if (!license) {
    throw new Error(`Licence non trouvée: ${licenseId}`);
  }

  const [countResult, rows] = await Promise.all([
    queryOne(
      'SELECT COUNT(*) as total FROM carddass_collections WHERE license_id = $1',
      [license.id]
    ),
    queryAll(
      `SELECT c.*, 
         (SELECT COUNT(*) FROM carddass_series s WHERE s.collection_id = c.id) as series_count,
         (SELECT COUNT(*) FROM carddass_cards ca 
          JOIN carddass_series s ON ca.series_id = s.id 
          WHERE s.collection_id = c.id) as card_count
       FROM carddass_collections c 
       WHERE c.license_id = $1 
       ORDER BY c.name 
       LIMIT $2 OFFSET $3`,
      [license.id, limit, offset]
    )
  ]);

  const total = parseInt(countResult?.total || 0);

  return {
    license: {
      id: license.id,
      sourceId: license.source_id,
      name: license.name
    },
    items: rows.map(row => {
      const colBase = row.source_site === 'dbzcollection' ? DBZCOLLECTION_BASE : ANIMECOLLECTION_BASE;
      return {
        id: row.id,
        sourceId: row.source_id,
        sourceSite: row.source_site || 'animecollection',
        name: row.name,
        seriesCount: parseInt(row.series_count || 0),
        cardCount: parseInt(row.card_count || 0),
        url: `${colBase}/cartes.php?idl=${license.source_id}&idc=${row.source_id}`
      };
    }),
    total,
    pagination: {
      page,
      limit,
      hasMore: offset + rows.length < total
    }
  };
}

// ============================================================================
// SERIES
// ============================================================================

/**
 * Récupère les séries d'une collection
 * @param {number|string} collectionId - ID de la collection
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function getSeries(collectionId, options = {}) {
  ensureConnected();

  const { page = 1, pageSize = 50 } = options;
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  // Résoudre la collection + licence parente
  const collection = await queryOne(
    `SELECT c.id, c.source_id, c.name, c.license_id,
            l.source_id as license_source_id, l.name as license_name
     FROM carddass_collections c
     JOIN carddass_licenses l ON l.id = c.license_id
     WHERE c.id = $1 OR c.source_id = $1`,
    [collectionId]
  );

  if (!collection) {
    throw new Error(`Collection non trouvée: ${collectionId}`);
  }

  const [countResult, rows] = await Promise.all([
    queryOne(
      'SELECT COUNT(*) as total FROM carddass_series WHERE collection_id = $1',
      [collection.id]
    ),
    queryAll(
      `SELECT s.*, 
         (SELECT COUNT(*) FROM carddass_cards ca WHERE ca.series_id = s.id) as card_count,
         (SELECT COUNT(*) FROM carddass_packagings p WHERE p.series_id = s.id) as packaging_count
       FROM carddass_series s 
       WHERE s.collection_id = $1 
       ORDER BY s.name 
       LIMIT $2 OFFSET $3`,
      [collection.id, limit, offset]
    )
  ]);

  const total = parseInt(countResult?.total || 0);

  return {
    license: {
      id: collection.license_id,
      sourceId: collection.license_source_id,
      name: collection.license_name
    },
    collection: {
      id: collection.id,
      sourceId: collection.source_id,
      name: collection.name
    },
    items: rows.map(row => {
      const serBase = row.source_site === 'dbzcollection' ? DBZCOLLECTION_BASE : ANIMECOLLECTION_BASE;
      return {
        id: row.id,
        sourceId: row.source_id,
        sourceSite: row.source_site || 'animecollection',
        name: row.name,
        description: row.description || null,
        capsule: resolveImage(row.capsule_path),
        cardCount: parseInt(row.card_count || 0),
        packagingCount: parseInt(row.packaging_count || 0),
        url: `${serBase}/cartes.php?idl=${collection.license_source_id}&idc=${collection.source_id}&ids=${row.source_id}`
      };
    }),
    total,
    pagination: {
      page,
      limit,
      hasMore: offset + rows.length < total
    }
  };
}

// ============================================================================
// CARDS
// ============================================================================

/**
 * Récupère les cartes d'une série
 * @param {number|string} seriesId - ID de la série
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function getCards(seriesId, options = {}) {
  ensureConnected();

  const { page = 1, pageSize = 50, rarity = null } = options;
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  // Résoudre la série + hiérarchie
  const series = await queryOne(
    `SELECT s.id, s.source_id, s.name, s.description, s.collection_id,
            c.source_id as collection_source_id, c.name as collection_name, c.license_id,
            l.source_id as license_source_id, l.name as license_name
     FROM carddass_series s
     JOIN carddass_collections c ON c.id = s.collection_id
     JOIN carddass_licenses l ON l.id = c.license_id
     WHERE s.id = $1 OR s.source_id = $1`,
    [seriesId]
  );

  if (!series) {
    throw new Error(`Série non trouvée: ${seriesId}`);
  }

  // Construire la requête avec filtre rareté optionnel
  let countSql = 'SELECT COUNT(*) as total FROM carddass_cards WHERE series_id = $1';
  let searchSql = `SELECT * FROM carddass_cards WHERE series_id = $1`;
  const params = [series.id];

  if (rarity) {
    countSql += ' AND rarity ILIKE $2';
    searchSql += ' AND rarity ILIKE $2';
    params.push(`%${rarity}%`);
  }

  searchSql += ` ORDER BY card_number LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const countParams = rarity ? [series.id, `%${rarity}%`] : [series.id];
  const [countResult, rows] = await Promise.all([
    queryOne(countSql, countParams),
    queryAll(searchSql, params)
  ]);

  const total = parseInt(countResult?.total || 0);

  return {
    license: {
      id: series.license_id,
      sourceId: series.license_source_id,
      name: series.license_name
    },
    collection: {
      id: series.collection_id,
      sourceId: series.collection_source_id,
      name: series.collection_name
    },
    series: {
      id: series.id,
      sourceId: series.source_id,
      name: series.name,
      description: series.description || null
    },
    items: rows.map(row => enrichCard(row, series)),
    total,
    pagination: {
      page,
      limit,
      hasMore: offset + rows.length < total
    }
  };
}

/**
 * Récupère une carte par ID avec ses images supplémentaires
 * @param {number|string} cardId - ID de la carte (interne ou source_id)
 * @returns {Promise<Object|null>}
 */
export async function getCardById(cardId) {
  ensureConnected();

  const cardDetailSql = `SELECT ca.*, 
            s.source_id as series_source_id, s.name as series_name,
            c.source_id as collection_source_id, c.name as collection_name,
            l.source_id as license_source_id, l.name as license_name
     FROM carddass_cards ca
     JOIN carddass_series s ON s.id = ca.series_id
     JOIN carddass_collections c ON c.id = s.collection_id
     JOIN carddass_licenses l ON l.id = c.license_id`;

  // Priorité : chercher par clé primaire d'abord, puis par source_id en fallback
  // Évite les collisions quand un id PK d'une carte = source_id d'une autre
  let row = await queryOne(`${cardDetailSql} WHERE ca.id = $1`, [cardId]);
  if (!row) {
    row = await queryOne(`${cardDetailSql} WHERE ca.source_id = $1`, [cardId]);
  }

  if (!row) return null;

  // Récupérer les images supplémentaires
  const extraImages = await queryAll(
    `SELECT * FROM carddass_extra_images WHERE card_id = $1 ORDER BY label`,
    [row.id]
  );

  // Récupérer les packagings de la même série
  const packagings = await queryAll(
    `SELECT * FROM carddass_packagings WHERE series_id = $1 ORDER BY label`,
    [row.series_id]
  );

  const card = enrichCard(row, {
    license_source_id: row.license_source_id,
    collection_source_id: row.collection_source_id,
    source_id: row.series_source_id
  });

  return {
    ...card,
    hierarchy: {
      license: {
        id: row.license_source_id,
        name: row.license_name
      },
      collection: {
        id: row.collection_source_id,
        name: row.collection_name
      },
      series: {
        id: row.series_source_id,
        name: row.series_name
      }
    },
    extraImages: extraImages.map(img => {
      const imgs = resolveImagePair(img.image_path_thumb, img.image_path_hd);
      return {
        id: img.id,
        sourceId: img.source_id,
        label: img.label || null,
        thumbnail: imgs.thumbnail,
        hd: imgs.hd
      };
    }),
    packagings: packagings.map(pack => ({
      id: pack.id,
      sourceId: pack.source_id,
      label: pack.label || null,
      image: resolveImage(pack.image_path)
    }))
  };
}

/**
 * Récupère les images supplémentaires d'une carte
 * @param {number|string} cardId - ID de la carte
 * @returns {Promise<Object>}
 */
export async function getCardImages(cardId) {
  ensureConnected();

  const card = await queryOne(
    'SELECT id, source_id, card_number FROM carddass_cards WHERE id = $1 OR source_id = $1',
    [cardId]
  );

  if (!card) {
    throw new Error(`Carte non trouvée: ${cardId}`);
  }

  const extraImages = await queryAll(
    'SELECT * FROM carddass_extra_images WHERE card_id = $1 ORDER BY label',
    [card.id]
  );

  return {
    cardId: card.source_id,
    cardNumber: card.card_number,
    images: extraImages.map(img => {
      const imgs = resolveImagePair(img.image_path_thumb, img.image_path_hd);
      return {
        id: img.id,
        sourceId: img.source_id,
        label: img.label || null,
        thumbnail: imgs.thumbnail,
        hd: imgs.hd
      };
    }),
    total: extraImages.length
  };
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Recherche full-text dans les cartes carddass
 * @param {string} query - Terme de recherche
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.pageSize=20]
 * @param {string} [options.rarity] - Filtre par rareté
 * @param {string} [options.license] - Filtre par licence (nom)
 * @returns {Promise<Object>}
 */
export async function searchCards(query, options = {}) {
  ensureConnected();

  const { page = 1, pageSize = 20, rarity = null, license = null, site = null } = options;
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  log.debug(`Recherche carddass: "${query}" (page: ${page}, limit: ${limit}, site: ${site || 'all'})`);

  // Recherche sur license_name, collection_name, series_name, card_number, rarity
  let countSql = `
    SELECT COUNT(*) as total 
    FROM carddass_cards ca
    JOIN carddass_series s ON s.id = ca.series_id
    JOIN carddass_collections c ON c.id = s.collection_id
    JOIN carddass_licenses l ON l.id = c.license_id
    WHERE (
      ca.license_name ILIKE $1 OR ca.collection_name ILIKE $1 OR 
      ca.series_name ILIKE $1 OR ca.card_number ILIKE $1 OR
      ca.rarity ILIKE $1 OR l.name ILIKE $1 OR 
      c.name ILIKE $1 OR s.name ILIKE $1
    )`;

  let searchSql = `
    SELECT ca.*, 
           s.source_id as series_source_id, s.name as series_name_ref,
           c.source_id as collection_source_id, c.name as collection_name_ref,
           l.source_id as license_source_id, l.name as license_name_ref
    FROM carddass_cards ca
    JOIN carddass_series s ON s.id = ca.series_id
    JOIN carddass_collections c ON c.id = s.collection_id
    JOIN carddass_licenses l ON l.id = c.license_id
    WHERE (
      ca.license_name ILIKE $1 OR ca.collection_name ILIKE $1 OR 
      ca.series_name ILIKE $1 OR ca.card_number ILIKE $1 OR
      ca.rarity ILIKE $1 OR l.name ILIKE $1 OR 
      c.name ILIKE $1 OR s.name ILIKE $1
    )`;

  const params = [`%${query}%`];
  let paramIndex = 2;

  if (site) {
    const siteFilter = ` AND ca.source_site = $${paramIndex}`;
    countSql += siteFilter;
    searchSql += siteFilter;
    params.push(site);
    paramIndex++;
  }

  if (rarity) {
    const rarityFilter = ` AND ca.rarity ILIKE $${paramIndex}`;
    countSql += rarityFilter;
    searchSql += rarityFilter;
    params.push(`%${rarity}%`);
    paramIndex++;
  }

  if (license) {
    const licenseFilter = ` AND l.name ILIKE $${paramIndex}`;
    countSql += licenseFilter;
    searchSql += licenseFilter;
    params.push(`%${license}%`);
    paramIndex++;
  }

  searchSql += ` ORDER BY l.name, c.name, s.name, ca.card_number LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  
  const countParams = [...params];
  params.push(limit, offset);

  const [countResult, rows] = await Promise.all([
    queryOne(countSql, countParams),
    queryAll(searchSql, params)
  ]);

  const total = parseInt(countResult?.total || 0);

  return {
    query,
    items: rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      cardNumber: row.card_number,
      rarity: row.rarity || null,
      rarityColor: row.rarity_color || null,
      ...resolveImagePair(row.image_path_thumb, row.image_path_hd),
      license: row.license_name_ref || row.license_name,
      collection: row.collection_name_ref || row.collection_name,
      series: row.series_name_ref || row.series_name
    })),
    total,
    pagination: {
      page,
      limit,
      hasMore: offset + rows.length < total
    }
  };
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Statistiques globales de l'archive Carddass
 * @param {Object} [options]
 * @param {string} [options.site] - Filtrer par source_site ('animecollection' ou 'dbzcollection')
 * @returns {Promise<Object>}
 */
export async function getStats(options = {}) {
  ensureConnected();

  const { site = null } = options;
  const siteFilter = site ? ' WHERE source_site = $1' : '';
  const siteCardFilter = site ? ' AND ca.source_site = $1' : '';
  const siteParams = site ? [site] : [];

  const [licenses, collections, series, cards, extraImages, packagings, bySite] = await Promise.all([
    queryOne(`SELECT COUNT(*) as count FROM carddass_licenses${siteFilter}`, siteParams),
    queryOne(`SELECT COUNT(*) as count FROM carddass_collections${siteFilter}`, siteParams),
    queryOne(`SELECT COUNT(*) as count FROM carddass_series${siteFilter}`, siteParams),
    queryOne(`SELECT COUNT(*) as count FROM carddass_cards${siteFilter}`, siteParams),
    queryOne(`SELECT COUNT(*) as count FROM carddass_extra_images${siteFilter}`, siteParams),
    queryOne(`SELECT COUNT(*) as count FROM carddass_packagings${siteFilter}`, siteParams),
    queryAll('SELECT source_site, COUNT(*) as count FROM carddass_cards GROUP BY source_site ORDER BY source_site')
  ]);

  // Top raretés
  const rarities = await queryAll(
    `SELECT rarity, COUNT(*) as count 
     FROM carddass_cards 
     WHERE rarity IS NOT NULL${site ? ' AND source_site = $1' : ''}
     GROUP BY rarity 
     ORDER BY count DESC 
     LIMIT 20`,
    siteParams
  );

  // Top licences
  const topLicenses = await queryAll(
    `SELECT l.name, COUNT(ca.id) as card_count
     FROM carddass_licenses l
     JOIN carddass_collections c ON c.license_id = l.id
     JOIN carddass_series s ON s.collection_id = c.id
     JOIN carddass_cards ca ON ca.series_id = s.id
     WHERE 1=1${siteCardFilter}
     GROUP BY l.name
     ORDER BY card_count DESC
     LIMIT 10`,
    siteParams
  );

  return {
    licenses: parseInt(licenses?.count || 0),
    collections: parseInt(collections?.count || 0),
    series: parseInt(series?.count || 0),
    cards: parseInt(cards?.count || 0),
    extraImages: parseInt(extraImages?.count || 0),
    packagings: parseInt(packagings?.count || 0),
    rarities: rarities.map(r => ({ name: r.rarity, count: parseInt(r.count) })),
    topLicenses: topLicenses.map(l => ({ name: l.name, cardCount: parseInt(l.card_count) })),
    bySite: bySite.map(s => ({ site: s.source_site, cardCount: parseInt(s.count) })),
    storageReady: isStorageReady()
  };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Vérifie l'état du provider Carddass
 * @returns {Promise<Object>}
 */
export async function healthCheck() {
  const startTime = Date.now();

  const dbConnected = isDbConnected();
  const storageConnected = isStorageReady();

  if (!dbConnected) {
    return {
      status: 'unhealthy',
      provider: 'carddass',
      latency: Date.now() - startTime,
      details: {
        db: false,
        storage: storageConnected,
        message: 'Base de données non connectée'
      }
    };
  }

  try {
    // Vérifier que les tables carddass existent
    const tableCheck = await queryOne(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'carddass_%'
    `);

    const tableCount = parseInt(tableCheck?.count || 0);

    if (tableCount === 0) {
      return {
        status: 'unhealthy',
        provider: 'carddass',
        latency: Date.now() - startTime,
        details: {
          db: true,
          storage: storageConnected,
          tables: 0,
          message: 'Tables carddass non trouvées. Lancez le scraping d\'abord.'
        }
      };
    }

    const cardCount = await queryOne('SELECT COUNT(*) as count FROM carddass_cards');
    const latency = Date.now() - startTime;

    return {
      status: 'healthy',
      provider: 'carddass',
      latency,
      details: {
        db: true,
        storage: storageConnected,
        tables: tableCount,
        cards: parseInt(cardCount?.count || 0),
        source: 'database',
        message: `Archive Carddass opérationnelle (${cardCount?.count || 0} cartes)`
      }
    };
  } catch (err) {
    return {
      status: 'degraded',
      provider: 'carddass',
      latency: Date.now() - startTime,
      details: {
        db: true,
        storage: storageConnected,
        message: err.message
      }
    };
  }
}

// ============================================================================
// HELPERS INTERNES
// ============================================================================

/**
 * Enrichit une ligne carte avec les URLs d'images
 * @param {Object} row - Ligne brute de la BDD
 * @param {Object} context - Contexte hiérarchique (source_ids)
 * @returns {Object}
 */
function enrichCard(row, context) {
  return {
    id: row.id,
    sourceId: row.source_id,
    cardNumber: row.card_number,
    rarity: row.rarity || null,
    rarityColor: row.rarity_color || null,
    images: resolveImagePair(row.image_path_thumb, row.image_path_hd),
    license: row.license_name || null,
    collection: row.collection_name || null,
    series: row.series_name || null
  };
}
