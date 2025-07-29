// Main Web Server for RFID Inventory Tracking System
// Serves React frontend, handles API requests (items, CCTV, timeline),
// processes RFID input, and manages video streaming with WebSocket real-time updates.
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const compression = require('compression');
const pinoHttp = require('pino-http');
const logger = require('./server/logger');
const { register: metricsRegister } = require('./server/metrics');
const inputRoutes = require('./server/routes/input');
const { getCurrentConfig } = require('./server/config/environment');
const realtimeService = require('./server/services/realtimeService');

// Import additional routes needed by the frontend
const itemsRoutes = require('./server/routes/items');
const timelineRoutes = require('./server/routes/timeline');
const cctvRoutes = require('./server/routes/cctv');
const pool = require('./server/config/database');
const { handleVideoRequest } = require('./server/middleware/videoStreaming');
const { setupSecurity } = require('./server/config/security');
const { router: monitoringRoutes, monitoringService } = require('./server/routes/monitoring');
const path = require('path');

// Allowlist d'origines pour le WebSocket (CSWSH protection)
const WS_ALLOWED_ORIGINS = (process.env.WS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Limitation de connexions WebSocket par IP (configurable)
const MAX_WS_PER_IP = Number(process.env.WS_MAX_PER_IP || 5);

process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
process.on('uncaughtException', (err) => { logger.error({ err }, 'uncaughtException'); process.exit(1); });

const app = express();

// Trust proxy for Nginx reverse proxy setup  
app.set('trust proxy', 1);
// Hide tech stack header (si pas déjà fait dans setupSecurity)
app.disable('x-powered-by');

// Setup Pino HTTP logging middleware TOUT EN HAUT avec x-request-id
app.use(pinoHttp({
  logger,
  genReqId: (req) => {
    // Utiliser x-request-id existant ou en générer un nouveau
    return req.headers['x-request-id'] || require('crypto').randomUUID();
  },
  customProps: (req) => ({
    requestId: req.id
  }),
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} errored: ${err.message}`;
  }
}));

// Middleware pour propager x-request-id dans la réponse
app.use((req, res, next) => {
  if (req.id) {
    res.setHeader('x-request-id', req.id);
  }
  next();
});

// Setup security middleware (CORS, rate limiting, headers)
setupSecurity(app);

// Enable gzip compression
app.use(compression({
  // Only compress responses larger than 1kb
  threshold: 1024,
  // Compression level (1-9, where 9 is best compression but slowest)
  level: 6,
  // Only compress these content types
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use default compression filter
    return compression.filter(req, res);
  }
}));

// Request monitoring middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const success = res.statusCode < 400;
    
    // Record metrics for all API requests
    if (req.path.startsWith('/api/')) {
      monitoringService.recordRequest(duration, success);
    }
  });
  
  next();
});
const server = http.createServer(app);
const config = getCurrentConfig();
const PORT = config.server.port || 3002;
const HOST = config.server.host || '0.0.0.0';
// Durcissement timeouts HTTP
server.keepAliveTimeout = 65_000;
server.headersTimeout   = 66_000;
// server.requestTimeout   = 0; // optionnel : pas de timeout global

// Initialize WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/ws',
  clientTracking: true
});

// Valider l'Origin dès l'upgrade HTTP → WS
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers['origin'];
  if (WS_ALLOWED_ORIGINS.length && (!origin || !WS_ALLOWED_ORIGINS.includes(origin))) {
    try { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); } catch {}
    try { socket.destroy(); } catch {}
    logger.warn({ origin }, 'WS upgrade rejected (origin not allowed)');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// Comptage des connexions par IP + heartbeat anti-zombies
const ipConnections = new Map(); // ip => count
function heartbeat() { this.isAlive = true; }
const wsHeartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30_000);
wss.on('close', () => clearInterval(wsHeartbeatInterval));

// Middleware to parse JSON and urlencoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes needed by the frontend
app.use('/api/items', itemsRoutes);
app.use('/api/cctv', cctvRoutes);
app.use('/api', timelineRoutes);
app.use('/api', inputRoutes);

// Monitoring and health check routes
app.use('/api/monitoring', monitoringRoutes);

// Évite le bruit 404 pour le favicon
app.get('/favicon.ico', (_req, res) => res.sendStatus(204));

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers['authorization'] !== `Bearer ${token}`) {
      return res.status(401).end('Unauthorized');
    }
    res.set('Content-Type', metricsRegister.contentType);
    res.set('Cache-Control', 'no-store'); // pas de cache pour les métriques
    const metrics = await metricsRegister.metrics();
    res.end(metrics);
  } catch (error) {
    req.log.error({ error: error.message }, 'Error generating Prometheus metrics');
    res.status(500).end('Error generating metrics');
  }
});

// Handle video requests with custom middleware BEFORE Express static
app.use('/static/cache/videos', (req, res, next) => {
  req.log.info({ url: req.url }, 'Video request received');
  if (req.path.endsWith('.mp4')) {
    const filename = req.path.substring(1); // Remove leading slash
    req.params = { filename: filename };
    req.log.info({ filename }, 'Video request intercepted');
    return handleVideoRequest(req, res);
  }
  next();
});

// Static React build :
// - /build/static/**  → cache long + immutable (assets fingerprintés)
// - index.html        → no-store pour forcer la dernière version
app.use(express.static(path.join(__dirname, 'build'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(path.sep + 'index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.includes(path.join('build', 'static') + path.sep)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.use('/static', express.static(path.join(__dirname, 'static'), {
  maxAge: '365d',
  immutable: true,
}));

// SPA fallback (ne touche pas /api, /static, /ws)
app.get(/^\/(?!api\/|static\/|ws($|\/)).*/, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Helper robuste pour récupérer/normaliser l'IP client
function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  let ip = xff ? String(xff).split(',')[0].trim() : req.socket.remoteAddress;
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv6-mapped IPv4
  return ip;
}

// History endpoint from the original server
app.get('/api/history', async (req, res) => {
  try {
    const query = `
      SELECT 
        item.designation,
        item.inventory_code,
        DATE_FORMAT(CONVERT_TZ(hist.dep,'GMT','Europe/Paris'),'%d/%m/%Y à %Hh %imin %ss') as dep,
        DATE_FORMAT(CONVERT_TZ(hist.ret,'GMT','Europe/Paris'),'%d/%m/%Y à %Hh %imin %ss') as ret,
        UNIX_TIMESTAMP(hist.dep) as depposix,
        UNIX_TIMESTAMP(hist.ret) as retposix,
        hist.antenna_dep,
        hist.antenna_ret,
        TIME_FORMAT(TIMEDIFF(hist.ret, hist.dep), '%Hh %imin %ss') as delai,
        TIME_TO_SEC(TIMEDIFF(NOW(), hist.ret)) as days,
        groupname.group_name as \`group\`,
        groupname.group_name as group_name,
        item.group_id
      FROM hist
      INNER JOIN item ON item.epc = hist.epchist
      INNER JOIN groupname ON item.group_id = groupname.group_id
      WHERE item.group_id <> 9 AND hist.dep IS NOT NULL AND hist.ret IS NOT NULL
      ORDER BY hist.ret DESC
      LIMIT 100
    `;
    
    const [rows] = await pool.execute(query);
    res.json({ success: true, data: { items: rows } });
  } catch (error) {
    req.log.error({ error: error.message, stack: error.stack }, 'History API error');
    res.status(500).json({ error: error.message });
  }
});

