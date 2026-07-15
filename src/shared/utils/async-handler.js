/**
 * Shared Utils - Async Handler
 * Wrapper pour les handlers async Express
 */

/**
 * Enveloppe un handler async pour capturer les erreurs
 * @param {Function} fn - Handler async
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
