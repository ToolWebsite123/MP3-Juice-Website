// ✅ PRODUCTION-READY: Enhanced Cleanup Routes
import express from "express";
import {
  getCleanupStats,
  manualCleanup,
  checkStorageUsage,
  emergencyCleanup,
  getCleanupHistory,
  getDetailedStats,
  cleanOldHistory,
} from "../services/cleanupService.js";
import { getSchedulerStatus, restartSchedulers } from "../utils/scheduler.js";
import { getDirectoryStats } from "../utils/fileManager.js";
import logger from "../utils/logger.js";

const router = express.Router();

/* ----------------------------------------------------------
   📊 GET CLEANUP STATUS
   GET /api/cleanup/status
---------------------------------------------------------- */
router.get("/status", async (req, res) => {
  try {
    const stats = await getCleanupStats();
    const scheduler = getSchedulerStatus();
    const directory = await getDirectoryStats();

    res.status(200).json({
      success: true,
      stats,
      scheduler,
      directory,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Status error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to get cleanup status",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   💾 GET STORAGE INFO
   GET /api/cleanup/storage
---------------------------------------------------------- */
router.get("/storage", async (req, res) => {
  try {
    const storage = await checkStorageUsage();

    res.status(200).json({
      success: true,
      storage,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Storage error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to check storage",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   🗑️ MANUAL CLEANUP TRIGGER
   POST /api/cleanup/manual
   Body: {
     forceAll: boolean,          // Delete all files
     olderThanMinutes: number,   // Custom age threshold
     emergencyMode: boolean,     // Run emergency cleanup
     notes: string               // Optional notes
   }
---------------------------------------------------------- */
router.post("/manual", async (req, res) => {
  try {
    logger.info("🧹 [CleanupRoutes] Manual cleanup triggered");

    const options = {
      forceAll: req.body.forceAll === true,
      olderThanMinutes: req.body.olderThanMinutes || null,
      emergencyMode: req.body.emergencyMode === true,
      notes: req.body.notes || "",
      userId: req.user?._id || null, // If authentication is enabled
    };

    const result = await manualCleanup(options);

    res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Manual cleanup error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Manual cleanup failed",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   🚨 EMERGENCY CLEANUP
   POST /api/cleanup/emergency
   Body: { force: boolean }
---------------------------------------------------------- */
router.post("/emergency", async (req, res) => {
  try {
    logger.warn("🚨 [CleanupRoutes] Emergency cleanup triggered");

    const result = await emergencyCleanup({
      force: req.body.force === true,
      triggeredBy: "manual",
      userId: req.user?._id || null,
    });

    res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Emergency cleanup error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Emergency cleanup failed",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   📜 GET CLEANUP HISTORY
   GET /api/cleanup/history
   Query: ?limit=50&skip=0&type=automatic&startDate=...&endDate=...
---------------------------------------------------------- */
router.get("/history", async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 50,
      skip: parseInt(req.query.skip) || 0,
      type: req.query.type || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
    };

    const result = await getCleanupHistory(options);

    res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] History error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to get cleanup history",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   📊 GET DETAILED STATISTICS
   GET /api/cleanup/stats/detailed
   Query: ?days=30
---------------------------------------------------------- */
router.get("/stats/detailed", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await getDetailedStats(days);

    res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Detailed stats error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to get detailed statistics",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   🗑️ CLEAN OLD HISTORY RECORDS
   POST /api/cleanup/history/clean
   Body: { keepLast: number }
---------------------------------------------------------- */
router.post("/history/clean", async (req, res) => {
  try {
    const keepLast = parseInt(req.body.keepLast) || 100;

    logger.info(`🗑️ [CleanupRoutes] Cleaning old history (keeping last ${keepLast})`);

    const result = await cleanOldHistory(keepLast);

    res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Clean history error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to clean old history",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   🔄 RESTART SCHEDULERS
   POST /api/cleanup/restart
---------------------------------------------------------- */
router.post("/restart", async (req, res) => {
  try {
    logger.info("🔄 [CleanupRoutes] Restarting schedulers...");

    const result = restartSchedulers();

    res.status(200).json({
      success: result,
      message: result ? "Schedulers restarted successfully" : "Failed to restart schedulers",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Restart error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to restart schedulers",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   📊 GET SCHEDULER STATUS
   GET /api/cleanup/scheduler
---------------------------------------------------------- */
router.get("/scheduler", (req, res) => {
  try {
    const status = getSchedulerStatus();

    res.status(200).json({
      success: true,
      scheduler: status,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Scheduler status error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to get scheduler status",
      error: err.message,
    });
  }
});

/* ----------------------------------------------------------
   📁 GET DIRECTORY STATISTICS
   GET /api/cleanup/stats
---------------------------------------------------------- */
router.get("/stats", async (req, res) => {
  try {
    const stats = await getDirectoryStats();

    res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`❌ [CleanupRoutes] Directory stats error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to get directory statistics",
      error: err.message,
    });
  }
});

export default router;