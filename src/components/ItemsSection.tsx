import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useItems } from '../hooks/useItems';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useRealtime } from '../hooks/useRealtime';
import ItemsTable from './ItemsTable';
import AddItemModal from './AddItemModal';
import { automationAPI } from '../api/AutomationAPI';
import { ItemsService, Item } from '../services/ItemsService';

interface ItemsSectionProps {
  onItemClick: (timestamp: number, designation: string, groupId: number) => void;
  onHealthCheck: () => void;
}

const ItemsSection: React.FC<ItemsSectionProps> = ({ onItemClick, onHealthCheck }) => {
  const { items, loading, error, refetch } = useItems();
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const refetchRef = useRef(refetch);
  const itemsService = new ItemsService();
  
  // Keep refetch ref up to date
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);
  
  // console.log('🖥️ ItemsSection render - items count:', items.length, 'loading:', loading);

  // Memoized callbacks to prevent unnecessary re-renders
  const silentRefresh = useCallback(() => {
    // console.log('🔄 silentRefresh called - calling refetch(true)');
    refetchRef.current(true);
  }, []); // Stable callback using ref

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled(prev => !prev);
  }, []);

  const toggleRealtime = useCallback(() => {
    setRealtimeEnabled(prev => !prev);
  }, []);

  const handleAddItem = useCallback(async (item: Partial<Item>) => {
    try {
      await itemsService.createItem(item);
      refetchRef.current();
    } catch (error) {
      throw error;
    }
  }, [itemsService]);

  // SIMPLE POLLING comme Angular - 1 seconde
  useAutoRefresh(silentRefresh, 5000, autoRefreshEnabled); // 5 seconds instead of 1

  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString());
  
  // Update timestamp every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update automation API state when items change
  useEffect(() => {
    automationAPI.updateState({
      items: items.map((item, index) => ({
        id: index,
        epc: item.epc,
        designation: item.designation,
        timestamp: item.updated_atposix || item.sec,
        groupId: item.group_id
      })),
      autoRefresh: autoRefreshEnabled,
      isLoading: loading,
      error: error
    });
  }, [items, autoRefreshEnabled, loading, error]);

  // Listen for external refresh requests
  useEffect(() => {
    const handleExternalRefresh = () => {
      silentRefresh();
    };

    window.addEventListener('cctv-refresh-requested', handleExternalRefresh);
    return () => window.removeEventListener('cctv-refresh-requested', handleExternalRefresh);
  }, [silentRefresh]);

  return (
    <div className="surface-card">
      {/* Header Section */}
      <div className="surface-card-header">
        <div className="stack-horizontal stack-between">
          <div className="flex-items-gap-3">
            <div className="icon-container icon-container-accent">
              <svg className="icon-medium" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm3-1a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1H6zm2 4a1 1 0 000 2h8a1 1 0 100-2H8zm0 3a1 1 0 000 2h8a1 1 0 100-2H8zm0 3a1 1 0 000 2h8a1 1 0 100-2H8z" clipRule="evenodd"/>
              </svg>
            </div>
            <div>
              <h2 className="surface-card-title">Inventaire en temps réel</h2>
              <p className="surface-card-subtitle">Cliquez sur un élément pour voir les images CCTV</p>
            </div>
          </div>
          <div className="flex-items-gap-3">
            <button 
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary"
            >
              <svg className="icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Ajouter Item</span>
            </button>
            {/* Realtime button disabled for debugging */}
            <button 
              onClick={toggleAutoRefresh}
              className={`btn btn-secondary ${autoRefreshEnabled ? 'bg-success' : 'bg-error'}`}
            >
              {autoRefreshEnabled ? (
                <>
                  <svg className="icon-sm animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Auto-refresh ON</span>
                </>
              ) : (
                <>
                  <svg className="icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Auto-refresh OFF</span>
                </>
              )}
            </button>
            <button 
              onClick={onHealthCheck}
              className="btn btn-secondary"
            >
              <svg className="icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span>Health Check</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert-message alert-message--error">
          <button 
            onClick={() => {}}
            className="button button--subtle"
          >
            ✕
          </button>
          <strong>❌ ERREUR:</strong> {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-message">
          <div className="spinner"></div>
          <span>Chargement des éléments...</span>
        </div>
      )}

      {/* Items Table */}
      <ItemsTable items={items} onItemClick={onItemClick} />

      {/* Add Item Modal */}
      <AddItemModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddItem}
      />

      {/* Info Bar */}
      <div className="info-bar">
        <div className="flex-items-gap-2">
          <div className="status-dot status-dot-accent"></div>
          <span className="text-2 fw-med">Total Items: {items.length}</span>
        </div>
        <div className="flex-items-gap-2">
          <div className="status-dot status-dot-success"></div>
          <span className="text-2 fw-med">Dernière mise à jour: {currentTime}</span>
        </div>
        <div className="flex-items-gap-2">
          <div className={`status-dot ${
            autoRefreshEnabled 
              ? 'status-dot-warning animate-pulse' 
              : 'status-dot-gray'
          }`}></div>
          <span className="text-2 fw-med">
            {autoRefreshEnabled 
              ? 'Auto-refresh: 5s (actif)' 
              : 'Auto-refresh: désactivé'
            }
          </span>
        </div>
        {/* Realtime status disabled for debugging */}
        <div className="flex-items-gap-2">
          <svg className="icon-sm text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-caption-1">Cliquez sur un élément pour voir les images CCTV</span>
        </div>
      </div>
    </div>
  );
};

// Add display name for debugging
ItemsSection.displayName = 'ItemsSection';

export default ItemsSection;
