import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSearch } from "../../context/SearchContext";
import { getSuggestions, getVideoInfo } from "../../lib/api";
import useVideoInfoCache from "../../hooks/useVideoInfoCache";
import { Loader2, Search, X } from "lucide-react";

export default function SearchBar({ customTitle, hideSuggestions = false }) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingVideoInfo, setFetchingVideoInfo] = useState(false); // ✅ Loading state for video info fetch
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // ✅ CRITICAL: Prevent duplicate submissions
  const isSubmittingRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { setQuery, setSearchType } = useSearch();
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const {
    getVideoInfoFromCache,
    getOrFetchVideoInfo,
  } = useVideoInfoCache();

  // Read from location.state
  useEffect(() => {
    if (location.state?.query) {
      setInputValue(location.state.query);
      // Close suggestions when query changes from location state
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [location.state]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check if URL is YouTube
  const isYouTubeUrl = (str) => {
    try {
      const url = new URL(str);
      return url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be");
    } catch {
      return false;
    }
  };

  const buildVideoCacheKey = (value) => {
    const match = value.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return { url: value, videoId: match ? match[1] : undefined };
  };

  // Debounced Suggestions
  useEffect(() => {
    if (!inputValue.trim() || isYouTubeUrl(inputValue) || hideSuggestions || isSubmittingRef.current) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const debounce = setTimeout(async () => {
      // Double check if we're still not submitting
      if (isSubmittingRef.current) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setLoading(true);
      try {
        const data = await getSuggestions(inputValue);

        // Check again after async operation
        if (isSubmittingRef.current) {
          setSuggestions([]);
          setShowSuggestions(false);
          setLoading(false);
          return;
        }

        if (Array.isArray(data)) {
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        } else if (data?.success && Array.isArray(data.suggestions)) {
          setSuggestions(data.suggestions);
          setShowSuggestions(data.suggestions.length > 0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (err) {
        console.error("❌ [SearchBar] Suggestion error:", err);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounce);
  }, [inputValue, location.pathname, hideSuggestions]);

  /**
   * ✅ MP3Juice BEHAVIOR: Handle submit with SINGLE-FLIGHT protection
   * - YouTube URL: Navigate immediately, NO background fetch (Downloader handles it)
   * - Search query: Navigate to search page
   * - WHY: Prevents duplicate API calls, ensures single request per videoId
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // ✅ CRITICAL: Prevent duplicate submissions
    if (isSubmittingRef.current) {
      return;
    }

    const trimmedQuery = inputValue.trim();

    if (!trimmedQuery) {
      setError("Please enter a search term");
      return;
    }

    // ✅ CRITICAL: Set submitting lock
    isSubmittingRef.current = true;

    // Hide suggestions immediately
    setError("");
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);

    // Blur input
    if (inputRef.current) {
      inputRef.current.blur();
    }

    try {
      if (isYouTubeUrl(trimmedQuery)) {
        setQuery(trimmedQuery);
        setSearchType("url");

        // ✅ MP3JUICE BEHAVIOR: Navigate to search page with URL type
        // This will show the video as a card on search results page (like MP3 Juice)
        navigate("/search", {
          state: {
            query: trimmedQuery,
            type: "url"
          },
          replace: false
        });
        isSubmittingRef.current = false;
        return;
      } else {
        setQuery(trimmedQuery);
        setSearchType("query");

        // Ensure suggestions are closed before navigation
        setShowSuggestions(false);
        setSuggestions([]);

        navigate("/search", {
          state: {
            query: trimmedQuery,
            type: "query"
          },
          replace: false
        });
      }
    } catch (err) {
      console.error("❌ [SearchBar] Error:", err);
      setError(err.message || "Search failed. Please try again.");
    } finally {
      // ✅ CRITICAL: Release lock after navigation
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, 100);
    }
  };

  /**
   * ✅ MP3Juice: Handle suggestion click
   * - Navigate immediately to search page
   */
  const handleSuggestionClick = (e, text) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }


    setInputValue(text);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);

    if (inputRef.current) {
      inputRef.current.blur();
    }

    setQuery(text);
    setSearchType("query");

    navigate("/search", {
      state: {
        query: text,
        type: "query"
      },
      replace: false
    });
  };

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     🔥 FIX: KEYBOARD NAVIGATION - NO RELOAD!
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : -1));
    }
    else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(null, suggestions[highlightIndex]);
    }
    else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };


  // Handle input focus
  const handleFocus = () => {
    if (suggestions.length > 0 && !hideSuggestions) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className="w-full relative">
      {/* Search Form Container - Simple white box */}
      <div ref={containerRef} className="relative w-full mx-auto">
        <form
          onSubmit={handleSubmit}
          className="flex items-center w-full bg-white rounded-lg shadow-md overflow-hidden"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder="Search Your Favorite Music"
            className="flex-1 px-4 sm:px-6 py-3 sm:py-4 md:py-5 text-base sm:text-lg md:text-xl outline-none text-gray-700 placeholder-gray-500"
            autoComplete="off"
          />

          <button
            type="submit"
            onClick={(e) => {
              setShowSuggestions(false);
              setSuggestions([]);
            }}
            disabled={fetchingVideoInfo}
            className="px-4 sm:px-6 py-3 sm:py-4 md:py-5 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetchingVideoInfo ? (
              <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-gray-700" />
            ) : (
              <Search className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
            )}
          </button>
        </form>

        {/* Suggestions Dropdown */}
        {showSuggestions && (loading || suggestions.length > 0) && (
          <ul className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-2xl z-[9999] max-h-80 overflow-y-auto">
            {loading ? (
              <li className="px-4 py-3 text-gray-500 text-left flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#1676C2]" />
                Loading...
              </li>
            ) : (
              suggestions.map((s, i) => (
                <li
                  key={i}
                  onClick={(e) => handleSuggestionClick(e, s)}
                  className={`px-4 py-3 cursor-pointer text-left transition-all border-b border-gray-100 last:border-b-0 ${i === highlightIndex
                      ? "bg-blue-50 text-[#1676C2] font-medium"
                      : "hover:bg-gray-100 text-gray-700"
                    }`}
                >
                  {s}
                </li>
              ))
            )}
          </ul>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}