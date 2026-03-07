/**
 * Standardized API response helpers
 */

const API_VERSION = '1.0';

/**
 * Send a standardized success response
 * @param {object} res - Vercel response object
 * @param {any} data - Data to include in response
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: API_VERSION
    }
  });
}

/**
 * Send a standardized error response
 * @param {object} res - Vercel response object
 * @param {string} code - Error code (e.g., "VALIDATION_ERROR")
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @param {any[]} details - Optional array of error details
 */
export function sendError(res, code, message, statusCode = 400, details = undefined) {
  const error = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return res.status(statusCode).json({
    success: false,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      version: API_VERSION
    }
  });
}
