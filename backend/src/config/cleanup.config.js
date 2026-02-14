// ✅ PRODUCTION-READY: Enhanced Cleanup Configuration with Emergency & History
import dotenv from "dotenv";

dotenv.config();

/* ----------------------------------------------------------
   ⚙️ MAIN CLEANUP SETTINGS
---------------------------------------------------------- */
export const cleanupConfig = {
  // File Age Settings
  maxFileAgeMinutes: parseInt(process.env.MAX_FILE_AGE_MINUTES || 60),
  minFileAgeMinutes: parseInt(process.env.MIN_FILE_AGE_MINUTES || 30),
  
  // Scheduler Settings
  cleanupIntervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || 30),
  storageCheckIntervalMinutes: parseInt(process.env.STORAGE_CHECK_INTERVAL || 5),
  
  // Storage Limits
  maxStorageGB: parseFloat(process.env.MAX_STORAGE_GB || 10),
  minFreeSpaceGB: parseFloat(process.env.MIN_FREE_SPACE_GB || 2),
  
  // Thresholds (percentage)
  warningThreshold: parseFloat(process.env.WARNING_THRESHOLD || 70),
  criticalThreshold: parseFloat(process.env.CRITICAL_THRESHOLD || 85),
  emergencyThreshold: parseFloat(process.env.EMERGENCY_THRESHOLD || 95),
  
  // Safety Settings
  maxFilesPerCleanup: parseInt(process.env.MAX_FILES_PER_CLEANUP || 100),
  enableEmergencyCleanup: process.env.ENABLE_EMERGENCY_CLEANUP !== "false",
  enableAutoCleanup: process.env.ENABLE_AUTO_CLEANUP !== "false",
  
  // Retry Settings
  retryFailedDeletes: process.env.RETRY_FAILED_DELETES !== "false",
  maxRetries: parseInt(process.env.MAX_DELETE_RETRIES || 3),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || 5000),
  
  // Logging
  logLevel: process.env.LOG_LEVEL || "info",
  verboseLogging: process.env.VERBOSE_CLEANUP_LOGS === "true",
  
  // Database Sync
  checkDatabaseBeforeDelete: process.env.CHECK_DB_BEFORE_DELETE !== "false",
  updateDatabaseAfterDelete: process.env.UPDATE_DB_AFTER_DELETE !== "false",
  
  // File Filters
  excludeExtensions: (process.env.EXCLUDE_EXTENSIONS || "").split(",").filter(Boolean),
  includeExtensions: (process.env.INCLUDE_EXTENSIONS || ".mp4,.mp3,.webm").split(",").filter(Boolean),
  excludePatterns: (process.env.EXCLUDE_PATTERNS || "").split(",").filter(Boolean),
  
  // Performance
  batchSize: parseInt(process.env.CLEANUP_BATCH_SIZE || 10),
  delayBetweenBatches: parseInt(process.env.DELAY_BETWEEN_BATCHES || 1000),
  
  // Notifications
  enableEmailAlerts: process.env.ENABLE_EMAIL_ALERTS === "true",
  alertEmail: process.env.ALERT_EMAIL || "",
  enableSlackAlerts: process.env.ENABLE_SLACK_ALERTS === "true",
  slackWebhook: process.env.SLACK_WEBHOOK || "",

  // 🆕 EMERGENCY MODE SETTINGS
  emergency: {
    enabled: process.env.ENABLE_EMERGENCY_CLEANUP !== "false",
    autoTrigger: process.env.AUTO_EMERGENCY_CLEANUP !== "false",
    threshold: parseFloat(process.env.EMERGENCY_THRESHOLD || 95),
    targetPercent: parseFloat(process.env.EMERGENCY_TARGET_PERCENT || 50),
    minSpaceToFreeGB: parseFloat(process.env.MIN_SPACE_TO_FREE_GB || 5),
    forceDeleteAll: process.env.EMERGENCY_FORCE_DELETE === "true",
    skipDatabaseCheck: process.env.EMERGENCY_SKIP_DB_CHECK === "true",
    delayBeforeStart: parseInt(process.env.EMERGENCY_DELAY_MS || 5000), // 5 seconds delay
  },

  // 🆕 HISTORY TRACKING SETTINGS
  history: {
    enabled: process.env.ENABLE_CLEANUP_HISTORY !== "false",
    maxRecords: parseInt(process.env.MAX_HISTORY_RECORDS || 100),
    retentionDays: parseInt(process.env.HISTORY_RETENTION_DAYS || 30),
    autoCleanHistory: process.env.AUTO_CLEAN_HISTORY !== "false",
    saveDeletedFiles: process.env.SAVE_DELETED_FILES_LIST !== "false",
    maxDeletedFilesPerRecord: parseInt(process.env.MAX_DELETED_FILES_LIST || 50),
    trackErrors: process.env.TRACK_CLEANUP_ERRORS !== "false",
  },

  // 🆕 NOTIFICATION SETTINGS (Enhanced)
  notifications: {
    email: {
      enabled: process.env.ENABLE_EMAIL_ALERTS === "true",
      recipients: (process.env.ALERT_EMAIL || "").split(",").filter(Boolean),
      sender: process.env.EMAIL_SENDER || "noreply@yourdomain.com",
      triggers: {
        warning: process.env.EMAIL_ON_WARNING !== "false",
        critical: process.env.EMAIL_ON_CRITICAL !== "false",
        emergency: process.env.EMAIL_ON_EMERGENCY !== "false",
        cleanup_failed: process.env.EMAIL_ON_FAILURE !== "false",
      },
    },
    slack: {
      enabled: process.env.ENABLE_SLACK_ALERTS === "true",
      webhook: process.env.SLACK_WEBHOOK || "",
      channel: process.env.SLACK_CHANNEL || "#alerts",
      username: process.env.SLACK_USERNAME || "Storage Monitor",
      emoji: process.env.SLACK_EMOJI || ":warning:",
      triggers: {
        warning: process.env.SLACK_ON_WARNING !== "false",
        critical: process.env.SLACK_ON_CRITICAL !== "false",
        emergency: process.env.SLACK_ON_EMERGENCY !== "false",
        cleanup_success: process.env.SLACK_ON_SUCCESS === "true",
      },
    },
    console: {
      enabled: true, // Always enabled
      verbose: process.env.VERBOSE_CLEANUP_LOGS === "true",
      colors: process.env.DISABLE_COLORS !== "true",
    },
  },

  // 🆕 ADVANCED FEATURES
  advanced: {
    parallelDeletes: process.env.PARALLEL_DELETES === "true",
    maxParallelOperations: parseInt(process.env.MAX_PARALLEL_OPS || 5),
    compressionBeforeDelete: process.env.COMPRESS_BEFORE_DELETE === "true",
    moveToTrash: process.env.MOVE_TO_TRASH === "true",
    trashRetentionHours: parseInt(process.env.TRASH_RETENTION_HOURS || 24),
  },
};

