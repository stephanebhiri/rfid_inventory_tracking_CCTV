const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { videoMetadata } = require('../utils/videoTools');
const { CCTV } = require('../config/constants');
const { authenticate } = require('../utils/auth');
const ApiResponse = require('../utils/responseFormatter');

// Promise-based download tracking - single source of truth
const downloadPromises = new Map(); // filename -> {promise, resolve, reject}
const { pipeline } = require('stream/promises');

// Helper to create deferred Promise
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Helper to serve video from cache with Range support
function serveFromCache(req, res, filename, cachePath) {
  if (!fs.existsSync(cachePath)) {
    console.error(`❌ Cache file not found: ${filename}`);
    return ApiResponse.notFound(res, 'Video');
  }

  console.log(`✅ Serving cached video: ${filename}`);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  
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

// Download semaphore to limit concurrent CCTV server requests
class DownloadSemaphore {
  constructor(maxConcurrent = 8) {
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.waiting = [];
  }

  async acquire() {
    if (this.current < this.maxConcurrent) {
      this.current++;
      console.log(`🔒 Download slot acquired (${this.current}/${this.maxConcurrent})`);
      return;
    }
    
    console.log(`⏳ Waiting for download slot (${this.current}/${this.maxConcurrent}, ${this.waiting.length} queued)`);
    await new Promise(resolve => this.waiting.push(resolve));
    this.current++;
    console.log(`🔒 Download slot acquired after wait (${this.current}/${this.maxConcurrent})`);
  }

  release() {
    this.current--;
    console.log(`🔓 Download slot released (${this.current}/${this.maxConcurrent})`);
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next();
    }
  }
}

const downloadSemaphore = new DownloadSemaphore(8);

// Note: Using res.sendFile for cached videos - Express handles ranges automatically

// Middleware to handle video file requests with progressive streaming
async function handleVideoRequest(req, res) {
  const filename = req.params.filename;
  
  // (1) Valider le nom avant tout accès disque (évite traversal)
  if (!/^cam\d+_\d+_[a-f0-9]+\.mp4$/i.test(filename)) {
    return ApiResponse.notFound(res, 'Video');
  }
  
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
  
  // (3) Si un téléchargement identique est déjà en cours, attendre la même promesse
  const existing = downloadPromises.get(filename);
  if (existing) {
    await existing.promise;
    return res.sendFile(cachePath);
  }
  
  // (4) Enregistrer la promesse AVANT tout await (source of truth)
  let resolveDl, rejectDl;
  const inFlight = new Promise((res, rej) => (resolveDl = res, rejectDl = rej));
  downloadPromises.set(filename, { promise: inFlight, resolve: resolveDl, reject: rejectDl });
  
  // (5) Slot de téléchargement
  await downloadSemaphore.acquire();
  
  try {
    // Extract camera ID and timestamp from filename
    const match = filename.match(/cam(\d+)_(\d+)_([a-f0-9]+)\.mp4/);
    const cameraId = parseInt(match[1]);
    const timestamp = parseInt(match[2]);
    
    console.log(`🚀 Starting download for ${filename}`);
    
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
        throw new Error('Invalid camera ID');
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
        throw new Error('Video not found on CCTV server');
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
    
    // (6) Annuler si le client coupe
    const ac = new AbortController();
    req.on('close', () => ac.abort());
    
    const response = await fetch(`${url}?${params}`, { signal: ac.signal });
    if (!response.ok) {
      console.error(`❌ Failed to stream video: ${response.status} ${response.statusText}`);
      rejectDl(new Error(`Failed to stream video: ${response.status}`));
      downloadPromises.delete(filename);
      return ApiResponse.serviceUnavailable(res, 'Video streaming service', `HTTP ${response.status}`);
    }
    
    // (7) Écriture atomique + pipeline
    console.log(`📡 Downloading video using pipeline: ${filename}`);
    const fsp = require('fs/promises');
    const { Readable } = require('node:stream');
    const tmp = cachePath + '.part';
    
    // Compatibilité infaillible : Web Stream → Node Stream si nécessaire
    const nodeStream = response.body?.getReader ? Readable.fromWeb(response.body) : response.body;
    await pipeline(nodeStream, fs.createWriteStream(tmp));
    await fsp.rename(tmp, cachePath);
    
    console.log(`💾 Video download completed: ${filename}`);
    
    resolveDl();
    downloadPromises.delete(filename);
    return res.sendFile(cachePath);
    
  } catch (error) {
    console.error(`💥 Error handling video request:`, error);
    
    rejectDl(error);
    downloadPromises.delete(filename);
    
    // Clean up .part file if it exists
    const tmpPath = cachePath + '.part';
    fs.unlink(tmpPath, () => {}); // ignore errors
    
    return ApiResponse.internalError(res, error);
  } finally {
    // Always release semaphore
    downloadSemaphore.release();
  }
}

module.exports = { handleVideoRequest };