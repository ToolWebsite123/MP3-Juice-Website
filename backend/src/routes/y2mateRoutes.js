// ═══════════════════════════════════════════════════════════════════════
// 🎯 Y2MATE-STYLE API ROUTES
// ═══════════════════════════════════════════════════════════════════════
// Routes that work exactly like Y2Mate:
//   - Server never downloads/merges files
//   - Returns JSON with direct YouTube CDN URLs
//   - Only progressive MP4 and MP3 formats
// ═══════════════════════════════════════════════════════════════════════

import express from 'express';
import { getY2MateInfo, healthCheck } from '../controllers/y2mateController.js';
import logger from '../utils/logger.js';

const router = express.Router();

// CORS headers for all routes
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// OPTIONS handler
router.options('*', (req, res) => {
  res.sendStatus(200);
});

/* ----------------------------------------------------------
   🎬 GET VIDEO INFO WITH DIRECT URLs
---------------------------------------------------------- */

// GET /api/y2mate/info?url=...
router.get('/info', async (req, res, next) => {
  try {
    await getY2MateInfo(req, res);
  } catch (error) {
    logger.error(`❌ [Y2MATE] GET /info error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
});

// POST /api/y2mate/info
router.post('/info', async (req, res, next) => {
  try {
    await getY2MateInfo(req, res);
  } catch (error) {
    logger.error(`❌ [Y2MATE] POST /info error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  }
});

/* ----------------------------------------------------------
   🏥 HEALTH CHECK
---------------------------------------------------------- */

router.get('/health', healthCheck);

/* ----------------------------------------------------------
   📚 API DOCUMENTATION
---------------------------------------------------------- */

router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'Y2Mate API',
    version: '1.0.0',
    description: 'YouTube video info API - Returns direct playable URLs (no server-side downloads)',
    endpoints: {
      getInfo: {
        method: 'GET or POST',
        path: '/api/y2mate/info',
        params: {
          url: 'YouTube video URL (required)'
        },
        example: '/api/y2mate/info?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        response: 'JSON with video info and direct CDN URLs'
      },
      health: {
        method: 'GET',
        path: '/api/y2mate/health',
        description: 'Service health check'
      }
    },
    features: {
      noFileStorage: 'Server never downloads or stores files',
      directCDNUrls: 'All URLs are direct YouTube CDN links',
      progressiveFormatsOnly: 'Only progressive MP4 (video+audio) and MP3 formats',
      cookieRotation: 'Automatic cookie rotation for age-restricted videos',
      instantDownload: 'Browser downloads directly from CDN'
    },
    sampleResponse: {
      success: true,
      video: {
        id: 'dQw4w9WgXcQ',
        title: 'Video Title',
        duration: 180,
        thumbnail: 'https://...',
        channel: 'Channel Name'
      },
      formats: {
        video: [
          {
            quality: '1080p',
            label: '1080p (.mp4)',
            extension: 'mp4',
            filesize: '25 MB',
            url: 'https://googlevideo.com/...',
            hasAudio: true
          }
        ],
        audio: [
          {
            quality: '256kbps',
            label: 'MP3 256kbps',
            extension: 'mp3',
            filesize: '5 MB',
            url: 'https://googlevideo.com/...'
          }
        ]
      }
    }
  });
});

export default router;








