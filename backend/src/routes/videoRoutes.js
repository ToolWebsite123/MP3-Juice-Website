// ✅ FINAL: Video Routes - Clean URLs Support + Enhanced Error Handling
import express from "express";
import {
  getVideoInfo,
  createVideoJob,
  checkJobStatus,
  downloadResultFile,
  cancelJob,
  searchHandler,
  getVideoResult,
} from "../controllers/videoController.js";

import { getSuggestions } from "../controllers/suggestionController.js";
import logger from "../utils/logger.js";

const router = express.Router();

/* ----------------------------------------------------------
   🛡️ REQUEST LOGGER MIDDLEWARE
---------------------------------------------------------- */
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  logger.info(`📨 [${timestamp}] Video API: ${req.method} ${req.originalUrl}`);
  
  if (req.query && Object.keys(req.query).length > 0) {
    logger.debug(`Query params:`, req.query);
  }
  
  if (req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    if (safeBody.url) {
      safeBody.url = safeBody.url.substring(0, 50) + '...';
    }
    logger.debug(`Body params:`, safeBody);
  }
  
  next();
});

/* ----------------------------------------------------------
   🔍 SEARCH & SUGGESTIONS ROUTES
---------------------------------------------------------- */

// Search videos - GET method
router.get("/search", async (req, res, next) => {
  try {
    const query = req.query.query || req.query.q;
    logger.info(`🔍 Search request (GET): "${query}"`);
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
        message: "Please provide a search query using ?query=... or ?q=..."
      });
    }
    
    await searchHandler(req, res, next);
  } catch (error) {
    logger.error(`❌ Search error: ${error.message}`);
    next(error);
  }
});

// Search videos - POST method
router.post("/search", async (req, res, next) => {
  try {
    const query = req.body.query || req.body.q;
    logger.info(`🔍 Search request (POST): "${query}"`);
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
        message: "Please provide a search query in request body"
      });
    }
    
    await searchHandler(req, res, next);
  } catch (error) {
    logger.error(`❌ Search error: ${error.message}`);
    next(error);
  }
});

// Get search suggestions
router.get("/suggestions", async (req, res, next) => {
  try {
    const query = req.query.q || req.query.query;
    logger.debug(`💡 Suggestions request: "${query}"`);
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query parameter is required",
        message: "Please provide ?q=... or ?query=..."
      });
    }
    
    await getSuggestions(req, res, next);
  } catch (error) {
    logger.error(`❌ Suggestions error: ${error.message}`);
    next(error);
  }
});

/* ----------------------------------------------------------
   🎬 VIDEO INFO ROUTES (with Audio/Video Formats)
---------------------------------------------------------- */

// Get video info - GET method
router.get("/info", async (req, res, next) => {
  try {
    const url = req.query.url;
    
    if (!url) {
      logger.warn(`⚠️ Video info request without URL`);
      return res.status(400).json({
        success: false,
        error: "URL parameter is required",
        message: "Please provide ?url=... parameter"
      });
    }
    
    logger.info(`ℹ️ Video info request (GET): ${url.substring(0, 50)}...`);
    await getVideoInfo(req, res, next);
  } catch (error) {
    logger.error(`❌ Video info error (GET): ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: error.message,
        message: 'Failed to fetch video information'
      });
    }
  }
});

// Get video info - POST method
router.post("/info", async (req, res, next) => {
  try {
    const url = req.body.url || req.query.url;
    
    if (!url) {
      logger.warn(`⚠️ Video info request without URL`);
      return res.status(400).json({
        success: false,
        error: "URL is required",
        message: "Please provide URL in request body or query"
      });
    }
    
    logger.info(`ℹ️ Video info request (POST): ${url.substring(0, 50)}...`);
    await getVideoInfo(req, res, next);
  } catch (error) {
    logger.error(`❌ Video info error (POST): ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false,
        error: error.message,
        message: 'Failed to fetch video information'
      });
    }
  }
});

/* ----------------------------------------------------------
   📥 DOWNLOAD JOB ROUTES
---------------------------------------------------------- */

// Create download job
router.post("/download", async (req, res, next) => {
  try {
    const { url, format, quality } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: "URL is required",
        message: "Please provide video URL"
      });
    }
    
    logger.info(`📥 Download job request: ${format || 'auto'} @ ${quality || 'auto'}`);
    await createVideoJob(req, res, next);
  } catch (error) {
    logger.error(`❌ Download job error: ${error.message}`);
    next(error);
  }
});

// Alternative endpoint for job creation
router.post("/job", async (req, res, next) => {
  try {
    const { url, format, quality } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: "URL is required",
        message: "Please provide video URL"
      });
    }
    
    logger.info(`📥 Job creation request: ${format || 'auto'} @ ${quality || 'auto'}`);
    await createVideoJob(req, res, next);
  } catch (error) {
    logger.error(`❌ Job creation error: ${error.message}`);
    next(error);
  }
});

/* ----------------------------------------------------------
   📊 JOB STATUS ROUTES
---------------------------------------------------------- */

router.get("/status/:id", async (req, res, next) => {
  try {
    logger.debug(`📊 Status check: ${req.params.id}`);
    await checkJobStatus(req, res, next);
  } catch (error) {
    logger.error(`❌ Status check error: ${error.message}`);
    next(error);
  }
});

router.get("/jobs/:id", async (req, res, next) => {
  try {
    logger.debug(`📊 Job info: ${req.params.id}`);
    await checkJobStatus(req, res, next);
  } catch (error) {
    logger.error(`❌ Job info error: ${error.message}`);
    next(error);
  }
});

router.get("/jobs/:id/status", async (req, res, next) => {
  try {
    logger.debug(`📊 Job status: ${req.params.id}`);
    await checkJobStatus(req, res, next);
  } catch (error) {
    logger.error(`❌ Job status error: ${error.message}`);
    next(error);
  }
});

