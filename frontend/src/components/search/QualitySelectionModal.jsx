import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getDownloadInfo } from "../../lib/api";

export default function QualitySelectionModal({ 
  isOpen, 
  onClose, 
  video, 
  formatType // 'mp3' or 'mp4'
}) {
  const navigate = useNavigate();
  const [selectedQuality, setSelectedQuality] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [availableQualities, setAvailableQualities] = useState([]);
  const [loadingFormats, setLoadingFormats] = useState(false);

  // Extract video ID helper
  const extractVideoId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  // Fetch available formats when modal opens (optional - silent failure)
  useEffect(() => {
    if (!isOpen || !video) {
      // Reset when modal closes
      setAvailableQualities([]);
      setLoadingFormats(false);
      return;
    }

    let cancelled = false;

    const fetchAvailableFormats = async () => {
      try {
        const videoId = video.id || video.videoId || extractVideoId(video.url);
        const videoUrl = video.url || `https://www.youtube.com/watch?v=${videoId}`;
        
        if (!videoId || cancelled) return;

        // Fetch formats - getDownloadInfo already has timeout handling (60s)
        const info = await getDownloadInfo(videoUrl, videoId);
        
        if (cancelled || !info || !info.formats) return;
        
        if (formatType === 'mp4') {
          // Extract available video qualities (e.g., "1080p", "720p", etc.)
          const videoFormats = info.formats?.filter(f => f.type === 'video') || [];
          const qualities = videoFormats
            .map(f => {
              const quality = f.qualityLabel || f.quality || '';
              // Extract number from quality string (e.g., "1080p" -> "1080", "720p" -> "720")
              const match = quality.match(/(\d+)/);
              return match ? match[1] : null;
            })
            .filter(q => q !== null)
            .filter((q, i, arr) => arr.indexOf(q) === i); // Remove duplicates
          
          if (!cancelled && qualities.length > 0) {
            setAvailableQualities(qualities);
          }
        } else if (formatType === 'mp3') {
          // Extract available audio bitrates (e.g., "192kbps", "128kbps", etc.)
          const audioFormats = info.formats?.filter(f => f.type === 'audio') || [];
          const qualities = audioFormats
            .map(f => {
              // Try bitrate field first, then qualityLabel/quality
              const bitrate = f.bitrate ? String(f.bitrate) : (f.qualityLabel || f.quality || '');
              // Extract number from quality string (e.g., "192kbps" -> "192", "128" -> "128")
              const match = bitrate.match(/(\d+)/);
              return match ? match[1] : null;
            })
            .filter(q => q !== null)
            .filter((q, i, arr) => arr.indexOf(q) === i); // Remove duplicates
          
          if (!cancelled && qualities.length > 0) {
            setAvailableQualities(qualities);
          }
        }
      } catch (error) {
        // If format fetch fails, don't set availableQualities
        // This means availableQualities stays as [] (initial state)
        // Which will trigger fallback to show all qualities
        // This is acceptable - user can still click and will get error message
        if (!cancelled) {
          // Keep availableQualities as empty array to show all (fallback)
          // Don't log error - silent failure is expected if backend is slow/down
        }
      }
    };

    // Fetch in background without blocking UI
    fetchAvailableFormats();

    // Cleanup function to cancel request if component unmounts or dependencies change
    return () => {
      cancelled = true;
    };
  }, [isOpen, video?.id || video?.videoId, formatType]);

  if (!isOpen) return null;

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

  // MP4 Quality Options with colors
  const mp4Qualities = [
    { quality: '1080', label: 'MP4 1080p', color: 'bg-blue-600' },
    { quality: '720', label: 'MP4 720p', color: 'bg-cyan-400' },
    { quality: '480', label: 'MP4 480p', color: 'bg-teal-400' },
    { quality: '360', label: 'MP4 360p', color: 'bg-teal-500' },
    { quality: '240', label: 'MP4 240p', color: 'bg-yellow-400' },
    { quality: '144', label: 'MP4 144p', color: 'bg-pink-300' },
  ];

  // MP3 Quality Options with colors
  const mp3Qualities = [
    { quality: '256', label: 'MP3 256kbps', color: 'bg-teal-400' },
    { quality: '192', label: 'MP3 192kbps', color: 'bg-cyan-400' },
    { quality: '128', label: 'MP3 128kbps', color: 'bg-yellow-400' },
    { quality: '64', label: 'MP3 64kbps', color: 'bg-pink-300' },
  ];

  // Filter qualities based on available formats
  const allQualities = formatType === 'mp4' ? mp4Qualities : mp3Qualities;
  
  // If available qualities are loaded, filter to show only available ones
  // Otherwise, show all (fallback if fetch fails)
  const qualities = availableQualities.length > 0
    ? allQualities.filter(q => availableQualities.includes(q.quality))
    : allQualities; // Fallback: show all if fetch failed or still loading

  // Handle quality selection - Download directly (original working flow)
  const handleQualityClick = async (quality) => {
    setSelectedQuality(quality.quality);
    
    // Download immediately when quality is selected
    await downloadVideo(quality.quality);
  };


  // Direct download function - Original working flow
  const downloadVideo = async (quality) => {
    if (!video) return;

    try {
      setDownloading(true);
      
      const videoId = video.id || video.videoId || extractVideoId(video.url);
      if (!videoId) {
        alert('Video ID not found');
        setDownloading(false);
        return;
      }

      const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : window.location.origin;

      // ✅ ORIGINAL FLOW: Get download URL from backend first
      const downloadUrl = `${API_BASE}/api/v1/video/download?${new URLSearchParams({
        videoId: videoId,
        quality: quality,
        format: formatType
      })}`;


      // ✅ STEP 1: Fetch download URL from backend (like original)
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Use the message from backend directly (it already includes available qualities)
        // Only add closestQuality if not already in the message
        let errorMsg = errorData.message || errorData.error || `Download failed: ${response.status}`;
        
        // If backend didn't include closestQuality in message, add it separately
        if (errorData.closestQuality && !errorMsg.includes(errorData.closestQuality)) {
          errorMsg = `${errorMsg} Closest available: ${errorData.closestQuality}.`;
        }
        
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'No download URL available');
      }

      // ✅ STEP 2: Extract download URL (original logic)
      const finalDownloadUrl = data.mergeEndpoint || data.directUrl || data.streamUrl || data.url || data.downloadUrl;
      
      if (!finalDownloadUrl) {
        throw new Error('No download URL available in response');
      }

      // Use filename from backend or generate one
      let filename = data.filename || `${(video.title || 'video').replace(/[^a-zA-Z0-9\s-_.]/g, '_')}_${quality}${formatType === 'mp3' ? 'kbps' : 'p'}.${formatType}`;
      filename = filename
        .replace(/[^a-zA-Z0-9\s-_.]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .substring(0, 200);


      // ✅ STEP 3: Trigger browser native download - Original MP3 Juice Style
      if (data.needsMerge && data.mergeEndpoint) {
        // ✅ DASH Format (1080p+): Use iframe (original method)
        
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.src = data.mergeEndpoint;
        document.body.appendChild(iframe);
        
        // Remove iframe after download starts
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 5000);
      } else {
        // ✅ Progressive format: Use <a> tag with directUrl (original method)
        
        const link = document.createElement('a');
        link.href = finalDownloadUrl;
        link.download = filename; // Force download with filename
        link.style.display = 'none'; // Hide the link
        document.body.appendChild(link);
        link.click(); // Trigger download
        document.body.removeChild(link); // Cleanup immediately
      }

      // Close modal after download starts
      setTimeout(() => {
        onClose();
        setDownloading(false);
      }, 500);

    } catch (error) {
      console.error('Download error:', error);
      // Show error message to user
      const errorMessage = error.message || 'Download failed. Please try again.';
      alert(errorMessage);
      setDownloading(false);
    }
  };

  // Handle Download Now (if user wants to download selected quality again)
  const handleDownloadNow = () => {
    if (!selectedQuality) {
      alert('Please select a quality first');
      return;
    }
    downloadVideo(selectedQuality);
  };

  // Handle Play Now
  const handlePlayNow = () => {
    navigate("/play", {
      state: {
        video: video,
        videoData: video
      },
      replace: false
    });
    onClose();
  };

  // Handle Close
  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        {/* Top Section with Duration and Buttons */}
        <div className="p-6 bg-white rounded-t-lg">
          {/* Duration */}
          {video.duration && (
            <p className="text-center text-2xl font-semibold text-gray-800 mb-4">
              {formatDuration(video.duration)}
            </p>
          )}

          {/* Three Buttons: Close, MP4/MP3, Play */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-4 rounded-lg transition-all duration-200"
            >
              Close
            </button>
            <button
              className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-4 rounded-lg transition-all duration-200"
            >
              {formatType === 'mp4' ? 'MP4' : 'MP3'}
            </button>
            <button
              onClick={handlePlayNow}
              className="flex-1 bg-[#1676C2] hover:bg-[#1465a8] text-white font-medium py-3 px-4 rounded-lg transition-all duration-200"
            >
              Play
            </button>
          </div>
        </div>

        {/* Quality Selection Buttons */}
        <div className="p-6 bg-white">
          {loadingFormats && (
            <div className="text-center text-gray-600 mb-4">
              Loading available qualities...
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {qualities.length === 0 && !loadingFormats && (
              <div className="text-center text-gray-600 w-full py-4">
                No qualities available
              </div>
            )}
            {qualities.map((q) => (
              <button
                key={q.quality}
                onClick={() => handleQualityClick(q)}
                disabled={downloading}
                className={`${q.color} ${
                  selectedQuality === q.quality 
                    ? 'ring-4 ring-blue-600 ring-offset-2 scale-105' 
                    : ''
                } ${
                  downloading ? 'opacity-50 cursor-not-allowed' : ''
                } text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg`}
              >
                {downloading && selectedQuality === q.quality ? 'Downloading...' : q.label}
              </button>
            ))}
          </div>

          {/* Download Now and Play Now Buttons */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleDownloadNow}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 text-lg shadow-lg hover:shadow-xl"
            >
              Download Now
            </button>
            
            <button
              onClick={handlePlayNow}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 text-lg shadow-lg hover:shadow-xl"
            >
              Play Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
