/**
 * MyFigureCollection Normalizer
 *
 * Normalise les données MFC vers le Format canonique B.
 *
 * @module domains/collectibles/normalizers/myfigurecollection
 */

/**
 * Normalise un item de recherche MFC vers le Format B.
 * @param {object} item - {id, title, image, url}
 * @returns {object|null}
 */
export function normalizeSearchItem(item) {
  if (!item || !item.id) return null;
  const sourceId = String(item.id);
  return {
    id: `myfigurecollection:${sourceId}`,
    type: 'collectible',
    source: 'myfigurecollection',
    sourceId,
    title: item.title || '',
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: item.image || null,
      thumbnail: item.image || null,
      gallery: item.image ? [item.image] : []
    },
    urls: {
      source: item.url || `https://myfigurecollection.net/item/${sourceId}`,
      detail: `/api/collectibles/myfigurecollection/item/${sourceId}`
    },
    details: {}
  };
}

/**
 * Normalise les détails d'un item MFC vers le Format B.
 * @param {object} d - objet retourné par getMFCDetails
 * @returns {object|null}
 */
export function normalizeDetails(d) {
  if (!d || !d.id) return null;
  const sourceId = String(d.id);
  return {
    id: `myfigurecollection:${sourceId}`,
    type: 'collectible',
    source: 'myfigurecollection',
    sourceId,
    title: d.title || '',
    titleOriginal: null,
    description: d.description || null,
    year: d.year || null,
    images: {
      primary: d.image || null,
      thumbnail: d.image || null,
      gallery: d.gallery || (d.image ? [d.image] : [])
    },
    urls: {
      source: d.url || `https://myfigurecollection.net/item/${sourceId}`
    },
    details: {
      brand: d.company || null,          // fabricant → notre champ « brand » (Firehouse)
      manufacturer: d.company || null,   // alias explicite
      series: d.origin || null,          // œuvre / licence → notre champ « series »
      character: d.character || null,
      sculptor: d.artist || null,
      scale: d.scale || null,
      material: d.materials || null,
      category: d.category || null,
      price: d.price || null,
      currency: d.currency || null,
      barcode: d.barcode || null,
      rating: d.rating || null
    }
  };
}
