const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');
const { logger } = require('../config/logger');
const { metricsCollector } = require('../middleware/metrics');

/**
 * Optimized video cache with intelligent eviction and compression
 */

class OptimizedVideoCache {
  constructor(options = {}) {
    this.options = {
      maxSizeBytes: 2 * 1024 * 1024 * 1024, // 2GB default
      maxEntries: 500,
      ttl: 1000 * 60 * 60 * 4, // 4 hours
      cleanupInterval: 1000 * 60 * 15, // 15 minutes
      compressionThreshold: 10 * 1024 * 1024, // 10MB
      ...options
    };

    this.cacheDir = path.join(__dirname, '..', '..', 'static', 'cache', 'videos');
    this.metadataCache = new LRUCache({
      max: this.options.maxEntries,
      ttl: this.options.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // Track cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      lastCleanup: Date.now()
    };

    // Priority scoring for cache eviction
    this.priorityScores = new Map();
    
    this.init();
  }

  async init() {
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Load existing cache entries
    await this.loadExistingCache();
    
    // Start cleanup worker
    this.startCleanupWorker();
    
    logger.info('Optimized video cache initialized', {
      maxSize: this.formatBytes(this.options.maxSizeBytes),
      maxEntries: this.options.maxEntries,
      currentSize: this.formatBytes(this.stats.currentSize),
      entries: this.metadataCache.size,
      tags: ['cache', 'init']
    });
  }

  // Load existing cache entries on startup
  async loadExistingCache() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;
      let loadedCount = 0;

      for (const file of files) {
        if (file.endsWith('.mp4')) {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          
          // Extract cache key from filename
          const cacheKey = file.replace('.mp4', '');
          
          this.metadataCache.set(cacheKey, {
            filename: file,
            size: stats.size,
            createdAt: stats.birthtime,
            lastAccessed: stats.atime,
            accessCount: 1,
            priority: 1
          });

          totalSize += stats.size;
          loadedCount++;
        }
      }

      this.stats.currentSize = totalSize;
      
      logger.info('Existing cache loaded', {
        files: loadedCount,
        totalSize: this.formatBytes(totalSize),
        tags: ['cache', 'load']
      });
    } catch (error) {
      logger.error('Failed to load existing cache', {
        error: error.message,
        tags: ['cache', 'error']
      });
    }
  }

  // Check if video is cached
  has(cacheKey) {
    const hasEntry = this.metadataCache.has(cacheKey);
    if (hasEntry) {
      const filePath = path.join(this.cacheDir, `${cacheKey}.mp4`);
      const exists = fs.existsSync(filePath);
      
      if (!exists) {
        // File was deleted externally, remove from metadata
        this.metadataCache.delete(cacheKey);
        return false;
      }
      
      // Update access time and priority
      this.updateAccessStats(cacheKey);
      this.stats.hits++;
      return true;
    }
    
    this.stats.misses++;
    return false;
  }

  // Get cached video file path
  get(cacheKey) {
    if (!this.has(cacheKey)) {
      return null;
    }

    const entry = this.metadataCache.get(cacheKey);
    if (entry && entry.filename) {
      const filePath = path.join(this.cacheDir, entry.filename);
      return filePath;
    }
    
    // Fallback to old format
    const filePath = path.join(this.cacheDir, `${cacheKey}.mp4`);
    return filePath;
  }

  // Add video to cache
  async set(cacheKey, sourceStream, metadata = {}) {
    const filename = `${cacheKey}.mp4`;
    const filePath = path.join(this.cacheDir, filename);
    
    // Check if we need to make space
    const estimatedSize = metadata.size || 5 * 1024 * 1024; // 5MB default
    await this.ensureSpace(estimatedSize);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      let bytesWritten = 0;

      writeStream.on('error', (error) => {
        logger.error('Cache write error', {
          cacheKey,
          error: error.message,
          tags: ['cache', 'error']
        });
        reject(error);
      });

      writeStream.on('finish', () => {
        // Update metadata
        this.metadataCache.set(cacheKey, {
          filename,
          size: bytesWritten,
          createdAt: new Date(),
          lastAccessed: new Date(),
          accessCount: 1,
          priority: this.calculateInitialPriority(metadata),
          ...metadata
        });

        this.stats.currentSize += bytesWritten;
        
        logger.info('Video cached successfully', {
          cacheKey,
          size: this.formatBytes(bytesWritten),
          totalSize: this.formatBytes(this.stats.currentSize),
          tags: ['cache', 'write']
        });

        resolve(filePath);
      });

      // Track bytes written
      sourceStream.on('data', (chunk) => {
        bytesWritten += chunk.length;
      });

      sourceStream.pipe(writeStream);
    });
  }

  // Update access statistics
  updateAccessStats(cacheKey) {
    const entry = this.metadataCache.get(cacheKey);
    if (entry) {
      entry.lastAccessed = new Date();
      entry.accessCount = (entry.accessCount || 0) + 1;
      entry.priority = this.calculatePriority(entry);
      
      this.metadataCache.set(cacheKey, entry);
    }
  }

  // Calculate initial priority for new cache entries
  calculateInitialPriority(metadata) {
    let priority = 1;
    
    // Higher priority for recent videos
    if (metadata.timestamp) {
      const age = Date.now() - (metadata.timestamp * 1000);
      const hours = age / (1000 * 60 * 60);
      
      if (hours < 1) priority += 3;
      else if (hours < 6) priority += 2;
      else if (hours < 24) priority += 1;
    }
    
    // Higher priority for popular cameras
    if (metadata.cameraId) {
      const popularCameras = [1, 2, 3]; // Most accessed cameras
      if (popularCameras.includes(metadata.cameraId)) {
        priority += 2;
      }
    }
    
    return priority;
  }

  // Calculate priority based on access patterns
  calculatePriority(entry) {
    let priority = 1;
    
    // Recency factor
    const hoursSinceAccess = (Date.now() - entry.lastAccessed.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 3 - hoursSinceAccess / 2);
    
    // Frequency factor
    const frequencyScore = Math.min(3, entry.accessCount / 5);
    
    // Size factor (smaller files have slight priority)
    const sizeScore = entry.size < 1024 * 1024 ? 0.5 : 0; // Bonus for < 1MB
    
    priority = recencyScore + frequencyScore + sizeScore;
    
    return Math.max(0.1, priority);
  }

  // Ensure there's enough space for new cache entry
  async ensureSpace(neededBytes) {
    const availableSpace = this.options.maxSizeBytes - this.stats.currentSize;
    
    if (availableSpace >= neededBytes) {
      return; // Enough space available
    }

    const spaceToFree = neededBytes - availableSpace + (50 * 1024 * 1024); // Extra 50MB buffer
    await this.evictLeastUsed(spaceToFree);
  }

  // Evict least used videos to free space
  async evictLeastUsed(bytesToFree) {
    const entries = Array.from(this.metadataCache.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.priority - b.priority); // Lowest priority first

    let freedBytes = 0;
    let evictedCount = 0;

    for (const entry of entries) {
      if (freedBytes >= bytesToFree) break;

      try {
        const filePath = path.join(this.cacheDir, entry.filename);
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          freedBytes += entry.size;
          evictedCount++;
        }
        
        this.metadataCache.delete(entry.key);
      } catch (error) {
        logger.error('Cache eviction error', {
          key: entry.key,
          error: error.message,
          tags: ['cache', 'eviction', 'error']
        });
      }
    }

    this.stats.currentSize -= freedBytes;
    this.stats.evictions += evictedCount;

    logger.info('Cache eviction completed', {
      evicted: evictedCount,
      freedSpace: this.formatBytes(freedBytes),
      remainingSize: this.formatBytes(this.stats.currentSize),
      tags: ['cache', 'eviction']
    });
  }

  // Start cleanup worker
  startCleanupWorker() {
    setInterval(async () => {
      await this.performCleanup();
    }, this.options.cleanupInterval);
  }

  // Perform periodic cleanup
  async performCleanup() {
    const startTime = Date.now();
    
    // Remove expired entries
    const expiredKeys = [];
    for (const [key, entry] of this.metadataCache.entries()) {
      const age = Date.now() - entry.createdAt.getTime();
      if (age > this.options.ttl) {
        expiredKeys.push(key);
      }
    }

    // Remove expired files
    let removedCount = 0;
    let removedBytes = 0;

    for (const key of expiredKeys) {
      const entry = this.metadataCache.get(key);
      if (entry) {
        const filePath = path.join(this.cacheDir, entry.filename);
        
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            removedBytes += entry.size;
            removedCount++;
          }
          
          this.metadataCache.delete(key);
        } catch (error) {
          logger.error('Cleanup error', {
            key,
            error: error.message,
            tags: ['cache', 'cleanup', 'error']
          });
        }
      }
    }

    this.stats.currentSize -= removedBytes;
    this.stats.lastCleanup = Date.now();

    if (removedCount > 0) {
      logger.info('Cache cleanup completed', {
        removed: removedCount,
        freedSpace: this.formatBytes(removedBytes),
        duration: Date.now() - startTime,
        tags: ['cache', 'cleanup']
      });
    }
  }

  // Get cache statistics
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
      : 0;

    return {
      ...this.stats,
      hitRate: hitRate.toFixed(1) + '%',
      entries: this.metadataCache.size,
      maxSize: this.formatBytes(this.options.maxSizeBytes),
      currentSize: this.formatBytes(this.stats.currentSize),
      utilization: ((this.stats.currentSize / this.options.maxSizeBytes) * 100).toFixed(1) + '%',
      averageFileSize: this.metadataCache.size > 0 
        ? this.formatBytes(this.stats.currentSize / this.metadataCache.size) 
        : '0 B'
    };
  }

  // Format bytes for display
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }
}

// Create singleton instance
const optimizedVideoCache = new OptimizedVideoCache();

module.exports = {
  OptimizedVideoCache,
  optimizedVideoCache
};