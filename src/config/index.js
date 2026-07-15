/**
 * Configuration - Export centralisé
 * 
 * Point d'entrée unique pour toute la configuration
 */

import { env } from './env.js';
import { sources } from './sources.js';
import { cache } from './cache.js';

export const config = {
  env,
  sources,
  cache
};

export { env, sources, cache };
