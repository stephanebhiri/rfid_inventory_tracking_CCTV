const fs = require('fs');
const path = require('path');
// Polyfill fetch pour compatibilité Node <18
// Note: Pour Node <18, assurez-vous d'utiliser node-fetch@2 (CJS) car v3 est ESM-only
const fetchFn = globalThis.fetch || require('node-fetch');
const { videoMetadata } = require('../utils/videoTools');
const { CCTV } = require('../config/constants');
const { authenticate } = require('../utils/auth');
const ApiResponse = require('../utils/responseFormatter');

// Import des métriques pour l'observabilité
const { metrics } = require('../metrics');

// Promise-based download tracking - single source of truth
const downloadPromises = new Map(); // filename -> {promise, resolve, reject}
const { pipeline } = require('stream/promises');


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
  
  // (2) Protection path traversal additionnelle
  const root = path.resolve(path.join(__dirname, '..', '..', 'static', 'cache', 'videos'));
  const abs = path.resolve(cachePath);
  if (!abs.startsWith(root + path.sep)) return ApiResponse.notFound(res, 'Video');
  // Métriques: incrémenter les requêtes concurrentes
  metrics.cctvConcurrentRequests.inc();
  const requestStart = Date.now();
  
  // Log structuré: requête vidéo reçue
  const logger = req.log || console;
  logger.info({ filename, requestId: req.id }, 'Video request received');
  
  // Try serving from cache first - let sendFile handle existence check and Content-Type
  return res.sendFile(cachePath, (err) => {
    // Cleanup: décrémenter les requêtes concurrentes à la fin
    metrics.cctvConcurrentRequests.dec();
    
    if (!err) {
      // Cache HIT - métriques & logs
      metrics.cctvCacheHits.inc();
      metrics.videoRequestDuration.labels('hit').observe((Date.now() - requestStart) / 1000);
      logger.info({ filename, duration: Date.now() - requestStart }, 'Cache hit - video served successfully');
      return; // File served successfully
    }
    
    if (err.code && err.code !== 'ENOENT') {
      logger.error({ filename, error: err.message, code: err.code }, 'SendFile error');
      return ApiResponse.internalError(res, 'File send error');
    }
    
    // Cache MISS - métriques & logs
    metrics.cctvCacheMisses.inc();
    logger.info({ filename }, 'Cache miss - starting download');
    
    // Re-incrémenter car handleVideoDownload va gérer sa propre durée
    metrics.cctvConcurrentRequests.inc();
    
    handleVideoDownload(req, res, filename, cachePath).catch(e => {
      metrics.cctvConcurrentRequests.dec();
      logger.error({ filename, error: e.message }, 'Download failed');
      if (!res.headersSent) ApiResponse.internalError(res, e);
    });
  });
}

