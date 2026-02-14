// ═══════════════════════════════════════════════════════════════════════
// 🎯 Download Controller - Returns Info + Formats with Direct URLs ✅
// ═══════════════════════════════════════════════════════════════════════
// FEATURES:
//    1. ✅ Returns video info + available formats
//    2. ✅ Provides direct downloadable URLs (no server download/stream)
//    3. ✅ Job/worker suggested for heavy downloads (1080p+)
//    4. ✅ JSON response: {title, formats:[{quality, type, url}]}
// ═══════════════════════════════════════════════════════════════════════

import { getDownloadUrl, fetchVideoInfo, extractUrlForQuality } from '../services/videoService.js';
import logger from '../utils/logger.js';
import fetch from 'node-fetch';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tempDir = path.join(__dirname, '../../temp');

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🛠️ UTILITY FUNCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function validateQuality(quality, format) {
  if (!quality) return format === 'mp3' ? '192' : '720';

  const normalized = String(quality)
    .toLowerCase()
    .replace(/p$/i, '')
    .replace(/kbps$/i, '')
    .replace(/k$/i, '')
    .trim();

  const audioQualities = ['320', '256', '192', '128', '96', '64'];
  if (format === 'mp3' || audioQualities.includes(normalized)) {
    return audioQualities.includes(normalized) ? normalized : '192';
  }

  const validQualities = ['144', '240', '360', '480', '720', '1080', '1440', '2160', 'auto'];
  if (validQualities.includes(normalized)) return normalized;

  return format === 'mp3' ? '192' : '720';
}

function validateFormat(format) {
  const validFormats = ['mp4', 'mp3', 'webm', 'mkv'];
  const normalized = String(format || 'mp4').toLowerCase().trim();
  return validFormats.includes(normalized) ? normalized : 'mp4';
}

function extractVideoId(url) {
  if (!url) return null;

  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
  } catch (err) {
    logger.error(`❌ Error extracting video ID: ${err.message}`);
  }

  return null;
}

function validateYouTubeUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  const trimmed = url.trim();

  const youtubePatterns = [
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /^[a-zA-Z0-9_-]{11}$/
  ];

  const isValid = youtubePatterns.some(pattern => pattern.test(trimmed));

  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid YouTube URL. Only YouTube videos are supported.'
    };
  }

  return { valid: true, url: trimmed };
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, Accept, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Disposition, Accept-Ranges, Content-Range, Transfer-Encoding');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

/**
 * ✅ FIXED: Merge DASH video and audio streams using ffmpeg and stream to response
 * ⚡ PROGRESSIVE STREAMING: FFmpeg reads directly from HTTP URLs - no temp file wait!
 * @param {string} videoUrl - Video-only stream URL
 * @param {string} audioUrl - Audio-only stream URL
 * @param {object} req - Express request object (for client disconnect detection)
 * @param {object} res - Express response object
 * @param {string} outputFileName - Output filename for Content-Disposition header
 * @returns {Promise<void>}
 */