/* ----------------------------------------------------------
   📥 DOWNLOAD FILE ROUTES
---------------------------------------------------------- */

router.get("/download/:id", async (req, res, next) => {
  try {
    logger.info(`📥 Download file: ${req.params.id}`);
    await downloadResultFile(req, res, next);
  } catch (error) {
    logger.error(`❌ Download file error: ${error.message}`);
    if (!res.headersSent) {
      next(error);
    }
  }
});

router.get("/jobs/:id/download", async (req, res, next) => {
  try {
    logger.info(`📥 Download file (jobs): ${req.params.id}`);
    await downloadResultFile(req, res, next);
  } catch (error) {
    logger.error(`❌ Download file error: ${error.message}`);
    if (!res.headersSent) {
      next(error);
    }
  }
});

router.get("/file/:id", async (req, res, next) => {
  try {
    logger.info(`📥 Download file (direct): ${req.params.id}`);
    await downloadResultFile(req, res, next);
  } catch (error) {
    logger.error(`❌ Download file error: ${error.message}`);
    if (!res.headersSent) {
      next(error);
    }
  }
});

/* ----------------------------------------------------------
   📋 GET RESULT INFO
---------------------------------------------------------- */

router.get("/result/:id", async (req, res, next) => {
  try {
    logger.info(`📋 Result info: ${req.params.id}`);
    await getVideoResult(req, res, next);
  } catch (error) {
    logger.error(`❌ Result info error: ${error.message}`);
    next(error);
  }
});

router.get("/jobs/:id/result", async (req, res, next) => {
  try {
    logger.info(`📋 Result info (jobs): ${req.params.id}`);
    await getVideoResult(req, res, next);
  } catch (error) {
    logger.error(`❌ Result info error: ${error.message}`);
    next(error);
  }
});

/* ----------------------------------------------------------
   ❌ CANCEL JOB ROUTES
---------------------------------------------------------- */

router.delete("/jobs/:id/cancel", async (req, res, next) => {
  try {
    logger.info(`❌ Cancel job (DELETE): ${req.params.id}`);
    await cancelJob(req, res, next);
  } catch (error) {
    logger.error(`❌ Cancel job error: ${error.message}`);
    next(error);
  }
});

router.post("/jobs/:id/cancel", async (req, res, next) => {
  try {
    logger.info(`❌ Cancel job (POST): ${req.params.id}`);
    await cancelJob(req, res, next);
  } catch (error) {
    logger.error(`❌ Cancel job error: ${error.message}`);
    next(error);
  }
});

router.delete("/cancel/:id", async (req, res, next) => {
  try {
    logger.info(`❌ Cancel job: ${req.params.id}`);
    await cancelJob(req, res, next);
  } catch (error) {
    logger.error(`❌ Cancel job error: ${error.message}`);
    next(error);
  }
});

/* ----------------------------------------------------------
   🧪 TEST & HEALTH ROUTES (Development/Staging)
---------------------------------------------------------- */
if (process.env.NODE_ENV !== "production") {
  router.get("/test", (req, res) => {
    logger.info("🧪 Test route accessed");
    res.json({
      success: true,
      status: "healthy",
      service: "Video API",
      message: "✅ Video routes are working perfectly!",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      features: {
        search: true,
        suggestions: true,
        videoInfo: true,
        download: true,
        cleanURLs: true,
        noPageReload: true,
        formats: ['mp3', 'mp4'],
        audioQualities: ['64kbps', '96kbps', '128kbps', '192kbps', '256kbps', '320kbps'],
        videoQualities: ['144p', '240p', '360p', '480p', '720p', '1080p', 'auto']
      },
      availableRoutes: {
        search: [
          "GET  /api/video/search?query=...",
          "POST /api/video/search"
        ],
        suggestions: [
          "GET  /api/video/suggestions?q=..."
        ],
        videoInfo: [
          "GET  /api/video/info?url=...",
          "POST /api/video/info"
        ],
        download: [
          "POST /api/video/download",
          "POST /api/video/job"
        ],
        status: [
          "GET  /api/video/status/:id",
          "GET  /api/video/jobs/:id",
          "GET  /api/video/jobs/:id/status"
        ],
        downloadFile: [
          "GET  /api/video/download/:id",
          "GET  /api/video/jobs/:id/download",
          "GET  /api/video/file/:id"
        ],
        result: [
          "GET  /api/video/result/:id",
          "GET  /api/video/jobs/:id/result"
        ],
        cancel: [
          "DELETE /api/video/jobs/:id/cancel",
          "POST   /api/video/jobs/:id/cancel",
          "DELETE /api/video/cancel/:id"
        ]
      }
    });
  });

  router.get("/health", (req, res) => {
    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        total: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
    });
  });
}

/* ----------------------------------------------------------
   ❌ 404 HANDLER (Must be LAST)
---------------------------------------------------------- */
router.all("*", (req, res) => {
  logger.warn(`❌ Unknown video route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: "Route not found",
    message: `Route ${req.originalUrl} not found in video API`,
    requestedPath: req.originalUrl,
    method: req.method,
    availableEndpoints: {
      search: "GET /api/video/search?query=...",
      suggestions: "GET /api/video/suggestions?q=...",
      videoInfo: "GET/POST /api/video/info?url=...",
      download: "POST /api/video/download",
      status: "GET /api/video/status/:id",
      downloadFile: "GET /api/video/download/:id",
      result: "GET /api/video/result/:id",
      cancel: "DELETE /api/video/jobs/:id/cancel"
    },
    hint: "Check the documentation or use /api/video/test endpoint to see all available routes"
  });
});

export default router;