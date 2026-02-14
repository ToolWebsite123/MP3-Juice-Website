// ✅ src/models/Job.js (updated: jobId alias + backward compatibility)
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    // 🎬 Video URL
    url: {
      type: String,
      required: [true, "Video URL is required"],
      trim: true,
    },

    // 📦 Output format
    format: {
      type: String,
      enum: ["mp3", "mp4", "wav", "webm"],
      default: "mp4",
    },

    // ⚙️ Quality
    quality: {
      type: String,
      default: "auto",
    },

    // 🔄 Status
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
      index: true,
    },

    // 📊 Progress
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // 📁 Local path (if keeping local copy)
    filePath: {
      type: String,
      default: null,
    },

    // 🌐 Public result URL (Cloudinary or CDN or local /downloads/...)
    resultUrl: {
      type: String,
      default: null,
    },

    // ❌ Error message
    error: {
      type: String,
      default: null,
    },

    // 🧩 Bull queue job id (compatibility)
    queueJobId: {
      type: String,
      default: null,
      index: true,
    },

    // ✅ Alias field used elsewhere in code: jobId
    jobId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Before saving, ensure jobId and queueJobId are synced for convenience
jobSchema.pre("save", function (next) {
  try {
    if (!this.jobId && this.queueJobId) this.jobId = this.queueJobId;
    if (!this.queueJobId && this.jobId) this.queueJobId = this.jobId;
  } catch (e) {
    // ignore
  }
  next();
});

// Index for latest first
jobSchema.index({ createdAt: -1 });

jobSchema.set("autoIndex", true);

const Job = mongoose.model("Job", jobSchema);
export default Job;
