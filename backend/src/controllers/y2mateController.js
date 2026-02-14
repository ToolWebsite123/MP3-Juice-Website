// ═══════════════════════════════════════════════════════════════════════
// 🎯 Y2MATE-STYLE API CONTROLLER
// ═══════════════════════════════════════════════════════════════════════
// RULES:
//   1. Server NEVER downloads or merges files
//   2. Server ONLY returns JSON with direct YouTube CDN URLs
//   3. Only Progressive MP4 (video+audio) and MP3 formats
//   4. Skip DASH streams (video-only/audio-only)
//   5. Cookie rotation/fallback for restricted videos
//   6. Optional async job for large videos
// ═══════════════════════════════════════════════════════════════════════

import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';
import { fetchVideoInfo, extractFormats, searchRelatedVideos } from '../services/videoService.js';
import { COOKIES_PATH } from '../utils/updateCookies.js';
import fsSync from 'fs';
import ytdlp from 'yt-dlp-exec';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Check if cookies are enabled via ENV flag
 */
const areCookiesEnabled = () => {
  const envFlag = process.env.ENABLE_COOKIES;
  return envFlag === 'true' || envFlag === '1' || envFlag === 'yes';
};

/**
 * 🔥 Y2MATE API: Get video info with direct playable URLs
 * Returns JSON with progressive MP4 and MP3 formats only
 * 
 * @route GET/POST /api/y2mate/info
 * @param {string} url - YouTube video URL
 * @returns {Object} JSON with video info and direct URLs
 */
