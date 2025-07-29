/**
 * Performance metrics collection for monitoring
 * Compatible with Prometheus, Grafana, and StatsD
 */

class MetricsCollector {
  constructor() {
    this.metrics = {
      // HTTP metrics
      httpRequests: new Map(),
      httpDurations: [],
      httpErrors: new Map(),
      
      // Video streaming metrics
      videoRequests: new Map(),
      videoCacheHits: 0,
      videoCacheMisses: 0,
      videoBytesServed: 0,
      
      // Database metrics
      dbQueries: new Map(),
      dbErrors: 0,
      dbConnectionPool: {
        active: 0,
        idle: 0,
        waiting: 0
      },
      
      // System metrics
      startTime: Date.now(),
      processMemory: {},
      eventLoopLag: []
    };
    
    // Collect system metrics every 10 seconds
    this.startSystemMetricsCollection();
  }

  // Record HTTP request
  recordHttpRequest(method, path, statusCode, duration) {
    const key = `${method}:${path}:${statusCode}`;
    const current = this.metrics.httpRequests.get(key) || 0;
    this.metrics.httpRequests.set(key, current + 1);
    
    // Prevent httpRequests Map from growing too large
    if (this.metrics.httpRequests.size > 1000) {
      // Remove oldest entries (keep most recent 800)
      const entries = Array.from(this.metrics.httpRequests.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .slice(0, 800);
      this.metrics.httpRequests.clear();
      entries.forEach(([k, v]) => this.metrics.httpRequests.set(k, v));
    }
    
    // Store duration for percentile calculations
    this.metrics.httpDurations.push({
      timestamp: Date.now(),
      duration,
      method,
      path,
      statusCode
    });
    
    // Keep only last hour of duration data
    const oneHourAgo = Date.now() - 3600000;
    this.metrics.httpDurations = this.metrics.httpDurations.filter(
      d => d.timestamp > oneHourAgo
    );
    
    // Track errors
    if (statusCode >= 400) {
      const errorKey = `${statusCode}:${path}`;
      const currentErrors = this.metrics.httpErrors.get(errorKey) || 0;
      this.metrics.httpErrors.set(errorKey, currentErrors + 1);
      
      // Prevent httpErrors Map from growing too large
      if (this.metrics.httpErrors.size > 500) {
        // Remove oldest entries (keep most recent 400)
        const entries = Array.from(this.metrics.httpErrors.entries())
          .sort((a, b) => b[1] - a[1]) // Sort by count descending
          .slice(0, 400);
        this.metrics.httpErrors.clear();
        entries.forEach(([k, v]) => this.metrics.httpErrors.set(k, v));
      }
    }
  }

  // Record video metrics
  recordVideoRequest(cameraId, cacheHit, bytesServed) {
    const current = this.metrics.videoRequests.get(cameraId) || 0;
    this.metrics.videoRequests.set(cameraId, current + 1);
    
    if (cacheHit) {
      this.metrics.videoCacheHits++;
    } else {
      this.metrics.videoCacheMisses++;
    }
    
    this.metrics.videoBytesServed += bytesServed;
    
    // Prevent counter overflow by resetting after large values
    if (this.metrics.videoCacheHits > 1000000) {
      // Reset counters proportionally to maintain hit rate
      const total = this.metrics.videoCacheHits + this.metrics.videoCacheMisses;
      const hitRate = this.metrics.videoCacheHits / total;
      this.metrics.videoCacheHits = Math.round(hitRate * 10000);
      this.metrics.videoCacheMisses = 10000 - this.metrics.videoCacheHits;
    }
    
    // Reset bytes served counter if it gets too large (>10GB)
    if (this.metrics.videoBytesServed > 10 * 1024 * 1024 * 1024) {
      this.metrics.videoBytesServed = 0;
    }
  }

  // Record database query
  recordDbQuery(operation, duration, error = false) {
    const current = this.metrics.dbQueries.get(operation) || {
      count: 0,
      totalDuration: 0,
      errors: 0
    };
    
    current.count++;
    current.totalDuration += duration;
    if (error) {
      current.errors++;
      this.metrics.dbErrors++;
    }
    
    this.metrics.dbQueries.set(operation, current);
  }

  // Update connection pool stats
  updateDbPoolStats(active, idle, waiting) {
    this.metrics.dbConnectionPool = { active, idle, waiting };
  }

  // Calculate percentiles
  calculatePercentiles(values, percentiles = [50, 90, 95, 99]) {
    if (values.length === 0) return {};
    
    const sorted = values.slice().sort((a, b) => a - b);
    const result = {};
    
    percentiles.forEach(p => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      result[`p${p}`] = sorted[Math.max(0, index)];
    });
    
    return result;
  }

