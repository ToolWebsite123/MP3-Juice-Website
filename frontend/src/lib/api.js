// ✅ PROFESSIONAL: api.js - Complete API with MP3 Juice Support

/* ----------------------------------------------------------
   🌐 API BASE URLS
---------------------------------------------------------- */
const isLocal = window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const API_BASE = isLocal
  ? "http://localhost:5000"
  : window.location.origin;

// ✅ NEW: Versioned API v1 (Recommended)
export const API_V1 = `${API_BASE}/api/v1`;
export const VIDEO_API_V1 = `${API_V1}/video`;

// ⚠️ DEPRECATED: Legacy API routes (for backward compatibility)
export const VIDEO_API = `${API_BASE}/api/video`;
export const DOWNLOAD_API = `${API_BASE}/api/download`;
export const SUGGESTION_API = `${VIDEO_API}/suggestions`;

// Use v1 API by default (can be changed via env)
// Vite uses import.meta.env instead of process.env
// If VITE_USE_V1_API is not set or is not 'false', default to true
export const USE_V1_API = (import.meta.env.VITE_USE_V1_API || 'true') !== 'false';

// API Configuration loaded

/* ----------------------------------------------------------
   🛡️ SAFE FETCH with Timeout
---------------------------------------------------------- */
async function safeFetch(url, options = {}, timeout = 30000) {
  // Create a combined abort controller that respects both timeout and external signal
  const controller = new AbortController();
  let timer = null;

  // Set up timeout abort
  timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  // If external signal exists, listen to it and abort our controller when it aborts
  if (options.signal) {
    if (options.signal.aborted) {
      // Signal already aborted, abort immediately
      controller.abort();
    } else {
      // Listen to external signal abort
      options.signal.addEventListener('abort', () => {
        controller.abort();
      });
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal, // Use our combined signal
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    clearTimeout(timer);

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        errorMessage = await res.text().catch(() => errorMessage);
      }
      throw new Error(errorMessage);
    }

    return res;

  } catch (err) {
    clearTimeout(timer);

    // Handle abort errors gracefully
    if (err.name === 'AbortError') {
      // Check if external signal was aborted
      if (options.signal && options.signal.aborted) {
        // External abort - rethrow original abort error
        console.error(`❌ [API] Request aborted by external signal`);
        throw err;
      } else {
        // Our timeout - throw timeout error with clear message
        // ✅ CRITICAL: Convert AbortError to timeout error for fallback logic
        // WHY: AbortError from timeout should be treated as timeout, not abort
        throw new Error('Request timeout - please try again');
      }
    }

    // ✅ Only log non-abort errors (abort errors are handled above)
    console.error(`❌ [API] Error:`, err);

    if (err.message.includes('Failed to fetch')) {
      throw new Error('Cannot connect to server');
    }

    throw err;
  }
}

/* ----------------------------------------------------------
   🎯 GET DIRECT DOWNLOAD URL (MP3 Juice Style - Step 1)
   
   ✅ This gets the direct YouTube CDN URL
   ✅ Does NOT download file to server
   ✅ Returns JSON with directUrl
   ✅ User clicks "Download" button after this
---------------------------------------------------------- */
export async function getDirectDownloadUrl({
  url,
  videoId,
  quality = '720',
  format = 'mp4',
  type = 'video'
}) {
  try {
    if (!url && !videoId) {
      throw new Error('URL or videoId is required');
    }


    const normalizedQuality = String(quality)
      .replace(/p$/i, '')
      .replace(/kbps?$/i, '')
      .replace(/k$/i, '');

    const finalUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
    const finalVideoId = videoId || extractVideoId(url);

    const queryParams = new URLSearchParams({
      url: finalUrl,
      quality: normalizedQuality,
      format: format === 'audio' ? 'mp3' : format,
      type: type || 'video'
    });

    if (finalVideoId) {
      queryParams.append('videoId', finalVideoId);
    }

    // ✅ CRITICAL: Use /url endpoint (NOT /direct)
    // /url returns JSON with directUrl
    // /direct returns file blob (wrong for MP3 Juice flow!)
    const response = await safeFetch(
      `${DOWNLOAD_API}/url?${queryParams.toString()}`,
      { method: 'GET' },
      30000
    );

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get download URL');
    }

    if (!data.directUrl) {
      throw new Error('No direct URL in response');
    }


    return {
      success: true,
      directUrl: data.directUrl,
      title: data.title || 'video',
      duration: data.duration || 0,
      fileSize: data.fileSize || null,
      videoId: data.videoId || finalVideoId,
      format: data.format || format,
      quality: data.quality || normalizedQuality
    };

  } catch (error) {
    console.error('❌ [MP3 Juice Step 1] Error:', error);

    return {
      success: false,
      error: error.message || 'Failed to get download URL'
    };
  }
}

