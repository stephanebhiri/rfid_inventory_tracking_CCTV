const express = require('express');
const router = express.Router();
const { metricsCollector } = require('../middleware/metrics');
const { logger } = require('../config/logger');
const ApiResponse = require('../utils/responseFormatter');

/**
 * Performance analysis endpoints for real-time optimization
 */

// Get performance bottlenecks and recommendations
router.get('/analysis', (req, res) => {
  try {
    const metrics = metricsCollector.getSummary();
    const analysis = analyzePerformance(metrics);
    
    return ApiResponse.success(res, analysis);
  } catch (error) {
    logger.error('Performance analysis failed', { error: error.message });
    return ApiResponse.internalError(res, error);
  }
});

// Get real-time performance dashboard data
router.get('/dashboard', (req, res) => {
  try {
    const metrics = metricsCollector.getSummary();
    const dashboard = {
      overview: {
        uptime: formatUptime(metrics.uptime),
        requestsPerSecond: metrics.http.requestsPerSecond.toFixed(2),
        errorRate: calculateErrorRate(metrics.http.errors, metrics.http.requests),
        avgResponseTime: metrics.http.durations.p50 || 0,
        slowRequests: countSlowRequests(metrics.http.durations)
      },
      
      videoStreaming: {
        cacheHitRate: (metrics.video.cacheHitRate * 100).toFixed(1) + '%',
        totalServed: formatBytes(metrics.video.totalBytesServed),
        avgBandwidth: calculateAvgBandwidth(metrics.video.totalBytesServed, metrics.uptime),
        requestsByCamera: metrics.video.requests
      },
      
      performance: {
        responseTimePercentiles: {
          p50: Math.round(metrics.http.durations.p50 || 0) + 'ms',
          p90: Math.round(metrics.http.durations.p90 || 0) + 'ms',
          p95: Math.round(metrics.http.durations.p95 || 0) + 'ms',
          p99: Math.round(metrics.http.durations.p99 || 0) + 'ms'
        },
        memoryUsage: {
          used: metrics.system.memory.heapUsed + 'MB',
          total: metrics.system.memory.heapTotal + 'MB',
          percentage: ((metrics.system.memory.heapUsed / metrics.system.memory.heapTotal) * 100).toFixed(1) + '%'
        },
        eventLoopLag: metrics.system.eventLoopLag.p95 || 0
      },
      
      topEndpoints: getTopEndpoints(metrics.http.requests),
      errorBreakdown: getErrorBreakdown(metrics.http.errors),
      recommendations: generateRecommendations(metrics)
    };
    
    return ApiResponse.success(res, dashboard);
  } catch (error) {
    logger.error('Dashboard data generation failed', { error: error.message });
    return ApiResponse.internalError(res, error);
  }
});

// Get video streaming specific performance metrics
router.get('/video-streaming', (req, res) => {
  try {
    const metrics = metricsCollector.getSummary();
    const videoMetrics = analyzeVideoPerformance(metrics);
    
    return ApiResponse.success(res, videoMetrics);
  } catch (error) {
    logger.error('Video performance analysis failed', { error: error.message });
    return ApiResponse.internalError(res, error);
  }
});

// Helper functions
function analyzePerformance(metrics) {
  const bottlenecks = [];
  const optimizations = [];
  
  // Check response times
  if (metrics.http.durations.p95 > 1000) {
    bottlenecks.push({
      type: 'SLOW_RESPONSE',
      severity: 'high',
      message: `95th percentile response time is ${metrics.http.durations.p95}ms (target: <1000ms)`,
      impact: 'Users experiencing slow page loads'
    });
    
    optimizations.push({
      priority: 'high',
      action: 'Enable aggressive caching for static resources',
      expectedImprovement: '40-60% reduction in response times'
    });
  }
  
  // Check cache hit rate
  if (metrics.video.cacheHitRate < 0.7) {
    bottlenecks.push({
      type: 'LOW_CACHE_HIT',
      severity: 'medium',
      message: `Video cache hit rate is ${(metrics.video.cacheHitRate * 100).toFixed(1)}% (target: >70%)`,
      impact: 'Excessive bandwidth usage and slow video loads'
    });
    
    optimizations.push({
      priority: 'high',
      action: 'Implement predictive video preloading',
      expectedImprovement: '50% reduction in video load times'
    });
  }
  
  // Check memory usage
  const memoryUsagePercent = (metrics.system.memory.heapUsed / metrics.system.memory.heapTotal) * 100;
  if (memoryUsagePercent > 80) {
    bottlenecks.push({
      type: 'HIGH_MEMORY',
      severity: 'high',
      message: `Memory usage at ${memoryUsagePercent.toFixed(1)}% (target: <80%)`,
      impact: 'Risk of out-of-memory errors and GC pauses'
    });
    
    optimizations.push({
      priority: 'critical',
      action: 'Implement memory pooling for video buffers',
      expectedImprovement: '30% reduction in memory usage'
    });
  }
  
  // Check error rate
  const errorRate = calculateErrorRate(metrics.http.errors, metrics.http.requests);
  if (errorRate > 1) {
    bottlenecks.push({
      type: 'HIGH_ERROR_RATE',
      severity: 'medium',
      message: `Error rate is ${errorRate.toFixed(2)}% (target: <1%)`,
      impact: 'Poor user experience and potential data loss'
    });
  }
  
  return {
    score: calculatePerformanceScore(metrics),
    bottlenecks,
    optimizations,
    metrics: {
      avgResponseTime: metrics.http.durations.p50,
      cacheEfficiency: metrics.video.cacheHitRate,
      throughput: metrics.http.requestsPerSecond,
      errorRate
    }
  };
}

