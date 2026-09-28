import express from 'express';
import logger from '../utils/logger.js';

// Controller import
let controllerAvailable = false;
let getDirectUrl, proxyDownload, mergeDASH, getDownloadProgress, downloadFile, getDownloadStatus;

try {
  const controller = await import('../controllers/downloadController.js');
  getDirectUrl = controller.getDirectUrl;
  proxyDownload = controller.proxyDownload;
  mergeDASH = controller.mergeDASH;
  getDownloadProgress = controller.getDownloadProgress;
  downloadFile = controller.downloadFile;
  getDownloadStatus = controller.getDownloadStatus;
  controllerAvailable = true;
} catch (err) {
  logger.warn?.('⚠️ Controller not found:', err.message) || console.warn('⚠️ Controller not found:', err.message);
  controllerAvailable = false;
}

const router = express.Router();

/* ----------------------------------------------------------
   🧪 HEALTH CHECK
---------------------------------------------------------- */
router.get('/health', async (req, res) => {
  try {
    if (controllerAvailable) {
      const { healthCheck } = await import('../controllers/downloadController.js');
      if (healthCheck) {
        return await healthCheck(req, res);
      }
    }

    res.json({
      success: true,
      message: 'Download API is working',
      timestamp: new Date().toISOString(),
      routes: ['/info', '/proxy', '/health'],
      mode: 'JSON Only - Direct URL Downloads',
      controllerMode: controllerAvailable ? 'Controller Active' : 'Not Available',
      version: '2.0.0'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ----------------------------------------------------------
   🎯 PRIMARY: GET INFO + FORMATS
   GET /api/download/info?url=...&videoId=...
   
   Returns: {title, formats:[{quality, type, url}]}
---------------------------------------------------------- */
router.get('/info', async (req, res) => {
  if (controllerAvailable && getDirectUrl) {
    try {
      return await getDirectUrl(req, res);
    } catch (err) {
      console.error('❌ Controller failed:', err.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to get download info',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }

  res.status(503).json({
    success: false,
    error: 'Controller not available. Please ensure downloadController is properly configured.'
  });
});

/* ----------------------------------------------------------
   🚀 PROXY DOWNLOAD ENDPOINT - Returns Direct URL (JSON Only)
   GET /api/download/proxy?videoId=...&quality=...&format=...
   
   ✅ Returns JSON with direct download URL
   ✅ Browser downloads directly from YouTube CDN
   ✅ Progressive formats: Direct CDN URL
   ✅ DASH formats (1080p+): Returns merge endpoint + separate URLs
---------------------------------------------------------- */
router.get('/proxy', async (req, res) => {
  if (controllerAvailable && proxyDownload) {
    try {
      return await proxyDownload(req, res);
    } catch (err) {
      console.error('❌ Controller failed:', err.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to get download URL',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }

  res.status(503).json({
    success: false,
    error: 'Controller not available. Please ensure downloadController is properly configured.'
  });
});

/* ----------------------------------------------------------
   🔀 DASH MERGE ENDPOINT - Server-Side Merge (1080p+)
   GET /api/download/merge?videoId=...&quality=...&format=...
   
   ✅ Streams merged video+audio for DASH formats
   ✅ Only used for 1080p+ videos that need merging
   ✅ No temp file storage - streams directly
---------------------------------------------------------- */
router.get('/merge', async (req, res) => {
  if (controllerAvailable && mergeDASH) {
    try {
      return await mergeDASH(req, res);
    } catch (err) {
      console.error('❌ Merge failed:', err.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to merge video and audio',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }

  res.status(503).json({
    success: false,
    error: 'Merge controller not available.'
  });
});

/* ----------------------------------------------------------
   🔄 DEPRECATED: DIRECT DOWNLOAD (No longer supported)
   GET /api/download/direct
---------------------------------------------------------- */
router.get('/direct', async (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Direct download deprecated. Use /api/download/info to get formats with URLs, or /api/download/proxy for single format URL.',
    redirect: '/api/download/info'
  });
});

/* ----------------------------------------------------------
   📡 OTHER ENDPOINTS
---------------------------------------------------------- */
if (controllerAvailable) {
  if (getDownloadProgress) router.get('/progress/:downloadId', getDownloadProgress);
  if (downloadFile) router.get('/file/:downloadId', downloadFile);
  if (getDownloadStatus) router.get('/status/:downloadId', getDownloadStatus);
}

export default router;