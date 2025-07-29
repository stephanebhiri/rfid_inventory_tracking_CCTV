const winston = require('winston');
const path = require('path');

// Define log levels with priorities
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

winston.addColors(logColors);

// Create custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, correlationId, ...meta } = info;
    
    let logMessage = `${timestamp} [${level}]`;
    
    if (correlationId) {
      logMessage += ` [${correlationId}]`;
    }
    
    logMessage += `: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Create custom format for file output (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports = [];

// Console transport (always enabled for development feedback)
transports.push(
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: consoleFormat
  })
);

// File transports (only in production or when explicitly enabled)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
  const logDir = path.join(__dirname, '..', '..', 'logs');
  
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
  
  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 3
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports: transports,
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: process.env.NODE_ENV === 'production' ? [
    new winston.transports.File({ 
      filename: path.join(__dirname, '..', '..', 'logs', 'exceptions.log') 
    })
  ] : [],
  
  rejectionHandlers: process.env.NODE_ENV === 'production' ? [
    new winston.transports.File({ 
      filename: path.join(__dirname, '..', '..', 'logs', 'rejections.log') 
    })
  ] : []
});

// Create request correlation middleware
function correlationMiddleware(req, res, next) {
  const { v4: uuidv4 } = require('crypto').webcrypto?.randomUUID ? 
    { v4: () => require('crypto').randomUUID() } : 
    require('uuid');
  
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  
  // Log request start
  logger.http('Request started', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  });
  
  // Capture response time
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http('Request completed', {
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
}

// Helper functions for common logging patterns
const loggers = {
  // Database operations
  database: {
    query: (query, params, correlationId) => {
      logger.debug('Database query', {
        correlationId,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        paramCount: params?.length || 0
      });
    },
    
    result: (rowCount, correlationId) => {
      logger.debug('Database result', {
        correlationId,
        rowCount
      });
    },
    
    error: (error, query, correlationId) => {
      logger.error('Database error', {
        correlationId,
        error: error.message,
        query: query?.substring(0, 100),
        stack: error.stack
      });
    }
  },
  
  // CCTV operations
  cctv: {
    request: (camera, target, correlationId) => {
      logger.info('CCTV request', {
        correlationId,
        camera,
        target,
        targetDate: new Date(target * 1000).toISOString()
      });
    },
    
    auth: (success, correlationId) => {
      logger.info('CCTV authentication', {
        correlationId,
        success
      });
    },
    
    videoFound: (camera, count, correlationId) => {
      logger.info('CCTV videos found', {
        correlationId,
        camera,
        videoCount: count
      });
    },
    
    cameraError: (camera, error, correlationId) => {
      logger.warn('CCTV camera unavailable', {
        correlationId,
        camera,
        error
      });
    }
  },
  
  // Video streaming
  video: {
    request: (filename, correlationId) => {
      logger.info('Video stream request', {
        correlationId,
        filename
      });
    },
    
    cached: (filename, size, correlationId) => {
      logger.info('Video cached', {
        correlationId,
        filename,
        sizeBytes: size
      });
    },
    
    streaming: (filename, correlationId) => {
      logger.info('Video streaming started', {
        correlationId,
        filename
      });
    }
  },
  
  // Cache operations
  cache: {
    cleanup: (removedCount, totalSize) => {
      logger.info('Cache cleanup completed', {
        removedFiles: removedCount,
        totalSizeBytes: totalSize
      });
    },
    
    sizeCheck: (currentSize, maxSize) => {
      logger.debug('Cache size check', {
        currentSizeBytes: currentSize,
        maxSizeBytes: maxSize,
        utilizationPercent: Math.round((currentSize / maxSize) * 100)
      });
    }
  }
};

module.exports = {
  logger,
  correlationMiddleware,
  loggers
};