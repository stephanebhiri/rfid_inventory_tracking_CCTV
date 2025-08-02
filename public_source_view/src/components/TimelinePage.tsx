import React, { useEffect, useState } from 'react';
// vis-timeline imports removed - D3.js only
// Timeline styles are now included in the main design system
import D3Timeline from './D3Timeline';
import CCTVModal from './cctv/CCTVModal';
import SimpleMultiCameraView from './SimpleMultiCameraView';
// ReactCalendarTimeline removed - D3.js only

// Vis-timeline interfaces removed - D3.js only

interface TimelineEvent {
  id: string;
  rfid_tag_id: string;
  text: string;
  start_date: string;
  end_date: string | null;
  section_id: string;
  color: string;
}

const TimelinePage: React.FC = () => {
  // Timeline ref removed - D3.js only
  // Timeline instance removed - D3.js only
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeScale, setTimeScale] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [showVideoView, setShowVideoView] = useState(false);
  const [selectedTimestampDepart, setSelectedTimestampDepart] = useState(0);
  const [selectedTimestampRetour, setSelectedTimestampRetour] = useState(0);
  const [selectedItemName, setSelectedItemName] = useState('');
  const [cctvModalDepartVisible, setCctvModalDepartVisible] = useState(false);
  const [cctvModalRetourVisible, setCctvModalRetourVisible] = useState(false);
  // Force D3.js timeline only - no buttons needed

  console.log('TimelinePage component rendered');

  // Separate data fetching and timeline creation
  const [timelineData, setTimelineData] = useState<{groups: any[], events: TimelineEvent[]} | null>(null);

  // Fetch data first
  useEffect(() => {
    const fetchTimelineData = async () => {
      console.log('Fetching timeline data...');
      try {
        setLoading(true);
        setError(null);

        const [groupsResponse, eventsResponse] = await Promise.all([
          fetch('/api/tree', { headers: { 'Accept': 'application/json' } }),
          fetch(`/api/treehist?timeScale=${timeScale}`, { headers: { 'Accept': 'application/json' } })
        ]);

        if (!groupsResponse.ok || !eventsResponse.ok) {
          throw new Error('Failed to fetch timeline data');
        }

        const groups = await groupsResponse.json();
        const events: TimelineEvent[] = await eventsResponse.json();
        
        console.log('Timeline data loaded:', { groups, events });
        setTimelineData({ groups, events });
        setLoading(false);
      } catch (err) {
        console.error('Error loading timeline data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load timeline data');
        setLoading(false);
      }
    };

    fetchTimelineData();
  }, [timeScale]);

  // Vis-timeline removed - D3.js only

  // handleItemClick removed - using D3Timeline handleD3ItemClick instead

  const handleD3ItemClick = (event: TimelineEvent) => {
    const startDate = new Date(event.start_date);
    const endDate = event.end_date ? new Date(event.end_date) : null;
    const startPosix = Math.floor(startDate.getTime() / 1000);
    const endPosix = endDate ? Math.floor(endDate.getTime() / 1000) : startPosix;
    
    console.log('D3 Timeline item clicked:', {
      item: event.text,
      start: startPosix,
      end: endPosix
    });

    // Launch video players with time range - départ et retour
    setSelectedTimestampDepart(startPosix);
    setSelectedTimestampRetour(endPosix);
    setSelectedItemName(event.text);
    
    // Afficher la vue vidéo split
    setShowVideoView(true);
  };

  const handleTimeScaleChange = (scale: 'day' | 'week' | 'month' | 'year') => {
    setTimeScale(scale);
    // D3Timeline handles time scale internally - no manual range setting needed
  };

  if (loading) {
    return (
      <div className="app-shell">
        <div className="timeline-container">
          <div className="timeline-header">
            <h1>Timeline - Historique RFID</h1>
            <div className="loading-message">
              <div className="spinner"></div>
              Chargement...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="timeline-container">
          <div className="timeline-header">
            <h1>Timeline - Historique RFID</h1>
            <div className="alert-message alert-message--error">Erreur: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  // Vue vidéo split
  if (showVideoView) {
    return (
      <div className="app-shell">
        <div className="video-split-container">
          <div className="video-split-header">
            <h2>📹 CCTV - {selectedItemName}</h2>
            <button 
              className="button button--primary"
              onClick={() => setShowVideoView(false)}
            >
              ← Retour Timeline
            </button>
          </div>
          
          <div className="video-split-grid">
            <div className="video-split-item">
              <h3>🚀 DÉPART</h3>
              <SimpleMultiCameraView
                targetTimestamp={selectedTimestampDepart}
                onError={(error: any) => console.error('CCTV Départ Error:', error)}
                isSearching={false}
                itemName={`${selectedItemName} - DÉPART`}
                onClose={() => setShowVideoView(false)}
              />
            </div>
            
            <div className="video-split-item">
              <h3>🔙 RETOUR</h3>
              <SimpleMultiCameraView
                targetTimestamp={selectedTimestampRetour}
                onError={(error: any) => console.error('CCTV Retour Error:', error)}
                isSearching={false}
                itemName={`${selectedItemName} - RETOUR`}
                onClose={() => setShowVideoView(false)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="timeline-container">
        <div className="timeline-header">
          <div className="surface-card-header">
            <h1 className="surface-card-title">Historique de détection RFID</h1>
            <p className="surface-card-subtitle">Les éléments colorés indiquent l'absence de détection</p>
            <small>Cliquer sur les éléments pour afficher la vidéo-surveillance</small>
          </div>
          
          <div className="card-body">
            {/* Timeline selector buttons removed - D3.js only */}

            <div className="d-flex gap-2">
              <button 
                type="button" 
                className={`md-button md-button--outlined ${timeScale === 'day' ? 'active' : ''}`}
                onClick={() => handleTimeScaleChange('day')}
              >
                24h
              </button>
              <button 
                type="button" 
                className={`md-button md-button--outlined ${timeScale === 'week' ? 'active' : ''}`}
                onClick={() => handleTimeScaleChange('week')}
              >
                Semaine
              </button>
              <button 
                type="button" 
                className={`md-button md-button--outlined ${timeScale === 'month' ? 'active' : ''}`}
                onClick={() => handleTimeScaleChange('month')}
              >
                Mois
              </button>
              <button 
                type="button" 
                className={`md-button md-button--outlined ${timeScale === 'year' ? 'active' : ''}`}
                onClick={() => handleTimeScaleChange('year')}
              >
                Année
              </button>
            </div>
            
            {/* Zoom control removed - D3.js handles zoom natively with mouse wheel */}
          </div>
        </div>

        <div className="timeline-container">
          {timelineData ? (
            <D3Timeline
              groups={timelineData.groups}
              events={timelineData.events}
              onItemClick={handleD3ItemClick}
              width={1200}
              timeScale={timeScale}
            />
          ) : null}
        </div>
        
        {/* Modal CCTV Départ - Split gauche */}
        <CCTVModal
          isVisible={cctvModalDepartVisible}
          targetTimestamp={selectedTimestampDepart}
          itemName={`${selectedItemName} - DÉPART`}
          isSearching={false}
          position="left"
          onClose={() => setCctvModalDepartVisible(false)}
          onError={(error: any) => console.error('CCTV Départ Error:', error)}
        />
        
        {/* Modal CCTV Retour - Split droite */}
        <CCTVModal
          isVisible={cctvModalRetourVisible}
          targetTimestamp={selectedTimestampRetour}
          itemName={`${selectedItemName} - RETOUR`}
          isSearching={false}
          position="right"
          onClose={() => setCctvModalRetourVisible(false)}
          onError={(error: any) => console.error('CCTV Retour Error:', error)}
        />
      </div>
    </div>
  );
};

export default TimelinePage;