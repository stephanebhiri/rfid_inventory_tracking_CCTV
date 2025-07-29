const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');
const { CCTV } = require('../config/constants');
const { authenticate } = require('./auth');
const { formatDatePath, listVideosInPath } = require('./cctvApi');
const { getDirectorySize, cleanupCache } = require('./fileTools');
const { utcToLocalDate } = require('./timezoneUtils');

// Store video metadata for on-demand downloads with LRU cache
const videoMetadata = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 hour
  updateAgeOnGet: true
});

// Helper function to create cache filename
function createCacheFilename(video, cameraId) {
  const hash = Math.abs(hashString(video.filename)).toString(16);
  return `cam${cameraId}_${video.timestamp}_${hash}.mp4`;
}

// Simple hash function
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

// Main function to get videos for a camera and timestamp
async function getVideosForCamera(targetTimestamp, cameraId) {
  console.log(`🎯 Getting videos for camera ${cameraId}, target: ${targetTimestamp}`);
  console.log(`📅 Target timestamp: ${targetTimestamp} (${new Date(targetTimestamp * 1000).toISOString()})`);
  
  if (!(cameraId in CCTV.cameras)) {
    throw new Error('Invalid camera ID');
  }

  const token = await authenticate();
  console.log(`🔐 Auth token: ${token ? 'OK' : 'FAILED'}`);
  
  const cameraPath = CCTV.cameras[cameraId];
  console.log(`📹 Camera path: ${cameraPath}`);
  
  let allVideos = [];
  let cameraAvailable = true;
  let cameraError = null;

  // Try multiple hours around the target (using local time)
  for (let hourOffset = -1; hourOffset <= 1; hourOffset++) {
    const testDate = utcToLocalDate(targetTimestamp);
    testDate.setHours(testDate.getHours() + hourOffset);
    const testHour = String(testDate.getHours()).padStart(2, '0');
    const testDateStr = formatDatePath(targetTimestamp + (hourOffset * 3600)).date;

    console.log(`⏰ Testing hour offset ${hourOffset}: ${testDateStr}/${testHour}`);

    // Try normal folder first, then D folder (CRITICAL: Folder D rule)
    for (const folderSuffix of ['', 'D']) {
      const datePath = `${testDateStr}/${testHour}${folderSuffix}`;
      console.log(`📂 Trying ${folderSuffix ? 'D folder' : 'normal folder'}: ${datePath}`);
      
      const result = await listVideosInPath(cameraPath, datePath, token, cameraId);
      
      // Track camera availability
      if (!result.cameraAvailable) {
        cameraAvailable = false;
        cameraError = result.error;
        console.log(`❌ Camera ${cameraId} unavailable: ${result.error}`);
      }
      
      allVideos = allVideos.concat(result.videos);
      
      if (result.videos.length > 0) {
        console.log(`✅ Found ${result.videos.length} videos in ${datePath}, stopping search for this hour`);
        break; // Stop trying D folder if normal folder has videos
      }
    }
  }

  // Remove duplicates and sort by timestamp
  const uniqueVideos = allVideos.filter((video, index, self) => 
    index === self.findIndex(v => v.filename === video.filename)
  ).sort((a, b) => a.timestamp - b.timestamp);

  return {
    videos: uniqueVideos,
    cameraAvailable,
    cameraError
  };
}

// Build video response in the required format
function buildVideoResponse(uniqueVideos, targetTimestamp, cameraId, cameraAvailable, cameraError) {
  const videos = {};
  const timestamps = {};

  // Handle camera unavailable case
  if (!cameraAvailable || uniqueVideos.length === 0) {
    console.log(`❌ Camera ${cameraId} unavailable or no videos found, using fallback video`);
    
    // Provide fallback video for unavailable camera
    videos['0'] = '/static/videos/videoerror.mp4';
    timestamps['0'] = targetTimestamp;
    
    return [
      videos,
      0, // closestIndex
      0, // offsetSeconds
      cameraId,
      timestamps,
      {
        cameraAvailable: false,
        cameraError: cameraError || 'No videos found for this time period',
        videoCount: 0
      }
    ];
  }

  // Find closest video to target timestamp
  let closestIndex = 0;
  let minDiff = Math.abs(uniqueVideos[0]?.timestamp - targetTimestamp) || Infinity;

  uniqueVideos.forEach((video, index) => {
    const diff = Math.abs(video.timestamp - targetTimestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = index;
    }
  });

  // Set up all video metadata immediately - return ALL videos like legacy system
  for (let i = 0; i < uniqueVideos.length; i++) {
    const video = uniqueVideos[i];
    const cacheFilename = createCacheFilename(video, cameraId);
    const cacheUrl = `/static/cache/videos/${cacheFilename}`;
    
    videos[i.toString()] = cacheUrl;
    timestamps[i.toString()] = video.timestamp;
    
    // Store video metadata for on-demand downloads
    videoMetadata.set(cacheFilename, video);
  }

  console.log(`🎯 API responding immediately with ${uniqueVideos.length} video metadata entries`);
  console.log(`📡 All videos will be downloaded on-demand when requested`);

  const offsetSeconds = uniqueVideos[closestIndex] 
    ? uniqueVideos[closestIndex].timestamp - targetTimestamp 
    : 0;

  return [
    videos,
    closestIndex,
    offsetSeconds,
    cameraId,
    timestamps,
    {
      cameraAvailable: cameraAvailable,
      cameraError: cameraError,
      videoCount: uniqueVideos.length
    }
  ];
}

module.exports = {
  videoMetadata,
  createCacheFilename,
  hashString,
  getVideosForCamera,
  buildVideoResponse
};