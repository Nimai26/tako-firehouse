/**
 * Normalizer Deezer
 * 
 * Transforme les réponses Deezer au format Tako canonique (Format B)
 * 
 * @module domains/music/normalizers/deezer
 */

const SOURCE = 'deezer';
const DOMAIN = 'music';
const BASE_DETAIL = '/api/music/deezer';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formate une durée en secondes vers "mm:ss"
 */
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Agrandit l'URL d'une image Deezer
 */
function getLargeImageUrl(url) {
  if (!url) return null;
  return url.replace('/cover/', '/cover/500x500/')
            .replace('/artist/', '/artist/500x500/');
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
 * Construit les images Deezer (covers) au format canonique
 */
function buildCoverImages(item, prefix = 'cover') {
  const small = item[`${prefix}_small`] || item[prefix];
  const medium = item[`${prefix}_medium`] || item[prefix];
  const big = item[`${prefix}_big`];
  const xl = item[`${prefix}_xl`];

  const gallery = [
    small  ? { size: 'small',  url: small }  : null,
    medium ? { size: 'medium', url: medium } : null,
    big    ? { size: 'large',  url: big }    : null,
    xl     ? { size: 'xl',     url: xl }     : null
  ].filter(Boolean);

  return {
    primary: medium || small || null,
    thumbnail: small || medium || null,
    gallery
  };
}

/**
 * Construit les images Deezer (pictures d'artiste) au format canonique
 */
function buildPictureImages(item) {
  const small = item.picture_small || item.picture;
  const medium = item.picture_medium || item.picture;
  const big = item.picture_big;
  const xl = item.picture_xl;

  const gallery = [
    small  ? { size: 'small',  url: small }  : null,
    medium ? { size: 'medium', url: medium } : null,
    big    ? { size: 'large',  url: big }    : null,
    xl     ? { size: 'xl',     url: xl }     : null
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
  const results = (data.data || []).map((item, index) => normalizeAlbumSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.total || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: !!data.next
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un album de recherche → format canonique
 */
export function normalizeAlbumSearchItem(item, position = null) {
  return {
    id: `${SOURCE}:${item.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(item.id),
    title: item.title,
    titleOriginal: null,
    description: null,
    year: null,
    images: buildCoverImages(item),
    urls: {
      source: item.link || null,
      detail: `${BASE_DETAIL}/albums/${item.id}`
    },
    details: {
      artist: item.artist?.name || null,
      artistId: item.artist?.id ? `${SOURCE}:${item.artist.id}` : null,
      recordType: item.record_type || null,
      trackCount: item.nb_tracks || null,
      explicit: item.explicit_lyrics || false,
      position
    }
  };
}

/**
 * Normalise les résultats de recherche d'artistes
 */
export function normalizeArtistSearchResponse(data, query) {
  const results = (data.data || []).map((item, index) => normalizeArtistSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.total || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: !!data.next
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un artiste de recherche → format canonique
 */
export function normalizeArtistSearchItem(item, position = null) {
  return {
    id: `${SOURCE}:${item.id}`,
    type: 'music_artist',
    source: SOURCE,
    sourceId: String(item.id),
    title: item.name,
    titleOriginal: null,
    description: null,
    year: null,
    images: buildPictureImages(item),
    urls: {
      source: item.link || null,
      detail: `${BASE_DETAIL}/artists/${item.id}`
    },
    details: {
      nbAlbums: item.nb_album || null,
      nbFans: item.nb_fan || null,
      position
    }
  };
}

/**
 * Normalise les résultats de recherche de tracks
 */
export function normalizeTrackSearchResponse(data, query) {
  const results = (data.data || []).map((item, index) => normalizeTrackSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.total || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: !!data.next
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un track de recherche → format canonique
 */
export function normalizeTrackSearchItem(item, position = null) {
  const albumCover = item.album?.cover_medium || item.album?.cover || null;
  const albumThumb = item.album?.cover_small || item.album?.cover || null;

  return {
    id: `${SOURCE}:${item.id}`,
    type: 'music_track',
    source: SOURCE,
    sourceId: String(item.id),
    title: item.title,
    titleOriginal: null,
    description: null,
    year: null,
    images: {
      primary: albumCover,
      thumbnail: albumThumb,
      gallery: []
    },
    urls: {
      source: item.link || null,
      detail: `${BASE_DETAIL}/tracks/${item.id}`
    },
    details: {
      artist: item.artist?.name || null,
      artistId: item.artist?.id ? `${SOURCE}:${item.artist.id}` : null,
      album: item.album?.title || null,
      albumId: item.album?.id ? `${SOURCE}:${item.album.id}` : null,
      duration: item.duration || null,
      durationFormatted: item.duration ? formatDuration(item.duration) : null,
      preview: item.preview || null,
      explicit: item.explicit_lyrics || false,
      rank: item.rank || null,
      position
    }
  };
}

// ============================================================================
// DETAIL NORMALIZERS
// ============================================================================

/**
 * Normalise les détails d'un album → format canonique
 */
export function normalizeAlbumDetail(album) {
  const tracks = (album.tracks?.data || []).map((t, idx) => ({
    position: t.track_position || idx + 1,
    id: `${SOURCE}:${t.id}`,
    sourceId: String(t.id),
    title: t.title,
    artist: t.artist?.name || null,
    artistId: t.artist?.id ? `${SOURCE}:${t.artist.id}` : null,
    duration: t.duration || null,
    durationFormatted: t.duration ? formatDuration(t.duration) : null,
    discNumber: t.disk_number || 1,
    preview: t.preview || null,
    explicit: t.explicit_lyrics || false,
    rank: t.rank || null
  }));

  const contributors = (album.contributors || []).map(c => ({
    id: `${SOURCE}:${c.id}`,
    sourceId: String(c.id),
    name: c.name,
    role: c.role || null,
    image: c.picture_medium || c.picture
  }));

  return {
    id: `${SOURCE}:${album.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: String(album.id),
    title: album.title,
    titleOriginal: null,
    description: null,
    year: extractYear(album.release_date),
    images: buildCoverImages(album),
    urls: {
      source: album.link || null,
      detail: `${BASE_DETAIL}/albums/${album.id}`
    },
    details: {
      upc: album.upc || null,
      recordType: album.record_type || null,
      artist: album.artist?.name || null,
      artistId: album.artist?.id ? `${SOURCE}:${album.artist.id}` : null,
      artistImage: album.artist?.picture_medium || null,
      releaseDate: album.release_date || null,
      genres: (album.genres?.data || []).map(g => g.name),
      label: album.label || null,
      duration: album.duration || null,
      durationFormatted: album.duration ? formatDuration(album.duration) : null,
      tracks,
      trackCount: album.nb_tracks || tracks.length,
      discCount: album.nb_disk || 1,
      contributors,
      explicit: album.explicit_lyrics || false,
      fans: album.fans || 0
    }
  };
}

/**
 * Normalise les détails d'un artiste → format canonique
 */
export function normalizeArtistDetail(artist, topTracks = [], albums = []) {
  const normalizedTopTracks = (topTracks.data || topTracks || []).map((t, idx) => ({
    position: idx + 1,
    id: `${SOURCE}:${t.id}`,
    sourceId: String(t.id),
    title: t.title,
    duration: t.duration || null,
    durationFormatted: t.duration ? formatDuration(t.duration) : null,
    album: t.album?.title || null,
    albumCover: t.album?.cover_medium || null,
    preview: t.preview || null,
    rank: t.rank || null,
    explicit: t.explicit_lyrics || false
  }));

  const normalizedAlbums = (albums.data || albums || []).map((a, idx) => ({
    position: idx + 1,
    id: `${SOURCE}:${a.id}`,
    sourceId: String(a.id),
    title: a.title,
    cover: a.cover_medium || a.cover,
    releaseDate: a.release_date || null,
    year: extractYear(a.release_date),
    type: a.record_type || 'album',
    trackCount: a.nb_tracks || null,
    fans: a.fans || 0
  }));

  return {
    id: `${SOURCE}:${artist.id}`,
    type: 'music_artist',
    source: SOURCE,
    sourceId: String(artist.id),
    title: artist.name,
    titleOriginal: null,
    description: null,
    year: null,
    images: buildPictureImages(artist),
    urls: {
      source: artist.link || null,
      detail: `${BASE_DETAIL}/artists/${artist.id}`
    },
    details: {
      nbAlbums: artist.nb_album || normalizedAlbums.length,
      nbFans: artist.nb_fan || 0,
      topTracks: normalizedTopTracks,
      albums: normalizedAlbums
    }
  };
}

/**
 * Normalise les détails d'un track → format canonique
 */
export function normalizeTrackDetail(track) {
  const albumCover = track.album?.cover_medium || null;
  const albumThumb = track.album?.cover_small || null;

  return {
    id: `${SOURCE}:${track.id}`,
    type: 'music_track',
    source: SOURCE,
    sourceId: String(track.id),
    title: track.title,
    titleOriginal: null,
    description: null,
    year: extractYear(track.release_date),
    images: {
      primary: albumCover,
      thumbnail: albumThumb,
      gallery: []
    },
    urls: {
      source: track.link || null,
      detail: `${BASE_DETAIL}/tracks/${track.id}`
    },
    details: {
      titleShort: track.title_short || null,
      titleVersion: track.title_version || null,
      artist: track.artist?.name || null,
      artistId: track.artist?.id ? `${SOURCE}:${track.artist.id}` : null,
      album: track.album?.title || null,
      albumId: track.album?.id ? `${SOURCE}:${track.album.id}` : null,
      albumCover,
      duration: track.duration || null,
      durationFormatted: track.duration ? formatDuration(track.duration) : null,
      discNumber: track.disk_number || 1,
      trackNumber: track.track_position || null,
      releaseDate: track.release_date || null,
      bpm: track.bpm || null,
      gain: track.gain || null,
      rank: track.rank || null,
      preview: track.preview || null,
      explicit: track.explicit_lyrics || false,
      isrc: track.isrc || null,
      contributors: (track.contributors || []).map(c => ({
        id: `${SOURCE}:${c.id}`,
        name: c.name,
        role: c.role
      }))
    }
  };
}

/**
 * Normalise les genres
 */
export function normalizeGenres(data) {
  return {
    total: data.data?.length || 0,
    data: (data.data || []).map(g => ({
      id: g.id,
      name: g.name,
      image: g.picture_medium || g.picture
    }))
  };
}

/**
 * Normalise le chart
 */
export function normalizeChart(data, type) {
  const items = (data.data || []).map((item, idx) => {
    if (type === 'albums') {
      return normalizeAlbumSearchItem(item, idx + 1);
    } else if (type === 'artists') {
      return normalizeArtistSearchItem(item, idx + 1);
    } else {
      return normalizeTrackSearchItem(item, idx + 1);
    }
  });

  return {
    type,
    total: data.total || items.length,
    data: items
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
  normalizeTrackDetail,
  normalizeGenres,
  normalizeChart
};