/* ----------------------------------------------------------
   📋 GET DOWNLOAD INFO (Formats with Direct URLs)
---------------------------------------------------------- */
export async function getDownloadInfo(url, videoId = null, options = {}) {
  if (!url && !videoId) {
    throw new Error('URL or videoId is required');
  }

  try {
    const finalUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
    const finalVideoId = videoId || extractVideoId(url);

    const queryParams = new URLSearchParams({
      url: finalUrl
    });

    if (finalVideoId) {
      queryParams.append('videoId', finalVideoId);
    }


    // ✅ Use v1 API endpoint (POST method)
    const USE_V1_API = true;
    const infoEndpoint = USE_V1_API
      ? `${VIDEO_API_V1}/info`
      : `${DOWNLOAD_API}/info`;

    // v1 API uses POST, legacy uses GET
    const fetchOptions = USE_V1_API
      ? {
        method: 'POST',
        body: JSON.stringify({ url: finalUrl, videoId: finalVideoId }),
        headers: { 'Content-Type': 'application/json' },
        signal: options.signal
      }
      : {
        method: 'GET',
        signal: options.signal
      };

    const fetchUrl = USE_V1_API
      ? infoEndpoint
      : `${infoEndpoint}?${queryParams.toString()}`;

    // Fetches ALL formats in parallel (144p-1080p + audio) - needs longer timeout
    const res = await safeFetch(
      fetchUrl,
      fetchOptions,
      60000 // 60s timeout - backend fetches multiple formats in parallel
    );

    const data = await res.json();

    // Backend v1 returns {success, video: {...}, videoFormats: [...], audioFormats: [...]}
    // Legacy returns {success, title, formats} or {title, formats}

    let title, formats = [], returnVideoId = finalVideoId, duration = 0;

    if (data.success && data.video) {
      // v1 API response structure
      title = data.video.title;
      returnVideoId = data.video.videoId || finalVideoId;
      duration = data.video.duration || 0;
      // Combine video and audio formats
      formats = [
        ...(data.videoFormats || []).map(f => ({ ...f, type: 'video' })),
        ...(data.audioFormats || []).map(f => ({ ...f, type: 'audio' }))
      ];
    } else if (data.title || data.success) {
      // Legacy response structure
      title = data.title || data.video?.title;
      formats = data.formats || [];
      returnVideoId = data.videoId || data.video?.videoId || finalVideoId;
      duration = data.duration || data.video?.duration || 0;
    } else {
      throw new Error(data.error || 'Failed to get download info');
    }


    return {
      success: true,
      title,
      formats,
      videoId: returnVideoId,
      duration
    };

  } catch (err) {
    console.error('❌ [getDownloadInfo] Error:', err);
    throw new Error(`Download info failed: ${err.message}`);
  }
}

