/* ✅ FormatTable - Show Backend Formats & Direct Download
 * ═══════════════════════════════════════════════════════════════════════
 * 🎯 Shows ONLY formats from backend /api/download/info response
 * 🎯 Direct download on click (no extra modals)
 * 🎯 Simple UX: paste → select format → click → download
 * ═══════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';

const FormatTable = ({
  formats = [], // Legacy: formats array
  videoFormats = [], // New: videoFormats from backend /api/video/info
  audioFormats = [], // New: audioFormats from backend /api/video/info
  videoId,
  videoTitle = 'video' // Default title for filename
}) => {
  const [activeTab, setActiveTab] = useState('video');
  const [downloading, setDownloading] = useState(new Set());
  const [error, setError] = useState(null);

  // Use new structure if available, otherwise fallback to legacy formats array
  let processedVideoFormats = [];
  let processedAudioFormats = [];

  if (videoFormats.length > 0 || audioFormats.length > 0) {
    // 🔥 MP3 JUICE MODE: Show all quality options like MP3 JUICE
    // Video: 144p, 240p, 360p, 480p, 720p, 1080p
    // Audio: 320kbps, 256kbps, 192kbps, 128kbps, 64kbps (highest quality first)
    const allowedVideoQualities = ['144p', '240p', '360p', '480p', '720p', '1080p'];
    const allowedAudioBitrates = [320, 256, 192, 128, 64]; // ✅ Sort: 320 > 256 > 192 > 128 > 64 (highest first)
    
    processedVideoFormats = videoFormats
      .filter(f => {
        const quality = f.qualityLabel || f.quality || '';
        return allowedVideoQualities.includes(quality.toLowerCase());
      })
      .map(f => ({
        qualityLabel: f.qualityLabel || f.quality || 'Unknown',
        format: f.format || 'mp4',
        filesize: f.filesize,
        filesizeMB: f.filesizeMB,
        directUrl: f.directUrl,
        hasAudio: f.hasAudio !== false,
        videoUrl: f.videoUrl,
        audioUrl: f.audioUrl,
        needsMerge: f.needsMerge || false // Backend handles merging for 1080p+
      }))
      .sort((a, b) => {
        // ✅ Sort: 1080p FIRST (top), then 720p, 480p, 360p, 240p, 144p
        // WHY: Highest quality first (1080p at top)
        const order = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, '240p': 4, '144p': 5 };
        const aQuality = (a.qualityLabel || a.quality || '').toLowerCase().replace(/[^0-9p]/g, '');
        const bQuality = (b.qualityLabel || b.quality || '').toLowerCase().replace(/[^0-9p]/g, '');
        const aOrder = order[aQuality] ?? 99;
        const bOrder = order[bQuality] ?? 99;
        return aOrder - bOrder; // Lower number = higher priority = appears first
      });

    processedAudioFormats = audioFormats
      .filter(f => {
        // Handle bitrate as number or string
        let bitrate = f.bitrate;
        if (!bitrate && f.quality) {
          const qualityStr = String(f.quality);
          bitrate = parseInt(qualityStr.replace(/kbps$/i, '').replace(/k$/i, '')) || 0;
        }
        return allowedAudioBitrates.includes(bitrate);
      })
      .map(f => {
        // Ensure bitrate is a number
        let bitrate = f.bitrate;
        if (!bitrate && f.quality) {
          const qualityStr = String(f.quality);
          bitrate = parseInt(qualityStr.replace(/kbps$/i, '').replace(/k$/i, '')) || 128;
        }
        return {
          bitrate: bitrate || 128,
          quality: `${bitrate || 128}kbps`, // For display
          qualityLabel: `${bitrate || 128}kbps`, // For display
          format: f.format || 'mp3',
          filesize: f.filesize,
          filesizeMB: f.filesizeMB,
          directUrl: f.directUrl,
          url: f.directUrl || f.url
        };
      })
      .sort((a, b) => b.bitrate - a.bitrate); // ✅ Sort: 320kbps > 256kbps > 192kbps > 128kbps > 64kbps (highest quality first)
  } else {
    // Legacy structure: formats array with type field
    const allowedVideoQualities = ['144p', '240p', '360p', '480p', '720p', '1080p'];
    const allowedAudioBitrates = [320, 256, 192, 128, 64]; // ✅ Sort: 320 > 256 > 192 > 128 > 64 (highest first)
    
    processedVideoFormats = formats
      .filter(f => {
        if (f.type !== 'video' || f.hasAudio === false) return false;
        const quality = f.qualityLabel || f.quality || '';
        return allowedVideoQualities.includes(quality.toLowerCase());
      })
      .sort((a, b) => {
        // ✅ Sort: 1080p FIRST (top), then 720p, 480p, 360p, 240p, 144p
        // WHY: Highest quality first (1080p at top)
        const order = { '1080p': 0, '720p': 1, '480p': 2, '360p': 3, '240p': 4, '144p': 5 };
        const aQuality = (a.qualityLabel || a.quality || '').toLowerCase().replace(/[^0-9p]/g, '');
        const bQuality = (b.qualityLabel || b.quality || '').toLowerCase().replace(/[^0-9p]/g, '');
        const aOrder = order[aQuality] ?? 99;
        const bOrder = order[bQuality] ?? 99;
        return aOrder - bOrder; // Lower number = higher priority = appears first
      });
    
      processedAudioFormats = formats
      .filter(f => {
        if (f.type !== 'audio') return false;
        const bitrate = f.bitrate || parseInt(f.quality) || 0;
        return allowedAudioBitrates.includes(bitrate);
      })
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)); // ✅ Sort: 320kbps > 256kbps > 192kbps > 128kbps > 64kbps (highest first)
  }

  const currentFormats = activeTab === 'video' ? processedVideoFormats : processedAudioFormats;
  const hasVideoFormats = processedVideoFormats.length > 0;
  const hasAudioFormats = processedAudioFormats.length > 0;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🚀 DIRECT DOWNLOAD (One Click - Direct URL)
     
     ✅ MP3 JUICE BEHAVIOR: Download button does NOT fetch video info
     - Formats are already loaded from Downloader component
     - This function ONLY gets download URL for selected quality
     - WHY: Prevents duplicate /api/v1/video/info calls
     - RESULT: Instant download, zero API calls for video info
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const handleDownload = async (e, format) => {
    e.preventDefault();
    e.stopPropagation();

    // Create unique button ID
    const buttonId = activeTab === 'video' 
      ? `video-${format.qualityLabel || format.quality}` 
      : `audio-${format.bitrate || format.quality}`;

    setError(null);
    setDownloading(prev => new Set(prev).add(buttonId));

    try {
      // 🔥 MP3 JUICE MODE: Get download URL from backend
      let quality;
      if (activeTab === 'video') {
        const qualityStr = format.qualityLabel || format.quality || '720';
        quality = String(qualityStr).replace(/p$/i, '').replace(/P$/i, '');
      } else {
        // Audio: bitrate might be number or string
        const bitrate = format.bitrate || format.quality || '192';
        quality = typeof bitrate === 'number' ? String(bitrate) : String(bitrate).replace(/kbps$/i, '').replace(/k$/i, '');
      }
      
      const formatType = activeTab === 'video' ? 'mp4' : 'mp3';

      if (!videoId) {
        throw new Error('Video ID is required');
      }

      const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : window.location.origin;

      // ✅ Use v1 API endpoint
      const downloadEndpoint = `${API_BASE}/api/v1/video/download`;
      const downloadUrl = `${downloadEndpoint}?${new URLSearchParams({
        videoId: videoId,
        quality: quality,
        format: formatType
      })}`;

      
      // ✅ STEP 1: Fetch download URL from backend
      // ✅ CRITICAL: This is /api/v1/video/download, NOT /info
      // WHY: Video info already fetched, this only gets download URL for selected quality
      // RESULT: No duplicate video info fetch, instant download
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `Download failed: ${response.status} ${response.statusText}`;
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'No download URL available');
      }

      // ✅ STEP 2: Extract download URL and filename
      const finalDownloadUrl = data.mergeEndpoint || data.directUrl || data.url;
      if (!finalDownloadUrl) {
        throw new Error('No download URL available in response');
      }

      // Use filename from backend or generate one
      let filename = data.filename || `${videoTitle || 'video'}_${quality}${formatType === 'mp3' ? 'kbps' : 'p'}.${formatType}`;
      
      // Sanitize filename
      filename = filename
        .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .substring(0, 200);


      // ✅ STEP 3: Trigger browser native download - MP3 JUICE Style (FORAN/INSTANT)
      // MP3 JUICE style: Instant download trigger, browser handles the rest
      
      if (data.needsMerge && data.mergeEndpoint) {
        // ✅ DASH Format (ALL qualities): Use merge endpoint
        // Backend will handle merging and streaming
        
        // Verify mergeEndpoint URL is correct
        if (!data.mergeEndpoint.includes('videoId=')) {
          throw new Error('Invalid merge endpoint URL');
        }
        
        // ✅ MP3 JUICE STYLE: Use merge endpoint directly in <a> tag
        // Backend streams merged file with proper headers to trigger download
        const link = document.createElement('a');
        link.href = data.mergeEndpoint;
        link.download = filename; // ✅ Force download with filename
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          document.body.removeChild(link);
        }, 100);
        
      } else {
        // ✅ Progressive format: Use backend streaming endpoint (bypasses CORS)
        // Backend streams video directly, frontend uses <a> tag to trigger download
        
        // ✅ MP3 JUICE STYLE: Use backend streaming endpoint in <a> tag
        // This bypasses CORS and triggers direct download (no video play)
        const streamUrl = data.streamUrl || data.directUrl || finalDownloadUrl;
        
        // Verify it's a backend endpoint (not CDN URL)
        const isBackendEndpoint = streamUrl.includes('/api/v1/video/stream') || streamUrl.includes('/api/v1/video/merge');
        
        if (!isBackendEndpoint && streamUrl.startsWith('http')) {
          // If still a CDN URL, construct backend stream endpoint
          const backendStreamUrl = `${API_BASE}/api/v1/video/stream?${new URLSearchParams({
            videoId: videoId,
            quality: quality,
            format: formatType
          })}`;
          
          
          const link = document.createElement('a');
          link.href = backendStreamUrl;
          link.download = filename; // ✅ Force download with filename
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);
          
        } else {
          // Use the backend streaming endpoint directly
          const link = document.createElement('a');
          link.href = streamUrl;
          link.download = filename; // ✅ Force download with filename
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
          }, 100);
          
        }
      }

      // ✅ STEP 4: Update downloading state (clear after delay)
      setTimeout(() => {
        setDownloading(prev => {
          const newSet = new Set(prev);
          newSet.delete(buttonId);
          return newSet;
        });
      }, 2000);


    } catch (err) {
      console.error('❌ [MP3 JUICE] Download error:', err);
      setError(err.message || 'Download failed');
      setDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(buttonId);
        return newSet;
      });
      setTimeout(() => setError(null), 5000);
    }
  };

  const handlePlay = async (e, format) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const quality = activeTab === 'video' 
        ? (format.qualityLabel || format.quality || '720').replace('p', '').replace('P', '')
        : (() => {
            const bitrate = format.bitrate || format.quality || '192';
            return typeof bitrate === 'number' ? String(bitrate) : String(bitrate).replace(/kbps$/i, '').replace(/k$/i, '');
          })();
      
      const formatType = activeTab === 'video' ? 'mp4' : 'mp3';

      if (!videoId) {
        throw new Error('Video ID is required');
      }

      const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : window.location.origin;

      // ✅ Use v1 API endpoint
      const USE_V1_API = true;
      const downloadEndpoint = USE_V1_API 
        ? `${API_BASE}/api/v1/video/download`
        : `${API_BASE}/api/download/proxy`;
      
      // Get direct URL from backend
      const proxyResponse = await fetch(`${downloadEndpoint}?${new URLSearchParams({
        videoId: videoId,
        quality: quality,
        format: formatType
      })}`);

      if (!proxyResponse.ok) {
        const errorData = await proxyResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get play URL');
      }

      const data = await proxyResponse.json();
      
      if (!data.success || !data.directUrl) {
        throw new Error('No direct URL available');
      }

      // 🔥 MP3 JUICE MODE: Play directly from CDN in new tab
      window.open(data.directUrl, '_blank');

    } catch (err) {
      console.error('❌ Play error:', err);
      setError(err.message || 'Play failed');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleTabChange = (e, tab) => {
    e.preventDefault();
    e.stopPropagation();

    if ((tab === 'audio' && !hasAudioFormats) || (tab === 'video' && !hasVideoFormats)) {
      return;
    }

    setActiveTab(tab);
    setError(null);
  };

  return (
    <div className="w-full bg-white">

      {/* TABS - MP3 JUICE Style - Responsive */}
      <div className="flex border-b-2 border-gray-200">
        <button
          type="button"
          onClick={(e) => handleTabChange(e, 'video')}
          disabled={!hasVideoFormats}
          className={`
            flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-3 font-medium text-xs sm:text-sm transition-all duration-200
            ${activeTab === 'video'
              ? 'bg-white text-red-600 border-b-2 border-red-600 font-semibold'
              : 'bg-gray-50 text-gray-600 hover:text-gray-800'
            }
            ${!hasVideoFormats ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          ▶ Video
        </button>

        <button
          type="button"
          onClick={(e) => handleTabChange(e, 'audio')}
          disabled={!hasAudioFormats}
          className={`
            flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-3 font-medium text-xs sm:text-sm transition-all duration-200
            ${activeTab === 'audio'
              ? 'bg-white text-red-600 border-b-2 border-red-600 font-semibold'
              : 'bg-gray-50 text-gray-600 hover:text-gray-800'
            }
            ${!hasAudioFormats ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          ♫ Audio
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center gap-2 text-red-700 text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* TABLE - Responsive: Cards on mobile, Table on desktop */}
      <div className="w-full">
        {currentFormats.length === 0 ? (
          <div className="text-center py-12 sm:py-16 text-gray-500">
            <svg className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-base sm:text-lg font-medium text-gray-700">No {activeTab} formats available</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-2">Formats are loaded from backend</p>
          </div>
        ) : (
          <>
            {/* Mobile: Card Layout */}
            <div className="block md:hidden space-y-3">
              {currentFormats.map((format, index) => {
                const buttonId = activeTab === 'video'
                  ? `video-${format.qualityLabel || format.quality}`
                  : `audio-${format.bitrate || format.quality}`;
                const isDownloading = downloading.has(buttonId);
                const canDownload = format.available !== false;
                const qualityLabel = activeTab === 'video' 
                  ? `${format.qualityLabel || format.quality || 'Unknown'} (.mp4)`
                  : `MP3 ${format.bitrate || format.quality || format.qualityLabel || 'Unknown'}${activeTab === 'audio' && !String(format.bitrate || format.quality || format.qualityLabel || '').includes('kbps') ? 'kbps' : ''}`;

                return (
                  <div key={`mobile-${qualityLabel}-${index}`} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {activeTab === 'video' 
                            ? `${format.qualityLabel || format.quality || 'Unknown'} (.mp4)`
                            : `MP3 ${format.bitrate || format.quality || format.qualityLabel || 'Unknown'}${!String(format.bitrate || format.quality || format.qualityLabel || '').includes('kbps') ? 'kbps' : ''}`
                          }
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Format: Auto</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDownload(e, format)}
                        disabled={isDownloading || !canDownload}
                        className={`
                          inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium
                          transition-all duration-200 rounded-md whitespace-nowrap
                          ${isDownloading
                            ? 'bg-green-500 text-white cursor-wait'
                            : canDownload
                              ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }
                          disabled:opacity-75
                        `}
                        title="Download file"
                      >
                        {isDownloading ? (
                          <>
                            <svg className="animate-spin h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="hidden sm:inline">Downloading...</span>
                            <span className="sm:hidden">...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Table Layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-white">
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">File type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Format</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {currentFormats.map((format, index) => {
                    const buttonId = activeTab === 'video'
                      ? `video-${format.qualityLabel || format.quality}`
                      : `audio-${format.bitrate || format.quality}`;
                    const isDownloading = downloading.has(buttonId);
                    const canDownload = format.available !== false;
                    const qualityLabel = activeTab === 'video' 
                      ? `${format.qualityLabel || format.quality || 'Unknown'} (.mp4)`
                      : `MP3 ${format.bitrate || format.quality || format.qualityLabel || 'Unknown'}${!String(format.bitrate || format.quality || format.qualityLabel || '').includes('kbps') ? 'kbps' : ''}`;

                    return (
                      <tr key={`desktop-${qualityLabel}-${index}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                          {activeTab === 'video' 
                            ? `${format.qualityLabel || format.quality || 'Unknown'} (.mp4)`
                            : `MP3 ${format.bitrate || format.quality || format.qualityLabel || 'Unknown'}${!String(format.bitrate || format.quality || format.qualityLabel || '').includes('kbps') ? 'kbps' : ''}`
                          }
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          Auto
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(e) => handleDownload(e, format)}
                            disabled={isDownloading || !canDownload}
                            className={`
                              inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium
                              transition-all duration-200 rounded-md
                              ${isDownloading
                                ? 'bg-green-500 text-white cursor-wait'
                                : canDownload
                                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }
                              disabled:opacity-75
                            `}
                            title="Download file"
                          >
                            {isDownloading ? (
                              <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span>Downloading...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Download</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

FormatTable.propTypes = {
  formats: PropTypes.array, // Legacy format
  videoFormats: PropTypes.arrayOf(PropTypes.shape({
    qualityLabel: PropTypes.string,
    format: PropTypes.string,
    filesize: PropTypes.string,
    filesizeMB: PropTypes.number,
    directUrl: PropTypes.string.isRequired,
    hasAudio: PropTypes.bool,
    videoUrl: PropTypes.string,
    audioUrl: PropTypes.string,
    needsMerge: PropTypes.bool
  })),
  audioFormats: PropTypes.arrayOf(PropTypes.shape({
    bitrate: PropTypes.string,
    format: PropTypes.string,
    filesize: PropTypes.string,
    filesizeMB: PropTypes.number,
    directUrl: PropTypes.string.isRequired
  })),
  videoId: PropTypes.string,
  videoTitle: PropTypes.string
};

export default FormatTable;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🛠️ UTILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function createSafeFilename(title, quality, format) {
  const sanitizedTitle = (title || 'video')
    .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 80);

  const fileExtension = format === 'mp3' ? 'mp3' : 'mp4';

  return `${sanitizedTitle}_${quality}.${fileExtension}`;
}
