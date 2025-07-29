const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { videoMetadata } = require('../utils/videoTools');
const { CCTV } = require('../config/constants');
const { authenticate } = require('../utils/auth');
const ApiResponse = require('../utils/responseFormatter');

// Track downloads in progress to avoid multiple simultaneous downloads
const downloadsInProgress = new Set();

// Note: Using res.sendFile for cached videos - Express handles ranges automatically

// Middleware to handle video file requests with progressive streaming
async function handleVideoRequest(req, res) {
  const filename = req.params.filename;
  const cachePath = path.join(__dirname, '..', '..', 'static', 'cache', 'videos', filename);
  
  console.log(`📹 Video request: ${filename}`);
  
  // Check if file exists - serve with proper headers like legacy
  if (fs.existsSync(cachePath)) {
    console.log(`✅ Serving cached video: ${filename}`);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Handle Range requests manually for cached files
    const stat = fs.statSync(cachePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      console.log(`📡 Range request: ${range} for ${filename} (fileSize: ${fileSize})`);
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      if (isNaN(start) || start >= fileSize) {
        console.error(`❌ Invalid range start: ${start} >= ${fileSize}`);
        res.status(416).send('Range Not Satisfiable');
        return;
      }
      
      const actualEnd = Math.min(end, fileSize - 1);
      const chunkSize = (actualEnd - start) + 1;
      
      console.log(`📊 Serving range: ${start}-${actualEnd}/${fileSize} (${chunkSize} bytes)`);
      
      const file = fs.createReadStream(cachePath, { start, end: actualEnd });
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${actualEnd}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      file.pipe(res);
      return;
    }
    
    // No range request - send full file
    return res.sendFile(cachePath);
  }
  
  // Check if download is already in progress
  if (downloadsInProgress.has(filename)) {
    console.log(`⏳ Download in progress for ${filename}, waiting...`);
    // Wait for download to complete
    const maxWait = 30000; // 30 seconds
    const interval = 100; // Check every 100ms
    let waited = 0;
    
    const checkFile = () => {
      if (fs.existsSync(cachePath)) {
        console.log(`✅ Download completed for ${filename}, serving file`);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        
        // Handle Range requests for newly downloaded file
        const stat = fs.statSync(cachePath);
        const fileSize = stat.size;
        const range = req.headers.range;
        
        if (range) {
          console.log(`📡 Range request after download: ${range} for ${filename} (fileSize: ${fileSize})`);
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          
          if (isNaN(start) || start >= fileSize) {
            console.error(`❌ Invalid range start: ${start} >= ${fileSize}`);
            res.status(416).send('Range Not Satisfiable');
            return;
          }
          
          const actualEnd = Math.min(end, fileSize - 1);
          const chunkSize = (actualEnd - start) + 1;
          
          console.log(`📊 Serving range after download: ${start}-${actualEnd}/${fileSize} (${chunkSize} bytes)`);
          
          const file = fs.createReadStream(cachePath, { start, end: actualEnd });
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${actualEnd}/${fileSize}`);
          res.setHeader('Content-Length', chunkSize);
          file.pipe(res);
          return;
        }
        
        return res.sendFile(cachePath);
      }
      
      if (waited >= maxWait) {
        console.error(`⏰ Timeout waiting for download of ${filename}`);
        return ApiResponse.serviceUnavailable(res, 'Video download timeout');
      }
      
      waited += interval;
      setTimeout(checkFile, interval);
    };
    
    checkFile();
    return;
  }
  
  // Extract camera ID and timestamp from filename
  const match = filename.match(/cam(\d+)_(\d+)_([a-f0-9]+)\.mp4/);
  if (!match) {
    console.error(`❌ Invalid video filename format: ${filename}`);
    return ApiResponse.notFound(res, 'Video');
  }
  
  const cameraId = parseInt(match[1]);
  const timestamp = parseInt(match[2]);
  
  // Mark download as in progress
  downloadsInProgress.add(filename);
  console.log(`🚀 Starting download for ${filename}`);
  
  try {
    // Get authentication token and stream video directly
    console.log(`📡 Downloading video from CCTV server: ${filename}`);
    const token = await authenticate();
    
    // Try to get metadata first, but don't fail if it doesn't exist
    const metadata = videoMetadata.get(filename);
    let url, params;
    
    if (metadata) {
      // Use metadata if available
      console.log(`✅ Using cached metadata for ${filename}`);
      url = `${CCTV.baseUrl}/cgi-bin/filemanager/utilRequest.cgi`;
      params = new URLSearchParams({
        func: 'get_viewer',
        sid: token,
        source_path: metadata.path,
        source_file: metadata.filename
      });
    } else {
      // Fallback: find the video on CCTV server by searching through time folders
      console.log(`⚠️  No metadata for video: ${filename}, searching CCTV server`);
      
      if (!(cameraId in CCTV.cameras)) {
        console.error(`❌ Invalid camera ID: ${cameraId}`);
        return ApiResponse.notFound(res, 'Camera');
      }
      
      const cameraPath = CCTV.cameras[cameraId];
      const { formatDatePath } = require('../utils/cctvApi');
      const { listVideosInPath } = require('../utils/cctvApi');
      
      // Calculate date and hour from timestamp
      const { date, hour } = formatDatePath(timestamp);
      
      console.log(`🔍 Searching for video in camera ${cameraId} path: ${cameraPath}/${date}/${hour}`);
      
      let foundVideo = null;
      
      // Try multiple hours around the timestamp (±1 hour)
      for (let hourOffset = -1; hourOffset <= 1; hourOffset++) {
        const searchDate = new Date(timestamp * 1000);
        searchDate.setHours(searchDate.getHours() + hourOffset);
        const searchHour = String(searchDate.getHours()).padStart(2, '0');
        const searchDateStr = formatDatePath(Math.floor(searchDate.getTime() / 1000)).date;
        
        // Try normal folder first, then D folder
        for (const folderSuffix of ['', 'D']) {
          const datePath = `${searchDateStr}/${searchHour}${folderSuffix}`;
          console.log(`🔍 Searching in ${datePath}`);
          
          const result = await listVideosInPath(cameraPath, datePath, token, cameraId);
          
          if (result.videos.length > 0) {
            // Look for the exact video by timestamp
            foundVideo = result.videos.find(v => Math.abs(v.timestamp - timestamp) < 60); // Within 1 minute
            if (foundVideo) {
              console.log(`✅ Found video: ${foundVideo.filename} in ${datePath}`);
              break;
            }
          }
        }
        
        if (foundVideo) break;
      }
      
      if (!foundVideo) {
        console.error(`❌ Video not found on CCTV server: ${filename}`);
        return ApiResponse.notFound(res, 'Video not found on CCTV server');
      }
      
      // Use found video metadata
      url = `${CCTV.baseUrl}/cgi-bin/filemanager/utilRequest.cgi`;
      params = new URLSearchParams({
        func: 'get_viewer',
        sid: token,
        source_path: foundVideo.path,
        source_file: foundVideo.filename
      });
      
      // Cache the metadata for future requests
      videoMetadata.set(filename, foundVideo);
    }
    
    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      console.error(`❌ Failed to stream video: ${response.status} ${response.statusText}`);
      return ApiResponse.serviceUnavailable(res, 'Video streaming service', `HTTP ${response.status}`);
    }
    
    // Set headers for video streaming - Safari needs Content-Length
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    // Download completely first, then serve with full Range support
    console.log(`📡 Downloading video completely first: ${filename}`);
    
    // Create write stream for caching (direct to final location)
    const cacheStream = fs.createWriteStream(cachePath);
    
    // Handle cache write errors
    cacheStream.on('error', (cacheError) => {
      console.error(`⚠️  Cache write failed for ${filename}:`, cacheError.message);
      downloadsInProgress.delete(filename);
      // Clean up partial file on error
      fs.unlink(cachePath, () => {});
      return ApiResponse.internalError(res, 'Download failed');
    });
    
    cacheStream.on('finish', () => {
      console.log(`💾 Video download completed: ${filename}`);
      downloadsInProgress.delete(filename);
      
      // Now serve the complete file with proper Range support
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      
      const stat = fs.statSync(cachePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      
      if (range) {
        console.log(`📡 Serving Range request: ${range} for ${filename} (fileSize: ${fileSize})`);
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        if (isNaN(start) || start >= fileSize) {
          console.error(`❌ Invalid range start: ${start} >= ${fileSize}`);
          res.status(416).send('Range Not Satisfiable');
          return;
        }
        
        const actualEnd = Math.min(end, fileSize - 1);
        const chunkSize = (actualEnd - start) + 1;
        
        console.log(`📊 Serving range: ${start}-${actualEnd}/${fileSize} (${chunkSize} bytes)`);
        
        const file = fs.createReadStream(cachePath, { start, end: actualEnd });
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${actualEnd}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize);
        file.pipe(res);
      } else {
        // No range request - send full file
        res.sendFile(cachePath);
      }
    });
    
    // Download to cache first (don't serve to client yet)
    response.body.pipe(cacheStream);
    
    console.log(`⏳ Downloading ${filename} - will serve when complete`);
    
  } catch (error) {
    console.error(`💥 Error handling video request:`, error);
    downloadsInProgress.delete(filename);
    return ApiResponse.internalError(res, error);
  }
}

module.exports = { handleVideoRequest };