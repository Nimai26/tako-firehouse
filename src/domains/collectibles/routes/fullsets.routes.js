/**
 * Full-sets Routes — archive partagée des listes de référence de collections
 *
 * Routes :
 * - GET  /              — liste des collections de référence archivées
 * - GET  /:idOrSlug     — détail d'une collection + ses entrées
 * - POST /contribute    — verse (ou met à jour) une collection complète
 *
 * Le versement est fait par Firehouse quand un full-set est créé ou modifié à la main.
 * Ne transite QUE le catalogue (référence, titres VO/VF, année, image) — jamais le
 * pointage du collectionneur.
 *
 * @module domains/collectibles/routes/fullsets
 */

import express from 'express';
import { logger } from '../../../shared/utils/logger.js';
import { asyncHandler } from '../../../shared/utils/async-handler.js';
import { contributeFullset, listFullsets, getFullset } from '../providers/fullsets.provider.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const offset = parseInt(req.query.offset, 10) || 0;
  const data = await listFullsets({ limit, offset });
  res.json({ success: true, provider: 'fullsets', domain: 'collectibles', data });
}));

router.post('/contribute', asyncHandler(async (req, res) => {
  const { slug, name, description, kind, source, sourceRef, contributor, entries } = req.body || {};
  logger.info(`[Fullsets] Contribution reçue : ${slug} (${(entries || []).length} entrée(s))`);
  try {
    const data = await contributeFullset({
      slug, name, description, kind, source, sourceRef, contributor, entries,
    });
    res.json({ success: true, provider: 'fullsets', domain: 'collectibles', data });
  } catch (error) {
    const code = error.message.includes('requis') ? 400 : 500;
    if (code >= 500) throw error;
    return res.status(code).json({ success: false, error: { code: 'ERROR', message: error.message } });
  }
}));

// après /contribute, sinon « contribute » serait capté comme un identifiant
router.get('/:idOrSlug', asyncHandler(async (req, res) => {
  const data = await getFullset(req.params.idOrSlug);
  if (!data) {
    return res.status(404).json({
      success: false, error: { code: 'NOT_FOUND', message: 'Collection de référence non trouvée' },
    });
  }
  res.json({ success: true, provider: 'fullsets', domain: 'collectibles', data });
}));

export default router;
