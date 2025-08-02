import React, { useMemo, useCallback } from 'react';
import { Item } from '../services/ItemsService';
import { useSorting, SortColumn } from '../hooks/useSorting';
import { useScrollPreservation } from '../hooks/useScrollPreservation';
import { useSelection } from '../hooks/useSelection';
import ItemRow from './ItemRow';

interface ItemsTableProps {
  items: Item[];
  onItemClick: (timestamp: number, designation: string, groupId: number) => void;
  selectionMode?: boolean;
  onSelectionChange?: (selectedItems: Item[]) => void;
  editingItem?: number | null;
  onStartEdit?: (itemId: number) => void;
  onSaveEdit?: (itemId: number, updates: Partial<Item>) => void;
  onCancelEdit?: () => void;
  onDeleteItem?: (itemId: number) => void;
  categoryOptions?: string[];
}

const ItemsTable: React.FC<ItemsTableProps> = React.memo(({ 
  items, 
  onItemClick, 
  selectionMode = false, 
  onSelectionChange,
  editingItem,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteItem,
  categoryOptions
}) => {
  const { sortedItems, sortColumn, sortDirection, handleSort } = useSorting(items);
  const scrollRef = useScrollPreservation(sortedItems);
  const selection = useSelection(sortedItems);

  // Notify parent of selection changes
  React.useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selection.selectedItems);
    }
  }, [selection.selectedItems, onSelectionChange]);

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
    <div className={`data-table ${selectionMode ? 'selection-mode' : ''}`} ref={scrollRef}>
      {selectionMode && selection.selectionCount > 0 && (
        <div className="selection-info">
          <span>{selection.selectionCount} item(s) sélectionné(s)</span>
          <button onClick={selection.clearSelection} className="btn-link">
            Désélectionner tout
          </button>
        </div>
      )}
      <table className="data-table-header">
        <thead>
          <tr>
            {selectionMode && (
              <th className="selection-column">
                <input
                  type="checkbox"
                  checked={selection.isAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = selection.isPartiallySelected;
                  }}
                  onChange={selection.toggleAll}
                  title={selection.isAllSelected ? 'Désélectionner tout' : 'Sélectionner tout'}
                />
              </th>
            )}
            {selectionMode && <th className="edit-actions-column">Actions</th>}
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
        <tbody
          onMouseUp={selection.handleDragEnd}
          onMouseLeave={selection.handleDragEnd}
          style={{ userSelect: selection.isDragging ? 'none' : 'auto' }}
        >
          {sortedItems.map((item, index) => (
            <ItemRow 
              key={`${item.epc}-${index}`} 
              item={item} 
              index={index}
              onClick={onItemClick}
              selectionMode={selectionMode}
              isSelected={selection.isItemSelected(item.id)}
              onToggleSelect={selection.toggleItem}
              onItemClick={selection.handleRowClick}
              onMouseDown={selection.handleDragStart}
              onMouseEnter={selection.handleDragEnter}
              isDragging={selection.isDragging}
              editingItem={editingItem}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDeleteItem={onDeleteItem}
              categoryOptions={categoryOptions}
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