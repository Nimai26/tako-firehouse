/**
 * Shared Errors - AppError
 * Classe de base pour toutes les erreurs applicatives
 */

export class AppError extends Error {
  /**
   * @param {string} message - Message d'erreur
   * @param {number} statusCode - Code HTTP (défaut: 500)
   * @param {string} code - Code erreur machine-readable
   * @param {object} details - Détails additionnels
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    
    // Capture la stack trace
    Error.captureStackTrace(this, this.constructor);
  }
  
  /**
   * Convertit en objet JSON
   */
  toJSON() {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details })
    };
  }
}
