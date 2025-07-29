import React, { useState, useEffect, useCallback } from 'react';
import { HistoryService, HistoryItem } from '../services/HistoryService';
import HistoryTable from './HistoryTable';
import SimpleMultiCameraView from './SimpleMultiCameraView';
// History styles are now included in the main design system

const HistoryPage: React.FC = () => {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState(50);
  
  // CCTV Modal state
  const [cctvModalOpen, setCctvModalOpen] = useState(false);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number>(0);
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<'départ' | 'retour'>('départ');

  const loadHistory = useCallback(async () => {
    const historyService = new HistoryService();
    try {
      setLoading(true);
      setError(null);
      const items = await historyService.getHistory();
      setHistoryItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleCCTVClick = useCallback((timestamp: number, designation: string, mode: 'départ' | 'retour') => {
    setSelectedTimestamp(timestamp);
    setSelectedItem(designation);
    setSelectedMode(mode);
    setCctvModalOpen(true);
  }, []);

  const handleCloseCCTV = useCallback(() => {
    setCctvModalOpen(false);
  }, []);

  const loadMore = useCallback((additionalItems: number) => {
    setLimit(prev => prev + additionalItems);
  }, []);

  const filteredAndLimitedItems = historyItems.slice(0, limit);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-message">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  if (cctvModalOpen) {
    return (
      <div className="app-shell">
        <div className="modal-backdrop">
          <div className="modal modal-xl">
            <div className="modal-header">
              <h2>📹 Video surveillance pour {selectedMode} de {selectedItem}</h2>
              <button onClick={handleCloseCCTV} className="btn btn-close">
                ✕ CLOSE
              </button>
            </div>
            <SimpleMultiCameraView
              targetTimestamp={selectedTimestamp}
              itemName={`${selectedItem} - ${selectedMode}`}
              onClose={handleCloseCCTV}
              onError={(error) => setError(error)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="nav-rail">
        <div className="card-body">
          <img src="/assets/images/sigactua2.png" alt="Logo" className="" />
          <div>
            <h1 className="text-title-3">Inventory History</h1>
            <p className="text-caption-1 text-secondary">Historical data explorer</p>
          </div>
        </div>
        <div className="tab-bar">
          <a href="/" className="tab-item">Switch to Live</a>
          <a href="/timeline" className="tab-item">Switch to Timeline</a>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="card-body">
        <div className="stack-vertical stack-gap-small">
          <label htmlFor="search" className="text-body-1-strong">Search ({historyItems.length} items)</label>
          <input 
            type="text" 
            id="search"
            className="input-field"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search designation, code, group, antenna..."
          />
        </div>

        <div className="d-flex gap-3">
          <button onClick={() => loadMore(20)} className="btn btn-primary">
            Afficher +20
          </button>
          <button onClick={() => loadMore(200)} className="btn btn-primary">
            Afficher +200
          </button>
          <button onClick={() => loadMore(2000)} className="btn btn-primary">
            Afficher +2000
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert-message alert-message--error">
          <p>Error: {error}</p>
          <button onClick={loadHistory} className="btn btn-secondary">
            Retry
          </button>
        </div>
      )}

      {/* History Table */}
      {!error && (
        <HistoryTable 
          items={filteredAndLimitedItems}
          onCCTVClick={handleCCTVClick}
          searchQuery={searchQuery}
        />
      )}

      {/* Show more indicator */}
      {filteredAndLimitedItems.length < historyItems.length && (
        <div className="info-bar">
          <p>Showing {filteredAndLimitedItems.length} of {historyItems.length} items</p>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;