import { useState, useCallback, useMemo, useRef } from 'react';
import { Item } from '../services/ItemsService';

export interface UseSelectionReturn {
  // State
  selectedIds: Set<number>;
  selectedItems: Item[];
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  selectionCount: number;
  
  // Actions
  toggleItem: (itemId: number) => void;
  toggleAll: () => void;
  clearSelection: () => void;
  isItemSelected: (itemId: number) => boolean;
  
  // Advanced selection
  selectRange: (fromIndex: number, toIndex: number) => void;
  handleRowClick: (itemId: number, itemIndex: number, event: React.MouseEvent) => void;
  
  // Drag selection
  isDragging: boolean;
  handleDragStart: (itemIndex: number) => void;
  handleDragEnter: (itemIndex: number) => void;
  handleDragEnd: () => void;
}

export const useSelection = (items: Item[]): UseSelectionReturn => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs for drag selection
  const dragStartIndex = useRef<number | null>(null);
  const lastSelectedIndex = useRef<number | null>(null);
  const selectionBeforeDrag = useRef<Set<number>>(new Set());
  
  // Computed values
  const selectedItems = useMemo(() => 
    items.filter(item => selectedIds.has(item.id)),
    [items, selectedIds]
  );
  
  const selectionCount = selectedIds.size;
  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < items.length;
  
  // Check if item is selected
  const isItemSelected = useCallback((itemId: number) => 
    selectedIds.has(itemId),
    [selectedIds]
  );
  
  // Toggle single item
  const toggleItem = useCallback((itemId: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);
  
  // Toggle all items
  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(item => item.id)));
    }
  }, [items, isAllSelected]);
  
  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  
  // Select range of items
  const selectRange = useCallback((fromIndex: number, toIndex: number) => {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    
    const newIds = new Set(selectedIds);
    for (let i = start; i <= end; i++) {
      if (items[i]) {
        newIds.add(items[i].id);
      }
    }
    setSelectedIds(newIds);
  }, [items, selectedIds]);
  
  // Handle row click with modifiers
  const handleRowClick = useCallback((itemId: number, itemIndex: number, event: React.MouseEvent) => {
    if (event.shiftKey && lastSelectedIndex.current !== null) {
      // Shift+click: select range
      selectRange(lastSelectedIndex.current, itemIndex);
      // Keep the original index as anchor for next shift+click
    } else {
      // Normal click: toggle item
      toggleItem(itemId);
      lastSelectedIndex.current = itemIndex;
    }
  }, [selectRange, toggleItem]);
  
  // Drag selection handlers
  const handleDragStart = useCallback((itemIndex: number) => {
    setIsDragging(true);
    dragStartIndex.current = itemIndex;
    // Save current selection before drag
    selectionBeforeDrag.current = new Set(selectedIds);
  }, [selectedIds]);
  
  const handleDragEnter = useCallback((itemIndex: number) => {
    if (!isDragging || dragStartIndex.current === null) return;
    
    const start = Math.min(dragStartIndex.current, itemIndex);
    const end = Math.max(dragStartIndex.current, itemIndex);
    
    // Start with the selection from before drag
    const newIds = new Set(selectionBeforeDrag.current);
    
    // Toggle items in the dragged range
    for (let i = start; i <= end; i++) {
      if (items[i]) {
        const itemId = items[i].id;
        if (selectionBeforeDrag.current.has(itemId)) {
          // Item was already selected, remove it
          newIds.delete(itemId);
        } else {
          // Item was not selected, add it
          newIds.add(itemId);
        }
      }
    }
    setSelectedIds(newIds);
  }, [isDragging, items]);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartIndex.current = null;
    selectionBeforeDrag.current = new Set();
  }, []);
  
  return {
    // State
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    selectionCount,
    isDragging,
    
    // Actions
    toggleItem,
    toggleAll,
    clearSelection,
    isItemSelected,
    
    // Advanced selection
    selectRange,
    handleRowClick,
    
    // Drag selection
    handleDragStart,
    handleDragEnter,
    handleDragEnd
  };
};