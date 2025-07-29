const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { queryCache } = require('../utils/dbOptimizations');
const { logger } = require('../config/logger');
const ApiResponse = require('../utils/responseFormatter');

// Get cache statistics
router.get('/stats', (req, res) => {
  try {
    const stats = {
      size: queryCache.size,
      max: queryCache.max,
      calculatedSize: queryCache.calculatedSize,
      ttl: queryCache.ttl,
      hits: queryCache.hits || 0,
      misses: queryCache.misses || 0
    };
    
    // Calculate hit ratio
    const totalRequests = stats.hits + stats.misses;
    stats.hitRatio = totalRequests > 0 ? (stats.hits / totalRequests * 100).toFixed(2) + '%' : '0%';
    
    logger.info('Cache stats requested', {
      correlationId: req.correlationId,
      stats
    });
    
    return ApiResponse.success(res, stats, {
      endpoint: 'cache/stats'
    });
    
  } catch (error) {
    logger.error('Failed to get cache stats', {
      correlationId: req.correlationId,
      error: error.message
    });
    return ApiResponse.internalError(res, error);
  }
});

// Clear query cache
router.delete('/clear', (req, res) => {
  try {
    const sizeBefore = queryCache.size;
    queryCache.clear();
    
    logger.info('Query cache cleared', {
      correlationId: req.correlationId,
      entriesCleared: sizeBefore
    });
    
    return ApiResponse.success(res, {
      message: 'Query cache cleared successfully',
      entriesCleared: sizeBefore
    }, {
      endpoint: 'cache/clear'
    });
    
  } catch (error) {
    logger.error('Failed to clear cache', {
      correlationId: req.correlationId,
      error: error.message
    });
    return ApiResponse.internalError(res, error);
  }
});

// Get cache keys (for debugging)
router.get('/keys', (req, res) => {
  try {
    const keys = Array.from(queryCache.keys());
    
    logger.info('Cache keys requested', {
      correlationId: req.correlationId,
      keyCount: keys.length
    });
    
    return ApiResponse.success(res, {
      keys: keys,
      count: keys.length
    }, {
      endpoint: 'cache/keys'
    });
    
  } catch (error) {
    logger.error('Failed to get cache keys', {
      correlationId: req.correlationId,
      error: error.message
    });
    return ApiResponse.internalError(res, error);
  }
});

// Erase video cache (DELETE /api/cache - the root endpoint)
router.delete('/', (req, res) => {
  try {
    const cacheDir = path.join(__dirname, '..', '..', 'static', 'cache', 'videos');
    
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      let deletedCount = 0;
      let totalSize = 0;
      
      files.forEach(file => {
        const filePath = path.join(cacheDir, file);
        if (fs.statSync(filePath).isFile()) {
          totalSize += fs.statSync(filePath).size;
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });
      
      const sizeFreedMB = Math.round(totalSize / 1024 / 1024 * 100) / 100;
      
      logger.info('Video cache erased', {
        correlationId: req.correlationId,
        filesDeleted: deletedCount,
        sizeFreedMB
      });
      
      console.log(`🗑️  Video cache erased: ${deletedCount} files, ${sizeFreedMB}MB freed`);
      
      return ApiResponse.success(res, {
        message: 'Cache cleared successfully',
        filesDeleted: deletedCount,
        sizeFreed: sizeFreedMB
      }, {
        endpoint: 'cache/erase'
      });
      
    } else {
      logger.info('Video cache directory does not exist', {
        correlationId: req.correlationId,
        cacheDir
      });
      
      return ApiResponse.success(res, {
        message: 'Cache directory does not exist',
        filesDeleted: 0,
        sizeFreed: 0
      }, {
        endpoint: 'cache/erase'
      });
    }
    
  } catch (error) {
    logger.error('Failed to erase video cache', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    
    return ApiResponse.internalError(res, error);
  }
});

module.exports = router;