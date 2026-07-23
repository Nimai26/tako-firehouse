/**
 * Routes manga-news (mangas VF + magazines, provider live via FlareSolverr).
 *   GET /api/anime-manga/manga-news/search?q=&limit=
 *   GET /api/anime-manga/manga-news/health
 *   GET /api/anime-manga/manga-news/serie/:slug     (détail + volumes)
 * @module domains/anime-manga/routes/manga-news
 */
import express from 'express';
import * as provider from '../providers/manga-news.provider.js';
import * as normalizer from '../normalizers/manga-news.normalizer.js';

const router = express.Router();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit, max = 20 } = req.query;
  if (!q) return res.status(400).json({ success: false, error: 'Paramètre "q" requis' });
  const raw = await provider.searchMangaNews(q, { maxResults: parseInt(limit || max, 10) || 20 });
  const n = normalizer.normalizeSearchResults(raw);
  res.json({ success: true, provider: 'manga-news', domain: 'anime-manga', query: q,
    total: n.total, count: n.data.length, data: n.data,
    meta: { fetchedAt: new Date().toISOString() } });
}));

router.get('/health', asyncHandler(async (_req, res) => {
  res.json({ success: true, provider: 'manga-news', ...(await provider.healthCheck()) });
}));

router.get('/serie/:slug', asyncHandler(async (req, res) => {
  const raw = await provider.getMangaNewsSerie(req.params.slug);
  if (!raw) return res.status(404).json({ success: false, error: 'série introuvable' });
  res.json({ success: true, provider: 'manga-news', data: normalizer.normalizeSerie(raw) });
}));

export default router;