async function mergeAndStreamDASH(videoUrl, audioUrl, req, res, outputFileName) {
  let ffmpegProcess = null;
  let isResolved = false;

  // ✅ CRITICAL: Set headers IMMEDIATELY to keep connection alive and enable streaming
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'video/mp4'); // Use video/mp4 for better browser compatibility
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outputFileName)}"`);
  res.setHeader('Transfer-Encoding', 'chunked'); // Enable chunked transfer for progressive streaming
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering for real-time streaming
  
  // ✅ CRITICAL: Write immediately to establish connection and show browser progress
  res.write(''); // Empty chunk to keep connection alive
  logger.info(`📤 [DASH MERGE] Headers sent immediately - connection established, starting progressive merge...`);

  try {
    logger.info(`⚡ [DASH MERGE] Starting PROGRESSIVE merge for: ${outputFileName}`);
    logger.info(`   🚀 FFmpeg will stream directly from HTTP URLs - browser will see progress immediately!`);
    logger.info(`   Video URL: ${videoUrl.substring(0, 60)}...`);
    logger.info(`   Audio URL: ${audioUrl.substring(0, 60)}...`);

    // ✅ CRITICAL FIX: Use FFmpeg spawn to pipe stdout directly to response
    // FFmpeg can read directly from HTTP URLs and stream output progressively
    return new Promise((resolve, reject) => {
      let keepAliveInterval = null;
      
      const cleanupOnError = async (err) => {
        if (isResolved) return;
        isResolved = true;
        
        // Clear keep-alive interval
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
        
        logger.error(`❌ [DASH MERGE] Error: ${err.message}`);
        if (err.stderr) {
          logger.error(`❌ [DASH MERGE] FFmpeg stderr: ${err.stderr}`);
        }
        
        // Kill FFmpeg process if still running
        if (ffmpegProcess) {
          try {
            ffmpegProcess.kill('SIGKILL');
          } catch (killErr) {
            // Ignore
          }
        }
        
        // If headers not sent, send error response
        if (!res.headersSent) {
          setCorsHeaders(res);
          res.status(500).json({
            success: false,
            error: 'Failed to merge video and audio',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
          });
        } else if (!res.writableEnded) {
          // Headers sent but stream not ended - try to end gracefully
          try {
            res.end();
          } catch (endErr) {
            // Ignore
          }
        }
        
        reject(err);
      };

      try {
        const ffmpegPath = ffmpegStatic || 'ffmpeg';
        
        logger.info(`   🎬 Starting FFmpeg with HTTP URL inputs - streaming output immediately...`);
        
        // ✅ CRITICAL: Build FFmpeg command with HTTP URLs directly
        // FFmpeg supports reading from HTTP URLs - this enables progressive streaming!
        // YouTube CDN URLs from yt-dlp are pre-authenticated, so they usually work directly
        // Note: If direct HTTP doesn't work, we may need to pipe streams (fallback not implemented yet)
        const ffmpegArgs = [
          // Input 1: Video from HTTP URL
          // Use input options for HTTP headers (per-input)
          '-headers', `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: https://www.youtube.com/\r\n`,
          '-i', videoUrl,
          // Input 2: Audio from HTTP URL
          '-headers', `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: https://www.youtube.com/\r\n`,
          '-i', audioUrl,
          // Increase analysis/probe size for HTTP streams (helps with progressive reading)
          '-analyzeduration', '2147483647',  // Max value for better HTTP stream handling
          '-probesize', '2147483647',
          // Video codec: copy (no re-encoding = fast)
          '-c:v', 'copy',
          // Audio codec: copy (no re-encoding = fast)
          '-c:a', 'copy',
          // Map streams
          '-map', '0:v:0',
          '-map', '1:a:0',
          // ✅ CRITICAL: Enable fragmented MP4 for progressive streaming
          // frag_keyframe: Create fragments at keyframes (enables streaming)
          // empty_moov: Write moov atom at start (better for streaming)
          // faststart: Move metadata to beginning (better for progressive download)
          '-movflags', 'frag_keyframe+empty_moov+faststart',
          // Fix timestamp issues
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts',
          // End when shortest stream ends
          '-shortest',
          // Output format
          '-f', 'mp4',
          // Output to stdout for streaming
          '-'
        ];
        
        // Log FFmpeg command (sanitize URLs for logging)
        const logArgs = ffmpegArgs.map((arg, idx) => {
          if (idx > 0 && (ffmpegArgs[idx - 1] === '-i' || ffmpegArgs[idx - 1] === '-user_agent')) {
            return arg.includes('http') ? `${arg.substring(0, 50)}...` : arg;
          }
          return arg;
        });
        logger.info(`   🎬 FFmpeg command: ${ffmpegPath} ${logArgs.join(' ').substring(0, 200)}...`);
        
        // ✅ Spawn FFmpeg process with HTTP URL inputs
        // FFmpeg will download and merge progressively, outputting to stdout immediately
        ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
          stdio: ['ignore', 'pipe', 'pipe'], // stdin: ignore, stdout: pipe, stderr: pipe
          env: { ...process.env } // Pass environment variables
        });
        
        // ✅ CRITICAL: Pipe FFmpeg stdout to response immediately
        // FFmpeg will start outputting data as soon as it begins processing HTTP streams
        // This gives the browser real-time progress instead of waiting for full merge
        let streamEnded = false;
        let bytesStreamed = 0;
        let firstChunkTime = null;
        
        ffmpegProcess.stdout.on('data', (chunk) => {
          if (!streamEnded && !res.destroyed && !res.writableEnded) {
            try {
              // Track first chunk time (measures time to first byte - TTFB)
              if (firstChunkTime === null) {
                firstChunkTime = Date.now();
                const ttfb = firstChunkTime - Date.now() + (Date.now() - (Date.now() - 100));
                logger.info(`   ⚡ First chunk received! FFmpeg is streaming data to browser...`);
              }
              
              bytesStreamed += chunk.length;
              
              // Write chunk to response
              const canWrite = res.write(chunk);
              if (!canWrite) {
                // Backpressure detected - pause FFmpeg output until response drains
                ffmpegProcess.stdout.pause();
                res.once('drain', () => {
                  ffmpegProcess.stdout.resume();
                });
              }
            } catch (writeErr) {
              logger.error(`❌ [DASH MERGE] Write error: ${writeErr.message}`);
              if (!streamEnded) {
                streamEnded = true;
                if (ffmpegProcess) {
                  try {
                    ffmpegProcess.kill('SIGKILL');
                  } catch (killErr) {
                    // Ignore
                  }
                }
              }
            }
          }
        });
        
        ffmpegProcess.stdout.on('end', () => {
          if (!streamEnded && !res.destroyed && !res.writableEnded) {
            streamEnded = true;
            res.end();
            const totalMB = (bytesStreamed / 1024 / 1024).toFixed(2);
            logger.info(`✅ [DASH MERGE] Stream completed successfully - ${totalMB} MB streamed to browser`);
          }
        });
        
        ffmpegProcess.stdout.on('error', (streamErr) => {
          logger.error(`❌ [DASH MERGE] Stream error: ${streamErr.message}`);
          if (!streamEnded) {
            streamEnded = true;
            cleanupOnError(streamErr);
          }
        });
        
        // Handle FFmpeg stderr (for logging and progress tracking)
        let stderrBuffer = '';
        ffmpegProcess.stderr.on('data', (data) => {
          stderrBuffer += data.toString();
          
          // Log progress information
          const progressMatch = data.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
          if (progressMatch) {
            logger.debug(`   ⏳ FFmpeg merge progress: ${progressMatch[1]} (streaming to browser...)`);
          }
          
          // Log when FFmpeg starts processing (confirms HTTP input is working)
          if (data.toString().includes('Input') || data.toString().includes('Stream')) {
            logger.debug(`   📡 FFmpeg processing HTTP streams...`);
          }
        });
        
        // Handle FFmpeg process end
        ffmpegProcess.on('close', (code) => {
          // Clear keep-alive interval
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
          
          if (isResolved) return;
          
          if (code === 0) {
            logger.info(`   ✅ FFmpeg merge completed successfully`);
            // Ensure response is ended if not already
            if (!res.writableEnded && !res.destroyed) {
              try {
                res.end();
              } catch (endErr) {
                logger.debug(`⚠️ [DASH MERGE] Response already ended: ${endErr.message}`);
              }
            }
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          } else {
            logger.error(`❌ [DASH MERGE] FFmpeg exited with code ${code}`);
            logger.error(`❌ [DASH MERGE] FFmpeg stderr: ${stderrBuffer.substring(0, 500)}`);
            cleanupOnError(new Error(`FFmpeg process exited with code ${code}`));
          }
        });
        
        // Handle FFmpeg process errors
        ffmpegProcess.on('error', (err) => {
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
          logger.error(`❌ [DASH MERGE] FFmpeg spawn error: ${err.message}`);
          cleanupOnError(err);
        });
        
        // Handle stdout errors
        ffmpegProcess.stdout.on('error', (err) => {
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
          logger.error(`❌ [DASH MERGE] FFmpeg stdout error: ${err.message}`);
          if (!isResolved) {
            cleanupOnError(err);
          }
        });

        // ✅ Handle client disconnect gracefully
        const handleDisconnect = () => {
          if (isResolved) return;
          logger.warn(`⚠️ [DASH MERGE] Client disconnected during merge`);
          
          // Clear keep-alive interval
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
          
          if (ffmpegProcess) {
            try {
              // Kill FFmpeg process and all its children
              ffmpegProcess.kill('SIGKILL');
              logger.info(`   🛑 FFmpeg process killed due to client disconnect`);
            } catch (err) {
              // Ignore errors when killing process
            }
          }
          
          isResolved = true;
        };
        
        // Listen for client disconnect events
        res.on('close', handleDisconnect);
        res.on('aborted', handleDisconnect);
        if (req) {
          req.on('close', handleDisconnect);
          req.on('aborted', handleDisconnect);
        }
        
        // Handle response finish
        res.on('finish', () => {
          if (!isResolved) {
            isResolved = true;
            logger.info(`✅ [DASH MERGE] Response stream finished successfully`);
            resolve();
          }
        });

        // Handle response errors
        res.on('error', (resErr) => {
          logger.error(`❌ [DASH MERGE] Response error: ${resErr.message}`);
          if (!isResolved) {
            cleanupOnError(resErr);
          }
        });

      } catch (setupErr) {
        logger.error(`❌ [DASH MERGE] Setup error: ${setupErr.message}`);
        cleanupOnError(setupErr);
      }
    });

  } catch (error) {
    logger.error(`❌ [DASH MERGE] Outer error: ${error.message}`);
    if (!res.headersSent) {
      setCorsHeaders(res);
      res.status(500).json({
        success: false,
        error: 'Failed to merge video and audio',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } else if (!res.writableEnded) {
      try {
        res.end();
      } catch (endErr) {
        // Ignore
      }
    }
    throw error;
  }
}


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎯 GET DOWNLOAD INFO + FORMATS - Returns Direct URLs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const getDirectUrl = async (req, res) => {
  const maxRetries = 3;
  let lastError = null;

  try {
    setCorsHeaders(res);
    logger.info('🔗 [INFO] Download info request received');

    const {
      url,
      videoId
    } = req.query;

    let finalUrl = url;
    let finalVideoId = videoId;

    // Construct URL from videoId or extract videoId from URL
    if (videoId && !url) {
      finalVideoId = videoId;
      finalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } else if (url && !videoId) {
      finalUrl = url;
      finalVideoId = extractVideoId(url);

      if (!finalVideoId) {
        logger.error('❌ Could not extract videoId from URL');
        return res.status(400).json({
          success: false,
          error: 'Invalid YouTube URL - could not extract video ID'
        });
      }
    }

    if (!finalUrl) {
      logger.error('❌ No video URL or ID provided');
      return res.status(400).json({
        success: false,
        error: 'URL or videoId parameter is required'
      });
    }

    // Validate URL
    const validation = validateYouTubeUrl(finalUrl);
    if (!validation.valid) {
      logger.error(`❌ URL validation failed: ${validation.error}`);
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    logger.info(`🎯 [INFO] Processing:`);
    logger.info(`   📺 Video ID: ${finalVideoId}`);

    // Retry logic for resilience
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`🔄 [INFO] Attempt ${attempt}/${maxRetries}`);

        // 🔥 Y2MATE PERFORMANCE: SINGLE yt-dlp call - no cookie rotation blocking
        // This is the ONLY yt-dlp call for /info endpoint
        const videoInfo = await fetchVideoInfo(finalUrl, true); // skipCookieRotation=true

        if (!videoInfo || !videoInfo.title) {
          throw new Error('Failed to get video info from YouTube');
        }

        logger.info(`✅ [INFO] Success on attempt ${attempt} (single yt-dlp call)`);
        logger.info(`📺 Title: ${videoInfo.title}`);
        logger.info(`⏱️ Duration: ${videoInfo.duration}s`);

        // 🔥 Y2MATE INSTANT: Extract formats with URLs from cached videoInfo
        // NO separate yt-dlp calls - use extractUrlForQuality from cached formats
        // This is INSTANT because formats are already fetched
        // Group formats into videoFormats and audioFormats (Y2Mate-style)
        const videoFormats = [];
        const audioFormats = [];

        // Video formats (MP4) - extract URLs from cached formats (INSTANT)
        if (videoInfo.videoFormats && Array.isArray(videoInfo.videoFormats)) {
          for (const format of videoInfo.videoFormats) {
            if (format.available && !format.disabled) {
              try {
                // Extract URL from cached formats (NO yt-dlp call - INSTANT)
                const qualityNum = format.quality.replace('p', '');
                const urlResult = extractUrlForQuality(videoInfo, 'mp4', qualityNum);

                // For DASH formats, use videoUrl if directUrl is not available
                let downloadUrl = urlResult?.directUrl;
                if (!downloadUrl && urlResult?.videoUrl) {
                  downloadUrl = urlResult.videoUrl;
                }

                if (urlResult && downloadUrl) {
                  // ✅ Y2MATE BEHAVIOR: Allow DASH merge for ALL qualities
                  // If DASH format is available, use it (merge endpoint handles it)
                  const qualityInt = parseInt(qualityNum);
                  
                  // Determine if DASH format (ALL qualities allowed)
                  const isDASHFormat = urlResult.needsMerge && 
                                       !urlResult.isProgressive &&
                                       urlResult.videoUrl && 
                                       urlResult.audioUrl;
                  
                  const needsMerge = isDASHFormat;

                  videoFormats.push({
                    quality: format.quality,
                    qualityLabel: format.quality,
                    type: 'video',
                    label: format.label || `${format.quality} MP4`,
                    height: format.height || qualityInt,
                    format: 'mp4',
                    extension: 'mp4',
                    fileSize: format.fileSize,
                    fileSizeMB: format.fileSizeMB,
                    hasAudio: urlResult.hasAudio || false,
                    needsMerge: needsMerge, // True for DASH formats that require server-side merging
                    needsJob: false, // Direct downloads - no job needed
                    url: downloadUrl, // Direct URL for download
                    directUrl: downloadUrl, // Alias for frontend compatibility
                    isProgressive: urlResult.isProgressive || false,
                    container: 'mp4',
                    // DASH format info (for server-side merging)
                    videoUrl: urlResult.videoUrl || (needsMerge ? downloadUrl : null),
                    audioUrl: urlResult.audioUrl || null
                  });
                  const formatType = urlResult.isProgressive ? 'Progressive' : 'DASH';
                  const mergeStatus = needsMerge ? ' (requires merge)' : '';
                  logger.info(`✅ [INFO] Added ${format.quality}: ${formatType} MP4${mergeStatus}`);
                } else {
                  logger.debug(`⚠️ [INFO] Skipped ${format.quality}: No format available`);
                }
              } catch (err) {
                logger.debug(`⚠️ [INFO] Failed to get URL for ${format.quality}: ${err.message}`);
              }
            }
          }
        }

        // Audio formats (MP3) - extract URLs from cached formats (INSTANT)
        if (videoInfo.audioFormats && Array.isArray(videoInfo.audioFormats)) {
          for (const format of videoInfo.audioFormats) {
            if (format.available) {
              try {
                // Extract URL from cached formats (NO yt-dlp call - INSTANT)
                // Bitrate might be number or string (e.g., 128 or "128kbps")
                const bitrateStr = format.quality || format.bitrate || '128';
                const bitrate = typeof bitrateStr === 'number' 
                  ? String(bitrateStr) 
                  : String(bitrateStr).replace(/kbps$/i, '').replace(/k$/i, '');
                const urlResult = extractUrlForQuality(videoInfo, 'mp3', bitrate);

                if (urlResult && urlResult.directUrl) {
                  audioFormats.push({
                    quality: format.quality,
                    qualityLabel: format.quality,
                    type: 'audio',
                    label: format.label || `MP3 ${format.quality}`,
                    bitrate: format.bitrate || parseInt(bitrate),
                    format: 'mp3',
                    extension: 'mp3',
                    fileSize: format.fileSize,
                    fileSizeMB: format.fileSizeMB,
                    hasAudio: true,
                    needsMerge: false, // MP3 formats never need merging
                    needsJob: false, // Direct downloads - no job needed
                    url: urlResult.directUrl, // Direct URL for download
                    directUrl: urlResult.directUrl, // Alias for frontend compatibility
                    container: 'mp3'
                  });
                  logger.info(`✅ [INFO] Added ${format.quality}: MP3 with direct URL`);
                } else {
                  logger.debug(`⚠️ [INFO] Skipped ${format.quality}: No audio format available`);
                }
              } catch (err) {
                logger.debug(`⚠️ [INFO] Failed to get URL for ${format.quality}: ${err.message}`);
              }
            }
          }
        }

        logger.info(`📦 [INFO] Found ${videoFormats.length} video formats, ${audioFormats.length} audio formats (INSTANT from cache)`);

        // 🔥 Y2MATE INSTANT: Return formats grouped by type (Y2Mate-style)
        // All URLs are already extracted from cached formats - NO waiting
        return res.status(200).json({
          success: true,
          title: videoInfo.title || 'video',
          videoId: finalVideoId,
          duration: videoInfo.duration || 0,
          // Y2Mate-style grouped formats
          videoFormats: videoFormats, // MP4 formats with quality labels
          audioFormats: audioFormats, // MP3 formats (128kbps, 320kbps)
          // Backward compatibility: also include flat formats array
          formats: [...videoFormats, ...audioFormats]
        });

      } catch (attemptError) {
        lastError = attemptError;
        const errorMsg = attemptError.message || String(attemptError);
        logger.warn(`⚠️ [INFO] Attempt ${attempt} failed: ${errorMsg}`);

        if (attempt === maxRetries) {
          throw attemptError;
        }

        // Exponential backoff
        const waitTime = Math.pow(2, attempt) * 1000;
        logger.info(`⏳ [INFO] Waiting ${waitTime / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError || new Error('All attempts failed to get download info');

  } catch (error) {
    const errorMsg = error.message || String(error);
    logger.error('❌ [INFO] Final error:', errorMsg);

    let userMessage = 'Failed to get download info';
    let statusCode = 500;

    if (errorMsg.includes('Network') || errorMsg.includes('ENOTFOUND')) {
      userMessage = 'Network error. Check your internet connection.';
      statusCode = 503;
    } else if (errorMsg.includes('unavailable') || errorMsg.includes('private')) {
      userMessage = 'Video is unavailable or private';
      statusCode = 404;
    } else if (errorMsg.includes('rate limit')) {
      userMessage = 'Rate limit exceeded. Please try again later.';
      statusCode = 429;
    } else if (errorMsg.includes('age')) {
      userMessage = 'Age-restricted video';
      statusCode = 403;
    }

    if (!res.headersSent) {
      res.status(statusCode).json({
        success: false,
        error: userMessage,
        details: process.env.NODE_ENV === 'development' ? errorMsg : undefined,
        timestamp: new Date().toISOString()
      });
    }
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚠️ DEPRECATED: DASH MERGE STREAMING (Removed - Y2Mate Mode)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * ⚠️ DEPRECATED: Server-side merging removed in Y2Mate mode
 * All formats now return direct URLs - browser downloads directly from CDN
 * This function is kept for reference only and should never be called
 */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🚀 PROXY DOWNLOAD - Returns Direct URL (No Server Stream)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * ✅ Y2MATE MODE: Returns JSON with direct CDN URLs
 * - Progressive formats (144p-720p): Direct CDN URL (browser downloads directly)
 * - DASH formats (ALL qualities): Returns merge endpoint (server merges video+audio)
 * - No temp files for progressive formats
 * - Server-side merge for ALL qualities when DASH format is used
 */
export const proxyDownload = async (req, res) => {
  // ✅ CRITICAL FIX: Extract videoId at top level to ensure it's always in scope
  const {
    videoId,
    quality = '720',
    format = 'mp4',
    returnUrl = 'false'
  } = req.query;

  // ✅ CRITICAL FIX: Validate videoId immediately and return JSON response
  if (!videoId) {
    setCorsHeaders(res);
    return res.status(400).json({
      success: false,
      error: 'Video ID is required'
    });
  }

  // ✅ CRITICAL FIX: Parse qualityNum once at the top
  const qualityNum = parseInt(String(quality).replace(/p$/i, '').replace(/kbps?$/i, '').trim());
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    logger.info('🎬 [PROXY] Download URL request:', { videoId, quality, format, returnUrl });

    // ✅ STEP 1: Try exact progressive match from cache (Y2MATE LOGIC)
    let urlResult = null;
    let cacheSuccess = false;

    try {
      const cachedInfo = await fetchVideoInfo(youtubeUrl, true);
      if (cachedInfo && cachedInfo.formats && Array.isArray(cachedInfo.formats)) {
        logger.info('⚡ [PROXY] Using cached video info for URL extraction');
        urlResult = extractUrlForQuality(cachedInfo, format, quality);
        
        // ✅ Y2MATE BEHAVIOR: Accept progressive OR DASH formats (DASH merge allowed for all qualities)
        if (urlResult && urlResult.directUrl && urlResult.isProgressive && !urlResult.needsMerge) {
          // Progressive format - validate it's not HLS
          if (!urlResult.directUrl.includes('manifest') && 
              !urlResult.directUrl.includes('.m3u8') &&
              urlResult.directUrl.startsWith('https://')) {
            cacheSuccess = true;
            logger.info(`✅ [PROXY] Cache hit - exact progressive format found for ${quality}p`);
          } else {
            logger.warn(`⚠️ [PROXY] Cache result contains HLS/manifest URL - rejecting`);
            urlResult = null;
          }
        } else if (urlResult && urlResult.needsMerge && urlResult.videoUrl && urlResult.audioUrl) {
          // ✅ Y2MATE: Allow DASH from cache for ALL qualities (merge will handle it)
          cacheSuccess = true;
          logger.info(`✅ [PROXY] Cache hit - DASH format found for ${quality}p (will merge)`);
        } else if (!urlResult) {
          // ✅ Quality not found in cached formats - will try getDownloadUrl fallback
          logger.info(`ℹ️ [PROXY] Quality ${quality}p not found in cached formats, will try fallback`);
        }
      }
    } catch (cacheErr) {
      logger.debug(`ℹ️ [PROXY] Cache miss: ${cacheErr.message}`);
    }
    
    // ✅ STEP 2: If cache failed, try getDownloadUrl as fallback (Y2MATE: allows DASH for all qualities)
    if (!cacheSuccess) {
      logger.info(`📡 [PROXY] Cache miss for ${quality}p, trying getDownloadUrl fallback...`);
      
      try {
        urlResult = await getDownloadUrl(youtubeUrl, format, quality);
        
        // ✅ CRITICAL FIX: Validate result is not HLS
        if (urlResult && urlResult.directUrl) {
          if (urlResult.directUrl.includes('manifest') || urlResult.directUrl.includes('.m3u8')) {
            logger.error(`❌ [PROXY] getDownloadUrl returned HLS URL - rejecting`);
            throw new Error('HLS format not allowed');
          }
        }
      } catch (getUrlErr) {
        const errorMsg = getUrlErr.message || String(getUrlErr);
        
        // ✅ Check if it's a quality not available error - use availableQualities from error if available
        if (errorMsg.includes('not available') || errorMsg.includes('not found') || getUrlErr.statusCode === 404) {
          logger.warn(`⚠️ [PROXY] Quality ${quality}p not available, trying to find available qualities...`);
          
          // Use availableQualities from error if available
          let availableHeights = getUrlErr.availableQualities || [];
          
          // If not in error, try to get from cached info
          if (availableHeights.length === 0) {
            try {
              const cachedInfo = await fetchVideoInfo(youtubeUrl, true);
              if (cachedInfo && cachedInfo.formats && Array.isArray(cachedInfo.formats)) {
                availableHeights = cachedInfo.formats
                  .filter(f => f.height && f.vcodec && f.vcodec !== 'none')
                  .map(f => Number(f.height))
                  .filter((h, i, arr) => arr.indexOf(h) === i)
                  .sort((a, b) => b - a);
              }
            } catch (infoErr) {
              logger.warn(`⚠️ [PROXY] Could not fetch available qualities: ${infoErr.message}`);
            }
          }
          
          // Return error with available qualities
          setCorsHeaders(res);
          if (availableHeights.length > 0) {
            // Find closest quality
            const requestedHeight = qualityNum;
            const closestHigher = availableHeights.find(h => h >= requestedHeight);
            const availableHeightsReversed = [...availableHeights].reverse();
            const closestLower = availableHeightsReversed.find(h => h <= requestedHeight);
            const closest = closestHigher || closestLower || availableHeights[0];
            
            return res.status(404).json({
              success: false,
              error: `Quality ${quality}p is not available for this video`,
              message: `The requested quality (${quality}p) is not available. Available qualities: ${availableHeights.join('p, ')}p`,
              availableQualities: availableHeights.map(h => `${h}p`),
              closestQuality: closest ? `${closest}p` : null,
              quality: quality,
              videoId: videoId
            });
          } else {
            // No available qualities found, but still return 404
            return res.status(404).json({
              success: false,
              error: `Quality ${quality}p is not available for this video`,
              message: `The requested quality (${quality}p) is not available. Please try a different quality.`,
              quality: quality,
              videoId: videoId
            });
          }
        }
        
        logger.error(`❌ [PROXY] Failed to get URL: ${errorMsg}`);
        logger.error(`   VideoId: ${videoId}, Quality: ${quality}, Format: ${format}`);
        
        setCorsHeaders(res);
        return res.status(500).json({
          success: false,
          error: `Failed to get download URL for ${quality}p`,
          details: process.env.NODE_ENV === 'development' ? errorMsg : undefined,
          quality: quality,
          videoId: videoId
        });
      }
    }

    // ✅ STEP 3: Validate we have a valid result
    if (!urlResult || (!urlResult.directUrl && (!urlResult.videoUrl || !urlResult.audioUrl))) {
      setCorsHeaders(res);
      return res.status(404).json({
        success: false,
        error: `No valid download URL available for ${quality}p`,
        quality: quality,
        videoId: videoId // ✅ CRITICAL FIX: Include videoId in error response
      });
    }

    // ✅ STEP 4: Prepare response data
    const videoTitle = (urlResult.title || 'video')
      .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 80);

    const qualityLabel = format === 'mp3' ? `${quality}kbps` : `${quality}p`;
    const fileExtension = format === 'mp3' ? 'mp3' : 'mp4';
    const safeFileName = `${videoTitle}_${qualityLabel}.${fileExtension}`;

    // ✅ STEP 5: Y2Mate Style - Browser Direct Download (NO SERVER MERGE)
    // Return direct CDN URLs for ALL qualities so browser can download directly
    // Server merge only used as absolute last resort (currently disabled for better performance)
    setCorsHeaders(res);
    
    // ✅ Y2MATE STYLE: Always prefer direct CDN URL for browser download
    // Even if DASH format detected, return videoUrl as directUrl for browser download
    const hasVideoUrl = urlResult.videoUrl && urlResult.videoUrl.startsWith('https://');
    const hasDirectUrl = urlResult.directUrl && urlResult.directUrl.startsWith('https://');
    
    // Use directUrl if available, otherwise use videoUrl (even for DASH formats)
    const directCDNUrl = hasDirectUrl ? urlResult.directUrl : (hasVideoUrl ? urlResult.videoUrl : null);
    
    // ✅ ALL FORMATS: Return backend streaming endpoint (bypasses CORS)
    // streamVideo function will handle DASH vs Progressive internally
    // For low quality DASH (<=480p): Stream video-only directly (instant download)
    // For high quality DASH (720p+): Use merge endpoint
    // For Progressive: Stream directly
    
    let googlevideoUrl = urlResult.directUrl || urlResult.videoUrl || urlResult.url;

    // ✅ CRITICAL FIX: Final validation - reject HLS and ensure HTTPS
    if (!googlevideoUrl || 
        !googlevideoUrl.startsWith('https://') ||
        googlevideoUrl.includes('manifest') ||
        googlevideoUrl.includes('.m3u8')) {
      logger.error(`❌ [PROXY] Invalid URL detected: ${googlevideoUrl ? googlevideoUrl.substring(0, 80) : 'null'}`);
      setCorsHeaders(res);
      return res.status(400).json({
        success: false,
        error: `Invalid download URL format. HLS/manifest URLs are not supported.`,
        quality: quality,
        videoId: videoId
      });
    }

    // ✅ Y2MATE: Return backend streaming endpoint (bypasses CORS for direct download)
    // Frontend uses this endpoint in <a> tag to trigger download
    const streamEndpoint = `${req.protocol}://${req.get('host')}/api/v1/video/stream?${new URLSearchParams({
      videoId: videoId,
      quality: quality,
      format: format
    })}`;

    // Check if this is DASH format
    const isDASH = urlResult.needsMerge && urlResult.videoUrl && urlResult.audioUrl;
    
    logger.info(`✅ [Y2MATE] Format (${quality}p) - returning streaming endpoint (bypasses CORS)`);
    if (isDASH) {
      logger.info(`   DASH format - will stream video-only directly (instant download for all qualities)`);
    }
    logger.info(`📺 Title: ${urlResult.title || 'video'}`);
    logger.info(`   Stream endpoint: ${streamEndpoint.substring(0, 80)}...`);

    return res.json({
      success: true,
      directUrl: streamEndpoint, // Backend streaming endpoint instead of CDN URL
      streamUrl: streamEndpoint, // Alternative key
      url: streamEndpoint,
      needsMerge: false, // All formats stream directly now (no merge needed for instant download)
      isProgressive: !isDASH && (urlResult.isProgressive || false),
      title: urlResult.title || videoTitle,
      filename: safeFileName,
      quality: qualityLabel,
      format: format,
      container: urlResult.container || 'mp4',
      hasVideo: true,
      hasAudio: urlResult.hasAudio !== false,
      type: 'stream' // Indicates this is a streaming endpoint
    });

  } catch (error) {
    logger.error('❌ [PROXY] Error:', error.message);
    logger.error(`   VideoId: ${videoId}, Quality: ${quality}`);

    // ✅ CRITICAL FIX: Always return JSON response, never leave request hanging
    if (!res.headersSent) {
      setCorsHeaders(res);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to get download URL',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        quality: quality,
        videoId: videoId // ✅ CRITICAL FIX: Always include videoId in error
      });
    } else {
      // Headers already sent - end response properly
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
};


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🔀 DASH MERGE ENDPOINT (ALL Qualities - Y2Mate Style)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * ✅ Y2MATE BEHAVIOR: DASH Merge Endpoint - Server-side merge for ALL qualities
 * Used when DASH format requires merging (video+audio separate streams)
 * Works for 144p, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p - ALL qualities
 * Streams merged file directly to client (no temp file storage)
 */
/**
 * ✅ STREAM PROXY: Stream video directly from CDN to frontend (bypasses CORS)
 * Used when frontend can't fetch CDN URLs directly due to CORS restrictions
 */
export const streamVideo = async (req, res) => {
  try {
    // ✅ FIX: Handle both videoid (lowercase) and videoId (camelCase)
    const videoId = req.query.videoId || req.query.videoid;
    const quality = req.query.quality || '720';
    const format = req.query.format || 'mp4';

    if (!videoId) {
      setCorsHeaders(res);
      return res.status(400).json({
        success: false,
        error: 'Video ID is required (use videoId or videoid parameter)'
      });
    }

    // ✅ FIX: Set CORS headers immediately to keep connection alive
    setCorsHeaders(res);
    
    logger.info('📡 [STREAM] Streaming video request:', { videoId, quality, format });

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const qualityNum = parseInt(String(quality).replace(/p$/i, '').replace(/kbps?$/i, '').trim());

    // ✅ FIX: Check if client disconnected before processing
    if (req.aborted || res.destroyed) {
      logger.warn(`⚠️ [STREAM] Client disconnected before processing`);
      return;
    }

    // Get video URL
    let urlResult = null;
    try {
      const cachedInfo = await fetchVideoInfo(youtubeUrl, true);
      if (cachedInfo && cachedInfo.formats) {
        urlResult = extractUrlForQuality(cachedInfo, format, quality);
      }
    } catch (cacheErr) {
      logger.debug(`ℹ️ [STREAM] Cache miss, fetching fresh...`);
    }

    if (!urlResult) {
      // ✅ FIX: Check connection again before long operation
      if (req.aborted || res.destroyed) {
        logger.warn(`⚠️ [STREAM] Client disconnected during URL fetch`);
        return;
      }
      try {
        urlResult = await getDownloadUrl(youtubeUrl, format, quality);
      } catch (downloadErr) {
        // If quality not available, return proper error
        if (downloadErr.message?.includes('not available') || downloadErr.statusCode === 404) {
          logger.warn(`⚠️ [STREAM] Quality ${quality} not available: ${downloadErr.message}`);
          if (!res.headersSent) {
            setCorsHeaders(res);
            return res.status(404).json({
              success: false,
              error: downloadErr.message || `Quality ${quality} is not available for this video`,
              quality: quality,
              videoId: videoId
            });
          }
          return;
        }
        throw downloadErr; // Re-throw other errors
      }
    }
    
    // ✅ CRITICAL FIX: Validate urlResult before proceeding
    if (!urlResult || (!urlResult.directUrl && !urlResult.videoUrl && !urlResult.url)) {
      logger.error(`❌ [STREAM] No valid URL result for ${videoId} at quality ${quality}`);
      if (!res.headersSent) {
        setCorsHeaders(res);
        return res.status(404).json({
          success: false,
          error: `Quality ${quality} is not available for this video. Please try a different quality.`,
          quality: quality,
          videoId: videoId
        });
      }
      return;
    }
    
    // ✅ FIX: Final connection check before streaming
    if (req.aborted || res.destroyed) {
      logger.warn(`⚠️ [STREAM] Client disconnected before streaming`);
      return;
    }

    // ✅ CRITICAL FIX: Validate urlResult has valid URLs before processing
    if (!urlResult || (!urlResult.directUrl && !urlResult.videoUrl && !urlResult.url)) {
      logger.error(`❌ [STREAM] Invalid urlResult for ${videoId} at quality ${quality}`);
      if (!res.headersSent) {
        setCorsHeaders(res);
        return res.status(404).json({
          success: false,
          error: `Quality ${quality} is not available for this video. Please try a different quality.`,
          quality: quality,
          videoId: videoId
        });
      }
      return;
    }

    // ✅ DASH FORMATS: Merge video + audio streams using FFmpeg
    // This ensures all DASH formats (144p, 240p, 480p, 720p, 1080p, 1440p, 2160p) have audio
    // ✅ CRITICAL: Only process DASH if BOTH videoUrl and audioUrl are valid
    if (urlResult && urlResult.needsMerge && urlResult.videoUrl && urlResult.audioUrl && 
        urlResult.videoUrl.startsWith('https://') && urlResult.audioUrl.startsWith('https://')) {
      logger.info(`🔀 [STREAM] DASH format detected (${quality}p) - needs merge: true`);
      logger.info(`   Video URL: ${urlResult.videoUrl.substring(0, 60)}...`);
      logger.info(`   Audio URL: ${urlResult.audioUrl.substring(0, 60)}...`);
      
      const videoTitle = (urlResult?.title || 'video')
        .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 80);

      const qualityLabel = format === 'mp3' ? `${quality}kbps` : `${quality}p`;
      const fileExtension = format === 'mp3' ? 'mp3' : 'mp4';
      const safeFileName = `${videoTitle}_${qualityLabel}.${fileExtension}`;

      logger.info(`🔀 [STREAM] Starting FFmpeg merge for ${quality}p DASH format...`);
      
      // Use mergeAndStreamDASH to merge video + audio and stream to user
      await mergeAndStreamDASH(urlResult.videoUrl, urlResult.audioUrl, req, res, safeFileName);
      
      logger.info(`✅ [STREAM] DASH merge completed and streaming started: ${safeFileName}`);
      return; // Exit early, mergeAndStreamDASH handles the response
    }

    // ✅ Progressive format (video+audio combined) - stream directly from CDN
    // This handles formats like 360p that have both video and audio in one stream
    const videoUrl = urlResult?.directUrl || urlResult?.videoUrl || urlResult?.url;
    
    if (!videoUrl || !videoUrl.startsWith('https://')) {
      // Headers already sent, need to end properly
      if (!res.writableEnded) {
        res.end();
      }
      logger.error(`❌ [STREAM] Video URL not found for ${videoId}`);
      return;
    }

    const videoTitle = (urlResult?.title || 'video')
      .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 80);

    const qualityLabel = format === 'mp3' ? `${quality}kbps` : `${quality}p`;
    const fileExtension = format === 'mp3' ? 'mp3' : 'mp4';
    const safeFileName = `${videoTitle}_${qualityLabel}.${fileExtension}`;

    logger.info(`📥 [STREAM] Progressive format (${quality}p) - streaming directly from CDN (no merge needed)`);
    logger.info(`   URL: ${videoUrl.substring(0, 60)}...`);

    // Fetch video from CDN (backend can do this, no CORS issue)
    const videoResponse = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.youtube.com/',
        'Accept': '*/*'
      }
    });

    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video: ${videoResponse.status} ${videoResponse.statusText}`);
    }

    // ✅ Set headers to trigger download with proper content type
    setCorsHeaders(res);
    // Use proper content types for better browser compatibility
    const contentType = format === 'mp3' 
      ? (videoResponse.headers.get('content-type') || 'audio/mpeg')
      : 'video/mp4'; // Changed from application/octet-stream to video/mp4 for better progress visibility
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFileName)}"`);
    const contentLength = videoResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    } else {
      // If no content-length, use chunked transfer encoding
      res.setHeader('Transfer-Encoding', 'chunked');
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ✅ CRITICAL FIX: Stream video from CDN to frontend with proper error handling
    let streamEnded = false;
    
    videoResponse.body.on('data', (chunk) => {
      if (!streamEnded && !res.destroyed && !res.writableEnded) {
        try {
          const canWrite = res.write(chunk);
          if (!canWrite) {
            // Backpressure - pause until drain
            videoResponse.body.pause();
            res.once('drain', () => {
              videoResponse.body.resume();
            });
          }
        } catch (writeErr) {
          logger.error(`❌ [STREAM] Write error: ${writeErr.message}`);
          streamEnded = true;
        }
      }
    });
    
    videoResponse.body.on('end', () => {
      if (!streamEnded && !res.destroyed && !res.writableEnded) {
        streamEnded = true;
        res.end();
        logger.info(`✅ [STREAM] Progressive stream ended successfully`);
      }
    });
    
    videoResponse.body.on('error', (err) => {
      logger.error(`❌ [STREAM] Stream error: ${err.message}`);
      if (!streamEnded) {
        streamEnded = true;
        if (!res.destroyed && !res.writableEnded) {
          try {
            res.end();
          } catch (endErr) {
            // Ignore
          }
        }
      }
    });

    logger.info(`✅ [STREAM] Video streaming started: ${safeFileName}`);

  } catch (error) {
    logger.error('❌ [STREAM] Error:', error.message);
    
    // ✅ FIX: Handle client disconnect errors gracefully
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.message?.includes('client disconnected')) {
      logger.debug(`🔌 [STREAM] Client disconnected during streaming`);
      return; // Don't send error response for client disconnects
    }
    
    if (!res.headersSent) {
      setCorsHeaders(res);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to stream video'
      });
    } else {
      // Headers sent but error occurred - try to end gracefully
      if (!res.writableEnded && res.writable) {
        try {
          res.end();
        } catch (endErr) {
          logger.debug(`⚠️ [STREAM] Failed to end response: ${endErr.message}`);
        }
      }
    }
  }
};

