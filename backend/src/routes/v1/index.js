/* ✅ API v1 Router - Consolidated RESTful Routes
 * Main entry point for versioned API
 * 
 * All video-related endpoints are under /api/v1/video/*
 */

import express from 'express';
import videoRoutes from './videoRoutes.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Mount versioned routes
router.use('/video', videoRoutes);

/* ----------------------------------------------------------
   📚 API DOCUMENTATION ROOT
---------------------------------------------------------- */
router.get('/', (req, res) => {
  res.json({
    success: true,
    api: 'YouTube Downloader API',
    version: '1.0.0',
    basePath: '/api/v1',
    description: 'RESTful API for YouTube video downloading',
    endpoints: {
      video: {
        base: '/api/v1/video',
        routes: [
          'POST   /api/v1/video/info          - Get video metadata and formats',
          'GET    /api/v1/video/formats/:videoId - Get formats by video ID',
          'GET    /api/v1/video/download      - Get download URL',
          'GET    /api/v1/video/search        - Search videos',
          'GET    /api/v1/video/suggestions   - Get search suggestions',
          'GET    /api/v1/video/health        - Health check'
        ],
        documentation: 'GET /api/v1/video - See detailed endpoint documentation'
      }
    },
    migration: {
      note: 'This is the new consolidated RESTful API. Old routes are deprecated.',
      oldRoutes: {
        '/api/video/info': '→ POST /api/v1/video/info',
        '/api/download/info': '→ POST /api/v1/video/info',
        '/api/download/proxy': '→ GET /api/v1/video/download',
        '/api/video/search': '→ GET /api/v1/video/search',
        '/api/video/suggestions': '→ GET /api/v1/video/suggestions',
        '/api/y2mate/info': '→ POST /api/v1/video/info',
        '/api/info': '→ POST /api/v1/video/info'
      },
      deadline: 'v2.0.0 (deprecated routes will be removed)'
    },
    support: {
      documentation: 'GET /api/v1 or GET /api/v1/video for detailed docs',
      versioning: 'All routes are versioned under /api/v1 for future compatibility'
    }
  });
});

logger.info('✅ API v1 routes registered');

export default router;
