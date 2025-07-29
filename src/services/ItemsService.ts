import { errorService } from './ErrorService';

export interface Item {
  mac_address: string;
  brand: string;
  model: string;
  serial_number: string;
  epc: string;
  image: string;
  inventory_code: string;
  category: string;
  updated_at: string;
  antenna: string;
  group_id: number;
  designation: string;
  sec: number;
  heure: string;
  updated_atposix: number;
  group: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    count?: number;
    endpoint?: string;
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    hasPrevPage?: boolean;
  };
}

export class ItemsService {
  async getItems(): Promise<Item[]> {
    try {
      const response = await fetch('/api/items');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const apiResponse: ApiResponse<Item[]> = await response.json();
      
      // Handle both old format (direct array) and new format (with success/data/meta)
      if (apiResponse.success !== undefined) {
        // New API format
        return apiResponse.data;
      } else {
        // Legacy format (direct array) - for backward compatibility
        return apiResponse as unknown as Item[];
      }
    } catch (error) {
      // Error handled by caller (useItems hook)
      throw error;
    }
  }

  /**
   * Enhanced version with retry logic and better error handling
   */
  async getItemsWithRetry(maxRetries: number = 2): Promise<Item[]> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const response = await fetch('/api/items', {
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          (error as any).status = response.status;
          
          errorService.handleApiError(error as any, '/api/items', {
            method: 'GET',
            attempt: attempt + 1,
            maxRetries
          });
          
          throw error;
        }
        
        const apiResponse: ApiResponse<Item[]> = await response.json();
        
        // Handle both formats
        const items = apiResponse.success !== undefined 
          ? apiResponse.data 
          : apiResponse as unknown as Item[];
        
        if (!Array.isArray(items)) {
          const error = new Error('Invalid API response: data is not an array');
          errorService.logError(error, { response: apiResponse }, 'medium');
          throw error;
        }
        
        return items;
        
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on client errors (4xx) except timeouts and rate limits
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as any).status;
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            throw error;
          }
        }
        
        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    if (lastError) {
      throw lastError;
    }
    
    throw new Error('Unexpected error in retry logic');
  }
}