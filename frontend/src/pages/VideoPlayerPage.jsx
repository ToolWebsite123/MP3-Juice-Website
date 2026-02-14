import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchBar from "../components/search/SearchBar";
import SocialShareWidget from "../components/home/SocialShareWidget";
import HomeFooter from "../components/home/HomeFooter";
import VideoCard from "../components/search/VideoCard";
import QualitySelectionModal from "../components/search/QualitySelectionModal";

export default function VideoPlayerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const video = location.state?.video || location.state?.videoData || null;
  const allResults = location.state?.allResults || [];
  const resultsCount = allResults.length || location.state?.resultsCount || 20;

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);

  // Extract video ID helper
  const extractVideoId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  // Extract video ID
  useEffect(() => {
    if (!video) {
      navigate('/');
      return;
    }

    const id = video.id || video.videoId || extractVideoId(video.url);
    setVideoId(id);
    setIsPlaying(false); // Reset playing state when video changes
  }, [video, navigate]);

  // Format duration
  const formatDuration = (duration) => {
    if (!duration) return null;
    
    if (typeof duration === 'string' && duration.includes(':')) {
      return duration;
    }
    
    if (typeof duration === 'number') {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = Math.floor(duration % 60);
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return duration;
  };

  // Handle MP3 download - Show quality selection
  const handleMP3Click = () => {
    setSelectedFormat('mp3');
    setShowQualityModal(true);
  };

  // Handle MP4 download - Show quality selection
  const handleMP4Click = () => {
    setSelectedFormat('mp4');
    setShowQualityModal(true);
  };

  // Handle Stop button - Close video and go back to search results
  const handleStopClick = () => {
    // Navigate back to search results
    const query = location.state?.query || location.state?.searchQuery || '';
    if (query && allResults.length > 0) {
      // Go back to search results page
      navigate("/search", {
        state: {
          query: query,
          type: "query"
        },
        replace: false
      });
    } else {
      // If no query, go to home
      navigate("/", { replace: false });
    }
  };

  // Handle Download Now - Show quality selection modal
  const handleDownloadNow = () => {
    // Show MP4 quality selection by default
    setSelectedFormat('mp4');
    setShowQualityModal(true);
  };

  // Handle Play Now
  const handlePlayNow = () => {
    setIsPlaying(true);
    // Update iframe to autoplay
    const iframe = document.getElementById('youtube-player');
    if (iframe) {
      const newSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
      iframe.src = newSrc;
    }
  };

  if (!video || !videoId) {
    return null;
  }

  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=${isPlaying ? 1 : 0}&rel=0&modestbranding=1`;

  return (
    <div className="min-h-screen bg-[#1676C2] flex flex-col relative">
      {/* Social Share Widget */}
      <SocialShareWidget />

      {/* Top Navigation */}
      <nav className="w-full py-4 sm:py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
            <button
              onClick={() => navigate('/')}
              className="text-white hover:opacity-80 text-sm sm:text-base font-medium"
            >
              Home
            </button>
            <button
              onClick={() => navigate('/faq')}
              className="text-white hover:opacity-80 text-sm sm:text-base font-medium"
            >
              FAQ
            </button>
            <button
              onClick={() => navigate('/dmca')}
              className="text-white hover:opacity-80 text-sm sm:text-base font-medium"
            >
              DMCA
            </button>
            <button
              onClick={() => navigate('/contact')}
              className="text-white hover:opacity-80 text-sm sm:text-base font-medium"
            >
              Contact
            </button>
          </div>
          <div className="border-t border-white/20 mt-4"></div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-4xl">
          {/* Search Bar */}
          <div className="mb-8">
            <SearchBar />
          </div>

          {/* Instructional Text */}
          <p className="text-white text-center text-base sm:text-lg mb-6">
            You have {resultsCount} search results. Now you have the opportunity to listen to each track before downloading it to your device. Click on the Play button.
          </p>

          {/* Video Card */}
          <div className="bg-white rounded-lg shadow-lg mb-6">
            <div className="p-6">
              {/* Title */}
              <h2 className="text-lg sm:text-xl font-medium text-gray-900 mb-3 text-center line-clamp-2">
                {video.title || "Untitled Video"}
              </h2>

              {/* Duration */}
              {video.duration && (
                <p className="text-base text-gray-600 mb-6 text-center">
                  {formatDuration(video.duration)}
                </p>
              )}

              {/* Three Buttons: MP3, MP4, Stop */}
              <div className="flex gap-3">
                <button
                  onClick={handleMP3Click}
                  className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-4 rounded transition-all duration-200"
                >
                  MP3
                </button>
                
                <button
                  onClick={handleMP4Click}
                  className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-4 rounded transition-all duration-200"
                >
                  MP4
                </button>
                
                <button
                  onClick={handleStopClick}
                  className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-4 rounded transition-all duration-200"
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          {/* Embedded Video Player */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                id="youtube-player"
                className="absolute top-0 left-0 w-full h-full"
                src={embedUrl}
                title={video.title || "Video Player"}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>

          {/* Download Now and Play Now Buttons */}
          <div className="flex gap-4 justify-center mb-8">
            <button
              onClick={handleDownloadNow}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 text-lg shadow-lg hover:shadow-xl"
            >
              Download now
            </button>
            
            <button
              onClick={handlePlayNow}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 text-lg shadow-lg hover:shadow-xl"
            >
              Play now
            </button>
          </div>

          {/* Search Results List Below Video Player */}
          {allResults.length > 0 && (
            <div className="space-y-4 mt-8">
              {allResults.map((resultVideo, i) => {
                // Skip the current featured video
                const currentVideoId = video.id || video.videoId || videoId || extractVideoId(video.url);
                const resultVideoId = resultVideo.id || resultVideo.videoId || extractVideoId(resultVideo.url);
                if (resultVideoId && currentVideoId && resultVideoId === currentVideoId) return null;

                return (
                  <VideoCard
                    key={resultVideo.id || i}
                    video={resultVideo}
                    onVideoSelect={(v) => {
                      // Show quality modal instead of navigating to download page
                      // This will be handled by VideoCard's quality modal
                    }}
                    onPlayClick={(v) => {
                      navigate("/play", {
                        state: {
                          video: v,
                          videoData: v,
                          allResults: allResults,
                          resultsCount: allResults.length,
                          query: location.state?.query || location.state?.searchQuery || '',
                          searchQuery: location.state?.query || location.state?.searchQuery || ''
                        },
                        replace: false
                      });
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <HomeFooter />

      {/* Quality Selection Modal */}
      <QualitySelectionModal
        isOpen={showQualityModal}
        onClose={() => {
          setShowQualityModal(false);
          setSelectedFormat(null);
        }}
        video={video}
        formatType={selectedFormat}
      />
    </div>
  );
}

