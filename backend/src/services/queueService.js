

import Queue from "bull";
import dotenv from "dotenv";
import logger from "../utils/logger.js";
import Job from "../models/Job.js";
import { isHeavyDownload } from "../workers/videoWorker.js";
import { getRedisConfig } from "../config/redis.js";

dotenv.config();

/* ----------------------------------------------------------
   🧠 Queue Initialization (Optimized for Heavy Downloads)
---------------------------------------------------------- */

// Priority levels for job prioritization
export const JOB_PRIORITY = {
  LOW: 1,        // Normal heavy downloads
  NORMAL: 5,     // Standard heavy downloads (default)
  HIGH: 10,      // Important heavy downloads
  VIP: 20,       // VIP/urgent heavy downloads
};

// Retry configuration
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_BASE = 5000; // 5 seconds base delay
const RETRY_DELAY_MAX = 60000; // 60 seconds max delay

// ✅ Use shared Redis config to avoid password warnings
const redisConfig = getRedisConfig();

// Extract only the needed Redis config properties (avoid password warning)
const queueRedisConfig = {
  host: redisConfig.host,
  port: redisConfig.port,
  // Only include password if it exists
  ...(redisConfig.password && { password: redisConfig.password }),
  // Bull-specific settings
  connectTimeout: 10000,
  enableOfflineQueue: true,
  maxRetriesPerRequest: null, // Required for Bull
  retryStrategy: redisConfig.retryStrategy || ((times) => {
    if (times > 5) {
      logger.warn('⚠️ [Queue] Redis max retry attempts reached');
      return false;
    }
    const delay = Math.min(times * 1000, 10000);
    logger.debug(`🔁 [Queue] Redis reconnecting in ${delay}ms... (attempt ${times}/5)`);
    return delay;
  }),
};

const videoQueue = new Queue("video-processing", {
  redis: queueRedisConfig,
  settings: {
    maxStalledCount: 2,
    stalledInterval: 30000,
    lockDuration: 600000, // 10 minutes for large files
    lockRenewTime: 30000, // Renew every 30 seconds
  },
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600, // Keep completed for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 7200, // Keep failed for 2 hours
      count: 50,
    },
    attempts: MAX_RETRY_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: RETRY_DELAY_BASE,
    },
    timeout: 900000, // 15 minutes max per job
  },
});

/* ----------------------------------------------------------
let hasLoggedQueueConnError = false;

videoQueue
  .on("error", (err) => {
    // ✅ Filter out password warning
    if (err.message && err.message.includes("password was supplied")) {
      return;
    }
    
    // ✅ Filter out connection refused errors (log once only)
    if (err.message && err.message.includes("ECONNREFUSED")) {
      if (!hasLoggedQueueConnError) {
        logger.warn(`⚠️ [Queue] Redis not available - background queue in standby mode`);
        hasLoggedQueueConnError = true;
      }
      return;
    }
    
    logger.error(`❌ [Queue] Redis error: ${err.message}`);
  })
  .on("stalled", (job) => {
    const priority = job?.opts?.priority || JOB_PRIORITY.NORMAL;
    const priorityLabel = priority >= JOB_PRIORITY.VIP ? 'VIP' :
      priority >= JOB_PRIORITY.HIGH ? 'HIGH' : 'NORMAL';
    logger.warn(`⚠️ [Queue] Job ${job?.id} stalled (Priority: ${priorityLabel}) — retrying...`);
  })
  .on("waiting", (jobId) => {
    logger.info(`🕓 [Queue] Job ${jobId} waiting in queue...`);
  })
  .on("active", (job) => {
    const priority = job?.opts?.priority || JOB_PRIORITY.NORMAL;
    const priorityLabel = priority >= JOB_PRIORITY.VIP ? 'VIP' :
      priority >= JOB_PRIORITY.HIGH ? 'HIGH' : 'NORMAL';
    logger.info(`⚙️ [Queue] Job ${job?.id} active (Priority: ${priorityLabel})`);
  })
  .on("progress", (job, progress) => {
    // Only log milestone progress to reduce noise
    if ([10, 25, 50, 75, 90, 95, 100].includes(progress)) {
      logger.info(`📈 [Queue] Job ${job?.id} progress: ${progress}%`);
    }
  })
  .on("completed", (job) => {
    const priority = job?.opts?.priority || JOB_PRIORITY.NORMAL;
    const priorityLabel = priority >= JOB_PRIORITY.VIP ? 'VIP' :
      priority >= JOB_PRIORITY.HIGH ? 'HIGH' : 'NORMAL';
    logger.info(`🎉 [Queue] Job ${job?.id} completed (Priority: ${priorityLabel})`);
  })
  .on("failed", (job, err) => {
    const attempt = job?.attemptsMade || 1;
    const maxAttempts = job?.opts?.attempts || MAX_RETRY_ATTEMPTS;
    const priority = job?.opts?.priority || JOB_PRIORITY.NORMAL;
    const priorityLabel = priority >= JOB_PRIORITY.VIP ? 'VIP' :
      priority >= JOB_PRIORITY.HIGH ? 'HIGH' : 'NORMAL';

    if (attempt < maxAttempts) {
      logger.error(`❌ [Queue] Job ${job?.id} failed (${attempt}/${maxAttempts}) (Priority: ${priorityLabel}): ${err.message}`);
      logger.info(`🔄 [Queue] Retrying job ${job?.id} with exponential backoff...`);
    } else {
      logger.error(`💥 [Queue] Job ${job?.id} FINAL FAILURE after ${maxAttempts} attempts (Priority: ${priorityLabel}): ${err.message}`);
    }
  });

/* ----------------------------------------------------------
   ➕ Job Add Function (VIP/Heavy Downloads Only)
---------------------------------------------------------- */

