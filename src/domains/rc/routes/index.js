/**
 * Routes du domaine RC — véhicules radiocommandés (providers LIVE).
 * Agrège RCScrapyard (toutes marques) et, à venir, Tamiyabase.
 * @module domains/rc/routes
 */
import express from 'express';
import rcscrapyardRoutes from './rcscrapyard.routes.js';

const router = express.Router();

router.use('/rcscrapyard', rcscrapyardRoutes);

router.get('/', (_req, res) => {
  res.json({
    domain: 'rc',
    description: 'Véhicules radiocommandés (RC) — bases de modèles',
    providers: {
      rcscrapyard: {
        name: 'RCScrapyard',
        baseUrl: '/api/rc/rcscrapyard',
        search: 'GET /api/rc/rcscrapyard/search?q={query}',
        details: 'GET /api/rc/rcscrapyard/{slug}'
      }
    }
  });
});

export default router;
