/**
 * Normalizer Discogs
 * 
 * Transforme les réponses Discogs au format Tako canonique (Format B)
 * 
 * @module domains/music/normalizers/discogs
 */

const SOURCE = 'discogs';
const DOMAIN = 'music';
const BASE_DETAIL = '/api/music/discogs';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrait l'artiste principal d'un titre Discogs
 */
function extractArtistFromTitle(title) {
  if (!title) return null;
  const parts = title.split(' - ');
  return parts.length > 1 ? parts[0].trim() : null;
}

/**
 * Extrait le titre d'album d'un titre Discogs
 */
function extractAlbumFromTitle(title) {
  if (!title) return title;
  const parts = title.split(' - ');
  return parts.length > 1 ? parts.slice(1).join(' - ').trim() : title;
}

/**
 * Formate une durée "mm:ss" en secondes
 */
function parseDuration(duration) {
  if (!duration) return null;
  const parts = duration.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return null;
}

/**
 * Construit le bloc meta par défaut
 */
function buildMeta() {
  return {
    fetchedAt: new Date().toISOString(),
    lang: null,
    cached: false,
    cacheAge: null
  };
}

/**
 * Détermine le chemin detail selon le resourceType
 */
function detailPath(resourceType, id) {
  switch (resourceType) {
    case 'master':  return `${BASE_DETAIL}/masters/${id}`;
    case 'artist':  return `${BASE_DETAIL}/artists/${id}`;
    case 'label':   return `${BASE_DETAIL}/labels/${id}`;
    default:        return `${BASE_DETAIL}/releases/${id}`;
  }
}

/**
 * Construit l'URL Discogs complète depuis un URI relatif
 */
function buildDiscogsUrl(uri) {
  if (!uri) return null;
  return uri.startsWith('http') ? uri : `https://www.discogs.com${uri}`;
}

// ============================================================================
// SEARCH NORMALIZERS
// ============================================================================

/**
 * Normalise les résultats de recherche Discogs
 */
