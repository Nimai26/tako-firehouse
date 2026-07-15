/**
 * Shared Errors - Export centralisé
 */

export { AppError } from './app-error.js';
export { 
  NotFoundError, 
  ValidationError, 
  RateLimitError,
  ProviderError,
  BadGatewayError,
  TimeoutError
} from './http-errors.js';
