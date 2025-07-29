const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { videoMetadata } = require('../utils/videoTools');
const { CCTV } = require('../config/constants');
const { authenticate } = require('../utils/auth');
const ApiResponse = require('../utils/responseFormatter');
const { optimizedVideoCache } = require('../utils/optimizedVideoCache');

// Performance monitoring
class PerformanceMonitor extends Transform {
  constructor(options = {}) {
    super(options);
    this.bytesTransferred = 0;
    this.startTime = Date.now();
    this.chunkCount = 0;
  }

  _transform(chunk, encoding, callback) {
    this.bytesTransferred += chunk.length;
    this.chunkCount++;
    
    // Log progress every 1MB
    if (this.bytesTransferred % (1024 * 1024) < chunk.length) {
      const elapsedSeconds = (Date.now() - this.startTime) / 1000;
      const mbps = (this.bytesTransferred / (1024 * 1024)) / elapsedSeconds;
      console.log(`⚡ Streaming: ${(this.bytesTransferred / (1024 * 1024)).toFixed(1)}MB at ${mbps.toFixed(2)}MB/s`);
    }
    
    callback(null, chunk);
  }
}

// Middleware to handle video file requests with progressive streaming and optimization
async function handleVideoRequestOptimized(req, res) {
  const filename = req.params.filename;
  const cacheKey = filename.replace('.mp4', '');
  
  console.log(`📹 Video request: ${filename}`);
  
  // Handle range requests for better performance
  const range = req.headers.range;
  
  // Check if file exists in optimized cache
  let cachedPath = optimizedVideoCache.get(cacheKey);
  
  // If not in optimized cache, check if file exists in legacy cache
  if (!cachedPath) {
    const legacyPath = path.join(__dirname, '..', '..', 'static', 'cache', 'videos', filename);
    if (fs.existsSync(legacyPath)) {
      console.log(`📦 Migrating legacy cached video to optimized cache: ${filename}`);
      
      // Add to optimized cache metadata
      const stat = fs.statSync(legacyPath);
      const match = filename.match(/cam(\d+)_(\d+)_([a-f0-9]+)\.mp4/);
      const cameraId = match ? parseInt(match[1]) : 1;
      const timestamp = match ? parseInt(match[2]) : Date.now();
      
      optimizedVideoCache.metadataCache.set(cacheKey, {
        filename,
        size: stat.size,
        createdAt: stat.birthtime,
        lastAccessed: new Date(),
        accessCount: 1,
        priority: optimizedVideoCache.calculateInitialPriority({ cameraId, timestamp }),
        cameraId,
        timestamp
      });
      
      cachedPath = legacyPath;
    }
  }
  
  if (cachedPath) {
    console.log(`✅ Serving cached video: ${filename}`);
    
    const stat = fs.statSync(cachedPath);
    const fileSize = stat.size;
    
    if (range) {
      // Handle range request for progressive download
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      
      const stream = fs.createReadStream(cachedPath, { start, end });
      return stream.pipe(res);
    } else {
      // Full file request
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      
      const stream = fs.createReadStream(cachedPath);
      return stream.pipe(res);
    }
  }
  
  // Extract camera ID and timestamp from filename
  const match = filename.match(/cam(\d+)_(\d+)_([a-f0-9]+)\.mp4/);
  if (!match) {
    console.error(`❌ Invalid video filename format: ${filename}`);
    return ApiResponse.notFound(res, 'Video');
  }
  
  const cameraId = parseInt(match[1]);
  const timestamp = parseInt(match[2]);
  
  try {
    // Get video metadata
    const metadata = videoMetadata.get(filename);
    if (!metadata) {
      console.log(`⚠️  No metadata for video: ${filename}`);
      return ApiResponse.notFound(res, 'Video metadata');
    }
    
    // Get authentication token
    console.log(`📡 Streaming video from remote: ${filename}`);
    const token = await authenticate();
    
    const url = `${CCTV.baseUrl}/cgi-bin/filemanager/utilRequest.cgi`;
    const params = new URLSearchParams({
      func: 'get_viewer',
      sid: token,
      source_path: metadata.path,
      source_file: metadata.filename
    });
    
    // Fetch with timeout and abort controller
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const response = await fetch(`${url}?${params}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CCTV-Viewer/1.0'
      }
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.error(`❌ Failed to stream video: ${response.status} ${response.statusText}`);
      return ApiResponse.serviceUnavailable(res, 'Video streaming service', `HTTP ${response.status}`);
    }
    
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type') || 'video/mp4';
    
    // Set optimized headers for better streaming
    const headers = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Transfer-Encoding': 'chunked',
      'X-Frame-Options': 'SAMEORIGIN'
    };
    
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }
    
    res.writeHead(200, headers);
    
    // Create performance monitor
    const monitor = new PerformanceMonitor();
    
    // Create cache write stream and add to optimized cache
    const cachePath = path.join(__dirname, '..', '..', 'static', 'cache', 'videos', filename);
    const tempPath = `${cachePath}.tmp`;
    const cacheStream = fs.createWriteStream(tempPath);
    
    // Handle completion
    let cacheSuccess = false;
    cacheStream.on('finish', () => {
      cacheSuccess = true;
      // Rename temp file to final name
      fs.rename(tempPath, cachePath, (err) => {
        if (err) {
          console.error(`⚠️  Failed to rename cache file: ${err.message}`);
          fs.unlink(tempPath, () => {}); // Clean up temp file
        } else {
          // Add to optimized cache metadata
          optimizedVideoCache.metadataCache.set(cacheKey, {
            filename,
            size: monitor.bytesTransferred,
            createdAt: new Date(),
            lastAccessed: new Date(),
            accessCount: 1,
            priority: optimizedVideoCache.calculateInitialPriority({ cameraId, timestamp }),
            cameraId,
            timestamp
          });
          
          optimizedVideoCache.stats.currentSize += monitor.bytesTransferred;
          
          const elapsed = (Date.now() - monitor.startTime) / 1000;
          const avgSpeed = (monitor.bytesTransferred / (1024 * 1024)) / elapsed;
          console.log(`💾 Video cached with optimized cache: ${filename} (${(monitor.bytesTransferred / (1024 * 1024)).toFixed(1)}MB in ${elapsed.toFixed(1)}s @ ${avgSpeed.toFixed(2)}MB/s)`);
        }
      });
    });
    
    cacheStream.on('error', (err) => {
      console.error(`⚠️  Cache write error: ${err.message}`);
      fs.unlink(tempPath, () => {}); // Clean up temp file
    });
    
    // Pipe through monitor to both client and cache
    response.body.pipe(monitor);
    monitor.pipe(res);
    monitor.pipe(cacheStream);
    
    // Handle client disconnect
    req.on('close', () => {
      if (!res.writableEnded) {
        console.log(`⚠️  Client disconnected during stream: ${filename}`);
        response.body.destroy();
        monitor.destroy();
        if (!cacheSuccess) {
          cacheStream.destroy();
          fs.unlink(tempPath, () => {});
        }
      }
    });
    
    console.log(`✅ Video streaming started: ${filename}`);
    
  } catch (error) {
    console.error(`💥 Error handling video request:`, error);
    return ApiResponse.internalError(res, error);
  }
}

module.exports = { handleVideoRequestOptimized };