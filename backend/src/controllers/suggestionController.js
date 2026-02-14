// ✅ src/controllers/suggestionController.js
import fetch from "node-fetch";
import logger from "../utils/logger.js";

/**
 * 🔍 Fetch YouTube Search Suggestions
 * Example endpoint:
 *   GET /api/suggestions?q=atif+aslam
 */
export const getSuggestions = async (req, res) => {
  try {
    const query = (req.query.q || "").trim();

    // 🧩 Validation
    if (!query) {
      logger.warn("⚠️ Suggestion request missing query param");
      return res.status(400).json({
        success: false,
        message: "Search query required",
      });
    }

    // 🌐 Google Suggest API (YouTube dataset)
    // Try primary endpoint first
    const primaryUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(
      query
    )}`;
    
    // Alternative endpoint (clients1.google.com)
    const alternativeUrl = `https://clients1.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(
      query
    )}`;

    logger.info(`🔍 Fetching YouTube suggestions for: "${query}"`);

    // ⏱️ Timeout using AbortController (recommended in node-fetch v3+)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // Reduced timeout

    let response;
    let data;
    let lastError;

    // Try primary endpoint
    try {
      response = await fetch(primaryUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        data = await response.json();
        if (Array.isArray(data) && Array.isArray(data[1])) {
          logger.info(`✅ Suggestions fetched successfully (${data[1].length} results)`);
          return res.json({
            success: true,
            suggestions: data[1],
          });
        }
      }
    } catch (primaryErr) {
      lastError = primaryErr;
      logger.debug(`⚠️ Primary endpoint failed: ${primaryErr.message}`);
      
      // Check if it's a DNS/network error
      if (primaryErr.code === "ENOTFOUND" || primaryErr.message.includes("getaddrinfo")) {
        logger.warn(`🌐 DNS resolution failed for suggestqueries.google.com - network may be unavailable`);
      }
    }

    // Try alternative endpoint if primary failed
    if (!data) {
      const altController = new AbortController();
      const altTimeout = setTimeout(() => altController.abort(), 5000);
      
      try {
        logger.debug(`🔄 Trying alternative suggestions endpoint...`);
        response = await fetch(alternativeUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
          },
          signal: altController.signal,
        });

        clearTimeout(altTimeout);

        if (response.ok) {
          data = await response.json();
          if (Array.isArray(data) && Array.isArray(data[1])) {
            logger.info(`✅ Suggestions fetched from alternative endpoint (${data[1].length} results)`);
            return res.json({
              success: true,
              suggestions: data[1],
            });
          }
        }
      } catch (altErr) {
        lastError = altErr;
        logger.debug(`⚠️ Alternative endpoint also failed: ${altErr.message}`);
      }
    }

    // If both endpoints failed, return empty suggestions gracefully
    const isNetworkError = lastError?.code === "ENOTFOUND" || 
                          lastError?.message?.includes("getaddrinfo") ||
                          lastError?.message?.includes("ECONNREFUSED") ||
                          lastError?.name === "AbortError";

    if (isNetworkError) {
      logger.warn(`⚠️ Network error fetching suggestions - returning empty list (query: "${query}")`);
      // Return empty suggestions instead of error - better UX
      return res.json({
        success: true,
        suggestions: [],
        message: "Suggestions temporarily unavailable",
      });
    }

    // For other errors, still return empty array but log the error
    logger.error(`❌ Suggestion fetch failed: ${lastError?.message || "Unknown error"}`);
    return res.json({
      success: true,
      suggestions: [],
      message: "Suggestions unavailable",
    });

  } catch (err) {
    // Final catch-all error handler
    logger.error(`❌ Unexpected error in suggestions: ${err.message}`);
    
    // Always return success with empty array for better UX
    return res.json({
      success: true,
      suggestions: [],
      message: "Suggestions temporarily unavailable",
    });
  }
};
