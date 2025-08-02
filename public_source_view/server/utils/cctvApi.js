const fetch = require('node-fetch');
const { DOMParser } = require('xmldom');
const { CCTV } = require('../config/constants');
const { authenticate } = require('./auth');
const { utcToLocalDate, localDateToUTC } = require('./timezoneUtils');

// Helper function to format date path
// Converts UTC timestamp to local CEST/CET time for CCTV server paths
function formatDatePath(timestamp) {
  const date = utcToLocalDate(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  
  return {
    date: `${year}-${month}-${day}`,
    hour
  };
}

// Helper function to extract timestamp from filename
function extractTimestampFromFilename(filename) {
  console.log(`🔍 Extracting timestamp from filename: ${filename}`);
  
  // Try multiple patterns
  const patterns = [
    /(\d{8})_(\d{6})/,  // 20250715_081000
    /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/,  // 2025-07-15_08-10-00
    /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,  // 20250715_081000
    /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/   // 20250715081000
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      let year, month, day, hour, minute, second;
      
      if (match.length === 3) {
        // Pattern: YYYYMMDD_HHMMSS
        const dateStr = match[1];
        const timeStr = match[2];
        
        year = parseInt(dateStr.substr(0, 4));
        month = parseInt(dateStr.substr(4, 2)) - 1;
        day = parseInt(dateStr.substr(6, 2));
        hour = parseInt(timeStr.substr(0, 2));
        minute = parseInt(timeStr.substr(2, 2));
        second = parseInt(timeStr.substr(4, 2));
      } else if (match.length === 7) {
        // Pattern: YYYY-MM-DD_HH-MM-SS or YYYYMMDD_HHMMSS
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
        hour = parseInt(match[4]);
        minute = parseInt(match[5]);
        second = parseInt(match[6]);
      }
      
      // Convert local CCTV filename time to UTC timestamp
      const timestamp = localDateToUTC(year, month, day, hour, minute, second);
      const localDate = new Date(year, month, day, hour, minute, second);
      
      console.log(`✅ Extracted timestamp: ${timestamp} UTC (local: ${localDate.toISOString()}) from ${filename}`);
      return timestamp;
    }
  }
  
  console.log(`❌ Could not extract timestamp from: ${filename}`);
  return 0;
}

// Helper function to list videos in a path with camera availability checking
async function listVideosInPath(cameraPath, datePath, token, cameraId = null) {
  try {
    const url = `${CCTV.baseUrl}/cgi-bin/filemanager/utilRequest.cgi`;
    const params = new URLSearchParams({
      func: 'get_list',
      sid: token,
      is_iso: '0',
      list_mode: 'all',
      path: `${cameraPath}/${datePath}/`,
      hidden_file: '0',
      dir: 'ASC',
      limit: '200',
      sort: 'filename',
      start: '0'
    });

    console.log(`🔍 Checking path: ${cameraPath}/${datePath}/`);
    console.log(`📡 Request URL: ${url}?${params}`);
    
    const response = await fetch(`${url}?${params}`, {
      timeout: 10000 // 10 second timeout per camera
    });
    
    if (!response.ok) {
      console.error(`❌ Camera ${cameraId || 'unknown'} HTTP error: ${response.status} ${response.statusText}`);
      return { videos: [], cameraAvailable: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    console.log(`📊 Response for ${datePath}:`, {
      success: data.success,
      has_datas: data.has_datas,
      dataCount: data.datas ? data.datas.length : 0
    });
    
    // IMPORTANT: Check for folder D rule
    // Normal folders return success=true, has_datas=false when empty
    // D folders return success=null/undefined, has_datas=true when they have data
    // BUT we also need to check if there are actual files (dataCount > 0)
    
    if (data.success === false) {
      console.log(`❌ Path ${datePath} failed (success=false)`);
      return { videos: [], cameraAvailable: true, error: 'Path not found' };
    }
    
    // Check if folder has data - either has_datas is true OR there are actual files
    const hasData = data.has_datas || (data.datas && data.datas.length > 0);
    
    if (!hasData) {
      console.log(`⚠️  Path ${datePath} has no videos (success=${data.success}, has_datas=${data.has_datas}, fileCount=${data.datas?.length || 0})`);
      return { videos: [], cameraAvailable: true, error: 'No videos in this time period' };
    }

    const videos = [];
    
    if (data.datas && Array.isArray(data.datas)) {
      console.log(`📁 Found ${data.datas.length} items in ${datePath}`);
      for (const item of data.datas) {
        if (item.filename && item.filename.endsWith('.mp4')) {
          const timestamp = extractTimestampFromFilename(item.filename);
          console.log(`🎬 Video file: ${item.filename} -> timestamp: ${timestamp}`);
          if (timestamp > 0) {
            videos.push({
              filename: item.filename,
              timestamp,
              path: `${cameraPath}/${datePath}`
            });
          }
        }
      }
    }

    console.log(`✅ Found ${videos.length} valid videos in ${datePath}`);
    return { 
      videos: videos.sort((a, b) => a.timestamp - b.timestamp), 
      cameraAvailable: true, 
      error: null 
    };
  } catch (error) {
    console.error(`💥 Camera ${cameraId || 'unknown'} failed to list videos in path ${datePath}:`, error);
    return { 
      videos: [], 
      cameraAvailable: false, 
      error: error.message || 'Camera connection failed' 
    };
  }
}

module.exports = {
  formatDatePath,
  extractTimestampFromFilename,
  listVideosInPath
};