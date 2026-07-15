/**
 * Middleware Security Headers
 * Ajoute les headers de sécurité standards
 */

export function securityHeaders(req, res, next) {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}
