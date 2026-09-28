// ✅ PRODUCTION-READY: Enhanced Professional Cleanup Service
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import logger from "../utils/logger.js";
import Job from "../models/Job.js";
import CleanupHistory from "../models/CleanupHistory.js";
import { isMongoDBConnected, isMongoDBDisabled } from "../config/db.js";
import {
  isFileInActiveMerge,
  getActiveMergeFiles,
  getActiveMergeCount,
  cleanupStaleMerges,
} from "../utils/activeMerges.js";

const DOWNLOAD_DIR = path.resolve(process.cwd(), "downloads");
const MAX_FILE_AGE_MS = parseInt(process.env.MAX_FILE_AGE_MINUTES || 60) * 60 * 1000;
const MAX_STORAGE_GB = parseFloat(process.env.MAX_STORAGE_GB || 10);
const MIN_FREE_SPACE_GB = parseFloat(process.env.MIN_FREE_SPACE_GB || 2);

// In-memory cleanup statistics
let cleanupStats = {
  totalRuns: 0,
  totalFilesDeleted: 0,
  totalSpaceFreed: 0,
  lastRun: null,
  errors: [],
  consecutiveEmptyRuns: 0, // Track consecutive runs with no files
};

/* ----------------------------------------------------------
   🗑️ SAFE FILE DELETION (WITH DATABASE SYNC + ACTIVE MERGE CHECK)
---------------------------------------------------------- */
const safeDeleteFile = async (filePath, fileName) => {
  try {
    // Check if file exists
    if (!fsSync.existsSync(filePath)) {
      return { deleted: false, reason: "File not found", size: 0 };
    }

    // ✅ Check if file is in an active merge operation
    if (isFileInActiveMerge(filePath)) {
      logger.debug(`⏸️ [Cleanup] Skipping ${fileName} - File is in active merge operation`);
      return { deleted: false, reason: "File is in active merge", size: 0 };
    }

    // Check if file is locked or in use
    try {
      const handle = await fs.open(filePath, "r+");
      await handle.close();
    } catch (err) {
      return { deleted: false, reason: "File is locked or in use", size: 0 };
    }

    // Check database - don't delete if job is still processing
    try {
      const job = await Job.findOne({
        resultUrl: { $regex: fileName },
      }).lean();

      if (job) {
        // Don't delete if job is processing or queued
        if (job.status === "processing" || job.status === "queued") {
          logger.debug(`⏸️ [Cleanup] Skipping ${fileName} - Job status: ${job.status}`);
          return { deleted: false, reason: `Job is ${job.status}`, size: 0 };
        }

        // Safe to delete if completed, failed, or cancelled
        if (["completed", "failed", "cancelled"].includes(job.status)) {
          // Update database to remove file reference
          await Job.findByIdAndUpdate(job._id, { resultUrl: null });
          logger.debug(`🔄 [Cleanup] Updated job ${job._id} - removed file reference`);
        }
      }
    } catch (dbErr) {
      logger.warn(`⚠️ [Cleanup] Database check failed for ${fileName}: ${dbErr.message}`);
      // Continue with deletion even if DB check fails (orphan file)
    }

    // Get file size before deletion
    const stats = fsSync.statSync(filePath);
    const fileSize = stats.size;
    const fileAge = Date.now() - stats.mtimeMs;

    // Delete the file
    await fs.unlink(filePath);

    // Verify deletion
    if (fsSync.existsSync(filePath)) {
      return { deleted: false, reason: "Deletion verification failed", size: 0 };
    }

    return {
      deleted: true,
      size: fileSize,
      sizeMB: parseFloat((fileSize / 1024 / 1024).toFixed(2)),
      age: fileAge,
      ageMinutes: Math.floor(fileAge / 1000 / 60),
    };
  } catch (err) {
    logger.error(`❌ [Cleanup] Error deleting ${fileName}: ${err.message}`);
    return { deleted: false, reason: err.message, size: 0 };
  }
};

