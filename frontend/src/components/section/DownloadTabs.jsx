/* eslint-disable no-unused-vars */
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { searchVideos, getVideoInfo, startDownload } from "../../lib/api";
import useVideoInfoCache from "../../hooks/useVideoInfoCache";
import VideoCard from "../search/VideoCard";  // ✅ SAHI
import { Loader2 } from "lucide-react";


export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("query") || "";
  const videoUrl = searchParams.get("url") || "";
  const navigate = useNavigate();

  // Search states
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Download states
  const [videoInfo, setVideoInfo] = useState(null);
  const [audioFormats, setAudioFormats] = useState([]);
  const [videoFormats, setVideoFormats] = useState([]);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const {
    getVideoInfoFromCache,
    getOrFetchVideoInfo,
  } = useVideoInfoCache();

  const normalizeVideoData = (data, fallback) => {
    if (!data) return fallback || null;
    const base = data.video || data;
    if (!base?.title) return fallback || base || null;
    return {
      ...base,
      audioFormats: data.audioFormats || base.audioFormats || [],
      videoFormats: data.videoFormats || base.videoFormats || [],
    };
  };

  const applyVideoInfo = (data) => {
    if (!data) return false;
    const video = normalizeVideoData(data);
    if (!video) return false;

    setVideoInfo(video);
    setAudioFormats(video.audioFormats || []);
    setVideoFormats(video.videoFormats || []);
    return true;
  };

  // If URL is provided, fetch video info
  useEffect(() => {
    if (!videoUrl) return;

    const controller = new AbortController();
    const { signal } = controller;
    const cacheKey = { url: videoUrl };

    const fetchVideoDetails = async () => {
      setDownloadLoading(true);
      setDownloadError("");
      
      try {
        const cached = getVideoInfoFromCache(cacheKey);
        if (cached) {
          applyVideoInfo(cached);
          setDownloadLoading(false);
          return;
        }

        const data = await getOrFetchVideoInfo({
          ...cacheKey,
          fetcher: () => getVideoInfo(videoUrl, { signal }),
        });
        
        if (data?.success) {
          applyVideoInfo(data);
        } else if (!applyVideoInfo(data)) {
          setDownloadError("Failed to load video information");
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("❌ Video info error:", err);
          setDownloadError("Could not load video details. Please try again.");
        }
      } finally {
        setDownloadLoading(false);
      }
    };

    fetchVideoDetails();
    return () => controller.abort();
  }, [videoUrl]);

  // If query is provided, search videos
  useEffect(() => {
    if (!query || videoUrl) return;

    const controller = new AbortController();
    const { signal } = controller;

    const fetchResults = async () => {
      setSearchLoading(true);
      setSearchError("");
      
      try {
        const data = await searchVideos(query, { signal });
        const videos = data?.results || data || [];
        setResults(Array.isArray(videos) ? videos : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("❌ Search error:", err);
          setSearchError("⚠️ Could not fetch search results. Please try again later.");
        }
      } finally {
        setSearchLoading(false);
      }
    };

    fetchResults();
    return () => controller.abort();
  }, [query, videoUrl]);

  // Background prefetch top N results to speed next clicks
  useEffect(() => {
    if (videoUrl || results.length === 0) return;
    const topResults = results.slice(0, 3);

    topResults.forEach((video) => {
      const cacheKey = { url: video.url, videoId: video.id };
      getOrFetchVideoInfo({
        ...cacheKey,
        fetcher: () => getVideoInfo(video.url),
      }).catch(() => {});
    });
  }, [results, videoUrl, getOrFetchVideoInfo]);

  const handleRetry = () => {
    window.location.reload();
  };

  const handleVideoSelect = async (video) => {
    setPreparing(true);

    const cacheKey = { url: video.url, videoId: video.id };

    try {
      const data = await getOrFetchVideoInfo({
        ...cacheKey,
        fetcher: () => getVideoInfo(video.url),
      });

      const payload = normalizeVideoData(data, video);

      navigate("/download", {
        state: {
          query: video.url,
          url: video.url,
          type: "url",
          videoData: payload,
        }
      });
    } catch (err) {
      console.error("❌ Video select fetch error:", err);
      navigate(`/search?url=${encodeURIComponent(video.url)}`);
    } finally {
      setPreparing(false);
    }
  };

  const handleDownload = async ({ quality, format, type }) => {
    if (!videoUrl) {
      alert("No video URL provided");
      return;
    }

    try {
      setDownloadLoading(true);
      
      
      const response = await startDownload({
        url: videoUrl,
        quality,
        format
      });

      if (response.success && response.downloadId) {
        // Navigate to download progress page
        navigate(`/download?id=${response.downloadId}`);
      } else {
        alert("Failed to start download");
      }
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to start download. Please try again.");
    } finally {
      setDownloadLoading(false);
    }
  };

  // ✅ DOWNLOAD VIEW (when URL is provided)
  if (videoUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-10 px-5">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Y2meta - YouTube Video Downloader
            </h1>
            <p className="text-gray-600">
              Download MP3 audio or MP4 video in different qualities
            </p>
          </div>

          {/* Loading State */}
          {downloadLoading && !videoInfo && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-pink-600 border-t-transparent animate-spin"></div>
              </div>
              <p className="text-gray-600 mt-4 text-base font-medium">
                🔍 Loading video information...
              </p>
            </div>
          )}

          {/* Error State */}
          {!downloadLoading && downloadError && (
            <div className="max-w-md mx-auto mt-10 p-6 bg-red-50 border border-red-200 rounded-lg shadow-sm">
              <p className="text-center text-red-700 font-medium">{downloadError}</p>
              <button
                onClick={handleRetry}
                className="mt-4 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Download Tabs */}
          {!downloadLoading && videoInfo && (
            <DownloadTabs
              videoInfo={videoInfo}
              audioFormats={audioFormats}
              videoFormats={videoFormats}
              onDownload={handleDownload}
              loading={downloadLoading}
            />
          )}

          {/* Back Button */}
          {videoInfo && (
            <div className="text-center mt-8">
              <button
                onClick={() => navigate('/')}
                className="text-[#a4161a] hover:text-[#800000] font-medium transition-colors"
              >
                ← Search Another Video
              </button>
            </div>
          )}
        </div>

        {/* Preparing overlay when selecting video */}
        {preparing && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[9999]">
            <div className="bg-white px-4 py-3 rounded-lg shadow-md flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-[#a4161a]" />
              <span className="text-gray-700 font-semibold">Preparing...</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center">
          <p className="text-gray-400 text-xs">
            © {new Date().getFullYear()} | Video Downloader by Zahida 💫
          </p>
        </footer>
      </div>
    );
  }

  // ✅ SEARCH VIEW (when query is provided)
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-10 px-5 flex flex-col items-center">
      <div className="max-w-7xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Search Results
          </h1>
          <p className="text-lg text-gray-600">
            for: <span className="text-[#a4161a] font-semibold">&quot;{query}&quot;</span>
          </p>
        </div>

        {/* Loading Spinner */}
        {searchLoading && (
          <div className="flex flex-col items-center justify-center mt-20">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-[#a4161a] border-t-transparent animate-spin"></div>
            </div>
            <p className="text-gray-600 mt-4 text-base font-medium">
              🔍 Searching for videos...
            </p>
          </div>
        )}

        {/* Error State */}
        {!searchLoading && searchError && (
          <div className="max-w-md mx-auto mt-10 p-6 bg-red-50 border border-red-200 rounded-lg shadow-sm">
            <p className="text-center text-red-700 font-medium">{searchError}</p>
            <button
              onClick={handleRetry}
              className="mt-4 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
            >
              Try Again
            </button>
          </div>
        )}

        {/* No Results */}
        {!searchLoading && !searchError && results.length === 0 && (
          <div className="text-center mt-20">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-gray-600 text-lg">
              No results found for &quot;<span className="font-semibold">{query}</span>&quot;
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Try different keywords or check your spelling.
            </p>
          </div>
        )}

        {/* Video Results */}
        {!searchLoading && results.length > 0 && (
          <>
            <div className="mb-4 text-center">
              <p className="text-gray-600 text-sm">
                Found <span className="font-bold text-[#a4161a]">{results.length}</span> videos
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-8">
              {results.map((video, i) => (
                <div
                  key={video.id || i}
                  className="cursor-pointer transition-transform transform hover:scale-[1.02] hover:shadow-lg"
                  onClick={() => handleVideoSelect(video)}
                >
                  <VideoCard video={video} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Preparing overlay when selecting video */}
      {preparing && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white px-4 py-3 rounded-lg shadow-md flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-[#a4161a]" />
            <span className="text-gray-700 font-semibold">Preparing...</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-16 text-center">
        <p className="text-gray-400 text-xs">
          © {new Date().getFullYear()} | Video Downloader by Zahida 💫
        </p>
      </footer>
    </div>
  );
}