// Separated download logic to avoid nested function complexity
async function handleVideoDownload(req, res, filename, cachePath) {
  const logger = req.log || console;
  const requestStart = Date.now();
  
  // (3) Si un téléchargement identique est déjà en cours, attendre la même promesse
  const existing = downloadPromises.get(filename);
  if (existing) {
    logger.info({ filename }, 'Waiting for existing download to complete');
    try {
      await existing.promise;
      metrics.videoRequestDuration.labels('miss').observe((Date.now() - requestStart) / 1000);
      logger.info({ filename }, 'Existing download completed, serving from cache');
      return res.sendFile(cachePath, err => {
        if (err) {
          logger.error({ filename, error: err.message }, 'Error serving file after wait');
          return ApiResponse.notFound(res, 'Video');
        }
      });
    } catch (e) {
      if (e?.code === 'VIDEO_NOT_FOUND') {
        logger.warn({ filename, errorCode: e.code }, 'Video not found on CCTV server');
        return ApiResponse.notFound(res, 'Video not found on CCTV server');
      }
      if (e?.code === 'INVALID_CAMERA') {
        logger.warn({ filename, errorCode: e.code }, 'Invalid camera ID');
        return ApiResponse.notFound(res, 'Camera');
      }
      if (e?.name !== 'AbortError') {
        logger.error({ filename, error: e.message }, 'Video download failed while waiting');
        return ApiResponse.serviceUnavailable(res, 'Video download failed');
      }
      // e.name === 'AbortError' ➜ le 1er client est parti : on NE renvoie pas ici,
      // on retombe dans le flux normal pour lancer un nouveau téléchargement.
      logger.info({ filename }, 'Previous download aborted, retrying');
    }
  }
  
  // (4) Enregistrer la promesse AVANT tout await (source of truth)
  let resolveDl, rejectDl;
  const inFlight = new Promise((res, rej) => (resolveDl = res, rejectDl = rej));
  downloadPromises.set(filename, { promise: inFlight, resolve: resolveDl, reject: rejectDl });
  
  // (5) Slot de téléchargement
  await downloadSemaphore.acquire();
  
  let ac, onClose; // Déclaration hors du try pour accès dans catch et finally
  try {
    // Extract camera ID and timestamp from filename
    const match = filename.match(/cam(\d+)_(\d+)_([a-f0-9]+)\.mp4/);
    const cameraId = parseInt(match[1]);
    const timestamp = parseInt(match[2]);
    
    // Log structuré: début de téléchargement
    logger.info({ 
      filename, 
      cameraId, 
      timestamp,
      requestId: req.id 
    }, 'Starting CCTV video download');
    
    // Get authentication token and stream video directly
    const token = await authenticate();
    
    // Try to get metadata first, but don't fail if it doesn't exist
    const metadata = videoMetadata.get(filename);
    let url, params;
    
    if (metadata) {
      // Use metadata if available
      logger.info({ filename, metadataPath: metadata.path }, 'Using cached metadata for video');
      url = `${CCTV.baseUrl}/cgi-bin/filemanager/utilRequest.cgi`;
      params = new URLSearchParams({
        func: 'get_viewer',
        sid: token,
        source_path: metadata.path,
        source_file: metadata.filename
      });
    } else {
      // Fallback: find the video on CCTV server by searching through time folders
      logger.warn({ filename, cameraId }, 'No cached metadata, searching CCTV server');
      
      if (!(cameraId in CCTV.cameras)) {
        logger.error({ filename, cameraId, availableCameras: Object.keys(CCTV.cameras) }, 'Invalid camera ID');
        metrics.cctvDownloadErrors.labels('INVALID_CAMERA').inc();
        const errCam = Object.assign(new Error('Invalid camera ID'), { code: 'INVALID_CAMERA' });
        rejectDl(errCam);
        downloadPromises.delete(filename);
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
          logger.debug({ filename, datePath, hourOffset }, 'Searching in CCTV path');
          
          const result = await listVideosInPath(cameraPath, datePath, token, cameraId);
          
          if (result.videos.length > 0) {
            // Look for the exact video by timestamp
            foundVideo = result.videos.find(v => Math.abs(v.timestamp - timestamp) < 60); // Within 1 minute
            if (foundVideo) {
              logger.info({ 
                filename, 
                foundFilename: foundVideo.filename, 
                datePath, 
                timestampDiff: Math.abs(foundVideo.timestamp - timestamp) 
              }, 'Found video on CCTV server');
              break;
            }
          }
        }
        
        if (foundVideo) break;
      }
      
      if (!foundVideo) {
        logger.warn({ filename, cameraId, timestamp, searchedHours: 3 }, 'Video not found on CCTV server after search');
        metrics.cctvDownloadErrors.labels('VIDEO_NOT_FOUND').inc();
        const errNF = Object.assign(new Error('Video not found on CCTV server'), { code: 'VIDEO_NOT_FOUND' });
        rejectDl(errNF);
        downloadPromises.delete(filename);
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
    
    // (6) Annuler si le client coupe
    ac = new AbortController();
    onClose = () => ac.abort();
    req.on('close', onClose);
    
    // Propager x-request-id vers serveur CCTV si possible
    const headers = {};
    if (req.id) {
      headers['X-Request-ID'] = req.id;
      headers['X-Source'] = 'rfid-inventory';
    }
    
    const response = await fetchFn(`${url}?${params}`, { 
      signal: ac.signal,
      headers 
    });
    
    if (!response.ok) {
      logger.error({ 
        filename, 
        status: response.status, 
        statusText: response.statusText,
        url 
      }, 'Failed to fetch video from CCTV server');
      metrics.cctvDownloadErrors.labels('UPSTREAM_ERROR').inc();
      const err = new Error(`Failed to stream video: ${response.status}`);
      err.code = 'UPSTREAM_ERROR';
      rejectDl(err);
      downloadPromises.delete(filename);
      return ApiResponse.serviceUnavailable(res, 'Video streaming service', `HTTP ${response.status}`);
    }
    
    // *** MÉTRIQUES CRITIQUES: début de téléchargement ***
    metrics.cctvDownloadsInProgress.inc();
    const downloadTimer = metrics.cctvDownloadDuration.startTimer();
    
    // (7) Écriture atomique + pipeline
    logger.info({ filename, contentLength: response.headers.get('content-length') }, 'Starting video pipeline download');
    const fsp = require('fs/promises');
    const { Readable } = require('node:stream');
    const tmp = cachePath + '.part';
    
    // Détection de type de stream pour compatibilité fetch natif/node-fetch
    const nodeStream = (typeof response.body?.getReader === 'function')
      ? Readable.fromWeb(response.body) // Web Stream (fetch natif / node-fetch v3)
      : response.body;                   // Node stream (node-fetch v2)
    // Créer le dossier parent si nécessaire
    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    
    await pipeline(nodeStream, fs.createWriteStream(tmp));
    await fsp.rename(tmp, cachePath);
    
    // *** MÉTRIQUES CRITIQUES: fin de téléchargement ***
    downloadTimer(); // Arrêter le timer
    
    const duration = Date.now() - requestStart;
    logger.info({ 
      filename, 
      duration, 
      cacheSize: (await fsp.stat(cachePath)).size,
      requestId: req.id 
    }, 'Video download completed successfully');
    
    metrics.videoRequestDuration.labels('miss').observe(duration / 1000);
    
    resolveDl();
    downloadPromises.delete(filename);
    return res.sendFile(cachePath);
    
  } catch (error) {
    logger.error({ 
      filename, 
      error: error.message, 
      stack: error.stack,
      aborted: ac?.signal?.aborted 
    }, 'Error during video download');
    
    // Si le client est parti (abort), pas besoin de répondre
    if (ac?.signal?.aborted) {
      logger.info({ filename }, 'Client aborted request, cleaning up');
      metrics.cctvDownloadErrors.labels('ABORT').inc();
      rejectDl(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      downloadPromises.delete(filename);
      // Clean up .part file if it exists
      const tmpPath = cachePath + '.part';
      fs.unlink(tmpPath, () => {}); // ignore errors
      return; // client parti, inutile de répondre
    }
    
    // Erreur générique
    metrics.cctvDownloadErrors.labels('UNKNOWN').inc();
    rejectDl(error);
    downloadPromises.delete(filename);
    
    // Clean up .part file if it exists
    const tmpPath = cachePath + '.part';
    fs.unlink(tmpPath, () => {}); // ignore errors
    
    return ApiResponse.internalError(res, error);
  } finally {
    // *** MÉTRIQUES: toujours décrémenter downloads in progress ***
    metrics.cctvDownloadsInProgress.dec();
    // Décrémenter aussi les requêtes concurrentes
    metrics.cctvConcurrentRequests.dec();
    
    // Nettoyage systématique du listener
    req.off?.('close', onClose);
    // Always release semaphore
    downloadSemaphore.release();
  }
}

module.exports = { handleVideoRequest };