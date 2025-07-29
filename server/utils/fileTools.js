const fs = require('fs');
const path = require('path');
const { CACHE } = require('../config/constants');

// Get directory size in bytes
async function getDirectorySize(dirPath) {
  try {
    const files = await fs.promises.readdir(dirPath);
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.promises.stat(filePath);
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.warn('⚠️ Error calculating directory size:', error.message);
    return 0;
  }
}

// Clean old cache files to stay under limit
async function cleanupCache() {
  const cacheDir = path.join(__dirname, '..', '..', 'static', 'cache', 'videos');
  
  try {
    // Ensure cache directory exists
    await fs.promises.mkdir(cacheDir, { recursive: true });
    
    const currentSize = await getDirectorySize(cacheDir);
    const sizeMB = Math.round(currentSize / (1024 * 1024));
    
    console.log(`🗑️ Cache size check: ${sizeMB}MB / ${Math.round(CACHE.maxSizeBytes / (1024 * 1024))}MB`);
    
    if (currentSize <= CACHE.cleanupThresholdBytes) {
      return; // Under threshold, no cleanup needed
    }
    
    console.log(`🧹 Cache cleanup needed - current size: ${sizeMB}MB`);
    
    // Get all cache files with their stats
    const files = await fs.promises.readdir(cacheDir);
    const fileStats = [];
    
    for (const file of files) {
      if (file.endsWith('.mp4')) {
        const filePath = path.join(cacheDir, file);
        try {
          const stats = await fs.promises.stat(filePath);
          fileStats.push({
            name: file,
            path: filePath,
            size: stats.size,
            mtime: stats.mtime,
            age: Date.now() - stats.mtime.getTime()
          });
        } catch (error) {
          console.warn(`⚠️ Error getting stats for ${file}:`, error.message);
        }
      }
    }
    
    // Sort by age (oldest first)
    fileStats.sort((a, b) => b.age - a.age);
    
    let cleanedSize = 0;
    let filesRemoved = 0;
    const targetSize = CACHE.maxSizeBytes * 0.7; // Clean down to 70% of limit
    
    for (const file of fileStats) {
      if (currentSize - cleanedSize <= targetSize) {
        break; // Reached target size
      }
      
      try {
        await fs.promises.unlink(file.path);
        cleanedSize += file.size;
        filesRemoved++;
        
        const ageDays = Math.round(file.age / (1000 * 60 * 60 * 24));
        console.log(`🗑️ Removed: ${file.name} (${Math.round(file.size / (1024 * 1024))}MB, ${ageDays} days old)`);
      } catch (error) {
        console.warn(`⚠️ Error removing ${file.name}:`, error.message);
      }
    }
    
    const newSize = currentSize - cleanedSize;
    const newSizeMB = Math.round(newSize / (1024 * 1024));
    const cleanedMB = Math.round(cleanedSize / (1024 * 1024));
    
    console.log(`✅ Cache cleanup complete: removed ${filesRemoved} files (${cleanedMB}MB), new size: ${newSizeMB}MB`);
    
  } catch (error) {
    console.error('❌ Cache cleanup failed:', error);
  }
}

// Clear entire cache
function clearCache(req, res) {
  const cacheDir = path.join(__dirname, '..', '..', 'static', 'cache', 'videos');
  
  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      let filesRemoved = 0;
      let sizeRemoved = 0;
      
      files.forEach(file => {
        const filePath = path.join(cacheDir, file);
        if (fs.statSync(filePath).isFile() && file.endsWith('.mp4')) {
          const size = fs.statSync(filePath).size;
          fs.unlinkSync(filePath);
          filesRemoved++;
          sizeRemoved += size;
        }
      });
      
      const sizeMB = Math.round(sizeRemoved / (1024 * 1024));
      console.log(`🗑️ Cache cleared: ${filesRemoved} files (${sizeMB}MB) removed`);
      
      res.json({ 
        success: true, 
        message: `Cache cleared: ${filesRemoved} files (${sizeMB}MB) removed` 
      });
    } else {
      res.json({ success: true, message: 'Cache directory does not exist' });
    }
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
}

// Start periodic cache cleanup
function startCacheCleanup() {
  console.log('🗑️ Starting cache cleanup system...');
  
  // Start periodic cleanup
  setInterval(cleanupCache, CACHE.checkIntervalMs);
  
  // Initial cleanup on server start (wait 10s for server to be ready)
  setTimeout(cleanupCache, 10000);
}

module.exports = {
  getDirectorySize,
  cleanupCache,
  clearCache,
  startCacheCleanup
};