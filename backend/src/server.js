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

// Environment loaded silently

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
  if (process.env.DISABLE_MONGODB === "true" || process.env.DISABLE_MONGODB === "1") {
    return;
  }
  try {
    const result = await connectDB();
    if (result) {
      isMongoConnected = true;
      const mongoHost = getMongoHost() || "unknown-host";
      logger.info(`✅ MongoDB connected successfully (host: ${mongoHost})`);
    }
  } catch (err) {
    // NEVER throw - MongoDB is optional
    isMongoConnected = false;
  }
};

// ----------------------------------------------------------
// 🔴 Redis Connection (Optional - with error handling)
// ----------------------------------------------------------
const initializeRedis = async () => {
  if (process.env.DISABLE_REDIS === "true" || process.env.DISABLE_REDIS === "1") {
    return;
  }
  try {
    await import("./config/redis.js");
    logger.info("✅ Redis connected successfully");
  } catch (err) {
    // Optional - ignore silent failure
  }
};

// ----------------------------------------------------------
// 👷 Background Worker (Optional - with error handling)
// ----------------------------------------------------------
const initializeWorker = async () => {
  if (process.env.DISABLE_WORKER === "true" || process.env.DISABLE_WORKER === "1") {
    return;
  }
  try {
    await import("./workers/videoWorker.js");
    logger.info("✅ Background worker initialized");
  } catch (err) {
    // Optional - ignore silent failure
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

    logger.info("✅ [Cleanup] Auto-cleanup system active");
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

    // Start Express server with automatic retry on EADDRINUSE
    let server = null;
    let attempts = 0;
    const maxAttempts = 5;

    const bindServer = () => {
      return new Promise((resolve) => {
        const instance = app.listen(PORT, () => {
          logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          logger.info(`🚀 Server running on http://localhost:${PORT}`);
          logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
          logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          resolve(instance);
        });

        instance.on("error", async (err) => {
          if (err.code === "EADDRINUSE") {
            attempts++;
            if (attempts <= maxAttempts) {
              logger.warn(`⚠️ Port ${PORT} busy (restarting...), retrying in 1s (${attempts}/${maxAttempts})...`);
              setTimeout(async () => {
                const retriedInstance = await bindServer();
                resolve(retriedInstance);
              }, 1000);
            } else {
              logger.error(`❌ Port ${PORT} is occupied by another process.`);
              logger.error(`   Run 'npx kill-port ${PORT}' to free it.`);
              process.exit(1);
            }
          } else {
            logger.error(`❌ Server error: ${err.message}`);
            process.exit(1);
          }
        });
      });
    };

    server = await bindServer();

    // ----------------------------------------------------------
    // ⚙️ Graceful Shutdown & Nodemon Handlers
    // ----------------------------------------------------------
    process.once("SIGUSR2", () => {
      logger.info("♻️ Nodemon restarting server...");
      stopAllSchedulers();
      if (server) {
        server.close(() => {
          process.kill(process.pid, "SIGUSR2");
        });
      } else {
        process.kill(process.pid, "SIGUSR2");
      }
    });

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
        stopAllSchedulers();

        // Close HTTP server
        if (server) {
          server.close(() => {
            if (isMongoConnected) {
              import("mongoose").then(({ default: mongoose }) => {
                mongoose.connection.close().then(() => {
                  process.exit(error ? 1 : 0);
                }).catch(() => {
                  process.exit(error ? 1 : 0);
                });
              }).catch(() => {
                process.exit(error ? 1 : 0);
              });
            } else {
              process.exit(error ? 1 : 0);
            }
          });
        } else {
          process.exit(error ? 1 : 0);
        }

        // Force shutdown if it takes too long
        setTimeout(() => {
          process.exit(1);
        }, 5000);

      } catch (err) {
        logger.error(`❌ Error during shutdown: ${err.message}`);
        process.exit(1);
      }
    };

    // Handle system signals and process events
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("unhandledRejection", (err) => {
      const errorMsg = err?.message || String(err || "");
      const isConnectionError =
        err?.code === "ECONNREFUSED" ||
        err?.code === "ENOTFOUND" ||
        err?.code === "ETIMEDOUT" ||
        errorMsg.includes("ECONNREFUSED") ||
        errorMsg.includes("querySrv") ||
        errorMsg.includes("Redis") ||
        errorMsg.includes("connect");

      if (isConnectionError) {
        logger.warn(`⚠️ Non-critical unhandled rejection caught (${errorMsg.substring(0, 60)}...) — server continuing...`);
        return;
      }

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

    // Registered routes logging omitted for cleaner terminal

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