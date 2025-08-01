const redis = require('redis');
const { logger } = require('../logger');

class RealtimeService {
  constructor() {
    this.publisher = null;
    this.subscriber = null;
    this.websocketClients = new Set();
    this.isConnected = false;
  }

  async initialize() {
    try {
      // Create Redis clients
      this.publisher = redis.createClient({
        host: 'localhost',
        port: 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });

      this.subscriber = redis.createClient({
        host: 'localhost', 
        port: 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });

      // Handle connection events
      this.publisher.on('error', (err) => {
        logger.error('Redis Publisher Error:', err);
        this.isConnected = false;
      });

      this.subscriber.on('error', (err) => {
        logger.error('Redis Subscriber Error:', err);
        this.isConnected = false;
      });

      this.publisher.on('connect', () => {
        logger.info('✅ Redis Publisher connected');
      });

      this.subscriber.on('connect', () => {
        logger.info('✅ Redis Subscriber connected');
        this.isConnected = true;
      });

      // Connect to Redis
      await this.publisher.connect();
      await this.subscriber.connect();

      // Subscribe to RFID events
      await this.subscriber.subscribe('rfid:events', (message) => {
        this.handleRFIDEvent(message);
      });

      // Subscribe to system events
      await this.subscriber.subscribe('system:events', (message) => {
        this.handleSystemEvent(message);
      });

      logger.info('🚀 Realtime Service initialized with Redis Pub/Sub');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Realtime Service:', error);
      throw error;
    }
  }

  // Publish RFID events
  async publishRFIDEvent(eventData) {
    if (!this.isConnected) {
      logger.warn('⚠️ Redis not connected, skipping event publish');
      return;
    }

    try {
      const payload = JSON.stringify({
        type: 'rfid_scan',
        timestamp: new Date().toISOString(),
        data: eventData
      });

      await this.publisher.publish('rfid:events', payload);
      logger.debug('📡 RFID event published:', { epc: eventData.epc, antenna: eventData.antenna });
      
    } catch (error) {
      logger.error('❌ Failed to publish RFID event:', error);
    }
  }

  // Publish system events (health, status, etc.)
  async publishSystemEvent(eventType, eventData) {
    if (!this.isConnected) {
      logger.warn('⚠️ Redis not connected, skipping system event publish');
      return;
    }

    try {
      const payload = JSON.stringify({
        type: eventType,
        timestamp: new Date().toISOString(),
        data: eventData
      });

      await this.publisher.publish('system:events', payload);
      logger.debug('📡 System event published:', { type: eventType });
      
    } catch (error) {
      logger.error('❌ Failed to publish system event:', error);
    }
  }

  // Handle incoming RFID events from Redis
  handleRFIDEvent(message) {
    try {
      const event = JSON.parse(message);
      
      // Broadcast to all connected WebSocket clients
      this.broadcastToClients('rfid_event', event);
      
      logger.debug('🔄 RFID event processed and broadcasted', { 
        type: event.type, 
        clientCount: this.websocketClients.size 
      });
      
    } catch (error) {
      logger.error('❌ Failed to handle RFID event:', error);
    }
  }

  // Handle system events
  handleSystemEvent(message) {
    try {
      const event = JSON.parse(message);
      
      // Broadcast to all connected WebSocket clients
      this.broadcastToClients('system_event', event);
      
      logger.debug('🔄 System event processed and broadcasted', { 
        type: event.type, 
        clientCount: this.websocketClients.size 
      });
      
    } catch (error) {
      logger.error('❌ Failed to handle system event:', error);
    }
  }

  // Add WebSocket client
  addWebSocketClient(ws) {
    this.websocketClients.add(ws);
    logger.info(`➕ WebSocket client connected (total: ${this.websocketClients.size})`);

    // Send connection confirmation
    this.sendToClient(ws, 'connection', {
      status: 'connected',
      timestamp: new Date().toISOString(),
      redisStatus: this.isConnected ? 'connected' : 'disconnected'
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.websocketClients.delete(ws);
      logger.info(`➖ WebSocket client disconnected (total: ${this.websocketClients.size})`);
    });

    // Handle client errors
    ws.on('error', (error) => {
      logger.error('WebSocket client error:', error);
      this.websocketClients.delete(ws);
    });
  }

  // Send message to specific client
  sendToClient(ws, type, data) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify({
          type,
          timestamp: new Date().toISOString(),
          data
        }));
      } catch (error) {
        logger.error('Failed to send message to WebSocket client:', error);
        this.websocketClients.delete(ws);
      }
    }
  }

  // Broadcast to all connected clients
  broadcastToClients(type, data) {
    const message = JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
      data
    });

    const deadClients = [];
    
    for (const ws of this.websocketClients) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          logger.error('Failed to broadcast to WebSocket client:', error);
          deadClients.push(ws);
        }
      } else {
        deadClients.push(ws);
      }
    }

    // Clean up dead connections
    deadClients.forEach(ws => this.websocketClients.delete(ws));
  }

  // Get service status
  getStatus() {
    return {
      redis: {
        connected: this.isConnected,
        publisher: this.publisher?.isReady || false,
        subscriber: this.subscriber?.isReady || false
      },
      websocket: {
        clientCount: this.websocketClients.size
      }
    };
  }

  // Graceful shutdown
  async shutdown() {
    logger.info('🔄 Shutting down Realtime Service...');
    
    try {
      // Close all WebSocket connections
      for (const ws of this.websocketClients) {
        if (ws.readyState === ws.OPEN) {
          ws.close(1000, 'Server shutting down');
        }
      }
      this.websocketClients.clear();

      // Disconnect Redis clients
      if (this.publisher?.isReady) {
        await this.publisher.quit();
      }
      if (this.subscriber?.isReady) {
        await this.subscriber.quit();
      }

      logger.info('✅ Realtime Service shutdown complete');
      
    } catch (error) {
      logger.error('❌ Error during Realtime Service shutdown:', error);
    }
  }
}

// Create singleton instance
const realtimeService = new RealtimeService();

module.exports = realtimeService;