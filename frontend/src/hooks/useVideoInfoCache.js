import { useEffect, useMemo, useRef } from "react";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * ✅ Y2MATE CACHE KEY STRATEGY:
 * - PRIMARY: Use videoId (most reliable, same video = same ID)
 * - FALLBACK: Use URL if videoId not available
 * - WHY: Prevents duplicate cache entries for same video
 */
function createCacheKey({ url, videoId }) {
  const id = videoId?.trim();
  const cleanedUrl = url?.trim();
  // ✅ PRIORITY 1: videoId (most reliable identifier)
  if (id && id.length === 11) return `videoId:${id}`;
  // ✅ PRIORITY 2: URL (fallback if no videoId)
  if (cleanedUrl) return `url:${cleanedUrl}`;
  return null;
}

export default function useVideoInfoCache(ttlMs = DEFAULT_TTL_MS) {
  const cacheRef = useRef(new Map());
  // ✅ CRITICAL: Track in-flight requests to prevent duplicate API calls
  const inFlightRef = useRef(new Map()); // Map<key, Promise>

  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();
      cacheRef.current.forEach((entry, key) => {
        if (entry.expiresAt <= now) {
          cacheRef.current.delete(key);
        }
      });
    }, 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  return useMemo(() => {
    const getVideoInfoFromCache = ({ url, videoId }) => {
      const key = createCacheKey({ url, videoId });
      if (!key) return null;

      const entry = cacheRef.current.get(key);
      if (!entry) return null;

      if (entry.expiresAt <= Date.now()) {
        cacheRef.current.delete(key);
        return null;
      }

      return entry.data;
    };

    const setVideoInfoCache = ({ url, videoId }, data, customTtlMs) => {
      const key = createCacheKey({ url, videoId });
      if (!key || !data) return data;

      const expiresAt = Date.now() + (customTtlMs || ttlMs);
      cacheRef.current.set(key, { data, expiresAt });
      return data;
    };

    const clearVideoInfoCache = ({ url, videoId }) => {
      const key = createCacheKey({ url, videoId });
      if (key) {
        cacheRef.current.delete(key);
      }
    };

    /**
     * ✅ Y2MATE BEHAVIOR: Get or fetch video info with SINGLE-FLIGHT protection
     * 
     * WHY SINGLE-FLIGHT:
     * - Multiple components might request same video simultaneously
     * - Without single-flight: duplicate API calls → duplicate yt-dlp executions
     * - With single-flight: first request runs, others wait for same promise
     * - RESULT: Only ONE API call per videoId, instant return for concurrent requests
     * 
     * CACHE-FIRST STRATEGY:
     * 1. Check cache → instant return if cached
     * 2. Check in-flight → reuse promise if already fetching
     * 3. Fetch only if NOT cached and NOT already fetching
     * 
     * WHY WAIT FOR IN-FLIGHT:
     * - If request already running, WAIT for it (don't start new one)
     * - Same promise shared across all callers
     * - RESULT: Zero duplicate API calls, all callers get same result
     */
    const getOrFetchVideoInfo = async ({
      url,
      videoId,
      fetcher,
      forceRefresh = false,
      customTtlMs
    }) => {
      const key = createCacheKey({ url, videoId });
      
      // ✅ STEP 1: Check cache FIRST (instant return)
      // WHY: Cached data = instant quality display, zero API calls
      if (!forceRefresh) {
        const cached = getVideoInfoFromCache({ url, videoId });
        if (cached) {
          return cached;
        }
      }

      // ✅ STEP 2: Check if request already in-flight (SINGLE-FLIGHT)
      // WHY: If already fetching, WAIT for same promise (don't start new request)
      // RESULT: Zero duplicate API calls, all callers get same result
      if (key && inFlightRef.current.has(key)) {
        return inFlightRef.current.get(key);
      }

      // ✅ STEP 3: Create new fetch promise and track it
      // WHY: This is the ONLY place a new fetch starts
      // RESULT: Single fetch per videoId, tracked for concurrent requests
      const fetchPromise = (async () => {
        try {
          const result = await fetcher();
          const cached = setVideoInfoCache({ url, videoId }, result, customTtlMs);
          return cached;
        } finally {
          // ✅ CRITICAL: Remove from in-flight when done
          // WHY: Allow future requests to start fresh fetch if cache expired
          if (key) {
            inFlightRef.current.delete(key);
          }
        }
      })();

      // ✅ CRITICAL: Track in-flight request
      // WHY: Concurrent requests for same videoId will reuse this promise
      if (key) {
        inFlightRef.current.set(key, fetchPromise);
      }

      return fetchPromise;
    };

    return {
      getVideoInfoFromCache,
      setVideoInfoCache,
      clearVideoInfoCache,
      getOrFetchVideoInfo,
    };
  }, [ttlMs]);
}