export function normalizeSearchResponse(data, query, searchType = 'release') {
  const results = (data.results || []).map((item, index) => normalizeSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.pagination?.items || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: data.pagination?.page || 1,
      limit: data.pagination?.per_page || 25,
      hasMore: (data.pagination?.page || 1) < (data.pagination?.pages || 1)
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un item de recherche → format canonique
 */
export function normalizeSearchItem(item, position = null) {
  const isArtist = item.type === 'artist';
  const isLabel = item.type === 'label';

  if (isArtist) {
    return {
      id: `${SOURCE}:${item.id}`,
      type: 'music_artist',
      source: SOURCE,
      sourceId: String(item.id),
      title: item.title,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: item.cover_image || item.thumb || null,
        thumbnail: item.thumb || item.cover_image || null,
        gallery: []
      },
      urls: {
        source: buildDiscogsUrl(item.uri),
        detail: `${BASE_DETAIL}/artists/${item.id}`
      },
      details: {
        position
      }
    };
  }

  if (isLabel) {
    return {
      id: `${SOURCE}:${item.id}`,
      type: 'music_label',
      source: SOURCE,
      sourceId: String(item.id),
      title: item.title,
      titleOriginal: null,
      description: null,
      year: null,
      images: {
        primary: item.cover_image || item.thumb || null,
        thumbnail: item.thumb || item.cover_image || null,
        gallery: []
      },
      urls: {
        source: buildDiscogsUrl(item.uri),
        detail: `${BASE_DETAIL}/labels/${item.id}`
      },
      details: {
        position
      }
    };
  }

  // Release ou Master → music_album
  const albumTitle = extractAlbumFromTitle(item.title);
  return {
    id: `${SOURCE}:${item.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(item.id),
    title: albumTitle,
    titleOriginal: null,
    description: null,
    year: item.year || null,
    images: {
      primary: item.cover_image || item.thumb || null,
      thumbnail: item.thumb || item.cover_image || null,
      gallery: item.cover_image ? [{ size: 'cover', url: item.cover_image }] : []
    },
    urls: {
      source: buildDiscogsUrl(item.uri),
      detail: detailPath(item.type, item.id)
    },
    details: {
      resourceType: item.type,
      masterId: item.master_id ? String(item.master_id) : null,
      artist: extractArtistFromTitle(item.title),
      country: item.country || null,
      formats: item.format || [],
      genres: item.genre || [],
      styles: item.style || [],
      labels: item.label || [],
      catalogNumber: item.catno || null,
      barcodes: item.barcode || [],
      community: item.community ? {
        have: item.community.have || 0,
        want: item.community.want || 0
      } : null,
      position
    }
  };
}

// ============================================================================
// DETAIL NORMALIZERS
// ============================================================================

/**
 * Normalise les détails d'une release → format canonique
 */
export function normalizeReleaseDetail(release) {
  const artists = (release.artists || []).map(a => ({
    id: `${SOURCE}:${a.id}`,
    sourceId: String(a.id),
    name: a.name,
    role: a.role || 'Main'
  }));

  const tracks = (release.tracklist || []).map((t, idx) => ({
    position: t.position || String(idx + 1),
    title: t.title,
    duration: t.duration || null,
    durationSeconds: parseDuration(t.duration),
    artists: t.artists?.map(a => a.name) || null
  }));

  const rawImages = (release.images || []).map(img => ({
    type: img.type,
    url: img.uri,
    thumbnail: img.uri150
  }));

  const primaryImg = rawImages.find(i => i.type === 'primary')?.url || rawImages[0]?.url || null;
  const thumbImg = rawImages.find(i => i.type === 'primary')?.thumbnail || rawImages[0]?.thumbnail || null;

  return {
    id: `${SOURCE}:${release.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(release.id),
    title: release.title,
    titleOriginal: null,
    description: release.notes || null,
    year: release.year || null,
    images: {
      primary: primaryImg,
      thumbnail: thumbImg,
      gallery: rawImages
    },
    urls: {
      source: release.uri || null,
      detail: `${BASE_DETAIL}/releases/${release.id}`
    },
    details: {
      resourceType: 'release',
      masterId: release.master_id ? String(release.master_id) : null,
      artists,
      artist: artists.map(a => a.name).join(', '),
      releaseDate: release.released || null,
      country: release.country || null,
      genres: release.genres || [],
      styles: release.styles || [],
      formats: (release.formats || []).map(f => ({
        name: f.name,
        qty: f.qty,
        descriptions: f.descriptions || []
      })),
      labels: (release.labels || []).map(l => ({
        id: `${SOURCE}:${l.id}`,
        sourceId: String(l.id),
        name: l.name,
        catalogNumber: l.catno
      })),
      tracks,
      trackCount: tracks.length,
      community: release.community ? {
        have: release.community.have,
        want: release.community.want,
        rating: release.community.rating?.average,
        ratingCount: release.community.rating?.count
      } : null,
      identifiers: (release.identifiers || []).map(id => ({
        type: id.type,
        value: id.value
      })),
      numForSale: release.num_for_sale || 0,
      lowestPrice: release.lowest_price || null,
      companies: (release.companies || []).map(c => ({
        id: `${SOURCE}:${c.id}`,
        sourceId: String(c.id),
        name: c.name,
        role: c.entity_type_name || null,
        catalogNumber: c.catno || null
      })),
      extraArtists: (release.extraartists || []).map(a => ({
        id: `${SOURCE}:${a.id}`,
        sourceId: String(a.id),
        name: a.name,
        role: a.role || null
      })),
      videos: (release.videos || []).map(v => ({
        title: v.title || null,
        url: v.uri || null,
        duration: v.duration || null,
        description: v.description || null
      })),
      resourceUrl: release.resource_url
    }
  };
}

/**
 * Normalise les détails d'un master → format canonique
 */
export function normalizeMasterDetail(master) {
  const artists = (master.artists || []).map(a => ({
    id: `${SOURCE}:${a.id}`,
    sourceId: String(a.id),
    name: a.name,
    role: a.role || 'Main'
  }));

  const tracks = (master.tracklist || []).map((t, idx) => ({
    position: t.position || String(idx + 1),
    title: t.title,
    duration: t.duration || null,
    durationSeconds: parseDuration(t.duration),
    artists: t.artists?.map(a => a.name) || null
  }));

  const rawImages = (master.images || []).map(img => ({
    type: img.type,
    url: img.uri,
    thumbnail: img.uri150
  }));

  const primaryImg = rawImages.find(i => i.type === 'primary')?.url || rawImages[0]?.url || null;
  const thumbImg = rawImages.find(i => i.type === 'primary')?.thumbnail || rawImages[0]?.thumbnail || null;

  return {
    id: `${SOURCE}:${master.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(master.id),
    title: master.title,
    titleOriginal: null,
    description: master.notes || null,
    year: master.year || null,
    images: {
      primary: primaryImg,
      thumbnail: thumbImg,
      gallery: rawImages
    },
    urls: {
      source: master.uri || null,
      detail: `${BASE_DETAIL}/masters/${master.id}`
    },
    details: {
      resourceType: 'master',
      artists,
      artist: artists.map(a => a.name).join(', '),
      genres: master.genres || [],
      styles: master.styles || [],
      tracks,
      trackCount: tracks.length,
      versionsCount: master.versions?.length || 0,
      numForSale: master.num_for_sale || 0,
      lowestPrice: master.lowest_price || null,
      mainReleaseId: master.main_release ? String(master.main_release) : null,
      mostRecentReleaseId: master.most_recent_release ? String(master.most_recent_release) : null,
      videos: (master.videos || []).map(v => ({
        title: v.title || null,
        url: v.uri || null,
        duration: v.duration || null,
        description: v.description || null
      })),
      resourceUrl: master.resource_url
    }
  };
}

/**
 * Normalise les détails d'un artiste → format canonique
 */
export function normalizeArtistDetail(artist) {
  const rawImages = (artist.images || []).map(img => ({
    type: img.type,
    url: img.uri,
    thumbnail: img.uri150
  }));

  const primaryImg = rawImages.find(i => i.type === 'primary')?.url || rawImages[0]?.url || null;
  const thumbImg = rawImages.find(i => i.type === 'primary')?.thumbnail || rawImages[0]?.thumbnail || null;

  const members = (artist.members || []).map(m => ({
    id: `${SOURCE}:${m.id}`,
    sourceId: String(m.id),
    name: m.name,
    active: m.active
  }));

  const aliases = (artist.aliases || []).map(a => ({
    id: `${SOURCE}:${a.id}`,
    sourceId: String(a.id),
    name: a.name
  }));

  return {
    id: `${SOURCE}:${artist.id}`,
    type: 'music_artist',
    source: SOURCE,
    sourceId: String(artist.id),
    title: artist.name,
    titleOriginal: artist.realname || null,
    description: artist.profile || null,
    year: null,
    images: {
      primary: primaryImg,
      thumbnail: thumbImg,
      gallery: rawImages
    },
    urls: {
      source: artist.uri || null,
      detail: `${BASE_DETAIL}/artists/${artist.id}`
    },
    details: {
      realName: artist.realname || null,
      nameVariations: artist.namevariations || [],
      members,
      aliases,
      groups: (artist.groups || []).map(g => ({
        id: `${SOURCE}:${g.id}`,
        sourceId: String(g.id),
        name: g.name,
        active: g.active
      })),
      externalUrls: artist.urls || [],
      resourceUrl: artist.resource_url
    }
  };
}

/**
 * Normalise les releases d'un artiste
 */
export function normalizeArtistReleases(data, artistId) {
  const releases = (data.releases || []).map((r, idx) => ({
    id: `${SOURCE}:${r.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(r.id),
    title: r.title,
    titleOriginal: null,
    description: null,
    year: r.year || null,
    images: {
      primary: r.thumb || null,
      thumbnail: r.thumb || null,
      gallery: []
    },
    urls: {
      source: null,
      detail: detailPath(r.type, r.id)
    },
    details: {
      resourceType: r.type,
      artist: r.artist,
      role: r.role,
      format: r.format,
      label: r.label,
      catalogNumber: r.catno || null,
      country: r.country || null,
      position: idx + 1
    }
  }));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query: artistId,
    total: data.pagination?.items || releases.length,
    count: releases.length,
    data: releases,
    pagination: {
      page: data.pagination?.page || 1,
      limit: data.pagination?.per_page || 50,
      hasMore: (data.pagination?.page || 1) < (data.pagination?.pages || 1)
    },
    meta: buildMeta()
  };
}

