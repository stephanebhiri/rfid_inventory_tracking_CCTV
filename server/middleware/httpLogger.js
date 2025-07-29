const { logger } = require('../config/logger');
const onFinished = require('on-finished');

/**
 * Enhanced HTTP logging middleware for production observability
 * Compatible with ELK Stack, Grafana Loki, and other log aggregation systems
 */

// Helper to get response time in milliseconds
const getDurationInMs = (start) => {
  const NS_PER_SEC = 1e9;
  const NS_TO_MS = 1e6;
  const diff = process.hrtime(start);
  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
};

// Helper to categorize status codes
const getStatusCategory = (statusCode) => {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  if (statusCode >= 300) return 'info';
  return 'info';
};

// Helper to get request size
const getRequestSize = (req) => {
  try {
    return req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0;
  } catch {
    return 0;
  }
};

// Helper to sanitize URLs (remove sensitive data)
const sanitizeUrl = (url) => {
  // Remove potential tokens or sensitive query params
  return url.replace(/([?&])(token|password|secret|key)=[^&]*/gi, '$1$2=***');
};

// Main HTTP logging middleware
const httpLogger = (options = {}) => {
  const {
    excludePaths = ['/api/health', '/favicon.ico'],
    slowRequestThreshold = 1000, // ms
    includeBody = false,
    sensitiveHeaders = ['authorization', 'cookie', 'x-auth-token']
  } = options;

  return (req, res, next) => {
    // Skip logging for excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const start = process.hrtime();
    const startTime = new Date();

    // Capture request data
    const requestData = {
      method: req.method,
      url: sanitizeUrl(req.originalUrl || req.url),
      path: req.path,
      query: req.query,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      referrer: req.get('referrer'),
      requestSize: getRequestSize(req),
      correlationId: req.correlationId
    };

    // Add sanitized headers
    const headers = {};
    Object.keys(req.headers).forEach(key => {
      if (!sensitiveHeaders.includes(key.toLowerCase())) {
        headers[key] = req.headers[key];
      }
    });

    // Log request received (debug level)
    logger.debug('HTTP Request Received', {
      ...requestData,
      headers,
      tags: ['http', 'request', 'incoming'],
      timestamp: startTime.toISOString()
    });

    // Capture original methods
    const originalSend = res.send;
    const originalJson = res.json;
    let responseBody;
    let responseSize = 0;

    // Override response methods to capture size
    res.send = function(data) {
      responseBody = data;
      try {
        responseSize = Buffer.byteLength(data || '', 'utf8');
      } catch {
        responseSize = 0;
      }
      return originalSend.call(this, data);
    };

    res.json = function(data) {
      responseBody = data;
      try {
        responseSize = Buffer.byteLength(JSON.stringify(data), 'utf8');
      } catch {
        responseSize = 0;
      }
      return originalJson.call(this, data);
    };

    // Log when response is finished
    onFinished(res, (err, res) => {
      const duration = getDurationInMs(start);
      const statusCode = res.statusCode;
      const level = getStatusCategory(statusCode);

      // Build log entry
      const logEntry = {
        // Request info
        method: requestData.method,
        url: requestData.url,
        path: requestData.path,
        
        // Response info
        statusCode,
        statusMessage: res.statusMessage,
        
        // Performance metrics
        duration: Math.round(duration * 100) / 100, // Round to 2 decimals
        durationMs: duration,
        requestSize: requestData.requestSize,
        responseSize,
        
        // Metadata
        correlationId: requestData.correlationId,
        ip: requestData.ip,
        userAgent: requestData.userAgent,
        
        // Tags for log aggregation
        tags: ['http', 'response', `status-${Math.floor(statusCode / 100)}xx`],
        
        // Timestamps
        timestamp: new Date().toISOString(),
        startTime: startTime.toISOString(),
        
        // Additional context
        slow: duration > slowRequestThreshold,
        error: err ? err.message : undefined
      };

      // Add performance tags
      if (duration > slowRequestThreshold) {
        logEntry.tags.push('slow-request');
      }
      if (statusCode >= 500) {
        logEntry.tags.push('server-error');
      }
      if (statusCode >= 400 && statusCode < 500) {
        logEntry.tags.push('client-error');
      }

      // Add endpoint-specific tags
      if (req.path.startsWith('/api/cctv')) {
        logEntry.tags.push('cctv');
      }
      if (req.path.startsWith('/api/items')) {
        logEntry.tags.push('items');
      }
      if (req.path.startsWith('/static/cache/videos')) {
        logEntry.tags.push('video-stream');
      }

      // Log with appropriate level
      const message = `HTTP ${statusCode} ${req.method} ${req.path}`;
      
      if (level === 'error') {
        logger.error(message, logEntry);
      } else if (level === 'warn') {
        logger.warn(message, logEntry);
      } else {
        logger.info(message, logEntry);
      }

      // Log slow requests separately for monitoring
      if (duration > slowRequestThreshold) {
        logger.warn('Slow HTTP Request Detected', {
          ...logEntry,
          level: 'performance',
          tags: [...logEntry.tags, 'performance', 'slow']
        });
      }
    });

    next();
  };
};

// Middleware to log errors with full context
const errorLogger = (err, req, res, next) => {
  const requestInfo = {
    method: req.method,
    url: sanitizeUrl(req.originalUrl || req.url),
    path: req.path,
    query: req.query,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    correlationId: req.correlationId,
    tags: ['http', 'error', 'unhandled']
  };

  logger.error('Unhandled HTTP Error', {
    ...requestInfo,
    error: {
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode || 500
    },
    timestamp: new Date().toISOString()
  });

  next(err);
};

// Export middleware and helpers
module.exports = {
  httpLogger,
  errorLogger,
  getDurationInMs,
  getStatusCategory
};