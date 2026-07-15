/**
 * Normalizer MusicBrainz
 * 
 * Transforme les réponses MusicBrainz au format Tako canonique (Format B)
 * 
 * @module domains/music/normalizers/musicbrainz
 */

const SOURCE = 'musicbrainz';
const DOMAIN = 'music';
const BASE_DETAIL = '/api/music/musicbrainz';
const COVER_URL = 'https://coverartarchive.org';

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
 * Extrait les artistes d'un artist-credit
 */
function extractArtists(artistCredit) {
  if (!artistCredit) return [];

  return artistCredit.map(ac => ({
    id: ac.artist?.id ? `${SOURCE}:${ac.artist.id}` : null,
    sourceId: ac.artist?.id || null,
    name: ac.name || ac.artist?.name,
    joinPhrase: ac.joinphrase || ''
  }));
}

/**
 * Extrait le nom d'artiste formaté
 */
function formatArtistName(artistCredit) {
  if (!artistCredit) return null;

  return artistCredit.map(ac => {
    const name = ac.name || ac.artist?.name;
    const join = ac.joinphrase || '';
    return name + join;
  }).join('');
}

/**
 * Génère l'URL de pochette
 */
function getCoverUrl(mbid, size = '500') {
  return `${COVER_URL}/release-group/${mbid}/front-${size}`;
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

// ============================================================================
// SEARCH NORMALIZERS
// ============================================================================

/**
 * Normalise les résultats de recherche d'albums
 */
export function normalizeAlbumSearchResponse(data, query) {
  const groups = data['release-groups'] || [];
  const results = groups.map((item, index) => normalizeAlbumSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.count || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: results.length < (data.count || 0)
    },
    meta: buildMeta()
  };
}

/**
 * Normalise un album de recherche → format canonique
 */
export function normalizeAlbumSearchItem(item, position = null) {
  const artists = extractArtists(item['artist-credit']);
  const cover250 = getCoverUrl(item.id, '250');
  const cover500 = getCoverUrl(item.id, '500');

  return {
    id: `${SOURCE}:${item.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: item.id,
    title: item.title,
    titleOriginal: null,
    description: null,
    year: extractYear(item['first-release-date']),
    images: {
      primary: cover500,
      thumbnail: cover250,
      gallery: []
    },
    urls: {
      source: `https://musicbrainz.org/release-group/${item.id}`,
      detail: `${BASE_DETAIL}/albums/${item.id}`
    },
    details: {
      artist: formatArtistName(item['artist-credit']),
      artistId: artists[0]?.sourceId ? `${SOURCE}:${artists[0].sourceId}` : null,
      artists,
      releaseDate: item['first-release-date'] || null,
      primaryType: item['primary-type'] || null,
      secondaryTypes: item['secondary-types'] || [],
      disambiguation: item.disambiguation || null,
      score: item.score || null,
      position
    }
  };
}

/**
 * Normalise les résultats de recherche d'artistes
 */
