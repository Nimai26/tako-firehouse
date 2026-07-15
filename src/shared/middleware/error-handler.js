/**
 * Middleware Error Handler
 * Gestion centralisée des erreurs
 */

import { logger } from '../utils/logger.js';
import { AppError } from '../errors/index.js';

const log = logger.create('Error');

export function errorHandler(err, req, res, next) {
  // Si les headers sont déjà envoyés, déléguer à Express
  if (res.headersSent) {
    return next(err);
  }
  
  // Erreur applicative connue
  if (err instanceof AppError) {
    log.warn(`${err.name}: ${err.message}`, { 
      id: req.id, 
      code: err.code,
      statusCode: err.statusCode 
    });
    
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      code: err.code,
      ...(err.details && { details: err.details })
    });
  }
  
  // Erreur de validation Zod
  if (err.name === 'ZodError') {
    log.warn('Validation error', { id: req.id, issues: err.issues });
    
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request parameters',
      details: err.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message
      }))
    });
  }
  
  // Erreur inconnue (log détaillé en développement)
  log.error('Unhandled error', { 
    id: req.id, 
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  
  res.status(500).json({
    error: 'InternalServerError',
    message: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
