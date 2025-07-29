const { LRUCache } = require('lru-cache');
const { logger } = require('../config/logger');
const { metricsCollector } = require('../middleware/metrics');

/**
 * Intelligent video preloader that predicts and preloads videos
 * based on user behavior patterns and temporal proximity
 */

class IntelligentVideoPreloader {
  constructor(options = {}) {
    this.options = {
      maxConcurrentDownloads: 3,
      preloadWindow: 600, // 10 minutes before/after in seconds
      maxCacheSize: 50, // Maximum videos to preload
      learningWindow: 1000, // Track last 1000 requests for patterns
      ...options
    };

    // Track user access patterns
    this.accessPatterns = new LRUCache({
      max: this.options.learningWindow,
      ttl: 1000 * 60 * 60 * 24 // 24 hours
    });

    // Track preload queue
    this.preloadQueue = new Set();
    this.activeDownloads = new Map();
    
    // Cache for preloaded videos
    this.preloadedVideos = new LRUCache({
      max: this.options.maxCacheSize,
      ttl: 1000 * 60 * 60 * 2 // 2 hours
    });

    // Temporal access patterns (time of day, day of week)
    this.temporalPatterns = new Map();
    
    this.startPreloadWorker();
  }

  // Record a video access for pattern learning
  recordAccess(cameraId, timestamp, itemId = null) {
    const accessKey = `${cameraId}_${timestamp}`;
    const now = Date.now();
    
    const access = {
      cameraId,
      timestamp,
      itemId,
      accessTime: now,
      hour: new Date(now).getHours(),
      dayOfWeek: new Date(now).getDay()
    };

    this.accessPatterns.set(accessKey, access);
    this.updateTemporalPatterns(access);
    
    // Temporarily disable automatic preloading to avoid performance issues
    // this.predictAndPreload(access);
    
    logger.debug('Video access recorded', {
      cameraId,
      timestamp,
      itemId,
      tags: ['preloader', 'access-pattern']
    });
  }

  // Update temporal patterns (time-based access patterns)
  updateTemporalPatterns(access) {
    const timeKey = `${access.hour}_${access.dayOfWeek}`;
    const current = this.temporalPatterns.get(timeKey) || { count: 0, cameras: new Set() };
    
    current.count++;
    current.cameras.add(access.cameraId);
    
    this.temporalPatterns.set(timeKey, current);
  }

  // Predict and queue videos for preloading
  predictAndPreload(currentAccess) {
    const predictions = this.generatePredictions(currentAccess);
    
    predictions.forEach(prediction => {
      if (!this.preloadQueue.has(prediction.key) && 
          !this.activeDownloads.has(prediction.key) &&
          !this.preloadedVideos.has(prediction.key)) {
        
        this.queuePreload(prediction);
      }
    });
  }

