import { useCallback, useState, useMemo } from 'react';
import { useWebSocket, WebSocketMessage } from './useWebSocket';

export interface RealTimeEvent {
  type: string;
  timestamp: string;
  data: any;
}

export interface RealtimeHookOptions {
  onRFIDEvent?: (event: RealTimeEvent) => void;
  onSystemEvent?: (event: RealTimeEvent) => void;
  onItemsUpdate?: () => void;
  autoReconnect?: boolean;
}

export const useRealtime = (options: RealtimeHookOptions = {}) => {
  const {
    onRFIDEvent,
    onSystemEvent,
    onItemsUpdate,
    autoReconnect = true
  } = options;

  const [lastRFIDEvent, setLastRFIDEvent] = useState<RealTimeEvent | null>(null);
  const [lastSystemEvent, setLastSystemEvent] = useState<RealTimeEvent | null>(null);
  const [eventStats, setEventStats] = useState({
    rfidEvents: 0,
    systemEvents: 0,
    totalEvents: 0,
    lastEventTime: null as string | null
  });

  // Determine WebSocket URL - memoized to prevent reconnections
  const websocketUrl = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }, []);

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'connection':
        // Connection confirmée sans spam
        break;

      case 'rfid_event':
        setLastRFIDEvent(message.data);
        setEventStats(prev => ({
          ...prev,
          rfidEvents: prev.rfidEvents + 1,
          totalEvents: prev.totalEvents + 1,
          lastEventTime: message.timestamp
        }));
        
        onRFIDEvent?.(message.data);
        onItemsUpdate?.();
        break;

      case 'system_event':
        setLastSystemEvent(message.data);
        setEventStats(prev => ({
          ...prev,
          systemEvents: prev.systemEvents + 1,
          totalEvents: prev.totalEvents + 1,
          lastEventTime: message.timestamp
        }));
        
        onSystemEvent?.(message.data);
        break;

      default:
        // Ignore unknown messages
        break;
    }
  }, [onRFIDEvent, onSystemEvent, onItemsUpdate]);

  const handleConnect = useCallback(() => {
    console.log('🚀 Realtime service connected');
    setEventStats(prev => ({
      ...prev,
      lastEventTime: new Date().toISOString()
    }));
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('🔌 Realtime service disconnected');
  }, []);

  const handleError = useCallback((error: Event) => {
    console.error('❌ Realtime service error:', error);
  }, []);

  const websocket = useWebSocket({
    url: websocketUrl,
    onMessage: handleWebSocketMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    reconnectInterval: 5000,
    maxReconnectAttempts: autoReconnect ? 2 : 0
  });

  // Publish manual refresh request
  const requestRefresh = useCallback(() => {
    return websocket.sendMessage({
      type: 'refresh_request',
      timestamp: new Date().toISOString()
    });
  }, [websocket]);

  // Get realtime status
  const getStatus = useCallback(() => {
    return {
      connected: websocket.isConnected,
      connectionStatus: websocket.connectionStatus,
      reconnectAttempts: websocket.reconnectAttempts,
      eventStats,
      lastRFIDEvent,
      lastSystemEvent
    };
  }, [websocket, eventStats, lastRFIDEvent, lastSystemEvent]);

  // Reset event statistics
  const resetStats = useCallback(() => {
    setEventStats({
      rfidEvents: 0,
      systemEvents: 0,
      totalEvents: 0,
      lastEventTime: null
    });
    setLastRFIDEvent(null);
    setLastSystemEvent(null);
  }, []);

  return {
    // Connection status
    isConnected: websocket.isConnected,
    connectionStatus: websocket.connectionStatus,
    
    // Connection control
    connect: websocket.connect,
    disconnect: websocket.disconnect,
    
    // Event data
    lastRFIDEvent,
    lastSystemEvent,
    eventStats,
    
    // Actions
    requestRefresh,
    resetStats,
    getStatus
  };
};