// Enhanced health check with realtime service status
app.get('/api/health', (req, res) => {
  const realtimeStatus = realtimeService.getStatus();
  res.json({ 
    status: 'healthy', 
    message: 'RFID Server is running',
    realtime: realtimeStatus,
    timestamp: new Date().toISOString()
  });
});

// Readiness check (ping DB)
app.get('/api/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ ready: true, timestamp: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err: err.message }, 'Readiness failed');
    return res.status(503).json({ ready: false, error: 'DB not reachable' });
  }
});

// WebSocket status endpoint
app.get('/api/ws/status', (req, res) => {
  const status = realtimeService.getStatus();
  res.json({
    websocket: {
      connected: status.websocket.clientCount > 0,
      clientCount: status.websocket.clientCount
    },
    redis: status.redis,
    timestamp: new Date().toISOString()
  });
});

// Handle WebSocket connections avec limite
wss.on('connection', (ws, req) => {
  const ip = getClientIP(req);
  const current = ipConnections.get(ip) || 0;
  if (current >= MAX_WS_PER_IP) {
    logger.warn({ ip, current, max: MAX_WS_PER_IP }, 'Too many WebSocket connections, closing new connection');
    try { ws.close(1008, 'Too many connections'); } catch {}
    return;
  }
  ipConnections.set(ip, current + 1);
  ws._ip = ip;
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  logger.info({ ip, current: current + 1, max: MAX_WS_PER_IP }, 'New WebSocket connection established');
  realtimeService.addWebSocketClient(ws);

  ws.on('error', (err) => {
    logger.warn({ ip, err: err.message }, 'WebSocket error');
  });

  ws.on('close', () => {
    const cnt = ipConnections.get(ip) || 1;
    const next = cnt - 1;
    if (next <= 0) ipConnections.delete(ip);
    else ipConnections.set(ip, next);
    logger.info({ ip, remaining: next }, 'WebSocket connection closed');
  });
});

// 404 JSON uniforme pour /api/*
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler global (JSON + log)
app.use((err, req, res, next) => {
  req.log?.error({ err: err.message, stack: err.stack }, 'Unhandled error');
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Initialize realtime service
realtimeService.initialize().catch(err => {
  logger.error({ error: err.message, stack: err.stack }, 'Failed to initialize realtime service');
  process.exit(1);
});

// Graceful shutdown handling (HTTP + WS)
async function graceful() {
  logger.info('Shutting down gracefully');
  try { await realtimeService.shutdown(); } catch (e) {
    logger.warn({ err: e?.message }, 'realtimeService shutdown warning');
  }
  try {
    wss.clients.forEach((c) => { try { c.terminate(); } catch {} });
    wss.close(() => logger.info('WebSocket server closed'));
  } catch {}
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
}
process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

// Start the server
server.listen(PORT, HOST, () => {
  logger.info({ 
    host: HOST, 
    port: PORT, 
    websocketPath: '/ws',
    env: process.env.NODE_ENV || 'development'
  }, 'RFID Server with WebSocket started successfully');
});
server.on('error', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'HTTP server error');
});
// Malformed HTTP / client reset → éviter stack traces bruyantes
server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {}
  logger.warn({ err: err.message }, 'clientError');
});
