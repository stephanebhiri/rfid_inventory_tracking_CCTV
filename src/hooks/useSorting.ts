import { useState, useMemo } from 'react';
import { Item } from '../services/ItemsService';

export type SortDirection = 'asc' | 'desc';
export type SortColumn = keyof Item;

export const useSorting = (items: Item[]) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('updated_atposix');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    return [...items].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      // Handle different data types
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [items, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return {
    sortedItems,
    sortColumn,
    sortDirection,
    handleSort
  };
};