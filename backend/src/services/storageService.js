// ✅ OPTIONAL Storage Service - Heavy Downloads Only (No Instant Downloads)
// ═══════════════════════════════════════════════════════════════════════
// FEATURES:
//    1. ✅ Optional - Disabled by default for instant downloads
//    2. ✅ Heavy downloads only (1080p+, jobs/workers)
//    3. ✅ Temp storage logic isolated
//    4. ✅ Server overload protection
//    5. ✅ No permanent storage
//    6. ✅ No automatic save
// ═══════════════════════════════════════════════════════════════════════

import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ----------------------------------------------------------
   📁 STORAGE CONFIGURATION
---------------------------------------------------------- */

// ⚙️ OPTIONAL STORAGE - Only enabled for heavy downloads
export const STORAGE_ENABLED = process.env.ENABLE_STORAGE === 'true' || false;
export const STORAGE_FOR_HEAVY_ONLY = process.env.STORAGE_HEAVY_ONLY !== 'false'; // Default: true

// Temp storage directory (isolated from permanent storage)
export const TEMP_DIR = process.env.TEMP_STORAGE_PATH ||
  path.resolve(__dirname, "../../downloads/temp");

// Permanent storage directory (deprecated - not used)
export const DOWNLOAD_DIR = process.env.DOWNLOAD_PATH ||
  path.resolve(__dirname, "../../downloads");

// Server overload protection
export const MAX_CONCURRENT_DOWNLOADS = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10);
export const MAX_TEMP_STORAGE_GB = parseFloat(process.env.MAX_TEMP_STORAGE_GB || '5');
export const TEMP_FILE_MAX_AGE_MINUTES = parseInt(process.env.TEMP_FILE_MAX_AGE_MINUTES || '30', 10);

let activeDownloads = 0;
let tempStorageSizeBytes = 0;

// Initialize temp directory only if storage is enabled
if (STORAGE_ENABLED) {
  if (!fsSync.existsSync(TEMP_DIR)) {
    fsSync.mkdirSync(TEMP_DIR, { recursive: true });
    logger.info(`📁 [StorageService] Temp directory created: ${TEMP_DIR}`);
  }

  // Cleanup old temp files on startup
  cleanupTempFiles().catch(() => { });
} else {
  logger.info(`📁 [StorageService] Storage DISABLED - Instant downloads only (no server storage)`);
}

/* ----------------------------------------------------------
   🧩 UTILITY FUNCTIONS
---------------------------------------------------------- */

/**
 * Check if storage should be used for this download
 * Only for heavy downloads (1080p+) when enabled
 */
export const shouldUseStorage = (quality = '720', isJob = false) => {
  if (!STORAGE_ENABLED) {
    return false; // Storage disabled - instant downloads only
  }

  if (!STORAGE_FOR_HEAVY_ONLY) {
    return false; // Heavy-only mode disabled
  }

  // Only use storage for heavy downloads (1080p+) or jobs
  const qualityNum = parseInt(String(quality).replace(/p$/i, ''));
  const isHeavyDownload = !isNaN(qualityNum) && qualityNum >= 1080;

  return isHeavyDownload || isJob;
};

/**
 * Check if server can handle another download (overload protection)
 */
export const canStartDownload = () => {
  if (!STORAGE_ENABLED) {
    return true; // No storage = no server load
  }

  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
    logger.warn(`⚠️ [StorageService] Max concurrent downloads reached (${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS})`);
    return false;
  }

  // Check temp storage limit
  const currentStorageGB = tempStorageSizeBytes / (1024 * 1024 * 1024);
  if (currentStorageGB >= MAX_TEMP_STORAGE_GB) {
    logger.warn(`⚠️ [StorageService] Temp storage limit reached (${currentStorageGB.toFixed(2)} GB / ${MAX_TEMP_STORAGE_GB} GB)`);
    // Try cleanup before rejecting
    cleanupTempFiles().catch(() => { });
    return false;
  }

  return true;
};

/**
 * Register download start (for overload protection)
 */
export const registerDownloadStart = () => {
  if (STORAGE_ENABLED) {
    activeDownloads++;
    logger.debug(`📥 [StorageService] Download started (${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS})`);
  }
};

/**
 * Register download end (for overload protection)
 */
export const registerDownloadEnd = () => {
  if (STORAGE_ENABLED) {
    activeDownloads = Math.max(0, activeDownloads - 1);
    logger.debug(`✅ [StorageService] Download ended (${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS})`);
  }
};

/**
 * Get temp file path (isolated temp storage)
 */
export const getTempFilePath = (fileName) => {
  return path.join(TEMP_DIR, fileName);
};

/**
 * Get full file path (deprecated - not used for permanent storage)
 */
export const getFilePath = (fileName) => {
  return path.join(DOWNLOAD_DIR, fileName);
};

/**
 * Check if temp file exists
 */
export const tempFileExists = (fileName) => {
  if (!STORAGE_ENABLED) return false;
  const filePath = getTempFilePath(fileName);
  return fsSync.existsSync(filePath);
};

/**
 * Check if file exists (deprecated - for compatibility)
 */
export const fileExists = (fileName) => {
  return tempFileExists(fileName);
};

/**
 * Get temp file statistics
 */
export const getTempFileStats = async (fileName) => {
  if (!STORAGE_ENABLED) return null;

  try {
    const filePath = getTempFilePath(fileName);

    if (!fsSync.existsSync(filePath)) {
      return null;
    }

    const stats = await fs.stat(filePath);

    return {
      exists: true,
      name: fileName,
      path: filePath,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      sizeKB: (stats.size / 1024).toFixed(2),
      created: stats.birthtime,
      modified: stats.mtime,
      age: Date.now() - stats.mtimeMs,
      ageMinutes: Math.floor((Date.now() - stats.mtimeMs) / 1000 / 60),
      isTemp: true
    };
  } catch (err) {
    logger.error(`❌ [StorageService] Error getting temp file stats: ${err.message}`);
    return null;
  }
};

/**
 * Get file statistics (for compatibility)
 */
export const getFileStats = async (fileName) => {
  return getTempFileStats(fileName);
};

/**
 * Delete a temp file
 */
export const deleteTempFile = async (fileName) => {
  if (!STORAGE_ENABLED) return false;

  try {
    const filePath = getTempFilePath(fileName);

    if (!fsSync.existsSync(filePath)) {
      logger.warn(`⚠️ [StorageService] Temp file not found: ${fileName}`);
      return false;
    }

    const stats = await fs.stat(filePath);
    await fs.unlink(filePath);

    // Update temp storage size
    tempStorageSizeBytes = Math.max(0, tempStorageSizeBytes - stats.size);

    logger.info(`🗑️ [StorageService] Deleted temp file: ${fileName}`);
    return true;
  } catch (err) {
    logger.error(`❌ [StorageService] Delete temp file failed for ${fileName}: ${err.message}`);
    return false;
  }
};

/**
 * Delete a file (for compatibility)
 */
export const deleteFile = async (fileName) => {
  return deleteTempFile(fileName);
};

/* ----------------------------------------------------------
   📊 TEMP STORAGE MANAGEMENT (Isolated)
---------------------------------------------------------- */

/**
 * List all temp files
 */
export const listTempFiles = async () => {
  if (!STORAGE_ENABLED) return [];

  try {
    if (!fsSync.existsSync(TEMP_DIR)) {
      return [];
    }

    const files = await fs.readdir(TEMP_DIR);

    const fileStats = await Promise.all(
      files
        .filter(file => !file.startsWith('.')) // Ignore hidden files
        .map(async (file) => {
          const stats = await getTempFileStats(file);
          return stats;
        })
    );

    return fileStats.filter(Boolean).sort((a, b) => b.modified - a.modified);
  } catch (err) {
    logger.error(`❌ [StorageService] Error listing temp files: ${err.message}`);
    return [];
  }
};

/**
 * List all files (for compatibility - returns temp files only)
 */
export const listAllFiles = async () => {
  return listTempFiles();
};

/**
 * Get total temp storage used
 */
export const getTotalTempStorageUsed = async () => {
  if (!STORAGE_ENABLED) {
    return {
      totalFiles: 0,
      totalBytes: 0,
      totalMB: "0",
      totalGB: "0",
      files: [],
      enabled: false
    };
  }

  try {
    const files = await listTempFiles();

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    tempStorageSizeBytes = totalBytes; // Update cache

    return {
      totalFiles: files.length,
      totalBytes: totalBytes,
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
      totalGB: (totalBytes / 1024 / 1024 / 1024).toFixed(2),
      files: files,
      enabled: true,
      maxGB: MAX_TEMP_STORAGE_GB,
      activeDownloads: activeDownloads,
      maxConcurrent: MAX_CONCURRENT_DOWNLOADS
    };
  } catch (err) {
    logger.error(`❌ [StorageService] Error calculating temp storage: ${err.message}`);
    return {
      totalFiles: 0,
      totalBytes: 0,
      totalMB: "0",
      totalGB: "0",
      files: [],
      enabled: true,
      error: err.message
    };
  }
};

/**
 * Get total storage used (for compatibility)
 */
export const getTotalStorageUsed = async () => {
  return getTotalTempStorageUsed();
};

/* ----------------------------------------------------------
   🧹 TEMP STORAGE CLEANUP (Isolated)
---------------------------------------------------------- */

/**
 * Cleanup old temp files (older than specified minutes)
 */
