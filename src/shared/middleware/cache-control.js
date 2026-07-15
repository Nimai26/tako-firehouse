/**
 * Middleware Cache Control
 * Gère les headers de cache et le bypass
 */

/**
 * Ajoute les headers de cache à la réponse
 * @param {number} maxAge - Durée de cache en secondes
 */
export function cacheControl(maxAge = 300) {
  return (req, res, next) => {
    // Vérifier si le client veut bypasser le cache
    const noCache = 
      req.query.refresh === 'true' ||
      req.query.noCache === 'true' ||
      req.query.cache === 'false' ||
      req.headers['cache-control'] === 'no-cache';
    
    if (noCache) {
      req.forceRefresh = true;
      res.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else {
      res.header('Cache-Control', `public, max-age=${maxAge}`);
    }
    
    next();
  };
}

/**
 * Ajoute manuellement les headers de cache
 * @param {import('express').Response} res 
 * @param {number} maxAge 
 * @param {object} [cacheInfo] - Infos sur le cache (hit/miss)
 */
export function addCacheHeaders(res, maxAge = 300, cacheInfo = null) {
  res.header('Cache-Control', `public, max-age=${maxAge}`);
  
  if (cacheInfo) {
    res.header('X-Cache', cacheInfo.hit ? 'HIT' : 'MISS');
    if (cacheInfo.age) {
      res.header('X-Cache-Age', String(cacheInfo.age));
    }
  }
}
