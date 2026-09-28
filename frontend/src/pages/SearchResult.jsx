/* eslint-disable no-unused-vars */
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useSearch } from "../context/SearchContext";
import { searchVideos, getVideoInfo } from "../lib/api";
import VideoCard from "../components/search/VideoCard";
import SearchBar from "../components/search/SearchBar";
import SocialShareWidget from "../components/home/SocialShareWidget";
import useVideoInfoCache from "../hooks/useVideoInfoCache";
import SEO from "../components/common/SEO";

export default function SearchResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const { query: contextQuery } = useSearch();

  const query = location.state?.query || contextQuery || "";
  const isUrlType = location.state?.type === "url";
  const videoUrl = isUrlType ? location.state?.query : "";

  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [playingVideoId, setPlayingVideoId] = useState(null); // Track which video is playing
  const [urlLoading, setUrlLoading] = useState(false); // Loading state for URL fetch
  const [relatedDownloads, setRelatedDownloads] = useState([]); // Related videos from API

  const { getVideoInfoFromCache, getOrFetchVideoInfo } = useVideoInfoCache();

  // ✅ Extract video ID helper
  const extractVideoId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  // ✅ Fetch video info for direct URL (like MP3 Juice behavior)
  useEffect(() => {
    if (!isUrlType || !videoUrl) return;

    const controller = new AbortController();

    const fetchVideoInfo = async () => {
      setUrlLoading(true);
      setSearchError("");
      setResults([]);
      setPlayingVideoId(null);

      try {
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
          setSearchError("Invalid YouTube URL");
          setUrlLoading(false);
          return;
        }

        const cacheKey = { url: videoUrl, videoId };

        // ✅ Check cache first
        const cached = getVideoInfoFromCache(cacheKey);
        if (cached && cached.title) {
          // Format video data as a search result
          const videoResult = {
            id: videoId,
            videoId: videoId,
            title: cached.title,
            thumbnail: cached.thumbnail,
            duration: cached.duration,
            durationString: cached.durationString,
            channel: cached.uploader,
            url: videoUrl,
            view_count: cached.view_count || 0,
            // Include formats for quality selection
            audioFormats: cached.audioFormats || [],
            videoFormats: cached.videoFormats || [],
          };
          setResults([videoResult]);
          
          // ✅ Store related downloads from cached data
          if (cached.relatedDownloads && Array.isArray(cached.relatedDownloads)) {
            setRelatedDownloads(cached.relatedDownloads);
          } else {
            setRelatedDownloads([]);
          }
          
          setUrlLoading(false);
          return;
        }

        // ✅ Fetch video info from API
        const videoData = await getOrFetchVideoInfo({
          ...cacheKey,
          fetcher: async () => {
            const response = await getVideoInfo(videoUrl, { useV1: true });
            if (!response.success) {
              throw new Error(response.error || "Failed to fetch video information");
            }
            return response;
          },
        });

        if (controller.signal.aborted) return;

        // Format video data as a search result (like MP3 Juice)
        const videoResult = {
          id: videoData.id || videoId,
          videoId: videoData.id || videoId,
          title: videoData.title,
          thumbnail: videoData.thumbnail,
          duration: videoData.duration,
          durationString: videoData.durationString,
          channel: videoData.uploader,
          url: videoUrl,
          view_count: videoData.view_count || 0,
          // Include formats for quality selection
          audioFormats: videoData.audioFormats || [],
          videoFormats: videoData.videoFormats || [],
        };

        setResults([videoResult]);
        
        // ✅ Store related downloads from API response
        if (videoData.relatedDownloads && Array.isArray(videoData.relatedDownloads)) {
          setRelatedDownloads(videoData.relatedDownloads);
        } else {
          setRelatedDownloads([]);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          setSearchError(err.message || "Failed to fetch video information");
        }
      } finally {
        if (!controller.signal.aborted) {
          setUrlLoading(false);
        }
      }
    };

    fetchVideoInfo();
    return () => controller.abort();
  }, [isUrlType, videoUrl, getVideoInfoFromCache, getOrFetchVideoInfo]);

  // ✅ Search videos (only for search queries, not URLs)
  useEffect(() => {
    if (!query || isUrlType || videoUrl) return;

    const controller = new AbortController();

    const fetchResults = async () => {
      setSearchLoading(true);
      setSearchError("");
      setResults([]);
      setPlayingVideoId(null); // Reset playing video when new search
      
      try {
        const data = await searchVideos(query, { signal: controller.signal });
        
        let videos = [];
        if (data?.success && Array.isArray(data.results)) {
          videos = data.results;
        } else if (data?.success && Array.isArray(data.videos)) {
          videos = data.videos;
        } else if (Array.isArray(data)) {
          videos = data;
        }
        
        setResults(videos);
        if (videos.length === 0) {
          setSearchError("No videos found");
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          setSearchError(err.message || "Search failed");
        }
      } finally {
        setSearchLoading(false);
      }
    };

    fetchResults();
    return () => controller.abort();
  }, [query, isUrlType, videoUrl]);

  // ✅ Handle video select - Quality modal is handled by VideoCard component
  // No need to navigate to download page anymore
  const handleVideoSelect = (video) => {
    // Quality selection is handled by VideoCard's quality modal
    // No navigation needed
  };

  // ✅ Handle Play button click - Embed video inline at same position
  const handlePlayClick = (video) => {
    const videoId = video.id || extractVideoId(video.url);
    if (videoId) {
      // If same video is clicked, stop playing. Otherwise, play the new video
      setPlayingVideoId(playingVideoId === videoId ? null : videoId);
      // Scroll to the video position smoothly without going to top
      setTimeout(() => {
        const element = document.querySelector(`[data-video-id="${videoId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };


  // 🔥 MP3JUICE STYLE SEARCH VIEW WITH BLUE BACKGROUND
  return (
    <div className="min-h-screen bg-[#1676C2] relative">
      <SEO 
        title={query ? `Search: ${query}` : "Search Music & Videos"}
        description={`Search results for ${query || "music"}. Download MP3 audio or MP4 videos free on MP3Juice.`}
      />
      {/* Social Share Widget */}
      <SocialShareWidget />

      {/* MP3 Juice Style Header */}
      <div className="bg-[#1676C2] w-full">
        {/* Top Navigation */}
        <nav className="w-full py-4 sm:py-6">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
              <Link to="/" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
                MP3Juice
              </Link>
              <Link to="/faq" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
                FAQ
              </Link>
              <Link to="/dmca" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
                DMCA
              </Link>
              <Link to="/contact" className="text-white hover:opacity-80 text-sm sm:text-base font-medium">
                Contact
              </Link>
            </div>
            {/* Horizontal Line Separator */}
            <div className="border-t border-white/20 mt-4"></div>
          </div>
        </nav>

        {/* Waveform Graphic and Logo */}
        <div className="flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-3xl">
            {/* Waveform Graphic - Audio Equalizer Style */}
            <div className="flex justify-center items-center mb-6 relative w-full">
              <div className="relative flex items-center">
                {/* Horizontal line extending from both sides */}
                <div className="absolute left-1/2 transform -translate-x-1/2 w-80 sm:w-96 border-t border-white/50"></div>
                
                {/* Vertical bars */}
                <div className="flex items-end gap-1.5 relative z-10">
                  {/* Left side bars */}
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '18px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '28px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '22px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '32px' }}></div>
                  {/* Central peak */}
                  <div className="w-2 bg-white rounded-t" style={{ height: '48px' }}></div>
                  {/* Right side bars */}
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '32px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '22px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '28px' }}></div>
                  <div className="w-1.5 bg-white rounded-t" style={{ height: '18px' }}></div>
                </div>
              </div>
            </div>
            
            {/* Logo Text with superscript 3 */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white text-center mb-10">
              Mp<sup className="text-2xl sm:text-3xl md:text-4xl font-bold">3</sup>Juice
            </h1>
            
            {/* Search Bar */}
            <div className="mb-6">
              <SearchBar hideSuggestions={playingVideoId !== null} />
            </div>
          </div>
        </div>
      </div>

      {/* Loading State - Search */}
      {searchLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-white border-t-transparent animate-spin"></div>
          </div>
          <p className="text-white mt-4 font-medium flex items-center gap-2">
            <span className="text-2xl">🔍</span>
            Searching...
          </p>
        </div>
      )}

      {/* Loading State - URL Fetch */}
      {urlLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-white border-t-transparent animate-spin"></div>
          </div>
          <p className="text-white mt-4 font-medium flex items-center gap-2">
            <span className="text-2xl">📺</span>
            Fetching video information...
          </p>
        </div>
      )}

      {/* Error State */}
      {!searchLoading && !urlLoading && searchError && (
        <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
          <p className="text-center text-red-700 font-medium">{searchError}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 w-full px-4 py-2 bg-[#1676C2] text-white rounded-lg hover:bg-[#1465a8] transition-colors"
          >
            Try Another Search
          </button>
        </div>
      )}

      {/* ✅ Show message for URL search results (like MP3 Juice) */}
      {isUrlType && !urlLoading && results.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-white text-center text-sm sm:text-base mb-4">
            Here you can find the video information for your YouTube URL. 
            You can listen to it before downloading by clicking the 'Play' button, 
            or download it in MP3 or MP4 format.
          </p>
        </div>
      )}

      {/* 🔥 MP3JUICE LIST LAYOUT - Simple vertical list */}
      {!searchLoading && !urlLoading && results.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-12">
          <div className="space-y-4">
            {results.map((video, i) => {
              const videoId = video.id || extractVideoId(video.url);
              const isPlaying = playingVideoId === videoId;
              
              return (
                <div key={video.id || i} data-video-id={videoId}>
                  {isPlaying ? (
                    // Show embedded YouTube player at this position
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                      <div className="p-4">
                        <h3 className="text-base font-medium text-gray-900 mb-4 line-clamp-2">
                          {video.title || "Untitled Video"}
                        </h3>
                        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                          <iframe
                            className="absolute top-0 left-0 w-full h-full"
                            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                            title={video.title || "Video Player"}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                        <div className="flex gap-4 justify-center mt-4">
                          <button
                            onClick={() => handleVideoSelect(video)}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200"
                          >
                            Download now
                          </button>
                          <button
                            onClick={() => setPlayingVideoId(null)}
                            className="bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-6 rounded-lg transition-all duration-200"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Show normal video card
                    <VideoCard 
                      video={video}
                      onVideoSelect={handleVideoSelect}
                      onPlayClick={handlePlayClick}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Load More Button */}
          {results.length >= 20 && (
            <div className="text-center mt-8">
              <button className="px-6 py-3 bg-white text-[#1676C2] rounded-lg hover:bg-gray-100 transition-colors font-medium">
                Load More Results
              </button>
            </div>
          )}
        </div>
      )}

      {/* ✅ RELATED DOWNLOADS SECTION - Show when URL is pasted and related videos are available */}
      {isUrlType && !urlLoading && relatedDownloads.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-12 mt-8">
          <h2 className="text-white text-xl font-bold mb-6 text-center">
            Related Downloads
          </h2>
          <div className="space-y-4">
            {relatedDownloads.map((video, i) => {
              const videoId = video.id || video.videoId || extractVideoId(video.url);
              const isPlaying = playingVideoId === videoId;
              
              return (
                <div key={video.id || i} data-video-id={videoId}>
                  {isPlaying ? (
                    // Show embedded YouTube player at this position
                    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                      <div className="p-4">
                        <h3 className="text-base font-medium text-gray-900 mb-4 line-clamp-2">
                          {video.title || "Untitled Video"}
                        </h3>
                        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                          <iframe
                            className="absolute top-0 left-0 w-full h-full"
                            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                            title={video.title || "Video Player"}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                        <div className="flex gap-4 justify-center mt-4">
                          <button
                            onClick={() => handleVideoSelect(video)}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200"
                          >
                            Download now
                          </button>
                          <button
                            onClick={() => setPlayingVideoId(null)}
                            className="bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-6 rounded-lg transition-all duration-200"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Show normal video card
                    <VideoCard 
                      video={video}
                      onVideoSelect={handleVideoSelect}
                      onPlayClick={handlePlayClick}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}