/* ----------------------------------------------------------
   📊 STORAGE THRESHOLDS
---------------------------------------------------------- */
export const storageThresholds = {
  healthy: {
    max: cleanupConfig.warningThreshold,
    status: "healthy",
    emoji: "✅",
    color: "green",
    action: "none",
    message: "Storage is healthy",
  },
  elevated: {
    min: cleanupConfig.warningThreshold,
    max: cleanupConfig.criticalThreshold,
    status: "elevated",
    emoji: "🟡",
    color: "yellow",
    action: "monitor",
    message: "Storage usage is elevated - monitoring required",
  },
  warning: {
    min: cleanupConfig.criticalThreshold,
    max: cleanupConfig.emergencyThreshold,
    status: "warning",
    emoji: "⚠️",
    color: "orange",
    action: "increase_cleanup_frequency",
    message: "Storage warning - increase cleanup frequency",
  },
  critical: {
    min: cleanupConfig.emergencyThreshold,
    max: 100,
    status: "critical",
    emoji: "🔴",
    color: "red",
    action: "emergency_cleanup",
    message: "Storage critical - emergency cleanup required",
  },
};

/* ----------------------------------------------------------
   🎯 GET THRESHOLD STATUS
---------------------------------------------------------- */
export const getThresholdStatus = (percentUsed) => {
  if (percentUsed < cleanupConfig.warningThreshold) {
    return storageThresholds.healthy;
  } else if (percentUsed < cleanupConfig.criticalThreshold) {
    return storageThresholds.elevated;
  } else if (percentUsed < cleanupConfig.emergencyThreshold) {
    return storageThresholds.warning;
  } else {
    return storageThresholds.critical;
  }
};

