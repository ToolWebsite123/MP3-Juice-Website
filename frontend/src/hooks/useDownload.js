/* ✅ useDownload Hook - Direct URL Downloads (No Server File Save)
 * ═══════════════════════════════════════════════════════════════════════
 * 🎯 Uses direct URLs from server JSON responses
 * 🎯 Browser handles downloads natively
 * 🎯 Progress tracking optional (only for heavy downloads)
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useRef } from 'react';
import { getDownloadInfo } from '../lib/api.js';

export default function useDownload() {
  const [downloadState, setDownloadState] = useState({
    isDownloading: false,
    error: null,
    status: 'idle',
    progress: 0,
    directUrl: null,
    fileName: null,
    quality: '720',
    format: 'mp4',
    type: 'video',
    needsJob: false,
    downloadMethod: 'direct',
    videoInfo: null,
    formats: []
  });

  const abortControllerRef = useRef(null);
  const activeDownloadRef = useRef(null);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🚀 GET VIDEO INFO + FORMATS (Direct URLs)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const getVideoInfo = useCallback(async ({
    url,
    videoId
  }) => {
    if (!url && !videoId) {
      const error = 'URL or videoId required';
      console.error('❌', error);
      setDownloadState(prev => ({
        ...prev,
        error,
        status: 'failed'
      }));
      return { success: false, error };
    }

    const downloadIdentifier = videoId || url;

    if (activeDownloadRef.current === downloadIdentifier) {
      return { success: false, error: 'Already fetching' };
    }

    abortControllerRef.current = new AbortController();

    try {
      activeDownloadRef.current = downloadIdentifier;

      const API_BASE = getApiBaseUrl();
      const finalUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
      const finalVideoId = videoId || extractVideoId(url);

      setDownloadState(prev => ({
        ...prev,
        isDownloading: true,
        error: null,
        status: 'loading',
        progress: 10
      }));

      // Call /api/download/info using safeFetch with 15s timeout
      const data = await getDownloadInfo(
        finalUrl,
        finalVideoId,
        { signal: abortControllerRef.current.signal }
      );

      if (!data.success && !data.title) {
        throw new Error(data.error || 'Failed to get video info');
      }

      setDownloadState(prev => ({
        ...prev,
        status: 'ready',
        progress: 50,
        videoInfo: {
          title: data.title,
          videoId: finalVideoId
        },
        formats: data.formats || [],
        isDownloading: false
      }));

      return {
        success: true,
        title: data.title,
        formats: data.formats || [],
        videoId: finalVideoId
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        activeDownloadRef.current = null;
        setDownloadState(prev => ({
          ...prev,
          isDownloading: false,
          status: 'idle',
          progress: 0
        }));
        return { success: false, error: 'Cancelled' };
      }

      console.error('❌ Info fetch error:', error);
      activeDownloadRef.current = null;

      const errorMessage = error.message || 'Failed to get video info';
      let userFriendlyError = errorMessage;

      if (errorMessage.includes('Network')) {
        userFriendlyError = 'Network error. Check your connection.';
      } else if (errorMessage.includes('unavailable')) {
        userFriendlyError = 'Video unavailable or private.';
      }

      setDownloadState(prev => ({
        ...prev,
        isDownloading: false,
        error: userFriendlyError,
        status: 'failed',
        progress: 0
      }));

      setTimeout(() => {
        setDownloadState(prev => ({ ...prev, error: null, status: 'idle' }));
      }, 5000);

      return { success: false, error: userFriendlyError };
    }
  }, []);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🎯 GET DOWNLOAD URL FOR SPECIFIC FORMAT
     Returns direct CDN URL for progressive formats (144p-720p)
     Returns backend streaming endpoint for DASH formats (1080p+)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const getDirectUrl = useCallback(async ({
    url,
    videoId,
    format = 'mp4',
    quality = '720',
    type = 'video'
  }) => {
    if (!url && !videoId) {
      const error = 'URL or videoId required';
      console.error('❌', error);
      setDownloadState(prev => ({
        ...prev,
        error,
        status: 'failed'
      }));
      return { success: false, error };
    }

    const downloadIdentifier = videoId || url;

    if (activeDownloadRef.current === downloadIdentifier) {
      return { success: false, error: 'Already processing' };
    }

    abortControllerRef.current = new AbortController();

    try {
      activeDownloadRef.current = downloadIdentifier;

      const normalizedQuality = normalizeQuality(quality, format);
      const finalFormat = type === 'audio' ? 'mp3' : format;
      const API_BASE = getApiBaseUrl();
      const finalUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
      const finalVideoId = videoId || extractVideoId(url);

      setDownloadState(prev => ({
        ...prev,
        isDownloading: true,
        error: null,
        status: 'preparing',
        progress: 10,
        quality: normalizedQuality,
        format: finalFormat,
        type
      }));

      // ✅ Y2MATE STYLE: Backend returns JSON with direct CDN URL for progressive formats
      // Backend streams for DASH formats (1080p+)
      const USE_V1_API = true;
      const downloadEndpoint = USE_V1_API 
        ? `${API_BASE}/api/v1/video/download`
        : `${API_BASE}/api/download/proxy`;
      
      const response = await fetch(
        `${downloadEndpoint}?${new URLSearchParams({
          videoId: finalVideoId,
          quality: normalizedQuality,
          format: finalFormat
        })}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal
        }
      );

      if (!response.ok) {
        // Check if it's a streaming response (DASH format)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('video/')) {
          // DASH format - backend is streaming
          const streamingUrl = `${downloadEndpoint}?${new URLSearchParams({
            videoId: finalVideoId,
            quality: normalizedQuality,
            format: finalFormat
          })}`;

          const filename = createSafeFilename(
            'video',
            normalizedQuality,
            finalFormat
          );

          setDownloadState(prev => ({
            ...prev,
            status: 'ready',
            progress: 50,
            fileName: filename,
            directUrl: streamingUrl,
            needsJob: false,
            downloadMethod: 'stream',
            isDASH: true,
            videoInfo: {
              title: null,
              videoId: finalVideoId
            },
            isDownloading: false
          }));

          return {
            success: true,
            url: streamingUrl,
            filename,
            title: null,
            videoId: finalVideoId,
            needsJob: false,
            method: 'stream',
            isDASH: true
          };
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      // Check if response is streaming (DASH format) or JSON (progressive format)
      const contentType = response.headers.get('content-type');
      if (contentType && (contentType.includes('video/') || contentType.includes('audio/'))) {
        // DASH format - backend is streaming directly
        // Return the streaming URL - frontend will fetch as blob
        const streamingUrl = `${downloadEndpoint}?${new URLSearchParams({
          videoId: finalVideoId,
          quality: normalizedQuality,
          format: finalFormat
        })}`;

        const filename = createSafeFilename(
          'video',
          normalizedQuality,
          finalFormat
        );

        setDownloadState(prev => ({
          ...prev,
          status: 'ready',
          progress: 50,
          fileName: filename,
          directUrl: streamingUrl,
          needsJob: false,
          downloadMethod: 'blob',
          isDASH: true,
          videoInfo: {
            title: null,
            videoId: finalVideoId
          },
          isDownloading: false
        }));

        return {
          success: true,
          url: streamingUrl,
          filename,
          title: null,
          videoId: finalVideoId,
          needsJob: false,
          method: 'blob',
          isDASH: true,
          type: 'stream' // Backend is streaming
        };
      }

      // Progressive format - JSON response with direct CDN URL or merge endpoint
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to get download URL');
      }

      // ✅ Y2MATE BEHAVIOR: Check response type
      // needsMerge: true → Merge endpoint (use iframe to trigger download)
      // needsMerge: false → Direct CDN URL (use window.location.href)
      if (data.needsMerge && data.mergeEndpoint) {
        // DASH format (1080p+) - merge endpoint provided
        const filename = createSafeFilename(
          data.title || 'video',
          normalizedQuality,
          finalFormat
        );

        setDownloadState(prev => ({
          ...prev,
          status: 'ready',
          progress: 50,
          fileName: filename,
          directUrl: data.mergeEndpoint, // Merge endpoint URL
          needsJob: false,
          downloadMethod: 'merge',
          isDASH: true,
          videoInfo: {
            title: data.title,
            videoId: finalVideoId
          },
          isDownloading: false
        }));

        return {
          success: true,
          url: data.mergeEndpoint,
          filename,
          title: data.title,
          videoId: finalVideoId,
          needsJob: false,
          method: 'merge',
          isDASH: true,
          type: 'merge'
        };
      }

      // Direct CDN URL (progressive format - 144p-720p)
      const directUrl = data.url || data.directUrl;
      if (!directUrl) {
        throw new Error('No download URL available');
      }

      const filename = createSafeFilename(
        data.title || 'video',
        normalizedQuality,
        finalFormat
      );

      setDownloadState(prev => ({
        ...prev,
        status: 'ready',
        progress: 50,
        fileName: filename,
        directUrl: directUrl, // Direct YouTube CDN URL
        needsJob: false,
        downloadMethod: 'direct', // Use programmatic <a> download for direct CDN
        isDASH: false,
        videoInfo: {
          title: data.title,
          videoId: finalVideoId
        },
        isDownloading: false
      }));

      return {
        success: true,
        url: directUrl, // Direct YouTube CDN URL
        filename,
        title: data.title,
        videoId: finalVideoId,
        needsJob: false,
        method: 'direct', // Use window.location.href
        isDASH: false,
        type: 'direct'
      };

    } catch (error) {
      if (error.name === 'AbortError') {
        activeDownloadRef.current = null;
        setDownloadState(prev => ({
          ...prev,
          isDownloading: false,
          status: 'idle',
          progress: 0
        }));
        return { success: false, error: 'Cancelled' };
      }

      console.error('❌ URL fetch error:', error);
      activeDownloadRef.current = null;

      const errorMessage = error.message || 'Failed to get download URL';
      let userFriendlyError = errorMessage;

      if (errorMessage.includes('Network')) {
        userFriendlyError = 'Network error. Check your connection.';
      } else if (errorMessage.includes('unavailable')) {
        userFriendlyError = 'Video unavailable or private.';
      }

      setDownloadState(prev => ({
        ...prev,
        isDownloading: false,
        error: userFriendlyError,
        status: 'failed',
        progress: 0,
        directUrl: null
      }));

      setTimeout(() => {
        setDownloadState(prev => ({ ...prev, error: null, status: 'idle' }));
      }, 5000);

      return { success: false, error: userFriendlyError };
    }
  }, []);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🌐 BROWSER DOWNLOAD (Y2MATE STYLE)
     
     Direct CDN URLs: Use programmatic <a> download (forces download, no playback)
     Merge endpoints: Use hidden iframe to trigger download
     NEVER use window.location.href (opens video instead of downloading)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const startBrowserDownload = useCallback(async (downloadInfo = null) => {
    const info = downloadInfo || {
      directUrl: downloadState.directUrl,
      fileName: downloadState.fileName,
      needsJob: downloadState.needsJob,
      isDASH: downloadState.isDASH,
      downloadMethod: downloadState.downloadMethod
    };

    const { directUrl, fileName, downloadMethod } = info;

    if (!directUrl) {
      console.error('❌ No download URL available');
      setDownloadState(prev => ({
        ...prev,
        error: 'No download URL. Please try again.',
        status: 'failed'
      }));
      return { success: false, error: 'No download URL' };
    }

    // Check if needs job (heavy download)
    if (info.needsJob) {
      setDownloadState(prev => ({
        ...prev,
        error: 'Heavy download requires server processing. Please use job endpoint.',
        status: 'needsJob'
      }));
      return { success: false, error: 'Heavy download requires job processing', needsJob: true };
    }

    try {
      setDownloadState(prev => ({
        ...prev,
        status: 'downloading',
        progress: 75,
        isDownloading: true
      }));

      // ✅ Y2MATE BEHAVIOR: Handle based on download method
      if (downloadMethod === 'merge' || directUrl.includes('/api/') || directUrl.includes('/download')) {
        // Merge endpoint (DASH format) - use hidden iframe to trigger download
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.src = directUrl; // Merge endpoint URL
        
        document.body.appendChild(iframe);

        // Cleanup iframe after download starts
        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          } catch (cleanupErr) {
            // Ignore cleanup errors
          }
        }, 5000);

        showSuccessMessage();
        return { success: true, method: 'merge', fileName: fileName || 'video.mp4' };
      } else {
        // ✅ CRITICAL FIX: Direct CDN URL - use programmatic <a> download
        // NEVER use window.location.href (opens video instead of downloading)
        // ✅ FORCE DOWNLOAD: Create <a> element with download attribute
        const link = document.createElement('a');
        link.href = directUrl;
        link.download = fileName || 'video.mp4'; // Force download with filename
        link.style.display = 'none'; // Hide the link
        document.body.appendChild(link);
        link.click(); // Trigger download
        document.body.removeChild(link); // Cleanup

        showSuccessMessage();
        return { success: true, method: 'direct', fileName: fileName || 'video.mp4' };
      }

    } catch (error) {
      console.error('❌ Download failed:', error);

      setDownloadState(prev => ({
        ...prev,
        error: 'Failed to start download. Please try again.',
        status: 'failed',
        isDownloading: false
      }));

      return { success: false, error: error.message };
    }
  }, [downloadState]);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🎉 SUCCESS MESSAGE
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const showSuccessMessage = () => {
    setTimeout(() => {
      setDownloadState(prev => ({
        ...prev,
        status: 'completed',
        progress: 100
      }));

      // Reset after 3 seconds
      setTimeout(() => {
        activeDownloadRef.current = null;
        setDownloadState(prev => ({
          ...prev,
          isDownloading: false,
          status: 'idle',
          progress: 0,
          directUrl: null
        }));
      }, 3000);
    }, 1000);
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ❌ CANCEL DOWNLOAD
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const cancelDownload = useCallback(() => {

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    activeDownloadRef.current = null;

    setDownloadState({
      isDownloading: false,
      error: null,
      status: 'idle',
      progress: 0,
      directUrl: null,
      fileName: null,
      quality: '720',
      format: 'mp4',
      type: 'video',
      needsJob: false,
      downloadMethod: 'direct',
      videoInfo: null,
      formats: []
    });

  }, []);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🔥 ONE-CLICK DOWNLOAD (Complete Flow)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const directDownload = useCallback(async (params) => {

    // Step 1: Get direct URL
    const urlResult = await getDirectUrl(params);

    if (!urlResult.success) {
      console.error('❌ Failed to get URL:', urlResult.error);
      return urlResult;
    }


    // Step 2: Start browser download
    await new Promise(resolve => setTimeout(resolve, 200));

    return startBrowserDownload({
      directUrl: urlResult.url,
      fileName: urlResult.filename,
      needsJob: urlResult.needsJob
    });
  }, [getDirectUrl, startBrowserDownload]);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     📤 RETURN
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  return {
    // State
    isDownloading: downloadState.isDownloading,
    error: downloadState.error,
    status: downloadState.status,
    progress: downloadState.progress,
    directUrl: downloadState.directUrl,
    fileName: downloadState.fileName,
    quality: downloadState.quality,
    format: downloadState.format,
    type: downloadState.type,
    needsJob: downloadState.needsJob,
    downloadMethod: downloadState.downloadMethod,
    videoInfo: downloadState.videoInfo,
    formats: downloadState.formats,

    // Methods
    getVideoInfo,
    getDirectUrl,
    startBrowserDownload,
    cancelDownload,
    directDownload,
    // Aliases for backward compatibility
    prepareDownload: getDirectUrl,
    startDownload: getDirectUrl
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🛠️ UTILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function normalizeQuality(quality, format) {
  const defaultQuality = format === 'mp3' ? '192' : '720';
  if (!quality) return defaultQuality;
  return String(quality).replace(/p$/i, '').replace(/kbps?$/i, '').replace(/k$/i, '').trim();
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
    console.error('Error extracting video ID:', err);
  }
  return null;
}

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  return isLocal ? 'http://localhost:5000' : window.location.origin;
}

function createSafeFilename(title, quality, format) {
  const sanitizedTitle = (title || 'video')
    .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 80);

  const fileExtension = format === 'mp3' ? 'mp3' : 'mp4';
  const qualityLabel = format === 'mp3' ? `${quality}kbps` : `${quality}p`;

  return `${sanitizedTitle}_${qualityLabel}.${fileExtension}`;
}