export function normalizeArtistSearchResponse(data, query) {
  const artists = data.artists || [];
  const results = artists.map((item, index) => normalizeArtistSearchItem(item, index + 1));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query,
    total: data.count || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: results.length < (data.count || 0)
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
    sourceId: item.id,
    title: item.name,
    titleOriginal: null,
    description: item.disambiguation || null,
    year: null,
    images: {
      primary: null,
      thumbnail: null,
      gallery: []
    },
    urls: {
      source: `https://musicbrainz.org/artist/${item.id}`,
      detail: `${BASE_DETAIL}/artists/${item.id}`
    },
    details: {
      sortName: item['sort-name'] || null,
      disambiguation: item.disambiguation || null,
      artistType: item.type || null,
      gender: item.gender || null,
      country: item.country || null,
      area: item.area?.name || null,
      beginDate: item['life-span']?.begin || null,
      endDate: item['life-span']?.end || null,
      active: !item['life-span']?.ended,
      score: item.score || null,
      tags: (item.tags || []).slice(0, 5).map(t => t.name),
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
export function normalizeAlbumDetail(rg, tracks = []) {
  const artists = extractArtists(rg['artist-credit']);

  const releases = (rg.releases || []).slice(0, 10).map(r => ({
    id: `${SOURCE}:${r.id}`,
    sourceId: r.id,
    title: r.title,
    status: r.status || null,
    date: r.date || null,
    country: r.country || null,
    barcode: r.barcode || null,
    trackCount: r['track-count'] || null,
    packaging: r.packaging || null,
    label: r['label-info']?.[0]?.label?.name || null,
    catalogNumber: r['label-info']?.[0]?.['catalog-number'] || null
  }));

  const normalizedTracks = tracks.map((t, idx) => ({
    position: t.position || idx + 1,
    disc: t.disc || 1,
    title: t.title,
    duration: t.duration ? Math.round(t.duration / 1000) : null,
    durationFormatted: t.duration ? formatDuration(t.duration) : null
  }));

  const tags = (rg.tags || [])
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 10)
    .map(t => ({ name: t.name, count: t.count }));

  const cover250 = getCoverUrl(rg.id, '250');
  const cover500 = getCoverUrl(rg.id, '500');
  const cover1200 = getCoverUrl(rg.id, '1200');

  return {
    id: `${SOURCE}:${rg.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: rg.id,
    title: rg.title,
    titleOriginal: null,
    description: null,
    year: extractYear(rg['first-release-date']),
    images: {
      primary: cover500,
      thumbnail: cover250,
      gallery: [
        { size: 'small',  url: cover250 },
        { size: 'medium', url: cover500 },
        { size: 'xl',     url: cover1200 }
      ]
    },
    urls: {
      source: `https://musicbrainz.org/release-group/${rg.id}`,
      detail: `${BASE_DETAIL}/albums/${rg.id}`
    },
    details: {
      artist: formatArtistName(rg['artist-credit']),
      artists,
      disambiguation: rg.disambiguation || null,
      releaseDate: rg['first-release-date'] || null,
      primaryType: rg['primary-type'] || null,
      secondaryTypes: rg['secondary-types'] || [],
      tags,
      rating: rg.rating ? {
        value: rg.rating.value,
        votes: rg.rating['votes-count']
      } : null,
      releases,
      releasesCount: rg.releases?.length || 0,
      tracks: normalizedTracks,
      trackCount: normalizedTracks.length
    }
  };
}

/**
 * Normalise les détails d'un artiste → format canonique
 */
export function normalizeArtistDetail(artist) {
  const aliases = (artist.aliases || []).map(a => ({
    name: a.name,
    sortName: a['sort-name'],
    type: a.type,
    locale: a.locale,
    primary: a.primary || false
  }));

  const tags = (artist.tags || [])
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 10)
    .map(t => ({ name: t.name, count: t.count }));

  const releaseGroups = (artist['release-groups'] || []).map((rg, idx) => ({
    position: idx + 1,
    id: `${SOURCE}:${rg.id}`,
    sourceId: rg.id,
    title: rg.title,
    primaryType: rg['primary-type'],
    secondaryTypes: rg['secondary-types'] || [],
    releaseDate: rg['first-release-date'] || null,
    year: extractYear(rg['first-release-date']),
    cover: getCoverUrl(rg.id, '250')
  }));

  return {
    id: `${SOURCE}:${artist.id}`,
    type: 'music_artist',
    source: SOURCE,
    sourceId: artist.id,
    title: artist.name,
    titleOriginal: null,
    description: artist.disambiguation || null,
    year: null,
    images: {
      primary: null,
      thumbnail: null,
      gallery: []
    },
    urls: {
      source: `https://musicbrainz.org/artist/${artist.id}`,
      detail: `${BASE_DETAIL}/artists/${artist.id}`
    },
    details: {
      sortName: artist['sort-name'] || null,
      disambiguation: artist.disambiguation || null,
      artistType: artist.type || null,
      gender: artist.gender || null,
      country: artist.country || null,
      area: artist.area?.name || null,
      beginDate: artist['life-span']?.begin || null,
      endDate: artist['life-span']?.end || null,
      active: !artist['life-span']?.ended,
      beginArea: artist['begin-area']?.name || null,
      endArea: artist['end-area']?.name || null,
      aliases,
      tags,
      rating: artist.rating ? {
        value: artist.rating.value,
        votes: artist.rating['votes-count']
      } : null,
      albums: releaseGroups.filter(rg => rg.primaryType === 'Album'),
      eps: releaseGroups.filter(rg => rg.primaryType === 'EP'),
      singles: releaseGroups.filter(rg => rg.primaryType === 'Single'),
      allReleases: releaseGroups
    }
  };
}

