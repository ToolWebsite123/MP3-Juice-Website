// ✅ PRODUCTION-READY: Scheduler System
import cron from "node-cron";
import logger from "../utils/logger.js";
import { 
  cleanupOldFiles, 
  checkStorageUsage, 
  emergencyCleanup 
} from "../services/cleanupService.js";

const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || 30);
const STORAGE_CHECK_INTERVAL = parseInt(process.env.STORAGE_CHECK_INTERVAL || 5);

let schedulers = {
  cleanup: null,
  storage: null,
};

let isRunning = false;

/* ----------------------------------------------------------
   ⏰ START CLEANUP SCHEDULER
---------------------------------------------------------- */
export const startCleanupScheduler = () => {
  try {
    if (schedulers.cleanup) {
      logger.warn(`⚠️ [Scheduler] Cleanup scheduler already running`);
      return false;
    }

    // Cron pattern: every X minutes
    const cronPattern = `*/${CLEANUP_INTERVAL} * * * *`;
    
    logger.info(`⏰ [Scheduler] Starting cleanup scheduler...`);
    logger.info(`   ├─ Interval: Every ${CLEANUP_INTERVAL} minutes`);
    logger.info(`   ├─ Pattern: ${cronPattern}`);
    logger.info(`   └─ Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

    schedulers.cleanup = cron.schedule(
      cronPattern,
      async () => {
        if (isRunning) {
          logger.warn(`⏸️ [Scheduler] Cleanup already in progress, skipping...`);
          return;
        }

        isRunning = true;
        
        try {
          const isProduction = process.env.NODE_ENV === 'production';
          const verboseLogging = process.env.VERBOSE_CLEANUP_LOGS === 'true';
          
          // ✅ Reduced logging in production
          if (!isProduction || verboseLogging) {
            logger.info(`⏰ [Scheduler] Scheduled cleanup triggered`);
          }
          
          const result = await cleanupOldFiles();
          
          // ✅ Only log if cleanup did something or failed
          if (result.success) {
            if (!result.skipped && (result.deletedCount > 0 || !isProduction || verboseLogging)) {
              logger.info(`✅ [Scheduler] Cleanup completed: ${result.deletedCount || 0} files deleted`);
            } else if (!isProduction || verboseLogging) {
              logger.debug(`✅ [Scheduler] Cleanup skipped - no files to process`);
            }
          } else {
            logger.error(`❌ [Scheduler] Cleanup failed: ${result.error}`);
          }

        } catch (err) {
          logger.error(`❌ [Scheduler] Cleanup error: ${err.message}`);
        } finally {
          isRunning = false;
        }
      },
      {
        scheduled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    );

    logger.info(`✅ [Scheduler] Cleanup scheduler started successfully`);
    
    // Run initial cleanup after 10 seconds
    setTimeout(async () => {
      logger.info(`🧹 [Scheduler] Running initial cleanup...`);
      await cleanupOldFiles();
    }, 10000);

    return true;

  } catch (err) {
    logger.error(`❌ [Scheduler] Failed to start cleanup scheduler: ${err.message}`);
    return false;
  }
};

/* ----------------------------------------------------------
   💾 START STORAGE MONITOR
---------------------------------------------------------- */
export const startStorageMonitor = () => {
  try {
    if (schedulers.storage) {
      logger.warn(`⚠️ [Scheduler] Storage monitor already running`);
      return false;
    }

    // Check storage every X minutes
    const cronPattern = `*/${STORAGE_CHECK_INTERVAL} * * * *`;
    
    logger.info(`💾 [Scheduler] Starting storage monitor...`);
    logger.info(`   ├─ Interval: Every ${STORAGE_CHECK_INTERVAL} minutes`);
    logger.info(`   └─ Pattern: ${cronPattern}`);

    schedulers.storage = cron.schedule(
      cronPattern,
      async () => {
        try {
          const storage = await checkStorageUsage();
          
          // Trigger emergency cleanup if needed
          if (storage.percentUsed >= 90) {
            logger.warn(`🚨 [Monitor] Storage critical: ${storage.percentUsed}%`);
            logger.warn(`🚨 [Monitor] Triggering emergency cleanup...`);
            
            await emergencyCleanup();
          } else if (storage.percentUsed >= 85) {
            logger.warn(`⚠️ [Monitor] Storage warning: ${storage.percentUsed}%`);
          }

        } catch (err) {
          logger.error(`❌ [Monitor] Storage check error: ${err.message}`);
        }
      },
      {
        scheduled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    );

    logger.info(`✅ [Scheduler] Storage monitor started successfully`);
    
    // Run initial storage check immediately
    setTimeout(async () => {
      logger.info(`💾 [Monitor] Running initial storage check...`);
      await checkStorageUsage();
    }, 5000);

    return true;

  } catch (err) {
    logger.error(`❌ [Scheduler] Failed to start storage monitor: ${err.message}`);
    return false;
  }
};

/* ----------------------------------------------------------
   🚀 START ALL SCHEDULERS
---------------------------------------------------------- */
export const startAllSchedulers = () => {
  try {
    logger.info(`🚀 [Scheduler] Initializing all schedulers...`);
    
    const cleanupStarted = startCleanupScheduler();
    const storageStarted = startStorageMonitor();

    if (cleanupStarted && storageStarted) {
      logger.info(`✅ [Scheduler] All schedulers started successfully`);
      logger.info(`📋 [Scheduler] Active schedulers:`);
      logger.info(`   ├─ Cleanup: Every ${CLEANUP_INTERVAL} min`);
      logger.info(`   └─ Storage Monitor: Every ${STORAGE_CHECK_INTERVAL} min`);
      return true;
    } else {
      logger.error(`❌ [Scheduler] Some schedulers failed to start`);
      return false;
    }

  } catch (err) {
    logger.error(`❌ [Scheduler] Failed to start schedulers: ${err.message}`);
    return false;
  }
};

/* ----------------------------------------------------------
   ⏸️ STOP ALL SCHEDULERS
---------------------------------------------------------- */
export const stopAllSchedulers = () => {
  try {
    logger.info(`⏸️ [Scheduler] Stopping all schedulers...`);
    
    let stopped = 0;

    if (schedulers.cleanup) {
      schedulers.cleanup.stop();
      schedulers.cleanup = null;
      stopped++;
      logger.info(`✅ [Scheduler] Cleanup scheduler stopped`);
    }

    if (schedulers.storage) {
      schedulers.storage.stop();
      schedulers.storage = null;
      stopped++;
      logger.info(`✅ [Scheduler] Storage monitor stopped`);
    }

    logger.info(`✅ [Scheduler] Stopped ${stopped} scheduler(s)`);
    return true;

  } catch (err) {
    logger.error(`❌ [Scheduler] Error stopping schedulers: ${err.message}`);
    return false;
  }
};

/* ----------------------------------------------------------
   📊 GET SCHEDULER STATUS
---------------------------------------------------------- */
export const getSchedulerStatus = () => {
  return {
    cleanup: {
      running: schedulers.cleanup !== null,
      interval: CLEANUP_INTERVAL,
      nextRun: schedulers.cleanup ? "Based on cron schedule" : "Not scheduled",
    },
    storage: {
      running: schedulers.storage !== null,
      interval: STORAGE_CHECK_INTERVAL,
      nextRun: schedulers.storage ? "Based on cron schedule" : "Not scheduled",
    },
    isProcessing: isRunning,
  };
};

/* ----------------------------------------------------------
   🔄 RESTART SCHEDULERS
---------------------------------------------------------- */
export const restartSchedulers = () => {
  try {
    logger.info(`🔄 [Scheduler] Restarting schedulers...`);
    
    stopAllSchedulers();
    
    // Wait 2 seconds before restarting
    setTimeout(() => {
      startAllSchedulers();
      logger.info(`✅ [Scheduler] Schedulers restarted successfully`);
    }, 2000);

    return true;

  } catch (err) {
    logger.error(`❌ [Scheduler] Error restarting schedulers: ${err.message}`);
    return false;
  }
};

/* ----------------------------------------------------------
   📤 EXPORTS
---------------------------------------------------------- */
export default {
  startCleanupScheduler,
  startStorageMonitor,
  startAllSchedulers,
  stopAllSchedulers,
  getSchedulerStatus,
  restartSchedulers,
};