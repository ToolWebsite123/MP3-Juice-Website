// ✅ DAY 3 FIXED: Cleanup History Model (Mongoose Warning Resolved)
import mongoose from "mongoose";

const cleanupHistorySchema = new mongoose.Schema(
  {
    // Cleanup Type
    type: {
      type: String,
      enum: ["automatic", "manual", "emergency", "scheduled"],
      required: true,
      index: true,
    },

    // Trigger Information
    triggeredBy: {
      type: String,
      enum: ["system", "admin", "threshold", "api", "cron"],
      default: "system",
    },

    triggeredByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Cleanup Results
    filesChecked: {
      type: Number,
      default: 0,
    },

    filesDeleted: {
      type: Number,
      default: 0,
    },

    filesSkipped: {
      type: Number,
      default: 0,
    },

    filesFailed: {
      type: Number,
      default: 0,
    },

    // Space Information
    spaceFreedBytes: {
      type: Number,
      default: 0,
    },

    spaceFreedMB: {
      type: Number,
      default: 0,
    },

    spaceFreedGB: {
      type: Number,
      default: 0,
    },

    // Storage Before/After
    storageBeforeMB: {
      type: Number,
      default: 0,
    },

    storageAfterMB: {
      type: Number,
      default: 0,
    },

    storageBeforePercent: {
      type: Number,
      default: 0,
    },

    storageAfterPercent: {
      type: Number,
      default: 0,
    },

    // Execution Details
    durationMs: {
      type: Number,
      default: 0,
    },

    durationSeconds: {
      type: Number,
      default: 0,
    },

    startTime: {
      type: Date,
      default: Date.now,
    },

    endTime: {
      type: Date,
      default: null,
    },

    // Status
    status: {
      type: String,
      enum: ["success", "failed", "partial", "running"],
      default: "running",
    },

    // ✅ FIXED: Renamed 'errors' to 'errorsList' to avoid Mongoose warning
    errorsList: [
      {
        fileName: String,
        error: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    errorCount: {
      type: Number,
      default: 0,
    },

    // Deleted Files List (limited to last 50 for performance)
    deletedFiles: [
      {
        name: String,
        size: Number,
        sizeMB: Number,
        age: Number,
        ageMinutes: Number,
        deletedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Options Used
    options: {
      forceAll: {
        type: Boolean,
        default: false,
      },
      olderThanMinutes: {
        type: Number,
        default: null,
      },
      emergencyMode: {
        type: Boolean,
        default: false,
      },
    },

    // Notes
    notes: {
      type: String,
      default: "",
    },

    // Metadata
    serverInfo: {
      hostname: String,
      platform: String,
      nodeVersion: String,
    },
  },
  {
    timestamps: true,
    collection: "cleanup_history",
    suppressReservedKeysWarning: true, // ✅ Added to suppress warnings
  }
);

// Indexes for performance
cleanupHistorySchema.index({ createdAt: -1 });
cleanupHistorySchema.index({ type: 1, createdAt: -1 });
cleanupHistorySchema.index({ status: 1 });
cleanupHistorySchema.index({ triggeredBy: 1 });

// Virtual for formatted duration
cleanupHistorySchema.virtual("formattedDuration").get(function () {
  if (this.durationSeconds < 60) {
    return `${this.durationSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(this.durationSeconds / 60);
  const seconds = (this.durationSeconds % 60).toFixed(0);
  return `${minutes}m ${seconds}s`;
});

// Virtual for success rate
cleanupHistorySchema.virtual("successRate").get(function () {
  if (this.filesChecked === 0) return 0;
  return ((this.filesDeleted / this.filesChecked) * 100).toFixed(1);
});

// Static method: Get recent history
cleanupHistorySchema.statics.getRecent = function (limit = 50) {
  return this.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("-deletedFiles")
    .lean();
};

// Static method: Get today's cleanups
cleanupHistorySchema.statics.getToday = function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return this.find({
    createdAt: { $gte: today },
  })
    .sort({ createdAt: -1 })
    .lean();
};

// Static method: Get statistics
cleanupHistorySchema.statics.getStatistics = async function (days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: { $in: ["success", "partial"] },
      },
    },
    {
      $group: {
        _id: null,
        totalCleanups: { $sum: 1 },
        totalFilesDeleted: { $sum: "$filesDeleted" },
        totalSpaceFreedGB: { $sum: "$spaceFreedGB" },
        avgDuration: { $avg: "$durationSeconds" },
        totalErrors: { $sum: "$errorCount" },
      },
    },
  ]);

  return stats[0] || {
    totalCleanups: 0,
    totalFilesDeleted: 0,
    totalSpaceFreedGB: 0,
    avgDuration: 0,
    totalErrors: 0,
  };
};

// Static method: Get cleanup by type
cleanupHistorySchema.statics.getByType = function (type, limit = 20) {
  return this.find({ type }).sort({ createdAt: -1 }).limit(limit).lean();
};

// Static method: Delete old history (keep last 100 records)
cleanupHistorySchema.statics.cleanOldHistory = async function (keepLast = 100) {
  const records = await this.find().sort({ createdAt: -1 }).skip(keepLast).select("_id");

  const idsToDelete = records.map((r) => r._id);

  if (idsToDelete.length > 0) {
    const result = await this.deleteMany({ _id: { $in: idsToDelete } });
    return result.deletedCount;
  }

  return 0;
};

// Pre-save middleware: Calculate derived fields
cleanupHistorySchema.pre("save", function (next) {
  // Calculate MB and GB from bytes
  if (this.spaceFreedBytes) {
    this.spaceFreedMB = parseFloat((this.spaceFreedBytes / 1024 / 1024).toFixed(2));
    this.spaceFreedGB = parseFloat((this.spaceFreedBytes / 1024 / 1024 / 1024).toFixed(4));
  }

  // Calculate duration in seconds
  if (this.startTime && this.endTime) {
    this.durationMs = this.endTime - this.startTime;
    this.durationSeconds = parseFloat((this.durationMs / 1000).toFixed(2));
  }

  // Count errors (using errorsList instead of errors)
  this.errorCount = this.errorsList?.length || 0;

  // Set server info if not exists
  if (!this.serverInfo || !this.serverInfo.hostname) {
    this.serverInfo = {
      hostname: process.env.HOSTNAME || "unknown",
      platform: process.platform,
      nodeVersion: process.version,
    };
  }

  next();
});

// Export model
const CleanupHistory = mongoose.model("CleanupHistory", cleanupHistorySchema);

export default CleanupHistory;