/**
 * Normalise les détails d'un label → format canonique
 */
export function normalizeLabelDetail(label) {
  const rawImages = (label.images || []).map(img => ({
    type: img.type,
    url: img.uri,
    thumbnail: img.uri150
  }));

  const primaryImg = rawImages.find(i => i.type === 'primary')?.url || rawImages[0]?.url || null;
  const thumbImg = rawImages.find(i => i.type === 'primary')?.thumbnail || rawImages[0]?.thumbnail || null;

  const sublabels = (label.sublabels || []).map(s => ({
    id: `${SOURCE}:${s.id}`,
    sourceId: String(s.id),
    name: s.name
  }));

  return {
    id: `${SOURCE}:${label.id}`,
    type: 'music_label',
    source: SOURCE,
    sourceId: String(label.id),
    title: label.name,
    titleOriginal: null,
    description: label.profile || null,
    year: null,
    images: {
      primary: primaryImg,
      thumbnail: thumbImg,
      gallery: rawImages
    },
    urls: {
      source: label.uri || null,
      detail: `${BASE_DETAIL}/labels/${label.id}`
    },
    details: {
      contactInfo: label.contact_info || null,
      sublabels,
      parentLabel: label.parent_label ? {
        id: `${SOURCE}:${label.parent_label.id}`,
        sourceId: String(label.parent_label.id),
        name: label.parent_label.name
      } : null,
      externalUrls: label.urls || [],
      resourceUrl: label.resource_url
    }
  };
}

/**
 * Normalise une recherche par code-barres
 */
export function normalizeBarcodeSearch(data, barcode) {
  if (!data.results || data.results.length === 0) {
    return {
      success: true,
      provider: SOURCE,
      domain: DOMAIN,
      id: null,
      data: null,
      meta: { ...buildMeta(), barcode, found: false }
    };
  }

  const item = normalizeSearchItem(data.results[0], 1);

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    id: item.id,
    data: { ...item, details: { ...item.details, barcode } },
    meta: { ...buildMeta(), barcode, found: true }
  };
}

export default {
  normalizeSearchResponse,
  normalizeSearchItem,
  normalizeReleaseDetail,
  normalizeMasterDetail,
  normalizeArtistDetail,
  normalizeArtistReleases,
  normalizeLabelDetail,
  normalizeBarcodeSearch
};
