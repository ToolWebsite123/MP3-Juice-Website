// ✅ src/controllers/jobController.js — FINAL OPTIMIZED VERSION
import Job from "../models/Job.js";
import { addVideoJob } from "../services/queueService.js";
import path from "path";
import fs from "fs";
import logger from "../utils/logger.js";

/* ----------------------------------------------------------
   🟢 1️⃣ Create New Job (Start YouTube Download)
---------------------------------------------------------- */
export const createJob = async (req, res) => {
  try {
    const { url, format = "mp4", quality = "720p" } = req.body;

    if (!url) {
      return res.status(400).json({
        status: "fail",
        message: "⚠️ YouTube URL is required",
      });
    }

    // 🗃️ Create job record in MongoDB
    const job = await Job.create({
      url,
      format,
      quality,
      status: "queued",
      progress: 0,
    });

    // 🚀 Add job to Bull queue
    await addVideoJob({
      jobDbId: job._id.toString(),
      url,
      format,
      quality,
    });

    logger.info(`🟢 [JobController] Job created → ${job._id}`);

    res.status(201).json({
      status: "success",
      message: "🎬 Job created successfully",
      jobId: job._id,
    });
  } catch (error) {
    logger.error(`❌ [JobController] createJob failed → ${error.message}`);
    res.status(500).json({
      status: "error",
      message: "🚨 Failed to create job",
      error: error.message,
    });
  }
};

/* ----------------------------------------------------------
   🟡 2️⃣ Get Job Status
---------------------------------------------------------- */
export const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        status: "fail",
        message: "⚠️ Job not found",
      });
    }

    res.status(200).json({
      status: "success",
      job: {
        id: job._id,
        status: job.status,
        progress: job.progress,
        title: job.title || "Processing...",
        resultUrl: job.resultUrl || null,
        error: job.error || null,
      },
    });
  } catch (error) {
    logger.error(`❌ [JobController] getJobStatus failed → ${error.message}`);
    res.status(500).json({
      status: "error",
      message: "🚨 Failed to fetch job status",
      error: error.message,
    });
  }
};

/* ----------------------------------------------------------
   🔵 3️⃣ Download Completed File (Local + Cloud)
---------------------------------------------------------- */
export const downloadJobFile = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);

    if (!job || job.status !== "completed") {
      return res.status(404).json({
        status: "fail",
        message: "⚠️ Job not completed or not found",
      });
    }

    // ☁️ If Cloudinary URL available → direct redirect (fast)
    if (job.resultUrl && job.resultUrl.startsWith("http")) {
      logger.info(`☁️ Redirecting to Cloudinary → ${job.resultUrl}`);
      return res.redirect(job.resultUrl);
    }

    // 💾 Else serve file from local storage
    if (!job.filePath) {
      return res.status(404).json({
        status: "fail",
        message: "⚠️ Local file path missing",
      });
    }

    const filePath = path.resolve(job.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: "fail",
        message: "⚠️ File missing on server",
      });
    }

    logger.info(`⬇️ [JobController] Sending file → ${filePath}`);

    // 🧠 Correct headers for browser download
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="video-${jobId}.${job.format}"`
    );

    // ✅ Stream file instead of loading full in memory
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on("error", (err) => {
      logger.error(`💥 [JobController] File stream error → ${err.message}`);
      res.status(500).end("Error streaming file");
    });
  } catch (error) {
    logger.error(`💥 [JobController] downloadJobFile failed → ${error.message}`);
    res.status(500).json({
      status: "error",
      message: "🚨 Failed to download file",
      error: error.message,
    });
  }
};
