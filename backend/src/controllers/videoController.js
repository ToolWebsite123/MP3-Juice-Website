/* eslint-disable no-unused-vars */
/* eslint-disable no-control-regex */
// ✅ Video Controller - Metadata & Formats Only (No File Operations)
// ═══════════════════════════════════════════════════════════════════════
// FEATURES:
//    1. ✅ Only handles metadata and formats
//    2. ✅ Returns JSON with title + formats + URLs
//    3. ✅ Backend decides format, frontend displays
//    4. ✅ No file save/delete/path operations
// ═══════════════════════════════════════════════════════════════════════

import logger from "../utils/logger.js";
import AppError from "../utils/AppError.js";
import Job from "../models/Job.js";
import { addVideoJob, cancelVideoJob } from "../services/queueService.js";
import { fetchVideoInfo, searchYouTube, searchRelatedVideos, getDownloadUrl, extractUrlForQuality } from "../services/videoService.js";

/* ----------------------------------------------------------
   🔍 SEARCH YOUTUBE VIDEOS
---------------------------------------------------------- */
export const searchHandler = async (req, res, next) => {
  try {
    const query = (req.query.query || req.query.q || req.body.query || "").trim();
    const rawLimit = Number(req.query.limit || req.body.limit || 20);
    const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 20 : rawLimit, 20)); // cap to 20 for speed

    logger.info(`🔍 Search request received: "${query}"`);

    if (!query) {
      logger.warn("⚠️ Empty search query");
      return res.status(400).json({
        success: false,
        message: "Search query is required",
        error: "EMPTY_QUERY",
        hint: "Use ?query=... or ?q=... parameter"
      });
    }

    if (query.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
        error: "QUERY_TOO_SHORT"
      });
    }

    logger.info(`🔎 Searching YouTube for: "${query}"`);
    
    // 🔥 MP3 JUICE FAST: Search with timeout protection - always return results (even if empty)
    const results = await searchYouTube(query, limit);

    // Always return results array (even if empty) - never block or throw
    const safeResults = Array.isArray(results) ? results : [];

    if (safeResults.length === 0) {
      logger.info(`ℹ️ No results found for: "${query}"`);
      return res.status(200).json({
        success: true,
        results: [],
        count: 0,
        message: "No videos found for this search",
        query: query
      });
    }

    logger.info(`✅ Found ${safeResults.length} results for: "${query}"`);

    return res.status(200).json({
      success: true,
      results: safeResults,
      count: safeResults.length,
      query: query,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    // 🔥 MP3 JUICE FAST: Never block on errors - always return empty results
    logger.warn(`⚠️ searchHandler error (returning empty results): ${err.message}`);
    
    // Return empty results instead of error to avoid blocking
    return res.status(200).json({
      success: true,
      results: [],
      count: 0,
      message: "Search temporarily unavailable",
      query: req.query.query || req.body.query || ""
    });
  }
};

