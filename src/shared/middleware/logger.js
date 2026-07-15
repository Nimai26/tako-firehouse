/**
 * Middleware Request Logger
 * Log les requêtes entrantes et les réponses
 */

import { logger } from '../utils/logger.js';

const log = logger.create('HTTP');

export function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Log de la requête
  log.debug(`→ ${req.method} ${req.path}`, { 
    id: req.id,
    query: Object.keys(req.query).length > 0 ? req.query : undefined
  });
  
  // Log de la réponse
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'debug';
    
    log[level](`← ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`, {
      id: req.id
    });
  });
  
  // Stocker le startTime pour usage ultérieur
  req.startTime = startTime;
  next();
}
