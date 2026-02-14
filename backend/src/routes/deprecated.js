/* ⚠️ DEPRECATED ROUTES - Backward Compatibility Only
 * These routes are deprecated and will be removed in v2.0.0
 * Please migrate to /api/v1/video/* routes
 */

import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// Deprecation warning middleware
router.use((req, res, next) => {
  logger.warn(`⚠️ [DEPRECATED] ${req.method} ${req.originalUrl} - Use /api/v1/video/* instead`);
  
  // Add deprecation header
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader('X-API-Migration', '/api/v1/video');
  
  next();
});

/* ----------------------------------------------------------
   🔄 DEPRECATED ROUTE HANDLERS
   These redirect to v1 routes or show migration info
---------------------------------------------------------- */

// Deprecated: /api/download/info → /api/v1/video/info
router.get('/api/download/info', (req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    error: 'This endpoint is deprecated',
    message: 'Please use POST /api/v1/video/info instead',
    migration: {
      old: 'GET /api/download/info?url=...',
      new: 'POST /api/v1/video/info',
      body: { url: req.query.url, videoId: req.query.videoId }
    },
    version: '2.0.0'
  });
});

// Deprecated: /api/download/proxy → /api/v1/video/download
router.get('/api/download/proxy', (req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    error: 'This endpoint is deprecated',
    message: 'Please use GET /api/v1/video/download instead',
    migration: {
      old: 'GET /api/download/proxy?videoId=...&quality=...&format=...',
      new: 'GET /api/v1/video/download?videoId=...&quality=...&format=...'
    },
    version: '2.0.0'
  });
});

// Deprecated: /api/y2mate/info → /api/v1/video/info
router.all('/api/y2mate/info', (req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    error: 'This endpoint is deprecated',
    message: 'Please use POST /api/v1/video/info instead',
    migration: {
      old: 'GET/POST /api/y2mate/info?url=...',
      new: 'POST /api/v1/video/info',
      body: { url: req.query.url || req.body.url }
    },
    version: '2.0.0'
  });
});

// Deprecated: /api/info → /api/v1/video/info
router.post('/api/info', (req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    error: 'This endpoint is deprecated',
    message: 'Please use POST /api/v1/video/info instead',
    migration: {
      old: 'POST /api/info',
      new: 'POST /api/v1/video/info',
      body: req.body
    },
    version: '2.0.0'
  });
});

export default router;