/* ----------------------------------------------------------
   🔍 SEARCH YOUTUBE VIDEOS
   ✅ Uses new API v1 endpoint (with fallback to legacy)
---------------------------------------------------------- */
export async function searchVideos(query, options = {}) {
  const useV1 = options.useV1 !== false; // Default to v1
  if (!query?.trim()) {
    throw new Error('Search query is required');
  }

  try {
    const trimmedQuery = query.trim();
    // ✅ Use v1 API endpoint
    const USE_V1_API = true;
    const searchEndpoint = USE_V1_API
      ? `${VIDEO_API_V1}/search`
      : `${VIDEO_API}/search`;

    // Request 20 results by default (fast MP3Juice-style), cap handled server-side
    const url = `${searchEndpoint}?query=${encodeURIComponent(trimmedQuery)}&limit=20`;


    // Search timeout - increased to 30s to match backend
    const res = await safeFetch(url, {
      method: 'GET',
      signal: options.signal
    }, 30000); // 30s timeout to allow backend processing time

    const data = await res.json();

    let videos = [];

    if (data.success === true && Array.isArray(data.results)) {
      videos = data.results;
    }
    else if (data.success === true && Array.isArray(data.videos)) {
      videos = data.videos;
    }
    else if (Array.isArray(data)) {
      videos = data;
    }
    else if (data.results && Array.isArray(data.results)) {
      videos = data.results;
    }

    return videos;

  } catch (err) {
    console.error('❌ [searchVideos] Error:', err);
    throw new Error(`Search failed: ${err.message}`);
  }
}

/* ----------------------------------------------------------
   🎬 GET VIDEO INFO
   ✅ Uses new API v1 endpoint (with fallback to legacy)
---------------------------------------------------------- */
export async function getVideoInfo(url, options = {}) {
  if (!url?.trim()) throw new Error('URL is required');

  try {

    // ✅ Try new API v1 first, fallback to legacy
    const useV1 = options.useV1 !== false; // Default to v1

    const apiUrl = useV1
      ? `${VIDEO_API_V1}/info`
      : `${VIDEO_API}/info`;

    /**
     * ✅ MP3 JUICE API CALL STRATEGY:
     * - Try v1 API first (30s timeout - backend needs time for yt-dlp + format processing)
     * - If v1 succeeds → return immediately (NO fallback)
     * - If v1 fails → single fallback to legacy API (60s timeout)
     * - WHY: Prevents double fetch, ensures single API call per video
     * 
     * ✅ CRITICAL: NO signal passed to safeFetch
     * - WHY: Request must complete even if component unmounts
     * - RESULT: Request completes → cached → no ERR_EMPTY_RESPONSE
     * 
     * ✅ TIMEOUT: 30s for v1 (not 15s)
     * - WHY: Backend needs time to:
     *   1. Check cache (1s)
     *   2. Call yt-dlp if not cached (10-20s)
     *   3. Process formats in parallel (5-10s)
     *   4. Return response
     * - RESULT: Prevents premature timeout, allows request to complete
     */
    // ✅ Increased timeout for long videos
    // WHY: Long videos need more time (backend timeout is 45s)
    // RESULT: Prevents ERR_EMPTY_RESPONSE for long videos
    const timeout = useV1 ? 60000 : 90000; // v1: 60s (increased from 30s), legacy: 90s

    try {
      // ✅ CRITICAL: NO signal - let request complete even if component unmounts
      // WHY: Component unmount ≠ cancel request (cache result for next mount)
      const res = await safeFetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({ url }),
        // ✅ NO signal: options.signal removed - request completes always
      }, timeout);

      // ✅ MP3 JUICE: v1 succeeded, return immediately (NO fallback)
      const rawData = await res.json();

      let videoData, audioFormats = [], videoFormats = [], relatedDownloads = [];

      if (rawData.success && rawData.video) {
        videoData = rawData.video;
        audioFormats = rawData.formats?.audio || rawData.audioFormats || [];
        videoFormats = rawData.formats?.video || rawData.videoFormats || [];
        relatedDownloads = rawData.relatedDownloads || [];
      }
      else if (rawData.title) {
        videoData = rawData;
        audioFormats = rawData.audioFormats || [];
        videoFormats = rawData.videoFormats || [];
        relatedDownloads = rawData.relatedDownloads || [];
      }
      else {
        throw new Error('Invalid response structure');
      }

      if (!videoData?.title) {
        throw new Error('Video data missing');
      }


      return {
        success: true,
        id: videoData.id || videoData.videoId || extractVideoId(url),
        title: videoData.title,
        thumbnail: videoData.thumbnail,
        duration: videoData.duration,
        durationString: videoData.durationString || formatDuration(videoData.duration),
        uploader: videoData.uploader || videoData.channel,
        view_count: videoData.view_count || 0,
        audioFormats: processAudioFormats(audioFormats),
        videoFormats: processVideoFormats(videoFormats),
        relatedDownloads: relatedDownloads || [] // ✅ Include related downloads
      };
    } catch (err) {
      // ✅ MP3 JUICE: Only fallback if v1 was used AND it failed
      // WHY: Single fallback, no retry loop - prevents duplicate fetches
      // Check for timeout, network errors, or abort errors (timeout abort)
      const shouldFallback = useV1 && (
        err.message?.includes('timeout') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('Cannot connect') ||
        err.name === 'AbortError' // Timeout abort from safeFetch
      );

      if (shouldFallback) {

        // ✅ MP3 JUICE: Fallback to legacy API (single fallback, no retry loop)
        // ✅ CRITICAL: NO signal - let fallback complete even if component unmounts
        // WHY: Fallback request must also complete to cache result
        const legacyRes = await safeFetch(`${VIDEO_API}/info`, {
          method: 'POST',
          body: JSON.stringify({ url }),
          // ✅ NO signal: options.signal removed - fallback completes always
        }, 60000); // Legacy gets full 60s timeout

        const legacyData = await legacyRes.json();

        let videoData, audioFormats = [], videoFormats = [], relatedDownloads = [];

        if (legacyData.success && legacyData.video) {
          videoData = legacyData.video;
          audioFormats = legacyData.audioFormats || [];
          videoFormats = legacyData.videoFormats || [];
          relatedDownloads = legacyData.relatedDownloads || [];
        }
        else if (legacyData.title) {
          videoData = legacyData;
          audioFormats = legacyData.audioFormats || [];
          videoFormats = legacyData.videoFormats || [];
          relatedDownloads = legacyData.relatedDownloads || [];
        }
        else {
          throw new Error('Invalid legacy response structure');
        }

        if (!videoData?.title) {
          throw new Error('Video data missing');
        }


        return {
          success: true,
          id: videoData.id || videoData.videoId || extractVideoId(url),
          title: videoData.title,
          thumbnail: videoData.thumbnail,
          duration: videoData.duration,
          durationString: videoData.durationString || formatDuration(videoData.duration),
          uploader: videoData.uploader || videoData.channel,
          view_count: videoData.view_count || 0,
          audioFormats: processAudioFormats(audioFormats),
          videoFormats: processVideoFormats(videoFormats),
          relatedDownloads: relatedDownloads || [] // ✅ Include related downloads
        };
      }

      // ✅ MP3 JUICE: Re-throw error if not a v1 timeout/fetch error
      throw err;
    }

  } catch (err) {
    console.error('❌ [getVideoInfo] Error:', err);
    throw new Error(`Video info failed: ${err.message}`);
  }
}

