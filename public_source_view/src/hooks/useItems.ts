import { useState, useEffect, useCallback, useRef } from 'react';
import { Item, ItemsService } from '../services/ItemsService';

export const useItems = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsService = useRef(new ItemsService());

  const fetchItems = useCallback(async (silent = false) => {
    // console.log('📡 fetchItems called - silent:', silent);
    if (!silent) setLoading(true);
    setError(null);
    
    try {
      const fetchedItems = await itemsService.current.getItems();
      // console.log('✅ Items fetched successfully:', fetchedItems.length, 'items');
      setItems([...fetchedItems]); // Force new array reference
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch items';
      console.log('❌ Items fetch failed:', errorMessage);
      setError(errorMessage);
      if (!silent) {
        console.error('Items fetch error:', err);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(); // Initial load
  }, []); // Remove fetchItems dependency to prevent infinite loop

  return { 
    items, 
    loading, 
    error, 
    refetch: fetchItems 
  };
};