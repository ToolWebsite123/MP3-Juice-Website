/* eslint-disable no-undef */
import React, { useState } from "react";
import QualitySelectionModal from "./QualitySelectionModal";

export default function VideoCard({ video, onVideoSelect, onPlayClick }) {
  const [imageError, setImageError] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);
  
  // ✅ Extract video ID
  const extractVideoId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  const videoId = video.id || extractVideoId(video.url);
  const videoUrl = video.url || `https://www.youtube.com/watch?v=${videoId}`;

  // ✅ Handle Download Click
  const handleDownloadClick = () => {
    if (!videoId) {
      console.error('❌ No video ID available');
      alert('Cannot download: Video ID not found');
      return;
    }

    
    // Call parent handler
    if (onVideoSelect) {
      onVideoSelect({ ...video, url: videoUrl });
    }
  };

  // ✅ Handle Play Click
  const handlePlayClick = () => {
    if (!videoId) {
      console.error('❌ No video ID available');
      alert('Cannot play: Video ID not found');
      return;
    }

    
    // Call parent handler to open video player
    if (onPlayClick) {
      onPlayClick({ ...video, url: videoUrl });
    }
  };

  // ✅ Format view count
  const formatViews = (views) => {
    if (!views || isNaN(views)) return null;
    if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B`;
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
    return `${views}`;
  };

  // ✅ Format duration
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

  // ✅ Get thumbnail
  const getThumbnail = () => {
    if (!videoId) return 'https://via.placeholder.com/320x180?text=No+Thumbnail';
    
    if (imageError) {
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
    return video.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  };

  // ✅ Check if we have required data
  if (!videoId) {
    return null;
  }

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

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden">
      {/* Video Info */}
      <div className="p-4">
        {/* Title */}
        <h3 className="text-base font-medium text-gray-900 mb-2 line-clamp-2 leading-snug">
          {video.title || "Untitled Video"}
        </h3>

        {/* Duration */}
        {video.duration && (
          <p className="text-sm text-gray-600 mb-4">
            {formatDuration(video.duration)}
          </p>
        )}

        {/* Three Blue Buttons: MP3, MP4, Play */}
        <div className="flex gap-2">
          <button
            onClick={handleMP3Click}
            className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-2.5 px-4 rounded transition-all duration-200"
            aria-label="Download MP3"
          >
            MP3
          </button>
          
          <button
            onClick={handleMP4Click}
            className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-2.5 px-4 rounded transition-all duration-200"
            aria-label="Download MP4"
          >
            MP4
          </button>
          
          <button
            onClick={handlePlayClick}
            className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-2.5 px-4 rounded transition-all duration-200"
            aria-label="Play video"
          >
            Play
          </button>
        </div>
      </div>

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