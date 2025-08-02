interface Group {
  id: number;
  group_id: string | number;
  group_name: string;
  color?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: any;
}

export class GroupsService {
  async getGroups(): Promise<Group[]> {
    try {
      const response = await fetch('/api/groups');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const apiResponse: ApiResponse<Group[]> = await response.json();
      
      return apiResponse.data;
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      throw error;
    }
  }
}

export type { Group };