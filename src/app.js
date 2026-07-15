/**
 * Tako API - Configuration Express
 * 
 * Configure l'application Express avec les middlewares
 * Ne contient PAS le montage des routes (fait dans chaque domaine)
 */

import express from 'express';
import compression from 'compression';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { 
  corsMiddleware, 
  securityHeaders, 
  requestId, 
  requestLogger,
  errorHandler 
} from './shared/middleware/index.js';
import { env } from './config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const app = express();

// ===========================================
// Middlewares globaux
// ===========================================

// Compression gzip
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Parser JSON
app.use(express.json({ limit: '1mb' }));

// CORS
app.use(corsMiddleware);

// Headers de sécurité
app.use(securityHeaders);

// Request ID unique
app.use(requestId);

// Logger des requêtes
app.use(requestLogger);

// ===========================================
// Fichiers statiques (stockage archives)
// ===========================================

const storagePath = env.storage?.path || '/data/tako-storage';
if (existsSync(storagePath)) {
  app.use('/files', express.static(storagePath, {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    immutable: false,
    setHeaders: (res, filePath) => {
      // CORS pour les fichiers statiques
      res.set('Access-Control-Allow-Origin', '*');
      // Content-Type adapté
      if (filePath.endsWith('.pdf')) {
        res.set('Content-Type', 'application/pdf');
      }
    }
  }));
}

// ===========================================
// Routes système
// ===========================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: config.env.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Version
app.get('/version', (req, res) => {
  res.json({
    name: 'Tako API',
    version: config.env.version,
    nodeEnv: config.env.nodeEnv
  });
});

// ===========================================
// Documentation API
// ===========================================

/**
 * GET /docs
 * Liste toutes les documentations OpenAPI disponibles
 */
app.get('/docs', (req, res) => {
  try {
    const docsPath = join(__dirname, '..', 'docs', 'api');
    const files = readdirSync(docsPath)
      .filter(f => f.endsWith('.openapi.yaml') || f.endsWith('.openapi.json'));
    
    res.json({
      success: true,
      message: 'Tako API Documentation',
      version: config.env.version,
      documentation: files.map(f => ({
        name: f.replace('.openapi.yaml', '').replace('.openapi.json', ''),
        file: f,
        url: `/docs/${f.replace('.openapi.yaml', '').replace('.openapi.json', '')}`,
        specUrl: `/docs/${f}`
      })),
      externalDocs: {
        swagger: 'https://editor.swagger.io',
        hint: 'Copiez le contenu de specUrl dans Swagger Editor pour visualiser'
      }
    });
  } catch {
    res.json({
      success: true,
      message: 'Tako API Documentation',
      version: config.env.version,
      documentation: []
    });
  }
});

/**
 * GET /docs/:spec
 * Retourne le fichier OpenAPI spécifié
 */
app.get('/docs/:spec', (req, res) => {
  const { spec } = req.params;
  const docsPath = join(__dirname, '..', 'docs', 'api');
  
  // Essayer les extensions possibles
  const extensions = ['.openapi.yaml', '.openapi.json', '.yaml', '.json'];
  let filePath = null;
  let content = null;
  
  for (const ext of extensions) {
    const tryPath = join(docsPath, spec + ext);
    try {
      content = readFileSync(tryPath, 'utf-8');
      filePath = tryPath;
      break;
    } catch {
      // Essayer le fichier tel quel
      try {
        const exactPath = join(docsPath, spec);
        content = readFileSync(exactPath, 'utf-8');
        filePath = exactPath;
        break;
      } catch {
        continue;
      }
    }
  }
  
  if (!content) {
    return res.status(404).json({
      success: false,
      error: 'Documentation not found',
      hint: 'Use GET /docs to list available documentation'
    });
  }
  
  // Déterminer le content-type
  const isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');
  res.type(isYaml ? 'text/yaml' : 'application/json');
  res.send(content);
});

// ===========================================
// Montage des domaines
// ===========================================

import { router as constructionToysRouter } from './domains/construction-toys/routes.js';
import booksRouter from './domains/books/routes.js';
import comicsRouter from './domains/comics/routes.js';
import animeMangaRouter from './domains/anime-manga/routes.js';
import { router as mediaRouter } from './domains/media/routes.js';
import { router as musicRouter } from './domains/music/index.js';
import videogamesRouter from './domains/videogames/routes/index.js';
import boardgamesRouter from './domains/boardgames/routes/index.js';
import collectiblesRouter from './domains/collectibles/routes/index.js';
import stickerAlbumsRouter from './domains/sticker-albums/routes/index.js';
import { router as tcgRouter } from './domains/tcg/index.js';
import ecommerceRouter from './domains/ecommerce/index.js';
import cacheRouter from './core/routes/cache.routes.js';

app.use('/api/construction-toys', constructionToysRouter);
app.use('/api/books', booksRouter);
app.use('/api/comics', comicsRouter);
app.use('/api/anime-manga', animeMangaRouter);
app.use('/api/media', mediaRouter);
app.use('/api/music', musicRouter);
app.use('/api/videogames', videogamesRouter);
app.use('/api/boardgames', boardgamesRouter);
app.use('/api/collectibles', collectiblesRouter);
app.use('/api/sticker-albums', stickerAlbumsRouter);
app.use('/api/tcg', tcgRouter);
app.use('/api/ecommerce', ecommerceRouter);
app.use('/api/cache', cacheRouter);

// ===========================================
// Gestion d'erreurs (doit être en dernier)
// ===========================================

app.use(errorHandler);

// 404 pour routes non trouvées
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: ['/health', '/version']
  });
});
