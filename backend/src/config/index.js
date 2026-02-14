// ✅ FINAL: Main Routes Index - Centralized Route Management
import express from "express";
import videoRoutes from "./videoRoutes.js";
import jobRoutes from "./jobRoutes.js";
import infoRoutes from "./infoRoutes.js";
import downloadRoutes from "./download.js";
import cleanupRoutes from "./cleanupRoutes.js";
import logger from "../utils/logger.js";

const router = express.Router();

/* ----------------------------------------------------------
   🔍 API ROOT - Documentation
---------------------------------------------------------- */
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🎬 YouTube Downloader API",
    version: "2.2.0",
    timestamp: new Date().toISOString(),
    documentation: {
      description: "RESTful API for YouTube video downloading with real-time progress tracking",
      baseUrl: req.protocol + "://" + req.get("host") + "/api",
      features: [
        "Video search with suggestions",
        "Multiple format support (MP3, MP4)",
        "Quality selection (64kbps - 320kbps for audio, 144p - 1080p for video)",
        "Real-time download progress via SSE",
        "Automatic file cleanup",
        "Resume download support (Range requests)",
        "Clean URLs (no query parameters in frontend)",
        "No page reload (SPA optimized)"
      ]
    },
    endpoints: {
      video: {
        base: "/api/video",
        routes: {
          search: "GET /api/video/search?query=...",
          suggestions: "GET /api/video/suggestions?q=...",
          info: "GET /api/video/info?url=...",
          download: "POST /api/video/download",
          status: "GET /api/video/status/:id",
          result: "GET /api/video/result/:id",
          cancel: "DELETE /api/video/jobs/:id/cancel"
        }
      },
      download: {
        base: "/api/download",
        routes: {
          start: "POST /api/download/start",
          progress: "GET /api/download/progress/:downloadId (SSE)",
          status: "GET /api/download/status/:downloadId",
          file: "GET /api/download/file/:downloadId",
          cancel: "DELETE /api/download/cancel/:downloadId"
        }
      },
      jobs: {
        base: "/api/jobs",
        routes: {
          list: "GET /api/jobs",
          create: "POST /api/jobs",
          getById: "GET /api/jobs/:id",
          delete: "DELETE /api/jobs/:id"
        }
      },
      info: {
        base: "/api/info",
        routes: {
          videoInfo: "GET /api/info?url=...",
          formats: "GET /api/info/formats?url=..."
        }
      },
      cleanup: {
        base: "/api/cleanup",
        routes: {
          stats: "GET /api/cleanup/stats",
          manual: "POST /api/cleanup/manual",
          history: "GET /api/cleanup/history"
        }
      }
    },
    exampleRequests: {
      search: {
        method: "GET",
        url: "/api/video/search?query=music",
        description: "Search for videos by keyword"
      },
      videoInfo: {
        method: "GET",
        url: "/api/video/info?url=https://youtube.com/watch?v=...",
        description: "Get video metadata and available formats"
      },
      download: {
        method: "POST",
        url: "/api/download/start",
        body: {
          url: "https://youtube.com/watch?v=...",
          format: "mp4",
          quality: "720p"
        },
        description: "Start a new download job"
      },
      progress: {
        method: "GET",
        url: "/api/download/progress/:downloadId",
        headers: {
          Accept: "text/event-stream"
        },
        description: "Get real-time download progress (SSE)"
      }
    },
    support: {
      formats: {
        audio: ["mp3", "m4a"],
        video: ["mp4", "webm"]
      },
      qualities: {
        audio: ["64kbps", "96kbps", "128kbps", "192kbps", "256kbps", "320kbps"],
        video: ["144p", "240p", "360p", "480p", "720p", "1080p"]
      }
    }
  });
});

/* ----------------------------------------------------------
   🩺 API HEALTH CHECK
---------------------------------------------------------- */
router.get("/health", async (req, res) => {
  try {
    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      services: {
        api: "operational",
        database: "operational",
        storage: "operational"
      },
      features: {
        videoDownload: true,
        audioDownload: true,
        realtimeProgress: true,
        autoCleanup: true,
        cleanURLs: true,
        noPageReload: true
      }
    });
  } catch (error) {
    logger.error(`❌ Health check error: ${error.message}`);
    res.status(500).json({
      success: false,
      status: "unhealthy",
      error: error.message
    });
  }
});

/* ----------------------------------------------------------
   📊 API STATS (Development only)
---------------------------------------------------------- */
if (process.env.NODE_ENV !== "production") {
  router.get("/stats", (req, res) => {
    res.json({
      success: true,
      stats: {
        uptime: process.uptime(),
        memory: {
          used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          total: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
          percentage: `${((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100).toFixed(2)}%`
        },
        process: {
          pid: process.pid,
          version: process.version,
          platform: process.platform
        }
      }
    });
  });
}

/* ----------------------------------------------------------
   🔗 MOUNT SUB-ROUTES
---------------------------------------------------------- */

// Video routes (search, info, download jobs)
router.use("/video", videoRoutes);
logger.info("✅ Video routes mounted at /api/video");

// Download routes (SSE progress, file download)
router.use("/download", downloadRoutes);
logger.info("✅ Download routes mounted at /api/download");

// Job management routes
router.use("/jobs", jobRoutes);
logger.info("✅ Job routes mounted at /api/jobs");

// Video info routes (alternative endpoint)
router.use("/info", infoRoutes);
logger.info("✅ Info routes mounted at /api/info");

// Cleanup routes (admin/maintenance)
router.use("/cleanup", cleanupRoutes);
logger.info("✅ Cleanup routes mounted at /api/cleanup");

/* ----------------------------------------------------------
   ⚠️ 404 HANDLER (Must be LAST)
---------------------------------------------------------- */
router.all("*", (req, res) => {
  logger.warn(`❌ API route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: "API endpoint not found",
    message: `The endpoint ${req.originalUrl} does not exist`,
    requestedPath: req.originalUrl,
    method: req.method,
    availableRoutes: {
      video: "/api/video/*",
      download: "/api/download/*",
      jobs: "/api/jobs/*",
      info: "/api/info/*",
      cleanup: "/api/cleanup/*"
    },
    hint: "Visit /api for complete API documentation"
  });
});

export default router;