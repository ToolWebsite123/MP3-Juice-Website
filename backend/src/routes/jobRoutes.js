// ✅ src/routes/jobRoutes.js
import express from "express";
import { createJob, getJobStatus, downloadJobFile } from "../controllers/jobController.js";

const router = express.Router();

/**
 * ✅ Health check (for testing)
 * GET /api/jobs
 */
router.get("/", (req, res) => {
  res.json({ message: "✅ Job routes are working fine!" });
});

/**
 * 🟢 Create a new download job
 * POST /api/jobs
 */
router.post("/", createJob);

/**
 * 🟡 Get job status by ID
 * Example: GET /api/jobs/status/6713b6d1d1e2a4f0b12345ab
 */
router.get("/status/:jobId", getJobStatus);

/**
 * 🔵 Download completed file
 * Example: GET /api/jobs/download/6713b6d1d1e2a4f0b12345ab
 */
router.get("/download/:jobId", downloadJobFile);

export default router;
