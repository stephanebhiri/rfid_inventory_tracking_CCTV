const compression = require('compression');

module.exports = compression({
  filter: (req, res) => {
    // Don't compress video files - they're already compressed
    if (req.url.includes('/static/cache/videos/')) {
      return false;
    }
    
    // Don't compress if client requests no compression
    if (req.headers['x-no-compression']) {
      return false;
    }
    
    return compression.filter(req, res);
  },
  
  // Compression level (1-9, 6 is default)
  level: 6,
  
  // Only compress if response is larger than this
  threshold: 1024 // 1KB
});