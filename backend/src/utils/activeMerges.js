// ═══════════════════════════════════════════════════════════════════════
// 🎯 Active Merges Tracker - Prevents Cleanup During Merge Operations
// ═══════════════════════════════════════════════════════════════════════
// PURPOSE: Track active merge operations to prevent cleanup scheduler
//          from deleting temp files while merge is in progress
// ═══════════════════════════════════════════════════════════════════════

const activeMerges = new Map(); // Map<mergeId, { files: string[], startTime: Date }>

/**
 * Register an active merge operation
 * @param {string} mergeId - Unique merge operation ID
 * @param {string[]} tempFiles - Array of temp file paths being used
 * @returns {void}
 */
export const registerActiveMerge = (mergeId, tempFiles) => {
  activeMerges.set(mergeId, {
    files: tempFiles || [],
    startTime: new Date(),
  });
};

/**
 * Unregister an active merge operation
 * @param {string} mergeId - Unique merge operation ID
 * @returns {void}
 */
export const unregisterActiveMerge = (mergeId) => {
  activeMerges.delete(mergeId);
};

/**
 * Check if a file is currently being used in an active merge
 * @param {string} filePath - Path to check
 * @returns {boolean} - True if file is in active merge
 */
export const isFileInActiveMerge = (filePath) => {
  for (const [mergeId, mergeData] of activeMerges.entries()) {
    if (mergeData.files.includes(filePath)) {
      return true;
    }
  }
  return false;
};

/**
 * Get all files currently in active merges
 * @returns {string[]} - Array of file paths
 */
export const getActiveMergeFiles = () => {
  const allFiles = [];
  for (const mergeData of activeMerges.values()) {
    allFiles.push(...mergeData.files);
  }
  return allFiles;
};

/**
 * Get count of active merges
 * @returns {number} - Number of active merges
 */
export const getActiveMergeCount = () => {
  return activeMerges.size;
};

/**
 * Clean up stale merge registrations (older than 30 minutes)
 * @returns {number} - Number of stale merges cleaned up
 */
export const cleanupStaleMerges = () => {
  const maxAge = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  let cleaned = 0;

  for (const [mergeId, mergeData] of activeMerges.entries()) {
    const age = now - mergeData.startTime.getTime();
    if (age > maxAge) {
      activeMerges.delete(mergeId);
      cleaned++;
    }
  }

  return cleaned;
};

export default {
  registerActiveMerge,
  unregisterActiveMerge,
  isFileInActiveMerge,
  getActiveMergeFiles,
  getActiveMergeCount,
  cleanupStaleMerges,
};

