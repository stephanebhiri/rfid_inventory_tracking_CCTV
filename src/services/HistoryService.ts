export interface HistoryItem {
  designation: string;
  inventory_code: string;
  dep: string; // Formatted departure date
  ret: string; // Formatted return date
  depposix: number; // Unix timestamp departure
  retposix: number; // Unix timestamp return
  antenna_dep: string;
  antenna_ret: string;
  delai: string; // Duration formatted
  days: number;
  group: string;
  group_name: string;
  group_id: number;
}

export class HistoryService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '/api'; // Relative URL - same server
  }

  async getHistory(): Promise<HistoryItem[]> {
    try {
      const response = await fetch(`${this.baseUrl}/history`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Handle both formats: direct array or wrapped in data.items
      if (data.data && data.data.items) {
        return data.data.items;
      }
      return data;
    } catch (error) {
      console.error('Error fetching history:', error);
      throw error;
    }
  }
}