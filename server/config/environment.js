const path = require('path');

/**
 * Environment-based configuration management
 * Supports development, staging, and production environments
 */

const environments = {
  development: {
    // Database settings
    database: {
      connectionLimit: 5,
      acquireTimeout: 30000,
      connectTimeout: 30000,
      charset: 'utf8mb4'
    },
    
    // Cache settings
    cache: {
      queryTtl: 1000 * 60 * 1, // 1 minute in dev
      maxEntries: 50,
      fileTtl: 1000 * 60 * 30, // 30 minutes for files
      maxSizeBytes: 500 * 1024 * 1024 // 500MB in dev
    },
    
    // Logging settings
    logging: {
      level: 'debug',
      enableFileLogging: false,
      enableConsoleColors: true,
      logDirectory: path.join(__dirname, '..', '..', 'logs')
    },
    
    // Security settings
    security: {
      enableCors: true,
      corsOrigins: ['http://localhost:3000', 'http://localhost:3002'],
      enableCompression: true,
      rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
      rateLimitMax: 1000 // requests per window
    },
    
    // Performance settings
    performance: {
      enableQueryCache: true,
      enableResponseCompression: true,
      defaultPageSize: 50,
      maxPageSize: 100
    }
  },

  staging: {
    // Database settings
    database: {
      connectionLimit: 10,
      acquireTimeout: 60000,
      connectTimeout: 60000,
      charset: 'utf8mb4'
    },
    
    // Cache settings
    cache: {
      queryTtl: 1000 * 60 * 3, // 3 minutes in staging
      maxEntries: 75,
      fileTtl: 1000 * 60 * 60, // 1 hour for files
      maxSizeBytes: 750 * 1024 * 1024 // 750MB in staging
    },
    
    // Logging settings
    logging: {
      level: 'info',
      enableFileLogging: true,
      enableConsoleColors: true,
      logDirectory: path.join(__dirname, '..', '..', 'logs')
    },
    
    // Security settings
    security: {
      enableCors: true,
      corsOrigins: ['https://staging.actinvent.com'],
      enableCompression: true,
      rateLimitWindowMs: 15 * 60 * 1000,
      rateLimitMax: 500
    },
    
    // Performance settings
    performance: {
      enableQueryCache: true,
      enableResponseCompression: true,
      defaultPageSize: 100,
      maxPageSize: 500
    }
  },

  production: {
    // Database settings
    database: {
      connectionLimit: 20,
      acquireTimeout: 60000,
      connectTimeout: 60000,
      charset: 'utf8mb4'
    },
    
    // Cache settings
    cache: {
      queryTtl: 1000 * 60 * 5, // 5 minutes in production
      maxEntries: 100,
      fileTtl: 1000 * 60 * 120, // 2 hours for files
      maxSizeBytes: 1024 * 1024 * 1024 // 1GB in production
    },
    
    // Logging settings
    logging: {
      level: 'info',
      enableFileLogging: true,
      enableConsoleColors: false,
      logDirectory: path.join(__dirname, '..', '..', 'logs')
    },
    
    // Security settings
    security: {
      enableCors: true,
      corsOrigins: ['https://actinvent.com', 'https://www.actinvent.com'],
      enableCompression: true,
      rateLimitWindowMs: 2 * 60 * 1000,
      rateLimitMax: 2000
    },
    
    // Performance settings
    performance: {
      enableQueryCache: true,
      enableResponseCompression: true,
      defaultPageSize: 1000, // Maintain compatibility
      maxPageSize: 1000
    }
  }
};

/**
 * Get current environment configuration
 */
function getCurrentConfig() {
  const env = process.env.NODE_ENV || 'development';
  const config = environments[env] || environments.development;
  
  return {
    environment: env,
    ...config,
    
    // Server settings (environment-agnostic)
    server: {
      port: parseInt(process.env.SERVER_PORT) || 3002,
      host: process.env.SERVER_HOST || '0.0.0.0',
      timezone: process.env.TZ || 'Europe/Paris'
    },
    
    // Database connection (from environment variables)
    database: {
      ...config.database,
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'actinvent',
      port: parseInt(process.env.DB_PORT) || 3306
    },
    
    // CCTV settings (from environment variables)
    cctv: {
      baseUrl: process.env.CCTV_BASE_URL || 'http://cctv.xxxxxx.xx:8090',
      login: process.env.CCTV_LOGIN || 'CCTV',
      password: process.env.CCTV_PASSWORD,
      authTimeout: parseInt(process.env.CCTV_AUTH_TIMEOUT) || 10000,
      requestTimeout: parseInt(process.env.CCTV_REQUEST_TIMEOUT) || 30000
    }
  };
}

/**
 * Validate required environment variables
 */
function validateEnvironment() {
  const config = getCurrentConfig();
  const errors = [];
  
  // Required environment variables
  const required = [
    { key: 'DB_PASSWORD', value: config.database.password, name: 'Database password' },
    { key: 'CCTV_PASSWORD', value: config.cctv.password, name: 'CCTV password' }
  ];
  
  for (const req of required) {
    if (!req.value) {
      errors.push(`Missing required environment variable: ${req.key} (${req.name})`);
    }
  }
  
  // Validate numeric values
  const numeric = [
    { key: 'PORT', value: config.server.port, min: 1, max: 65535 },
    { key: 'DB_PORT', value: config.database.port, min: 1, max: 65535 }
  ];
  
  for (const num of numeric) {
    if (isNaN(num.value) || num.value < num.min || num.value > num.max) {
      errors.push(`Invalid ${num.key}: must be a number between ${num.min} and ${num.max}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    config
  };
}

/**
 * Get feature flags based on environment
 */
function getFeatureFlags() {
  const config = getCurrentConfig();
  
  return {
    enableDebugEndpoints: config.environment === 'development',
    enableCacheEndpoints: true, // Enable cache management in all environments
    enablePerformanceMonitoring: true,
    enableDetailedErrors: config.environment === 'development',
    enableCacheWarmup: config.environment === 'production',
    enableHealthChecks: true
  };
}

/**
 * Create environment-specific middleware configuration
 */
function getMiddlewareConfig() {
  const config = getCurrentConfig();
  
  return {
    cors: {
      origin: config.security.corsOrigins,
      credentials: true,
      optionsSuccessStatus: 200
    },
    
    compression: {
      level: config.environment === 'production' ? 6 : 1,
      threshold: 1024
    },
    
    rateLimit: {
      windowMs: config.security.rateLimitWindowMs,
      max: config.security.rateLimitMax,
      message: {
        success: false,
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          timestamp: new Date().toISOString()
        }
      }
    }
  };
}

module.exports = {
  getCurrentConfig,
  validateEnvironment,
  getFeatureFlags,
  getMiddlewareConfig,
  environments
};