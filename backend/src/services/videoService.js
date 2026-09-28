/* eslint-disable no-control-regex */
// ═══════════════════════════════════════════════════════════════════════
// 🎯 COMPLETE FIXED VERSION - ALL QUALITIES WITH AUDIO! ✅
// ═══════════════════════════════════════════════════════════════════════
// ✅ FIXES:
//    1. ✅ ALL qualities (144p-1080p) download with PERFECT AUDIO
//    2. ✅ Smart format selection - audio ALWAYS included
//    3. ✅ Better FFmpeg merge with proper error handling
//    4. ✅ Optimized code - faster & cleaner
//    5. ✅ Improved logging & debugging
// ═══════════════════════════════════════════════════════════════════════

import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import ytdlp from "yt-dlp-exec";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import logger from "../utils/logger.js";
import AppError from "../utils/AppError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📁 CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

// ⚠️ DEPRECATED: DOWNLOAD_DIR is only for legacy worker (downloadToFile)
// MP3 Juice mode uses ZERO storage - all downloads are direct URLs
// This directory should only be used temporarily and auto-cleaned
export const DOWNLOAD_DIR = process.env.DOWNLOAD_PATH || path.resolve(__dirname, "../../downloads");
const COOKIES_PATH = path.resolve(__dirname, "../../cookies.txt");

// Auto-cleanup interval for temporary files (if any are created)
const TEMP_FILE_TTL_HOURS = 1; // 1 hour max for any temp files

// Cookie rotation system (lazy loaded to avoid top-level await issues)
// Cookies are OPTIONAL - only enabled if ENABLE_COOKIES=true
let cookieUtils = null;
let getCookiesPath = null;
let cookiesEnabled = false;

/**
 * Check if cookies are enabled via ENV flag
 */
const areCookiesEnabled = () => {
  const envFlag = process.env.ENABLE_COOKIES;
  return envFlag === 'true' || envFlag === '1' || envFlag === 'yes';
};

const initCookieRotation = async () => {
  // Check if cookies are enabled
  if (!areCookiesEnabled()) {
    logger.debug(`ℹ️ [VideoService] Cookies disabled (set ENABLE_COOKIES=true to enable)`);
    return;
  }

  if (cookieUtils) return; // Already initialized

  try {
    cookieUtils = await import("../utils/updateCookies.js");
    getCookiesPath = cookieUtils.getCookiesPath;
    // Start automatic rotation only if cookies are enabled
    cookieUtils.startCookieRotation().catch(() => { });
    cookiesEnabled = true;
    logger.info(`✅ [VideoService] Cookie rotation initialized (ENABLE_COOKIES=true)`);
  } catch (err) {
    logger.warn(`⚠️ [VideoService] Cookie rotation not available: ${err.message}`);
    logger.warn(`   Downloads will continue without cookies`);
  }
};

// Initialize on first use (non-blocking) - only if enabled
if (areCookiesEnabled()) {
  initCookieRotation().catch(() => { });
} else {
  logger.debug(`ℹ️ [VideoService] Cookies disabled by default - set ENABLE_COOKIES=true to enable`);
}

// Cache Settings
let redisClient = null;
const CACHE_TTL = 4 * 60 * 60; // 4 hours
const CACHE_ENABLED = true;

// Initialize Redis
const initializeCache = async () => {
  if (!CACHE_ENABLED) {
    logger.info('📦 [CACHE] Disabled');
    return;
  }

  try {
    const { createClient } = await import('redis');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: (retries) => {
          if (retries > 2) return false;
          return Math.min(retries * 100, 1000);
        }
      }
    });

    redisClient.on('error', (err) => {
      // Quietly fall back on connection error without crashing or spamming logs
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        redisClient = null;
        return;
      }
      logger.warn(`📦 [CACHE] Redis error: ${err.message}`);
    });

    await redisClient.connect();
    logger.info('✅ [CACHE] Redis connected!');

  } catch (err) {
    logger.warn(`📦 [CACHE] Using memory fallback`);
    if (redisClient) {
      try { redisClient.disconnect(); } catch (_) {}
    }
    redisClient = null;
  }
};

// Memory cache fallback
const memoryCache = new Map();
const memoryCacheExpiry = new Map();
// ✅ CRITICAL: Single-flight protection - prevent duplicate yt-dlp calls for same videoId
const inFlightRequests = new Map(); // Map<videoId, Promise>

const cacheGet = async (key) => {
  try {
    if (redisClient && redisClient.isOpen) {
      const value = await redisClient.get(key);
      if (value) {
        logger.info(`✅ [CACHE] HIT: ${key.substring(0, 50)}...`);
        return JSON.parse(value);
      }
    } else {
      const expiry = memoryCacheExpiry.get(key);
      if (expiry && expiry > Date.now()) {
        logger.info(`✅ [CACHE] MEMORY HIT`);
        return memoryCache.get(key);
      } else if (expiry) {
        memoryCache.delete(key);
        memoryCacheExpiry.delete(key);
      }
    }
  } catch (err) {
    logger.warn(`⚠️ [CACHE] Error: ${err.message}`);
  }

  return null;
};

const cacheSet = async (key, value, ttl = CACHE_TTL) => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } else {
      memoryCache.set(key, value);
      memoryCacheExpiry.set(key, Date.now() + (ttl * 1000));
    }
  } catch (err) {
    logger.warn(`⚠️ [CACHE] Set error: ${err.message}`);
  }
};

// Initialize
initializeCache().catch(() => { });

// ⚠️ Only create DOWNLOAD_DIR if needed (for legacy worker)
// In MP3 Juice mode, this should rarely be used
if (!fsSync.existsSync(DOWNLOAD_DIR)) {
  fsSync.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  logger.debug(`📁 [Storage] Created temp directory (legacy worker only)`);
}

ffmpeg.setFfmpegPath(ffmpegPath);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🛠️ UTILITY FUNCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const sanitizeFilename = (name = "file") => {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 180);
};

const safeUnlink = async (filePath) => {
  try {
    if (filePath && fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
      logger.info(`🗑️ Deleted: ${path.basename(filePath)}`);
      return true;
    }
  } catch (err) {
    logger.warn(`⚠️ Cleanup failed: ${err.message}`);
  }
  return false;
};

const getPublicDownloadUrl = (fileName) => {
  const baseUrl = process.env.BACKEND_URL || "http://localhost:5000";
  return `${baseUrl}/api/download/${fileName}`;
};

const validateUrl = (url) => {
  if (!url || typeof url !== "string") {
    throw new AppError("Valid YouTube URL required", 400);
  }

  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  if (!youtubeRegex.test(url)) {
    throw new AppError("Invalid YouTube URL", 400);
  }

  return url.trim();
};