  // Generate video predictions based on patterns
  generatePredictions(currentAccess) {
    const predictions = [];
    const { cameraId, timestamp } = currentAccess;
    
    // 1. Temporal proximity (videos around current time)
    const timeWindow = this.options.preloadWindow;
    for (let offset = -timeWindow; offset <= timeWindow; offset += 120) { // Every 2 minutes
      if (offset === 0) continue; // Skip current video
      
      const predictedTime = timestamp + offset;
      predictions.push({
        key: `${cameraId}_${predictedTime}`,
        cameraId,
        timestamp: predictedTime,
        confidence: this.calculateTemporalConfidence(offset),
        reason: 'temporal_proximity'
      });
    }

    // 2. Same camera pattern (users often watch multiple videos from same camera)
    const sameCameraAccesses = this.getSameCameraAccesses(cameraId);
    sameCameraAccesses.forEach(access => {
      const timeDiff = Math.abs(access.timestamp - timestamp);
      if (timeDiff > 60 && timeDiff < 3600) { // 1 minute to 1 hour
        predictions.push({
          key: `${cameraId}_${access.timestamp}`,
          cameraId,
          timestamp: access.timestamp,
          confidence: this.calculatePatternConfidence(timeDiff),
          reason: 'same_camera_pattern'
        });
      }
    });

    // 3. Multi-camera pattern (users often check multiple cameras for same time)
    const otherCameras = [1, 2, 3, 4, 5, 6].filter(id => id !== cameraId);
    otherCameras.forEach(otherId => {
      predictions.push({
        key: `${otherId}_${timestamp}`,
        cameraId: otherId,
        timestamp,
        confidence: this.calculateMultiCameraConfidence(cameraId, otherId),
        reason: 'multi_camera_pattern'
      });
    });

    // 4. Temporal patterns (same time, different days)
    const temporalPredictions = this.getTemporalPredictions(currentAccess);
    predictions.push(...temporalPredictions);

    // Sort by confidence and return top predictions
    return predictions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10); // Top 10 predictions
  }

  // Calculate confidence based on temporal proximity
  calculateTemporalConfidence(offset) {
    const absOffset = Math.abs(offset);
    if (absOffset < 60) return 0.9; // Very high for < 1 minute
    if (absOffset < 300) return 0.7; // High for < 5 minutes
    if (absOffset < 600) return 0.5; // Medium for < 10 minutes
    return 0.2; // Low for > 10 minutes
  }

  // Calculate confidence based on access patterns
  calculatePatternConfidence(timeDiff) {
    const hours = timeDiff / 3600;
    if (hours < 1) return 0.8;
    if (hours < 6) return 0.6;
    if (hours < 24) return 0.4;
    return 0.2;
  }

  // Calculate multi-camera confidence
  calculateMultiCameraConfidence(currentCamera, otherCamera) {
    // Analyze how often users access both cameras
    const coAccesses = this.getCoAccessFrequency(currentCamera, otherCamera);
    return Math.min(0.8, coAccesses / 10); // Max 80% confidence
  }

  // Get accesses for same camera
  getSameCameraAccesses(cameraId) {
    const accesses = [];
    for (const [key, access] of this.accessPatterns) {
      if (access.cameraId === cameraId) {
        accesses.push(access);
      }
    }
    return accesses.slice(-20); // Last 20 accesses
  }

  // Get co-access frequency between cameras
  getCoAccessFrequency(camera1, camera2) {
    let coAccesses = 0;
    const recentAccesses = Array.from(this.accessPatterns.values())
      .slice(-100); // Last 100 accesses
    
    for (let i = 0; i < recentAccesses.length - 1; i++) {
      const current = recentAccesses[i];
      const next = recentAccesses[i + 1];
      
      if ((current.cameraId === camera1 && next.cameraId === camera2) ||
          (current.cameraId === camera2 && next.cameraId === camera1)) {
        const timeDiff = Math.abs(next.accessTime - current.accessTime);
        if (timeDiff < 300000) { // Within 5 minutes
          coAccesses++;
        }
      }
    }
    
    return coAccesses;
  }

  // Get temporal predictions based on time patterns
  getTemporalPredictions(currentAccess) {
    const predictions = [];
    const currentTimeKey = `${currentAccess.hour}_${currentAccess.dayOfWeek}`;
    const pattern = this.temporalPatterns.get(currentTimeKey);
    
    if (pattern && pattern.count > 3) { // Need at least 3 occurrences
      pattern.cameras.forEach(cameraId => {
        if (cameraId !== currentAccess.cameraId) {
          predictions.push({
            key: `${cameraId}_${currentAccess.timestamp}`,
            cameraId,
            timestamp: currentAccess.timestamp,
            confidence: Math.min(0.6, pattern.count / 10),
            reason: 'temporal_pattern'
          });
        }
      });
    }
    
    return predictions;
  }

  // Queue a video for preloading
  queuePreload(prediction) {
    if (this.preloadQueue.size >= this.options.maxCacheSize) {
      return; // Queue full
    }
    
    this.preloadQueue.add(prediction.key);
    
    logger.debug('Video queued for preload', {
      key: prediction.key,
      cameraId: prediction.cameraId,
      timestamp: prediction.timestamp,
      confidence: prediction.confidence,
      reason: prediction.reason,
      tags: ['preloader', 'queue']
    });
  }

  // Start the preload worker
  startPreloadWorker() {
    setInterval(() => {
      this.processPreloadQueue();
    }, 2000); // Process every 2 seconds
  }

  // Process the preload queue
  async processPreloadQueue() {
    if (this.activeDownloads.size >= this.options.maxConcurrentDownloads) {
      return; // Max concurrent downloads reached
    }

    const queueArray = Array.from(this.preloadQueue);
    if (queueArray.length === 0) return;

    const nextKey = queueArray[0];
    this.preloadQueue.delete(nextKey);

    try {
      await this.preloadVideo(nextKey);
    } catch (error) {
      logger.error('Preload failed', {
        key: nextKey,
        error: error.message,
        tags: ['preloader', 'error']
      });
    }
  }

  // Preload a specific video
  async preloadVideo(key) {
    const [cameraId, timestamp] = key.split('_');
    
    this.activeDownloads.set(key, Date.now());
    
    try {
      // Instead of making HTTP requests, directly use the video tools
      const { getVideosForCamera } = require('./videoTools');
      
      const result = await getVideosForCamera(parseInt(timestamp), parseInt(cameraId));
      
      if (result.videos && result.videos.length > 0) {
        this.preloadedVideos.set(key, {
          data: result,
          preloadTime: Date.now()
        });
        
        // Record successful preload
        metricsCollector.recordVideoRequest(parseInt(cameraId), false, 0);
        
        logger.info('Video preloaded successfully', {
          key,
          cameraId,
          timestamp,
          videoCount: result.videos.length,
          tags: ['preloader', 'success']
        });
      } else {
        logger.debug('No videos found for preload', {
          key,
          cameraId,
          timestamp,
          tags: ['preloader', 'no-videos']
        });
      }
    } catch (error) {
      logger.error('Preload request failed', {
        key,
        error: error.message,
        tags: ['preloader', 'error']
      });
    } finally {
      this.activeDownloads.delete(key);
    }
  }

  // Check if a video is preloaded
  isPreloaded(cameraId, timestamp) {
    const key = `${cameraId}_${timestamp}`;
    return this.preloadedVideos.has(key);
  }

  // Get preloaded video data
  getPreloadedVideo(cameraId, timestamp) {
    const key = `${cameraId}_${timestamp}`;
    return this.preloadedVideos.get(key);
  }

  // Get preloader statistics
  getStats() {
    return {
      queueSize: this.preloadQueue.size,
      activeDownloads: this.activeDownloads.size,
      preloadedVideos: this.preloadedVideos.size,
      learnedPatterns: this.accessPatterns.size,
      temporalPatterns: this.temporalPatterns.size,
      maxConcurrent: this.options.maxConcurrentDownloads
    };
  }
}

// Create singleton instance
const intelligentPreloader = new IntelligentVideoPreloader();

module.exports = {
  IntelligentVideoPreloader,
  intelligentPreloader
};