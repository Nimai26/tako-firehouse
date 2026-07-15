/**
 * Shared Errors - HTTP Errors
 * Erreurs HTTP spécialisées
 */

import { AppError } from './app-error.js';

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

/**
 * 400 Bad Request / Validation Error
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', code = 'VALIDATION_ERROR', details = null) {
    super(message, 400, code, details);
  }
}

/**
 * 429 Too Many Requests
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT');
    this.retryAfter = retryAfter;
    if (retryAfter) {
      this.details = { retryAfter };
    }
  }
}

/**
 * 502 Bad Gateway - Erreur provider externe
 */
export class ProviderError extends AppError {
  constructor(provider, message = 'Provider error', originalError = null) {
    super(`${provider}: ${message}`, 502, 'PROVIDER_ERROR');
    this.provider = provider;
    this.originalError = originalError;
    this.details = { provider };
  }
}

/**
 * 502 Bad Gateway - Erreur gateway générique
 */
export class BadGatewayError extends AppError {
  constructor(message = 'Bad gateway', code = 'BAD_GATEWAY') {
    super(message, 502, code);
  }
}

/**
 * 504 Gateway Timeout
 */
export class TimeoutError extends AppError {
  constructor(message = 'Request timeout', timeout = null) {
    super(message, 504, 'TIMEOUT');
    if (timeout) {
      this.details = { timeout };
    }
  }
}
