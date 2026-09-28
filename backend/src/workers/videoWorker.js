// ═══════════════════════════════════════════════════════════════════════
// ⚠️ DEPRECATED FOR MP3 JUICE MODE: Video Worker
// ═══════════════════════════════════════════════════════════════════════
// 🎯 MP3 JUICE MODE: This worker should NOT be used
//    - MP3 Juice architecture uses direct URLs only
//    - All formats return direct URLs (even 1080p+)
//    - No server-side downloads or file storage
//    - User browser downloads directly from YouTube CDN
//
// ⚠️ This worker is kept for backward compatibility only
//    - It still uses downloadToFile (deprecated)
//    - Should be refactored to generate direct URLs if needed
//    - For MP3 Juice mode, use getDownloadUrl() instead
//
// FEATURES (Legacy):
//    1. Heavy downloads only (1080p+, high bitrate MP3, long videos)
//    2. Rejects instant downloads (< 1080p, low bitrate, short videos)
//    3. Progress tracking only for heavy downloads
//    4. Proper queue integration with validation
//    5. Improved error handling and recovery
//    6. Memory leak prevention
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// 🌍 LOAD ENVIRONMENT VARIABLES FIRST (Before any other imports)
// ═══════════════════════════════════════════════════════════════════════
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env file IMMEDIATELY - before any other code runs
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try multiple paths to find .env file
const envPaths = [
  path.resolve(__dirname, "../../.env"), // From worker location: backend/src/workers/ -> backend/.env
  path.resolve(process.cwd(), ".env"),   // From current working directory
  path.resolve(process.cwd(), "backend/.env"), // If running from project root
];

let envLoaded = false;
let loadedPath = null;

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    loadedPath = envPath;
  }
}

// Now import other modules (they can safely use process.env)
import Queue from "bull";
import mongoose from "mongoose";
import connectDB, { getMongoHost, isMongoDBDisabled } from "../config/db.js";
import Job from "../models/Job.js";
import * as videoService from "../services/videoService.js";
import logger from "../utils/logger.js";
import { fetchVideoInfo } from "../services/videoService.js";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📊 CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 2;
const PROGRESS_THROTTLE = 1500; // Update every 1.5 seconds (more responsive)
const MONGO_RETRY_DELAY = 5000;
const REDIS_RETRY_DELAY = 3000;
const MAX_RETRY_ATTEMPTS = 5;

