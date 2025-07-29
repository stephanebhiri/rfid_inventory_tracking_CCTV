const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

/**
 * Security middleware configuration for production
 */

// Rate limiting configuration
const createRateLimiter = () => {
  return rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    }
  });
};

// CORS configuration
const createCorsOptions = () => {
  const allowedOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3002'];

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400 // 24 hours
  };
};

// Helmet security headers configuration
const createHelmetOptions = () => {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for compatibility
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  };
};

// Security middleware setup
const setupSecurity = (app) => {
  // Enable security headers with Helmet
  if (process.env.ENABLE_HELMET !== 'false') {
    app.use(helmet(createHelmetOptions()));
  }

  // Enable CORS
  app.use(cors(createCorsOptions()));

  // Rate limiting
  app.use(createRateLimiter());

  // Request size limiting
  app.use(require('express').json({ 
    limit: process.env.REQUEST_SIZE_LIMIT || '10mb' 
  }));
  
  app.use(require('express').urlencoded({ 
    extended: true, 
    limit: process.env.REQUEST_SIZE_LIMIT || '10mb' 
  }));

  // Security headers middleware
  app.use((req, res, next) => {
    // Remove server signature
    res.removeHeader('X-Powered-By');
    
    // Add custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
  });
};

module.exports = {
  setupSecurity,
  createRateLimiter,
  createCorsOptions,
  createHelmetOptions
};