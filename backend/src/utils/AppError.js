// ✅ ENHANCED: Application Error Class
// Features:
// - User-friendly messages
// - Proper HTTP status codes
// - Error categorization

export default class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = isOperational; // Known (handled) errors

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a user-friendly error
   */
  static userFriendly(message, statusCode = 400) {
    return new AppError(message, statusCode, true);
  }

  /**
   * Create a server error
   */
  static serverError(message = "Internal server error", statusCode = 500) {
    return new AppError(message, statusCode, false);
  }

  /**
   * Create a not found error
   */
  static notFound(resource = "Resource") {
    return new AppError(`${resource} not found`, 404, true);
  }

  /**
   * Create a validation error
   */
  static validation(message = "Validation failed") {
    return new AppError(message, 400, true);
  }

  /**
   * Create an unauthorized error
   */
  static unauthorized(message = "Unauthorized access") {
    return new AppError(message, 401, true);
  }

  /**
   * Create a forbidden error
   */
  static forbidden(message = "Access forbidden") {
    return new AppError(message, 403, true);
  }

  /**
   * Create a timeout error
   */
  static timeout(message = "Request timed out") {
    return new AppError(message, 504, true);
  }

  /**
   * Create a service unavailable error
   */
  static unavailable(message = "Service temporarily unavailable") {
    return new AppError(message, 503, true);
  }
}
