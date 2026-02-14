/* ✅ ENHANCED: Global Error Handler Middleware
 * Features:
 * - User-friendly error messages
 * - Client disconnect handling
 * - Error grouping to reduce spam
 * - Proper HTTP status codes
 * - MongoDB error handling
 */

import logger from "../utils/logger.js";
import AppError from "../utils/AppError.js";
import { isMongoDBConnected, isMongoDBDisabled } from "../config/db.js";

// Error grouping to prevent spam
const errorGroups = new Map();
const ERROR_GROUP_WINDOW = 60000; // 1 minute
const MAX_ERRORS_PER_GROUP = 5;

/**
 * Check if error should be logged (grouping logic)
 */
const shouldLogError = (err, req) => {
  const errorKey = `${err.name}:${err.message?.substring(0, 50)}`;
  const now = Date.now();
  
  if (!errorGroups.has(errorKey)) {
    errorGroups.set(errorKey, { count: 1, firstSeen: now, lastSeen: now });
    return true;
  }
  
  const group = errorGroups.get(errorKey);
  const timeSinceFirst = now - group.firstSeen;
  
  // Reset if window expired
  if (timeSinceFirst > ERROR_GROUP_WINDOW) {
    group.count = 1;
    group.firstSeen = now;
    group.lastSeen = now;
    return true;
  }
  
  group.count++;
  group.lastSeen = now;
  
  // Log first few, then suppress
  if (group.count <= MAX_ERRORS_PER_GROUP) {
    return true;
  }
  
  // Log summary every 10 errors
  if (group.count % 10 === 0) {
    logger.warn(`⚠️ [Error Group] ${errorKey} - ${group.count} occurrences in last minute`);
    return false;
  }
  
  return false;
};

/**
 * Get user-friendly error message
 */
const getUserFriendlyMessage = (err, req) => {
  // Client disconnect errors - don't show to user
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message?.includes('client disconnected')) {
    return null; // Don't send response for client disconnects
  }
  
  // MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    if (isMongoDBDisabled() || !isMongoDBConnected()) {
      return 'Database temporarily unavailable. Please try again.';
    }
    if (err.message?.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    if (err.message?.includes('connection')) {
      return 'Database connection issue. Please try again later.';
    }
    return 'A database error occurred. Please try again.';
  }
  
  // Network errors
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    return 'Unable to connect to the service. Please check your internet connection.';
  }
  
  // Timeout errors
  if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  
  // Validation errors
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return 'Invalid request data. Please check your input.';
  }
  
  // YouTube API errors
  if (err.message?.includes('Video unavailable') || err.message?.includes('Private video')) {
    return 'This video is unavailable or private.';
  }
  
  // File system errors
  if (err.code === 'ENOENT') {
    return 'File not found.';
  }
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return 'Permission denied. Please check file permissions.';
  }
  
  // Operational errors (user-friendly messages)
  if (err.isOperational) {
    return err.message;
  }
  
  // Default message
  return 'An unexpected error occurred. Please try again.';
};

/**
 * Get appropriate HTTP status code
 */
const getStatusCode = (err) => {
  // Client disconnect - don't send response
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message?.includes('client disconnected')) {
    return null;
  }
  
  // Use status code from error if available
  if (err.statusCode) {
    return err.statusCode;
  }
  
  // MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    if (err.message?.includes('timeout')) return 504;
    if (err.message?.includes('connection')) return 503;
    return 500;
  }
  
  // Network errors
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    return 503;
  }
  
  // Timeout errors
  if (err.code === 'ETIMEDOUT') {
    return 504;
  }
  
  // Validation errors
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return 400;
  }
  
  // YouTube API errors
  if (err.message?.includes('Video unavailable') || err.message?.includes('Private video')) {
    return 404;
  }
  
  // File system errors
  if (err.code === 'ENOENT') {
    return 404;
  }
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    return 403;
  }
  
  // Default
  return 500;
};

/**
 * Send error response (development)
 */
const sendErrorDev = (err, res, req) => {
  const statusCode = getStatusCode(err);
  
  // Client disconnect - don't send response
  if (!statusCode) {
    return;
  }
  
  res.status(statusCode).json({
    success: false,
    status: err.status || "error",
    message: err.message,
    error: err,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Send error response (production)
 */
const sendErrorProd = (err, res, req) => {
  const statusCode = getStatusCode(err);
  
  // Client disconnect - don't send response
  if (!statusCode) {
    return;
  }
  
  const userMessage = getUserFriendlyMessage(err, req);
  
  // Operational error (known)
  if (err.isOperational) {
    return res.status(statusCode).json({
      success: false,
      status: err.status || "error",
      message: userMessage || err.message,
    });
  }
  
  // Programming / Unknown error
  if (shouldLogError(err, req)) {
    logger.error(`💥 [${req.method}] ${req.originalUrl} - ${err.message}`, {
      error: err.name,
      code: err.code,
      stack: err.stack,
    });
  }
  
  return res.status(statusCode).json({
    success: false,
    status: "error",
    message: userMessage || "Something went wrong on the server!",
  });
};

/**
 * Handle client disconnect gracefully
 */
const handleClientDisconnect = (err, req, res) => {
  const isClientDisconnect = 
    err.code === 'ECONNRESET' || 
    err.code === 'EPIPE' || 
    err.message?.includes('client disconnected') ||
    err.message?.includes('socket hang up');
  
  if (isClientDisconnect) {
    // Only log in development or verbose mode
    if (process.env.NODE_ENV === 'development' || process.env.VERBOSE_ERRORS === 'true') {
      logger.debug(`🔌 [${req.method}] ${req.originalUrl} - Client disconnected`);
    }
    
    // Don't send response if headers already sent
    if (!res.headersSent) {
      res.destroy();
    }
    return true;
  }
  
  return false;
};

/**
 * Global Error Handler Middleware
 */
const globalErrorHandler = (err, req, res, next) => {
  // Handle client disconnect
  if (handleClientDisconnect(err, req, res)) {
    return;
  }
  
  // Set default status code
  err.statusCode = getStatusCode(err) || 500;
  err.status = err.status || (err.statusCode >= 400 && err.statusCode < 500 ? "fail" : "error");
  
  // Log error (with grouping)
  if (shouldLogError(err, req)) {
    const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel](`[${req.method}] ${req.originalUrl} - ${err.message}`, {
      statusCode: err.statusCode,
      error: err.name,
      code: err.code,
    });
  }
  
  // Don't send response if already sent
  if (res.headersSent) {
    logger.warn(`⚠️ [Error] Headers already sent for ${req.originalUrl}`);
    return res.end();
  }
  
  // Environment-specific error response
  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, res, req);
  } else {
    sendErrorProd(err, res, req);
  }
};

/**
 * Async handler wrapper to catch errors
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Client disconnect handler middleware
 */
export const clientDisconnectHandler = (req, res, next) => {
  let isDisconnected = false;
  
  const cleanup = () => {
    if (isDisconnected) return;
    isDisconnected = true;
    
    // Only log in verbose mode - reduce log spam
    if (process.env.VERBOSE_CLIENT_DISCONNECTS === 'true') {
      logger.debug(`🔌 Client disconnected: ${req.method} ${req.originalUrl}`);
    }
  };
  
  // Only attach listeners if not already disconnected
  if (!req.aborted && !res.destroyed) {
    req.once('close', cleanup);
    req.once('aborted', cleanup);
  }
  
  // Store cleanup function and connection status for use in route handlers
  req._cleanup = cleanup;
  req._isClientConnected = () => !req.aborted && !res.destroyed;
  
  next();
};

export default globalErrorHandler;