/* ----------------------------------------------------------
   ⏰ CRON PATTERNS
---------------------------------------------------------- */
export const cronPatterns = {
  cleanup: `*/${cleanupConfig.cleanupIntervalMinutes} * * * *`,
  storage: `*/${cleanupConfig.storageCheckIntervalMinutes} * * * *`,
  historyCleanup: "0 0 * * *", // Daily at midnight
  
  // Predefined patterns
  everyMinute: "* * * * *",
  every5Minutes: "*/5 * * * *",
  every15Minutes: "*/15 * * * *",
  every30Minutes: "*/30 * * * *",
  everyHour: "0 * * * *",
  every6Hours: "0 */6 * * *",
  daily: "0 0 * * *",
  dailyAt2AM: "0 2 * * *",
  weekly: "0 0 * * 0",
  monthly: "0 0 1 * *",
};

/* ----------------------------------------------------------
   📧 ALERT CONFIGURATION
---------------------------------------------------------- */
export const alertConfig = {
  email: {
    enabled: cleanupConfig.enableEmailAlerts,
    to: cleanupConfig.alertEmail,
    from: cleanupConfig.notifications.email.sender,
    subject: "YouTube Downloader - Storage Alert",
    triggers: {
      warning: true,
      critical: true,
      emergency: true,
      cleanup_failed: true,
      cleanup_success: false,
    },
    templates: {
      warning: "Storage usage is at {percent}%. Consider cleanup.",
      critical: "CRITICAL: Storage at {percent}%. Immediate action required.",
      emergency: "EMERGENCY: Storage at {percent}%. Emergency cleanup triggered.",
      cleanup_failed: "Cleanup failed: {error}",
    },
  },
  slack: {
    enabled: cleanupConfig.enableSlackAlerts,
    webhook: cleanupConfig.slackWebhook,
    channel: process.env.SLACK_CHANNEL || "#alerts",
    username: "Storage Monitor",
    emoji: ":warning:",
    triggers: {
      warning: true,
      critical: true,
      emergency: true,
      cleanup_failed: true,
      cleanup_success: false,
    },
  },
};

