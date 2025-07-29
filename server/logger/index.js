const pino = require('pino');

// Configuration du logger Pino avec redaction des données sensibles
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Redaction des champs sensibles pour la sécurité
  redact: {
    paths: [
      'authorization',
      'cookie', 
      'sid',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // Redaction spécifique aux paramètres CCTV
      'req.query.sid',
      'req.body.sid'
    ],
    censor: '***REDACTED***'
  },

  // Formatage pour la production (JSON) ou développement
  ...(!process.env.NODE_ENV || process.env.NODE_ENV === 'development') ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
      }
    }
  } : {},

  // Informations de base
  base: {
    service: 'rfid-inventory-cctv',
    version: process.env.npm_package_version || '1.0.0'
  },

  // Horodatage
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;