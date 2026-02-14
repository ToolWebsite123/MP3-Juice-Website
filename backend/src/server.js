// ✅ PRODUCTION-READY: Main Server File (Day 2 Complete)

// ═══════════════════════════════════════════════════════════════════════
// 🌍 LOAD ENVIRONMENT VARIABLES FIRST (Before any other imports)
// ═══════════════════════════════════════════════════════════════════════
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env file IMMEDIATELY - before any other code runs
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

// Verify environment loaded
console.log("ENV LOADED:", !!process.env.MONGODB_URI);

// Now import other modules (they can safely use process.env)
import connectDB, { getMongoHost } from "./config/db.js";
import app from "./app.js";
import logger from "./utils/logger.js";
import { startAllSchedulers, stopAllSchedulers } from "./utils/scheduler.js";
import { validateConfig, getConfigSummary } from "./config/cleanup.config.js";

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || "development";

// ----------------------------------------------------------
// 🔌 MongoDB Connection (with proper error handling)
// ----------------------------------------------------------
let isMongoConnected = false;

const initializeMongoDB = async () => {
  try {
    const result = await connectDB();
    if (result) {
      isMongoConnected = true;
      const mongoHost = getMongoHost() || "unknown-host";
      logger.info(`✅ MongoDB connected successfully (host: ${mongoHost})`);
    } else {
      isMongoConnected = false;
      logger.warn("⚠️ MongoDB not available - server will continue without database");
    }
  } catch (err) {
    // NEVER throw - MongoDB is optional
    isMongoConnected = false;
    logger.warn(`⚠️ MongoDB connection failed: ${err.message}`);
    logger.warn("   Server will continue without MongoDB - downloads will work normally");
  }
};

// ----------------------------------------------------------
// 🔴 Redis Connection (Optional - with error handling)
// ----------------------------------------------------------
const initializeRedis = async () => {
  try {
    await import("./config/redis.js");
    logger.info("✅ Redis connected successfully");
  } catch (err) {
    logger.warn(`⚠️ Redis connection failed: ${err.message}`);
    logger.warn("⚠️ Server will continue without Redis caching");
  }
};

// ----------------------------------------------------------
// 👷 Background Worker (Optional - with error handling)
// ----------------------------------------------------------
const initializeWorker = async () => {
  try {
    await import("./workers/videoWorker.js");
    logger.info("✅ Background worker initialized");
  } catch (err) {
    logger.warn(`⚠️ Worker initialization failed: ${err.message}`);
    logger.warn("⚠️ Background jobs may not work - start worker separately");
  }
};

// ----------------------------------------------------------
// 🧹 Cleanup Service (Day 2 - Auto file deletion)
// ----------------------------------------------------------
const initializeCleanup = async () => {
  try {
    const cleanupEnabled = process.env.ENABLE_AUTO_CLEANUP !== "false";
    
    if (!cleanupEnabled) {
      logger.info("⚠️ Cleanup scheduler disabled by config");
      return false;
    }

    // Validate configuration
    const configValidation = validateConfig();
    
    if (!configValidation.valid) {
      logger.error("❌ Invalid cleanup configuration:");
      configValidation.errors.forEach((err) => logger.error(`   - ${err}`));
      return false;
    }

    if (configValidation.warnings.length > 0) {
      logger.warn("⚠️ Configuration warnings:");
      configValidation.warnings.forEach((warn) => logger.warn(`   - ${warn}`));
    }

    // Start schedulers
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("🧹 Initializing cleanup system...");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const schedulersStarted = startAllSchedulers();
    
    if (!schedulersStarted) {
      logger.error("❌ Failed to start cleanup schedulers");
      return false;
    }

    // Log configuration summary
    const configSummary = getConfigSummary();
    logger.info("📋 Cleanup Configuration:");
    logger.info(`   ├─ File Age: ${configSummary.fileAge.min} - ${configSummary.fileAge.max}`);
    logger.info(`   ├─ Cleanup Schedule: ${configSummary.schedules.cleanup}`);
    logger.info(`   ├─ Storage Monitor: ${configSummary.schedules.storage}`);
    logger.info(`   ├─ Storage Limit: ${configSummary.storage.limit}`);
    logger.info(`   ├─ Warning at: ${configSummary.storage.thresholds.warning}`);
    logger.info(`   ├─ Critical at: ${configSummary.storage.thresholds.critical}`);
    logger.info(`   ├─ Emergency at: ${configSummary.storage.thresholds.emergency}`);
    logger.info(`   └─ Database Sync: ${configSummary.safety.checkDatabase ? "✅ Enabled" : "❌ Disabled"}`);
    
    logger.info("✅ [Cleanup] Scheduler is active");
    return true;

  } catch (err) {
    logger.warn(`⚠️ Cleanup initialization failed: ${err.message}`);
    logger.warn("⚠️ Files will not be auto-deleted");
    return false;
  }
};