  // Get current metrics summary
  getSummary() {
    const uptime = Date.now() - this.metrics.startTime;
    const durations = this.metrics.httpDurations.map(d => d.duration);
    
    return {
      uptime: Math.floor(uptime / 1000), // seconds
      
      http: {
        requests: Object.fromEntries(this.metrics.httpRequests),
        errors: Object.fromEntries(this.metrics.httpErrors),
        durations: this.calculatePercentiles(durations),
        requestsPerSecond: this.metrics.httpDurations.length / (uptime / 1000)
      },
      
      video: {
        requests: Object.fromEntries(this.metrics.videoRequests),
        cacheHitRate: this.metrics.videoCacheHits / 
          (this.metrics.videoCacheHits + this.metrics.videoCacheMisses) || 0,
        totalBytesServed: this.metrics.videoBytesServed,
        mbServed: Math.round(this.metrics.videoBytesServed / (1024 * 1024))
      },
      
      database: {
        queries: Object.fromEntries(this.metrics.dbQueries),
        errorRate: this.metrics.dbErrors / 
          Array.from(this.metrics.dbQueries.values()).reduce((sum, q) => sum + q.count, 0) || 0,
        connectionPool: this.metrics.dbConnectionPool
      },
      
      system: {
        memory: this.metrics.processMemory,
        eventLoopLag: this.calculatePercentiles(this.metrics.eventLoopLag)
      }
    };
  }

  // Start collecting system metrics
  startSystemMetricsCollection() {
    // Memory usage
    setInterval(() => {
      const usage = process.memoryUsage();
      this.metrics.processMemory = {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024)
      };
    }, 10000);
    
    // Event loop lag (simple measurement)
    let lastCheck = Date.now();
    setInterval(() => {
      const now = Date.now();
      const lag = now - lastCheck - 1000; // Should be ~0 if no lag
      if (lag > 0) {
        this.metrics.eventLoopLag.push(lag);
        // Keep only last 100 measurements
        if (this.metrics.eventLoopLag.length > 100) {
          this.metrics.eventLoopLag.shift();
        }
      }
      lastCheck = now;
    }, 1000);
  }

  // Format for Prometheus
  toPrometheus() {
    const summary = this.getSummary();
    const lines = [];
    
    // HTTP metrics
    lines.push('# HELP http_requests_total Total HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, value] of Object.entries(summary.http.requests)) {
      const [method, path, status] = key.split(':');
      lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${value}`);
    }
    
    // Duration percentiles
    lines.push('# HELP http_request_duration_ms HTTP request duration percentiles');
    lines.push('# TYPE http_request_duration_ms summary');
    for (const [percentile, value] of Object.entries(summary.http.durations)) {
      lines.push(`http_request_duration_ms{quantile="${percentile.substring(1)/100}"} ${value}`);
    }
    
    // Video metrics
    lines.push('# HELP video_cache_hit_rate Video cache hit rate');
    lines.push('# TYPE video_cache_hit_rate gauge');
    lines.push(`video_cache_hit_rate ${summary.video.cacheHitRate}`);
    
    // Memory metrics
    lines.push('# HELP process_memory_mb Process memory usage');
    lines.push('# TYPE process_memory_mb gauge');
    for (const [type, value] of Object.entries(summary.system.memory)) {
      lines.push(`process_memory_mb{type="${type}"} ${value}`);
    }
    
    return lines.join('\n');
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

// Middleware to collect HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const path = req.route ? req.route.path : req.path;
    metricsCollector.recordHttpRequest(
      req.method,
      path,
      res.statusCode,
      duration
    );
  });
  
  next();
};

module.exports = {
  metricsCollector,
  metricsMiddleware
};