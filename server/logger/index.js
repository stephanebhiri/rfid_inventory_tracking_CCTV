const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Masque les données sensibles
  redact: {
    paths: [
      'authorization',
      'cookie',
      'sid',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.query.sid',
      'req.body.sid',
    ],
    censor: '***REDACTED***'
  },
  // Pretty en dev uniquement
  ...(isDev ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
      }
    }
  } : {}),
  // Métadonnées utiles en prod (facultatif)
  ...(isDev ? { base: undefined } : {
    base: {
      service: 'rfid-inventory-cctv',
      version: process.env.npm_package_version || '1.0.0'
    }
  }),
  timestamp: pino.stdTimeFunctions.isoTime
});

// Export hybride
module.exports = logger;                 // require('../logger')
module.exports.logger = logger;          // const { logger } = require('../logger')
module.exports.loggers = {               // compat { loggers }
  main: logger,
  access: logger,
  error: logger
};