/**
 * Calculate job priority based on quality and format
 */
const calculatePriority = (quality, format, isVIP = false) => {
  if (isVIP) return JOB_PRIORITY.VIP;

  if (format === 'mp4') {
    const qualityNum = parseInt(String(quality).replace(/[^0-9]/g, ''));
    if (qualityNum >= 1080) return JOB_PRIORITY.NORMAL; // Full HD
  }

  if (format === 'mp3') {
    const bitrateNum = parseInt(String(quality).replace(/[^0-9]/g, ''));
    if (bitrateNum >= 320) return JOB_PRIORITY.HIGH; // High bitrate
    if (bitrateNum >= 256) return JOB_PRIORITY.NORMAL; // Standard high bitrate
  }

  return JOB_PRIORITY.NORMAL;
};

/**
 * Add video job to queue (only for heavy downloads)
 * @param {Object} jobData - Job data { url, format, quality, jobDbId, duration, isVIP }
 * @returns {Promise<Object>} - Added job or throws error for instant downloads
 */
export const addVideoJob = async (jobData) => {
  const { url, format = "mp4", quality = "auto", jobDbId, duration = null, isVIP = false } = jobData;

  try {
    // ✅ VALIDATION: Check if this is a heavy download
    logger.info(`🔍 [Queue] Validating job for queue...`);
    logger.info(`   URL: ${url}`);
    logger.info(`   Format: ${format.toUpperCase()}`);
    logger.info(`   Quality: ${quality}${format === 'mp3' ? 'kbps' : 'p'}`);

    const isHeavy = await isHeavyDownload(url, quality, format, duration);

    if (!isHeavy) {
      const errorMsg = `❌ [Queue] Rejected: This is an instant download (${quality}${format === 'mp3' ? 'kbps' : 'p'}). Use direct URL endpoint instead of queue.`;
      logger.warn(errorMsg);

      // Update job status in DB if jobDbId provided
      if (jobDbId) {
        try {
          await Job.findByIdAndUpdate(jobDbId, {
            status: "failed",
            error: "Instant download - queue not needed",
            message: "This download should use instant download (direct URL). Queue is only for heavy downloads.",
            failedAt: new Date()
          });
        } catch (updateErr) {
          logger.warn(`⚠️ [Queue] Failed to update job status: ${updateErr.message}`);
        }
      }

      throw new Error(`Queue only accepts heavy downloads (1080p+, high bitrate MP3, or long videos). This is an instant download - use direct URL endpoint.`);
    }

    logger.info(`✅ [Queue] Heavy download confirmed - adding to queue...`);

    // Calculate priority
    const priority = calculatePriority(quality, format, isVIP);
    logger.info(`📊 [Queue] Job priority: ${priority} (${isVIP ? 'VIP' : 'Standard'})`);

    // Add job with priority and retry configuration
    const job = await videoQueue.add(
      {
        ...jobData,
        isVIP,
        priority,
        addedAt: new Date().toISOString()
      },
      {
        priority, // Higher priority = processed first
        attempts: MAX_RETRY_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: RETRY_DELAY_BASE,
        },
        removeOnComplete: {
          age: 3600, // 1 hour
          count: 100,
        },
        removeOnFail: {
          age: 7200, // 2 hours
          count: 50,
        },
      }
    );

    logger.info(`🎬 [Queue] Job added successfully → ${job.id} (Priority: ${priority})`);

    return {
      id: job.id,
      priority,
      isVIP,
      isHeavy: true,
      estimatedWaitTime: "1-3 minutes"
    };

  } catch (error) {
    // If it's our validation error, re-throw it
    if (error.message.includes("Queue only accepts")) {
      throw error;
    }

    // For other errors, log and throw
    logger.error(`💥 [Queue] Failed to add job: ${error.message}`);
    throw new Error(`Queue job add failed: ${error.message}`);
  }
};

