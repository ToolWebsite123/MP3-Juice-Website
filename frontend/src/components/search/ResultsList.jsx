// src/components/search/ResultsList.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { searchVideos } from "../../lib/api";
import VideoCard from "./VideoCard";
import VideoPlayer from "../video/VideoPlayer";



export default function ResultsList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("query") || "";

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  useEffect(() => {
    if (!query) return;

    const fetchResults = async () => {
      try {
        setLoading(true);
        setError("");
        const results = await searchVideos(query);
        setVideos(results);
      } catch (err) {
        console.error("Search Error:", err);
        setError("Failed to fetch search results.");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query]);

  // ✅ Handle Download button click
  const handleVideoSelect = (video) => {
    navigate("/download", {
      state: {
        query: video.url,
        type: "url",
        videoData: video
      },
      replace: false
    });
  };

  // ✅ Handle Play button click
  const handlePlayClick = (video) => {
    setSelectedVideo(video);
    setIsPlayerOpen(true);
  };

  // ✅ Close video player
  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setSelectedVideo(null);
  };

  if (!query) return <p className="text-center mt-8">Enter keywords to search YouTube videos.</p>;

  return (
    <div className="max-w-[900px] mx-auto mt-8 px-4">
      {loading && <p className="text-center text-gray-500">Loading results...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}
      {!loading && videos.length === 0 && !error && (
        <p className="text-center text-gray-500">No videos found for "{query}".</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {videos.map((video) => (
          <VideoCard 
            key={video.id} 
            video={video}
            onVideoSelect={handleVideoSelect}
            onPlayClick={handlePlayClick}
          />
        ))}
      </div>

      {/* Video Player Modal */}
      <VideoPlayer
        isOpen={isPlayerOpen}
        onClose={handleClosePlayer}
        video={selectedVideo}
      />
    </div>
  );
}
