/**
 * Normalizer iTunes
 * 
 * Transforme les réponses iTunes au format Tako canonique (Format B)
 * 
 * @module domains/music/normalizers/itunes
 */

const SOURCE = 'itunes';
const DOMAIN = 'music';
const BASE_DETAIL = '/api/music/itunes';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formate une durée en ms vers "mm:ss"
 */
function formatDuration(ms) {
  if (!ms) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Agrandit l'URL d'une image iTunes
 */
function getLargeImageUrl(url, size = '600x600') {
  if (!url) return null;
  return url.replace('100x100bb', `${size}bb`);
}

/**
 * Extrait l'année numérique d'une date string
 */
function extractYear(dateStr) {
  if (!dateStr) return null;
  const y = parseInt(dateStr.substring(0, 4), 10);
  return isNaN(y) ? null : y;
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
 * Construit les images iTunes au format canonique
 */
function buildArtworkImages(item) {
  const small = item.artworkUrl60 || null;
  const medium = item.artworkUrl100 || null;
  const large = getLargeImageUrl(item.artworkUrl100, '600x600');

  const gallery = [
    small  ? { size: 'small',  url: small }  : null,
    medium ? { size: 'medium', url: medium } : null,
    large  ? { size: 'large',  url: large }  : null
  ].filter(Boolean);

  return {
    primary: medium || small || null,
    thumbnail: small || medium || null,
    gallery
  };
}

// ============================================================================
// SEARCH NORMALIZERS
// ============================================================================

/**
 * Normalise les résultats de recherche d'albums
 */
export function normalizeAlbumSearchResponse(data, query) {
  const albums = (data.results || []).filter(r => r.wrapperType === 'collection');
  const results = albums.map((item, index) => normalizeAlbumSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.resultCount || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: false
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un album de recherche → format canonique
 */
export function normalizeAlbumSearchItem(item, position = null) {
  return {
    id: `${SOURCE}:${item.collectionId}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(item.collectionId),
    title: item.collectionName,
    titleOriginal: null,
    description: null,
    year: extractYear(item.releaseDate),
    images: buildArtworkImages(item),
    urls: {
      source: item.collectionViewUrl || null,
      detail: `${BASE_DETAIL}/albums/${item.collectionId}`
    },
    details: {
      artist: item.artistName || null,
      artistId: item.artistId ? `${SOURCE}:${item.artistId}` : null,
      releaseDate: item.releaseDate || null,
      trackCount: item.trackCount || null,
      genre: item.primaryGenreName || null,
      explicit: item.collectionExplicitness === 'explicit',
      price: item.collectionPrice || null,
      currency: item.currency || null,
      country: item.country || null,
      copyright: item.copyright || null,
      position
    }
  };
}

/**
 * Normalise les résultats de recherche d'artistes
 */
export function normalizeArtistSearchResponse(data, query) {
  const artists = (data.results || []).filter(r => r.wrapperType === 'artist');
  const results = artists.map((item, index) => normalizeArtistSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.resultCount || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: false
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un artiste de recherche → format canonique
 */
export function normalizeArtistSearchItem(item, position = null) {
  return {
    id: `${SOURCE}:${item.artistId}`,
    type: 'music_artist',
    source: SOURCE,
    sourceId: String(item.artistId),
    title: item.artistName,
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: null,
      thumbnail: null,
      gallery: []
    },
    urls: {
      source: item.artistLinkUrl || null,
      detail: `${BASE_DETAIL}/artists/${item.artistId}`
    },
    details: {
      genre: item.primaryGenreName || null,
      artistType: item.artistType || null,
      position
    }
  };
}

/**
 * Normalise les résultats de recherche de tracks
 */
export function normalizeTrackSearchResponse(data, query) {
  const tracks = (data.results || []).filter(r => r.wrapperType === 'track');
  const results = tracks.map((item, index) => normalizeTrackSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.resultCount || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: false
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un track de recherche → format canonique
 */
export function normalizeTrackSearchItem(item, position = null) {
  return {
    id: `${SOURCE}:${item.trackId}`,
    type: 'music_track',
    source: SOURCE,
    sourceId: String(item.trackId),
    title: item.trackName,
    titleOriginal: null,
    description: null,
    year: extractYear(item.releaseDate),
    images: buildArtworkImages(item),
    urls: {
      source: item.trackViewUrl || null,
      detail: `${BASE_DETAIL}/tracks/${item.trackId}`
    },
    details: {
      artist: item.artistName || null,
      artistId: item.artistId ? `${SOURCE}:${item.artistId}` : null,
      album: item.collectionName || null,
      albumId: item.collectionId ? `${SOURCE}:${item.collectionId}` : null,
      duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : null,
      durationFormatted: item.trackTimeMillis ? formatDuration(item.trackTimeMillis) : null,
      trackNumber: item.trackNumber || null,
      discNumber: item.discNumber || 1,
      genre: item.primaryGenreName || null,
      releaseDate: item.releaseDate || null,
      explicit: item.trackExplicitness === 'explicit',
      price: item.trackPrice || null,
      currency: item.currency || null,
      preview: item.previewUrl || null,
      position
    }
  };
}

// ============================================================================
// DETAIL NORMALIZERS
// ============================================================================

/**
 * Normalise les détails d'un album (avec tracks) → format canonique
 */
export function normalizeAlbumDetail(data) {
  const results = data.results || [];

  // Premier élément = album, reste = tracks
  const albumInfo = results.find(r => r.wrapperType === 'collection');
  const trackItems = results.filter(r => r.wrapperType === 'track');

  if (!albumInfo) {
    throw new Error('Album non trouvé dans les résultats');
  }

  const tracks = trackItems.map((t, idx) => ({
    position: t.trackNumber || idx + 1,
    id: `${SOURCE}:${t.trackId}`,
    sourceId: String(t.trackId),
    title: t.trackName,
    artist: t.artistName || null,
    artistId: t.artistId ? `${SOURCE}:${t.artistId}` : null,
    duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
    durationFormatted: t.trackTimeMillis ? formatDuration(t.trackTimeMillis) : null,
    discNumber: t.discNumber || 1,
    preview: t.previewUrl || null,
    explicit: t.trackExplicitness === 'explicit',
    url: t.trackViewUrl || null,
    price: t.trackPrice || null
  }));

  // Calculer la durée totale
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  return {
    id: `${SOURCE}:${albumInfo.collectionId}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(albumInfo.collectionId),
    title: albumInfo.collectionName,
    titleOriginal: null,
    description: albumInfo.copyright || null,
    year: extractYear(albumInfo.releaseDate),
    images: buildArtworkImages(albumInfo),
    urls: {
      source: albumInfo.collectionViewUrl || null,
      detail: `${BASE_DETAIL}/albums/${albumInfo.collectionId}`
    },
    details: {
      artist: albumInfo.artistName || null,
      artistId: albumInfo.artistId ? `${SOURCE}:${albumInfo.artistId}` : null,
      releaseDate: albumInfo.releaseDate || null,
      genre: albumInfo.primaryGenreName || null,
      tracks,
      trackCount: albumInfo.trackCount || tracks.length,
      discCount: albumInfo.discCount || 1,
      duration: totalDuration || null,
      durationFormatted: totalDuration ? formatDuration(totalDuration * 1000) : null,
      explicit: albumInfo.collectionExplicitness === 'explicit',
      price: albumInfo.collectionPrice || null,
      currency: albumInfo.currency || null,
      copyright: albumInfo.copyright || null
    }
  };
}

/**
 * Normalise les détails d'un artiste → format canonique
 */
export function normalizeArtistDetail(data) {
  const results = data.results || [];
  const artistInfo = results.find(r => r.wrapperType === 'artist');

  if (!artistInfo) {
    throw new Error('Artiste non trouvé dans les résultats');
  }

  return {
    id: `${SOURCE}:${artistInfo.artistId}`,
    type: 'music_artist',
    source: SOURCE,
    sourceId: String(artistInfo.artistId),
    title: artistInfo.artistName,
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: null,
      thumbnail: null,
      gallery: []
    },
    urls: {
      source: artistInfo.artistLinkUrl || null,
      detail: `${BASE_DETAIL}/artists/${artistInfo.artistId}`
    },
    details: {
      genre: artistInfo.primaryGenreName || null,
      artistType: artistInfo.artistType || null,
      amgArtistId: artistInfo.amgArtistId || null
    }
  };
}

/**
 * Normalise les albums d'un artiste
 */
export function normalizeArtistAlbums(data, artistId) {
  const results = data.results || [];

  // Premier = artiste, reste = albums
  const albums = results
    .filter(r => r.wrapperType === 'collection')
    .map((item, idx) => normalizeAlbumSearchItem(item, idx + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query: artistId,
    total: albums.length,
    count: albums.length,
    data: albums,
    pagination: {
      page: 1,
      limit: albums.length,
      hasMore: false
    },
    meta: buildMeta()
  };
}

export default {
  normalizeAlbumSearchResponse,
  normalizeAlbumSearchItem,
  normalizeArtistSearchResponse,
  normalizeArtistSearchItem,
  normalizeTrackSearchResponse,
  normalizeTrackSearchItem,
  normalizeAlbumDetail,
  normalizeArtistDetail,
  normalizeArtistAlbums
};