/* ----------------------------------------------------------
   🎵 PROCESS AUDIO FORMATS
---------------------------------------------------------- */
function processAudioFormats(formats) {
  if (!formats?.length) {
    return [];
  }

  // Backend returns: {bitrate, format, filesize, filesizeMB, directUrl}
  return formats.map(f => ({
    bitrate: f.bitrate || '128kbps',
    format: f.format || 'mp3',
    filesize: f.filesize,
    filesizeMB: f.filesizeMB,
    directUrl: f.directUrl
  }));
}

/* ----------------------------------------------------------
   🎬 PROCESS VIDEO FORMATS
---------------------------------------------------------- */
function processVideoFormats(formats) {
  if (!formats?.length) {
    return [];
  }

  // Backend returns: {qualityLabel, format, filesize, filesizeMB, directUrl, hasAudio, videoUrl, audioUrl, needsMerge}
  return formats.map(f => ({
    qualityLabel: f.qualityLabel || f.quality || `${f.height || 'unknown'}p`,
    format: f.format || 'mp4',
    filesize: f.filesize,
    filesizeMB: f.filesizeMB,
    directUrl: f.directUrl,
    hasAudio: f.hasAudio !== false,
    videoUrl: f.videoUrl,
    audioUrl: f.audioUrl,
    needsMerge: f.needsMerge || false
  }));
}

