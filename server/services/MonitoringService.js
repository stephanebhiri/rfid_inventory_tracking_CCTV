const { logger } = require('../logger');
const pool = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

/**
 * Production monitoring service
 * Tracks application health, performance metrics, and system resources
 */
class MonitoringService {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        averageResponseTime: 0,
        lastRequests: []
      },
      database: {
        totalQueries: 0,
        averageQueryTime: 0,
        activeConnections: 0,
        errors: 0
      },
      websocket: {
        totalConnections: 0,
        activeConnections: 0,
        messagesExchanged: 0,
        errors: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        lastHealthCheck: null
      },
      alerts: {
        active: [],
        resolved: []
      }
    };

    this.healthCheckInterval = null;
    this.alertThresholds = {
      responseTime: 5000, // 5 seconds
      errorRate: 0.05, // 5%
      memoryUsage: 0.90, // 90% of available memory (increased threshold)
      diskUsage: 0.90, // 90% of available disk
      dbConnections: 80 // 80% of max connections
    };

    this.healthChecks = {
      database: this.checkDatabaseHealth.bind(this),
      filesystem: this.checkFilesystemHealth.bind(this),
      memory: this.checkMemoryHealth.bind(this),
      websocket: this.checkWebSocketHealth.bind(this)
    };
  }

  /**
   * Initialize monitoring service
   */
  initialize() {
    logger.info('📊 Initializing monitoring service');
    
    // Start periodic health checks
    this.startHealthChecks();
    
    // Set up process monitoring
    this.setupProcessMonitoring();
    
    logger.info('✅ Monitoring service initialized');
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000); // Every 30 seconds
  }

  /**
   * Record HTTP request metrics
   */
  recordRequest(duration, success = true) {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.errors++;
    }

    // Keep sliding window of last 100 requests
    this.metrics.requests.lastRequests.push({
      timestamp: Date.now(),
      duration,
      success
    });
    
    if (this.metrics.requests.lastRequests.length > 100) {
      this.metrics.requests.lastRequests.shift();
    }

    // Update average response time
    const totalTime = this.metrics.requests.lastRequests.reduce((sum, req) => sum + req.duration, 0);
    this.metrics.requests.averageResponseTime = totalTime / this.metrics.requests.lastRequests.length;

    // Check for alerts
    this.checkPerformanceAlerts();
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(duration, success = true) {
    this.metrics.database.totalQueries++;
    
    if (!success) {
      this.metrics.database.errors++;
    }

    // Simple moving average
    const currentAvg = this.metrics.database.averageQueryTime;
    const totalQueries = this.metrics.database.totalQueries;
    this.metrics.database.averageQueryTime = (currentAvg * (totalQueries - 1) + duration) / totalQueries;
  }

  /**
   * Record WebSocket metrics
   */
  recordWebSocketEvent(event, data = {}) {
    switch (event) {
      case 'connection':
        this.metrics.websocket.totalConnections++;
        this.metrics.websocket.activeConnections++;
        break;
      case 'disconnect':
        this.metrics.websocket.activeConnections--;
        break;
      case 'message':
        this.metrics.websocket.messagesExchanged++;
        break;
      case 'error':
        this.metrics.websocket.errors++;
        break;
    }
  }

  /**
   * Record cache metrics
   */
  recordCacheEvent(event, data = {}) {
    switch (event) {
      case 'hit':
        this.metrics.cache.hits++;
        break;
      case 'miss':
        this.metrics.cache.misses++;
        break;
    }

    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = total > 0 ? this.metrics.cache.hits / total : 0;
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {},
      metrics: this.getMetricsSummary()
    };

    try {
      // Run all health checks
      for (const [name, check] of Object.entries(this.healthChecks)) {
        try {
          const result = await check();
          healthStatus.checks[name] = {
            status: result.healthy ? 'healthy' : 'unhealthy',
            ...result
          };
          
          if (!result.healthy) {
            healthStatus.status = 'unhealthy';
          }
        } catch (error) {
          healthStatus.checks[name] = {
            status: 'error',
            error: error.message
          };
          healthStatus.status = 'unhealthy';
        }
      }

      this.metrics.system.lastHealthCheck = healthStatus;
      
      // Log if unhealthy
      if (healthStatus.status !== 'healthy') {
        logger.warn('⚠️ Health check failed', healthStatus);
      }

      return healthStatus;
    } catch (error) {
      logger.error('❌ Health check error:', error);
      return {
        ...healthStatus,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    const start = performance.now();
    
    try {
      const [rows] = await pool.execute('SELECT 1 as health_check');
      const duration = performance.now() - start;
      
      // Get connection pool status (simplified - avoid private properties)
      const poolStatus = {
        status: 'connected',
        queryExecuted: true
      };

      const healthy = duration < 1000 && rows.length > 0; // Query should complete in <1s
      
      return {
        healthy,
        responseTime: Math.round(duration),
        connections: poolStatus,
        lastQuery: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        responseTime: performance.now() - start
      };
    }
  }

  /**
   * Check filesystem health
   */
  async checkFilesystemHealth() {
    try {
      const cacheDir = path.join(process.cwd(), 'static', 'cache');
      
      // Check if cache directory is accessible
      await fs.access(cacheDir, fs.constants.R_OK | fs.constants.W_OK);
      
      // Get basic disk usage info (simplified)
      const stats = await fs.stat(cacheDir);
      
      return {
        healthy: true,
        cacheDirectoryAccessible: true,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Check memory health
   */
  async checkMemoryHealth() {
    const memUsage = process.memoryUsage();
    const memoryUsageRatio = memUsage.heapUsed / memUsage.heapTotal;
    
    const healthy = memoryUsageRatio < this.alertThresholds.memoryUsage;
    
    return {
      healthy,
      memoryUsage: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        usageRatio: Math.round(memoryUsageRatio * 100) / 100
      }
    };
  }

  /**
   * Check WebSocket health
   */
  async checkWebSocketHealth() {
    // This would be implemented based on your WebSocket service
    return {
      healthy: true,
      activeConnections: this.metrics.websocket.activeConnections,
      totalConnections: this.metrics.websocket.totalConnections
    };
  }

  /**
   * Check for performance alerts
   */
  checkPerformanceAlerts() {
    const now = Date.now();
    
    // Check response time alert
    if (this.metrics.requests.averageResponseTime > this.alertThresholds.responseTime) {
      this.createAlert('high_response_time', {
        current: this.metrics.requests.averageResponseTime,
        threshold: this.alertThresholds.responseTime
      });
    }

    // Check error rate alert
    const recentRequests = this.metrics.requests.lastRequests.filter(
      req => now - req.timestamp < 300000 // Last 5 minutes
    );
    
    if (recentRequests.length > 10) {
      const errorRate = recentRequests.filter(req => !req.success).length / recentRequests.length;
      
      if (errorRate > this.alertThresholds.errorRate) {
        this.createAlert('high_error_rate', {
          current: errorRate,
          threshold: this.alertThresholds.errorRate,
          timeWindow: '5 minutes'
        });
      }
    }
  }

  /**
   * Create an alert
   */
  createAlert(type, data) {
    const existingAlert = this.metrics.alerts.active.find(alert => alert.type === type);
    
    if (!existingAlert) {
      const alert = {
        id: `${type}_${Date.now()}`,
        type,
        severity: this.getAlertSeverity(type),
        message: this.getAlertMessage(type, data),
        data,
        createdAt: new Date().toISOString(),
        acknowledged: false
      };
      
      this.metrics.alerts.active.push(alert);
      
      logger.warn(`🚨 Alert created: ${alert.message}`, alert);
      
      // In production, you'd send this to your alerting system
      // this.sendToAlertingSystem(alert);
    }
  }

  /**
   * Get alert severity
   */
  getAlertSeverity(type) {
    const severityMap = {
      high_response_time: 'medium',
      high_error_rate: 'high',
      high_memory_usage: 'high',
      database_connection_failed: 'critical'
    };
    
    return severityMap[type] || 'medium';
  }

  /**
   * Get alert message
   */
  getAlertMessage(type, data) {
    const messages = {
      high_response_time: `High response time detected: ${Math.round(data.current)}ms (threshold: ${data.threshold}ms)`,
      high_error_rate: `High error rate detected: ${Math.round(data.current * 100)}% (threshold: ${Math.round(data.threshold * 100)}%)`,
      high_memory_usage: `High memory usage detected: ${Math.round(data.current * 100)}%`,
      database_connection_failed: 'Database connection failed'
    };
    
    return messages[type] || `Alert: ${type}`;
  }

  /**
   * Setup process monitoring
   */
  setupProcessMonitoring() {
    // Monitor uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      this.createAlert('uncaught_exception', { error: error.message });
    });

    // Monitor unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Promise Rejection:', reason);
      this.createAlert('unhandled_rejection', { reason: String(reason) });
    });

    // Update system metrics periodically
    setInterval(() => {
      this.metrics.system.uptime = process.uptime();
      this.metrics.system.memory = process.memoryUsage();
      this.metrics.system.cpu = process.cpuUsage();
    }, 10000); // Every 10 seconds
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    return {
      requests: {
        total: this.metrics.requests.total,
        success: this.metrics.requests.success,
        errors: this.metrics.requests.errors,
        successRate: this.metrics.requests.total > 0 
          ? this.metrics.requests.success / this.metrics.requests.total 
          : 0,
        averageResponseTime: Math.round(this.metrics.requests.averageResponseTime)
      },
      database: {
        totalQueries: this.metrics.database.totalQueries,
        averageQueryTime: Math.round(this.metrics.database.averageQueryTime),
        errors: this.metrics.database.errors
      },
      websocket: {
        activeConnections: this.metrics.websocket.activeConnections,
        totalConnections: this.metrics.websocket.totalConnections,
        messagesExchanged: this.metrics.websocket.messagesExchanged
      },
      cache: {
        hitRate: Math.round(this.metrics.cache.hitRate * 100) / 100,
        hits: this.metrics.cache.hits,
        misses: this.metrics.cache.misses
      },
      system: {
        uptime: Math.round(this.metrics.system.uptime),
        memory: {
          used: Math.round(this.metrics.system.memory.heapUsed / 1024 / 1024),
          total: Math.round(this.metrics.system.memory.heapTotal / 1024 / 1024)
        }
      },
      alerts: {
        active: this.metrics.alerts.active.length,
        resolved: this.metrics.alerts.resolved.length
      }
    };
  }

  /**
   * Get full metrics for admin dashboard
   */
  getFullMetrics() {
    return {
      ...this.metrics,
      summary: this.getMetricsSummary()
    };
  }

  /**
   * Shutdown monitoring service
   */
  shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    logger.info('📊 Monitoring service shutdown');
  }
}

module.exports = { MonitoringService };