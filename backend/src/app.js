/* eslint-disable no-unused-vars */
// ✅ FINAL: Express App with Direct Download Support
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import videoRoutes from "./routes/videoRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import infoRoutes from "./routes/infoRoutes.js";
import cleanupRoutes from "./routes/cleanupRoutes.js";
import downloadRoutes from "./routes/download.js";
import mp3juiceRoutes from "./routes/mp3juiceRoutes.js";

import globalErrorHandler, { clientDisconnectHandler, asyncHandler } from "./middleware/errorHandler.js";
import AppError from "./utils/AppError.js";
import logger from "./utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ----------------------------------------------------------
   🛡️ SECURITY & MIDDLEWARE SETUP
---------------------------------------------------------- */

app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ----------------------------------------------------------
   🌐 ENHANCED CORS - Support for Direct Download
---------------------------------------------------------- */
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || "http://localhost:5173";
const isDevelopment = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin: (origin, callback) => {
      // ✅ Allow requests with no origin (curl, Postman, direct browser downloads)
      if (!origin) return callback(null, true);

      // ✅ Development: Allow all localhost
      if (isDevelopment) {
        if (
          origin.includes("localhost") || 
          origin.includes("127.0.0.1") ||
          origin.includes("192.168.")
        ) {
          return callback(null, true);
        }
      }

      // ✅ Production: Check whitelist
      const allowedOrigins = FRONTEND_ORIGIN.split(",").map((o) => o.trim());
      if (allowedOrigins.includes(origin) || isDevelopment) {
        callback(null, true);
      } else {
        logger.warn(`🚫 CORS blocked: ${origin}`);
        callback(null, true); // ⚠️ Allow anyway in dev
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "X-Requested-With",
      "Accept",
      "Cache-Control",
      "X-Client-Type",
      "Range" // ✅ For resume downloads
    ],
    exposedHeaders: [
      "Content-Type",
      "Content-Disposition",
      "Content-Length",
      "X-Download-Progress",
      "Accept-Ranges",
      "Content-Range",
      "Transfer-Encoding"
    ],
    credentials: true,
    maxAge: 86400,
  })
);

app.options("*", cors());

// ✅ Client disconnect handler (before routes)
app.use(clientDisconnectHandler);

// ✅ Request timeout handler (10 seconds for API, streaming excluded)
import { timeoutHandler, keepAliveHandler } from "./middleware/timeoutHandler.js";
app.use(timeoutHandler(10000)); // 10 second timeout (streaming endpoints auto-excluded)
app.use(keepAliveHandler); // Keep-alive headers

// ✅ FIX: Connection keep-alive for initial requests
app.use((req, res, next) => {
  // Set keep-alive headers immediately
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=30, max=1000');
  
  // For streaming endpoints, mark as streaming
  if (req.originalUrl.includes('/stream') || req.originalUrl.includes('/merge')) {
    req._isStreaming = true;
  }
  
  next();
});

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Compression
app.use(compression());

// Logging (Clean output: log errors and warnings by default to avoid terminal clutter)
app.use(
  morgan(isDevelopment ? "dev" : "combined", {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
    skip: (req, res) => {
      if (process.env.SHOW_HTTP_LOGS === "true") return false;
      return req.url === "/health" || req.url === "/" || res.statusCode < 400;
    },
  })
);

app.set("trust proxy", 1);

/* ----------------------------------------------------------
   📁 DOWNLOADS DIRECTORY SETUP
---------------------------------------------------------- */
const DOWNLOAD_DIR = path.resolve(process.cwd(), "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  logger.info(`📁 Created downloads directory: ${DOWNLOAD_DIR}`);
}

logger.info(`📁 Downloads directory: ${DOWNLOAD_DIR}`);

/* ----------------------------------------------------------
   🚦 RATE LIMITER
---------------------------------------------------------- */
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS) || 60 * 1000;
const RATE_MAX = Number(process.env.RATE_MAX) || (isDevelopment ? 1000 : 100);

const limiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return (
      req.url === "/health" || 
      req.url === "/" || 
      req.url.includes("/api/download/") ||
      req.url.includes("/health")
    );
  },
  handler: (req, res) => {
    logger.warn(`⏳ Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later.",
      retryAfter: Math.ceil(RATE_WINDOW_MS / 1000),
    });
  },
});

app.use("/api", limiter);

/* ----------------------------------------------------------
   🩺 HEALTH CHECK
---------------------------------------------------------- */
app.get("/health", async (req, res) => {
  try {
    const { getCleanupStats } = await import("./services/cleanupService.js");
    const { getSchedulerStatus } = await import("./utils/scheduler.js");

    const cleanupStats = await getCleanupStats();
    const schedulerStatus = getSchedulerStatus();

    res.status(200).json({
      status: "ok",
      message: "Backend is running smoothly",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      downloads: {
        directory: DOWNLOAD_DIR,
        exists: fs.existsSync(DOWNLOAD_DIR)
      },
      features: {
        sseProgress: true,
        realtimeTracking: true,
        autoCleanup: process.env.ENABLE_AUTO_CLEANUP !== "false",
        directDownload: true, // ✅ NEW
        mp3juiceStyle: true, // ✅ NEW
      },
      cleanup: {
        enabled: process.env.ENABLE_AUTO_CLEANUP !== "false",
        scheduler: schedulerStatus?.cleanup?.running ? "active" : "inactive",
        lastRun: cleanupStats?.lifetime?.lastRun || null,
      },
    });
  } catch (err) {
    res.status(200).json({
      status: "ok",
      message: "Backend is running",
      timestamp: new Date().toISOString(),
      downloads: {
        directory: DOWNLOAD_DIR,
        exists: fs.existsSync(DOWNLOAD_DIR)
      },
      features: {
        sseProgress: true,
        directDownload: true,
        mp3juiceStyle: true,
      },
    });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "🎬 YouTube Downloader API - MP3 Juice Style",
    version: "3.0.0",
    storage: "Local",
    features: {
      videoDownload: true,
      audioDownload: true,
      directDownload: true, // ✅ NEW
      mp3juiceStyle: true, // ✅ NEW
      noProgressPage: true, // ✅ NEW
      qualitySelection: true,
      rangeSupport: true,
    },
    endpoints: {
      health: "GET /health",
      video: {
        search: "GET /api/video/search?query=...",
        info: "GET /api/video/info?url=...",
      },
      download: {
        direct: "GET /api/download/direct?url=...&quality=...&format=...", // ✅ MAIN
        health: "GET /api/download/health",
      },
    },
  });
});

/* ----------------------------------------------------------
   🔗 API ROUTES
---------------------------------------------------------- */

// ✅ PRIMARY: Versioned RESTful API v1 - RECOMMENDED
// Register v1 routes FIRST (before legacy routes)
let v1Routes;
try {
  v1Routes = (await import("./routes/v1/index.js")).default;
  app.use("/api/v1", v1Routes);
  logger.info("✅ API v1 routes registered: /api/v1");
} catch (err) {
  logger.error(`❌ Failed to load API v1 routes: ${err.message}`);
}

// ⚠️ DEPRECATED: Legacy routes (kept for backward compatibility)
// Migration: Use /api/v1/video/* instead
// These will be removed in v2.0.0

// ✅ Register download routes (legacy)
app.use("/api/download", downloadRoutes);

// ✅ MP3 Juice-style API routes (legacy)
app.use("/api/mp3juice", mp3juiceRoutes);

// Legacy routes (deprecated)
app.use("/api/video", videoRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/info", infoRoutes);
app.use("/api/cleanup", cleanupRoutes);

logger.info("✅ All routes registered successfully");
logger.info("✅ Direct download route: /api/download/direct");

/* ----------------------------------------------------------
   🐛 DEBUG ROUTES (Development)
---------------------------------------------------------- */
if (isDevelopment) {
  // List all routes
  app.get("/api/debug/routes", (req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            routes.push({
              path: handler.route.path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    });
    res.json({
      success: true,
      totalRoutes: routes.length,
      routes: routes
    });
  });

  // List downloaded files
  app.get("/api/debug/downloads", (req, res) => {
    try {
      const files = fs.readdirSync(DOWNLOAD_DIR);
      const fileStats = files.map((file) => {
        const stats = fs.statSync(path.join(DOWNLOAD_DIR, file));
        return {
          name: file,
          size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          created: stats.birthtime,
          path: path.join(DOWNLOAD_DIR, file)
        };
      });
      res.json({
        success: true,
        directory: DOWNLOAD_DIR,
        totalFiles: files.length,
        files: fileStats,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // Test CORS
  app.get("/api/debug/cors", (req, res) => {
    res.json({
      success: true,
      message: "CORS is working!",
      origin: req.headers.origin,
      method: req.method,
      headers: req.headers
    });
  });

  // Test direct download
  app.get("/api/debug/test-download", (req, res) => {
    res.json({
      success: true,
      message: "Direct download endpoint test",
      testUrl: `http://localhost:${process.env.PORT || 5000}/api/download/direct?url=https://www.youtube.com/watch?v=jNQXAC9IVRw&quality=360&format=mp4&type=video&filename=test.mp4`,
      note: "Copy the testUrl and open in browser to test download"
    });
  });
}

/* ----------------------------------------------------------
   🌐 SERVE FRONTEND DIST (Optional Production Mode)
---------------------------------------------------------- */
const frontendDistPath = path.resolve(process.cwd(), "../frontend/dist");
if (process.env.SERVE_FRONTEND === "true" && fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
  logger.info(`🌐 Serving frontend production build from: ${frontendDistPath}`);
} else {
  /* ----------------------------------------------------------
     ⚠️ 404 HANDLER
  ---------------------------------------------------------- */
  app.all("*", (req, res, next) => {
    logger.warn(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    next(new AppError(`Route ${req.originalUrl} not found`, 404));
  });
}

/* ----------------------------------------------------------
   🧩 GLOBAL ERROR HANDLER
---------------------------------------------------------- */
app.use(globalErrorHandler);

/* ----------------------------------------------------------
   🔄 GRACEFUL SHUTDOWN
---------------------------------------------------------- */
export const gracefulShutdown = (server) => {
  return new Promise((resolve) => {
    logger.info("🔄 Closing server gracefully...");
    server.close(() => {
      logger.info("✅ Server closed");
      resolve();
    });
  });
};

export default app;