/* ----------------------------------------------------------
   🔍 VALIDATION
---------------------------------------------------------- */
export const validateConfig = () => {
  const errors = [];
  const warnings = [];

  // Validate file age
  if (cleanupConfig.maxFileAgeMinutes < cleanupConfig.minFileAgeMinutes) {
    errors.push("maxFileAgeMinutes must be greater than minFileAgeMinutes");
  }

  if (cleanupConfig.minFileAgeMinutes < 15) {
    warnings.push("minFileAgeMinutes is very low (< 15 min), files might be deleted while still in use");
  }

  // Validate storage limits
  if (cleanupConfig.maxStorageGB < 1) {
    errors.push("maxStorageGB must be at least 1 GB");
  }

  if (cleanupConfig.minFreeSpaceGB > cleanupConfig.maxStorageGB) {
    errors.push("minFreeSpaceGB cannot be greater than maxStorageGB");
  }

  // Validate thresholds
  if (cleanupConfig.warningThreshold >= cleanupConfig.criticalThreshold) {
    errors.push("warningThreshold must be less than criticalThreshold");
  }

  if (cleanupConfig.criticalThreshold >= cleanupConfig.emergencyThreshold) {
    errors.push("criticalThreshold must be less than emergencyThreshold");
  }

  if (cleanupConfig.emergencyThreshold > 100 || cleanupConfig.emergencyThreshold < 0) {
    errors.push("emergencyThreshold must be between 0 and 100");
  }

  // Validate intervals
  if (cleanupConfig.cleanupIntervalMinutes < 5) {
    warnings.push("cleanupIntervalMinutes is very low (< 5 min), might cause high CPU usage");
  }

  if (cleanupConfig.storageCheckIntervalMinutes < 1) {
    errors.push("storageCheckIntervalMinutes must be at least 1 minute");
  }

  // Validate retry settings
  if (cleanupConfig.maxRetries < 1) {
    errors.push("maxRetries must be at least 1");
  }

  if (cleanupConfig.retryDelayMs < 1000) {
    warnings.push("retryDelayMs is very low (< 1000ms), might cause issues");
  }

  // Validate emergency settings
  if (cleanupConfig.emergency.targetPercent > cleanupConfig.emergency.threshold) {
    warnings.push("emergency.targetPercent should be less than emergency.threshold");
  }

  // Validate history settings
  if (cleanupConfig.history.maxRecords < 10) {
    warnings.push("history.maxRecords is very low (< 10), might lose important data");
  }

  if (cleanupConfig.history.retentionDays < 7) {
    warnings.push("history.retentionDays is low (< 7), consider increasing for better tracking");
  }

  // Validate notification settings
  if (cleanupConfig.enableEmailAlerts && !cleanupConfig.alertEmail) {
    errors.push("Email alerts enabled but no email address configured");
  }

  if (cleanupConfig.enableSlackAlerts && !cleanupConfig.slackWebhook) {
    errors.push("Slack alerts enabled but no webhook configured");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

/* ----------------------------------------------------------
   📊 GET CONFIG SUMMARY
---------------------------------------------------------- */
export const getConfigSummary = () => {
  return {
    fileAge: {
      min: `${cleanupConfig.minFileAgeMinutes} minutes`,
      max: `${cleanupConfig.maxFileAgeMinutes} minutes`,
    },
    schedules: {
      cleanup: `Every ${cleanupConfig.cleanupIntervalMinutes} minutes`,
      storage: `Every ${cleanupConfig.storageCheckIntervalMinutes} minutes`,
      historyCleanup: "Daily at midnight",
    },
    storage: {
      limit: `${cleanupConfig.maxStorageGB} GB`,
      minFree: `${cleanupConfig.minFreeSpaceGB} GB`,
      thresholds: {
        warning: `${cleanupConfig.warningThreshold}%`,
        critical: `${cleanupConfig.criticalThreshold}%`,
        emergency: `${cleanupConfig.emergencyThreshold}%`,
      },
    },
    emergency: {
      enabled: cleanupConfig.emergency.enabled,
      autoTrigger: cleanupConfig.emergency.autoTrigger,
      targetPercent: `${cleanupConfig.emergency.targetPercent}%`,
      minSpaceToFree: `${cleanupConfig.emergency.minSpaceToFreeGB} GB`,
    },
    history: {
      enabled: cleanupConfig.history.enabled,
      maxRecords: cleanupConfig.history.maxRecords,
      retentionDays: `${cleanupConfig.history.retentionDays} days`,
      autoClean: cleanupConfig.history.autoCleanHistory,
    },
    safety: {
      maxFilesPerCleanup: cleanupConfig.maxFilesPerCleanup,
      checkDatabase: cleanupConfig.checkDatabaseBeforeDelete,
      retryFailed: cleanupConfig.retryFailedDeletes,
      maxRetries: cleanupConfig.maxRetries,
    },
    features: {
      autoCleanup: cleanupConfig.enableAutoCleanup,
      emergencyCleanup: cleanupConfig.enableEmergencyCleanup,
      emailAlerts: cleanupConfig.enableEmailAlerts,
      slackAlerts: cleanupConfig.enableSlackAlerts,
      historyTracking: cleanupConfig.history.enabled,
    },
    notifications: {
      email: {
        enabled: cleanupConfig.notifications.email.enabled,
        recipients: cleanupConfig.notifications.email.recipients.length,
      },
      slack: {
        enabled: cleanupConfig.notifications.slack.enabled,
        channel: cleanupConfig.notifications.slack.channel,
      },
      console: {
        enabled: true,
        verbose: cleanupConfig.notifications.console.verbose,
      },
    },
  };
};

/* ----------------------------------------------------------
   🔄 ENHANCED ENVIRONMENT TEMPLATE
---------------------------------------------------------- */
export const envTemplate = `
# ============================================
# CLEANUP CONFIGURATION
# ============================================

# File Age Settings
MAX_FILE_AGE_MINUTES=60
MIN_FILE_AGE_MINUTES=30

# Scheduler Settings
CLEANUP_INTERVAL_MINUTES=30
STORAGE_CHECK_INTERVAL=5

# Storage Limits
MAX_STORAGE_GB=10
MIN_FREE_SPACE_GB=2

# Thresholds (percentage)
WARNING_THRESHOLD=70
CRITICAL_THRESHOLD=85
EMERGENCY_THRESHOLD=95

# Safety Settings
MAX_FILES_PER_CLEANUP=100
ENABLE_EMERGENCY_CLEANUP=true
ENABLE_AUTO_CLEANUP=true

# Database Sync
CHECK_DB_BEFORE_DELETE=true
UPDATE_DB_AFTER_DELETE=true

# File Filters
INCLUDE_EXTENSIONS=.mp4,.mp3,.webm
EXCLUDE_EXTENSIONS=
EXCLUDE_PATTERNS=

# Performance
CLEANUP_BATCH_SIZE=10
DELAY_BETWEEN_BATCHES=1000

# Retry Settings
RETRY_FAILED_DELETES=true
MAX_DELETE_RETRIES=3
RETRY_DELAY_MS=5000

# Logging
LOG_LEVEL=info
VERBOSE_CLEANUP_LOGS=false

# ============================================
# EMERGENCY MODE (NEW)
# ============================================
AUTO_EMERGENCY_CLEANUP=true
EMERGENCY_TARGET_PERCENT=50
MIN_SPACE_TO_FREE_GB=5
EMERGENCY_FORCE_DELETE=false
EMERGENCY_SKIP_DB_CHECK=false
EMERGENCY_DELAY_MS=5000

# ============================================
# HISTORY TRACKING (NEW)
# ============================================
ENABLE_CLEANUP_HISTORY=true
MAX_HISTORY_RECORDS=100
HISTORY_RETENTION_DAYS=30
AUTO_CLEAN_HISTORY=true
SAVE_DELETED_FILES_LIST=true
MAX_DELETED_FILES_LIST=50
TRACK_CLEANUP_ERRORS=true

# ============================================
# NOTIFICATIONS
# ============================================

# Email Alerts
ENABLE_EMAIL_ALERTS=false
ALERT_EMAIL=admin@yourdomain.com
EMAIL_SENDER=noreply@yourdomain.com
EMAIL_ON_WARNING=true
EMAIL_ON_CRITICAL=true
EMAIL_ON_EMERGENCY=true
EMAIL_ON_FAILURE=true

# Slack Alerts
ENABLE_SLACK_ALERTS=false
SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#alerts
SLACK_USERNAME=Storage Monitor
SLACK_EMOJI=:warning:
SLACK_ON_WARNING=true
SLACK_ON_CRITICAL=true
SLACK_ON_EMERGENCY=true
SLACK_ON_SUCCESS=false

# ============================================
# ADVANCED FEATURES (OPTIONAL)
# ============================================
PARALLEL_DELETES=false
MAX_PARALLEL_OPS=5
COMPRESS_BEFORE_DELETE=false
MOVE_TO_TRASH=false
TRASH_RETENTION_HOURS=24
`;

/* ----------------------------------------------------------
   🧪 CONFIGURATION TESTS
---------------------------------------------------------- */
export const testConfiguration = () => {
  const validation = validateConfig();
  
  console.log("\n🔍 Configuration Validation:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  if (validation.valid) {
    console.log("✅ Configuration is valid");
  } else {
    console.log("❌ Configuration has errors:");
    validation.errors.forEach((error, i) => {
      console.log(`   ${i + 1}. ${error}`);
    });
  }
  
  if (validation.warnings.length > 0) {
    console.log("\n⚠️ Warnings:");
    validation.warnings.forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning}`);
    });
  }
  
  console.log("\n📊 Configuration Summary:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const summary = getConfigSummary();
  console.log(JSON.stringify(summary, null, 2));
  
  return validation;
};

/* ----------------------------------------------------------
   📤 EXPORTS
---------------------------------------------------------- */
export default {
  cleanupConfig,
  storageThresholds,
  getThresholdStatus,
  cronPatterns,
  alertConfig,
  validateConfig,
  getConfigSummary,
  envTemplate,
  testConfiguration,
};