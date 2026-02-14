

import express from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import {
  getVideoInfo,
  searchHandler,
} from '../../controllers/videoController.js';
import {
  proxyDownload,
  mergeDASH,
} from '../../controllers/downloadController.js';
import { getSuggestions } from '../../controllers/suggestionController.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/* ----------------------------------------------------------
   📋 API DOCUMENTATION
---------------------------------------------------------- */
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'YouTube Downloader API',
    version: '1.0.0',
    basePath: '/api/v1/video',
    description: 'RESTful API for YouTube video downloading',
    endpoints: {
      info: {
        method: 'POST',
        path: '/api/v1/video/info',
        description: 'Get video metadata and available formats',
        body: {
          url: 'YouTube video URL (required)',
          videoId: 'Video ID (optional, can be extracted from URL)'
        },
        example: {
          request: 'POST /api/v1/video/info',
          body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
        },
        response: {
          success: true,
          video: {
            title: 'Video Title',
            videoId: 'dQw4w9WgXcQ',
            thumbnail: 'https://...',
            duration: 180,
            uploader: 'Channel Name',
            view_count: 1000000
          },
          videoFormats: [
            { quality: '720p', qualityLabel: '720p', filesize: '50 MB', directUrl: 'https://...' }
          ],
          audioFormats: [
            { bitrate: 320, quality: '320kbps', filesize: '5 MB', directUrl: 'https://...' }
          ]
        }
      },
      formats: {
        method: 'GET',
        path: '/api/v1/video/formats/:videoId',
        description: 'Get available formats for a video by ID',
        params: {
          videoId: 'YouTube video ID (required)'
        },
        example: 'GET /api/v1/video/formats/dQw4w9WgXcQ',
        response: {
          success: true,
          videoFormats: [{ quality: '720p', filesize: '50 MB', directUrl: 'https://...' }],
          audioFormats: [{ bitrate: 320, filesize: '5 MB', directUrl: 'https://...' }]
        }
      },
      download: {
        method: 'GET',
        path: '/api/v1/video/download',
        description: 'Get download URL for specific format/quality',
        query: {
          videoId: 'Video ID (required)',
          quality: 'Quality (e.g., 720, 1080) or bitrate (e.g., 128, 320)',
          format: 'Format type: mp4 or mp3 (default: mp4)'
        },
        example: 'GET /api/v1/video/download?videoId=dQw4w9WgXcQ&quality=720&format=mp4',
        response: {
          success: true,
          directUrl: 'https://googlevideo.com/...',
          needsMerge: false,
          isProgressive: true,
          title: 'Video Title',
          filename: 'Video_Title_720p.mp4',
          quality: '720p',
          format: 'mp4'
        }
      },
      search: {
        method: 'GET',
        path: '/api/v1/video/search',
        description: 'Search YouTube videos',
        query: {
          query: 'Search query (required)',
          q: 'Alternative query parameter (alias for query)'
        },
        example: 'GET /api/v1/video/search?query=music',
        response: {
          success: true,
          results: [
            {
              id: 'videoId',
              title: 'Video Title',
              thumbnail: 'https://...',
              duration: 180,
              uploader: 'Channel Name'
            }
          ]
        }
      },
      suggestions: {
        method: 'GET',
        path: '/api/v1/video/suggestions',
        description: 'Get search suggestions',
        query: {
          q: 'Search query (required)',
          query: 'Alternative query parameter (alias for q)'
        },
        example: 'GET /api/v1/video/suggestions?q=music',
        response: {
          success: true,
          suggestions: ['music video', 'music playlist', 'music download']
        }
      },
      merge: {
        method: 'GET',
        path: '/api/v1/video/merge',
        description: 'Server-side merge for DASH formats (1080p+) - Internal use',
        query: {
          videoId: 'Video ID (required)',
          quality: 'Quality (required, e.g., 1080)',
          format: 'Format type (default: mp4)'
        },
        note: 'This endpoint is used internally for DASH format merging. Frontend should use /download which handles this automatically.'
      }
    },
    deprecatedRoutes: {
      note: 'The following routes are deprecated and will be removed in v2.0. Please migrate to /api/v1/video/*',
      mappings: {
        '/api/video/info': '→ POST /api/v1/video/info',
        '/api/download/info': '→ POST /api/v1/video/info',
        '/api/download/proxy': '→ GET /api/v1/video/download',
        '/api/video/search': '→ GET /api/v1/video/search',
        '/api/video/suggestions': '→ GET /api/v1/video/suggestions',
        '/api/y2mate/info': '→ POST /api/v1/video/info',
        '/api/info': '→ POST /api/v1/video/info'
      }
    }
  });
});