export const getY2MateInfo = async (req, res) => {
  try {
    const url = (req.query.url || req.body.url || '').trim();

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL_REQUIRED',
        message: 'YouTube URL is required',
        hint: 'Provide ?url=... parameter'
      });
    }

    logger.info(`🎯 [Y2MATE] Video info request: ${url.substring(0, 50)}...`);

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_URL',
        message: 'Invalid YouTube URL format'
      });
    }

    // Extract video ID
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'VIDEO_ID_NOT_FOUND',
        message: 'Could not extract video ID from URL'
      });
    }

    // 🔥 Y2MATE MODE: Fetch video info (cookies optional)
    let videoInfo = null;
    let cookieAttempts = 0;
    const maxCookieAttempts = areCookiesEnabled() ? 3 : 1; // Only try cookies if enabled

    // Try with cookies first (only if enabled)
    if (areCookiesEnabled()) {
      for (let attempt = 0; attempt < maxCookieAttempts; attempt++) {
        try {
          cookieAttempts = attempt + 1;
          const cookiesPath = fsSync.existsSync(COOKIES_PATH) ? COOKIES_PATH : null;
          
          logger.info(`🔄 [Y2MATE] Attempt ${cookieAttempts}/${maxCookieAttempts} - Fetching video info...`);

          const infoOpts = {
            dumpSingleJson: true,
            skipDownload: true,
            noCheckCertificates: true,
            noPlaylist: true,
            socketTimeout: 30,
            retries: 2,
            quiet: true,
            noWarnings: true
          };

          // Add cookies if available
          if (cookiesPath && fsSync.existsSync(cookiesPath)) {
            infoOpts.cookies = cookiesPath;
            logger.debug(`✅ [Y2MATE] Using cookies: ${cookiesPath}`);
          }

          videoInfo = await ytdlp(url, infoOpts);

          if (videoInfo && videoInfo.title) {
            logger.info(`✅ [Y2MATE] Video info fetched successfully (attempt ${cookieAttempts})`);
            break;
          }
        } catch (err) {
          const errorMsg = err.message || String(err);
          
          // If cookies failed, try without cookies
          if (errorMsg.includes('age') || errorMsg.includes('restricted') || errorMsg.includes('private')) {
            logger.warn(`⚠️ [Y2MATE] Cookie attempt ${cookieAttempts} failed: ${errorMsg}`);
            if (attempt < maxCookieAttempts - 1) {
              continue; // Try next cookie or without cookies
            }
          } else if (errorMsg.includes('unavailable') || errorMsg.includes('deleted')) {
            return res.status(404).json({
              success: false,
              error: 'VIDEO_UNAVAILABLE',
              message: 'Video is unavailable, deleted, or private'
            });
          } else {
            // Other errors - try without cookies as fallback
            logger.warn(`⚠️ [Y2MATE] Error on attempt ${cookieAttempts}: ${errorMsg}`);
            if (attempt < maxCookieAttempts - 1) {
              continue;
            }
          }
        }
      }
    }

    // Final attempt without cookies (fallback or if cookies disabled)
    if (!videoInfo || !videoInfo.title) {
      try {
        logger.info(`🔄 [Y2MATE] ${areCookiesEnabled() ? 'Fallback: ' : ''}Trying without cookies...`);
        videoInfo = await ytdlp(url, {
          dumpSingleJson: true,
          skipDownload: true,
          noCheckCertificates: true,
          noPlaylist: true,
          socketTimeout: 30,
          retries: 2,
          quiet: true,
          noWarnings: true
        });
      } catch (err) {
        logger.error(`❌ [Y2MATE] All attempts failed: ${err.message}`);
        return res.status(500).json({
          success: false,
          error: 'FETCH_FAILED',
          message: 'Failed to fetch video information',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
    }

    if (!videoInfo || !videoInfo.title) {
      return res.status(404).json({
        success: false,
        error: 'NO_VIDEO_DATA',
        message: 'Could not retrieve video information'
      });
    }

    logger.info(`✅ [Y2MATE] Video: "${videoInfo.title}"`);

    // 🔥 Y2MATE MODE: Extract ONLY progressive formats (skip DASH)
    const { videoFormats, audioFormats } = extractFormats(videoInfo);

    // 🔥 RELATED VIDEOS: Fetch similar videos using video title (non-blocking with timeout)
    // Extract video title for search
    const videoTitle = videoInfo.title || '';
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

    // Build response in Y2Mate format
    const response = {
      success: true,
      video: {
        id: videoId,
        title: videoInfo.title || 'Untitled',
        duration: videoInfo.duration || 0,
        thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || null,
        channel: videoInfo.uploader || videoInfo.channel || 'Unknown',
        description: videoInfo.description || null,
        viewCount: videoInfo.view_count || 0,
        uploadDate: videoInfo.upload_date || null
      },
      formats: {
        video: videoFormats
          .filter(f => f.available && f.directUrl) // Only available formats with URLs
          .map(f => ({
            quality: f.qualityLabel || f.quality,
            label: f.label || `${f.qualityLabel || f.quality} (.mp4)`,
            extension: 'mp4',
            filesize: f.fileSize || null,
            filesizeMB: f.fileSizeMB || null,
            url: f.directUrl, // Direct YouTube CDN URL
            hasAudio: f.hasAudio !== false,
            codec: f.codec || 'unknown',
            // Y2Mate-style metadata
            format: 'mp4',
            type: 'video',
            available: true
          })),
        
        audio: audioFormats
          .filter(f => f.available && f.directUrl) // Only available formats with URLs
          .map(f => ({
            quality: f.bitrate ? `${f.bitrate}kbps` : (f.qualityLabel || f.quality),
            label: f.label || `MP3 ${f.bitrate || f.quality}`,
            extension: 'mp3',
            filesize: f.fileSize || null,
            filesizeMB: f.fileSizeMB || null,
            url: f.directUrl, // Direct YouTube CDN URL
            bitrate: f.bitrate || null,
            // Y2Mate-style metadata
            format: 'mp3',
            type: 'audio',
            available: true
          }))
      },
      relatedDownloads: relatedDownloads || [], // Related videos as "Related Downloads"
      metadata: {
        cookieAttempts: cookieAttempts,
        timestamp: new Date().toISOString(),
        serverMode: 'info_only', // Server never downloads/merges
        note: 'All URLs are direct YouTube CDN links. Browser downloads directly.',
        relatedVideosCount: relatedDownloads.length
      }
    };

    logger.info(`📦 [Y2MATE] Returning ${response.formats.video.length} video formats, ${response.formats.audio.length} audio formats, ${relatedDownloads.length} related downloads`);

    return res.status(200).json(response);

  } catch (err) {
    logger.error(`❌ [Y2MATE] Error: ${err.message}`);
    
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An error occurred while processing the request',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
};

/**
 * 🔥 Y2MATE API: Health check
 * 
 * @route GET /api/y2mate/health
 */
export const healthCheck = async (req, res) => {
  try {
    const { execSync } = await import('child_process');
    
    let ytdlpVersion = 'Not installed';
    let ytdlpAvailable = false;
    
    try {
      const output = execSync('yt-dlp --version', {
        stdio: 'pipe',
        timeout: 5000,
        encoding: 'utf8'
      });
      ytdlpVersion = output.trim();
      ytdlpAvailable = true;
    } catch (err) {
      logger.warn('⚠️ yt-dlp not available in PATH');
    }

    res.json({
      success: true,
      status: 'healthy',
      service: 'Y2Mate API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        ytdlp: {
          installed: ytdlpAvailable,
          version: ytdlpVersion
        }
      },
      features: {
        infoOnly: true,
        noFileStorage: true,
        directCDNUrls: true,
        progressiveFormatsOnly: true,
        cookieRotation: areCookiesEnabled(),
        asyncJobs: false // Can be enabled for large videos
      },
      endpoints: {
        getInfo: 'GET/POST /api/y2mate/info?url=...',
        health: 'GET /api/y2mate/health'
      }
    });
  } catch (err) {
    logger.error(`❌ [Y2MATE] Health check error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'HEALTH_CHECK_FAILED',
      message: err.message
    });
  }
};

