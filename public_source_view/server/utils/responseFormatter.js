/**
 * Standardized API response formatter
 * Ensures consistent response format across all endpoints
 */

class ApiResponse {
  /**
   * Success response with data
   * @param {Object} res - Express response object
   * @param {*} data - The data to return
   * @param {Object} meta - Optional metadata (pagination, etc.)
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data, meta = {}, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data: data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    });
  }

  /**
   * Error response with standardized format
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {*} details - Additional error details (only in development)
   * @param {string} code - Optional error code for client handling
   */
  static error(res, statusCode, message, details = null, code = null) {
    const response = {
      success: false,
      error: {
        message: message,
        code: code,
        timestamp: new Date().toISOString()
      }
    };

    // Only include details in development environment
    if (process.env.NODE_ENV === 'development' && details) {
      response.error.details = details;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Database error response
   * @param {Object} res - Express response object
   * @param {Error} error - The database error
   */
  static databaseError(res, error) {
    console.error('❌ Database error:', error);
    return this.error(
      res, 
      500, 
      'Database operation failed', 
      error.message,
      'DATABASE_ERROR'
    );
  }

  /**
   * Not found error response
   * @param {Object} res - Express response object
   * @param {string} resource - The resource that was not found
   */
  static notFound(res, resource = 'Resource') {
    return this.error(
      res, 
      404, 
      `${resource} not found`,
      null,
      'NOT_FOUND'
    );
  }

  /**
   * Bad request error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {*} details - Validation details
   */
  static badRequest(res, message = 'Bad request', details = null) {
    return this.error(
      res, 
      400, 
      message,
      details,
      'BAD_REQUEST'
    );
  }

  /**
   * Internal server error response
   * @param {Object} res - Express response object
   * @param {Error} error - The error that occurred
   */
  static internalError(res, error) {
    console.error('💥 Internal server error:', error);
    return this.error(
      res, 
      500, 
      'Internal server error',
      error.message,
      'INTERNAL_ERROR'
    );
  }

  /**
   * Service unavailable error (for CCTV camera failures)
   * @param {Object} res - Express response object
   * @param {string} service - The service that is unavailable
   * @param {string} details - Additional details
   */
  static serviceUnavailable(res, service = 'Service', details = null) {
    return this.error(
      res, 
      503, 
      `${service} temporarily unavailable`,
      details,
      'SERVICE_UNAVAILABLE'
    );
  }

  /**
   * Legacy CCTV response format (maintains compatibility)
   * For existing CCTV endpoints that expect array format
   * @param {*} videos - Videos object
   * @param {number} closestIndex - Closest video index
   * @param {number} offsetSeconds - Time offset
   * @param {number} cameraId - Camera ID
   * @param {*} timestamps - Timestamps object
   * @param {*} metadata - Additional metadata
   */
  static cctvLegacy(videos, closestIndex, offsetSeconds, cameraId, timestamps, metadata = {}) {
    return [
      videos,
      closestIndex,
      offsetSeconds,
      cameraId,
      timestamps,
      metadata
    ];
  }
}

module.exports = ApiResponse;