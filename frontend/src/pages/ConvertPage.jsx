// ✅ ULTIMATE FINAL - ConvertPage.jsx (Compatible with new API)
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getVideoInfo, startDownload, connectToProgress, downloadFile } from "../lib/api";
import useVideoInfoCache from "../hooks/useVideoInfoCache";
// 
export default function ConvertPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const url = searchParams.get("url");

  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [downloadState, setDownloadState] = useState({
    isDownloading: false,
    downloadId: null,
    progress: 0,
    status: 'idle',
    downloaded: 0,
    total: 0,
    speed: 0,
    eta: 0,
    error: null
  });

  const fetchStatusRef = useRef({
    isFetching: false,
    hasFetched: false,
    abortController: null
  });
  const sseCleanup = useRef(null);
  const {
    getVideoInfoFromCache,
    getOrFetchVideoInfo,
  } = useVideoInfoCache();

  /* ----------------------------------------------------------
     🎯 Fetch Video Info
  ---------------------------------------------------------- */
  useEffect(() => {
    if (!url) {
      return;
    }
    
    if (fetchStatusRef.current.hasFetched && videoInfo?.url === url) {
      return;
    }
    
    if (fetchStatusRef.current.isFetching) {
      return;
    }

    const abortController = new AbortController();
    fetchStatusRef.current.abortController = abortController;
    const cacheKey = { url };
    
    const fetchInfo = async () => {
      if (fetchStatusRef.current.isFetching) {
        return;
      }

      try {
        fetchStatusRef.current.isFetching = true;
        setLoading(true);
        setError("");

        const cached = getVideoInfoFromCache(cacheKey);
        if (cached) {
          fetchStatusRef.current.hasFetched = true;
          setVideoInfo(cached);
          setLoading(false);
          return;
        }
        
        // ✅ Pass abort signal
        const data = await getOrFetchVideoInfo({
          ...cacheKey,
          fetcher: () => getVideoInfo(url, { signal: abortController.signal }),
        });
        
        if (abortController.signal.aborted) {
          return;
        }
        
        // ✅ Data is already validated and normalized in api.js
        fetchStatusRef.current.hasFetched = true;
        
        setVideoInfo(data);
        setError("");
        
      } catch (err) {
        console.error("❌ Error fetching video info:", err);
        
        if (abortController.signal.aborted) {
          return;
        }
        
        fetchStatusRef.current.hasFetched = false;
        
        let errorMessage = "Failed to load video info";
        
        if (err.message?.includes("Invalid video data")) {
          errorMessage = "Invalid video data. Please try again.";
        } else if (err.message?.includes("Network")) {
          errorMessage = "Network error. Check connection.";
        } else if (err.message?.includes("timeout")) {
          errorMessage = "Request timed out. Check backend server.";
        } else if (err.message?.includes("Cannot connect")) {
          errorMessage = "Backend server not running. Please start server.";
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
        setVideoInfo(null);
        
      } finally {
        fetchStatusRef.current.isFetching = false;
        
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchInfo();
    
    return () => {
      if (fetchStatusRef.current.abortController) {
        fetchStatusRef.current.abortController.abort();
      }
    };
    
  }, [url, videoInfo?.url]);

  /* ----------------------------------------------------------
     🎯 Handle Download
  ---------------------------------------------------------- */
  const handleDownload = useCallback(async (format, quality) => {
    if (downloadState.isDownloading) {
      return;
    }

    try {
      setDownloadState({
        isDownloading: true,
        downloadId: null,
        progress: 0,
        status: 'starting',
        downloaded: 0,
        total: 0,
        speed: 0,
        eta: 0,
        error: null
      });

      const response = await startDownload({
        url,
        format: format || "mp4",
        quality: quality || "720",
        title: videoInfo?.title
      });

      if (!response || !response.downloadId) {
        throw new Error("Invalid response from server");
      }

      const { downloadId } = response;

      setDownloadState(prev => ({
        ...prev,
        downloadId,
        status: 'connecting'
      }));

      const cleanup = connectToProgress(downloadId, {
        onConnect: (data) => {
          setDownloadState(prev => ({
            ...prev,
            status: 'downloading'
          }));
        },

        onProgress: (data) => {
          const validProgress = Math.min(100, Math.max(0, data.progress || 0));
          
          setDownloadState(prev => ({
            ...prev,
            progress: validProgress,
            downloaded: Math.max(0, data.downloaded || 0),
            total: Math.max(0, data.total || 0),
            speed: Math.max(0, data.speed || 0),
            eta: Math.max(0, data.eta || 0),
            status: data.status || 'downloading'
          }));
        },

        onComplete: (data) => {
          setDownloadState(prev => ({
            ...prev,
            progress: 100,
            status: 'completed',
            eta: 0,
            speed: 0
          }));

          setTimeout(() => {
            const sanitizedTitle = videoInfo?.title
              ?.replace(/[^\w\s-]/gi, "_")
              .replace(/\s+/g, "_")
              .substring(0, 100) || "video";
            
            const filename = `${sanitizedTitle}.${format || "mp4"}`;
            
            downloadFile(downloadId, filename).catch(err => {
              console.error("❌ File download error:", err);
            });
          }, 1000);

          setTimeout(() => {
            setDownloadState({
              isDownloading: false,
              downloadId: null,
              progress: 0,
              status: 'idle',
              downloaded: 0,
              total: 0,
              speed: 0,
              eta: 0,
              error: null
            });
          }, 5000);
        },

        onError: (error) => {
          console.error("❌ Download error:", error);
          
          const errorMessage = typeof error === 'string' ? error : error?.message || 'Download failed';
          
          setDownloadState(prev => ({
            ...prev,
            status: 'failed',
            error: errorMessage,
            isDownloading: false,
            eta: 0,
            speed: 0
          }));

          setError(`⚠️ ${errorMessage}`);

          setTimeout(() => {
            setDownloadState({
              isDownloading: false,
              downloadId: null,
              progress: 0,
              status: 'idle',
              downloaded: 0,
              total: 0,
              speed: 0,
              eta: 0,
              error: null
            });
            setError("");
          }, 5000);
        },

        onDisconnect: () => {
        }
      });

      sseCleanup.current = cleanup;

    } catch (err) {
      console.error("❌ Download start error:", err);
      
      let errorMessage = "Download failed. Please try again.";
      
      if (err.message?.includes("Backend server")) {
        errorMessage = "Backend server not running.";
      } else if (err.message?.includes("timeout")) {
        errorMessage = "Download timed out.";
      } else if (err.message?.includes("Network") || err.message?.includes("Failed to fetch")) {
        errorMessage = "Network error.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(`⚠️ ${errorMessage}`);
      
      setDownloadState({
        isDownloading: false,
        downloadId: null,
        progress: 0,
        status: 'failed',
        downloaded: 0,
        total: 0,
        speed: 0,
        eta: 0,
        error: errorMessage
      });

      setTimeout(() => {
        setDownloadState(prev => ({
          ...prev,
          status: 'idle',
          error: null,
          isDownloading: false
        }));
        setError("");
      }, 5000);
    }
  }, [url, downloadState.isDownloading, videoInfo]);

  /* ----------------------------------------------------------
     🧹 Cleanup
  ---------------------------------------------------------- */
  useEffect(() => {
    return () => {
      if (fetchStatusRef.current.abortController) {
        fetchStatusRef.current.abortController.abort();
      }
      
      if (sseCleanup.current) {
        try {
          sseCleanup.current();
        } catch (err) {
          // Cleanup error ignored
        }
        sseCleanup.current = null;
      }
    };
  }, []);

  /* ----------------------------------------------------------
     🔄 Manual Retry
  ---------------------------------------------------------- */
  const handleRetry = useCallback(() => {
    setError("");
    setVideoInfo(null);
    setLoading(false);
    fetchStatusRef.current.hasFetched = false;
    fetchStatusRef.current.isFetching = false;
  }, []);

  /* ----------------------------------------------------------
     📊 Helper Functions
  ---------------------------------------------------------- */
  const getStatusMessage = () => {
    switch (downloadState.status) {
      case 'starting':
        return '🔄 Initializing...';
      case 'connecting':
        return '📡 Connecting...';
      case 'downloading':
        return `📥 Downloading... ${Math.round(downloadState.progress)}%`;
      case 'processing':
        return `⚙️ Processing... ${Math.round(downloadState.progress)}%`;
      case 'completed':
        return '✅ Complete! Saving...';
      case 'failed':
        return `❌ ${downloadState.error || 'Failed'}`;
      default:
        return '';
    }
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return "Unknown";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(2)} MB`;
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return "Unknown";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  /* ----------------------------------------------------------
     🟡 No URL
  ---------------------------------------------------------- */
  if (!url) {
    return (
      <div className="max-w-4xl mx-auto mt-16 px-4 text-center">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8">
          <p className="text-yellow-800 text-lg font-semibold mb-2">⚠️ No video URL</p>
          <p className="text-yellow-600 mb-4">Please search for a video first.</p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-[#a4161a] text-white rounded-lg hover:bg-[#800000] transition"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------
     🟢 Main UI
  ---------------------------------------------------------- */
  return (
    <div className="max-w-5xl mx-auto mt-8 px-4 pb-12">
      
      {/* Loading */}
      {loading && !videoInfo && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[#a4161a] border-t-transparent animate-spin"></div>
          </div>
          <p className="text-gray-600 mt-4 font-medium">⏳ Fetching video info...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && !downloadState.isDownloading && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 text-center shadow-lg mb-6">
          <p className="text-red-700 font-semibold mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleRetry}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
            >
              🔄 Try Again
            </button>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
            >
              🏠 Go Home
            </button>
          </div>
        </div>
      )}

      {/* Video Info */}
      {videoInfo && !loading && (
        <div className="bg-white shadow-2xl rounded-2xl overflow-hidden border border-gray-200">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-[#a4161a] to-[#800000] p-6 flex flex-col md:flex-row gap-6 items-start">
            <div className="w-full md:w-80 shrink-0">
              <img
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                className="w-full rounded-lg shadow-lg aspect-video object-cover"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/480x270?text=No+Thumbnail';
                }}
              />
            </div>
            <div className="flex-1 text-white">
              <h2 className="text-2xl font-bold mb-3 leading-tight">{videoInfo.title}</h2>
              <div className="space-y-1.5 text-white/90">
                {videoInfo.uploader && (
                  <p className="flex items-center gap-2">
                    👤 {videoInfo.uploader}
                  </p>
                )}
                {videoInfo.duration && (
                  <p className="flex items-center gap-2">
                    ⏱️ {videoInfo.duration}
                  </p>
                )}
                {videoInfo.view_count && (
                  <p className="flex items-center gap-2">
                    👁️ {videoInfo.view_count.toLocaleString()} views
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Download Options */}
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              ⬇️ Select Format
            </h3>

            {/* Quick Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <button
                disabled={downloadState.isDownloading}
                onClick={() => handleDownload("mp4", "720")}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700
                text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl
                transform hover:-translate-y-1 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                flex items-center justify-center gap-3"
              >
                🎥 {downloadState.isDownloading ? 'Downloading...' : 'Download MP4 (720p)'}
              </button>
              
              <button
                disabled={downloadState.isDownloading}
                onClick={() => handleDownload("mp3", "320")}
                className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700
                text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl
                transform hover:-translate-y-1 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                flex items-center justify-center gap-3"
              >
                🎧 {downloadState.isDownloading ? 'Downloading...' : 'Download MP3 (Audio)'}
              </button>
            </div>

            {/* Advanced Options */}
            {videoInfo.formats?.length > 0 && !downloadState.isDownloading && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-[#a4161a] transition">
                  ⚙️ Advanced Options
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {videoInfo.formats.slice(0, 12).map((f, index) => (
                    <button
                      key={index}
                      disabled={downloadState.isDownloading}
                      onClick={() => handleDownload(f.ext, f.quality || "auto")}
                      className="bg-gradient-to-br from-gray-50 to-gray-100 hover:from-[#a4161a] hover:to-[#800000]
                      border-2 border-gray-200 hover:border-[#a4161a] rounded-xl p-4 transition-all duration-300
                      disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transform hover:-translate-y-1
                      group"
                    >
                      <div className="text-left">
                        <p className="font-bold text-lg text-gray-800 group-hover:text-white transition">
                          {f.ext?.toUpperCase() || "Unknown"}
                        </p>
                        <p className="text-sm text-gray-600 group-hover:text-white/90 transition">
                          {f.quality || "Auto"}
                        </p>
                        <p className="text-xs text-gray-500 group-hover:text-white/80 mt-1 transition">
                          📦 {f.size || formatSize(f.filesize)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Progress Bar */}
          {downloadState.isDownloading && (
            <div className="px-6 pb-6">
              <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
                <h4 className="text-lg font-bold text-gray-800 mb-4">
                  {getStatusMessage()}
                </h4>
                
                <ProgressBar
                  progress={downloadState.progress}
                  status={downloadState.status}
                  title={getStatusMessage()}
                  downloaded={downloadState.downloaded}
                  total={downloadState.total}
                  speed={downloadState.speed}
                  eta={downloadState.eta}
                  showDetails={true}
                  size="large"
                />

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
                  <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                    <p className="text-gray-500 mb-1">Progress</p>
                    <p className="font-bold text-gray-800">{Math.round(downloadState.progress)}%</p>
                  </div>
                  
                  <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                    <p className="text-gray-500 mb-1">Downloaded</p>
                    <p className="font-bold text-gray-800">{formatSize(downloadState.downloaded)}</p>
                  </div>
                  
                  <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                    <p className="text-gray-500 mb-1">Speed</p>
                    <p className="font-bold text-gray-800">{formatSize(downloadState.speed)}/s</p>
                  </div>
                  
                  <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                    <p className="text-gray-500 mb-1">ETA</p>
                    <p className="font-bold text-gray-800">{formatTime(downloadState.eta)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}