// ✅ DAY 4-5: Info Controller - Quality Selection Endpoint Added
import { fetchVideoInfo, fetchAvailableQualities } from "../services/videoService.js";
import logger from "../utils/logger.js";
import AppError from "../utils/AppError.js";
import { successResponse, errorResponse } from "../utils/response.js";

/* ----------------------------------------------------------
   📹 GET VIDEO INFO (Original)
---------------------------------------------------------- */
export const getVideoInfo = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return errorResponse(res, "URL is required", 400);
    }

    logger.info(`🎥 Fetching video info for: ${url}`);

    const info = await fetchVideoInfo(url);

    return successResponse(res, "Video info fetched successfully", {
      video: {
        id: info.id,
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        uploader: info.uploader,
        view_count: info.view_count,
        url: info.url,
      },
    });

  } catch (error) {
    logger.error(`❌ getVideoInfo error: ${error.message}`);
    
    if (error instanceof AppError) {
      return errorResponse(res, error.message, error.statusCode);
    }
    
    return errorResponse(res, "Failed to fetch video info", 500);
  }
};

/* ----------------------------------------------------------
   🆕 DAY 4-5: GET AVAILABLE QUALITIES
---------------------------------------------------------- */

/**
 * Fetch all available quality options for a video
 * @route POST /api/info/qualities
 * @body { url: string }
 * @returns { qualities: Array, recommended: string }
 */
export const getAvailableQualities = async (req, res) => {
  try {
    const { url } = req.body;

    // Validation
    if (!url) {
      return errorResponse(res, "URL is required", 400);
    }

    if (typeof url !== "string" || url.trim().length === 0) {
      return errorResponse(res, "Invalid URL format", 400);
    }

    logger.info(`🎯 Fetching qualities for: ${url}`);

    // Fetch qualities from service
    const qualityData = await fetchAvailableQualities(url);

    // Response structure
    const response = {
      videoId: qualityData.videoId,
      title: qualityData.title,
      duration: qualityData.duration,
      durationString: qualityData.durationString,
      thumbnail: qualityData.thumbnail,
      qualities: qualityData.qualities,
      recommendedQuality: qualityData.recommendedQuality,
      totalOptions: qualityData.qualities.length,
    };

    logger.info(`✅ Found ${response.totalOptions} quality options`);
    logger.info(`💡 Recommended: ${response.recommendedQuality}`);

    return successResponse(
      res, 
      "Quality options fetched successfully", 
      response
    );

  } catch (error) {
    logger.error(`❌ getAvailableQualities error: ${error.message}`);
    
    if (error instanceof AppError) {
      return errorResponse(res, error.message, error.statusCode);
    }
    
    return errorResponse(
      res, 
      "Failed to fetch quality options. Please try again.", 
      500
    );
  }
};

/* ----------------------------------------------------------
   🆕 DAY 4-5: GET QUALITY INFO (Single Quality Details)
---------------------------------------------------------- */

/**
 * Get details for a specific quality
 * @route POST /api/info/quality-details
 * @body { url: string, quality: string }
 * @returns { quality: object }
 */
export const getQualityDetails = async (req, res) => {
  try {
    const { url, quality } = req.body;

    // Validation
    if (!url || !quality) {
      return errorResponse(res, "URL and quality are required", 400);
    }

    logger.info(`🔍 Fetching details for ${quality}: ${url}`);

    // Fetch all qualities
    const qualityData = await fetchAvailableQualities(url);

    // Find specific quality
    const selectedQuality = qualityData.qualities.find(
      q => q.quality === quality || q.quality === `${quality}p`
    );

    if (!selectedQuality) {
      return errorResponse(
        res, 
        `Quality ${quality} not available for this video`, 
        404
      );
    }

    logger.info(`✅ Quality details found: ${selectedQuality.label}`);

    return successResponse(
      res,
      "Quality details fetched successfully",
      {
        videoId: qualityData.videoId,
        title: qualityData.title,
        quality: selectedQuality,
        recommended: selectedQuality.recommended,
      }
    );

  } catch (error) {
    logger.error(`❌ getQualityDetails error: ${error.message}`);
    
    if (error instanceof AppError) {
      return errorResponse(res, error.message, error.statusCode);
    }
    
    return errorResponse(res, "Failed to fetch quality details", 500);
  }
};

/* ----------------------------------------------------------
   📊 EXPORTS
---------------------------------------------------------- */
export default {
  getVideoInfo,           // Original endpoint
  getAvailableQualities,  // 🆕 DAY 4-5: Fetch all qualities
  getQualityDetails,      // 🆕 DAY 4-5: Fetch single quality
};