/* ----------------------------------------------------------
   📊 Job Status Function (Enhanced)
---------------------------------------------------------- */
export const getJobStatus = async (jobId) => {
  try {
    const job = await videoQueue.getJob(jobId);
    if (!job) {
      logger.warn(`⚠️ [Queue] Job ${jobId} not found in queue`);
      return null;
    }

    const state = await job.getState();
    const dbJob = await Job.findById(job.data.jobDbId).lean();
    if (!dbJob) {
      logger.warn(`⚠️ [Queue] Job ${jobId} not found in database`);
      return null;
    }

    // Get priority info
    const priority = job.opts?.priority || JOB_PRIORITY.NORMAL;
    const priorityLabel = priority >= JOB_PRIORITY.VIP ? 'VIP' :
      priority >= JOB_PRIORITY.HIGH ? 'HIGH' : 'NORMAL';
    const isVIP = job.data?.isVIP || false;

    // ✅ Full result URL (local server URL)
    const fullResultUrl = dbJob.resultUrl
      ? dbJob.resultUrl.startsWith("http")
        ? dbJob.resultUrl
        : `${process.env.SERVER_URL || "http://localhost:5000"}${dbJob.resultUrl}`
      : null;

    return {
      id: job.id,
      state,
      progress: dbJob.progress || 0,
      status: dbJob.status || state,
      resultUrl: fullResultUrl,
      error: dbJob.error || null,
      priority: priorityLabel,
      isVIP,
      isHeavy: true,
      attemptsMade: job.attemptsMade || 0,
      maxAttempts: job.opts?.attempts || MAX_RETRY_ATTEMPTS,
    };
  } catch (error) {
    logger.error(`❌ [Queue] getJobStatus error: ${error.message}`);
    return {
      status: "error",
      message: "Failed to get job status",
      error: error.message,
    };
  }
};

/* ----------------------------------------------------------
   ❌ Cancel Job Function (Enhanced)
---------------------------------------------------------- */
export const cancelVideoJob = async (jobId) => {
  try {
    const job = await videoQueue.getJob(jobId);
    if (!job) {
      logger.warn(`⚠️ [Queue] Job ${jobId} not found for cancel`);
      return false;
    }

    const priority = job.opts?.priority || JOB_PRIORITY.NORMAL;
    const priorityLabel = priority >= JOB_PRIORITY.VIP ? 'VIP' :
      priority >= JOB_PRIORITY.HIGH ? 'HIGH' : 'NORMAL';

    await job.remove();

    if (job.data?.jobDbId) {
      await Job.findByIdAndUpdate(job.data.jobDbId, {
        status: "cancelled",
        progress: 0,
        message: "Job cancelled by user",
        cancelledAt: new Date()
      });
    }

    logger.warn(`🛑 [Queue] Job ${job.id} cancelled successfully (Priority: ${priorityLabel})`);
    return true;
  } catch (error) {
    logger.error(`❌ [Queue] cancelVideoJob failed: ${error.message}`);
    return false;
  }
};

/* ----------------------------------------------------------
   📊 Queue Statistics Function
---------------------------------------------------------- */
export const getQueueStats = async () => {
  try {
    const waiting = await videoQueue.getWaitingCount();
    const active = await videoQueue.getActiveCount();
    const completed = await videoQueue.getCompletedCount();
    const failed = await videoQueue.getFailedCount();
    const delayed = await videoQueue.getDelayedCount();

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
      isHealthy: true
    };
  } catch (error) {
    logger.error(`❌ [Queue] getQueueStats error: ${error.message}`);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
      isHealthy: false,
      error: error.message
    };
  }
};

/* ----------------------------------------------------------
   🔁 Export Queue Instance & Utilities
---------------------------------------------------------- */
export default videoQueue;