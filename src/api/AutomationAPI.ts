/**
 * CCTV Automation API for Agent Interaction
 * 
 * This API exposes the core CCTV functionality to external agents,
 * allowing programmatic control without DOM manipulation.
 */

export interface CCTVItem {
  id: number;
  epc: string;
  designation: string;
  timestamp: number;
  groupId: number;
}

export interface CCTVState {
  isLoading: boolean;
  items: CCTVItem[];
  selectedItem: CCTVItem | null;
  autoRefresh: boolean;
  currentVideo: string | null;
  error: string | null;
  lastRefresh: number;
  selectedCamera?: number;
}

export interface VideoInfo {
  url: string;
  item: CCTVItem;
  camera: number;
  timestamp: number;
}

export interface CCTVEvents {
  'error': { message: string; type: 'api' | 'video' | 'network' };
  'item-selected': { item: CCTVItem };
  'video-loaded': { url: string; item: CCTVItem };
  'refresh-complete': { itemCount: number; timestamp: number };
  'state-changed': { state: CCTVState };
}

class AutomationAPI extends EventTarget {
  private state: CCTVState = {
    isLoading: false,
    items: [],
    selectedItem: null,
    autoRefresh: true,
    currentVideo: null,
    error: null,
    lastRefresh: 0
  };

  private callbacks: {
    onItemClick?: (timestamp: number, designation: string, groupId: number) => void;
    onRefresh?: () => void;
    onHealthCheck?: () => void;
  } = {};

  /**
   * Initialize the API with app callbacks
   */
  init(callbacks: typeof this.callbacks) {
    this.callbacks = callbacks;
    console.log('🤖 CCTV Automation API initialized');
  }

  /**
   * Get current application state
   */
  getState(): CCTVState {
    return { ...this.state };
  }

  /**
   * Get all items
   */
  getItems(): CCTVItem[] {
    return [...this.state.items];
  }

  /**
   * Select an item by ID (array index) and trigger video loading
   */
  async selectItem(itemId: number): Promise<boolean> {
    const item = this.state.items[itemId]; // Use array index
    if (!item) {
      this.emitError('Item not found', 'api');
      return false;
    }

    try {
      this.updateState({ isLoading: true, selectedItem: item });
      
      if (this.callbacks.onItemClick) {
        this.callbacks.onItemClick(item.timestamp, item.designation, item.groupId);
      }

      this.emit('item-selected', { item });
      return true;
    } catch (error) {
      this.emitError(`Failed to select item: ${error}`, 'api');
      return false;
    }
  }

  /**
   * Select item by EPC (barcode)
   */
  async selectItemByEPC(epc: string): Promise<boolean> {
    const item = this.state.items.find(i => i.epc === epc);
    if (!item) {
      this.emitError(`Item with EPC ${epc} not found`, 'api');
      return false;
    }
    return this.selectItem(item.id);
  }

  /**
   * Refresh items from server
   */
  async refreshNow(): Promise<boolean> {
    try {
      this.updateState({ isLoading: true });
      
      if (this.callbacks.onRefresh) {
        this.callbacks.onRefresh();
      }

      return true;
    } catch (error) {
      this.emitError(`Refresh failed: ${error}`, 'network');
      return false;
    }
  }

  /**
   * Check API health
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (this.callbacks.onHealthCheck) {
        this.callbacks.onHealthCheck();
      }
      return true;
    } catch (error) {
      this.emitError(`Health check failed: ${error}`, 'network');
      return false;
    }
  }

  /**
   * Get current video URL
   */
  getCurrentVideo(): string | null {
    return this.state.currentVideo;
  }

  /**
   * Get detailed video information including item and camera
   */
  getCurrentVideoInfo(): VideoInfo | null {
    if (!this.state.currentVideo || !this.state.selectedItem) {
      return null;
    }

    return {
      url: this.state.currentVideo,
      item: this.state.selectedItem,
      camera: this.state.selectedCamera || 1, // Default to camera 1 if not set
      timestamp: this.state.selectedItem.timestamp
    };
  }

  /**
   * Search items by designation
   */
  searchItems(query: string): CCTVItem[] {
    const lowercaseQuery = query.toLowerCase();
    return this.state.items.filter(item => 
      item.designation.toLowerCase().includes(lowercaseQuery) ||
      item.epc.toLowerCase().includes(lowercaseQuery)
    );
  }

  /**
   * Get items by time range
   */
  getItemsByTimeRange(startTimestamp: number, endTimestamp: number): CCTVItem[] {
    return this.state.items.filter(item => 
      item.timestamp >= startTimestamp && item.timestamp <= endTimestamp
    );
  }

  /**
   * Update internal state (called by the app)
   */
  updateState(newState: Partial<CCTVState>) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...newState };
    
    // Emit specific events based on state changes
    if (newState.items && newState.items.length !== oldState.items.length) {
      this.emit('refresh-complete', { 
        itemCount: newState.items.length, 
        timestamp: Date.now() 
      });
      this.state.lastRefresh = Date.now();
    }

    if (newState.currentVideo && newState.currentVideo !== oldState.currentVideo) {
      this.emit('video-loaded', { 
        url: newState.currentVideo, 
        item: this.state.selectedItem! 
      });
    }

    this.emit('state-changed', { state: this.getState() });
  }

  /**
   * Emit error event
   */
  private emitError(message: string, type: CCTVEvents['error']['type']) {
    this.updateState({ error: message });
    this.emit('error', { message, type });
  }

  /**
   * Type-safe event emitter
   */
  private emit<K extends keyof CCTVEvents>(type: K, data: CCTVEvents[K]) {
    this.dispatchEvent(new CustomEvent(type, { detail: data }));
  }

  /**
   * Type-safe event listener
   */
  on<K extends keyof CCTVEvents>(
    type: K, 
    listener: (event: CustomEvent<CCTVEvents[K]>) => void
  ) {
    this.addEventListener(type, listener as EventListener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof CCTVEvents>(
    type: K, 
    listener: (event: CustomEvent<CCTVEvents[K]>) => void
  ) {
    this.removeEventListener(type, listener as EventListener);
  }
}

// Create singleton instance
export const automationAPI = new AutomationAPI();

// Expose to window for agent access
declare global {
  interface Window {
    CCTV: AutomationAPI;
  }
}

if (typeof window !== 'undefined') {
  window.CCTV = automationAPI;
}