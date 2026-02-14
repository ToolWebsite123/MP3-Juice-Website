// ✅ src/utils/response.js — Response Helper Functions (ERROR FIXED)

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {String} message - Success message
 * @param {Number} status - HTTP status code
 */
export const successResponse = (res, data, message = "Success", status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

/**
 * ✅ FIXED: Send error response (YE MISSING THA)
 * @param {Object} res - Express response object
 * @param {String} message - Error message
 * @param {Number} status - HTTP status code
 * @param {*} error - Error details (optional)
 */
export const errorResponse = (res, message = "An error occurred", status = 400, error = null) => {
  const response = {
    success: false,
    message,
  };

  // Include error details in development mode
  if (process.env.NODE_ENV === 'development' && error) {
    response.error = error;
  }

  return res.status(status).json(response);
};

/**
 * Send validation error response
 * @param {Object} res - Express response object
 * @param {Array} errors - Validation errors array
 */
export const validationErrorResponse = (res, errors) => {
  return res.status(422).json({
    success: false,
    message: "Validation failed",
    errors,
  });
};

/**
 * Send not found response
 * @param {Object} res - Express response object
 * @param {String} resource - Resource name
 */
export const notFoundResponse = (res, resource = "Resource") => {
  return res.status(404).json({
    success: false,
    message: `${resource} not found`,
  });
};

/**
 * Send unauthorized response
 * @param {Object} res - Express response object
 * @param {String} message - Error message
 */
export const unauthorizedResponse = (res, message = "Unauthorized access") => {
  return res.status(401).json({
    success: false,
    message,
  });
};

/**
 * Send server error response
 * @param {Object} res - Express response object
 * @param {*} error - Error object
 */
export const serverErrorResponse = (res, error) => {
  console.error('❌ Server Error:', error);
  
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { error: error.message }),
  });
};

// ✅ Default export bhi add kar dete hain
export default {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  serverErrorResponse,
};