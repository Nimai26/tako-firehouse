/**
 * Infrastructure - Database Index
 * Export du module de cache PostgreSQL
 */

export { initDatabase, closeDatabase, query, queryOne, getPoolStats } from './connection.js';
export { createProviderCache, withCache, getCacheInfo } from './cache-wrapper.js';