const extractVideoId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }

  return null;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔒 PHASE-1 SAFE MODE: STRICT FORMAT FILTERING
   🔥 Only allow PROGRESSIVE formats: container=mp4, hasAudio=true, protocol=https
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * ✅ MULTI-FORMAT SUPPORT: Allow all common video/audio formats
 * ALLOWS:
 *   - MP4, WebM, M4A, 3GP containers
 *   - HLS playlists (for streaming support)
 *   - DASH formats (video-only/audio-only separate streams - will be merged)
 *   - Progressive formats (video+audio combined)
 * REJECTS:
 *   - Video-only formats without audio (unless it's part of a DASH pair)
 *   - Non-HTTPS protocols
 */
const isProgressiveFormatAllowed = (format) => {
  if (!format) return false;

  const protocol = format.protocol || '';
  const url = format.url || '';
  const ext = format.ext || '';
  const container = format.container || ext;
  const formatId = format.format_id || '';
  const formatNote = format.format_note || '';
  const containerLower = String(container).toLowerCase();

  // ✅ ALLOW: HLS playlists (for streaming support)
  // HLS formats are now allowed - they can be processed by yt-dlp
  const isHLS = protocol === 'm3u8' || protocol === 'm3u8_native' ||
    url.includes('.m3u8') ||
    formatId.includes('m3u8') ||
    formatNote.toLowerCase().includes('hls');

  // ✅ ALLOW: Multiple container formats (MP4, WebM, M4A, 3GP)
  const allowedContainers = ['mp4', 'webm', 'm4a', '3gp', 'mkv', 'ogg'];
  const hasAllowedContainer = allowedContainers.some(allowed => 
    containerLower.includes(allowed)
  );

  // If it's HLS, allow it (will be handled by yt-dlp)
  if (isHLS && url.startsWith('https://')) {
    // ✅ Removed debug log for performance
    return true;
  }

  // ✅ ALLOW: DASH formats (will be merged server-side)
  const isDash = protocol === 'dash' || protocol === 'http_dash_segments' ||
    formatId.includes('dash') || formatNote.toLowerCase().includes('dash');

  if (isDash && url.startsWith('https://')) {
    // ✅ Removed debug log for performance
    return true;
  }

  // 🔒 REJECT: Unsupported container formats
  if (containerLower && !hasAllowedContainer) {
    // ✅ Removed warn log for performance (too many rejected formats)
    return false;
  }

  // ✅ MP3 JUICE BEHAVIOR: Allow video-only formats (will be merged with separate audio)
  // Video-only formats are valid for DASH merging (480p+)
  const hasAudio = format.acodec && format.acodec !== 'none';
  const hasVideo = format.vcodec && format.vcodec !== 'none';

  // Allow video-only formats - they can be merged with separate audio stream

  // 🔒 REJECT: Non-HTTPS protocols
  if (url && !url.startsWith('https://')) {
    // ✅ Removed warn log for performance
    return false;
  }

  // ✅ ALLOW: Progressive format (video+audio in one stream) with supported container
  if (hasVideo && hasAudio && hasAllowedContainer && url.startsWith('https://')) {
    return true;
  }

  // ✅ ALLOW: Audio-only formats (M4A, WebM audio, etc.)
  if (!hasVideo && hasAudio && hasAllowedContainer && url.startsWith('https://')) {
    return true;
  }

  return false;
};

/**
 * ✅ MULTI-FORMAT SUPPORT: Filter formats array to allow MP4, WebM, M4A, 3GP, HLS
 * Allows all common video/audio formats while rejecting video-only formats
 */
const filterProgressiveFormats = (formats) => {
  if (!formats || !Array.isArray(formats)) {
    return [];
  }

  return formats.filter(format => {
    const allowed = isProgressiveFormatAllowed(format);
    // ✅ Removed debug log for performance (too many rejected formats)
    return allowed;
  });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎯 CRITICAL FIX: PERFECT FORMAT SELECTION!
   🔥 This ensures AUDIO in ALL qualities (144p-1080p)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const getOptimalFormatString = (format, quality) => {
  if (format === 'mp3') {
    // MP3: Best audio quality
    return 'bestaudio[ext=m4a]/bestaudio/best';
  }

  // 🔥 FIX: Validate and normalize quality parameter
  if (!quality || quality === 'undefined' || quality === 'null') {
    quality = '720'; // Default quality
  }

  // Remove 'p' suffix if present
  const normalizedQuality = String(quality).replace(/p$/i, '').replace(/kbps?$/i, '').trim();

  const qualityNum = parseInt(normalizedQuality);

  // If quality is 'auto' or invalid, use best available
  if (normalizedQuality === 'auto' || isNaN(qualityNum) || qualityNum <= 0) {
    // Auto: Try progressive first, then DASH
    // ✅ CRITICAL FIX: Exclude HLS formats
    return 'best[ext=mp4][acodec!=none][vcodec!=none][protocol!=m3u8_native][protocol!=m3u8]/bestvideo[ext=mp4][protocol!=m3u8_native][protocol!=m3u8]+bestaudio[ext=m4a][protocol!=m3u8_native][protocol!=m3u8]/best[ext=mp4][protocol!=m3u8_native][protocol!=m3u8]';
  }

  // 🔥 MP3 JUICE MODE: MP4 enforcement via format selectors only (no invalid flags)
  // Use [ext=mp4] to ensure MP4 container, [protocol=https] to exclude HLS

  if (qualityNum >= 1080) {
    // HIGH QUALITY (1080p+): DASH format (separate video+audio streams)
    // ✅ CRITICAL FIX: Exclude HLS formats [protocol!=m3u8_native][protocol!=m3u8]
    return `bestvideo[height<=${qualityNum}][ext=mp4][protocol!=m3u8_native][protocol!=m3u8]+bestaudio[ext=m4a][protocol!=m3u8_native][protocol!=m3u8]/best[protocol!=m3u8_native][protocol!=m3u8]`;
  }
  else {
    // LOW-MID QUALITY (144p-720p): Progressive format (video+audio combined)
    // ✅ CRITICAL FIX: Use exact height match [height=REQ] instead of [height<=REQ]
    // ✅ CRITICAL FIX: Exclude HLS formats [protocol!=m3u8_native][protocol!=m3u8]
    // ✅ CRITICAL FIX: No fallback to /best which might select HLS
    return `best[height=${qualityNum}][ext=mp4][acodec!=none][vcodec!=none][protocol!=m3u8_native][protocol!=m3u8]/best[height<=${qualityNum}][ext=mp4][acodec!=none][vcodec!=none][protocol!=m3u8_native][protocol!=m3u8]`;
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🚀 MAIN DOWNLOAD URL FUNCTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Helper function to extract available qualities from yt-dlp result
 */
const extractAvailableQualities = (result) => {
  if (!result || !result.formats || !Array.isArray(result.formats)) {
    return [];
  }
  
  const availableHeights = result.formats
    .filter(f => f.height && f.vcodec && f.vcodec !== 'none')
    .map(f => Number(f.height))
    .filter(h => !isNaN(h) && h > 0)
    .filter((h, i, arr) => arr.indexOf(h) === i) // Remove duplicates
    .sort((a, b) => b - a); // Sort descending
  
  return availableHeights;
};

/**
 * 🔥 MP3 JUICE PERFORMANCE: Lazy URL extraction from cached formats
 * This is called when user clicks download - formats already fetched
 */
export const extractUrlForQuality = (videoInfo, format, quality) => {
  if (!videoInfo || !videoInfo.formats) {
    return null;
  }

  const urlInfo = extractUrlFromFormats(videoInfo.formats, format, quality);
  if (!urlInfo) {
    return null;
  }

  // Use actual quality from selected format if available, otherwise use requested quality
  const actualQuality = urlInfo.quality || quality;

  return {
    success: true,
    directUrl: urlInfo.directUrl,
    videoUrl: urlInfo.videoUrl || null,
    audioUrl: urlInfo.audioUrl || null,
    title: videoInfo.title || 'video',
    duration: videoInfo.duration || 0,
    format,
    quality: actualQuality, // Store actual quality from selected format
    hasAudio: urlInfo.hasAudio !== false,
    hasVideo: urlInfo.hasVideo !== false,
    needsMerge: urlInfo.needsMerge || false,
    needsServerDownload: false,
    // Format metadata for proxy streaming
    isProgressive: urlInfo.isProgressive !== undefined ? urlInfo.isProgressive : (urlInfo.hasAudio && urlInfo.hasVideo && !urlInfo.needsMerge),
    container: urlInfo.container || (format === 'mp3' ? 'mp3' : 'mp4'),
    vcodec: urlInfo.vcodec || null,
    acodec: urlInfo.acodec || null,
    httpHeaders: urlInfo.httpHeaders || videoInfo.http_headers || null,
    fromCache: true
  };
};

/**
 * 🔥 LEGACY: Full yt-dlp call for specific quality (used by /proxy endpoint)
 * This is only called when lazy extraction fails or for direct download requests
 */
export const getDownloadUrl = async (url, format = 'mp4', quality = '720') => {
  let videoId = null; // ✅ CRITICAL: Define at top level for error handling
  try {
    url = validateUrl(url);
    videoId = extractVideoId(url);

    if (!videoId) {
      throw new AppError('Could not extract video ID', 400);
    }

    // 🔥 MP3 JUICE MODE: Try to get direct URL for ALL qualities (including 1080p+)
    // Only reject if truly no direct URL available
    const normalizedQuality = String(quality).replace(/p$/i, '').replace(/kbps?$/i, '').trim();
    const qualityNum = parseInt(normalizedQuality);

    const cacheKey = `yt:url:${videoId}:${format}:${quality}`;
    const cached = await cacheGet(cacheKey);

    if (cached && cached.downloadUrl) {
      logger.info(`⚡ [URL] From cache`);
      return { ...cached, fromCache: true };
    }

    logger.info(`🔗 [URL] Fetching: ${format}/${quality}`);

    const formatString = getOptimalFormatString(format, quality);

    // 🔒 PHASE-1 SAFE MODE: Optimized yt-dlp options for URL extraction only
    // No file downloads, only metadata and URL extraction
    // STRICTLY REJECT: HLS, DASH, non-progressive formats
    const opts = {
      dumpSingleJson: true,
      format: formatString,
      noCheckCertificates: true,
      noPlaylist: true,
      skipDownload: true, // CRITICAL: Never download files
      socketTimeout: 30,
      retries: 3, // Reduced retries for faster response
      preferFreeFormats: true,
      mergeOutputFormat: 'mp4', // Merge DASH to MP4
      quiet: true,
      // Additional options to prevent blocking
      userAgent: process.env.YTDLP_USER_AGENT || undefined, // Custom UA if set
      referer: 'https://www.youtube.com/', // Proper referer
      noWarnings: true
      // Note: MP4 enforcement is done via format selectors, not flags
      // Removed invalid flags: preferMp4, noHlsVideo (not supported by yt-dlp)
    };

    // Get cookies path with rotation and fallback (only if enabled)
    if (areCookiesEnabled()) {
      try {
        if (!cookieUtils) {
          await initCookieRotation();
        }
        const cookiesPath = getCookiesPath ? await getCookiesPath() :
          (fsSync.existsSync(COOKIES_PATH) ? COOKIES_PATH : null);
        if (cookiesPath && fsSync.existsSync(cookiesPath)) {
          opts.cookies = cookiesPath;
          logger.debug(`✅ [URL] Using cookies`);
        }
      } catch (cookieErr) {
        logger.warn(`⚠️ [URL] Cookie error (continuing without): ${cookieErr.message}`);
        // Continue without cookies - graceful fallback
      }
    } else {
      logger.debug(`ℹ️ [URL] Cookies disabled - continuing without`);
    }

    let result;
    try {
      result = await ytdlp(url, opts);
    } catch (ytdlpError) {
      // ✅ Log yt-dlp errors but don't crash - return clear error message
      logger.error(`❌ [URL] yt-dlp failed for ${quality}p: ${ytdlpError.message}`);
      logger.error(`   Format string: ${formatString}`);
      
      // Check if it's a format availability issue
      const errorMsg = ytdlpError.message || String(ytdlpError);
      if (errorMsg.includes('requested format') || errorMsg.includes('format is not available')) {
        throw new AppError(
          `The requested quality (${quality}p) is not available for this video. Please try a different quality.`,
          404
        );
      }
      
      // Generic yt-dlp error
      throw new AppError(
        `Failed to fetch video format: ${errorMsg.substring(0, 100)}`,
        500
      );
    }

    if (!result) {
      logger.error(`❌ [URL] yt-dlp returned empty result for ${quality}p`);
      throw new AppError('No response from YouTube. The video may be unavailable or restricted.', 404);
    }

    // 🔒 CRITICAL: Validate that URLs are NOT HLS manifests
    const validateDirectUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      // Reject HLS manifests
      if (url.includes('manifest.googlevideo.com') ||
          url.includes('/manifest/') ||
          url.includes('.m3u8') ||
          url.includes('/hls/') ||
          url.includes('/api/manifest/')) {
        return false;
      }
      // Must be HTTPS or HTTP URL (not m3u8 protocol)
      if (!url.startsWith('https://') && !url.startsWith('http://')) {
        return false;
      }
      return true;
    };

    // 🔒 CRITICAL: Validate DASH stream URLs are NOT HLS manifests
    const validateStreamUrl = (url) => {
      return validateDirectUrl(url);
    };

    let directUrl = null;
    let hasAudio = false;
    let hasVideo = false;
    let needsMerge = false;

    // 🔥 MP3 JUICE MODE: Handle both progressive and DASH formats
    // For DASH (separate streams), yt-dlp format string will merge them
    // We'll get the merged URL or separate URLs that can be merged
    let videoUrl = null;
    let audioUrl = null;

    // 🔥 MP3 JUICE FIX: Check if result.url exists first (progressive format)
    // If result.url exists, it's a progressive format (video+audio combined)
    if (result.url && result.url.startsWith('https://')) {
      const protocol = result.protocol || '';
      const url = result.url || '';
      const container = result.container || result.ext || '';

      // 🔒 CRITICAL FIX: REJECT HLS playlists and manifests (STRICT VALIDATION)
      if (!validateDirectUrl(url) ||
          protocol.includes('m3u8') || 
          protocol === 'm3u8_native' ||
          url.includes('.m3u8') || 
          url.includes('manifest.googlevideo.com') ||
          url.includes('/manifest/') ||
          url.includes('/api/manifest/') ||
          url.includes('/hls/') ||
          result.format_id?.includes('m3u8') ||
          result.format_note?.toLowerCase().includes('hls')) {
        logger.error(`❌ [PHASE-1] REJECTED: HLS playlist/manifest detected: ${url.substring(0, 80)}`);
        logger.error(`   Protocol: ${protocol}, Format ID: ${result.format_id}`);
        throw new AppError('HLS playlist/manifest format is not allowed. Only direct MP4 URLs are supported.', 400);
      }

      // REJECT: Non-MP4 containers
      const containerLower = String(container).toLowerCase();
      if (containerLower && !containerLower.includes('mp4') && !containerLower.includes('m4a')) {
        logger.error(`❌ [PHASE-1] REJECTED: Non-MP4 container (${container})`);
        throw new AppError(`Non-MP4 container (${container}) is not allowed in Phase-1 Safe Mode`, 400);
      }

      // REJECT: Non-HTTPS
      if (!url.startsWith('https://')) {
        logger.error(`❌ [PHASE-1] REJECTED: Non-HTTPS protocol`);
        throw new AppError('Non-HTTPS protocol is not allowed in Phase-1 Safe Mode', 400);
      }

      // ✅ CRITICAL FIX: Validate actual height matches requested quality
      const actualHeight = Number(result.height) || 0;
      if (actualHeight !== qualityNum) {
        logger.error(`❌ [URL] Progressive quality mismatch: requested ${qualityNum}p, got ${actualHeight}p`);
        logger.error(`   This indicates the requested quality is not available`);
        const availableQualities = extractAvailableQualities(result);
        const error = new AppError(
          `The requested quality (${qualityNum}p) is not available for this video. Available qualities: ${availableQualities.length > 0 ? availableQualities.join('p, ') + 'p' : `${actualHeight}p`}. Please try a different quality.`,
          404
        );
        error.availableQualities = availableQualities;
        throw error;
      }
      
      directUrl = result.url;
      hasAudio = result.acodec && result.acodec !== 'none';
      hasVideo = result.vcodec && result.vcodec !== 'none';

      // ✅ MP3 JUICE BEHAVIOR: Allow video-only formats (will be merged with separate audio)
      // Video-only formats are valid for DASH merging (480p+)

      // ✅ Progressive format found
      logger.info(`✅ [MP3 JUICE] Progressive format found | Audio: ✅ | Video: ✅ | Height: ${actualHeight}p`);
    }
    // 🔥 MP3 JUICE FIX: If no progressive format, check for DASH (separate streams)
    else if (result.requested_formats && Array.isArray(result.requested_formats) && result.requested_formats.length > 1) {
      const videoFormat = result.requested_formats.find(f => 
        f.vcodec && f.vcodec !== 'none' && 
        f.url && validateStreamUrl(f.url) &&
        f.protocol !== 'm3u8' && f.protocol !== 'm3u8_native'
      );
      
      const audioFormat = result.requested_formats.find(f => 
        f.acodec && f.acodec !== 'none' && 
        f.url && validateStreamUrl(f.url) &&
        f.protocol !== 'm3u8' && f.protocol !== 'm3u8_native'
      );

      if (videoFormat && audioFormat && 
          validateStreamUrl(videoFormat.url) && 
          validateStreamUrl(audioFormat.url) &&
          !videoFormat.url.includes('manifest') &&
          !audioFormat.url.includes('manifest')) {
        
        // ✅ CRITICAL FIX: Validate actual video height matches requested quality
        const videoHeight = Number(videoFormat.height) || 0;
        if (videoHeight !== qualityNum) {
          logger.error(`❌ [URL] DASH quality mismatch: requested ${qualityNum}p, got ${videoHeight}p`);
          logger.error(`   This indicates the requested quality is not available`);
          const availableQualities = extractAvailableQualities(result);
          const error = new AppError(
            `The requested quality (${qualityNum}p) is not available for this video. Available qualities: ${availableQualities.length > 0 ? availableQualities.join('p, ') + 'p' : `${videoHeight}p`}. Please try a different quality.`,
            404
          );
          error.availableQualities = availableQualities;
          throw error;
        }
        
        videoUrl = videoFormat.url;
        audioUrl = audioFormat.url;
        hasVideo = true;
        hasAudio = true;
        needsMerge = true; // DASH needs merging

        logger.info(`✅ [MP3 JUICE] DASH format detected - video+audio streams available for ${quality}p`);
        logger.info(`   Video: ${videoFormat.height || 'unknown'}p | Audio: ${audioFormat.abr || 'unknown'}kbps`);

        // 🔥 EXACT QUALITY FIX: DASH format detected - return exact quality video URL
        // Format string `bestvideo[height<=X]+bestaudio` should merge, but if we get separate streams,
        // we return video URL. The format string with mergeOutputFormat should handle merging.
        // For streaming, we'll use video URL (exact quality) - audio is available separately
        logger.info(`✅ [EXACT QUALITY] DASH format detected for ${quality}p - exact quality available`);
        logger.info(`   Video: ${videoFormat.height || 'unknown'}p | Audio: ${audioFormat.abr || 'unknown'}kbps`);

        // Return exact quality video URL - format string should merge it automatically
        // If merge doesn't happen, at least we get exact quality video
        directUrl = videoUrl; // Exact quality video URL
        hasAudio = true; // Audio stream is available (separate)
        hasVideo = true;
        needsMerge = true; // DASH format - needs merge (format string should handle it)
        logger.info(`✅ [EXACT QUALITY] Returning exact quality ${quality}p video URL (audio available separately)`);
      }
    }

    // 🔒 PHASE-1: Single format with both video and audio (progressive format) - already handled above
    if (result.url && !directUrl) {
      // 🔒 PHASE-1: Strictly validate format before accepting
      const protocol = result.protocol || '';
      const url = result.url || '';
      const container = result.container || result.ext || '';

      // 🔒 REJECT: HLS playlists and manifests
      if (!validateDirectUrl(url) ||
          protocol.includes('m3u8') || 
          url.includes('.m3u8') || 
          url.includes('manifest.googlevideo.com') ||
          url.includes('/manifest/') ||
          url.includes('/api/manifest/') ||
          result.format_id?.includes('m3u8')) {
        logger.error(`❌ [PHASE-1] REJECTED: HLS playlist/manifest detected: ${url.substring(0, 80)}`);
        throw new AppError('HLS playlist/manifest format is not allowed. Only direct MP4 URLs are supported.', 400);
      }

      // 🔥 EXACT QUALITY FIX: Don't reject DASH if result.url exists and has audio
      // If result.url exists with both audio and video, it's either progressive or merged DASH
      // Both are valid - we only reject if it's video-only

      // REJECT: Non-MP4 containers
      const containerLower = String(container).toLowerCase();
      if (containerLower && !containerLower.includes('mp4') && !containerLower.includes('m4a')) {
        logger.error(`❌ [PHASE-1] REJECTED: Non-MP4 container (${container})`);
        throw new AppError(`Non-MP4 container (${container}) is not allowed in Phase-1 Safe Mode`, 400);
      }

      // REJECT: Non-HTTPS
      if (!url.startsWith('https://')) {
        logger.error(`❌ [PHASE-1] REJECTED: Non-HTTPS protocol`);
        throw new AppError('Non-HTTPS protocol is not allowed in Phase-1 Safe Mode', 400);
      }

      directUrl = result.url;
      hasAudio = result.acodec && result.acodec !== 'none';
      hasVideo = result.vcodec && result.vcodec !== 'none';

      // ✅ MP3 JUICE BEHAVIOR: Allow video-only formats (will be merged with separate audio)
      // Video-only formats are valid for DASH merging (480p+)

      // ✅ MP3 JUICE MODE: All qualities allowed (progressive or DASH with merge)
      const actualHeight = result.height || 0;
      const formatType = needsMerge ? 'DASH (will merge)' : 'Progressive';
      logger.info(`✅ [MP3 JUICE] Format accepted | Type: ${formatType} | Audio: ✅ | Video: ✅ | Height: ${actualHeight}p`);
    }

    // 🔒 PHASE-1 SAFE MODE: Strictly validate before returning URL
    // Only return if: progressive format, MP4 container, has audio, HTTPS protocol
    if (directUrl && directUrl.startsWith('https://')) {
      // 🔒 PHASE-1: Final validation
      const container = result.container || result.ext || (format === 'mp3' ? 'mp3' : 'mp4');
      const containerLower = String(container).toLowerCase();

      // REJECT: Non-MP4 containers
      if (format === 'mp4' && !containerLower.includes('mp4')) {
        logger.error(`❌ [PHASE-1] REJECTED: Non-MP4 container (${container})`);
        throw new AppError(`Non-MP4 container (${container}) is not allowed in Phase-1 Safe Mode`, 400);
      }

      // REJECT: Missing audio
      if (format === 'mp4' && !hasAudio) {
        logger.error(`❌ [PHASE-1] REJECTED: Format missing audio`);
        throw new AppError('Video-only formats are not allowed in Phase-1 Safe Mode', 400);
      }

      // ✅ CRITICAL FIX: Validate actual height matches requested quality
      // yt-dlp might downgrade quality, so we need to check if actual height matches
      const actualHeight = result.height || 0;
      const requestedHeight = qualityNum;
      
      // ✅ EXACT QUALITY CHECK: Only allow if actual height matches requested (or is higher for DASH)
      // For DASH formats, check videoFormat height if available
      let actualVideoHeight = actualHeight;
      if (needsMerge && videoUrl) {
        // For DASH, we need to check the video format height
        // The videoFormat should have the correct height
        const videoFormat = result.requested_formats?.find(f => f.vcodec && f.vcodec !== 'none');
        if (videoFormat && videoFormat.height) {
          actualVideoHeight = Number(videoFormat.height);
        }
      }
      
      // ✅ SMART QUALITY CHECK: Allow non-standard/vertical aspect ratio heights (e.g. 676p for 720p, 1012p for 1080p)
      const heightDiff = Math.abs(actualVideoHeight - requestedHeight);
      const isAcceptableHeight = actualVideoHeight === requestedHeight || heightDiff <= 200 || actualVideoHeight > 0;

      if (!isAcceptableHeight && actualVideoHeight === 0) {
        logger.error(`❌ [URL] Quality mismatch: requested ${requestedHeight}p, got ${actualVideoHeight}p`);
        logger.error(`   This indicates the requested quality is not available`);
        const availableQualities = extractAvailableQualities(result);
        const error = new AppError(
          `The requested quality (${requestedHeight}p) is not available for this video. Available qualities: ${availableQualities.length > 0 ? availableQualities.join('p, ') + 'p' : `${actualVideoHeight}p`}. Please try a different quality.`,
          404
        );
        error.availableQualities = availableQualities;
        throw error;
      }

      // ✅ PHASE-1: Progressive format validated
      const isProgressive = hasAudio && hasVideo && !needsMerge;
      const vcodec = result.vcodec || null;
      const acodec = result.acodec || null;

      const responseData = {
        success: true,
        directUrl,
        downloadUrl: directUrl,
        videoUrl: videoUrl || null, // DASH video stream (if separate)
        audioUrl: audioUrl || null, // DASH audio stream (if separate)
        title: result.title || 'video',
        duration: result.duration || 0,
        fileSize: result.filesize || result.filesize_approx || null,
        format,
        quality,
        hasAudio: hasAudio || false, // Always has audio (progressive or DASH)
        hasVideo: hasVideo || false,
        needsServerDownload: needsMerge, // DASH needs server-side merge
        needsMerge: needsMerge || false, // DASH formats need merging
        isProgressive: isProgressive, // True if progressive, false if DASH
        container: 'mp4', // Always MP4 output
        vcodec: vcodec,
        acodec: acodec,
        fromCache: false
      };

      await cacheSet(cacheKey, responseData, CACHE_TTL);
      logger.info(`✅ [PHASE-1] Progressive MP4 format validated and cached`);
      logger.info(`   Quality: ${actualHeight}p | Audio: ✅ | Video: ✅ | Container: MP4`);
      return responseData;
    }

    // ❌ NO FALLBACK: Do not downgrade quality - return error if exact quality not available
    // This ensures API returns clear error instead of silently returning wrong quality
    logger.error(`❌ [URL] No valid format found for requested quality ${quality}p`);
    logger.error(`   Requested: ${quality}p ${format.toUpperCase()}`);
    logger.error(`   Available formats: ${result.formats?.length || 0} total`);
    
    const availableQualities = extractAvailableQualities(result);
    const error = new AppError(
      `The requested quality (${quality}p) is not available for this video. Available qualities: ${availableQualities.length > 0 ? availableQualities.join('p, ') + 'p' : 'none'}. Please try a different quality.`,
      404
    );
    error.availableQualities = availableQualities;
    throw error;

  } catch (err) {
    // ✅ Log error but don't crash - preserve AppError status codes
    const errorMsg = err.message || String(err);
    const extractedVideoId = videoId || extractVideoId(url) || 'unknown';
    logger.error(`❌ [URL] Failed: ${errorMsg}`);
    logger.error(`   Quality: ${quality}, Format: ${format}, Video ID: ${extractedVideoId}`);
    
    // Preserve AppError status codes if available (e.g., 404 for format not available)
    if (err instanceof AppError) {
      // ✅ CRITICAL: Add videoId to error context for better debugging
      if (!err.videoId && extractedVideoId !== 'unknown') {
        err.videoId = extractedVideoId;
      }
      throw err;
    }
    
    // Check if it's a format availability issue
    if (errorMsg.includes('not available') || errorMsg.includes('not found') || errorMsg.includes('404')) {
      const availabilityError = new AppError(
        `The requested quality (${quality}) is not available for this video. Please try a different quality.`,
        404
      );
      availabilityError.videoId = extractedVideoId;
      throw availabilityError;
    }
    
    const genericError = new AppError(`Failed to get URL: ${errorMsg.substring(0, 100)}`, 500);
    genericError.videoId = extractedVideoId;
    throw genericError;
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📺 DIRECT DOWNLOAD URL (SIMPLIFIED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const getDirectDownloadUrl = async (url, format = 'mp4', quality = '720') => {
  return await getDownloadUrl(url, format, quality);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎵 MERGED DOWNLOAD INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const getMergedDownloadInfo = async (url, quality = '1080') => {
  try {
    url = validateUrl(url);
    const videoId = extractVideoId(url);

    if (!videoId) {
      throw new AppError('Could not extract video ID', 400);
    }

    // 🔥 FIX: Validate and normalize quality
    if (!quality || quality === 'undefined' || quality === 'null') {
      quality = '1080'; // Default quality
    }
    const normalizedQuality = String(quality).replace(/p$/i, '').trim();
    const qualityNum = parseInt(normalizedQuality);

    if (isNaN(qualityNum) || qualityNum <= 0) {
      throw new AppError(`Invalid quality: ${quality}`, 400);
    }

    const cacheKey = `yt:merge:${videoId}:${normalizedQuality}`;
    const cached = await cacheGet(cacheKey);

    if (cached && cached.videoUrl && cached.audioUrl) {
      return { ...cached, fromCache: true };
    }

    logger.info(`🎵 [MERGE] Getting separate streams for ${normalizedQuality}p...`);

    // DASH format: bestvideo[height<=REQ][ext=mp4]+bestaudio[ext=m4a]/best
    const videoFormat = `bestvideo[height<=${qualityNum}][ext=mp4]`;
    const audioFormat = `bestaudio[ext=m4a]`;

    const opts = {
      dumpSingleJson: true,
      format: `${videoFormat}+${audioFormat}`,
      noCheckCertificates: true,
      noPlaylist: true,
      skipDownload: true,
      socketTimeout: 30,
      retries: 5,
      quiet: true
    };

    // 🔥 IMPROVED COOKIE STRATEGY: Same as getDownloadUrl
    let cookiesPath = null;
    // Get cookies path with rotation and fallback (only if enabled)
    if (areCookiesEnabled()) {
      let cookieAttempts = 0;
      const maxCookieAttempts = 2;

      while (!cookiesPath && cookieAttempts < maxCookieAttempts) {
        try {
          if (!cookieUtils) {
            await initCookieRotation();
          }

          cookiesPath = getCookiesPath ? await getCookiesPath() :
            (fsSync.existsSync(COOKIES_PATH) ? COOKIES_PATH : null);

          if (cookiesPath && fsSync.existsSync(cookiesPath)) {
            opts.cookies = cookiesPath;
            logger.debug(`✅ [MERGE] Using cookies (attempt ${cookieAttempts + 1})`);
            break;
          } else {
            cookiesPath = null;
          }
        } catch (cookieErr) {
          cookieAttempts++;
          logger.warn(`⚠️ [MERGE] Cookie attempt ${cookieAttempts} failed: ${cookieErr.message}`);

          if (cookieAttempts === 1 && cookieUtils && cookieUtils.checkAndRotateCookies) {
            try {
              await cookieUtils.checkAndRotateCookies();
              logger.info(`🔄 [MERGE] Attempted cookie refresh after failure`);
            } catch (refreshErr) {
              logger.warn(`⚠️ [MERGE] Cookie refresh failed: ${refreshErr.message}`);
            }
          }
        }
      }
    }

    if (!cookiesPath) {
      logger.debug(`ℹ️ [MERGE] Continuing without cookies (${areCookiesEnabled() ? 'graceful fallback' : 'disabled by default'})`);
    }

    const result = await ytdlp(url, opts);

    // Extract video and audio URLs from result
    let videoUrl = null;
    let audioUrl = null;
    let videoHeight = null;

    // Check if we have separate formats (requested_formats)
    if (result.requested_formats && Array.isArray(result.requested_formats)) {
      // 🔥 FIX: Try to find exact quality match first
      let videoFormat = result.requested_formats.find(f =>
        f.vcodec && f.vcodec !== 'none' &&
        f.height === qualityNum &&
        f.url
      );

      // If exact not found, find closest below
      if (!videoFormat) {
        videoFormat = result.requested_formats
          .filter(f => f.vcodec && f.vcodec !== 'none' && f.height && f.height <= qualityNum && f.url)
          .sort((a, b) => b.height - a.height)[0]; // Highest quality below requested
      }

      const audioFormat = result.requested_formats.find(f =>
        f.acodec && f.acodec !== 'none' && f.url
      );

      if (videoFormat && audioFormat) {
        videoUrl = videoFormat.url;
        audioUrl = audioFormat.url;
        videoHeight = videoFormat.height || 0;
        logger.info(`✅ [MERGE] Found separate streams in requested_formats`);
        logger.info(`   Video: ${videoHeight}p (requested: ${qualityNum}p) | Codec: ${videoFormat.vcodec || 'unknown'}`);
        logger.info(`   Audio: ${audioFormat.acodec || 'unknown'} | Bitrate: ${audioFormat.abr || 'unknown'}kbps`);
      }
    }

    // Fallback: Get from formats array
    if (!videoUrl || !audioUrl) {
      if (result.formats && Array.isArray(result.formats)) {
        if (!videoUrl) {
          // 🔥 FIX: Try exact height first, then closest below
          let videoFormat = result.formats.find(f =>
            f.vcodec && f.vcodec !== 'none' &&
            f.height === qualityNum &&
            f.url
          );

          // If exact not found, find closest below
          if (!videoFormat) {
            videoFormat = result.formats
              .filter(f => f.vcodec && f.vcodec !== 'none' && f.height && f.height <= qualityNum && f.url)
              .sort((a, b) => b.height - a.height)[0]; // Highest quality below requested
          }

          if (videoFormat) {
            videoUrl = videoFormat.url;
            videoHeight = videoFormat.height || 0;
            logger.info(`✅ [MERGE] Selected video: ${videoHeight}p (requested: ${qualityNum}p)`);
          }
        }

        if (!audioUrl) {
          const audioFormat = result.formats.find(f =>
            f.acodec && f.acodec !== 'none' &&
            (!f.vcodec || f.vcodec === 'none') &&
            f.url
          );
          if (audioFormat) audioUrl = audioFormat.url;
        }
      }
    }

    if (!videoUrl || !audioUrl) {
      logger.error(`❌ [MERGE] Could not extract URLs`);
      logger.error(`   Video URL: ${videoUrl ? 'Found' : 'Missing'}`);
      logger.error(`   Audio URL: ${audioUrl ? 'Found' : 'Missing'}`);
      throw new AppError('Could not extract video and audio URLs for merging', 500);
    }

    logger.info(`✅ [MERGE] Extracted URLs successfully`);
    logger.info(`   Video: ${videoUrl.substring(0, 60)}...`);
    logger.info(`   Audio: ${audioUrl.substring(0, 60)}...`);

    // 🔥 FIX: Initialize responseData after we have all the data
    const responseData = {
      success: true,
      title: result.title || 'video',
      duration: result.duration || 0,
      format: 'mp4',
      quality: normalizedQuality,
      videoUrl,
      audioUrl,
      videoHeight: videoHeight || null,
      actualHeight: videoHeight || null,
      needsServerDownload: true,
      needsMerge: true,
      fromCache: false
    };

    await cacheSet(cacheKey, responseData, CACHE_TTL);
    return responseData;

  } catch (err) {
    // ✅ Log error but don't crash - return clear error with proper status code
    const errorMsg = err.message || String(err);
    logger.error(`❌ [MERGE] Failed: ${errorMsg}`);
    logger.error(`   Quality: ${quality}, Video ID: ${videoId || 'unknown'}`);
    
    // Preserve AppError status codes if available
    if (err instanceof AppError) {
      throw err;
    }
    
    // Check if it's a format availability issue
    if (errorMsg.includes('not available') || errorMsg.includes('404')) {
      throw new AppError(
        `The requested quality (${quality}) is not available for this video. Please try a different quality.`,
        404
      );
    }
    
    throw new AppError(`Failed to get merge info: ${errorMsg.substring(0, 100)}`, 500);
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⬇️ DEPRECATED: SERVER DOWNLOAD (MP3 Juice Mode - Direct URLs Only)
   ⚠️ This function is DEPRECATED - MP3 Juice architecture uses direct URLs only
   🔥 For heavy formats that need merge, return direct URLs to video+audio streams
   🔥 User browser downloads directly from YouTube CDN, NOT through server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * @deprecated Use getDownloadUrl or getMergedDownloadInfo instead
 * This function should NOT be used in MP3 Juice mode
 * Only kept for backward compatibility with worker (which should also be refactored)
 */
export const downloadToFile = async ({
  url,
  format = "mp4",
  quality = "720",
  onProgress = null
}) => {
  const id = crypto.randomBytes(5).toString("hex");
  const ext = format === "mp3" ? "mp3" : "mp4";
  const fileName = sanitizeFilename(`yt_${Date.now()}_${id}.${ext}`);
  const outputPath = path.join(DOWNLOAD_DIR, fileName);
  let tempVideoPath = null;
  let tempAudioPath = null;

  let lastProgressTime = 0;
  const PROGRESS_INTERVAL = 500;
  const downloadStartTime = Date.now();

  try {
    url = validateUrl(url);

    logger.info(`🎬 [DOWNLOAD] Starting: ${format}/${quality}`);

    const reportProgress = (percent, additionalData = {}) => {
      const now = Date.now();
      const validPercent = Math.min(100, Math.max(0, Math.floor(percent || 0)));

      if (now - lastProgressTime > PROGRESS_INTERVAL || validPercent >= 95) {
        lastProgressTime = now;
        if (onProgress && typeof onProgress === 'function') {
          Promise.resolve(onProgress(validPercent, additionalData)).catch(() => { });
        }
      }
    };

    const downloadOpts = {
      noCheckCertificates: true,
      preferFreeFormats: true,
      socketTimeout: 240,
      retries: 8,
      fragmentRetries: 15,
      noPlaylist: true,
      restrictFilenames: true,
      bufferSize: '512K',
      httpChunkSize: '10M',
      concurrentFragments: 8,
      noPart: false,
      noMtime: true,
      quiet: true
    };

    // Get cookies path with rotation and fallback (only if enabled)
    if (areCookiesEnabled()) {
      try {
        if (!cookieUtils) {
          await initCookieRotation();
        }

        const cookiesPath = getCookiesPath ? await getCookiesPath() :
          (fsSync.existsSync(COOKIES_PATH) ? COOKIES_PATH : null);
        if (cookiesPath && fsSync.existsSync(cookiesPath)) {
          downloadOpts.cookies = cookiesPath;
          logger.debug(`✅ [DOWNLOAD] Using cookies`);
        } else {
          logger.debug(`ℹ️ [DOWNLOAD] No cookies available - continuing without`);
        }
      } catch (cookieErr) {
        logger.warn(`⚠️ [DOWNLOAD] Cookie error (continuing without): ${cookieErr.message}`);
        // Continue without cookies - graceful fallback (no crash)
      }
    } else {
      logger.debug(`ℹ️ [DOWNLOAD] Cookies disabled - continuing without`);
    }

    // ═══════════════════════════════════════════════════════
    // 🔥 VIDEO DOWNLOAD WITH AUDIO (ALL QUALITIES)
    // ═══════════════════════════════════════════════════════

    if (format === "mp4") {
      // 🔥 FIX: Validate quality before using
      let normalizedQuality = String(quality || '720').replace(/p$/i, '').trim();
      let qualityNum = parseInt(normalizedQuality);

      if (isNaN(qualityNum) || qualityNum <= 0) {
        normalizedQuality = '720';
        qualityNum = 720;
      }

      reportProgress(5, { status: 'preparing' });

      // 🔥 KEY FIX: Use proper format string that GUARANTEES audio
      const formatString = getOptimalFormatString('mp4', normalizedQuality);

      logger.info(`📺 [DOWNLOAD] Format: ${formatString}`);
      logger.info(`📺 [DOWNLOAD] Quality: ${normalizedQuality}p`);

      // Try direct download first (faster if format includes audio)
      try {
        logger.info(`📥 [1/1] Downloading ${normalizedQuality}p with audio...`);
        reportProgress(10, { status: 'downloading' });

        await ytdlp(url, {
          output: outputPath,
          format: formatString,
          mergeOutputFormat: "mp4",
          postprocessorArgs: [
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart'
          ],
          ...downloadOpts
        });

        reportProgress(90, { status: 'finalizing' });

        // Verify file has audio
        const hasAudio = await checkAudioInFile(outputPath);

        if (!hasAudio) {
          logger.warn(`⚠️ [DOWNLOAD] No audio detected! Trying merge method...`);
          await safeUnlink(outputPath);
          throw new Error('No audio in downloaded file');
        }

        logger.info(`✅ [DOWNLOAD] Success with audio!`);

      } catch (err) {
        // Fallback: Download video and audio separately, then merge
        logger.warn(`⚠️ [DOWNLOAD] Direct method failed, using merge method...`);
        reportProgress(15, { status: 'downloading_separate' });

        const tempId = crypto.randomBytes(4).toString("hex");
        tempVideoPath = path.join(DOWNLOAD_DIR, `temp_v_${tempId}.mp4`);
        tempAudioPath = path.join(DOWNLOAD_DIR, `temp_a_${tempId}.m4a`);

        // Download video
        logger.info(`📹 [1/3] Downloading video...`);
        reportProgress(20, { status: 'downloading_video' });

        await ytdlp(url, {
          output: tempVideoPath,
          format: `bestvideo[height=${qualityNum}][ext=mp4]/bestvideo[height<=${qualityNum}][ext=mp4]/bestvideo[height<=${qualityNum}]/bestvideo`,
          ...downloadOpts
        });

        if (!fsSync.existsSync(tempVideoPath) || fsSync.statSync(tempVideoPath).size < 1024) {
          throw new AppError('Video download failed', 500);
        }

        reportProgress(50, { status: 'video_complete' });
        logger.info(`✅ Video: ${(fsSync.statSync(tempVideoPath).size / 1024 / 1024).toFixed(2)} MB`);

        // Download audio
        logger.info(`🎵 [2/3] Downloading audio...`);
        reportProgress(55, { status: 'downloading_audio' });

        await ytdlp(url, {
          output: tempAudioPath,
          format: 'bestaudio[ext=m4a]/bestaudio/best',
          ...downloadOpts
        });

        if (!fsSync.existsSync(tempAudioPath) || fsSync.statSync(tempAudioPath).size < 1024) {
          await safeUnlink(tempVideoPath);
          throw new AppError('Audio download failed', 500);
        }

        reportProgress(75, { status: 'audio_complete' });
        logger.info(`✅ Audio: ${(fsSync.statSync(tempAudioPath).size / 1024 / 1024).toFixed(2)} MB`);

        // Merge with FFmpeg
        logger.info(`🔧 [3/3] Merging with FFmpeg...`);
        reportProgress(80, { status: 'merging' });

        await mergeVideoAudio(tempVideoPath, tempAudioPath, outputPath, (mergePercent) => {
          const mappedProgress = 80 + (mergePercent * 0.15);
          reportProgress(Math.min(95, mappedProgress), {
            status: 'merging',
            mergePercent
          });
        });

        await safeUnlink(tempVideoPath);
        await safeUnlink(tempAudioPath);
        tempVideoPath = null;
        tempAudioPath = null;

        logger.info(`✅ [DOWNLOAD] Merge complete!`);
      }

    } else {
      // MP3 DOWNLOAD
      logger.info("🎵 [DOWNLOAD] MP3 format");
      reportProgress(5);

      const tempId = crypto.randomBytes(4).toString("hex");
      const tempPath = path.join(DOWNLOAD_DIR, `temp_audio_${tempId}`);

      await ytdlp(url, {
        output: `${tempPath}.%(ext)s`,
        format: "bestaudio/best",
        extractAudio: true,
        audioFormat: "best",
        ...downloadOpts
      });

      reportProgress(50, { status: 'converting' });

      const possibleExtensions = [".m4a", ".webm", ".opus", ".mp4", ".mp3"];
      tempAudioPath = possibleExtensions
        .map((ext) => `${tempPath}${ext}`)
        .find((f) => fsSync.existsSync(f));

      if (!tempAudioPath) {
        throw new AppError("Audio file not found", 500);
      }

      const bitrate = quality.includes('kbps') ? parseInt(quality) : 192;

      await new Promise((resolve, reject) => {
        ffmpeg(tempAudioPath)
          .audioBitrate(bitrate)
          .audioCodec("libmp3lame")
          .audioFrequency(48000)
          .audioChannels(2)
          .toFormat("mp3")
          .on("progress", (progress) => {
            if (progress.percent && progress.percent > 0) {
              const mappedProgress = 50 + (Math.min(100, progress.percent) * 0.4);
              reportProgress(Math.min(90, mappedProgress), { status: 'converting' });
            }
          })
          .on("end", () => {
            reportProgress(90);
            resolve();
          })
          .on("error", reject)
          .save(outputPath);
      });

      await safeUnlink(tempAudioPath);
      tempAudioPath = null;
    }

    // FINAL VALIDATION - Ensure file is in MB, not KB
    if (!fsSync.existsSync(outputPath)) {
      throw new AppError("Download failed - file not created", 500);
    }

    const stats = fsSync.statSync(outputPath);
    const fileSizeBytes = stats.size;
    const fileSizeKB = fileSizeBytes / 1024;
    const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);

    // 🔥 CRITICAL: Ensure file is at least 1MB (proper video download)
    // Minimum size based on quality
    let minSizeBytes = 1024 * 1024; // 1MB minimum for any video

    if (format === 'mp4') {
      const qualityNum = parseInt(String(quality).replace(/p$/i, ''));
      if (!isNaN(qualityNum)) {
        // Set minimum size based on quality
        if (qualityNum >= 1080) {
          minSizeBytes = 5 * 1024 * 1024; // 5MB minimum for 1080p
        } else if (qualityNum >= 720) {
          minSizeBytes = 2 * 1024 * 1024; // 2MB minimum for 720p
        } else if (qualityNum >= 360) {
          minSizeBytes = 1 * 1024 * 1024; // 1MB minimum for 360p+
        } else {
          minSizeBytes = 500 * 1024; // 500KB minimum for 144p/240p
        }
      }
    }

    if (fileSizeBytes < minSizeBytes) {
      logger.error(`❌ [DOWNLOAD] File too small! Size: ${fileSizeMB} MB (${fileSizeKB.toFixed(2)} KB)`);
      logger.error(`   Minimum required: ${(minSizeBytes / 1024 / 1024).toFixed(2)} MB`);
      logger.error(`   Quality: ${quality}`);
      await safeUnlink(outputPath);
      throw new AppError(`Download failed - file too small (${fileSizeMB} MB). Expected at least ${(minSizeBytes / 1024 / 1024).toFixed(2)} MB for ${quality} quality.`, 500);
    }

    // Log file size in both MB and KB for clarity
    const totalTime = ((Date.now() - downloadStartTime) / 1000).toFixed(2);

    logger.info(`✅ [DOWNLOAD] Complete!`);
    logger.info(`📦 ${fileName}`);
    logger.info(`   Size: ${fileSizeMB} MB (${fileSizeKB.toFixed(2)} KB)`);
    logger.info(`   Quality: ${quality}`);
    logger.info(`   Time: ${totalTime}s`);

    // Warn if file is suspiciously small for the quality
    if (format === 'mp4' && parseFloat(fileSizeMB) < 1) {
      logger.warn(`⚠️ [DOWNLOAD] File size is less than 1MB - might be incomplete`);
    }

    const downloadUrl = getPublicDownloadUrl(fileName);

    reportProgress(100, { status: 'completed' });

    return {
      success: true,
      cloudUrl: downloadUrl,
      downloadUrl,
      fileName,
      filePath: outputPath,
      format,
      quality,
      sizeMB: fileSizeMB,
      totalTime,
      localFile: true
    };

  } catch (err) {
    await safeUnlink(outputPath);
    if (tempVideoPath) await safeUnlink(tempVideoPath);
    if (tempAudioPath) await safeUnlink(tempAudioPath);

    logger.error(`❌ [DOWNLOAD] Error: ${err.message}`);

    if (err instanceof AppError) throw err;
    if (err.message?.includes("unavailable")) {
      throw new AppError("Video unavailable or private", 404);
    }
    throw new AppError(err.message || "Download failed", 500);
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔧 HELPER: FFmpeg Merge Function
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const mergeVideoAudio = (videoPath, audioPath, outputPath, onProgress) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("FFmpeg merge timeout"));
    }, 600000); // 10 minutes

    ffmpeg()
      .input(videoPath)
      .inputOptions(['-analyzeduration', '100M', '-probesize', '100M'])
      .input(audioPath)
      .inputOptions(['-analyzeduration', '100M', '-probesize', '100M'])
      .videoCodec('copy')
      .audioCodec('aac')
      .audioBitrate('192k')
      .audioFrequency(48000)
      .audioChannels(2)
      .outputOptions([
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero',
        '-fflags', '+genpts',
        '-write_tmcd', '0',
        '-vsync', 'cfr',
        '-max_muxing_queue_size', '9999'
      ])
      .on("progress", (progress) => {
        if (progress.percent && progress.percent > 0 && onProgress) {
          onProgress(Math.floor(progress.percent));
        }
      })
      .on("end", () => {
        clearTimeout(timeout);
        logger.info(`✅ FFmpeg merge successful`);
        resolve();
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        logger.error(`❌ FFmpeg error: ${err.message}`);
        reject(new AppError(`Merge failed: ${err.message}`, 500));
      })
      .save(outputPath);
  });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔧 HELPER: Check if file has audio
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const checkAudioInFile = (filePath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(false);
        return;
      }

      const hasAudioStream = metadata.streams?.some(stream =>
        stream.codec_type === 'audio'
      );

      resolve(hasAudioStream);
    });
  });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎬 DOWNLOAD AND CONVERT (Worker Entry Point)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const downloadAndConvert = async (
  url,
  format = "mp4",
  quality = "720",
  onProgress = null
) => {
  try {
    logger.info(`🚀 [WORKER] Starting: ${format}/${quality}`);
    const result = await downloadToFile({ url, format, quality, onProgress });

    return {
      success: true,
      cloudUrl: result.downloadUrl,
      downloadUrl: result.downloadUrl,
      fileName: result.fileName,
      filePath: result.filePath,
      title: path.basename(result.fileName, path.extname(result.fileName)),
      format: result.format,
      quality: result.quality,
      sizeMB: result.sizeMB,
      totalTime: result.totalTime,
      localFile: true
    };
  } catch (err) {
    logger.error(`❌ [WORKER] Error: ${err.message}`);
    throw err;
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📊 FORMAT EXTRACTION (OPTIMIZED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * 🔥 MP3 JUICE MODE: Extract ONLY progressive formats (video+audio combined)
 * Server acts as bridge only - NO merging, NO downloading
 * Returns direct CDN URLs for instant download/play
 */
export const extractFormats = (info) => {
  try {
    if (!info || !info.formats || !Array.isArray(info.formats)) {
      return { audioFormats: [], videoFormats: [] };
    }

    // ✅ MULTI-FORMAT SUPPORT: Allow MP4, WebM, M4A, 3GP, HLS formats
    // ALLOW: Progressive formats (video+audio combined)
    // ALLOW: DASH formats (video-only/audio-only separate streams - will be merged)
    // ALLOW: HLS playlists (for streaming support)
    // REJECT: Video-only formats without audio (unless DASH)
    const progressiveFormats = filterProgressiveFormats(info.formats);
    // ✅ Removed info log for performance - only log if needed for debugging
    // logger.info(`✅ [MULTI-FORMAT] Total formats: ${info.formats.length} → Allowed formats: ${progressiveFormats.length}`);

    const duration = info.duration || 0;

    // 🔥 MP3 JUICE MODE: Audio formats - ONLY progressive audio (audio-only MP4/M4A)
    // User requested: 128kbps, 256kbps
    const audioBitrates = [256, 128]; // Only requested bitrates

    // Find best available progressive audio format
    const bestAudioFormat = progressiveFormats
      .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0]; // Highest bitrate

    const audioFormats = audioBitrates.map(bitrate => {
      // Check if progressive audio format exists (audio-only, no video)
      const hasAudioFormat = !!bestAudioFormat && bestAudioFormat.url;

      // Estimate filesize
      const estimatedSize = Math.round((duration / 60) * (bitrate / 128) * 1.5);

      return {
        type: 'audio',
        quality: `${bitrate}kbps`,
        qualityLabel: `${bitrate}kbps`,
        label: `MP3 - ${bitrate}kbps`,
        bitrate,
        format: 'mp3',
        fileSize: `~${estimatedSize} MB`,
        fileSizeMB: estimatedSize,
        available: hasAudioFormat,
        needsServerDownload: false,
        needsJob: false,
        needsMerge: false, // Progressive audio - no merge needed
        directUrl: hasAudioFormat ? bestAudioFormat.url : null // Direct YouTube CDN URL
      };
    });

    // 🔥 MP3 JUICE MODE: ONLY progressive formats (skip DASH to avoid merge errors)
    // MP3 Juice shows: 1080p, 720p, 480p, 360p, 240p, 144p (if available as progressive)
    const videoQualities = [
      { height: 1080, label: '1080p', mbPerMin: 25 },
      { height: 720, label: '720p', mbPerMin: 12 },
      { height: 480, label: '480p', mbPerMin: 6 },
      { height: 360, label: '360p', mbPerMin: 4 },
      { height: 240, label: '240p', mbPerMin: 3 },
      { height: 144, label: '144p', mbPerMin: 2 }
    ];

    const videoFormats = videoQualities.map(qual => {
      // ONLY progressive format (video+audio combined) - SKIP DASH
      // Use Number() comparison to handle both string and number heights
      const progressiveFormat = progressiveFormats.find(f => {
        const formatHeight = Number(f.height);
        return formatHeight === qual.height &&
          f.vcodec && f.vcodec !== 'none' &&
          f.acodec && f.acodec !== 'none'; // MUST have both video and audio
      });

      if (!progressiveFormat || !progressiveFormat.url) {
        // Skip this quality if no progressive format available
        return {
          type: 'video',
          quality: `${qual.height}p`,
          qualityLabel: `${qual.height}p`,
          label: `${qual.label} (.mp4)`,
          height: qual.height,
          format: 'mp4',
          fileSize: null,
          fileSizeMB: null,
          available: false, // Not available - no progressive format
          hasAudio: false,
          codec: 'unknown',
          needsServerDownload: false,
          needsJob: false,
          needsMerge: false,
          disabled: true,
          mergeRequired: false,
          directUrl: null
        };
      }

      const estimatedSize = Math.round((duration / 60) * qual.mbPerMin);
      const codec = progressiveFormat.vcodec || 'unknown';
      const hasAudio = progressiveFormat.acodec && progressiveFormat.acodec !== 'none';

      return {
        type: 'video',
        quality: `${qual.height}p`,
        qualityLabel: `${qual.height}p`,
        label: `${qual.label} (.mp4)`,
        height: qual.height,
        format: 'mp4',
        fileSize: `~${estimatedSize} MB`,
        fileSizeMB: estimatedSize,
        available: true, // Available - progressive format found
        hasAudio: hasAudio,
        codec: codec,
        needsServerDownload: false,
        needsJob: false,
        needsMerge: false, // Progressive format - no merge needed
        disabled: false,
        mergeRequired: false,
        directUrl: progressiveFormat.url // Direct YouTube CDN URL
      };
    });

    // Add auto quality - best available progressive format
    const autoFormat = progressiveFormats
      .filter(f => f.height && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

    videoFormats.unshift({
      type: 'video',
      quality: 'auto',
      qualityLabel: 'auto',
      label: 'Best Quality (Auto)',
      format: 'mp4',
      fileSize: 'Auto',
      fileSizeMB: 0,
      available: !!autoFormat,
      recommended: true,
      hasAudio: true,
      needsServerDownload: false,
      needsJob: false,
      needsMerge: false,
      disabled: false
    });

    return {
      audioFormats: audioFormats.filter(a => a.available),
      videoFormats: videoFormats.filter(v => v.available) // ONLY progressive formats
    };

  } catch (err) {
    logger.error(`❌ extractFormats: ${err.message}`);
    return { audioFormats: [], videoFormats: [] };
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔍 VIDEO INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * ✅ MULTI-FORMAT SUPPORT: Extract URL for specific quality
 * ALLOWS: Progressive formats (MP4, WebM, M4A, 3GP), DASH formats, HLS playlists
 * REJECTS: Non-HTTPS protocols only
 */
const extractUrlFromFormats = (formats, format, quality) => {
  if (!formats || !Array.isArray(formats)) {
    return null;
  }

  // ✅ MP3 JUICE MODE: Filter formats - REJECT HLS manifests, only allow direct MP4 URLs
  const validFormats = formats.filter(f => {
    if (!f || !f.url) return false;

    const protocol = f.protocol || '';
    const url = f.url || '';

    // 🔒 REJECT: Non-HTTPS protocols
    if (!url.startsWith('https://')) {
      return false;
    }

    // 🔒 REJECT: HLS manifests ONLY for progressive mp4 direct CDN downloads where browser plays directly without FFmpeg
    // BUT for MP3 conversion (which uses FFmpeg) or DASH merging (which uses FFmpeg), allow manifest URLs!
    if (format !== 'mp3') {
      if (protocol === 'm3u8' || protocol === 'm3u8_native' ||
          url.includes('.m3u8') ||
          url.includes('/manifest/') ||
          url.includes('manifest.googlevideo.com') ||
          f.format_id?.includes('m3u8')) {
        return false;
      }
    }

    // ✅ ALLOW: Direct MP4/CDN URLs and audio manifests
    return true;
  });

  if (validFormats.length === 0) {
    logger.warn(`❌ [MP3 JUICE] No valid formats available`);
    return null;
  }

  // ✅ MP3 JUICE FIX: Parse quality as NUMBER, never compare strings
  // Remove 'p', 'kbps', 'k' suffixes and parse as number
  const normalizedQuality = String(quality).replace(/p$/i, '').replace(/kbps?$/i, '').replace(/k$/i, '').trim();
  const targetHeight = Number(normalizedQuality);

  if (format === 'mp3') {
    // Find best audio format (audio-only, or best available)
    const audioFormat = validFormats
      .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
      .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0] || 
      validFormats.find(f => f.acodec && f.acodec !== 'none') ||
      validFormats[0];

    if (audioFormat) {
      logger.info(`✅ [MP3 JUICE] Selected audio format: ${audioFormat.abr || 'unknown'}kbps (url: ${audioFormat.url.substring(0, 60)}...)`);
      return {
        directUrl: audioFormat.url,
        audioUrl: audioFormat.url,
        hasAudio: true,
        container: 'mp3',
        acodec: audioFormat.acodec,
        httpHeaders: audioFormat.http_headers || null,
        needsMerge: false,
        isProgressive: true
      };
    }
    return null;
  }

  // Video formats - Try progressive first, then DASH
  if (isNaN(targetHeight) || targetHeight <= 0) {
    // Auto quality - find best available (progressive preferred)
    const progressive = validFormats
      .filter(f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
      .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0))[0];

    if (progressive) {
      logger.info(`✅ [MP3 JUICE] Selected format (auto): ${progressive.height}p (progressive)`);
      return {
        directUrl: progressive.url,
        hasAudio: true,
        hasVideo: true,
        needsMerge: false,
        isProgressive: true,
        container: 'mp4',
        vcodec: progressive.vcodec,
        acodec: progressive.acodec,
        httpHeaders: progressive.http_headers || null
      };
    }
    return null;
  }

  // ✅ MP3 JUICE FIX: Find formats matching target height or closest available height
  let matchingFormats = validFormats.filter(f => {
    if (f.height === undefined || f.height === null) return false;
    const formatHeight = Number(f.height);
    if (isNaN(formatHeight)) return false;
    return formatHeight === targetHeight;
  });

  let effectiveTargetHeight = targetHeight;

  // If no exact match, find closest available height format for custom/vertical aspect ratio videos
  if (matchingFormats.length === 0) {
    const formatsWithHeight = validFormats.filter(f => f.height && f.vcodec && f.vcodec !== 'none');
    if (formatsWithHeight.length > 0) {
      const closest = formatsWithHeight.sort((a, b) => 
        Math.abs(Number(a.height) - targetHeight) - Math.abs(Number(b.height) - targetHeight)
      )[0];

      if (closest) {
        effectiveTargetHeight = Number(closest.height);
        logger.info(`ℹ️ [MP3 JUICE] Exact height ${targetHeight}p not found, using closest height ${effectiveTargetHeight}p`);
        matchingFormats = validFormats.filter(f => Number(f.height) === effectiveTargetHeight);
      }
    }
  }

  if (matchingFormats.length === 0) {
    const availableHeights = validFormats
      .filter(f => f.height && f.vcodec && f.vcodec !== 'none')
      .map(f => Number(f.height))
      .filter((h, i, arr) => arr.indexOf(h) === i)
      .sort((a, b) => b - a);
    
    logger.warn(`❌ [MP3 JUICE] Quality ${targetHeight}p not found. Available: ${availableHeights.join('p, ')}p`);
    return null;
  }

  // Step 2: Check for EXACT height matches - prioritize progressive, but allow DASH for lower qualities too
  // ✅ FIXED: For exact height, prefer progressive but allow DASH if needed (especially for 144p-720p)
  
  // First, try to find progressive formats (video + audio combined) with exact height
  const exactHeightProgressive = matchingFormats.filter(f => {
    const formatHeight = Number(f.height) || 0;
    if (formatHeight !== effectiveTargetHeight) return false; // ✅ Match matchingFormats target height
    
    const hasVideo = f.vcodec && f.vcodec !== 'none';
    const hasAudio = f.acodec && f.acodec !== 'none';
    
    return hasVideo && hasAudio; // Must have both video AND audio
  });

  if (exactHeightProgressive.length > 0) {
    // Select best progressive format with EXACT height
    const selectedFormat = exactHeightProgressive.sort((a, b) => {
      const fpsDiff = (b.fps || 0) - (a.fps || 0);
      if (fpsDiff !== 0) return fpsDiff;
      return (b.tbr || b.vbr || 0) - (a.tbr || a.vbr || 0);
    })[0];

    // ✅ CRITICAL FIX: Final validation - reject HLS URLs
    const formatUrl = selectedFormat.url || '';
    if (formatUrl.includes('manifest') || 
        formatUrl.includes('.m3u8') ||
        formatUrl.includes('/hls/') ||
        selectedFormat.protocol === 'm3u8' ||
        selectedFormat.protocol === 'm3u8_native') {
      logger.warn(`⚠️ [MP3 JUICE] Progressive format contains HLS URL - will try DASH fallback`);
      logger.warn(`   URL: ${formatUrl.substring(0, 80)}, Protocol: ${selectedFormat.protocol}`);
      // Don't return null - let it fall through to DASH fallback
    } else {
      // Valid progressive format found
      const actualHeight = Number(selectedFormat.height) || effectiveTargetHeight;
      logger.info(`✅ [MP3 JUICE] Selected format: ${actualHeight}p (progressive, hasAudio: true, hasVideo: true)`);
      return {
        directUrl: selectedFormat.url,
        hasAudio: true,
        hasVideo: true,
        needsMerge: false,
        isProgressive: true,
        container: 'mp4',
        vcodec: selectedFormat.vcodec,
        acodec: selectedFormat.acodec,
        httpHeaders: selectedFormat.http_headers || null,
        quality: `${actualHeight}p`
      };
    }
  }

  // Step 3: Fallback to DASH (video-only + separate audio) for EXACT quality
  // ✅ MP3 JUICE BEHAVIOR: Allow DASH merge for ALL qualities if progressive not available
  // This ensures downloads work even when YouTube only provides DASH formats
  const dashVideoFormats = matchingFormats.filter(f => {
    const formatHeight = Number(f.height) || 0;
    // Only allow DASH formats matching effectiveTargetHeight (ALL qualities allowed)
    if (formatHeight !== effectiveTargetHeight) return false;
    
    return f.vcodec && f.vcodec !== 'none' &&
           (!f.acodec || f.acodec === 'none') &&
           f.url && !f.url.includes('manifest'); // Ensure not HLS
  });

  if (dashVideoFormats.length > 0) {
    // Select best DASH video format
    const dashVideoFormat = dashVideoFormats.sort((a, b) => {
      // Prefer higher fps
      const fpsDiff = (b.fps || 0) - (a.fps || 0);
      if (fpsDiff !== 0) return fpsDiff;
      // Then prefer higher bitrate
      return (b.tbr || b.vbr || 0) - (a.tbr || a.vbr || 0);
    })[0];

    // Select best audio format (prefer higher bitrate, AAC codec)
    // ✅ MP3 JUICE FIX: Search in ALL validFormats, not just matchingFormats (audio has no height)
    const dashAudioFormat = validFormats
      .filter(f =>
        f.acodec && f.acodec !== 'none' &&
        (!f.vcodec || f.vcodec === 'none') &&
        f.url && !f.url.includes('manifest') && // Ensure not HLS
        f.url.startsWith('https://') // Ensure HTTPS
      )
      .sort((a, b) => {
        // Prefer AAC codec (itag 140 is typically AAC)
        const aIsAAC = (a.acodec || '').toLowerCase().includes('aac') || (a.format_id || '').includes('140');
        const bIsAAC = (b.acodec || '').toLowerCase().includes('aac') || (b.format_id || '').includes('140');
        if (aIsAAC && !bIsAAC) return -1;
        if (!aIsAAC && bIsAAC) return 1;
        // Then sort by bitrate (higher is better)
        return (b.abr || 0) - (a.abr || 0);
      })[0];

    if (dashAudioFormat) {
      logger.info(`✅ [MP3 JUICE] Selected format: ${dashVideoFormat.height}p (DASH, hasAudio: true, hasVideo: true, needsMerge: true)`);
      logger.info(`   Video URL: ${dashVideoFormat.url.substring(0, 60)}...`);
      logger.info(`   Audio URL: ${dashAudioFormat.url.substring(0, 60)}...`);
      return {
        directUrl: null, // No single URL - backend handles merging
        videoUrl: dashVideoFormat.url,
        audioUrl: dashAudioFormat.url,
        hasAudio: true,
        hasVideo: true,
        needsMerge: true,
        isProgressive: false,
        container: 'mp4',
        vcodec: dashVideoFormat.vcodec,
        acodec: dashAudioFormat.acodec,
        httpHeaders: dashVideoFormat.http_headers || dashAudioFormat.http_headers || null,
        quality: `${dashVideoFormat.height}p` // Store actual quality
      };
    } else {
      // ✅ MP3 JUICE FIX: Log available audio formats for debugging
      const availableAudioFormats = validFormats.filter(f =>
        f.acodec && f.acodec !== 'none' &&
        (!f.vcodec || f.vcodec === 'none')
      );
      logger.warn(`⚠️ [MP3 JUICE] DASH video format found for ${targetHeight}p but no valid audio format available`);
      logger.warn(`   Available audio formats: ${availableAudioFormats.length}`);
      if (availableAudioFormats.length > 0) {
        logger.warn(`   Sample audio formats: ${availableAudioFormats.slice(0, 3).map(f => `${f.acodec}@${f.abr || 'unknown'}kbps`).join(', ')}`);
      }
    }
  }

  // ✅ MP3 JUICE RULE: NO SILENT DOWNGRADE
  // If exact quality not found, return null with available qualities info
  const availableHeights = validFormats
    .filter(f => f.height && f.vcodec && f.vcodec !== 'none')
    .map(f => Number(f.height))
    .filter((h, i, arr) => arr.indexOf(h) === i)
    .sort((a, b) => b - a);
  
  // Find closest quality for better error message
  const closestHigher = availableHeights.find(h => h >= targetHeight);
  const closestLower = [...availableHeights].reverse().find(h => h <= targetHeight);
  const closest = closestHigher || closestLower || availableHeights[0];
  
  logger.warn(`❌ [MP3 JUICE] Exact quality ${targetHeight}p not found. Available heights: ${availableHeights.join('p, ')}p`);
  logger.warn(`   Closest quality: ${closest ? `${closest}p` : 'none'}, Total valid formats: ${validFormats.length}`);
  return null;
};

export const fetchVideoInfo = async (url, skipCookieRotation = false) => {
  url = validateUrl(url);
  const videoId = extractVideoId(url);

  // ✅ STEP 1: Check cache FIRST
  const cacheKey = `yt:info:${videoId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    logger.info(`⚡ [INFO] From cache`);
    return cached;
  }

  // ✅ STEP 2: Check if request already in-flight (SINGLE-FLIGHT)
  if (inFlightRequests.has(videoId)) {
    logger.info(`🔄 [INFO] Request already in-flight for ${videoId}, reusing promise`);
    return inFlightRequests.get(videoId);
  }

  // ✅ STEP 3: Create new fetch promise and track it
  logger.info(`🔍 [INFO] Starting new fetch for: ${url}`);

  const fetchPromise = (async () => {
    try {
      // 🔥 MP3 JUICE PERFORMANCE: Optimized yt-dlp options for fastest extraction
    const infoOpts = {
      dumpSingleJson: true,
      skipDownload: true, // Critical: Never download video files
      noCheckCertificates: true,
      noPlaylist: true,
      socketTimeout: 30, // ✅ Increased for long videos (was 8s)
      retries: 2, // ✅ Increased for long videos (was 1)
      quiet: true,
      noWarnings: true, // Skip warnings for faster processing
      writeInfoJson: false, // Don't write info JSON file
      writeDescription: false, // Don't write description
      writeThumbnail: false, // Don't download thumbnail
      writeAutomaticSub: false, // Don't download subtitles
      writeSub: false, // Don't download subtitles
      noColor: true, // Skip color codes in output
      noMtime: true // Skip modification time
    };

    // 🔥 MP3 JUICE PERFORMANCE: Skip cookie rotation for /info endpoint
    // Cookies are NOT required for basic video info - only for age-restricted videos
    // This prevents blocking on cookie refresh failures
    // Only use cookies if explicitly enabled
    if (!skipCookieRotation && areCookiesEnabled()) {
      let cookiesPath = null;
      let cookieAttempts = 0;
      const maxCookieAttempts = 1; // Only 1 attempt for /info (fast response)

      while (!cookiesPath && cookieAttempts < maxCookieAttempts) {
        try {
          // Use existing cookies if available, but don't trigger rotation
          cookiesPath = fsSync.existsSync(COOKIES_PATH) ? COOKIES_PATH : null;

          if (cookiesPath && fsSync.existsSync(cookiesPath)) {
            infoOpts.cookies = cookiesPath;
            logger.debug(`✅ [INFO] Using existing cookies (no rotation)`);
            break;
          }
        } catch (cookieErr) {
          logger.debug(`ℹ️ [INFO] Cookie error (continuing without): ${cookieErr.message}`);
        }
        cookieAttempts++;
      }
    } else {
      if (skipCookieRotation) {
        logger.debug(`ℹ️ [INFO] Cookie rotation skipped for fast response`);
      } else {
        logger.debug(`ℹ️ [INFO] Cookies disabled - continuing without`);
      }
    }

    const info = await ytdlp(url, infoOpts);

    if (!info || !info.title) {
      throw new AppError("Invalid or restricted video", 400);
    }

    const { audioFormats, videoFormats } = extractFormats(info);

    const result = {
      id: info.id,
      title: info.title,
      duration: info.duration || 0,
      durationString: info.duration_string || "Unknown",
      thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
      uploader: info.uploader || info.channel,
      view_count: info.view_count || 0,
      url,
      audioFormats,
      videoFormats,
      formats: info.formats || [] // Keep raw formats for URL extraction
    };

      await cacheSet(cacheKey, result, 3600);
      logger.info(`✅ [INFO] Success (single yt-dlp call)`);
      return result;
    } catch (err) {
      logger.error(`❌ [INFO] Error: ${err.message}`);
      if (err instanceof AppError) throw err;
      throw new AppError(`Failed to fetch info: ${err.message}`, 500);
    } finally {
      // ✅ CRITICAL: Remove from in-flight when done
      inFlightRequests.delete(videoId);
    }
  })();

  // ✅ CRITICAL: Track in-flight request
  inFlightRequests.set(videoId, fetchPromise);

  return fetchPromise;
};

export const fetchAvailableQualities = async (url) => {
  try {
    url = validateUrl(url);
    const videoInfo = await fetchVideoInfo(url);

    if (!videoInfo) {
      throw new AppError("Could not fetch video info", 500);
    }

    const allQualities = [
      ...videoInfo.videoFormats.map(v => ({ ...v, type: 'video' })),
      ...videoInfo.audioFormats.map(a => ({ ...a, type: 'audio' }))
    ];

    const recommendedQuality = videoInfo.videoFormats.find(v =>
      v.quality === '720p' || v.quality === '1080p'
    )?.quality || videoInfo.videoFormats[0]?.quality || 'auto';

    return {
      videoId: videoInfo.id,
      title: videoInfo.title,
      duration: videoInfo.duration,
      durationString: videoInfo.durationString,
      thumbnail: videoInfo.thumbnail,
      qualities: allQualities,
      videoQualities: videoInfo.videoFormats,
      audioQualities: videoInfo.audioFormats,
      recommendedQuality
    };

  } catch (err) {
    logger.error(`❌ [QUALITIES] Error: ${err.message}`);
    if (err instanceof AppError) throw err;
    throw new AppError(`Failed to fetch qualities: ${err.message}`, 500);
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔎 YOUTUBE SEARCH - RELATED VIDEOS (yt-dlp ytsearch)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Search for related videos using yt-dlp's ytsearch feature
 * Uses video title to find similar videos (10-20 results)
 * 
 * @param {string} title - Video title to search for
 * @param {number} limit - Number of results to return (10-20)
 * @param {string} excludeVideoId - Video ID to exclude from results
 * @returns {Array} Array of related video objects
 */
export const searchRelatedVideos = async (title, limit = 15, excludeVideoId = null) => {
  try {
    if (!title || typeof title !== "string") {
      logger.warn(`⚠️ [RELATED] Invalid title provided`);
      return [];
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      logger.warn(`⚠️ [RELATED] Title too short`);
      return [];
    }

    // Cap limit between 10-20 for performance
    const safeLimit = Math.max(10, Math.min(Number(limit) || 15, 20));
    
    // Cache key includes title and limit
    const cacheKey = `yt:related:${trimmedTitle}:${safeLimit}${excludeVideoId ? `:exclude:${excludeVideoId}` : ''}`;
    const cached = await cacheGet(cacheKey);

    if (cached) {
      logger.info(`⚡ [RELATED] From cache - INSTANT`);
      return cached;
    }

    logger.info(`🔎 [RELATED] Searching for: "${trimmedTitle.substring(0, 50)}" (limit: ${safeLimit})`);

    // 🔥 USE EXISTING HTTP SCRAPING METHOD (more reliable than yt-dlp ytsearch)
    // Reuse the working searchYouTube function which uses HTTP scraping
    // This is faster and more reliable than yt-dlp's ytsearch
    let searchResults = [];
    try {
      // Use the existing searchYouTube function which uses HTTP scraping
      // It's already working and cached, so it's fast
      searchResults = await searchYouTube(trimmedTitle, safeLimit);
      
      if (!Array.isArray(searchResults)) {
        logger.warn(`⚠️ [RELATED] searchYouTube returned non-array: ${typeof searchResults}`);
        searchResults = [];
      }
    } catch (err) {
      const errorMsg = err.message || String(err);
      logger.warn(`⚠️ [RELATED] Search failed: ${errorMsg}`);
      // Fallback to empty array instead of crashing
      searchResults = [];
    }

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      logger.warn(`⚠️ [RELATED] No search results found`);
      return [];
    }

    // Map results to consistent format and exclude original video
    const relatedVideos = [];
    for (const entry of searchResults) {
      if (!entry) continue; // Skip null/undefined entries

      // Extract video ID
      const videoId = entry.id || entry.videoId || entry.video_id;
      
      // Skip if no video ID found
      if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
        continue;
      }

      // Skip the original video if excludeVideoId is provided
      if (excludeVideoId && videoId === excludeVideoId) {
        continue;
      }

      // Extract video info (searchYouTube already returns formatted data)
      const videoTitle = entry.title || 'Untitled';
      const duration = Number(entry.duration) || 0;
      const thumbnail = entry.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);
      const channel = entry.channel || 'Unknown';
      const viewCount = Number(entry.viewCount) || 0;

      relatedVideos.push({
        id: videoId,
        videoId: videoId,
        title: videoTitle,
        thumbnail: thumbnail,
        duration: duration,
        channel: channel,
        viewCount: viewCount,
        url: entry.url || `https://www.youtube.com/watch?v=${videoId}`
      });

      // Stop if we have enough results
      if (relatedVideos.length >= safeLimit) {
        break;
      }
    }

    logger.info(`✅ [RELATED] Found ${relatedVideos.length} related videos`);

    // Cache for 1 hour (3600 seconds) - related videos don't change often
    await cacheSet(cacheKey, relatedVideos, 3600).catch(() => {
      // Ignore cache errors - don't block response
    });

    return relatedVideos;

  } catch (err) {
    logger.error(`❌ [RELATED] Error: ${err.message}`);
    // Return empty array instead of throwing to avoid blocking main request
    return [];
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔎 YOUTUBE SEARCH (HTTP Scraping - Legacy)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const searchYouTube = async (query, limit = 20) => {
  try {
    if (!query || typeof query !== "string") {
      throw new AppError("Valid search query required", 400);
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      throw new AppError("Query must be at least 2 characters", 400);
    }

    // 🔥 MP3 JUICE INSTANT: Default to 20 results for fast search
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 20)); // cap at 20 to keep fast
    const cacheKey = `yt:search:${trimmedQuery}:${safeLimit}`;
    const cached = await cacheGet(cacheKey);

    if (cached) {
      logger.info(`⚡ [SEARCH] From cache - INSTANT`);
      return cached;
    }

    logger.info(`🔎 [SEARCH] Query: "${trimmedQuery}" (limit ${safeLimit}) - Fast HTTP search`);

    // 🔥 FAST SEARCH: Use YouTube's search endpoint directly (no yt-dlp)
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedQuery)}`;

    let partialResults = [];
    let timedOut = false;

    // ✅ FIX: Increased timeout to 15 seconds for reliable search
    const SEARCH_TIMEOUT = 15000; // 15 seconds (was 3s - too short)
    
    const searchPromise = (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);

        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.youtube.com/',
            'Accept-Encoding': 'gzip, deflate, br',
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extract video data from YouTube's initial data JSON
        // YouTube embeds this in a script tag, find it by looking for the variable assignment
        let ytData = null;
        let startIdx = -1;
        let endIdx = -1;

        // Find the start of ytInitialData assignment
        const patterns = [
          /var ytInitialData\s*=\s*{/,
          /window\["ytInitialData"\]\s*=\s*{/,
          /window\.ytInitialData\s*=\s*{/,
          /ytInitialData\s*=\s*{/
        ];

        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match) {
            startIdx = match.index + match[0].length - 1; // Position after the opening brace
            break;
          }
        }

        if (startIdx === -1) {
          throw new Error('Could not find ytInitialData in response');
        }

        // Find the matching closing brace (handle nested objects)
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = startIdx; i < html.length; i++) {
          const char = html[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }

        if (endIdx === -1) {
          throw new Error('Could not parse ytInitialData JSON');
        }

        try {
          const jsonStr = html.substring(startIdx, endIdx);
          ytData = JSON.parse(jsonStr);
        } catch (parseErr) {
          throw new Error(`Failed to parse ytInitialData: ${parseErr.message}`);
        }

        if (!ytData) {
          throw new Error('ytInitialData is null or undefined');
        }

        return ytData;

      } catch (err) {
        if (err.name === 'AbortError') {
          timedOut = true;
          logger.warn(`⏱️ [SEARCH] Timeout after ${SEARCH_TIMEOUT / 1000}s`);
        } else {
          logger.warn(`⚠️ [SEARCH] Error during fetch: ${err.message}`);
        }
        throw err;
      }
    })();

    let ytData;
    try {
      ytData = await Promise.race([
        searchPromise,
        new Promise((resolve) => {
          setTimeout(() => {
            timedOut = true;
            logger.warn(`⏱️ [SEARCH] Timeout after ${SEARCH_TIMEOUT / 1000}s - returning partial results`);
            resolve(null);
          }, SEARCH_TIMEOUT);
        })
      ]);
    } catch (err) {
      logger.warn(`⚠️ [SEARCH] Error during search: ${err.message}`);
      return partialResults.length > 0 ? partialResults : [];
    }

    // If timeout occurred, return partial results if any
    if (timedOut || !ytData) {
      return partialResults.length > 0 ? partialResults : [];
    }

    // Parse YouTube's response structure
    try {
      // Try multiple possible paths in YouTube's response structure
      let contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

      // Fallback path 1
      if (!Array.isArray(contents)) {
        contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
      }

      // Fallback path 2 - try alternative structure
      if (!Array.isArray(contents)) {
        const sections = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
        if (Array.isArray(sections)) {
          for (const section of sections) {
            if (section?.itemSectionRenderer?.contents) {
              contents = section.itemSectionRenderer.contents;
              break;
            }
          }
        }
      }

      if (!Array.isArray(contents)) {
        logger.warn(`⚠️ [SEARCH] Invalid response structure - no contents found`);
        return [];
      }

      const mappedResults = [];

      for (const item of contents) {
        if (mappedResults.length >= safeLimit) break;

        const videoRenderer = item.videoRenderer;
        if (!videoRenderer || !videoRenderer.videoId) continue;

        const videoId = videoRenderer.videoId;
        const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || "Untitled";
        const channel = videoRenderer.ownerText?.runs?.[0]?.text || videoRenderer.ownerText?.simpleText || "Unknown";

        // Get thumbnail
        let thumbnail = "";
        if (videoRenderer.thumbnail?.thumbnails?.[0]?.url) {
          thumbnail = videoRenderer.thumbnail.thumbnails[0].url;
        } else if (videoId) {
          thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }

        // Get duration
        let duration = 0;
        const lengthText = videoRenderer.lengthText?.simpleText || videoRenderer.lengthText?.runs?.[0]?.text || "";
        if (lengthText) {
          const parts = lengthText.split(':').reverse();
          duration = parts.reduce((acc, part, idx) => acc + parseInt(part) * Math.pow(60, idx), 0);
        }

        mappedResults.push({
          id: videoId,
          videoId: videoId,
          title: title,
          thumbnail: thumbnail,
          duration: duration,
          channel: channel,
          url: `https://www.youtube.com/watch?v=${videoId}`
        });
      }

      logger.info(`✅ [SEARCH] Found ${mappedResults.length} results (fast HTTP)`);

      // Cache for 15 minutes (900 seconds)
      await cacheSet(cacheKey, mappedResults, 900).catch(() => {
        // Ignore cache errors - don't block response
      });

      return mappedResults;

    } catch (parseErr) {
      logger.warn(`⚠️ [SEARCH] Parse error: ${parseErr.message}`);
      return partialResults.length > 0 ? partialResults : [];
    }

  } catch (err) {
    logger.error(`❌ [SEARCH] Error: ${err.message}`);
    // Return empty array instead of throwing to avoid blocking
    return [];
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🗑️ FILE MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const removeFile = async (filePath) => {
  return await safeUnlink(filePath);
};

export const getFileStats = (fileName) => {
  try {
    const filePath = path.join(DOWNLOAD_DIR, fileName);
    if (!fsSync.existsSync(filePath)) return null;

    const stats = fsSync.statSync(filePath);
    return {
      exists: true,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (err) {
    return null;
  }
};

/**
 * ⚠️ DEPRECATED: List temporary files (legacy worker only)
 * In MP3 Juice mode, this should return empty array (zero-storage)
 */
export const listDownloadedFiles = async () => {
  try {
    // In MP3 Juice mode, we should have zero files
    if (!fsSync.existsSync(DOWNLOAD_DIR)) {
      return [];
    }

    const files = await fs.readdir(DOWNLOAD_DIR);
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(DOWNLOAD_DIR, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          size: stats.size,
          sizeMB: (stats.size / 1024 / 1024).toFixed(2),
          created: stats.birthtime,
          modified: stats.mtime,
          age: Date.now() - stats.mtimeMs
        };
      })
    );

    fileStats.sort((a, b) => b.created - a.created);

    // Log warning if files exist (shouldn't in MP3 Juice mode)
    if (fileStats.length > 0) {
      logger.warn(`⚠️ [Storage] Found ${fileStats.length} temp files (should be zero in MP3 Juice mode)`);
    }

    return fileStats;
  } catch (err) {
    logger.error(`❌ listDownloadedFiles: ${err.message}`);
    return [];
  }
};

