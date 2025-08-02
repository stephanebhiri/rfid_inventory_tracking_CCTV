import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { CCTVService } from '../services/CCTVService';
import { formatLocalDateTime, formatLocalTime } from '../utils/timezone';
// CCTV styles are now included in the main design system

interface SimpleMultiCameraViewProps {
  targetTimestamp: number;
  onError?: (error: string) => void;
  isSearching?: boolean;
  itemName?: string;
  onClose?: () => void;
}

interface VideoClip {
  url: string;
  startTime: number;
  duration: number;
  timestamp: number; // Original timestamp from API
}

interface CameraData {
  id: number;
  playlist: VideoClip[];
  currentVideoIndex: number;
  loading: boolean;
  error: string | null;
}

const SimpleMultiCameraView: React.FC<SimpleMultiCameraViewProps> = ({
  targetTimestamp,
  onError,
  isSearching,
  itemName,
  onClose
}) => {
  // État minimal
  const [isPlaying, setIsPlaying] = useState(false);
  const [cameras, setCameras] = useState<CameraData[]>([
    { id: 1, playlist: [], currentVideoIndex: 0, loading: true, error: null },
    { id: 2, playlist: [], currentVideoIndex: 0, loading: true, error: null },
    { id: 3, playlist: [], currentVideoIndex: 0, loading: true, error: null },
    { id: 4, playlist: [], currentVideoIndex: 0, loading: true, error: null },
    { id: 5, playlist: [], currentVideoIndex: 0, loading: true, error: null },
    { id: 6, playlist: [], currentVideoIndex: 0, loading: true, error: null },
  ]);

  // Timeline state for smooth scrubbing
  const [timelineValue, setTimelineValue] = useState(targetTimestamp);

  // Service instance - memoized to prevent recreation on every render
  const cctvService = useMemo(() => new CCTVService(), []);

  // Video refs - proper React way instead of querySelector
  const videoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});

  // Constants to avoid magic numbers
  const TIMELINE_RANGE_MINUTES = 10; // ±10 minutes
  const TIMELINE_RANGE_SECONDS = TIMELINE_RANGE_MINUTES * 60; // 600 seconds
  const NAVIGATION_STEP_SECONDS = 120; // 2 minutes
  const VIDEO_CLIP_DURATION = 120; // 2 minutes per clip

  // Debug helper - only log in development
  const debugLog = (message: string) => {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log(message);
    }
  };

  // PLAYLIST-based seeking (like cctvplayer.js)
  const seekToTimestamp = (timestamp: number) => {
    debugLog(`⏩ PLAYLIST SEEK to timestamp: ${timestamp} (${new Date(timestamp * 1000).toLocaleTimeString()})`);
    
    setCameras(prevCameras => {
      return prevCameras.map(camera => {
        if (camera.playlist.length === 0) return camera;
        
        // Find which video clip contains this timestamp
        let targetVideoIndex = 0;
        let targetTimeInVideo = 0;
        
        for (let i = 0; i < camera.playlist.length; i++) {
          const clip = camera.playlist[i];
          const clipStart = clip.timestamp;
          const clipEnd = clip.timestamp + clip.duration;
          
          if (timestamp >= clipStart && timestamp < clipEnd) {
            // Timestamp is within this clip
            targetVideoIndex = i;
            targetTimeInVideo = timestamp - clipStart;
            break;
          } else if (timestamp < clipStart) {
            // Timestamp is before this clip, use previous clip at end
            targetVideoIndex = Math.max(0, i - 1);
            if (targetVideoIndex < camera.playlist.length) {
              targetTimeInVideo = camera.playlist[targetVideoIndex].duration - 1;
            }
            break;
          }
        }
        
        // If timestamp is after all clips, use last clip at end
        if (timestamp >= camera.playlist[camera.playlist.length - 1].timestamp + camera.playlist[camera.playlist.length - 1].duration) {
          targetVideoIndex = camera.playlist.length - 1;
          targetTimeInVideo = camera.playlist[targetVideoIndex].duration - 1;
        }
        
        debugLog(`📺 Camera ${camera.id}: Video ${targetVideoIndex}/${camera.playlist.length} at ${targetTimeInVideo.toFixed(1)}s`);
        
        // Update video src ONLY if changing clips, otherwise use currentTime
        setTimeout(() => {
          const videoElement = videoRefs.current[camera.id];
          if (videoElement && camera.playlist[targetVideoIndex]) {
            const targetClip = camera.playlist[targetVideoIndex];
            
            // Check if we need to switch clips
            if (targetVideoIndex !== camera.currentVideoIndex) {
              debugLog(`🔄 CLIP SWITCH: Camera ${camera.id} from clip ${camera.currentVideoIndex} to ${targetVideoIndex}`);
              videoElement.src = targetClip.url;
              videoElement.addEventListener('loadeddata', () => {
                videoElement.currentTime = targetTimeInVideo;
                debugLog(`⏩ SEEK after clip switch: ${targetTimeInVideo.toFixed(1)}s`);
              }, { once: true });
            } else {
              // Same clip - just seek with currentTime (SMOOTH!)
              debugLog(`⏩ SMOOTH SEEK: Camera ${camera.id} to ${targetTimeInVideo.toFixed(1)}s within same clip`);
              videoElement.currentTime = targetTimeInVideo;
            }
          }
        }, 0);
        
        return {
          ...camera,
          currentVideoIndex: targetVideoIndex
        };
      });
    });
  };

  // Build playlist from API response (like cctvplayer.js)
  const buildPlaylistForCamera = useCallback(async (cameraId: number, centerTimestamp: number): Promise<VideoClip[]> => {
    try {
      const response = await cctvService.getVideos(centerTimestamp, cameraId);
      
      if (response.videos && Object.keys(response.videos).length > 0) {
        // Convert API response to playlist
        const playlist: VideoClip[] = [];
        
        Object.entries(response.videos).forEach(([key, videoUrl]) => {
          const videoTimestamp = response.timestamps[key];
          playlist.push({
            url: videoUrl,
            startTime: videoTimestamp,
            duration: VIDEO_CLIP_DURATION,
            timestamp: videoTimestamp
          });
        });
        
        // Sort by timestamp
        playlist.sort((a, b) => a.timestamp - b.timestamp);
        
        debugLog(`📺 Camera ${cameraId} playlist: ${playlist.length} clips from ${new Date(playlist[0]?.timestamp * 1000).toLocaleTimeString()} to ${new Date(playlist[playlist.length - 1]?.timestamp * 1000).toLocaleTimeString()}`);
        
        return playlist;
      }
      
      return [];
    } catch (error) {
      debugLog(`Error loading playlist for camera ${cameraId}: ${error}`);
      return [];
    }
  }, [cctvService]); // Proper deps - include cctvService

  // Load playlists for all cameras (like cctvplayer.js multi-playlist endpoint)
  const loadVideos = useCallback(async (timestamp: number) => {
    debugLog(`🎬 Loading playlists for all cameras around: ${timestamp}`);
    
    setCameras(prev => prev.map(cam => ({ ...cam, loading: true, error: null })));
    
    const cameraIds = [1, 2, 3, 4, 5, 6];
    const playlistPromises = cameraIds.map(async (cameraId) => {
      try {
        const playlist = await buildPlaylistForCamera(cameraId, targetTimestamp);
        
        // Find the video closest to target timestamp for initial position
        let currentVideoIndex = 0;
        if (playlist.length > 0) {
          let closestDiff = Infinity;
          playlist.forEach((clip, index) => {
            const diff = Math.abs(clip.timestamp - targetTimestamp);
            if (diff < closestDiff) {
              closestDiff = diff;
              currentVideoIndex = index;
            }
          });
        }
        
        return {
          id: cameraId,
          playlist,
          currentVideoIndex,
          loading: false,
          error: playlist.length > 0 ? null : 'No videos found'
        };
      } catch (error) {
        return {
          id: cameraId,
          playlist: [],
          currentVideoIndex: 0,
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const updatedCameras = await Promise.all(playlistPromises);
    setCameras(updatedCameras);
  }, [buildPlaylistForCamera, targetTimestamp]);

  // Auto-load once on mount - but properly managed
  useEffect(() => {
    debugLog(`🎬 Auto-loading videos on mount for smooth scrubbing`);
    loadVideos(targetTimestamp);
  }, [loadVideos, targetTimestamp]); // Proper deps array
  
  // Manual reload function
  const handleLoadVideos = async () => {
    debugLog(`🎬 Manual reload triggered`);
    await loadVideos(targetTimestamp);
  };

  // Synchronisation simple : seek to initial position when videos are loaded ONCE
  const syncVideos = () => {
    debugLog(`🔄 Video loaded - no auto-seek to avoid infinite loop`);
    // No auto-seek to avoid infinite loop - user will use timeline manually
  };

  // Navigation with smooth seeking (10 min range)
  const goToPrevious = () => {
    const newTimestamp = timelineValue - NAVIGATION_STEP_SECONDS;
    const minTimestamp = targetTimestamp - TIMELINE_RANGE_SECONDS;
    
    if (newTimestamp >= minTimestamp) {
      setTimelineValue(newTimestamp);
      seekToTimestamp(newTimestamp);
    }
  };

  const goToNext = () => {
    const newTimestamp = timelineValue + NAVIGATION_STEP_SECONDS;
    const maxTimestamp = targetTimestamp + TIMELINE_RANGE_SECONDS;
    
    if (newTimestamp <= maxTimestamp) {
      setTimelineValue(newTimestamp);
      seekToTimestamp(newTimestamp);
    }
  };

  // Play/Pause
  const togglePlayPause = () => {
    const videoElements = Object.values(videoRefs.current).filter(Boolean) as HTMLVideoElement[];
    
    if (isPlaying) {
      videoElements.forEach(video => video.pause());
      setIsPlaying(false);
    } else {
      // Sync avant de jouer
      syncVideos();
      
      videoElements.forEach(video => {
        if (video.readyState >= 2) {
          video.play().catch(err => debugLog(`Play error: ${err}`));
        }
      });
      setIsPlaying(true);
    }
  };

  const handleTimelineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTimestamp = Number(event.target.value);
    debugLog(`🎯 IMMEDIATE SEEK: ${newTimestamp} (smooth scrubbing)`);
    setTimelineValue(newTimestamp);
    setIsPlaying(false);
    
    // IMMEDIATE RESPONSE: Seek within loaded videos instead of loading new ones
    seekToTimestamp(newTimestamp);
  };

  if (isSearching) {
    return (
      <div className="cctv-search-container">
        <div className="cctv-search-dots">
          <div className="spinner"></div>
        </div>
        <h3 className="video-player-title">Chargement des 6 caméras...</h3>
      </div>
    );
  }

  return (
    <div className="cctv-window">
      {/* Header */}
      <div className="surface-card-header">
        <div className="cctv-info">
          <div className="video-player-icon">📹</div>
          <div className="cctv-element-name">
            <div className="cctv-element-name">{itemName || 'CCTV Surveillance'}</div>
            <div className="cctv-status-line">
              <span>{formatLocalDateTime(timelineValue)}</span>
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="button">
            ✕ Fermer
          </button>
        )}
      </div>

      {/* Grille de vidéos */}
      <div className="cctv-cameras">
        <div className="video-grid">
          {cameras.map(camera => (
            <div key={camera.id} className="cctv-camera-slot">
              <div className="cctv-camera-label">CAM {camera.id}</div>
              
              {camera.loading && (
                <div className="cctv-camera-status loading">
                  <div className="spinner"></div>
                  LOADING...
                </div>
              )}
              
              {camera.error && (
                <div className="cctv-camera-status error">
                  ERROR: {camera.error}
                </div>
              )}
              
              {camera.playlist.length > 0 && !camera.loading && (
                <video
                  ref={(el) => { videoRefs.current[camera.id] = el; }}
                  className="video-player-video"
                  src={camera.playlist[camera.currentVideoIndex]?.url || ''}
                  muted
                  playsInline
                  onLoadedData={syncVideos}
                  onError={() => {
                    setCameras(prev => prev.map(cam => 
                      cam.id === camera.id 
                        ? { ...cam, error: 'Video load error' }
                        : cam
                    ));
                  }}
                />
              )}
              
              {/* Playlist debug info - small corner indicator */}
              {camera.playlist.length > 0 && (
                <div className="text-secondary fs-xs font-mono">
                  {camera.currentVideoIndex + 1}/{camera.playlist.length}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Controls - Single Row Layout */}
      <div className="stack-horizontal stack-gap-medium">
        <div className="stack-horizontal stack-gap-medium">
          <button 
            onClick={goToPrevious}
            disabled={timelineValue <= targetTimestamp - TIMELINE_RANGE_SECONDS}
            className="cctv-control-button"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 19V5l-7 7 7 7zm2-14v14l7-7-7-7z"/>
            </svg>
            Précédent
          </button>
          
          <button 
            onClick={togglePlayPause}
            className="cctv-control-button"
          >
            {isPlaying ? (
              <>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
                Pause
              </>
            ) : (
              <>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Play
              </>
            )}
          </button>
          
          <button 
            onClick={goToNext}
            disabled={timelineValue >= targetTimestamp + TIMELINE_RANGE_SECONDS}
            className="cctv-control-button"
          >
            Suivant
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 5v14l7-7-7-7zm-2 14V5l-7 7 7 7z"/>
            </svg>
          </button>
          
          <button 
            onClick={handleLoadVideos}
            className="cctv-control-button"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            Recharger
          </button>

          {/* Timeline inline */}
          <div className="stack-horizontal stack-gap-medium">
            <span className="timeline-current-indicator">
              {formatLocalTime(timelineValue)}
            </span>
            <input
              type="range"
              min={targetTimestamp - TIMELINE_RANGE_SECONDS}
              max={targetTimestamp + TIMELINE_RANGE_SECONDS}
              value={timelineValue}
              onChange={handleTimelineChange}
              className="timeline-track"
              step="1"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleMultiCameraView;