// ✅ OPTIONAL File Manager Utility - Helper Only (Not Used for Downloads)
// ═══════════════════════════════════════════════════════════════════════
// NOTE: This is an optional helper utility.
// Downloads do NOT use file operations - they return direct URLs.
// This utility is kept for optional admin/maintenance tasks only.
// ═══════════════════════════════════════════════════════════════════════

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import logger from "../utils/logger.js";

const execAsync = promisify(exec);
const DOWNLOAD_DIR = path.resolve(process.cwd(), "downloads");

// ⚠️ WARNING: This utility is optional and NOT used for download operations
// Downloads return direct URLs - no file save/delete/path operations

/* ----------------------------------------------------------
   📁 ENSURE DIRECTORY EXISTS
---------------------------------------------------------- */
export const ensureDirectory = async (dirPath) => {
  try {
    if (!fsSync.existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
      logger.info(`📁 [FileManager] Created directory: ${dirPath}`);
      return { success: true, created: true };
    }
    return { success: true, created: false };
  } catch (err) {
    logger.error(`❌ [FileManager] Failed to create directory: ${err.message}`);
    return { success: false, error: err.message };
  }
};

/* ----------------------------------------------------------
   🗑️ SAFE FILE DELETE
---------------------------------------------------------- */
export const safeDelete = async (filePath) => {
  try {
    if (!fsSync.existsSync(filePath)) {
      return {
        success: false,
        deleted: false,
        reason: "File not found"
      };
    }

    // Check if file is locked (Windows-specific check)
    try {
      const handle = await fs.open(filePath, "r+");
      await handle.close();
    } catch (lockErr) {
      return {
        success: false,
        deleted: false,
        reason: "File is locked or in use"
      };
    }

    const stats = fsSync.statSync(filePath);
    const size = stats.size;

    await fs.unlink(filePath);

    // Verify deletion
    if (fsSync.existsSync(filePath)) {
      return {
        success: false,
        deleted: false,
        reason: "Deletion verification failed"
      };
    }

    return {
      success: true,
      deleted: true,
      size,
      sizeMB: (size / 1024 / 1024).toFixed(2)
    };

  } catch (err) {
    logger.error(`❌ [FileManager] Delete error: ${err.message}`);
    return {
      success: false,
      deleted: false,
      reason: err.message
    };
  }
};

/* ----------------------------------------------------------
   📊 GET FILE INFO
---------------------------------------------------------- */
export const getFileInfo = async (filePath) => {
  try {
    if (!fsSync.existsSync(filePath)) {
      return null;
    }

    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath);

    return {
      name: fileName,
      path: filePath,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      sizeGB: (stats.size / 1024 / 1024 / 1024).toFixed(3),
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      extension: path.extname(fileName),
      age: Date.now() - stats.mtimeMs,
      ageMinutes: Math.floor((Date.now() - stats.mtimeMs) / 1000 / 60),
      ageHours: ((Date.now() - stats.mtimeMs) / 1000 / 60 / 60).toFixed(1),
    };

  } catch (err) {
    logger.error(`❌ [FileManager] Get file info error: ${err.message}`);
    return null;
  }
};

/* ----------------------------------------------------------
   📂 LIST ALL FILES IN DIRECTORY
---------------------------------------------------------- */
export const listFiles = async (dirPath = DOWNLOAD_DIR, options = {}) => {
  try {
    const {
      includeHidden = false,
      sortBy = "modified", // modified, size, name, age
      sortOrder = "desc",   // asc, desc
      filterExt = null,     // e.g., ".mp4", ".mp3"
    } = options;

    if (!fsSync.existsSync(dirPath)) {
      return { success: false, files: [], error: "Directory not found" };
    }

    const fileNames = await fs.readdir(dirPath);
    const files = [];

    for (const fileName of fileNames) {
      // Skip hidden files if not included
      if (!includeHidden && fileName.startsWith('.')) {
        continue;
      }

      // Skip system files
      if (fileName === 'Thumbs.db' || fileName === '.DS_Store') {
        continue;
      }

      const filePath = path.join(dirPath, fileName);
      const fileInfo = await getFileInfo(filePath);

      if (fileInfo) {
        // Apply extension filter
        if (filterExt && fileInfo.extension !== filterExt) {
          continue;
        }

        files.push(fileInfo);
      }
    }

    // Sort files
    files.sort((a, b) => {
      let compareA, compareB;

      switch (sortBy) {
        case "size":
          compareA = a.size;
          compareB = b.size;
          break;
        case "name":
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
        case "age":
          compareA = a.age;
          compareB = b.age;
          break;
        case "modified":
        default:
          compareA = a.modified.getTime();
          compareB = b.modified.getTime();
          break;
      }

      if (sortOrder === "asc") {
        return compareA > compareB ? 1 : -1;
      } else {
        return compareA < compareB ? 1 : -1;
      }
    });

    return {
      success: true,
      files,
      count: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
    };

  } catch (err) {
    logger.error(`❌ [FileManager] List files error: ${err.message}`);
    return {
      success: false,
      files: [],
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   💾 GET DISK SPACE (Cross-platform)
---------------------------------------------------------- */
export const getDiskSpace = async () => {
  try {
    let command;
    const isWindows = process.platform === "win32";

    if (isWindows) {
      // Windows: Use wmic
      const drive = DOWNLOAD_DIR.split(":")[0];
      command = `wmic logicaldisk where "DeviceID='${drive}:'" get Size,FreeSpace /format:list`;
    } else {
      // Linux/Mac: Use df
      command = `df -k "${DOWNLOAD_DIR}" | tail -1`;
    }

    const { stdout } = await execAsync(command);

    let total, free, used;

    if (isWindows) {
      const lines = stdout.split("\n").filter((line) => line.trim());
      const freeMatch = lines.find((l) => l.startsWith("FreeSpace="));
      const sizeMatch = lines.find((l) => l.startsWith("Size="));

      free = parseInt(freeMatch?.split("=")[1] || 0);
      total = parseInt(sizeMatch?.split("=")[1] || 0);
      used = total - free;
    } else {
      const parts = stdout.trim().split(/\s+/);
      total = parseInt(parts[1]) * 1024; // KB to bytes
      used = parseInt(parts[2]) * 1024;
      free = parseInt(parts[3]) * 1024;
    }

    const percentUsed = ((used / total) * 100).toFixed(1);

    return {
      success: true,
      total,
      used,
      free,
      totalGB: (total / 1024 / 1024 / 1024).toFixed(2),
      usedGB: (used / 1024 / 1024 / 1024).toFixed(2),
      freeGB: (free / 1024 / 1024 / 1024).toFixed(2),
      percentUsed: parseFloat(percentUsed),
    };

  } catch (err) {
    logger.error(`❌ [FileManager] Get disk space error: ${err.message}`);

    // Fallback: Return dummy data
    return {
      success: false,
      error: err.message,
      total: 0,
      used: 0,
      free: 0,
      totalGB: "0.00",
      usedGB: "0.00",
      freeGB: "0.00",
      percentUsed: 0,
    };
  }
};

/* ----------------------------------------------------------
   🔍 FIND FILES BY AGE
---------------------------------------------------------- */
export const findFilesByAge = async (minAgeMinutes, maxAgeMinutes = Infinity) => {
  try {
    const result = await listFiles(DOWNLOAD_DIR);

    if (!result.success) {
      return { success: false, files: [] };
    }

    const filteredFiles = result.files.filter((file) => {
      return file.ageMinutes >= minAgeMinutes && file.ageMinutes <= maxAgeMinutes;
    });

    return {
      success: true,
      files: filteredFiles,
      count: filteredFiles.length,
      totalSize: filteredFiles.reduce((sum, f) => sum + f.size, 0),
    };

  } catch (err) {
    logger.error(`❌ [FileManager] Find files by age error: ${err.message}`);
    return { success: false, files: [], error: err.message };
  }
};

/* ----------------------------------------------------------
   🔍 FIND LARGE FILES
---------------------------------------------------------- */
export const findLargeFiles = async (minSizeMB = 100) => {
  try {
    const result = await listFiles(DOWNLOAD_DIR);

    if (!result.success) {
      return { success: false, files: [] };
    }

    const minSizeBytes = minSizeMB * 1024 * 1024;

    const largeFiles = result.files
      .filter((file) => file.size >= minSizeBytes)
      .sort((a, b) => b.size - a.size); // Largest first

    return {
      success: true,
      files: largeFiles,
      count: largeFiles.length,
      totalSize: largeFiles.reduce((sum, f) => sum + f.size, 0),
    };

  } catch (err) {
    logger.error(`❌ [FileManager] Find large files error: ${err.message}`);
    return { success: false, files: [], error: err.message };
  }
};

/* ----------------------------------------------------------
   🧹 BATCH DELETE FILES
---------------------------------------------------------- */
export const batchDelete = async (filePaths) => {
  try {
    const results = {
      total: filePaths.length,
      deleted: 0,
      failed: 0,
      freedSpace: 0,
      errors: [],
    };

    for (const filePath of filePaths) {
      const result = await safeDelete(filePath);

      if (result.deleted) {
        results.deleted++;
        results.freedSpace += result.size;
      } else {
        results.failed++;
        results.errors.push({
          file: path.basename(filePath),
          reason: result.reason,
        });
      }
    }

    results.freedMB = (results.freedSpace / 1024 / 1024).toFixed(2);
    results.freedGB = (results.freedSpace / 1024 / 1024 / 1024).toFixed(2);

    return {
      success: true,
      ...results,
    };

  } catch (err) {
    logger.error(`❌ [FileManager] Batch delete error: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   📊 GET DIRECTORY STATISTICS
---------------------------------------------------------- */
export const getDirectoryStats = async (dirPath = DOWNLOAD_DIR) => {
  try {
    const filesResult = await listFiles(dirPath);
    const diskSpace = await getDiskSpace();

    if (!filesResult.success) {
      return { success: false, error: "Failed to get directory stats" };
    }

    const files = filesResult.files;

    // Calculate statistics
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const avgSize = files.length > 0 ? totalSize / files.length : 0;

    const oldestFile = files.length > 0
      ? files.reduce((oldest, f) => f.age > oldest.age ? f : oldest)
      : null;

    const newestFile = files.length > 0
      ? files.reduce((newest, f) => f.age < newest.age ? f : newest)
      : null;

    const largestFile = files.length > 0
      ? files.reduce((largest, f) => f.size > largest.size ? f : largest)
      : null;

    // Group by extension
    const byExtension = {};
    files.forEach((file) => {
      const ext = file.extension || "no-extension";
      if (!byExtension[ext]) {
        byExtension[ext] = { count: 0, totalSize: 0 };
      }
      byExtension[ext].count++;
      byExtension[ext].totalSize += file.size;
    });

    return {
      success: true,
      directory: dirPath,
      fileCount: files.length,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2),
      averageSizeMB: (avgSize / 1024 / 1024).toFixed(2),
      oldestFile: oldestFile ? {
        name: oldestFile.name,
        ageMinutes: oldestFile.ageMinutes,
        sizeMB: oldestFile.sizeMB,
      } : null,
      newestFile: newestFile ? {
        name: newestFile.name,
        ageMinutes: newestFile.ageMinutes,
        sizeMB: newestFile.sizeMB,
      } : null,
      largestFile: largestFile ? {
        name: largestFile.name,
        sizeMB: largestFile.sizeMB,
      } : null,
      byExtension,
      diskSpace: diskSpace.success ? {
        totalGB: diskSpace.totalGB,
        usedGB: diskSpace.usedGB,
        freeGB: diskSpace.freeGB,
        percentUsed: diskSpace.percentUsed,
      } : null,
    };

  } catch (err) {
    logger.error(`❌ [FileManager] Get directory stats error: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
};

/* ----------------------------------------------------------
   ✅ FILE VALIDATION
---------------------------------------------------------- */
export const validateFile = (filePath) => {
  try {
    if (!fsSync.existsSync(filePath)) {
      return { valid: false, reason: "File not found" };
    }

    const stats = fsSync.statSync(filePath);

    if (!stats.isFile()) {
      return { valid: false, reason: "Not a file" };
    }

    if (stats.size === 0) {
      return { valid: false, reason: "Empty file" };
    }

    if (stats.size < 1024) {
      return { valid: false, reason: "File too small (< 1KB)" };
    }

    return {
      valid: true,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2)
    };

  } catch (err) {
    return { valid: false, reason: err.message };
  }
};

/* ----------------------------------------------------------
   📤 EXPORTS
---------------------------------------------------------- */
export default {
  ensureDirectory,
  safeDelete,
  getFileInfo,
  listFiles,
  getDiskSpace,
  findFilesByAge,
  findLargeFiles,
  batchDelete,
  getDirectoryStats,
  validateFile,
  DOWNLOAD_DIR,
};