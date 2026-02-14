// ✅ Retry Handler Utility
// Features:
// - Exponential backoff
// - Max retry attempts
// - Retry only on transient failures

/**
 * Check if error is retryable
 */
export const isRetryableError = (error) => {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  
  // MongoDB connection errors
  if (error.name === 'MongoError' || error.name === 'MongooseError') {
    if (error.message?.includes('timeout') || error.message?.includes('connection')) {
      return true;
    }
  }
  
  // HTTP 5xx errors (server errors)
  if (error.statusCode >= 500 && error.statusCode < 600) {
    return true;
  }
  
  // HTTP 429 (rate limit)
  if (error.statusCode === 429) {
    return true;
  }
  
  return false;
};

/**
 * Retry function with exponential backoff
 */
export const retry = async (fn, options = {}) => {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry = null,
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if error is not retryable
      if (!isRetryableError(error)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt - 1),
        maxDelay
      );
      
      if (onRetry) {
        onRetry(error, attempt, delay);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * Retry with custom condition
 */
export const retryWithCondition = async (fn, shouldRetry, options = {}) => {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check custom retry condition
      if (!shouldRetry(error, attempt)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Calculate delay
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt - 1),
        maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

export default {
  retry,
  retryWithCondition,
  isRetryableError,
};

