/* ✨ FINAL PERFECT: Downloader Component - NO RELOAD! */

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getVideoInfo, getDownloadInfo } from "../lib/api";
import useDownload from "../hooks/useDownload";
import useVideoInfoCache from "../hooks/useVideoInfoCache";
import FormatTable from "../components/download/FormatTable";
import SearchBar from "../components/search/SearchBar";

export default function Downloader() {
  const location = useLocation();
  const navigate = useNavigate();

  const stateData = location.state || {};

  const url = stateData.url || stateData.query || "";
  const preQuality = stateData.quality || "";
  const preFormat = stateData.format || "";
  const preTitle = stateData.title || "";
  const passedVideoData = stateData.videoData || null;

  const [videoData, setVideoData] = useState(passedVideoData);
  const [loading, setLoading] = useState(!passedVideoData && !!url);
  const [error, setError] = useState(null);

  const {
    isDownloading,
    error: downloadError,
    showPopup,
    showDownloadPopup,
    confirmDownload,
    closePopup,
  } = useDownload();

  // 🔥 Y2MATE MODE: Format options (exactly like Y2Mate)
  const defaultAudioFormats = [
    { quality: "320", label: "MP3 - 320kbps", recommended: true },
    { quality: "128", label: "MP3 - 128kbps" },
  ];

  const defaultVideoFormats = [
    { quality: "2160", label: "2160p (.mp4)" },
    { quality: "1440", label: "1440p (.mp4)" },
    { quality: "1080", label: "1080p (.mp4)", recommended: true },
    { quality: "720", label: "720p (.mp4)" },
    { quality: "480", label: "480p (.mp4)" },
    { quality: "360", label: "360p (.mp4)" },
    { quality: "240", label: "240p (.mp4)" },
    { quality: "144", label: "144p (.mp4)" },
  ];

  // Extract video ID from URL
  const extractVideoId = (videoUrl) => {
    if (!videoUrl) return null;
    const match = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const normalizeVideoInfo = (result) => {
    if (!result) return null;
    const baseVideo = result.video || result;
    if (!baseVideo?.title) return null;

    return {
      ...baseVideo,
      // Use backend formats directly (they include directUrl, filesize, etc.)
      audioFormats: result.audioFormats || [],
      videoFormats: result.videoFormats || []
    };
  };

  const {
    getVideoInfoFromCache,
    getOrFetchVideoInfo,
  } = useVideoInfoCache();

  /**
   * ✅ Y2MATE BEHAVIOR: Fetch video info ONLY ONCE per video
   * 
   * WHY FETCH ONLY ONCE:
   * - Video info (title, formats, URLs) doesn't change during session
   * - Multiple fetches = duplicate yt-dlp calls = slow + wasteful
   * - Cache + single-flight ensures instant quality display
   * 
   * WHEN FETCH HAPPENS:
   * - User selects video from search results → fetch once
   * - User pastes direct link → fetch once (if not cached)
   * - User navigates to different video → fetch once for new video
   * 
   * WHEN FETCH DOES NOT HAPPEN:
   * - Download button click → NO fetch (uses cached formats)
   * - Modal open/close → NO fetch
   * - UI state changes → NO fetch
   * - Component remount with same URL → NO fetch (uses cache)
   * 
   * CACHE STRATEGY:
   * - Check passedVideoData first (instant, no API call)
   * - Check cache second (instant, no API call)
   * - Fetch only if NOT cached (single-flight prevents duplicates)
   */
  useEffect(() => {
    if (!url) {
      setError("No video URL found");
      return;
    }

    const videoId = extractVideoId(url);
    const cacheKey = { url, videoId };

    // ✅ STEP 1: Check if we have complete data passed from navigation
    // WHY: SearchBar/DownloadTabs already fetched, pass it via state
    // RESULT: Instant quality display, zero API calls
    const hasPassedFormats = Boolean(
      passedVideoData?.audioFormats?.length || passedVideoData?.videoFormats?.length
    );

    if (passedVideoData && hasPassedFormats) {
      // ✅ Y2MATE: Use passed data immediately, NO API call
      setVideoData(passedVideoData);
      setLoading(false);
      return; // ✅ CRITICAL: Don't fetch if we have complete data
    }

    // ✅ STEP 2: Check cache BEFORE any fetch
    // WHY: Cache is shared across components, instant return
    // RESULT: Direct paste link → instant quality display
    const cached = getVideoInfoFromCache(cacheKey);
    if (cached && (cached.audioFormats?.length || cached.videoFormats?.length)) {
      // ✅ Y2MATE: Use cached data instantly, NO API call
      setVideoData(cached);
      setLoading(false);
      return; // ✅ CRITICAL: Don't fetch if cached
    }

    // ✅ STEP 3: Only fetch if NOT cached and NOT passed
    // WHY: This is the ONLY place video info is fetched
    // RESULT: Single fetch per video, cached for future use
    let currentUrl = url; // Capture URL at start of effect
    let isMounted = true; // Track if component is still mounted

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // ✅ Add timeout to prevent infinite loading
      let fetchTimeout = setTimeout(() => {
        if (isMounted && currentUrl === url) {
          setError("Request timed out. Please try again or check your connection.");
          setLoading(false);
        }
      }, 45000); // 45 second timeout

      try {
        // ✅ Y2MATE: Single API call via getOrFetchVideoInfo
        // getOrFetchVideoInfo handles:
        // - Single-flight (reuses in-flight promise)
        // - Caching (stores result for future)
        // ✅ CRITICAL: NO AbortController - let request complete even if component unmounts
        // WHY: Request completes → cached → next mount uses cache instantly
        const result = await getOrFetchVideoInfo({
          ...cacheKey,
          fetcher: async () => {
            // ✅ CRITICAL: Check if URL changed (new video selected)
            // WHY: Don't process result if user selected different video
            if (currentUrl !== url) {
              throw new Error('Request cancelled - URL changed');
            }

            // ✅ Y2MATE: Single API call via getVideoInfo
            // ✅ CRITICAL: NO signal - request must complete even if component unmounts
            // WHY: Component unmount ≠ cancel request (cache result for next mount)
            // api.js handles v1/legacy fallback internally (single fallback, no retry loop)
            const response = await getVideoInfo(url, { 
              useV1: true // Let api.js handle fallback
            });

            if (!response.success) {
              throw new Error(response.error || "Failed to fetch video information");
            }

            return normalizeVideoInfo(response);
          },
        });

        // ✅ CRITICAL: Check if URL changed OR component unmounted
        // WHY: Don't update state if user selected different video or component unmounted
        if (currentUrl !== url || !isMounted) {
          return; // Don't update state if URL changed or unmounted
        }

        const normalizedVideoData = normalizeVideoInfo(result);

        if (!normalizedVideoData) {
          throw new Error("Failed to normalize video data");
        }

        setVideoData(normalizedVideoData);

        // ✅ Y2MATE: Formats are included in response
        if (normalizedVideoData.videoFormats || normalizedVideoData.audioFormats) {
        }

        clearTimeout(fetchTimeout); // ✅ Clear timeout on success

      } catch (err) {
        clearTimeout(fetchTimeout); // ✅ Clear timeout on error
        // ✅ CRITICAL: Only set error if component still mounted and URL unchanged
        // WHY: Don't show error if user navigated away or component unmounted
        if (!isMounted || currentUrl !== url) {
          return;
        }
        console.error("❌ [Y2MATE] Error fetching video:", err);
        setError(err.message || "Failed to load video information");
        setLoading(false); // ✅ CRITICAL: Always clear loading on error
      } finally {
        // ✅ CRITICAL: Always update loading if component still mounted and URL unchanged
        // WHY: Ensure loading state is cleared even if error occurs
        if (isMounted && currentUrl === url) {
          setLoading(false);
        }
      }
    };

    fetchData();

    // ✅ CRITICAL: Cleanup ONLY marks component as unmounted
    // Does NOT abort fetch - let it complete and cache result
    // WHY: Request completes → cached → next mount uses cache instantly
    // AbortController would cancel request → ERR_EMPTY_RESPONSE → no cache
    return () => {
      isMounted = false;
    };
  }, [url]); // ✅ CRITICAL: Only depend on URL, NOT passedVideoData

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🔥 FIX: RETRY WITHOUT RELOAD
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const handleRetry = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }


    setLoading(true);
    setError(null);

    try {
      const result = await getOrFetchVideoInfo({
        url,
        videoId: extractVideoId(url),
        forceRefresh: true,
        fetcher: async () => {
          const response = await getVideoInfo(url);

          if (!response.success) {
            throw new Error(response.error || "Failed to fetch video information");
          }

          return normalizeVideoInfo(response);
        },
      });

      const normalizedVideoData = normalizeVideoInfo(result);

      if (!normalizedVideoData) {
        throw new Error("Failed to normalize video data");
      }

      setVideoData(normalizedVideoData);

      // Formats are already included in normalizedVideoData (videoFormats and audioFormats)

    } catch (err) {
      console.error("❌ Retry failed:", err);
      setError(err.message || "Failed to load video information");
    } finally {
      setLoading(false);
    }
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🔥 FIX: NAVIGATE WITHOUT RELOAD
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const handleGoHome = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    navigate('/');
  };

  // Formats are now loaded from /api/download/info with direct URLs

  // No URL provided - Y2Mate Style
  if (!url) {
    return (
      <div className="min-h-screen bg-white">
        <SearchBar />

        <div className="flex items-center justify-center py-20 px-4">
          <div className="text-center max-w-md bg-white p-10 border border-gray-200">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-gray-800 mb-3">No Video Selected</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-sm">
              Please search for a YouTube video to get started
            </p>
            <button
              type="button"
              onClick={handleGoHome}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 text-sm font-medium transition-all duration-200"
            >
              🏠 Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state - Y2Mate Style
  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <SearchBar />

        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="bg-white p-12 max-w-md w-full">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin"></div>
            </div>
            <p className="text-gray-700 font-medium text-center text-base">
              Loading video information...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state - Y2Mate Style
  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <SearchBar />

        <div className="flex items-center justify-center py-20 px-4">
          <div className="text-center max-w-md bg-white p-10 border border-red-200">
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-bold text-red-600 mb-3">Error Loading Video</h2>
            <p className="text-gray-700 mb-6 leading-relaxed text-sm">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={handleRetry}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 text-sm font-medium transition-all duration-200"
              >
                🔄 Retry
              </button>
              <button
                type="button"
                onClick={handleGoHome}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2.5 text-sm font-medium transition-all duration-200"
              >
                🏠 Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No video data
  // ✅ Y2MATE: Show FormatTable immediately if we have videoData (even if loading)
  // WHY: User should see quality list instantly, loading happens in background
  const showFormats = videoData && (videoData.videoFormats?.length > 0 || videoData.audioFormats?.length > 0);

  // Main downloader UI - Y2Mate Style
  return (
    <div className="min-h-screen bg-white">
      <SearchBar />

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">

        {/* Loading - Only show if NO videoData */}
        {loading && !videoData && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-[#a4161a] border-t-transparent animate-spin"></div>
            </div>
            <p className="text-gray-600 mt-4 font-medium">⏳ Fetching video info...</p>
            <p className="text-gray-500 mt-2 text-sm">This may take a few seconds...</p>
          </div>
        )}

        {/* Error - Show error with retry option - Responsive */}
        {error && !videoData && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 sm:p-6 text-center shadow-lg mb-6">
            <p className="text-red-700 font-semibold mb-4 text-sm sm:text-base">{error}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  // Retry fetch
                  const videoId = extractVideoId(url);
                  const cacheKey = { url, videoId };
                  getOrFetchVideoInfo({
                    ...cacheKey,
                    fetcher: async () => {
                      const response = await getVideoInfo(url, { useV1: true });
                      if (!response.success) {
                        throw new Error(response.error || "Failed to fetch video information");
                      }
                      return normalizeVideoInfo(response);
                    },
                  }).then(result => {
                    const normalizedVideoData = normalizeVideoInfo(result);
                    if (normalizedVideoData) {
                      setVideoData(normalizedVideoData);
                      setLoading(false);
                    }
                  }).catch(err => {
                    setError(err.message || "Failed to load video information");
                    setLoading(false);
                  });
                }}
                className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-[#a4161a] text-white rounded-lg hover:bg-[#800000] transition font-medium"
              >
                🔄 Retry
              </button>
              <button
                onClick={() => navigate("/")}
                className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
              >
                🏠 Go Home
              </button>
            </div>
          </div>
        )}

        {/* Video Info & Download Options - Y2Mate Layout - Show immediately if formats available - Responsive */}
        {showFormats && (
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4 sm:gap-6 mb-6">

          {/* Video Thumbnail Card - Y2Mate Style (No Video Player) */}
          <div className="bg-white">
            <div className="relative w-full aspect-video bg-gray-100">
              {/* Y2Mate Style: Show only thumbnail, NO video player */}
              <img
                src={videoData.thumbnail}
                alt={videoData.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/400x225?text=No+Thumbnail';
                }}
              />
            </div>
            <div className="mt-3">
              <h2 className="text-sm font-medium text-gray-900 leading-tight">
                {videoData.title}
              </h2>
            </div>
          </div>

          {/* Format Selection Table - Y2Mate Style */}
          <div className="bg-white border border-gray-200">
            <FormatTable
              videoFormats={videoData.videoFormats || []}
              audioFormats={videoData.audioFormats || []}
              videoId={extractVideoId(url)}
              videoTitle={videoData.title}
            />
          </div>
        </div>
        )}

        {/* Download Error Display */}
        {downloadError && !isDownloading && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300 rounded-2xl p-8 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="text-5xl">❌</div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-red-800 mb-3">Download Failed</h3>
                <p className="text-red-700 mb-6 text-lg leading-relaxed">{downloadError}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                >
                  🔄 Try Again
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}