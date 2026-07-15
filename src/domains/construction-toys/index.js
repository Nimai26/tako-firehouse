/**
 * Domain: Construction Toys
 * 
 * Jouets de construction : LEGO, Playmobil, Mega Construx, etc.
 * 
 * PROVIDERS DISPONIBLES :
 * - brickset: API officielle Brickset (LEGO) ✅
 * - rebrickable: Base de données communautaire (LEGO) ✅
 * - bricklink: Marketplace LEGO - TODO
 * - lego: Site officiel LEGO (scraping + GraphQL) - TODO
 * - playmobil: Site officiel Playmobil (scraping) - TODO
 * - klickypedia: Base de données Playmobil - TODO
 * - mega: Mega Construx (SearchSpring API) - TODO
 * 
 * TYPE DE CONTENU : construct_toy
 */

export { router } from './routes.js';

// Providers
export { BricksetProvider } from './providers/brickset.provider.js';
export { RebrickableProvider } from './providers/rebrickable.provider.js';

// Normalizers
export { BricksetNormalizer } from './normalizers/brickset.normalizer.js';
export { RebrickableNormalizer } from './normalizers/rebrickable.normalizer.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY - Instanciation dynamique des providers
// ═══════════════════════════════════════════════════════════════════════════════

const providerFactories = {
  brickset: () => import('./providers/brickset.provider.js').then(m => new m.BricksetProvider()),
  rebrickable: () => import('./providers/rebrickable.provider.js').then(m => new m.RebrickableProvider())
  // TODO: Ajouter les autres providers
  // bricklink: () => import('./providers/bricklink.provider.js').then(m => new m.BricklinkProvider()),
  // lego: () => import('./providers/lego.provider.js').then(m => new m.LegoProvider()),
  // playmobil: () => import('./providers/playmobil.provider.js').then(m => new m.PlaymobilProvider()),
  // mega: () => import('./providers/mega.provider.js').then(m => new m.MegaProvider()),
};

/**
 * Obtenir une instance de provider
 * @param {string} name - Nom du provider
 * @returns {Promise<import('../../core/providers/BaseProvider.js').BaseProvider>}
 */
export async function getProvider(name) {
  const factory = providerFactories[name];
  if (!factory) {
    const available = Object.keys(providerFactories).join(', ');
    throw new Error(`Provider inconnu: ${name}. Disponibles: ${available}`);
  }
  return factory();
}

/**
 * Liste des providers disponibles dans ce domaine
 */
export const availableProviders = Object.keys(providerFactories);

export default {
  getProvider,
  availableProviders
};
