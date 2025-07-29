const client = require('prom-client');

// Configuration de base des métriques Prometheus
const collectDefaultMetrics = client.collectDefaultMetrics;
const Registry = client.Registry;
const register = new Registry();

// Collecter les métriques système par défaut
collectDefaultMetrics({
  register,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Buckets pour GC
  eventLoopMonitoringPrecision: 10, // Précision monitoring event loop
});

// === MÉTRIQUES SPÉCIFIQUES CCTV ===

// Gauge: Nombre de téléchargements CCTV en cours
const cctvDownloadsInProgress = new client.Gauge({
  name: 'cctv_downloads_in_progress',
  help: 'Number of CCTV video downloads currently in progress',
  registers: [register]
});

// Histogram: Durée des téléchargements CCTV
const cctvDownloadDuration = new client.Histogram({
  name: 'cctv_download_duration_seconds',
  help: 'Duration of CCTV video downloads in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60], // Buckets pour videos
  registers: [register]
});

// Counter: Nombre d'erreurs de téléchargement par type
const cctvDownloadErrors = new client.Counter({
  name: 'cctv_download_errors_total',
  help: 'Total number of CCTV download errors by type',
  labelNames: ['type'], // INVALID_CAMERA, VIDEO_NOT_FOUND, UPSTREAM_ERROR, ABORT, UNKNOWN
  registers: [register]
});

// Counter: Succès/échecs cache CCTV
const cctvCacheHits = new client.Counter({
  name: 'cctv_cache_hits_total',
  help: 'Total number of CCTV video cache hits',
  registers: [register]
});

const cctvCacheMisses = new client.Counter({
  name: 'cctv_cache_misses_total', 
  help: 'Total number of CCTV video cache misses',
  registers: [register]
});

// Gauge: Requêtes concurrentes dans le middleware video
const cctvConcurrentRequests = new client.Gauge({
  name: 'cctv_concurrent_requests',
  help: 'Number of concurrent requests being processed in video middleware',
  registers: [register]
});

// Histogram: Durée end-to-end des requêtes vidéo
const videoRequestDuration = new client.Histogram({
  name: 'video_request_duration_seconds',
  help: 'End-to-end duration of video requests in seconds',
  buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10, 30],
  labelNames: ['cache_status'], // hit, miss
  registers: [register]
});

// Export des métriques et du registre
module.exports = {
  register,
  metrics: {
    cctvDownloadsInProgress,
    cctvDownloadDuration,
    cctvDownloadErrors,
    cctvCacheHits,
    cctvCacheMisses,
    cctvConcurrentRequests,
    videoRequestDuration
  }
};