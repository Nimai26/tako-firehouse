/**
 * Middleware Validation
 * Validation des paramètres de requête avec Zod
 */

import { ZodError } from 'zod';

/**
 * Valide les query parameters avec un schéma Zod
 * @param {import('zod').ZodSchema} schema - Schéma Zod
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.validatedQuery = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(err);
      }
      next(err);
    }
  };
}

/**
 * Valide les route parameters avec un schéma Zod
 * @param {import('zod').ZodSchema} schema - Schéma Zod
 */
export function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.validatedParams = schema.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(err);
      }
      next(err);
    }
  };
}