// ----------------------------------------------------------
// 🏥 Health Check Endpoint (Enhanced)
// ----------------------------------------------------------
app.get("/health", async (req, res) => {
  try {
    const { getCleanupStats } = await import("./services/cleanupService.js");
    const { getSchedulerStatus } = await import("./utils/scheduler.js");
    
    const cleanupStats = await getCleanupStats();
    const schedulerStatus = getSchedulerStatus();

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: ENV,
      mongodb: isMongoConnected ? "connected" : "disconnected",
      port: PORT,
      storage: "local",
      cleanup: {
        enabled: process.env.ENABLE_AUTO_CLEANUP !== "false",
        scheduler: schedulerStatus.cleanup.running ? "active" : "inactive",
        monitor: schedulerStatus.storage.running ? "active" : "inactive",
        lastRun: cleanupStats.lifetime?.lastRun || null,
      },
      memory: {
        used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        total: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      },
    });
  } catch (err) {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: ENV,
      mongodb: isMongoConnected ? "connected" : "disconnected",
      port: PORT,
    });
  }
});

// ----------------------------------------------------------
// 🚀 Start Server (Async initialization)
// ----------------------------------------------------------
const startServer = async () => {
  try {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("🚀 Starting server...");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // MongoDB is required for boot; Redis/worker can be best-effort
    await initializeMongoDB();
    await Promise.allSettled([
      initializeRedis(),
      initializeWorker(),
    ]);

    // Initialize cleanup service
    const cleanupStarted = await initializeCleanup();

    // Start Express server
    const server = app.listen(PORT, () => {
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      logger.info(`🚀 Server running in ${ENV} mode`);
      logger.info(`📡 URL: http://localhost:${PORT}`);
      logger.info(`🏥 Health: http://localhost:${PORT}/health`);
      logger.info(`🎬 API: http://localhost:${PORT}/api/video`);
      logger.info(`📊 Cleanup Status: http://localhost:${PORT}/api/cleanup/status`);
      logger.info(`📁 Storage: LOCAL (No Cloudinary)`);
      logger.info(`🗑️ Auto-cleanup: ${cleanupStarted ? "✅ ENABLED" : "❌ DISABLED"}`);
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      logger.info("🟢 Server is ready to accept requests");
      logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    });

    // ----------------------------------------------------------
    // ⚙️ Graceful Shutdown Handler
    // ----------------------------------------------------------
    const shutdown = async (signal, error = null) => {
      if (error) {
        logger.error(`💥 ${signal} → ${error.message || error}`);
        logger.error(error.stack);
      }

      logger.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      logger.warn(`⚠️ ${signal} received — shutting down gracefully...`);
      logger.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      try {
        // Stop cleanup schedulers
        logger.info("⏸️ Stopping cleanup schedulers...");
        stopAllSchedulers();
        logger.info("✅ Schedulers stopped");

        // Close HTTP server
        server.close(() => {
          logger.info("💤 HTTP server closed");
          
          // Close database connection (gracefully, ignore errors)
          if (isMongoConnected) {
            import("mongoose").then(({ default: mongoose }) => {
              mongoose.connection.close(() => {
                logger.info("🔌 Database disconnected");
                process.exit(error ? 1 : 0);
              }).catch((mongoErr) => {
                logger.warn(`⚠️ MongoDB disconnect error (ignored): ${mongoErr.message}`);
                process.exit(error ? 1 : 0);
              });
            }).catch(() => {
              // MongoDB module not available or error - continue shutdown
              process.exit(error ? 1 : 0);
            });
          } else {
            process.exit(error ? 1 : 0);
          }
        });

        // Force shutdown if it takes too long
        setTimeout(() => {
          logger.error("⏰ Force shutdown (timeout reached)");
          process.exit(1);
        }, 10000);

      } catch (err) {
        logger.error(`❌ Error during shutdown: ${err.message}`);
        process.exit(1);
      }
    };

    // Handle system signals and process events
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("unhandledRejection", (err) => {
      logger.error("💥 Unhandled Promise Rejection:");
      shutdown("unhandledRejection", err);
    });
    process.on("uncaughtException", (err) => {
      logger.error("💥 Uncaught Exception:");
      shutdown("uncaughtException", err);
    });

    // Process Exit Handler
    process.on("exit", (code) => {
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`🧩 Process exited with code ${code}`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    });

    // Debug: Log all registered routes (development only)
    if (ENV === "development") {
      logger.info("📋 Registered Routes:");
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          const methods = Object.keys(middleware.route.methods)
            .join(", ")
            .toUpperCase();
          logger.info(`   ${methods} ${middleware.route.path}`);
        } else if (middleware.name === "router") {
          middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
              const methods = Object.keys(handler.route.methods)
                .join(", ")
                .toUpperCase();
              logger.info(`   ${methods} ${handler.route.path}`);
            }
          });
        }
      });
    }

    return server;

  } catch (err) {
    logger.error(`❌ Failed to start server: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  }
};

// ----------------------------------------------------------
// 🎬 Start the server
// ----------------------------------------------------------
startServer().catch((err) => {
  logger.error("💥 Fatal error during startup:");
  logger.error(err);
  process.exit(1);
});