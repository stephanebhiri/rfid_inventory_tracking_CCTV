const express = require('express');
const router = express.Router();
const { getVideosForCamera, buildVideoResponse } = require('../utils/videoTools');
const { clearCache } = require('../utils/fileTools');
const { validators, handleValidationErrors } = require('../middleware/validation');
const ApiResponse = require('../utils/responseFormatter');
const { logger, loggers } = require('../logger');

// Main API endpoint to get videos - returns closest video immediately
router.get('/videos', 
  validators.cctvVideoRequest, 
  handleValidationErrors,
  async (req, res) => {
  try {
    const { target, camera } = req.query;
    
    // Validation already handled by middleware
    const targetTimestamp = parseInt(target);
    const cameraId = parseInt(camera);
    
    loggers.cctv.request(cameraId, targetTimestamp, req.correlationId);
    
    // Get videos for the camera
    const result = await getVideosForCamera(targetTimestamp, cameraId, req.correlationId);
    
    // Log camera status
    if (result.cameraAvailable) {
      loggers.cctv.videoFound(cameraId, result.videos.length, req.correlationId);
    } else {
      loggers.cctv.cameraError(cameraId, result.cameraError, req.correlationId);
    }
    
    // Build response in required format
    const response = buildVideoResponse(
      result.videos, 
      targetTimestamp, 
      cameraId, 
      result.cameraAvailable, 
      result.cameraError
    );

    logger.info('CCTV response sent', {
      correlationId: req.correlationId,
      camera: cameraId,
      videoCount: result.videos.length,
      cameraAvailable: result.cameraAvailable
    });
    
    res.json(response);
    
  } catch (error) {
    logger.error('CCTV request failed', {
      correlationId: req.correlationId,
      camera: req.query.camera,
      target: req.query.target,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.internalError(res, error);
  }
});

// Test endpoint for slow response simulation
router.get('/videos-slow', async (req, res) => {
  const delay = parseInt(req.query.delay) || 6000;
  logger.debug(`Test endpoint called with ${delay}ms delay`);
  
  setTimeout(async () => {
    try {
      // Simulate slow response with actual data
      const response = [
        {"0":"/static/cache/videos/cam1_1752595200_slow_test.mp4"},
        0,
        -4800,
        1,
        {"0":1752595200}
      ];
      logger.debug(`Test response completed after ${delay}ms`);
      res.json(response);
    } catch (error) {
      return ApiResponse.internalError(res, error);
    }
  }, delay);
});

// Test endpoint for 404 video simulation
router.get('/videos-404', async (req, res) => {
  logger.debug('Test 404 endpoint called');
  
  try {
    // Return response with URLs that will 404
    const response = [
      {
        "0":"/static/cache/videos/non_existent_video_1.mp4",
        "1":"/static/cache/videos/non_existent_video_2.mp4"
      },
      0,
      0,
      1,
      {
        "0":1752595200,
        "1":1752595260
      }
    ];
    logger.debug('Test 404 response sent');
    res.json(response);
  } catch (error) {
    return ApiResponse.internalError(res, error);
  }
});

// Cache management route
router.delete('/cache', clearCache);

// Simple cache info endpoint
router.get('/cache-info', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const cacheDir = path.join(__dirname, '..', '..', 'static', 'cache', 'videos');
    
    let totalSize = 0;
    let fileCount = 0;
    
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      files.forEach(file => {
        if (file.endsWith('.mp4')) {
          const filePath = path.join(cacheDir, file);
          const stats = fs.statSync(filePath);
          totalSize += stats.size;
          fileCount++;
        }
      });
    }
    
    return ApiResponse.success(res, {
      files: fileCount,
      size: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
      sizeBytes: totalSize
    });
  } catch (error) {
    logger.error('Cache info error', { error: error.message });
    return ApiResponse.internalError(res, error);
  }
});

module.exports = router;