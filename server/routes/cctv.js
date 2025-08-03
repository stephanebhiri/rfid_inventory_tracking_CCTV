const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { getVideosForCamera, buildVideoResponse } = require('../utils/videoTools');
const { clearCache } = require('../utils/fileTools');
const { validators, handleValidationErrors } = require('../middleware/validation');
const ApiResponse = require('../utils/responseFormatter');
const { logger, loggers } = require('../logger');

// rate-limit for CCTV endpoints to protect backend
const cctvLimiter = rateLimit({ windowMs: 60_000, max: 30, message: 'Too many requests, please slow down.' });

// Main API endpoint to get videos - returns closest video immediately
router.get('/videos', 
  // cctvLimiter, // Temporarily disabled for debugging
  validators.cctvVideoRequest, 
  handleValidationErrors,
  async (req, res) => {
  try {
    const targetTimestamp = parseInt(req.query.target, 10);
    const cameraId = parseInt(req.query.camera, 10);

    if (isNaN(targetTimestamp) || isNaN(cameraId)) {
      logger.warn('Invalid CCTV params', { target: req.query.target, camera: req.query.camera });
      return ApiResponse.badRequest(res, 'Invalid target or camera id');
    }
    
    logger.info('CCTV video request', { cameraId, targetTimestamp, correlationId: req.correlationId });
    
    // Get videos for the camera
    const result = await getVideosForCamera(targetTimestamp, cameraId, req.correlationId);
    
    // Log camera status
    if (result.cameraAvailable) {
      logger.info('CCTV videos found', { cameraId, videoCount: result.videos.length, correlationId: req.correlationId });
    } else {
      logger.warn('CCTV camera error', { cameraId, error: result.cameraError, correlationId: req.correlationId });
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
      videoCount: result.videos.length
    });
    
    return res.json(response);
    
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

// Test endpoints for development only
if (process.env.NODE_ENV !== 'production') {

// Test endpoint for slow response simulation
router.get('/videos-slow', async (req, res) => {
  let delay = parseInt(req.query.delay, 10) || 6000;
  delay = Math.min(Math.max(delay, 0), 30_000);
  logger.debug(`Test endpoint called with ${delay}ms delay`);
  
  setTimeout(async () => {
    try {
      // Simulate slow response with actual data
      const response = [
        {"0":"/static/cache/videos/cam1_1752595200_slow_test.mp4"},
        0,
        -4800, 1,
        {"0":1752595200}
      ];
      logger.debug(`Test response completed after ${delay}ms`);
      return ApiResponse.success(res, response);
    } catch (error) {
      return ApiResponse.internalError(res, error);
    }
  }, delay);
});

// Test endpoint for 404 video simulation
router.get('/videos-404', async (req, res) => {
  logger.debug('Test 404 endpoint called');
  try {
    const response = [
      {
        "0":"/static/cache/videos/non_existent_video_1.mp4",
        "1":"/static/cache/videos/non_existent_video_2.mp4"
      },
      0, 0, 1,
      { "0":1752595200, "1":1752595260 }
    ];
    logger.debug('Test 404 response sent');
    return ApiResponse.success(res, response);
  } catch (error) {
    return ApiResponse.internalError(res, error);
  }
});

}

// Cache management route  
router.delete('/cache', async (req, res, next) => {
  try {
    // Basic auth check - in production you'd use proper admin middleware
    const adminToken = req.headers['x-admin-token'];
    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    await clearCache();
    return res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

// Simple cache info endpoint
router.get('/cache-info', async (req, res) => {
  const fs = require('fs').promises;
  const path = require('path');
  const cacheDir = path.resolve(__dirname, '..', '..', 'static', 'cache', 'videos');
  let totalSize = 0, fileCount = 0;
  try {
    const entries = await fs.readdir(cacheDir);
    await Promise.all(entries.map(async file => {
      if (file.endsWith('.mp4')) {
        const stats = await fs.stat(path.join(cacheDir, file));
        totalSize += stats.size;
        fileCount++;
      }
    }));
  } catch {
    // directory may not exist or be empty
  }
  return ApiResponse.success(res, {
    files: fileCount,
    sizeBytes: totalSize,
    size: `${(totalSize/1024/1024).toFixed(1)} MB`
  });
});

module.exports = router;