/* ✅ Request Timeout Handler Middleware
 * Features:
 * - Request timeout (max 10 seconds)
 * - Graceful timeout handling
 * - Client disconnect detection
 * - Keep-alive headers
 */

import logger from '../utils/logger.js';

const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Request timeout middleware
 * Sets a timeout for requests and handles timeouts gracefully
 * Streaming endpoints are excluded from timeout
 */
export const timeoutHandler = (timeoutMs = DEFAULT_TIMEOUT) => {
  return (req, res, next) => {
    // ✅ FIX: Exclude streaming endpoints from timeout (they can take minutes)
    const isStreamingEndpoint = 
      req.originalUrl.includes('/stream') ||
      req.originalUrl.includes('/merge') ||
      req.originalUrl.includes('/download') ||
      req.originalUrl.includes('/progress');
    
    // For streaming endpoints, use much longer timeout (10 minutes)
    const effectiveTimeout = isStreamingEndpoint ? 600000 : timeoutMs;
    
    // Set timeout
    req.setTimeout(effectiveTimeout, () => {
      // Don't timeout if headers already sent (streaming in progress)
      if (res.headersSent) {
        logger.debug(`⏱️ [Timeout] ${req.method} ${req.originalUrl} - Timeout ignored (streaming in progress)`);
        return;
      }
      
      logger.warn(`⏱️ [Timeout] ${req.method} ${req.originalUrl} - Request timeout after ${effectiveTimeout}ms`);
      
      // Check if client is still connected
      if (!req.aborted && !res.destroyed) {
        res.status(504).json({
          success: false,
          error: 'Request timeout',
          message: 'The request took too long to process. Please try again.',
          timeout: effectiveTimeout
        });
      }
    });

    // Store timeout for cleanup
    req._timeout = effectiveTimeout;
    
    next();
  };
};

/**
 * Keep-alive middleware
 * Sets proper connection headers to prevent premature disconnects
 */
export const keepAliveHandler = (req, res, next) => {
  // Set keep-alive headers
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=30, max=1000');
  
  // Check if client is still connected before sending response
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (req.aborted || res.destroyed) {
      logger.debug(`🔌 [KeepAlive] Client disconnected before sending response: ${req.method} ${req.originalUrl}`);
      return res;
    }
    return originalJson(data);
  };
  
  next();
};

/**
 * Check if client is still connected
 */
export const isClientConnected = (req, res) => {
  return !req.aborted && !res.destroyed && req.socket && !req.socket.destroyed;
};

export default timeoutHandler;