function analyzeVideoPerformance(metrics) {
  const videoRequests = metrics.video.requests;
  const totalRequests = Object.values(videoRequests).reduce((sum, count) => sum + count, 0);
  
  // Calculate per-camera metrics
  const cameraMetrics = {};
  for (const [cameraId, count] of Object.entries(videoRequests)) {
    cameraMetrics[`camera_${cameraId}`] = {
      requests: count,
      percentage: ((count / totalRequests) * 100).toFixed(1) + '%',
      avgMBPerRequest: (metrics.video.mbServed / totalRequests).toFixed(2)
    };
  }
  
  // Bandwidth analysis
  const bandwidthMbps = (metrics.video.totalBytesServed * 8) / (metrics.uptime * 1000000);
  
  return {
    summary: {
      totalRequests,
      totalDataServed: formatBytes(metrics.video.totalBytesServed),
      avgBandwidth: bandwidthMbps.toFixed(2) + ' Mbps',
      cacheHitRate: (metrics.video.cacheHitRate * 100).toFixed(1) + '%',
      cacheMissCount: metrics.video.totalBytesServed > 0 ? 
        Math.round(totalRequests * (1 - metrics.video.cacheHitRate)) : 0
    },
    
    perCamera: cameraMetrics,
    
    optimization: {
      potentialBandwidthSaving: metrics.video.cacheHitRate < 0.9 ? 
        formatBytes(metrics.video.totalBytesServed * (0.9 - metrics.video.cacheHitRate)) : '0',
      recommendedCacheSize: Math.ceil(metrics.video.mbServed * 2) + 'MB',
      optimalPreloadCount: Math.min(3, Math.ceil(totalRequests / metrics.uptime / 10))
    },
    
    trends: {
      requestsPerMinute: (totalRequests / (metrics.uptime / 60)).toFixed(1),
      peakBandwidthEstimate: (bandwidthMbps * 1.5).toFixed(2) + ' Mbps'
    }
  };
}

function calculatePerformanceScore(metrics) {
  let score = 100;
  
  // Response time impact (max -30 points)
  if (metrics.http.durations.p95 > 2000) score -= 30;
  else if (metrics.http.durations.p95 > 1000) score -= 15;
  else if (metrics.http.durations.p95 > 500) score -= 5;
  
  // Cache efficiency impact (max -20 points)
  score -= Math.round((1 - metrics.video.cacheHitRate) * 20);
  
  // Error rate impact (max -20 points)
  const errorRate = calculateErrorRate(metrics.http.errors, metrics.http.requests);
  score -= Math.min(20, Math.round(errorRate * 4));
  
  // Memory usage impact (max -15 points)
  const memUsage = (metrics.system.memory.heapUsed / metrics.system.memory.heapTotal) * 100;
  if (memUsage > 90) score -= 15;
  else if (memUsage > 80) score -= 10;
  else if (memUsage > 70) score -= 5;
  
  // Event loop lag impact (max -15 points)
  if (metrics.system.eventLoopLag.p95 > 100) score -= 15;
  else if (metrics.system.eventLoopLag.p95 > 50) score -= 10;
  else if (metrics.system.eventLoopLag.p95 > 20) score -= 5;
  
  return Math.max(0, score);
}

function generateRecommendations(metrics) {
  const recommendations = [];
  
  // Based on metrics, suggest optimizations
  if (metrics.http.durations.p95 > 500) {
    recommendations.push({
      title: 'Implement Response Caching',
      description: 'Add Redis caching layer for API responses',
      impact: 'high',
      effort: 'medium',
      estimatedGain: '60% faster response times'
    });
  }
  
  if (metrics.video.cacheHitRate < 0.8) {
    recommendations.push({
      title: 'Optimize Video Caching Strategy',
      description: 'Implement LRU cache with predictive preloading',
      impact: 'high',
      effort: 'low',
      estimatedGain: '70% reduction in bandwidth usage'
    });
  }
  
  if (metrics.system.memory.heapUsed > 200) {
    recommendations.push({
      title: 'Optimize Memory Usage',
      description: 'Implement streaming for large responses and video chunking',
      impact: 'medium',
      effort: 'medium',
      estimatedGain: '40% memory reduction'
    });
  }
  
  return recommendations;
}

// Utility functions
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function calculateErrorRate(errors, requests) {
  const totalErrors = Object.values(errors).reduce((sum, count) => sum + count, 0);
  const totalRequests = Object.values(requests).reduce((sum, count) => sum + count, 0);
  return totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
}

function countSlowRequests(durations) {
  return durations.p95 > 1000 ? 'High' : durations.p90 > 1000 ? 'Medium' : 'Low';
}

function calculateAvgBandwidth(bytes, seconds) {
  const mbps = (bytes * 8) / (seconds * 1000000);
  return mbps.toFixed(2) + ' Mbps';
}

function getTopEndpoints(requests) {
  return Object.entries(requests)
    .map(([key, count]) => {
      const [method, path] = key.split(':');
      return { method, path, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function getErrorBreakdown(errors) {
  return Object.entries(errors)
    .map(([key, count]) => {
      const [status, path] = key.split(':');
      return { status: parseInt(status), path, count };
    })
    .sort((a, b) => b.count - a.count);
}

module.exports = router;