/* ----------------------------------------------------------
   🎬 POST /api/v1/video/info
   Get video metadata and available formats
---------------------------------------------------------- */
router.post('/info', asyncHandler(async (req, res) => {
  const { url, videoId } = req.body;
  
  if (!url && !videoId) {
    return res.status(400).json({
      success: false,
      error: 'URL or videoId is required',
      message: 'Please provide either a YouTube URL or videoId in the request body'
    });
  }

  await getVideoInfo(req, res);
}));

/* ----------------------------------------------------------
   📋 GET /api/v1/video/formats/:videoId
   Get available formats for a video (by videoId)
---------------------------------------------------------- */
router.get('/formats/:videoId', asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Create modified request with URL in body
  const modifiedReq = {
    ...req,
    body: { url, videoId },
    query: { ...req.query, url, videoId }
  };
  
  await getVideoInfo(modifiedReq, res);
}));

/* ----------------------------------------------------------
   ⬇️ GET /api/v1/video/download
   Get download URL for specific format/quality
---------------------------------------------------------- */
router.get('/download', asyncHandler(async (req, res) => {
  const { videoId, quality, format } = req.query;
  
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'videoId is required',
      message: 'Please provide videoId as a query parameter'
    });
  }

  // Use proxyDownload controller (returns JSON with directUrl)
  await proxyDownload(req, res);
}));

/* ----------------------------------------------------------
   🔀 GET /api/v1/video/merge
   Server-side merge for DASH formats (1080p+)
   Note: This is used internally by /download endpoint
---------------------------------------------------------- */
router.get('/merge', asyncHandler(async (req, res) => {
  const { videoId, quality, format } = req.query;
  
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'videoId is required',
      message: 'Please provide videoId as a query parameter'
    });
  }

  // Import mergeDASH from download controller (dynamic import to avoid circular deps)
  const { mergeDASH } = await import('../../controllers/downloadController.js');
  if (mergeDASH) {
    await mergeDASH(req, res);
  } else {
    return res.status(503).json({
      success: false,
      error: 'Merge functionality not available'
    });
  }
}));

/* ----------------------------------------------------------
   📡 GET /api/v1/video/stream
   Stream video from CDN to frontend (bypasses CORS)
---------------------------------------------------------- */
router.get('/stream', asyncHandler(async (req, res) => {
  const { videoId, quality, format } = req.query;
  
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: 'videoId is required',
      message: 'Please provide videoId as a query parameter'
    });
  }

  // Import streamVideo from download controller
  const { streamVideo } = await import('../../controllers/downloadController.js');
  if (streamVideo) {
    await streamVideo(req, res);
  } else {
    return res.status(503).json({
      success: false,
      error: 'Streaming functionality not available'
    });
  }
}));

/* ----------------------------------------------------------
   🔍 GET /api/v1/video/search
   Search YouTube videos
---------------------------------------------------------- */
router.get('/search', asyncHandler(async (req, res) => {
  const query = req.query.query || req.query.q;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Search query is required',
      message: 'Please provide a search query using ?query=... or ?q=...'
    });
  }
  
  await searchHandler(req, res);
}));

/* ----------------------------------------------------------
   💡 GET /api/v1/video/suggestions
   Get search suggestions
---------------------------------------------------------- */
router.get('/suggestions', asyncHandler(async (req, res) => {
  const query = req.query.q || req.query.query;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter is required',
      message: 'Please provide ?q=... or ?query=...'
    });
  }
  
  await getSuggestions(req, res);
}));

/* ----------------------------------------------------------
   🏥 GET /api/v1/video/health
   Health check
---------------------------------------------------------- */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'Video API v1',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

export default router;
