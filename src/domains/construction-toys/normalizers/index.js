/**
 * Normalizers pour le domaine construction-toys
 * 
 * Exporte tous les normalizers disponibles pour les jouets de construction
 */

export { BricksetNormalizer } from './brickset.normalizer.js';
export { RebrickableNormalizer } from './rebrickable.normalizer.js';
export { LegoNormalizer } from './lego.normalizer.js';

// Normalizers à implémenter
// export { PlaymobilNormalizer } from './playmobil.normalizer.js';
// export { KlickypediaNormalizer } from './klickypedia.normalizer.js';
// export { MegaNormalizer } from './mega.normalizer.js';

export default {
  brickset: 'BricksetNormalizer',
  rebrickable: 'RebrickableNormalizer',
  lego: 'LegoNormalizer',
};