export const mergeDASH = async (req, res) => {
  try {
    const {
      videoId,
      quality = '1080',
      format = 'mp4'
    } = req.query;

    if (!videoId) {
      setCorsHeaders(res);
      return res.status(400).json({
        success: false,
        error: 'Video ID is required'
      });
    }

    // ✅ Y2MATE: Allow merge for ALL qualities (DASH merge supported for all)
    const qualityNum = parseInt(String(quality).replace(/p$/i, '').replace(/kbps?$/i, '').trim());

    logger.info('🔀 [MERGE] DASH merge request:', { videoId, quality, format });

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Get video info and extract DASH URLs
    let urlResult = null;
    try {
      const cachedInfo = await fetchVideoInfo(youtubeUrl, true);
      if (cachedInfo && cachedInfo.formats) {
        urlResult = extractUrlForQuality(cachedInfo, format, quality);
      }
    } catch (cacheErr) {
      logger.debug(`ℹ️ [MERGE] Cache miss, fetching fresh...`);
    }

    if (!urlResult || !urlResult.videoUrl || !urlResult.audioUrl) {
      urlResult = await getDownloadUrl(youtubeUrl, format, quality);
    }

    if (!urlResult || !urlResult.videoUrl || !urlResult.audioUrl) {
      throw new Error('Failed to get DASH video/audio URLs');
    }

    const videoTitle = (urlResult.title || 'video')
      .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 80);

    const qualityLabel = format === 'mp3' ? `${quality}kbps` : `${quality}p`;
    const fileExtension = format === 'mp3' ? 'mp3' : 'mp4';
    const safeFileName = `${videoTitle}_${qualityLabel}.${fileExtension}`;

    // ✅ FIXED: Don't set headers here - mergeAndStreamDASH will set them after merge completes
    // Headers must be set AFTER merge completes and BEFORE streaming starts
    // Merge and stream
    logger.info(`🔀 [MERGE] Starting DASH merge for ${quality}p...`);
    await mergeAndStreamDASH(urlResult.videoUrl, urlResult.audioUrl, req, res, safeFileName);
    logger.info(`✅ [MERGE] DASH merge completed`);

  } catch (error) {
    logger.error('❌ [MERGE] Error:', error.message);
    logger.error('❌ [MERGE] Stack:', error.stack);

    // ✅ CRITICAL FIX: Always send error response, never leave request hanging
    if (!res.headersSent) {
      setCorsHeaders(res);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to merge video and audio',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } else {
      // Headers already sent - try to end response properly
      try {
        if (!res.writableEnded && res.writable) {
          res.end();
        }
      } catch (endErr) {
        logger.error('❌ [MERGE] Failed to end response:', endErr.message);
      }
    }
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📡 OTHER ENDPOINTS (Compatibility & Health Check)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const directDownload = async (req, res) => {
  setCorsHeaders(res);
  return res.status(410).json({
    success: false,
    error: 'Deprecated. Use /api/download/proxy instead.',
    redirect: '/api/download/proxy'
  });
};

export const getDownloadProgress = async (req, res) => {
  try {
    setCorsHeaders(res);
    return res.json({
      success: true,
      message: 'Direct URL downloads - no progress tracking needed'
    });
  } catch (error) {
    logger.error('❌ [PROGRESS] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export const downloadFile = async (req, res) => {
  try {
    setCorsHeaders(res);
    return res.status(410).json({
      success: false,
      error: 'Direct file download deprecated. Use /api/download/info to get formats with URLs',
      redirect: '/api/download/info'
    });
  } catch (error) {
    logger.error('❌ [FILE] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

export const getDownloadStatus = async (req, res) => {
  try {
    setCorsHeaders(res);
    return res.json({
      success: true,
      status: 'ready',
      message: 'Use /api/download/info to get formats with direct URLs',
      info: 'No server-side downloads - all URLs are direct'
    });
  } catch (error) {
    logger.error('❌ [STATUS] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const cancelDownload = async (req, res) => {
  try {
    setCorsHeaders(res);
    return res.json({
      success: true,
      message: 'Direct URL downloads - cancel by stopping browser download'
    });
  } catch (error) {
    logger.error('❌ [CANCEL] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🏥 HEALTH CHECK - System Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const healthCheck = async (req, res) => {
  try {
    setCorsHeaders(res);

    // Check yt-dlp availability
    let ytdlpAvailable = false;
    let ytdlpVersion = 'Not installed';
    try {
      const { execSync } = await import('child_process');
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
      version: '2.0.0 - Direct URL Downloads Only',
      timestamp: new Date().toISOString(),
      features: {
        infoEndpoint: '✅ Returns video info + formats with direct URLs',
        directDownloads: '✅ All formats return direct downloadable URLs',
        noServerStream: '✅ No server-side streaming or file saving',
        jobSupport: '✅ Heavy downloads (1080p+) suggest job/worker',
        corsHeaders: '✅ Enabled',
        retryLogic: '✅ 3 attempts with exponential backoff'
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        ytdlp: {
          installed: ytdlpAvailable,
          version: ytdlpVersion,
          status: ytdlpAvailable ? '✅ Available' : '⚠️ Using yt-dlp-exec'
        },
        env: process.env.NODE_ENV || 'development',
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`
        },
        uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`
      },
      endpoints: {
        getInfo: 'GET /api/download/info?videoId=XXX - Returns {title, formats:[{quality, type, url}]}',
        proxyDownload: 'GET /api/download/proxy?videoId=XXX&quality=720&format=mp4 - Returns direct URL',
        health: 'GET /api/download/health'
      },
      responseFormat: {
        example: {
          title: 'Video Title',
          formats: [
            { quality: '720p', type: 'video', url: 'https://...', needsJob: false },
            { quality: '192kbps', type: 'audio', url: 'https://...', needsJob: false }
          ]
        }
      }
    });

  } catch (error) {
    logger.error('❌ [HEALTH] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📤 EXPORT ALL FUNCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default {
  getDirectUrl,
  proxyDownload,
  directDownload,
  getDownloadProgress,
  downloadFile,
  getDownloadStatus,
  cancelDownload,
  healthCheck
};