// Heavy download thresholds
const HEAVY_QUALITY_THRESHOLD = 1080; // 1080p and above
const HEAVY_BITRATE_THRESHOLD = 256; // 256kbps and above for MP3
const LONG_VIDEO_THRESHOLD = 600; // 10 minutes (600 seconds)

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔌 MongoDB Connection (OPTIONAL - Continue Without DB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

let isMongoConnected = false;
let mongoRetryCount = 0;
let isConnectingMongo = false;

/**
 * Connect to MongoDB - OPTIONAL for worker operation
 * Downloads continue even if MongoDB is unavailable
 * Uses improved connection logic from db.js
 */
const connectMongo = async () => {
  // Check if MongoDB is disabled
  if (isMongoDBDisabled()) {
    logger.debug("ℹ️ [Worker] MongoDB is disabled - skipping connection");
    return false;
  }

  if (isMongoConnected) return true;
  if (isConnectingMongo) {
    // Wait for ongoing connection attempt (max 5 seconds)
    let waitCount = 0;
    while (isConnectingMongo && waitCount < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    return isMongoConnected;
  }

  isConnectingMongo = true;

  try {
    // Use the improved connectDB function from db.js
    logger.debug(`🗄️ [Worker] Attempting MongoDB connection (optional)...`);
    const result = await connectDB();

    if (result) {
      isMongoConnected = true;
      mongoRetryCount = 0;
      const host = getMongoHost() || mongoose.connection.host || "unknown-host";
      logger.info(`✅ [Worker] MongoDB connected (host: ${host})`);
      return true;
    } else {
      // Connection failed but not fatal - continue without MongoDB
      isMongoConnected = false;
      logger.debug(`⚠️ [Worker] MongoDB connection unavailable - continuing without database`);
      return false;
    }
  } catch (err) {
    // This should rarely happen as connectDB doesn't throw, but handle it anyway
    isMongoConnected = false;
    logger.warn(`⚠️ [Worker] MongoDB connection error: ${err.message}`);
    logger.warn(`   Downloads will continue without MongoDB - history persistence disabled`);
    return false;
  } finally {
    isConnectingMongo = false;
  }
};

// MongoDB event handlers - log warnings instead of exiting
mongoose.connection.on("connected", () => {
  isMongoConnected = true;
  workerReconnectAttempts = 0; // Reset on successful connection
  if (workerReconnectTimeout) {
    clearTimeout(workerReconnectTimeout);
    workerReconnectTimeout = null;
  }
  const host = getMongoHost() || mongoose.connection.host || "unknown-host";
  logger.info(`✅ [Worker] MongoDB reconnected (host: ${host})`);
});

let workerReconnectTimeout = null;
let workerReconnectAttempts = 0;
const MAX_WORKER_RECONNECT_ATTEMPTS = 2; // Reduced from 3 to prevent spam

mongoose.connection.on("disconnected", () => {
  isMongoConnected = false;
  
  // Don't attempt reconnection if MongoDB is disabled
  if (isMongoDBDisabled()) {
    return;
  }
  
  // Only log first disconnect, then reduce spam
  if (workerReconnectAttempts === 0) {
    logger.warn("⚠️ [Worker] MongoDB disconnected - downloads will continue without history persistence");
  }
  
  // Throttle reconnection attempts (max 2 attempts)
  if (workerReconnectAttempts < MAX_WORKER_RECONNECT_ATTEMPTS && !isMongoDBDisabled()) {
    workerReconnectAttempts++;
    if (workerReconnectTimeout) clearTimeout(workerReconnectTimeout);
    
    // Exponential backoff: 10s, 20s
    const delay = workerReconnectAttempts * 10000;
    
    workerReconnectTimeout = setTimeout(() => {
      // Only reconnect if not disabled
      if (!isMongoDBDisabled()) {
        connectMongo().catch(() => {
          if (workerReconnectAttempts < MAX_WORKER_RECONNECT_ATTEMPTS) {
            logger.debug(`⚠️ [Worker] Reconnect attempt ${workerReconnectAttempts}/${MAX_WORKER_RECONNECT_ATTEMPTS} failed`);
          } else {
            logger.debug("⚠️ [Worker] Max reconnect attempts reached - continuing without MongoDB");
          }
        });
      }
    }, delay);
  } else {
    logger.debug("⚠️ [Worker] Stopping reconnection attempts - MongoDB unavailable");
  }
});

mongoose.connection.on("error", (err) => {
  logger.warn(`⚠️ [Worker] MongoDB error: ${err.message}`);
  isMongoConnected = false;
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔴 Redis Queue Setup (Optimized Configuration)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const redisPassword = process.env.REDIS_PASSWORD?.trim();
const hasRedisPassword = redisPassword && redisPassword.length > 0;

const videoQueue = new Queue("video-processing", {
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    // Only send a password if one is actually provided
    password: hasRedisPassword ? redisPassword : undefined,
    retryStrategy(times) {
      if (times > MAX_RETRY_ATTEMPTS) {
        return false;
      }
      return Math.min(times * 500, REDIS_RETRY_DELAY);
    },
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
  },
  settings: {
    maxStalledCount: 2,
    stalledInterval: 30000,
    lockDuration: 600000, // 10 minutes (for large files)
    lockRenewTime: 30000, // Renew every 30 seconds
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 7200, // Keep failed for 2 hours
      count: 50,
    },
    timeout: 900000, // 15 minutes max per job
  },
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🛠️ HELPER FUNCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Atomic job update with retry logic (prevents race conditions)
 * Gracefully skips if MongoDB is unavailable
 */
const updateJobAtomic = async (jobDbId, updates, retries = 3) => {
  // Skip if MongoDB is not connected
  if (!isMongoConnected || !jobDbId) {
    return false;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await Job.findByIdAndUpdate(
        jobDbId,
        {
          ...updates,
          updatedAt: new Date()
        },
        {
          new: false,
          runValidators: false,
          lean: true // Faster updates
        }
      );
      return true;
    } catch (err) {
      // Check if MongoDB connection was lost
      if (!isMongoConnected || err.name === 'MongoNetworkError' || err.name === 'MongoServerSelectionError') {
        logger.warn(`⚠️ [Worker] MongoDB unavailable - skipping job update`);
        return false;
      }
      
      if (attempt === retries) {
        logger.warn(`⚠️ [Worker] Job update failed after ${retries} attempts: ${err.message}`);
        return false;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
  }
  return false;
};

/**
 * Check if download is heavy and should use worker
 * Heavy downloads: 1080p+, high bitrate MP3 (256kbps+), or long videos (10min+)
 */
export const isHeavyDownload = async (url, quality, format, duration = null) => {
  // Check quality threshold
  if (format === 'mp4') {
    const qualityNum = parseInt(String(quality).replace(/[^0-9]/g, ''));
    if (!isNaN(qualityNum) && qualityNum >= HEAVY_QUALITY_THRESHOLD) {
      return true; // 1080p+ is heavy
    }
  }

  // Check bitrate threshold for MP3
  if (format === 'mp3') {
    const bitrateNum = parseInt(String(quality).replace(/[^0-9]/g, ''));
    if (!isNaN(bitrateNum) && bitrateNum >= HEAVY_BITRATE_THRESHOLD) {
      return true; // High bitrate MP3 is heavy
    }
  }

  // Check video duration (if provided or fetch it)
  let videoDuration = duration;
  if (!videoDuration && url) {
    try {
      const videoInfo = await fetchVideoInfo(url);
      videoDuration = videoInfo?.duration || 0;
    } catch (err) {
      logger.warn(`⚠️ [Worker] Could not fetch video duration: ${err.message}`);
    }
  }

  if (videoDuration && videoDuration >= LONG_VIDEO_THRESHOLD) {
    return true; // Long videos (10min+) are heavy
  }

  return false; // Not heavy - should use instant download
};

/**
 * Check if quality needs merge (handles more cases)
 */
const needsMerge = (quality, format) => {
  if (format !== 'mp4') return false;

  if (!quality || quality === 'auto') return false;

  const qualityNum = parseInt(String(quality).replace(/[^0-9]/g, ''));

  // High quality always needs merge
  if (qualityNum >= 1080) return true;

  // Lower qualities might need merge if audio is missing
  // This will be determined dynamically during download
  return false;
};

/**
 * Get user-friendly status message
 */
const getStatusMessage = (status, percent, additionalData = {}) => {
  switch (status) {
    case 'preparing':
      return 'Preparing download...';
    case 'fetching_streams':
      return 'Fetching video streams from YouTube...';
    case 'downloading_video':
      return `Downloading video stream... ${percent}%`;
    case 'video_complete':
      return 'Video stream downloaded ✓';
    case 'downloading_audio':
      return `Downloading audio stream... ${percent}%`;
    case 'audio_complete':
      return 'Audio stream downloaded ✓';
    case 'downloading':
      return `Downloading... ${percent}%`;
    case 'merging':
      const mergePercent = additionalData.mergePercent || percent;
      return `Merging video + audio... ${mergePercent}%`;
    case 'merge_complete':
      return 'Merge complete! Finalizing...';
    case 'converting':
      const convPercent = additionalData.conversionPercent || percent;
      return `Converting to ${additionalData.format || 'MP3'}... ${convPercent}%`;
    case 'finalizing':
      return 'Finalizing download...';
    case 'completed':
      return 'Download complete!';
    default:
      return `Processing... ${percent}%`;
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎬 MAIN WORKER LOGIC - PERFECT AUDIO SUPPORT!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

videoQueue.process(WORKER_CONCURRENCY, async (job) => {
  const startTime = Date.now();
  const {
    url,
    format = "mp4",
    quality = "auto",
    jobDbId,
    duration = null
  } = job.data;

  logger.info(`═══════════════════════════════════════════════`);
  logger.info(`🎬 [Worker] Job ${job.id} received`);
  logger.info(`   URL: ${url}`);
  logger.info(`   Format: ${format.toUpperCase()}`);
  logger.info(`   Quality: ${quality}${format === 'mp3' ? 'kbps' : 'p'}`);
  logger.info(`═══════════════════════════════════════════════`);

  let dbJob = null;

  try {
    // 1. ✅ VALIDATE: Check if this is a heavy download (reject instant downloads)
    const isHeavy = await isHeavyDownload(url, quality, format, duration);

    if (!isHeavy) {
      const errorMsg = `❌ [Worker] Rejected: This is an instant download (${quality}${format === 'mp3' ? 'kbps' : 'p'}). Use direct URL endpoint instead.`;
      logger.warn(errorMsg);

      // Update job status (skip if MongoDB unavailable)
      if (isMongoConnected && jobDbId) {
        try {
          dbJob = await Job.findById(jobDbId);
          if (dbJob) {
            await Job.findByIdAndUpdate(jobDbId, {
              status: "failed",
              error: "Instant download - use direct URL endpoint",
              message: "This download should use instant download (no worker needed)",
              failedAt: new Date()
            });
          }
        } catch (updateErr) {
          logger.warn(`⚠️ [Worker] Failed to update job status (MongoDB unavailable): ${updateErr.message}`);
        }
      } else {
        logger.warn(`⚠️ [Worker] MongoDB unavailable - skipping job status update`);
      }

      throw new Error(`Worker only processes heavy downloads (1080p+, high bitrate MP3, or long videos). This is an instant download.`);
    }

    logger.info(`✅ [Worker] Heavy download confirmed - processing...`);

    // Determine if merge is expected (might change during download)
    const expectMerge = needsMerge(quality, format);
    logger.info(`   Expected Merge: ${expectMerge ? '✅ YES (High Quality)' : '⚠️ MAYBE (if audio missing)'}`);

    // 2. Find and validate job record (optional - skip if MongoDB unavailable)
    if (isMongoConnected && jobDbId) {
      try {
        dbJob = await Job.findById(jobDbId);
        if (dbJob) {
          logger.info(`✅ [Worker] Job record found in DB`);
        } else {
          logger.warn(`⚠️ [Worker] Job record ${jobDbId} not found in MongoDB - continuing anyway`);
        }
      } catch (dbErr) {
        logger.warn(`⚠️ [Worker] Failed to find job record (MongoDB unavailable): ${dbErr.message}`);
        logger.warn(`   Download will continue without job tracking`);
      }
    } else {
      logger.warn(`⚠️ [Worker] MongoDB unavailable - continuing download without job tracking`);
    }

    // 4. Update initial status (only for heavy downloads)
    await updateJobAtomic(jobDbId, {
      status: "processing",
      progress: 5,
      message: expectMerge
        ? '🎭 Preparing heavy download (1080p+ merge required)...'
        : '📥 Starting heavy download...',
      startedAt: new Date()
    });

    job.progress(5);

    // 5. Progress tracking with throttling and detailed messages (heavy downloads only)
    let lastProgressUpdate = Date.now();
    let lastProgressValue = 5;
    let actuallyMerged = expectMerge; // Track if merge actually happened

    const progressCallback = async (percent, additionalData = {}) => {
      const now = Date.now();
      const roundedPercent = Math.min(95, Math.max(5, Math.floor(percent)));

      // Check if merge is happening (update flag)
      if (additionalData.status === 'merging' || additionalData.status === 'merge_complete') {
        actuallyMerged = true;
      }

      // Throttle updates (but allow important status changes)
      const isImportantUpdate =
        additionalData.status === 'video_complete' ||
        additionalData.status === 'audio_complete' ||
        additionalData.status === 'merge_complete' ||
        roundedPercent >= 95;

      if (
        isImportantUpdate ||
        now - lastProgressUpdate >= PROGRESS_THROTTLE ||
        Math.abs(roundedPercent - lastProgressValue) >= 3
      ) {
        lastProgressUpdate = now;
        lastProgressValue = roundedPercent;

        // Generate user-friendly message
        const message = getStatusMessage(
          additionalData.status || 'processing',
          roundedPercent,
          additionalData
        );

        // Non-blocking atomic update
        updateJobAtomic(jobDbId, {
          progress: roundedPercent,
          message
        }).catch(() => { });

        // Update Bull progress
        try {
          job.progress(roundedPercent);
        } catch (err) {
          // Ignore Bull progress errors (non-critical)
        }

        // Log with appropriate emoji
        const emoji = additionalData.status === 'merging' ? '🔧' :
          additionalData.status === 'downloading' ? '📥' :
            additionalData.status === 'converting' ? '🎵' : '📊';

        logger.info(`${emoji} [Job ${job.id}] ${roundedPercent}% - ${message}`);
      }
    };

    // 6. ⚠️ DEPRECATED: Server-side download (MP3 Juice mode should use direct URLs)
    // In MP3 Juice mode, this should NOT be called - use getDownloadUrl() instead
    logger.warn(`⚠️ [Worker] Using deprecated downloadToFile (MP3 Juice mode should use direct URLs)`);
    logger.info(`🚀 [Worker] Initiating heavy download with videoService...`);

    const result = await videoService.downloadAndConvert(
      url,
      format,
      quality,
      progressCallback
    );

    // 7. Validate download result
    if (!result || !result.downloadUrl) {
      throw new Error("Download failed - no URL returned from service");
    }

    const downloadTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const speed = result.sizeMB ? (result.sizeMB / downloadTime).toFixed(2) : 'N/A';

    logger.info(`✅ [Worker] Download successful!`);
    logger.info(`   📦 File: ${result.fileName}`);
    logger.info(`   📏 Size: ${result.sizeMB} MB`);
    logger.info(`   ⏱️ Time: ${downloadTime}s`);
    logger.info(`   🚀 Speed: ${speed} MB/s`);

    if (actuallyMerged) {
      logger.info(`   🎭 Merged: Video + Audio combined successfully!`);
    }

    // 8. Final update with all details (skip if MongoDB unavailable)
    if (isMongoConnected && jobDbId) {
      try {
        const finalUpdate = {
          status: "completed",
          progress: 100,
          resultUrl: result.downloadUrl,
          title: result.title || result.fileName || "Downloaded Video",
          fileName: result.fileName,
          fileSize: result.sizeMB,
          merged: actuallyMerged,
          message: actuallyMerged
            ? '✅ High-quality download complete with perfect audio!'
            : '✅ Download complete!',
          completedAt: new Date(),
          updatedAt: new Date(),
          processingTime: downloadTime
        };

        await Job.findByIdAndUpdate(jobDbId, finalUpdate, { new: false });
      } catch (updateErr) {
        logger.warn(`⚠️ [Worker] Failed to update final status (MongoDB unavailable): ${updateErr.message}`);
      }
    } else {
      logger.warn(`⚠️ [Worker] MongoDB unavailable - skipping final job status update`);
    }
    
    job.progress(100);

    logger.info(`🏁 [Worker] Job ${job.id} completed successfully in ${downloadTime}s`);

    return {
      success: true,
      downloadUrl: result.downloadUrl,
      fileName: result.fileName,
      fileSize: result.sizeMB,
      merged: actuallyMerged,
      quality,
      format,
      processingTime: downloadTime
    };

  } catch (error) {
    const errorTime = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.error(`═══════════════════════════════════════════════`);
    logger.error(`💥 [Worker] Job ${job.id} FAILED after ${errorTime}s`);
    logger.error(`   Error: ${error.message}`);
    if (error.stack) {
      logger.error(`   Stack: ${error.stack.substring(0, 300)}`);
    }
    logger.error(`═══════════════════════════════════════════════`);

    // Update job status with error details (skip if MongoDB unavailable)
    if (isMongoConnected && jobDbId) {
      try {
        const errorUpdate = {
          status: "failed",
          error: error.message || "Unknown error occurred",
          progress: 0,
          message: `❌ ${error.message || "Download failed"}`,
          failedAt: new Date(),
          updatedAt: new Date(),
          processingTime: errorTime
        };

        await Job.findByIdAndUpdate(jobDbId, errorUpdate, { new: false });
      } catch (updateErr) {
        logger.warn(`⚠️ [Worker] Failed to update error status (MongoDB unavailable): ${updateErr.message}`);
      }
    } else {
      logger.warn(`⚠️ [Worker] MongoDB unavailable - skipping error status update`);
    }

    // Re-throw for Bull to handle retry logic
    throw error;
  }
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📡 WORKER EVENT HANDLERS (Detailed Logging)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

videoQueue
  .on("waiting", (jobId) => {
    logger.info(`⏳ [Queue] Job ${jobId} waiting in queue...`);
  })

  .on("active", async (job) => {
    const quality = job.data?.quality || 'auto';
    const format = job.data?.format || 'mp4';
    const url = job.data?.url;
    const merge = needsMerge(quality, format);
    const mergeStatus = merge ? '🎭 MERGE' : '📥 DIRECT';

    // Validate it's a heavy download
    try {
      const isHeavy = await isHeavyDownload(url, quality, format, job.data?.duration);
      if (!isHeavy) {
        logger.warn(`⚠️ [Queue] Job ${job.id} is not heavy - should not be in queue!`);
      }
    } catch (err) {
      logger.warn(`⚠️ [Queue] Could not validate job ${job.id}: ${err.message}`);
    }

    logger.info(`⚙️ [Queue] Job ${job.id} active - ${quality}${format === 'mp3' ? 'kbps' : 'p'} [${mergeStatus}] [HEAVY]`);
  })

  .on("progress", (job, progress) => {
    // Only log milestone progress to reduce noise
    if ([10, 25, 50, 75, 90, 95].includes(progress)) {
      logger.info(`📊 [Queue] Job ${job.id} progress: ${progress}%`);
    }
  })

  .on("completed", (job, result) => {
    const mergedInfo = result?.merged ? ' 🎭 [MERGED]' : ' 📥 [DIRECT]';
    const fileSize = result?.fileSize ? ` (${result.fileSize} MB)` : '';
    const time = result?.processingTime ? ` in ${result.processingTime}s` : '';

    logger.info(`✅ [Queue] Job ${job.id} completed${mergedInfo}${fileSize}${time}`);
  })

  .on("failed", (job, err) => {
    const attempt = job.attemptsMade || 1;
    const maxAttempts = job.opts?.attempts || 3;

    if (err?.message?.includes("stalled")) {
      logger.warn(`❗ [Queue] Job ${job?.id} stalled - will retry (${attempt}/${maxAttempts})`);
    } else if (attempt < maxAttempts) {
      logger.error(`❌ [Queue] Job ${job?.id} failed (${attempt}/${maxAttempts}): ${err.message}`);
      logger.info(`🔄 [Queue] Retrying job ${job?.id}...`);
    } else {
      logger.error(`💥 [Queue] Job ${job?.id} FINAL FAILURE after ${maxAttempts} attempts: ${err.message}`);
    }
  })

  .on("error", (err) => {
    if (err.message && err.message.includes("ECONNREFUSED")) {
      return;
    }
    logger.error(`🚨 [Queue] Queue error: ${err.message}`);
  })

  .on("stalled", (job) => {
    logger.warn(`⏸️ [Queue] Job ${job?.id} stalled - restarting...`);
  })

  .on("removed", (job) => {
    logger.info(`🗑️ [Queue] Job ${job.id} removed from queue`);
  });

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🧹 GRACEFUL SHUTDOWN (Proper Cleanup)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    logger.warn('⚠️ [Worker] Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;

  try {
    logger.info(`═══════════════════════════════════════════════`);
    logger.info(`🧹 [Worker] ${signal} received - initiating graceful shutdown...`);
    logger.info(`═══════════════════════════════════════════════`);

    // 1. Pause new jobs
    logger.info('⏸️ [Worker] Pausing new jobs...');
    await videoQueue.pause(true, true);

    // 2. Wait for active jobs to complete (with timeout)
    const activeCount = await videoQueue.getActiveCount();
    if (activeCount > 0) {
      logger.info(`⏳ [Worker] Waiting for ${activeCount} active job(s) to complete...`);
    }

    // 3. Close queue gracefully
    logger.info('📦 [Worker] Closing queue...');
    await videoQueue.close(15000); // 15 second timeout
    logger.info('✅ [Worker] Queue closed successfully');

    // 4. Disconnect MongoDB (gracefully, ignore errors)
    if (isMongoConnected) {
      logger.info('🗄️ [Worker] Disconnecting MongoDB...');
      try {
        await mongoose.disconnect();
        isMongoConnected = false;
        logger.info('✅ [Worker] MongoDB disconnected');
      } catch (mongoErr) {
        logger.warn(`⚠️ [Worker] MongoDB disconnect error (ignored): ${mongoErr.message}`);
        isMongoConnected = false;
      }
    }

    logger.info(`═══════════════════════════════════════════════`);
    logger.info("✅ [Worker] Shutdown complete - goodbye!");
    logger.info(`═══════════════════════════════════════════════`);

    process.exit(0);

  } catch (err) {
    logger.error(`❌ [Worker] Shutdown error: ${err.message}`);
    process.exit(1);
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚠️ ERROR HANDLERS (Improved with Smart Recovery)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.error(`💥 [Worker] Uncaught Exception: ${err.message}`);
  if (err.stack) {
    logger.error(`   Stack: ${err.stack.substring(0, 500)}`);
  }

  // List of non-critical errors that shouldn't crash the worker
  const nonCriticalErrors = [
    "Can't save()",
    "parallel",
    "buffering timed out",
    "VersionError",
    "Document not found",
    "MongoDB",
    "MongoServerSelectionError",
    "MongoNetworkError",
    "MongoTimeoutError",
    "MongoError",
    "MongooseError",
    "connection",
    "disconnected",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "MONGODB_URI_MISSING"
  ];

  const isNonCritical = nonCriticalErrors.some(msg =>
    err.message?.includes(msg) || err.name?.includes(msg)
  );

  if (isNonCritical) {
    logger.warn(`⚠️ [Worker] Non-critical error caught (${err.message?.substring(0, 50)}...) - continuing operation...`);
    return;
  }

  // Only shutdown on truly critical errors (not MongoDB-related)
  logger.error("💥 [Worker] Critical error detected - shutting down...");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  const errorMsg = reason?.message || String(reason);
  logger.error(`💥 [Worker] Unhandled Promise Rejection: ${errorMsg}`);

  // Non-critical rejection patterns (including all MongoDB errors)
  const nonCriticalPatterns = [
    "Can't save()",
    "parallel",
    "buffering timed out",
    "ECONNRESET",
    "ETIMEDOUT",
    "socket hang up",
    "MongoDB",
    "MongoServerSelectionError",
    "MongoNetworkError",
    "MongoTimeoutError",
    "MongoError",
    "MongooseError",
    "connection",
    "disconnected",
    "ECONNREFUSED",
    "ENOTFOUND",
    "MONGODB_URI_MISSING",
    "MongooseServerSelectionError"
  ];

  const isNonCritical = nonCriticalPatterns.some(pattern =>
    errorMsg.includes(pattern) || reason?.name?.includes(pattern)
  );

  if (isNonCritical) {
    logger.warn(`⚠️ [Worker] Non-critical rejection caught (${errorMsg.substring(0, 50)}...) - continuing operation...`);
    return;
  }

  // Only shutdown on truly critical rejections (not MongoDB-related)
  logger.error("💥 [Worker] Critical rejection detected - shutting down...");
  gracefulShutdown("unhandledRejection");
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🚀 STARTUP SEQUENCE (MongoDB Optional - Downloads Continue Without DB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(async () => {
  try {
    await connectMongo();
    logger.info("✅ [Worker] Heavy download queue active");
  } catch (err) {
    // Don't exit - allow worker to continue without MongoDB
  }
})();

// Periodic health check (every 5 minutes)
setInterval(async () => {
  try {
    const waiting = await videoQueue.getWaitingCount();
    const active = await videoQueue.getActiveCount();
    const completed = await videoQueue.getCompletedCount();
    const failed = await videoQueue.getFailedCount();
    const delayed = await videoQueue.getDelayedCount();

    logger.info(`📊 [Health] Queue Status:`);
    logger.info(`   ⏳ Waiting: ${waiting}`);
    logger.info(`   ⚙️ Active: ${active}`);
    logger.info(`   ✅ Completed: ${completed}`);
    logger.info(`   ❌ Failed: ${failed}`);
    logger.info(`   ⏰ Delayed: ${delayed}`);
    logger.info(`   🗄️ MongoDB: ${isMongoConnected ? '✅ Connected' : '❌ Disconnected'}`);
    logger.info(`   💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  } catch (err) {
    logger.warn(`⚠️ [Health] Status check failed: ${err.message}`);
  }
}, 300000); // 5 minutes

export default videoQueue;