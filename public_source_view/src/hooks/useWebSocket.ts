import { useEffect, useRef, useCallback, useState } from 'react';

export interface WebSocketMessage {
  type: string;
  timestamp: string;
  data: any;
}

export interface WebSocketHookOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export const useWebSocket = (options: WebSocketHookOptions) => {
  const {
    url,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10
  } = options;

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const isManualClose = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Prevent connection if max attempts reached
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached, not connecting');
      return;
    }

    console.log('🔌 Attempting WebSocket connection to:', url);
    setConnectionStatus('connecting');

    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        onConnect?.();
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', message.type, message.data);
          onMessage?.(message);
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('🔌 WebSocket connection closed:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        ws.current = null;

        onDisconnect?.();

        // Auto-reconnect if not manually closed
        if (!isManualClose.current && reconnectAttempts.current < maxReconnectAttempts) {
          console.log(`🔄 Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, reconnectInterval);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('❌ Max reconnection attempts reached. Giving up.');
          setConnectionStatus('error');
        }
      };

      ws.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionStatus('error');
        onError?.(error);
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [url, onMessage, onConnect, onDisconnect, onError, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    console.log('🔌 Manually disconnecting WebSocket...');
    isManualClose.current = true;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect');
      ws.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message));
        console.log('📤 WebSocket message sent:', message);
        return true;
      } catch (error) {
        console.error('❌ Failed to send WebSocket message:', error);
        return false;
      }
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message');
      return false;
    }
  }, []);

  // Auto-connect on mount - DISABLED TO STOP ERRORS
  useEffect(() => {
    isManualClose.current = true;
    // connect(); // DISABLED

    return () => {
      isManualClose.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close(1000, 'Component unmounting');
      }
    };
  }, [connect]);

  // Pause/resume based on page visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('📱 Page hidden, pausing WebSocket...');
        // Don't disconnect, just note that we're in background
      } else {
        console.log('📱 Page visible, resuming WebSocket...');
        // Reconnect if connection was lost while in background
        if (!isConnected && !isManualClose.current) {
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, connect]);

  return {
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    sendMessage,
    reconnectAttempts: reconnectAttempts.current
  };
};