/* ----------------------------------------------------------
   📊 GET FILE DETAILS WITH AGE
---------------------------------------------------------- */
const getFileDetails = async (fileName) => {
  try {
    const filePath = path.join(DOWNLOAD_DIR, fileName);

    if (!fsSync.existsSync(filePath)) {
      return null;
    }

    const stats = await fs.stat(filePath);
    const now = Date.now();
    const age = now - stats.mtimeMs;

    return {
      name: fileName,
      path: filePath,
      size: stats.size,
      sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(2)),
      created: stats.birthtime,
      modified: stats.mtime,
      age: age,
      ageMinutes: Math.floor(age / 1000 / 60),
      ageHours: parseFloat((age / 1000 / 60 / 60).toFixed(1)),
      isOld: age > MAX_FILE_AGE_MS,
    };
  } catch (err) {
    logger.error(`❌ [Cleanup] Error getting file details for ${fileName}: ${err.message}`);
    return null;
  }
};

/* ----------------------------------------------------------
   💾 CREATE CLEANUP HISTORY RECORD (Optional - MongoDB Only)
---------------------------------------------------------- */
const createCleanupHistory = async (data) => {
  // ✅ Early exit: Skip history if MongoDB is disabled or unavailable
  if (isMongoDBDisabled() || !isMongoDBConnected()) {
    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`💾 [Cleanup] Skipping history save - MongoDB unavailable`);
    }
    return null;
  }

  try {
    const history = new CleanupHistory({
      type: data.type || "automatic",
      triggeredBy: data.triggeredBy || "system",
      triggeredByUser: data.userId || null,
      filesChecked: data.filesChecked || 0,
      filesDeleted: data.filesDeleted || 0,
      filesSkipped: data.filesSkipped || 0,
      filesFailed: data.filesFailed || 0,
      spaceFreedBytes: data.spaceFreedBytes || 0,
      storageBeforeMB: data.storageBeforeMB || 0,
      storageAfterMB: data.storageAfterMB || 0,
      storageBeforePercent: data.storageBeforePercent || 0,
      storageAfterPercent: data.storageAfterPercent || 0,
      startTime: data.startTime || new Date(),
      endTime: data.endTime || new Date(),
      status: data.status || "success",
      errorsList: data.errors || data.errorsList || [], // ✅ Use errorsList to match model schema
      deletedFiles: data.deletedFiles || [],
      options: data.options || {},
      notes: data.notes || "",
    });

    await history.save();
    
    // Only log in development or verbose mode
    if (process.env.NODE_ENV === 'development' || process.env.VERBOSE_CLEANUP_LOGS === 'true') {
      logger.debug(`💾 [Cleanup] History saved: ${history._id}`);
    }
    
    return history;
  } catch (err) {
    // ✅ Graceful failure: Only log if MongoDB was expected to be available
    if (isMongoDBConnected()) {
      logger.warn(`⚠️ [Cleanup] Failed to save history: ${err.message}`);
    }
    return null;
  }
};