/* ----------------------------------------------------------
   🚀 START DOWNLOAD (Background Processing with Progress)
   
   ⚠️ This is different from MP3 Juice flow!
   This downloads file to server then user downloads from server
   Use getDirectDownloadUrl() for MP3 Juice flow instead!
---------------------------------------------------------- */
export async function startDownload({
  url,
  videoId,
  format = 'mp4',
  quality = '720',
  type = 'video',
  title = null,
  merged = true
}) {
  if (!url && !videoId) {
    throw new Error('URL or videoId required');
  }

  try {
    let finalUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
    let finalVideoId = videoId || extractVideoId(url);

    const normalizedQuality = String(quality)
      .replace(/p$/i, '')
      .replace(/kbps?$/i, '')
      .replace(/k$/i, '');

    const res = await safeFetch(`${DOWNLOAD_API}/start`, {
      method: 'POST',
      body: JSON.stringify({
        url: finalUrl,
        videoId: finalVideoId,
        format,
        quality: normalizedQuality,
        type,
        title,
        merged
      })
    }, 15000);

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Download failed to start');
    }

    const downloadId = data.downloadId || data.jobId;
    if (!downloadId) {
      throw new Error('No download ID returned from server');
    }


    return {
      success: true,
      downloadId,
      videoId: finalVideoId,
      title: data.title || title,
      quality: normalizedQuality,
      format,
      type,
      merged
    };

  } catch (err) {
    console.error('❌ [startDownload] Error:', err);
    throw new Error(`Download failed: ${err.message}`);
  }
}

/* ----------------------------------------------------------
   📊 GET DOWNLOAD STATUS (Polling)
---------------------------------------------------------- */
export async function getDownloadStatus(downloadId) {
  if (!downloadId) throw new Error('downloadId required');

  try {
    const res = await safeFetch(
      `${DOWNLOAD_API}/status/${downloadId}`,
      {},
      8000
    );

    const data = await res.json();

    return {
      status: data.status || 'unknown',
      progress: Math.min(100, Math.max(0, data.progress || 0)),
      message: data.message || '',
      filename: data.filename || data.fileName || '',
      downloaded: data.downloaded || 0,
      total: data.total || 0,
      speed: data.speed || 0,
      eta: data.eta || 0,
      downloadUrl: data.downloadUrl || '',
      error: data.error || ''
    };

  } catch (err) {
    console.error('❌ [getDownloadStatus] Error:', err);
    throw err;
  }
}

/* ----------------------------------------------------------
   📡 CONNECT TO PROGRESS STREAM (SSE + Polling Fallback)
---------------------------------------------------------- */
export function connectToProgress(downloadId, callbacks = {}) {
  const { onConnect, onProgress, onComplete, onError, onDisconnect } = callbacks;


  let eventSource = null;
  let pollInterval = null;
  let isCleanedUp = false;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;


    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (onDisconnect) onDisconnect();
  };

  const startPolling = () => {
    if (pollInterval || isCleanedUp) return;

    if (onConnect) onConnect({ method: 'polling' });

    pollInterval = setInterval(async () => {
      try {
        const status = await getDownloadStatus(downloadId);

        if (onProgress) {
          onProgress({
            progress: Math.min(100, Math.max(0, status.progress || 0)),
            status: status.status || 'processing',
            message: status.message || 'Processing...',
            downloaded: status.downloaded || 0,
            total: status.total || 0,
            speed: status.speed || 0,
            eta: status.eta || 0,
            filename: status.filename || status.fileName
          });
        }

        if (status.status === 'completed') {
          cleanup();
          if (onComplete) {
            onComplete({
              downloadId,
              filename: status.filename || status.fileName,
              downloadUrl: status.downloadUrl
            });
          }
        }

        if (status.status === 'failed' || status.status === 'error') {
          cleanup();
          if (onError) onError(status.message || status.error || 'Download failed');
        }

      } catch (err) {
        console.error('❌ [Polling] Error:', err);
      }
    }, 2000);
  };

  try {
    const sseUrl = `${DOWNLOAD_API}/progress/${downloadId}`;

    eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      if (onConnect) onConnect({ method: 'SSE' });
    };

    eventSource.onmessage = (event) => {
      try {
        if (event.data.startsWith(':') || event.data.trim() === '') return;

        const data = JSON.parse(event.data);

        if (data.type === 'progress' && onProgress) {
          onProgress({
            progress: Math.min(100, Math.max(0, data.progress || 0)),
            status: data.status || 'downloading',
            message: data.message || 'Downloading...',
            downloaded: data.downloaded || 0,
            total: data.total || 0,
            speed: data.speed || 0,
            eta: data.eta || 0,
            filename: data.filename || data.fileName
          });
        }
        else if ((data.type === 'complete' || data.type === 'completed') && onComplete) {
          cleanup();
          onComplete({
            downloadId,
            filename: data.filename || data.fileName,
            downloadUrl: data.downloadUrl
          });
        }
        else if (data.type === 'error' && onError) {
          cleanup();
          onError(data.message || data.error || 'Unknown error');
        }
      } catch (err) {
        console.error('❌ [SSE] Parse error:', err);
      }
    };

    eventSource.onerror = (error) => {
      cleanup();
      startPolling();
    };

  } catch (err) {
    console.error('❌ [SSE] Setup failed:', err);
    startPolling();
  }

  return cleanup;
}