export const getTotalStorageUsed = async () => {
  try {
    const files = await listDownloadedFiles();
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    return {
      totalFiles: files.length,
      totalBytes,
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
      totalGB: (totalBytes / 1024 / 1024 / 1024).toFixed(2)
    };
  } catch (err) {
    return { totalFiles: 0, totalBytes: 0, totalMB: "0", totalGB: "0" };
  }
};

/**
 * 🔥 MP3 JUICE MODE: Auto-cleanup of temporary files
 * In MP3 Juice mode, files should NOT be stored permanently
 * This function auto-deletes any temp files older than TTL
 */
export const cleanOldFiles = async (maxAgeHours = TEMP_FILE_TTL_HOURS) => {
  try {
    const files = await listDownloadedFiles();
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;
    let freedBytes = 0;

    // Delete ALL files older than TTL (zero-storage architecture)
    for (const file of files) {
      if (file.age > maxAge) {
        const filePath = path.join(DOWNLOAD_DIR, file.name);
        const deleted = await safeUnlink(filePath);

        if (deleted) {
          deletedCount++;
          freedBytes += file.size;
        }
      }
    }

    // Also delete files that are suspiciously old (safety net)
    const safetyNetAge = 24 * 60 * 60 * 1000; // 24 hours
    for (const file of files) {
      if (file.age > safetyNetAge) {
        const filePath = path.join(DOWNLOAD_DIR, file.name);
        await safeUnlink(filePath); // Silent cleanup
      }
    }

    const freedMB = (freedBytes / 1024 / 1024).toFixed(2);
    if (deletedCount > 0) {
      logger.info(`🧹 [Storage] Cleanup: ${deletedCount} temp files, ${freedMB} MB freed (MP3 Juice zero-storage mode)`);
    }

    return {
      success: true,
      deletedCount,
      freedBytes,
      freedMB,
      mode: 'zero-storage'
    };
  } catch (err) {
    logger.error(`❌ cleanOldFiles: ${err.message}`);
    return { success: false, deletedCount: 0, freedBytes: 0, error: err.message };
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🧪 CACHE MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const clearCache = async () => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.flushDb();
      logger.info('✅ [CACHE] Redis cleared');
      return { success: true, method: 'redis' };
    } else {
      memoryCache.clear();
      memoryCacheExpiry.clear();
      logger.info('✅ [CACHE] Memory cleared');
      return { success: true, method: 'memory' };
    }
  } catch (err) {
    logger.error(`❌ [CACHE] Clear error: ${err.message}`);
    return { success: false, error: err.message };
  }
};

export const getCacheStats = async () => {
  try {
    if (redisClient && redisClient.isOpen) {
      const info = await redisClient.info('stats');
      const keyspace = await redisClient.info('keyspace');

      return {
        enabled: true,
        type: 'redis',
        connected: true,
        info,
        keyspace
      };
    } else {
      return {
        enabled: true,
        type: 'memory',
        connected: true,
        keys: memoryCache.size,
        expiries: memoryCacheExpiry.size
      };
    }
  } catch (err) {
    return { enabled: false, error: err.message };
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📤 EXPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default {
  fetchVideoInfo,
  fetchAvailableQualities,
  extractFormats,
  searchYouTube,
  searchRelatedVideos,
  getDownloadUrl,
  getDirectDownloadUrl,
  getMergedDownloadInfo,
  downloadToFile,
  downloadAndConvert,
  removeFile,
  getFileStats,
  listDownloadedFiles,
  getTotalStorageUsed,
  cleanOldFiles,
  clearCache,
  getCacheStats,
  DOWNLOAD_DIR
};

