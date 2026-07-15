/**
 * Middleware Request ID
 * Ajoute un identifiant unique à chaque requête
 */

import crypto from 'crypto';

export function requestId(req, res, next) {
  req.id = crypto.randomUUID().substring(0, 8);
  res.header('X-Request-ID', req.id);
  next();
}
