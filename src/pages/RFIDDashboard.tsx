import React, { useState, useEffect, useCallback } from 'react';
import { CCTVService } from '../services/CCTVService';
import CCTVModal from '../components/cctv/CCTVModal';
import ItemsSection from '../components/ItemsSection';
import HistoryPage from '../components/HistoryPage';
import TimelinePage from '../components/TimelinePage';
import { automationAPI } from '../api/AutomationAPI';

const RFIDDashboard: React.FC = () => {
  const [selectedDateTime, setSelectedDateTime] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cctvModalVisible, setCctvModalVisible] = useState(false);
  const [currentItemName, setCurrentItemName] = useState<string>('');
  const [currentView, setCurrentView] = useState<'inventory' | 'history' | 'timeline'>('inventory');

  const handleHealthCheck = useCallback(async () => {
    const cctvService = new CCTVService();
    setLoading(true);
    setError(null);

    try {
      const health = await cctvService.checkHealth();
      if (health.status === 'healthy') {
        alert(`✅ API is healthy! Timestamp: ${new Date(health.timestamp * 1000).toLocaleString()}`);
      } else {
        setError('API health check failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleItemClick = async (timestamp: number, designation: string, groupId: number) => {
    console.log(`🎬 Launching CCTV viewer for RFID item: ${designation} at timestamp: ${timestamp}`);
    
    setLoading(true);
    setError(null);
    setCurrentItemName(designation);
    setCctvModalVisible(true);

    try {
      // Update datetime picker to show item time
      const itemDate = new Date(timestamp * 1000);
      setSelectedDateTime(itemDate.toISOString().slice(0, 16));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CCTV footage');
    } finally {
      setLoading(false);
    }
  };

  // Initialize Automation API
  useEffect(() => {
    automationAPI.init({
      onItemClick: handleItemClick,
      onRefresh: () => {
        // Trigger refresh - will be handled by ItemsSection
        window.dispatchEvent(new CustomEvent('cctv-refresh-requested'));
      },
      onHealthCheck: handleHealthCheck
    });

    // Update API state when app state changes
    automationAPI.updateState({
      isLoading: loading,
      currentVideo: null,
      error: error,
      selectedCamera: 1,
      selectedItem: currentItemName ? {
        id: Date.now(),
        epc: '',
        designation: currentItemName,
        timestamp: selectedDateTime ? Math.floor(new Date(selectedDateTime).getTime() / 1000) : 0,
        groupId: 0
      } : null
    });

    console.log('🤖 RFID Automation API ready - window.CCTV available');
  }, [loading, error, currentItemName, selectedDateTime, handleHealthCheck]);

  const closeCctvModal = () => {
    setCctvModalVisible(false);
  };

  return (
    <div className="app-shell">
      {/* RFID Inventory Header */}
      <header className="nav-rail">
        <div>
          <h1 className="text-title-3">📡 ACTINVENT RFID CONTROL</h1>
          <p className="text-body-1 text-secondary">INVENTORY TRACKING • REAL-TIME MONITORING</p>
        </div>
        <nav className="tab-bar">
          <button 
            onClick={() => setCurrentView('inventory')}
            className={`nav-button ${currentView === 'inventory' ? 'active' : ''}`}
          >
            📋 Live Inventory
          </button>
          <button 
            onClick={() => setCurrentView('history')}
            className={`nav-button ${currentView === 'history' ? 'active' : ''}`}
          >
            📚 History
          </button>
          <button 
            onClick={() => setCurrentView('timeline')}
            className={`nav-button ${currentView === 'timeline' ? 'active' : ''}`}
          >
            📅 Timeline
          </button>
        </nav>
      </header>

      <main className="page-content">
        {/* Error Alert */}
        {error && (
          <div className="alert-message alert-message--error">
            <button 
              onClick={() => setError(null)}
              className="button button--subtle"
            >
              ✕
            </button>
            <strong>❌ ERREUR:</strong> {error}
          </div>
        )}

        {/* Conditional View Rendering */}
        {currentView === 'history' ? (
          <HistoryPage />
        ) : currentView === 'timeline' ? (
          <TimelinePage />
        ) : (
          /* Main RFID Inventory View */
          <ItemsSection 
            onItemClick={handleItemClick}
            onHealthCheck={handleHealthCheck}
          />
        )}

        {/* CCTV Modal */}
        <CCTVModal
          isVisible={cctvModalVisible}
          targetTimestamp={selectedDateTime ? Math.floor(new Date(selectedDateTime).getTime() / 1000) : Math.floor(Date.now() / 1000)}
          itemName={currentItemName}
          isSearching={loading}
          onClose={closeCctvModal}
          onError={(error) => setError(error)}
        />
      </main>
    </div>
  );
};

export default RFIDDashboard;