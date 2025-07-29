const express = require('express');
const router = express.Router();
const { logger } = require('../logger');
const { MonitoringService } = require('../services/MonitoringService');

// Initialize monitoring service
const monitoringService = new MonitoringService();

/**
 * Health check endpoint
 * Returns basic health status
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await monitoringService.performHealthCheck();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      status: healthStatus.status,
      timestamp: healthStatus.timestamp,
      checks: healthStatus.checks,
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'unknown'
    });
  } catch (error) {
    logger.error('Health check endpoint error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Detailed health check with full diagnostics
 */
router.get('/health/detailed', async (req, res) => {
  try {
    const healthStatus = await monitoringService.performHealthCheck();
    
    res.json({
      ...healthStatus,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    });
  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Metrics endpoint (Prometheus-style)
 * Returns application metrics in a format suitable for monitoring tools
 */
router.get('/metrics', (req, res) => {
  try {
    const metrics = monitoringService.getFullMetrics();
    
    // Format for Prometheus (or return JSON based on Accept header)
    if (req.headers.accept && req.headers.accept.includes('text/plain')) {
      // Prometheus format
      let output = '';
      
      // HTTP Request metrics
      output += `# HELP http_requests_total Total number of HTTP requests\n`;
      output += `# TYPE http_requests_total counter\n`;
      output += `http_requests_total{status="success"} ${metrics.requests.success}\n`;
      output += `http_requests_total{status="error"} ${metrics.requests.errors}\n`;
      
      output += `# HELP http_request_duration_seconds Average HTTP request duration\n`;
      output += `# TYPE http_request_duration_seconds gauge\n`;
      output += `http_request_duration_seconds ${metrics.requests.averageResponseTime / 1000}\n`;
      
      // Database metrics
      output += `# HELP database_queries_total Total number of database queries\n`;
      output += `# TYPE database_queries_total counter\n`;
      output += `database_queries_total ${metrics.database.totalQueries}\n`;
      
      output += `# HELP database_query_duration_seconds Average database query duration\n`;
      output += `# TYPE database_query_duration_seconds gauge\n`;
      output += `database_query_duration_seconds ${metrics.database.averageQueryTime / 1000}\n`;
      
      // WebSocket metrics
      output += `# HELP websocket_connections_active Current active WebSocket connections\n`;
      output += `# TYPE websocket_connections_active gauge\n`;
      output += `websocket_connections_active ${metrics.websocket.activeConnections}\n`;
      
      // Memory metrics
      output += `# HELP process_resident_memory_bytes Resident memory size in bytes\n`;
      output += `# TYPE process_resident_memory_bytes gauge\n`;
      output += `process_resident_memory_bytes ${metrics.system.memory.rss}\n`;
      
      // Cache metrics
      output += `# HELP cache_hit_rate Cache hit rate ratio\n`;
      output += `# TYPE cache_hit_rate gauge\n`;
      output += `cache_hit_rate ${metrics.cache.hitRate}\n`;
      
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(output);
    } else {
      // JSON format
      res.json({
        timestamp: new Date().toISOString(),
        metrics: monitoringService.getMetricsSummary(),
        alerts: {
          active: metrics.alerts.active,
          total: metrics.alerts.active.length
        }
      });
    }
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Performance statistics endpoint
 */
router.get('/performance', (req, res) => {
  try {
    const metrics = monitoringService.getMetricsSummary();
    
    res.json({
      timestamp: new Date().toISOString(),
      performance: {
        responseTime: {
          average: metrics.requests.averageResponseTime,
          unit: 'milliseconds'
        },
        throughput: {
          requestsPerSecond: metrics.requests.total / (process.uptime() || 1),
          totalRequests: metrics.requests.total
        },
        reliability: {
          successRate: metrics.requests.successRate,
          errorRate: 1 - metrics.requests.successRate,
          uptime: process.uptime()
        },
        database: {
          queryTime: metrics.database.averageQueryTime,
          totalQueries: metrics.database.totalQueries,
          queriesPerSecond: metrics.database.totalQueries / (process.uptime() || 1)
        },
        cache: {
          hitRate: metrics.cache.hitRate,
          efficiency: metrics.cache.hitRate > 0.8 ? 'good' : metrics.cache.hitRate > 0.6 ? 'fair' : 'poor'
        }
      }
    });
  } catch (error) {
    logger.error('Performance endpoint error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Alerts endpoint
 */
router.get('/alerts', (req, res) => {
  try {
    const metrics = monitoringService.getFullMetrics();
    
    res.json({
      timestamp: new Date().toISOString(),
      alerts: {
        active: metrics.alerts.active,
        resolved: metrics.alerts.resolved.slice(-50), // Last 50 resolved alerts
        summary: {
          total: metrics.alerts.active.length,
          critical: metrics.alerts.active.filter(a => a.severity === 'critical').length,
          high: metrics.alerts.active.filter(a => a.severity === 'high').length,
          medium: metrics.alerts.active.filter(a => a.severity === 'medium').length,
          low: metrics.alerts.active.filter(a => a.severity === 'low').length
        }
      }
    });
  } catch (error) {
    logger.error('Alerts endpoint error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * System information endpoint
 */
router.get('/system', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    res.json({
      timestamp: new Date().toISOString(),
      system: {
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          pid: process.pid
        },
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024), // MB
          arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024) // MB
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        environment: {
          nodeEnv: process.env.NODE_ENV,
          timezone: process.env.TZ || 'UTC'
        }
      }
    });
  } catch (error) {
    logger.error('System endpoint error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Readiness probe endpoint (for Kubernetes/Docker)
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical services are ready
    const healthStatus = await monitoringService.performHealthCheck();
    
    const critical = ['database']; // Define critical services
    const criticalServicesHealthy = critical.every(service => 
      healthStatus.checks[service] && healthStatus.checks[service].status === 'healthy'
    );
    
    if (criticalServicesHealthy) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: healthStatus.checks
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe endpoint (for Kubernetes/Docker)
 */
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Initialize monitoring when this module is loaded
monitoringService.initialize();

// Export both the router and the monitoring service instance
module.exports = { 
  router, 
  monitoringService 
};