/* ----------------------------------------------------------
   🧹 MAIN CLEANUP FUNCTION (ENHANCED)
---------------------------------------------------------- */
export const cleanupOldFiles = async (options = {}) => {
  const startTime = Date.now();
  const startDate = new Date();
  const isProduction = process.env.NODE_ENV === 'production';
  const verboseLogging = process.env.VERBOSE_CLEANUP_LOGS === 'true';

  try {
    // ✅ Cleanup stale merge registrations first
    const staleCleaned = cleanupStaleMerges();
    if (staleCleaned > 0) {
      logger.debug(`🧹 [Cleanup] Cleaned up ${staleCleaned} stale merge registrations`);
    }
    
    // ✅ Check for active merges
    const activeMergeCount = getActiveMergeCount();
    if (activeMergeCount > 0) {
      const activeFiles = getActiveMergeFiles();
      logger.debug(`⏸️ [Cleanup] ${activeMergeCount} active merge(s) detected - ${activeFiles.length} files protected`);
    }

    // ✅ Reduced logging in production
    if (!isProduction || verboseLogging) {
      logger.info(`🧹 [Cleanup] Starting cleanup job...`);
      if (activeMergeCount > 0) {
        logger.info(`   ⚠️  ${activeMergeCount} active merge(s) - files will be protected`);
      }
    }

    // ✅ Early exit: Skip if no files found multiple times (smart scheduling)
    const MAX_CONSECUTIVE_EMPTY_RUNS = 3;
    if (cleanupStats.consecutiveEmptyRuns >= MAX_CONSECUTIVE_EMPTY_RUNS && !options.forceAll) {
      if (!isProduction || verboseLogging) {
        logger.debug(`⏭️ [Cleanup] Skipping - no files found in last ${MAX_CONSECUTIVE_EMPTY_RUNS} runs`);
      }
      return {
        success: true,
        message: "Skipped - no files found in recent runs",
        deletedCount: 0,
        skipped: true,
      };
    }

    // Ensure download directory exists
    if (!fsSync.existsSync(DOWNLOAD_DIR)) {
      fsSync.mkdirSync(DOWNLOAD_DIR, { recursive: true });
      
      if (!isProduction || verboseLogging) {
        logger.info(`📁 [Cleanup] Created download directory: ${DOWNLOAD_DIR}`);
      }

      // ✅ Skip history save for empty operations
      cleanupStats.consecutiveEmptyRuns++;
      
      return {
        success: true,
        message: "Download directory created",
        deletedCount: 0,
      };
    }

    // Get all files
    const files = await fs.readdir(DOWNLOAD_DIR);
    
    // ✅ Early exit: No files found
    if (files.length === 0) {
      cleanupStats.consecutiveEmptyRuns++;
      
      // Only log in development or verbose mode
      if (!isProduction || verboseLogging) {
        logger.debug(`✅ [Cleanup] No files to clean (consecutive empty runs: ${cleanupStats.consecutiveEmptyRuns})`);
      }

      // ✅ Skip history save when no files exist
      return {
        success: true,
        message: "No files to clean",
        deletedCount: 0,
        skipped: true,
      };
    }

    // ✅ Reset consecutive empty runs counter when files are found
    cleanupStats.consecutiveEmptyRuns = 0;
    
    // Only log file count in development or verbose mode
    if (!isProduction || verboseLogging) {
      logger.info(`📁 [Cleanup] Found ${files.length} files to check`);
    }

    let checkedCount = 0;
    let deletedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let freedSpace = 0;
    const errors = [];
    const deletedFiles = [];

    // Process each file
    for (const fileName of files) {
      // Skip hidden files, system files, and non-media files
      if (
        fileName.startsWith(".") ||
        fileName === "Thumbs.db" ||
        fileName === ".DS_Store"
      ) {
        continue;
      }

      checkedCount++;

      // Get file details
      const fileDetails = await getFileDetails(fileName);

      if (!fileDetails) {
        errorCount++;
        errors.push({
          fileName,
          error: "Could not get file details",
        });
        continue;
      }

      // Check if file is old enough to delete (unless forceAll is true)
      if (!options.forceAll && !fileDetails.isOld) {
        skippedCount++;
        logger.debug(
          `⏭️ [Cleanup] Skipping ${fileName} - Too new (${fileDetails.ageMinutes} min)`
        );
        continue;
      }

      // Check custom age threshold
      if (options.olderThanMinutes && fileDetails.ageMinutes < options.olderThanMinutes) {
        skippedCount++;
        logger.debug(
          `⏭️ [Cleanup] Skipping ${fileName} - Not old enough (${fileDetails.ageMinutes} min < ${options.olderThanMinutes} min)`
        );
        continue;
      }

      // Attempt safe deletion
      const result = await safeDeleteFile(fileDetails.path, fileName);

      if (result.deleted) {
        deletedCount++;
        freedSpace += result.size;

        // Track deleted file
        deletedFiles.push({
          name: fileName,
          size: result.size,
          sizeMB: result.sizeMB,
          age: result.age,
          ageMinutes: result.ageMinutes,
          deletedAt: new Date(),
        });

        logger.info(
          `🗑️ [Cleanup] Deleted: ${fileName} (${result.sizeMB} MB, age: ${fileDetails.ageMinutes} min)`
        );
      } else {
        skippedCount++;
        errorCount++;
        errors.push({
          fileName,
          error: result.reason,
        });
        logger.debug(`⏭️ [Cleanup] Skipped ${fileName} - ${result.reason}`);
      }
    }

    // Get storage after cleanup
    const storageAfter = await checkStorageUsage();

    // Calculate statistics
    const freedMB = (freedSpace / 1024 / 1024).toFixed(2);
    const freedGB = (freedSpace / 1024 / 1024 / 1024).toFixed(2);
    const endDate = new Date();
    const duration = ((endDate - startDate) / 1000).toFixed(2);

    // Update global stats
    cleanupStats.totalRuns++;
    cleanupStats.totalFilesDeleted += deletedCount;
    cleanupStats.totalSpaceFreed += freedSpace;
    cleanupStats.lastRun = endDate;

    // Determine status
    const status = errorCount === 0 ? "success" : errorCount === checkedCount ? "failed" : "partial";

    // ✅ Save cleanup history only if files were processed (optional MongoDB)
    if (checkedCount > 0 || deletedCount > 0) {
      await createCleanupHistory({
        type: options.type || "automatic",
        triggeredBy: options.triggeredBy || "system",
        triggeredByUser: options.userId || null,
        filesChecked: checkedCount,
        filesDeleted: deletedCount,
        filesSkipped: skippedCount,
        filesFailed: errorCount,
        spaceFreedBytes: freedSpace,
        storageBeforeMB: storageBefore.totalMB,
        storageAfterMB: storageAfter.totalMB,
        storageBeforePercent: storageBefore.percentUsed,
        storageAfterPercent: storageAfter.percentUsed,
        startTime: startDate,
        endTime: endDate,
        status,
        errorsList: errors, // ✅ Use errorsList to match model schema
        deletedFiles: deletedFiles.slice(0, 50), // Limit to 50 for performance
        options: {
          forceAll: options.forceAll || false,
          olderThanMinutes: options.olderThanMinutes || null,
          emergencyMode: options.emergencyMode || false,
        },
        notes: options.notes || "",
      });
    }

    // ✅ Reduced logging in production (only log if files were deleted or errors occurred)
    if (!isProduction || verboseLogging || deletedCount > 0 || errorCount > 0) {
      logger.info(`✅ [Cleanup] Complete in ${duration}s:`);
      logger.info(`   ├─ Files checked: ${checkedCount}`);
      logger.info(`   ├─ Files deleted: ${deletedCount}`);
      if (skippedCount > 0) logger.info(`   ├─ Files skipped: ${skippedCount}`);
      if (errorCount > 0) logger.info(`   ├─ Errors: ${errorCount}`);
      if (deletedCount > 0) logger.info(`   ├─ Space freed: ${freedMB} MB (${freedGB} GB)`);
      logger.info(`   └─ Duration: ${duration} seconds`);
    }

    return {
      success: true,
      checkedCount,
      deletedCount,
      skippedCount,
      errorCount,
      freedSpace,
      freedMB,
      freedGB,
      duration: parseFloat(duration),
      storage: {
        before: storageBefore,
        after: storageAfter,
      },
    };
  } catch (err) {
    // ✅ Always log errors, but reduce verbosity
    logger.error(`❌ [Cleanup] Cleanup failed: ${err.message}`);
    
    cleanupStats.errors.push({
      time: new Date(),
      error: err.message,
    });

    // ✅ Save failed cleanup history only if MongoDB is available (optional)
    await createCleanupHistory({
      type: options.type || "automatic",
      triggeredBy: options.triggeredBy || "system",
      status: "failed",
      startTime: startDate,
      endTime: new Date(),
      errorsList: [{ fileName: "N/A", error: err.message }], // ✅ Use errorsList to match model schema
      notes: `Cleanup failed: ${err.message}`,
    });

    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   💾 CHECK STORAGE USAGE
---------------------------------------------------------- */
export const checkStorageUsage = async () => {
  try {
    if (!fsSync.existsSync(DOWNLOAD_DIR)) {
      return {
        totalGB: 0,
        fileCount: 0,
        status: "healthy",
      };
    }

    const files = await fs.readdir(DOWNLOAD_DIR);
    let totalSize = 0;
    let fileCount = 0;
    let oldestFile = null;
    let newestFile = null;

    for (const fileName of files) {
      try {
        if (fileName.startsWith(".")) continue;

        const filePath = path.join(DOWNLOAD_DIR, fileName);
        const stats = await fs.stat(filePath);

        totalSize += stats.size;
        fileCount++;

        // Track oldest and newest files
        if (!oldestFile || stats.mtimeMs < oldestFile.time) {
          oldestFile = {
            name: fileName,
            time: stats.mtimeMs,
            age: Date.now() - stats.mtimeMs,
          };
        }

        if (!newestFile || stats.mtimeMs > newestFile.time) {
          newestFile = {
            name: fileName,
            time: stats.mtimeMs,
            age: Date.now() - stats.mtimeMs,
          };
        }
      } catch (err) {
        continue;
      }
    }

    const totalMB = (totalSize / 1024 / 1024).toFixed(2);
    const totalGB = (totalSize / 1024 / 1024 / 1024).toFixed(2);
    const percentUsed = ((parseFloat(totalGB) / MAX_STORAGE_GB) * 100).toFixed(1);

    // Determine status
    let status = "healthy";
    let statusEmoji = "✅";

    if (parseFloat(percentUsed) >= 95) {
      status = "critical";
      statusEmoji = "🔴";
    } else if (parseFloat(percentUsed) >= 85) {
      status = "warning";
      statusEmoji = "⚠️";
    } else if (parseFloat(percentUsed) >= 70) {
      status = "elevated";
      statusEmoji = "🟡";
    }

    const result = {
      totalSize,
      totalMB,
      totalGB,
      fileCount,
      limitGB: MAX_STORAGE_GB,
      percentUsed: parseFloat(percentUsed),
      status,
      statusEmoji,
      oldestFile: oldestFile
        ? {
            name: oldestFile.name,
            ageMinutes: Math.floor(oldestFile.age / 1000 / 60),
          }
        : null,
      newestFile: newestFile
        ? {
            name: newestFile.name,
            ageMinutes: Math.floor(newestFile.age / 1000 / 60),
          }
        : null,
    };

    // Log storage info
    logger.info(`💾 [Storage] ${statusEmoji} ${totalGB} GB (${percentUsed}%) - ${fileCount} files`);

    // Warnings
    if (status === "critical") {
      logger.error(`🔴 [Storage] CRITICAL: ${totalGB} GB / ${MAX_STORAGE_GB} GB (${percentUsed}%)`);
      
      // Auto-trigger emergency cleanup if enabled
      if (process.env.AUTO_EMERGENCY_CLEANUP !== "false") {
        logger.warn(`🚨 [Storage] Auto-triggering emergency cleanup...`);
        setTimeout(() => emergencyCleanup(), 5000); // Run after 5 seconds
      }
    } else if (status === "warning") {
      logger.warn(`⚠️ [Storage] WARNING: ${totalGB} GB / ${MAX_STORAGE_GB} GB (${percentUsed}%)`);
    }

    return result;
  } catch (err) {
    logger.error(`❌ [Storage] Check failed: ${err.message}`);
    return {
      totalGB: 0,
      fileCount: 0,
      status: "error",
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   🚨 EMERGENCY CLEANUP (ENHANCED)
---------------------------------------------------------- */
export const emergencyCleanup = async (options = {}) => {
  const startTime = new Date();

  try {
    logger.warn(`🚨 [Emergency] Starting emergency cleanup...`);

    const storageBefore = await checkStorageUsage();

    // Check if emergency cleanup is really needed
    if (storageBefore.percentUsed < 85 && !options.force) {
      logger.info(`✅ [Emergency] No emergency cleanup needed (${storageBefore.totalGB} GB)`);

      await createCleanupHistory({
        type: "emergency",
        triggeredBy: options.triggeredBy || "threshold",
        status: "success",
        startTime,
        endTime: new Date(),
        notes: `Emergency cleanup skipped - storage within safe limits (${storageBefore.percentUsed}%)`,
      });

      return {
        success: true,
        cleaned: false,
        message: "Storage within safe limits",
        storage: storageBefore,
      };
    }

    logger.warn(
      `🚨 [Emergency] Storage critical: ${storageBefore.totalGB} GB (${storageBefore.percentUsed}%)`
    );

    const files = await fs.readdir(DOWNLOAD_DIR);
    const fileStats = [];

    // Collect all file information
    for (const fileName of files) {
      try {
        if (fileName.startsWith(".")) continue;

        const filePath = path.join(DOWNLOAD_DIR, fileName);
        const stats = await fs.stat(filePath);

        fileStats.push({
          name: fileName,
          path: filePath,
          size: stats.size,
          mtime: stats.mtimeMs,
          age: Date.now() - stats.mtimeMs,
        });
      } catch (err) {
        continue;
      }
    }

    // Sort by age (oldest first) and size (largest first)
    fileStats.sort((a, b) => {
      const ageDiff = b.age - a.age; // Older first
      if (Math.abs(ageDiff) > 60000) return ageDiff; // If age difference > 1 min
      return b.size - a.size; // Otherwise, larger files first
    });

    let deletedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let freedSpace = 0;
    const targetGB = MAX_STORAGE_GB * 0.5; // Cleanup to 50% (aggressive)
    const errors = [];
    const deletedFiles = [];

    logger.info(`🎯 [Emergency] Target: ${targetGB} GB (${(targetGB / MAX_STORAGE_GB * 100).toFixed(0)}%)`);

    // Delete files until we reach target
    for (const file of fileStats) {
      const currentStorage = await checkStorageUsage();

      if (parseFloat(currentStorage.totalGB) <= targetGB) {
        logger.info(`✅ [Emergency] Target reached: ${currentStorage.totalGB} GB`);
        break;
      }

      const result = await safeDeleteFile(file.path, file.name);

      if (result.deleted) {
        deletedCount++;
        freedSpace += result.size;
        deletedFiles.push({
          name: file.name,
          size: result.size,
          sizeMB: result.sizeMB,
          age: file.age,
          ageMinutes: Math.floor(file.age / 1000 / 60),
        });

        logger.info(`🗑️ [Emergency] Deleted: ${file.name} (${result.sizeMB} MB)`);
      } else {
        skippedCount++;
        if (result.reason !== "Job is processing" && result.reason !== "Job is queued") {
          errorCount++;
          errors.push({
            fileName: file.name,
            error: result.reason,
          });
        }
        logger.debug(`⏭️ [Emergency] Skipped: ${file.name} - ${result.reason}`);
      }
    }

    const storageAfter = await checkStorageUsage();
    const freedGB = (freedSpace / 1024 / 1024 / 1024).toFixed(2);
    const freedMB = (freedSpace / 1024 / 1024).toFixed(2);
    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Save emergency cleanup history
    await createCleanupHistory({
      type: "emergency",
      triggeredBy: options.triggeredBy || "threshold",
      triggeredByUser: options.userId || null,
      filesChecked: fileStats.length,
      filesDeleted: deletedCount,
      filesSkipped: skippedCount,
      filesFailed: errorCount,
      spaceFreedBytes: freedSpace,
      storageBeforeMB: storageBefore.totalMB,
      storageAfterMB: storageAfter.totalMB,
      storageBeforePercent: storageBefore.percentUsed,
      storageAfterPercent: storageAfter.percentUsed,
      startTime,
      endTime,
      status: errorCount === 0 ? "success" : "partial",
      errors,
      deletedFiles: deletedFiles.slice(0, 50),
      options: {
        force: options.force || false,
        emergencyMode: true,
      },
      notes: `Emergency cleanup triggered due to ${storageBefore.percentUsed}% storage usage`,
    });

    logger.info(`✅ [Emergency] Cleanup complete in ${duration}s:`);
    logger.info(`   ├─ Files checked: ${fileStats.length}`);
    logger.info(`   ├─ Files deleted: ${deletedCount}`);
    logger.info(`   ├─ Files skipped: ${skippedCount}`);
    logger.info(`   ├─ Space freed: ${freedGB} GB`);
    logger.info(`   ├─ Before: ${storageBefore.totalGB} GB (${storageBefore.percentUsed}%)`);
    logger.info(`   └─ After: ${storageAfter.totalGB} GB (${storageAfter.percentUsed}%)`);

    return {
      success: true,
      cleaned: true,
      deletedCount,
      skippedCount,
      errorCount,
      freedSpace,
      freedMB,
      freedGB,
      duration: parseFloat(duration),
      storage: {
        before: storageBefore,
        after: storageAfter,
      },
    };
  } catch (err) {
    logger.error(`❌ [Emergency] Emergency cleanup failed: ${err.message}`);

    // Save failed emergency cleanup history
    await createCleanupHistory({
      type: "emergency",
      triggeredBy: options.triggeredBy || "threshold",
      status: "failed",
      startTime,
      endTime: new Date(),
      errorsList: [{ fileName: "N/A", error: err.message }], // ✅ Use errorsList to match model schema
      notes: `Emergency cleanup failed: ${err.message}`,
    });

    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   📊 GET CLEANUP STATISTICS (ENHANCED)
---------------------------------------------------------- */
export const getCleanupStats = async () => {
  try {
    const storage = await checkStorageUsage();

    let recentHistory = [];
    let weekStats = null;
    let todayCleanups = [];

    if (isMongoDBConnected()) {
      try {
        recentHistory = await CleanupHistory.getRecent(10);
        weekStats = await CleanupHistory.getStatistics(7);
        todayCleanups = await CleanupHistory.getToday();
      } catch (dbErr) {
        logger.debug(`⚠️ [Cleanup] DB stats skipped: ${dbErr.message}`);
      }
    }

    return {
      success: true,
      lifetime: {
        totalRuns: cleanupStats.totalRuns,
        totalFilesDeleted: cleanupStats.totalFilesDeleted,
        totalSpaceFreed: (cleanupStats.totalSpaceFreed / 1024 / 1024 / 1024).toFixed(2) + " GB",
        lastRun: cleanupStats.lastRun,
        recentErrors: cleanupStats.errors.slice(-5),
      },
      database: {
        last7Days: weekStats,
        todayCount: todayCleanups.length,
        recentHistory,
      },
      current: storage,
      settings: {
        maxFileAgeMinutes: MAX_FILE_AGE_MS / 1000 / 60,
        maxStorageGB: MAX_STORAGE_GB,
        minFreeSpaceGB: MIN_FREE_SPACE_GB,
        autoEmergencyCleanup: process.env.AUTO_EMERGENCY_CLEANUP !== "false",
      },
    };
  } catch (err) {
    logger.error(`❌ [Stats] Failed to get cleanup stats: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   🧪 MANUAL CLEANUP TRIGGER (ENHANCED)
---------------------------------------------------------- */
export const manualCleanup = async (options = {}) => {
  try {
    logger.info(`🧹 [Manual] Manual cleanup triggered`);

    const {
      forceAll = false, // Delete all files regardless of age
      olderThanMinutes = null, // Custom age threshold
      emergencyMode = false, // Run emergency cleanup
      userId = null, // User who triggered (for audit)
    } = options;

    if (emergencyMode) {
      return await emergencyCleanup({
        triggeredBy: "manual",
        userId,
      });
    }

    // Regular cleanup with optional custom settings
    const result = await cleanupOldFiles({
      type: "manual",
      triggeredBy: "manual",
      forceAll,
      olderThanMinutes,
      userId,
      notes: options.notes || "Manual cleanup triggered",
    });

    return {
      success: true,
      type: "manual",
      ...result,
    };
  } catch (err) {
    logger.error(`❌ [Manual] Manual cleanup failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   📜 GET CLEANUP HISTORY (NEW)
---------------------------------------------------------- */
export const getCleanupHistory = async (options = {}) => {
  try {
    const {
      limit = 50,
      type = null, // Filter by type
      skip = 0,
      startDate = null,
      endDate = null,
    } = options;

    let query = {};

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const history = await CleanupHistory.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-deletedFiles") // Exclude large array
      .lean();

    const total = await CleanupHistory.countDocuments(query);

    return {
      success: true,
      data: history,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total,
      },
    };
  } catch (err) {
    logger.error(`❌ [History] Failed to get cleanup history: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   📊 GET DETAILED STATS (NEW)
---------------------------------------------------------- */
export const getDetailedStats = async (days = 30) => {
  try {
    const stats = await CleanupHistory.getStatistics(days);

    // Get breakdown by type
    const automaticCleanups = await CleanupHistory.getByType("automatic", 5);
    const manualCleanups = await CleanupHistory.getByType("manual", 5);
    const emergencyCleanups = await CleanupHistory.getByType("emergency", 5);

    // Calculate success rate
    const totalCleanups = await CleanupHistory.countDocuments({
      createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    });

    const successfulCleanups = await CleanupHistory.countDocuments({
      createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      status: "success",
    });

    const successRate = totalCleanups > 0 ? ((successfulCleanups / totalCleanups) * 100).toFixed(1) : 0;

    return {
      success: true,
      period: `Last ${days} days`,
      overview: {
        ...stats,
        totalCleanups,
        successfulCleanups,
        successRate: parseFloat(successRate),
      },
      byType: {
        automatic: {
          count: automaticCleanups.length,
          recent: automaticCleanups,
        },
        manual: {
          count: manualCleanups.length,
          recent: manualCleanups,
        },
        emergency: {
          count: emergencyCleanups.length,
          recent: emergencyCleanups,
        },
      },
    };
  } catch (err) {
    logger.error(`❌ [DetailedStats] Failed to get detailed stats: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   🗑️ CLEAN OLD HISTORY RECORDS (NEW)
---------------------------------------------------------- */
export const cleanOldHistory = async (keepLast = 100) => {
  try {
    logger.info(`🗑️ [History] Cleaning old history records (keeping last ${keepLast})...`);

    const deletedCount = await CleanupHistory.cleanOldHistory(keepLast);

    logger.info(`✅ [History] Deleted ${deletedCount} old history records`);

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} old history records`,
    };
  } catch (err) {
    logger.error(`❌ [History] Failed to clean old history: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   📤 EXPORTS
---------------------------------------------------------- */
export default {
  cleanupOldFiles,
  checkStorageUsage,
  emergencyCleanup,
  getCleanupStats,
  manualCleanup,
  getCleanupHistory,
  getDetailedStats,
  cleanOldHistory,
};