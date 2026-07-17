/**
 * Normalizer RCScrapyard → forme attendue par le client Tako (Firehouse).
 * @module domains/rc/normalizers/rcscrapyard
 */

/** Résultats de recherche → {total, data:[{sourceId,id,title,url}]}. */
export function normalizeSearchResults(raw) {
  const results = (raw && raw.results) || [];
  return {
    total: results.length,
    data: results.map(r => ({
      id: `rcscrapyard:${r.slug}`,
      sourceId: r.slug,
      source: 'rcscrapyard',
      title: r.name,
      titleOriginal: r.name,
      images: { primary: null, thumbnail: null, gallery: [] },
      urls: { source: r.url, detail: `/api/rc/rcscrapyard/${encodeURIComponent(r.slug)}` }
    }))
  };
}

/** Détails → objet plat (les clés _MAP de Firehouse sont en top-level). */
export function normalizeDetails(raw) {
  if (!raw) return null;
  const images = raw.images || [];
  return {
    id: `rcscrapyard:${raw.slug}`,
    sourceId: raw.slug,
    source: 'rcscrapyard',
    title: raw.name,
    titleOriginal: raw.name,
    // clés consommées par _MAP["rc_vehicles"] (Firehouse) :
    brand: raw.brand || null,
    model: raw.model || raw.name || null,
    scale: raw.scale || null,
    year: raw.year || null,
    vehicleType: raw.vehicleType || null,
    motorisation: raw.motorisation || null,
    description: raw.description || null,
    images: { primary: images[0] || null, thumbnail: images[0] || null, gallery: images },
    urls: { source: raw.url, detail: `/api/rc/rcscrapyard/${encodeURIComponent(raw.slug)}` }
  };
}
