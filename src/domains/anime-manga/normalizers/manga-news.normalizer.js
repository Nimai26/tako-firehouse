/**
 * Normalizer manga-news → forme attendue par le client Tako (Firehouse).
 *
 * Séries mangas VF ET magazines : la fiche série expose la liste complète des
 * volumes/numéros avec couverture FR → alimente les full-sets numérotés.
 * @module domains/anime-manga/normalizers/manga-news
 */

/** Résultats de recherche → {total, data:[{id,sourceId,title,...}]}. */
export function normalizeSearchResults(raw) {
  const results = (raw && raw.results) || [];
  return {
    total: results.length,
    data: results.map(r => ({
      id: `manga-news:${r.slug}`,
      sourceId: r.slug,
      source: 'manga-news',
      title: r.title,
      titleOriginal: r.title,
      year: r.year || null,
      kind: r.kind || 'manga',
      images: { primary: r.cover || null, thumbnail: r.cover || null, gallery: [] },
      urls: { source: r.url, detail: `/api/anime-manga/manga-news/serie/${encodeURIComponent(r.slug)}` }
    }))
  };
}

/** Détail série → objet plat + `volumes[]` (numéro + couverture). */
export function normalizeSerie(raw) {
  if (!raw) return null;
  const volumes = (raw.volumes || []).map(v => ({
    number: v.number,
    label: v.label,
    cover: v.cover || null,
    url: v.url || null
  }));
  return {
    id: `manga-news:${raw.slug}`,
    sourceId: raw.slug,
    source: 'manga-news',
    title: raw.title,
    titleOriginal: raw.title,
    description: raw.synopsis || null,
    synopsis: raw.synopsis || null,
    year: raw.year || null,
    origin: raw.origine || null,
    publishers: raw.publishers || [],
    authors: raw.authors || [],
    genres: raw.genres || [],
    volumes,
    volumesCount: volumes.length,
    images: { primary: raw.cover || null, thumbnail: raw.cover || null, gallery: [] },
    urls: { source: raw.url, detail: `/api/anime-manga/manga-news/serie/${encodeURIComponent(raw.slug)}` }
  };
}