/**
 * Normalise une recherche par code-barres
 */
export function normalizeBarcodeSearch(data, barcode) {
  const releases = data.releases || [];

  if (releases.length === 0) {
    return {
      success: true,
      provider: SOURCE,
      domain: DOMAIN,
      id: null,
      data: null,
      meta: { ...buildMeta(), barcode, found: false }
    };
  }

  const release = releases[0];
  const artists = extractArtists(release['artist-credit']);
  const rgId = release['release-group']?.id || null;

  const item = {
    id: `${SOURCE}:${release.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: release.id,
    title: release.title,
    titleOriginal: null,
    description: null,
    year: extractYear(release.date),
    images: {
      primary: rgId ? getCoverUrl(rgId, '500') : null,
      thumbnail: rgId ? getCoverUrl(rgId, '250') : null,
      gallery: []
    },
    urls: {
      source: `https://musicbrainz.org/release/${release.id}`,
      detail: `${BASE_DETAIL}/albums/${release.id}`
    },
    details: {
      barcode,
      releaseGroupId: rgId,
      artist: formatArtistName(release['artist-credit']),
      artists,
      date: release.date || null,
      country: release.country || null,
      status: release.status || null,
      label: release['label-info']?.[0]?.label?.name || null,
      catalogNumber: release['label-info']?.[0]?.['catalog-number'] || null
    }
  };

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    id: item.id,
    data: item,
    meta: { ...buildMeta(), barcode, found: true }
  };
}

/**
 * Normalise les albums d'un artiste
 */
export function normalizeArtistAlbums(data, artistId) {
  const groups = data['release-groups'] || [];
  const results = groups.map((rg, idx) => ({
    id: `${SOURCE}:${rg.id}`,
    type: 'music_album',
    source: SOURCE,
    sourceId: rg.id,
    title: rg.title,
    titleOriginal: null,
    description: null,
    year: extractYear(rg['first-release-date']),
    images: {
      primary: getCoverUrl(rg.id, '500'),
      thumbnail: getCoverUrl(rg.id, '250'),
      gallery: []
    },
    urls: {
      source: `https://musicbrainz.org/release-group/${rg.id}`,
      detail: `${BASE_DETAIL}/albums/${rg.id}`
    },
    details: {
      primaryType: rg['primary-type'],
      secondaryTypes: rg['secondary-types'] || [],
      releaseDate: rg['first-release-date'] || null,
      position: idx + 1
    }
  }));

  return {
    success: true,
    provider: SOURCE,
    domain: DOMAIN,
    query: artistId,
    total: data['release-group-count'] || results.length,
    count: results.length,
    data: results,
    pagination: {
      page: 1,
      limit: results.length,
      hasMore: results.length < (data['release-group-count'] || 0)
    },
    meta: buildMeta()
  };
}

export default {
  normalizeAlbumSearchResponse,
  normalizeAlbumSearchItem,
  normalizeArtistSearchResponse,
  normalizeArtistSearchItem,
  normalizeAlbumDetail,
  normalizeArtistDetail,
  normalizeBarcodeSearch,
  normalizeArtistAlbums
};
