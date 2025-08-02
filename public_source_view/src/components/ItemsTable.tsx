import React, { useMemo, useCallback } from 'react';
import { Item } from '../services/ItemsService';
import { useSorting, SortColumn } from '../hooks/useSorting';
import { useScrollPreservation } from '../hooks/useScrollPreservation';
import ItemRow from './ItemRow';

interface ItemsTableProps {
  items: Item[];
  onItemClick: (timestamp: number, designation: string, groupId: number) => void;
}

const ItemsTable: React.FC<ItemsTableProps> = React.memo(({ items, onItemClick }) => {
  const { sortedItems, sortColumn, sortDirection, handleSort } = useSorting(items);
  const scrollRef = useScrollPreservation(sortedItems);

  // Memoized empty state
  const emptyState = useMemo(() => 
    <p>No items found in database</p>, 
  []);

  // Memoized sort class function
  const getSortClass = useCallback((column: SortColumn): string => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? 'sort-asc' : 'sort-desc';
    }
    return 'sortable';
  }, [sortColumn, sortDirection]);

  // Memoized column headers to prevent recreation
  const columnHeaders = useMemo(() => [
    { key: 'group' as SortColumn, label: 'Group' },
    { key: 'designation' as SortColumn, label: 'Designation' },
    { key: 'brand' as SortColumn, label: 'Brand' },
    { key: 'model' as SortColumn, label: 'Model' },
    { key: 'category' as SortColumn, label: 'Category' },
    { key: 'antenna' as SortColumn, label: 'Antenna' },
    { key: 'updated_atposix' as SortColumn, label: 'Last Update' },
    { key: 'sec' as SortColumn, label: 'Status' }
  ], []);

  if (!items || items.length === 0) {
    return emptyState;
  }

  return (
    <div className="data-table" ref={scrollRef}>
      <table className="data-table-header">
        <thead>
          <tr>
            {columnHeaders.map(({ key, label }) => (
              <th 
                key={key}
                className={getSortClass(key)} 
                onClick={() => handleSort(key)}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, index) => (
            <ItemRow 
              key={`${item.epc}-${index}`} 
              item={item} 
              onClick={onItemClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

// Add display name for debugging
ItemsTable.displayName = 'ItemsTable';

export default ItemsTable;