/* ----------------------------------------------------------
   💾 DOWNLOAD FILE TO BROWSER
---------------------------------------------------------- */
export async function downloadFile(downloadId, filename = 'video.mp4') {
  if (!downloadId) throw new Error('Download ID required');

  try {

    const url = `${DOWNLOAD_API}/file/${downloadId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/octet-stream, video/mp4, audio/mpeg, video/*, audio/*'
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    let finalFilename = filename;

    if (contentDisposition) {
      const match = contentDisposition.match(/filename[^;=\n]*=["']?([^"'\n]*)["']?/i);
      if (match?.[1]) {
        finalFilename = decodeURIComponent(match[1]);
      }
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = finalFilename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    }, 500);

    return { success: true, filename: finalFilename };

  } catch (err) {
    console.error('❌ [downloadFile] Error:', err);
    throw new Error(`Download failed: ${err.message}`);
  }
}

/* ----------------------------------------------------------
   💡 GET SEARCH SUGGESTIONS
---------------------------------------------------------- */
export async function getSuggestions(query) {
  if (!query?.trim()) return [];

  try {
    // ✅ Use v1 API endpoint
    const USE_V1_API = true;
    const suggestionEndpoint = USE_V1_API
      ? `${VIDEO_API_V1}/suggestions`
      : `${SUGGESTION_API}`;

    const res = await safeFetch(
      `${suggestionEndpoint}?q=${encodeURIComponent(query)}`,
      {},
      5000
    );
    const data = await res.json();
    return data?.suggestions || [];
  } catch (err) {
    return [];
  }
}

/* ----------------------------------------------------------
   🔧 UTILITY FUNCTIONS
---------------------------------------------------------- */
export function extractVideoId(url) {
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
    console.error('Error extracting video ID:', err);
  }

  return null;
}

export function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;

  const patterns = [
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /^[a-zA-Z0-9_-]{11}$/
  ];

  return patterns.some(pattern => pattern.test(url.trim()));
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/* ----------------------------------------------------------
   📤 EXPORTS - ALL FUNCTIONS
---------------------------------------------------------- */
export default {
  // Video Functions
  getVideoInfo,
  searchVideos,
  getSuggestions,

  // Download Functions - MP3 Juice Style
  getDownloadInfo,         // ✅ Get formats with direct URLs (30s timeout)
  getDirectDownloadUrl,    // ✅ PRIMARY: Get direct URL (Step 1)
  startDownload,           // Background download with progress

  // Progress & Status
  connectToProgress,       // SSE + Polling for progress
  getDownloadStatus,       // Poll download status
  downloadFile,           // Download completed file

  // Utilities
  extractVideoId,
  isValidYouTubeUrl,
  formatFileSize,
  formatDuration,

  // Constants
  API_BASE,
  VIDEO_API,
  DOWNLOAD_API,
  SUGGESTION_API
};