export const cleanupTempFiles = async (maxAgeMinutes = TEMP_FILE_MAX_AGE_MINUTES) => {
  if (!STORAGE_ENABLED) {
    return {
      success: true,
      deletedCount: 0,
      freedSpace: 0,
      freedMB: "0",
      message: "Storage disabled - no cleanup needed"
    };
  }

  try {
    logger.info(`🧹 [StorageService] Cleaning temp files (age > ${maxAgeMinutes} min)...`);

    const files = await listTempFiles();
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of files) {
      const age = now - file.modified.getTime();

      if (age > maxAgeMs) {
        const deleted = await deleteTempFile(file.name);
        if (deleted) {
          deletedCount++;
          freedSpace += file.size;
        }
      }
    }

    const freedMB = (freedSpace / 1024 / 1024).toFixed(2);

    logger.info(
      `✅ [StorageService] Temp cleanup: ${deletedCount} files deleted, ${freedMB} MB freed`
    );

    return {
      success: true,
      deletedCount,
      freedSpace,
      freedMB,
    };
  } catch (err) {
    logger.error(`❌ [StorageService] Temp cleanup failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/**
 * Cleanup old files (for compatibility)
 */
export const cleanupOldFiles = async (maxAgeMinutes = TEMP_FILE_MAX_AGE_MINUTES) => {
  return cleanupTempFiles(maxAgeMinutes);
};

/**
 * Cleanup large temp files (to prevent server overload)
 */
export const cleanupLargeTempFiles = async (maxSizeMB = 500) => {
  if (!STORAGE_ENABLED) {
    return {
      success: true,
      deletedCount: 0,
      freedSpace: 0,
      freedMB: "0",
      message: "Storage disabled - no cleanup needed"
    };
  }

  try {
    logger.info(`🧹 [StorageService] Cleaning temp files > ${maxSizeMB} MB...`);

    const files = await listTempFiles();

    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of files) {
      if (parseFloat(file.sizeMB) > maxSizeMB) {
        const deleted = await deleteTempFile(file.name);
        if (deleted) {
          deletedCount++;
          freedSpace += file.size;
        }
      }
    }

    const freedMB = (freedSpace / 1024 / 1024).toFixed(2);

    logger.info(
      `✅ [StorageService] Large temp files cleaned: ${deletedCount} files, ${freedMB} MB freed`
    );

    return {
      success: true,
      deletedCount,
      freedSpace,
      freedMB,
    };
  } catch (err) {
    logger.error(`❌ [StorageService] Large temp file cleanup failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/**
 * Cleanup large files (for compatibility)
 */
export const cleanupLargeFiles = async (maxSizeMB = 500) => {
  return cleanupLargeTempFiles(maxSizeMB);
};

/**
 * Emergency cleanup if temp storage exceeds limit (server overload protection)
 */
export const emergencyCleanup = async (maxStorageGB = MAX_TEMP_STORAGE_GB) => {
  if (!STORAGE_ENABLED) {
    return {
      success: true,
      cleaned: false,
      message: "Storage disabled - no cleanup needed"
    };
  }

  try {
    const storage = await getTotalTempStorageUsed();

    if (parseFloat(storage.totalGB) <= maxStorageGB) {
      logger.info(`✅ [StorageService] Temp storage OK (${storage.totalGB} GB < ${maxStorageGB} GB)`);
      return {
        success: true,
        cleaned: false,
        message: "No cleanup needed",
      };
    }

    logger.warn(`⚠️ [StorageService] Temp storage limit exceeded! (${storage.totalGB} GB > ${maxStorageGB} GB)`);

    // Delete oldest temp files first
    const files = storage.files.sort((a, b) => a.modified - b.modified);

    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of files) {
      const deleted = await deleteTempFile(file.name);
      if (deleted) {
        deletedCount++;
        freedSpace += file.size;
      }

      // Check if we're under limit now
      const currentStorage = await getTotalTempStorageUsed();
      if (parseFloat(currentStorage.totalGB) <= maxStorageGB) {
        break;
      }
    }

    const freedGB = (freedSpace / 1024 / 1024 / 1024).toFixed(2);

    logger.info(
      `✅ [StorageService] Emergency temp cleanup: ${deletedCount} files, ${freedGB} GB freed`
    );

    return {
      success: true,
      cleaned: true,
      deletedCount,
      freedSpace,
      freedGB,
    };
  } catch (err) {
    logger.error(`❌ [StorageService] Emergency temp cleanup failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   ✅ DEFAULT EXPORT
---------------------------------------------------------- */
export default {
  // Configuration
  STORAGE_ENABLED,
  STORAGE_FOR_HEAVY_ONLY,
  TEMP_DIR,
  DOWNLOAD_DIR, // Deprecated - kept for compatibility

  // Core functions
  shouldUseStorage,
  canStartDownload,
  registerDownloadStart,
  registerDownloadEnd,

  // Temp storage (isolated)
  getTempFilePath,
  tempFileExists,
  getTempFileStats,
  deleteTempFile,
  listTempFiles,
  getTotalTempStorageUsed,
  cleanupTempFiles,
  cleanupLargeTempFiles,

  // Compatibility functions (deprecated)
  getFilePath,
  fileExists,
  getFileStats,
  deleteFile,
  listAllFiles,
  getTotalStorageUsed,
  cleanupOldFiles,
  cleanupLargeFiles,

  // Emergency cleanup
  emergencyCleanup,
};