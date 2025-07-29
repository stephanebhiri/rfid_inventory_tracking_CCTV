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
const { logger: oldLogger } = require('./server/config/logger');
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

const app = express();

// Trust proxy for Nginx reverse proxy setup  
app.set('trust proxy', 1);

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

// Initialize WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/ws',
  clientTracking: true
});

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

// Static files - serve from build directory
app.use(express.static(path.join(__dirname, 'build')));
app.use('/static', express.static(path.join(__dirname, 'static')));

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
  // Limiter le nombre de connexions par IP
  const clientIP = req.socket.remoteAddress || req.headers['x-forwarded-for'];
  const currentConnections = Array.from(wss.clients).filter(client => {
    return client.upgradeReq?.socket?.remoteAddress === clientIP;
  }).length;
  
  if (currentConnections > 5) {
    logger.warn({ clientIP, currentConnections }, 'Too many WebSocket connections, closing new connection');
    ws.close(1008, 'Too many connections');
    return;
  }
  
  logger.info({ clientIP, currentConnections, maxConnections: 5 }, 'New WebSocket connection established');
  realtimeService.addWebSocketClient(ws);
});

// Initialize realtime service
realtimeService.initialize().catch(err => {
  logger.error({ error: err.message, stack: err.stack }, 'Failed to initialize realtime service');
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await realtimeService.shutdown();
  server.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await realtimeService.shutdown();
  server.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });
});

// Start the server
server.listen(PORT, HOST, () => {
  logger.info({ 
    host: HOST, 
    port: PORT, 
    websocketPath: '/ws',
    env: process.env.NODE_ENV || 'development'
  }, 'RFID Server with WebSocket started successfully');
});
