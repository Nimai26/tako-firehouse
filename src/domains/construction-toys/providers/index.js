/**
 * Providers pour le domaine construction-toys
 * 
 * Exporte tous les providers disponibles pour les jouets de construction
 */

export { BricksetProvider } from './brickset.provider.js';
export { RebrickableProvider } from './rebrickable.provider.js';
export { LegoProvider } from './lego.provider.js';
export { MegaProvider } from './mega.provider.js';

// Providers à implémenter
// export { PlaymobilProvider } from './playmobil.provider.js';
// export { KlickypediaProvider } from './klickypedia.provider.js';

/**
 * Dictionnaire des providers par nom
 */
export const providers = {
  brickset: () => import('./brickset.provider.js').then(m => new m.BricksetProvider()),
  rebrickable: () => import('./rebrickable.provider.js').then(m => new m.RebrickableProvider()),
  lego: () => import('./lego.provider.js').then(m => new m.LegoProvider()),
  mega: () => import('./mega.provider.js').then(m => new m.MegaProvider()),
  // playmobil: () => import('./playmobil.provider.js').then(m => new m.PlaymobilProvider()),
  // klickypedia: () => import('./klickypedia.provider.js').then(m => new m.KlickypediaProvider()),
};

export default providers;