/* ----------------------------------------------------------
   🎬 GET VIDEO INFO WITH FORMATS
---------------------------------------------------------- */
export const getVideoInfo = async (req, res) => {
  // ✅ CRITICAL: Ensure response is always sent, even on errors
  let responseSent = false;
  
  const sendResponse = (statusCode, data) => {
    if (!responseSent && !res.headersSent) {
      responseSent = true;
      return res.status(statusCode).json(data);
    }
  };

  try {
    const url = (req.query.url || req.body.url || "").trim();

    logger.info(`ℹ️ Video info request: ${url.substring(0, 50)}...`);

    if (!url) {
      logger.warn("⚠️ Missing URL parameter");
      return sendResponse(400, {
        success: false,
        message: "YouTube URL is required",
        error: "MISSING_URL",
        hint: "Provide URL in query parameter or request body"
      });
    }

    // Validate YouTube URL format
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      logger.warn(`⚠️ Invalid URL format: ${url}`);
      return sendResponse(400, {
        success: false,
        message: "Invalid YouTube URL format",
        error: "INVALID_URL",
        hint: "URL must be from youtube.com or youtu.be"
      });
    }

    // ✅ Check cache first (immediate return if available)
    let info = null;
    try {
      // Try to get cached info quickly (1 second timeout)
      const cachedInfo = await Promise.race([
        fetchVideoInfo(url, true), // skipCookieRotation for faster cache check
        new Promise((_, reject) => setTimeout(() => reject(new Error('Cache check timeout')), 1000))
      ]).catch(() => null);
      
      if (cachedInfo && cachedInfo.title && cachedInfo.formats) {
        // Check if client still connected before using cache
        if (req.aborted || res.destroyed) {
          // ✅ Client disconnected - return silently (normal when duplicate requests cancelled)
          return;
        }
        logger.info(`⚡ [Cache] Using cached video info: ${cachedInfo.title}`);
        info = cachedInfo;
      }
    } catch (cacheErr) {
      logger.debug(`ℹ️ [Cache] Cache miss: ${cacheErr.message}`);
    }

    // Fetch video info if not cached (with 45 second timeout for long videos)
    if (!info) {
      logger.info(`🔄 Fetching fresh video metadata...`);
      
      // Check if client still connected before starting slow operation
      if (req.aborted || res.destroyed) {
        // ✅ Client disconnected - return silently (normal when duplicate requests cancelled)
        return;
      }
      
      try {
        // ✅ Increased timeout for long videos (45 seconds)
        // WHY: Long videos need more time for yt-dlp to extract info
        // RESULT: Prevents ERR_EMPTY_RESPONSE for long videos
        info = await Promise.race([
          fetchVideoInfo(url),
          new Promise((_, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Request timeout after 45 seconds'));
            }, 45000); // ✅ Increased from 10s to 45s for long videos
            
            // Cleanup timeout if request is aborted
            req.once('aborted', () => {
              clearTimeout(timeout);
              reject(new Error('Client disconnected'));
            });
          })
        ]);
        
        // Check if client still connected after fetch
        if (req.aborted || res.destroyed) {
          // ✅ Client disconnected - return silently (normal when duplicate requests cancelled)
          return;
        }
      } catch (fetchErr) {
        // Handle timeout or disconnect gracefully
        if (req.aborted || res.destroyed || fetchErr.message.includes('disconnected')) {
          // ✅ Don't log as error - client disconnect is normal when duplicate requests are cancelled
          // Just return silently - don't try to send response if client already disconnected
          return;
        }
        // Handle timeout error
        if (fetchErr.message.includes('timeout')) {
          logger.warn(`⏱️ [Fetch] Request timeout for: ${url} (long video may need more time)`);
          if (!res.headersSent && !req.aborted && !res.destroyed) {
            return sendResponse(504, { 
              success: false, 
              error: 'Request timeout',
              message: 'Video info fetch timed out. Long videos may need more time. Please try again.'
            });
          }
          return;
        }
        throw fetchErr;
      }
    }

    if (!info || !info.title) {
      logger.error(`❌ Invalid video info received for: ${url}`);
      return sendResponse(400, {
        success: false,
        message: "Invalid or restricted video",
        error: "INVALID_VIDEO_DATA",
        hint: "Video might be private, deleted, or region-restricted"
      });
    }

    logger.info(`✅ Video info fetched: "${info.title}"`);
    logger.info(`📊 Formats - Audio: ${info.audioFormats?.length || 0}, Video: ${info.videoFormats?.length || 0}`);

    // 🔥 RELATED VIDEOS: Fetch similar videos using video title (non-blocking with timeout)
    const videoTitle = info.title || '';
    const videoId = info.id || null;
    let relatedDownloads = [];
    
    // Fetch related videos asynchronously (with timeout to keep response fast)
    const relatedVideosPromise = (async () => {
      try {
        if (!videoTitle || videoTitle.length < 3) {
          logger.debug(`⚠️ [RELATED] Title too short, skipping related videos`);
          return [];
        }

        logger.info(`🔍 [RELATED] Fetching related videos for: "${videoTitle.substring(0, 50)}"`);
        
        // Fetch 15 related videos (cached, fast)
        // Use timeout to prevent blocking if search is slow
        const relatedVideos = await Promise.race([
          searchRelatedVideos(videoTitle, 15, videoId), // Exclude current video
          new Promise((resolve) => {
            setTimeout(() => {
              logger.warn(`⏱️ [RELATED] Search timeout, returning empty`);
              resolve([]);
            }, 10000); // 10 second timeout for related videos
          })
        ]);

        logger.info(`✅ [RELATED] Found ${relatedVideos.length} related videos`);
        return relatedVideos || [];
      } catch (err) {
        logger.warn(`⚠️ [RELATED] Error fetching related videos: ${err.message}`);
        return []; // Return empty array on error (non-blocking)
      }
    })();

    // Wait for related videos with a reasonable timeout (non-blocking)
    try {
      relatedDownloads = await Promise.race([
        relatedVideosPromise,
        new Promise((resolve) => {
          setTimeout(() => {
            logger.warn(`⏱️ [RELATED] Timeout waiting for related videos`);
            resolve([]);
          }, 12000); // 12 second max wait
        })
      ]);
    } catch (err) {
      logger.warn(`⚠️ [RELATED] Failed to fetch related videos: ${err.message}`);
      relatedDownloads = []; // Fallback to empty array
    }

    // 🔥 MP3 JUICE STYLE: Return ALL available formats separated into videoFormats and audioFormats
    const videoFormats = [];
    const audioFormats = [];

    if (!info.formats || !Array.isArray(info.formats)) {
      logger.warn(`⚠️ No formats available in video info`);
    } else {
      // ✅ MULTI-FORMAT SUPPORT: Filter valid formats (allow HLS, HTTPS only)
      const validFormats = info.formats.filter(f => {
        if (!f || !f.url) return false;
        // ✅ ALLOW: HLS formats (for streaming support)
        // ✅ ALLOW: All formats with HTTPS URLs
        if (!f.url.startsWith('https://')) return false;
        return true;
      });

      // 🔥 MP3 JUICE MODE: Show ALL available qualities (progressive + DASH)
      // MP3 Juice shows: 1080p, 720p, 480p, 360p, 240p, 144p
      const targetVideoQualities = [1080, 720, 480, 360, 240, 144];

      // 🔥 MP3 JUICE PERFORMANCE: Parallelize format extraction using Promise.all
      // Process all qualities in parallel instead of sequential loop
      const formatPromises = targetVideoQualities.map(async (quality) => {
        try {
          // 1. Try progressive format first (video+audio combined)
          const progressiveFormat = validFormats.find(f =>
            f.height === quality &&
            f.vcodec && f.vcodec !== 'none' &&
            f.acodec && f.acodec !== 'none'
          );

          if (progressiveFormat && progressiveFormat.url) {
            let filesize = null;
            if (progressiveFormat.filesize) {
              filesize = Math.round(progressiveFormat.filesize / (1024 * 1024));
            } else if (info.duration) {
              const mbPerMin = quality === 1080 ? 25 : quality === 720 ? 12 : 
                              quality === 480 ? 6 : quality === 360 ? 4 : 
                              quality === 240 ? 3 : 2;
              filesize = Math.round((info.duration / 60) * mbPerMin);
            }

            return {
              quality: `${quality}p`,
              qualityLabel: `${quality}p`,
              format: 'mp4',
              extension: 'mp4',
              type: 'video',
              filesize: filesize ? `${filesize} MB` : null,
              filesizeMB: filesize,
              directUrl: progressiveFormat.url,
              url: progressiveFormat.url,
              hasAudio: true,
              needsMerge: false,
              container: 'mp4'
            };
          } else if (quality >= 1080) {
            // 2. For 1080p+: Try DASH format (video-only + separate audio)
            const dashVideoFormat = validFormats.find(f =>
              f.height === quality &&
              f.vcodec && f.vcodec !== 'none' &&
              (!f.acodec || f.acodec === 'none')
            );

            const dashAudioFormat = validFormats.find(f =>
              f.acodec && f.acodec !== 'none' &&
              (!f.vcodec || f.vcodec === 'none')
            );

            if (dashVideoFormat && dashAudioFormat && dashVideoFormat.url) {
              let filesize = null;
              if (info.duration) {
                const mbPerMin = 25;
                filesize = Math.round((info.duration / 60) * mbPerMin);
              }

              return {
                quality: `${quality}p`,
                qualityLabel: `${quality}p`,
                format: 'mp4',
                extension: 'mp4',
                type: 'video',
                filesize: filesize ? `${filesize} MB` : null,
                filesizeMB: filesize,
                directUrl: dashVideoFormat.url,
                url: dashVideoFormat.url,
                videoUrl: dashVideoFormat.url,
                audioUrl: dashAudioFormat.url,
                hasAudio: true,
                needsMerge: true,
                container: 'mp4'
              };
            }
          }
          return null;
        } catch (err) {
          logger.debug(`⚠️ Could not process ${quality}p: ${err.message}`);
          return null;
        }
      });

      // Wait for all format extractions in parallel
      const formatResults = await Promise.all(formatPromises);
      videoFormats.push(...formatResults.filter(f => f !== null));

      // Extract audio formats in parallel
      const audioOnlyFormats = validFormats.filter(f =>
        f.acodec && f.acodec !== 'none' &&
        (!f.vcodec || f.vcodec === 'none') &&
        f.url
      );

      if (audioOnlyFormats.length > 0) {
        const sortedAudio = audioOnlyFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
        const bestAudio = sortedAudio[0];
        // ✅ MP3 JUICE: Audio qualities in order: 320kbps > 256kbps > 192kbps > 128kbps > 64kbps (highest first)
        const targetAudioBitrates = [320, 256, 192, 128, 64];

        // Process audio bitrates in parallel
        const audioPromises = targetAudioBitrates.map(async (bitrate) => {
          try {
            let filesize = null;
            if (bestAudio.filesize) {
              filesize = Math.round(bestAudio.filesize / (1024 * 1024));
            } else if (info.duration) {
              filesize = Math.round((info.duration / 60) * (bitrate / 128) * 1.5);
            }

            return {
              quality: `${bitrate}kbps`,
              qualityLabel: `${bitrate}kbps`,
              bitrate: bitrate,
              format: 'mp3',
              extension: 'mp3',
              type: 'audio',
              filesize: filesize ? `${filesize} MB` : null,
              filesizeMB: filesize,
              directUrl: bestAudio.url,
              url: bestAudio.url,
              hasAudio: true,
              needsMerge: false,
              container: 'mp3'
            };
          } catch (err) {
            logger.debug(`⚠️ Could not process ${bitrate}kbps: ${err.message}`);
            return null;
          }
        });

        const audioResults = await Promise.all(audioPromises);
        audioFormats.push(...audioResults.filter(f => f !== null));
      }
    }

    logger.info(`📦 [MP3 JUICE] Built ${videoFormats.length} video formats, ${audioFormats.length} audio formats`);

    // Check if client still connected before sending response
    if (req.aborted || res.destroyed) {
      // ✅ Client disconnected - return silently (normal when duplicate requests cancelled)
      return;
    }

    // ✅ CRITICAL: Always send proper response structure
    if (res.headersSent) {
      logger.warn('⚠️ Response already sent, skipping');
      return;
    }

    // Return MP3 Juice-style JSON structure (v1 API format)
    return res.status(200).json({
      success: true,
      video: {
        title: info.title,
        videoId: info.id,
        duration: info.duration || 0,
        thumbnail: info.thumbnail,
        uploader: info.uploader || info.channel,
        view_count: info.view_count || 0
      },
      videoFormats: videoFormats,
      audioFormats: audioFormats,
      relatedDownloads: relatedDownloads || [] // Related videos as "Related Downloads"
    });

  } catch (err) {
    logger.error(`❌ getVideoInfo error:`, {
      message: err.message,
      stack: err.stack,
      url: req.query.url || req.body.url
    });

    if (err.message === 'Fetch timeout') {
      return res.status(504).json({
        success: false,
        message: "Request timed out after 45 seconds",
        error: "TIMEOUT",
        hint: "Video might be very long or temporarily unavailable"
      });
    }

    if (err.message?.includes("unavailable")) {
      return res.status(404).json({
        success: false,
        message: "Video is unavailable",
        error: "VIDEO_UNAVAILABLE",
        hint: "Video might be deleted, private, or region-restricted"
      });
    }

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Unable to fetch video details",
        error: err.message || "FETCH_ERROR",
        hint: "Check if the URL is correct and video is accessible"
      });
    }
  }
};

