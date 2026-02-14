/* eslint-disable no-undef */
import React, { useEffect, useState } from "react";
import Modal from "../common/Modal";

export default function VideoPlayer({ isOpen, onClose, video }) {
  const [videoId, setVideoId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Extract video ID from URL or use provided ID
  useEffect(() => {
    if (!video) {
      setVideoId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const extractVideoId = (url) => {
      if (!url) return null;
      const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
      return match ? match[1] : null;
    };

    const id = video.id || video.videoId || extractVideoId(video.url);
    setVideoId(id);
    // Small delay to show loading state, then hide it
    setTimeout(() => setLoading(false), 100);
  }, [video]);

  if (!isOpen || !videoId) return null;

  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-5xl"
      showCloseButton={true}
    >
      <div className="w-full">
        {/* Video Title */}
        {video.title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-4 pr-8 line-clamp-2">
            {video.title}
          </h3>
        )}

        {/* Video Player Container */}
        <div className="relative w-full group" style={{ paddingBottom: '56.25%' }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-[#a4161a] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading video...</p>
              </div>
            </div>
          ) : (
            <>
              <iframe
                className="absolute top-0 left-0 w-full h-full rounded-lg"
                src={embedUrl}
                title={video.title || "Video Player"}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
              {/* Floating Close Button - Visible on Hover */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 bg-black/70 hover:bg-black/90 text-white 
                rounded-full p-3 transition-all duration-200 z-20
                opacity-0 group-hover:opacity-100 focus:opacity-100
                shadow-lg hover:shadow-xl active:scale-95
                focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Close video"
                title="Close video (ESC)"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Video Info */}
        {(video.channel || video.views) && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            {video.channel && (
              <p className="text-sm text-gray-600 mb-1">
                <span className="font-medium">Channel:</span> {video.channel}
              </p>
            )}
            {video.views && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Views:</span> {formatViews(video.views)}
              </p>
            )}
          </div>
        )}

        {/* Close Button at Bottom */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-8 rounded-lg 
            transition-all duration-200 flex items-center justify-center gap-2 
            shadow-md hover:shadow-lg active:scale-95
            focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:ring-offset-2"
            aria-label="Close video"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Close Video
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Format view count
function formatViews(views) {
  if (!views || isNaN(views)) return 'N/A';
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B`;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return `${views}`;
}