/* ----------------------------------------------------------
   🧩 CREATE DOWNLOAD JOB
---------------------------------------------------------- */
export const createVideoJob = async (req, res) => {
  try {
    const { url, format = "mp4", quality = "720" } = req.body;

    logger.info(`📥 Download job request: ${format} @ ${quality}`);

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "YouTube URL is required",
        error: "MISSING_URL",
        hint: "Provide 'url' in request body"
      });
    }

    // Validate URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json({
        success: false,
        message: "Invalid YouTube URL",
        error: "INVALID_URL"
      });
    }

    // Validate format
    const validFormats = ["mp4", "mp3", "webm"];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid format. Must be one of: ${validFormats.join(", ")}`,
        error: "INVALID_FORMAT",
        validFormats
      });
    }

    // Validate quality
    const validQualities = [
      "144", "240", "360", "480", "720", "1080", "auto",
      "320", "256", "192", "128", "96", "64"
    ];

    const normalizedQuality = String(quality).replace(/p$/i, "").replace(/kbps$/i, "");

    if (!validQualities.includes(normalizedQuality)) {
      return res.status(400).json({
        success: false,
        message: `Invalid quality`,
        error: "INVALID_QUALITY",
        validQualities: {
          video: ["144p", "240p", "360p", "480p", "720p", "1080p", "auto"],
          audio: ["64kbps", "96kbps", "128kbps", "192kbps", "256kbps", "320kbps"]
        }
      });
    }

    // Create job in database
    const job = await Job.create({
      url,
      format,
      quality: normalizedQuality,
      status: "queued",
      progress: 0,
    });

    logger.info(`📝 Job created in DB: ${job._id}`);

    // Add to processing queue
    try {
      const added = await addVideoJob({
        url,
        format,
        quality: normalizedQuality,
        jobDbId: job._id.toString(),
      });

      if (added?.id) {
        job.jobId = added.id.toString();
        await job.save();
        logger.info(`✅ Job queued successfully: ${job._id}`);
      }
    } catch (queueErr) {
      logger.error(`❌ Queue error: ${queueErr.message}`);
      job.status = "failed";
      job.error = "Failed to add to processing queue";
      await job.save();

      return res.status(500).json({
        success: false,
        message: "Failed to queue download",
        error: "QUEUE_ERROR",
        hint: "Please try again in a few moments"
      });
    }

    return res.status(202).json({
      success: true,
      message: "Download job created successfully",
      jobId: job._id,
      format,
      quality: normalizedQuality,
      status: "queued",
      urls: {
        status: `/api/video/status/${job._id}`,
        download: `/api/video/download/${job._id}`,
        result: `/api/video/result/${job._id}`
      },
      estimatedTime: "1-3 minutes",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`❌ createVideoJob error: ${err.message}`);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to create download job",
        error: err.message
      });
    }
  }
};

/* ----------------------------------------------------------
   📊 CHECK JOB STATUS
---------------------------------------------------------- */
export const checkJobStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
        error: "MISSING_JOB_ID"
      });
    }

    // Validate MongoDB ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
        error: "INVALID_JOB_ID"
      });
    }

    const job = await Job.findById(id).lean();

    if (!job) {
      logger.warn(`⚠️ Job not found: ${id}`);
      return res.status(404).json({
        success: false,
        message: "Job not found",
        error: "JOB_NOT_FOUND",
        hint: "Job may have been deleted or expired"
      });
    }

    logger.debug(`📊 Status check: ${id} → ${job.status} (${job.progress}%)`);

    const response = {
      success: true,
      jobId: job._id,
      status: job.status,
      progress: job.progress || 0,
      format: job.format || null,
      quality: job.quality || null,
      title: job.title || null,
      error: job.error || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      timestamp: new Date().toISOString()
    };

    // Add download URL if completed
    if (job.status === "completed" && job.resultUrl) {
      response.resultUrl = job.resultUrl;
      response.downloadUrl = `/api/video/download/${job._id}`;
      response.downloadReady = true;
    } else {
      response.downloadReady = false;
    }

    // Add helpful messages based on status
    switch (job.status) {
      case "queued":
        response.message = "Job is in queue, waiting to start";
        break;
      case "active":
        response.message = "Job is currently processing";
        break;
      case "completed":
        response.message = "Download completed successfully";
        break;
      case "failed":
        response.message = "Job failed. Please try again";
        break;
      case "cancelled":
        response.message = "Job was cancelled";
        break;
    }

    return res.status(200).json(response);
  } catch (err) {
    logger.error(`❌ checkJobStatus error: ${err.message}`);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Error checking job status",
        error: err.message
      });
    }
  }
};

/* ----------------------------------------------------------
   📥 GET DOWNLOAD URL (No File Serving - Returns JSON)
---------------------------------------------------------- */
export const downloadResultFile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID",
        error: "INVALID_JOB_ID"
      });
    }

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
        error: "JOB_NOT_FOUND"
      });
    }

    if (job.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: `Job is ${job.status}. Please wait for completion.`,
        status: job.status,
        progress: job.progress,
        error: "JOB_NOT_COMPLETED"
      });
    }

    // Return direct URL (no file serving)
    if (job.resultUrl) {
      return res.status(200).json({
        success: true,
        title: job.title || "Downloaded Video",
        url: job.resultUrl,
        format: job.format,
        quality: job.quality,
        downloadUrl: job.resultUrl, // Direct URL for browser download
        message: "Use the URL to download directly"
      });
    }

    return res.status(404).json({
      success: false,
      message: "Download URL not available",
      error: "URL_NOT_FOUND",
      hint: "Job completed but no download URL available"
    });

  } catch (err) {
    logger.error(`❌ downloadResultFile error: ${err.message}`);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to get download URL",
        error: err.message
      });
    }
  }
};

/* ----------------------------------------------------------
   ❌ CANCEL JOB
---------------------------------------------------------- */
export const cancelJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
        error: "MISSING_JOB_ID"
      });
    }

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
        error: "INVALID_JOB_ID"
      });
    }

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
        error: "JOB_NOT_FOUND"
      });
    }

    if (job.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a completed job",
        error: "JOB_ALREADY_COMPLETED"
      });
    }

    if (job.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Job is already cancelled",
        error: "ALREADY_CANCELLED"
      });
    }

    // Try to cancel the Bull queue job
    if (job.jobId) {
      try {
        await cancelVideoJob(job.jobId);
        logger.info(`✅ Bull job cancelled: ${job.jobId}`);
      } catch (err) {
        logger.warn(`⚠️ Failed to cancel Bull job: ${err.message}`);
      }
    }

    // Update job status
    job.status = "cancelled";
    job.progress = 0;
    job.error = "Job cancelled by user";
    await job.save();

    logger.info(`❌ Job cancelled: ${id}`);

    return res.status(200).json({
      success: true,
      message: "Job cancelled successfully",
      jobId: id,
      status: "cancelled",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`❌ cancelJob error: ${err.message}`);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to cancel job",
        error: err.message
      });
    }
  }
};

/* ----------------------------------------------------------
   ✅ GET RESULT INFO (JSON Only - No File Operations)
---------------------------------------------------------- */
export const getVideoResult = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID",
        error: "INVALID_JOB_ID"
      });
    }

    const job = await Job.findById(id).lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
        error: "JOB_NOT_FOUND"
      });
    }

    if (job.status !== "completed" || !job.resultUrl) {
      return res.status(400).json({
        success: false,
        message: job.status === "failed"
          ? "Job failed. Please try again."
          : `Job is ${job.status}. Please wait.`,
        status: job.status,
        progress: job.progress,
        error: job.error || null,
      });
    }

    logger.info(`✅ Result info retrieved: ${id}`);

    // Return JSON with URL (no file operations)
    return res.status(200).json({
      success: true,
      title: job.title || "Downloaded Video",
      url: job.resultUrl,
      format: job.format,
      quality: job.quality,
      status: "completed",
      downloadUrl: job.resultUrl, // Direct URL for browser download
      createdAt: job.createdAt,
      completedAt: job.updatedAt,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`❌ getVideoResult error: ${err.message}`);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Unable to fetch result info",
        error: err.message
      });
    }
  }
};

export default {
  searchHandler,
  getVideoInfo,
  createVideoJob,
  checkJobStatus,
  downloadResultFile,
  cancelJob,
  getVideoResult,
};