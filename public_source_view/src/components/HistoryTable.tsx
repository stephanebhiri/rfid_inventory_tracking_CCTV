import React, { useMemo, useCallback, useState } from 'react';
import { HistoryItem } from '../services/HistoryService';
import { useScrollPreservation } from '../hooks/useScrollPreservation';

type HistorySortColumn = 
  | 'group' 
  | 'designation' 
  | 'depposix' 
  | 'retposix' 
  | 'antenna_dep' 
  | 'antenna_ret' 
  | 'inventory_code' 
  | 'delai';

type SortDirection = 'asc' | 'desc';

interface HistoryTableProps {
  items: HistoryItem[];
  onCCTVClick: (timestamp: number, designation: string, mode: 'départ' | 'retour') => void;
  searchQuery: string;
}

const HistoryTable: React.FC<HistoryTableProps> = ({ items, onCCTVClick, searchQuery }) => {
  const [sortColumn, setSortColumn] = useState<HistorySortColumn>('retposix');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Custom sorting for history items
  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
    
    return sorted;
  }, [items, sortColumn, sortDirection]);

  const scrollRef = useScrollPreservation(sortedItems);

  // Handle column sorting
  const handleSort = useCallback((column: HistorySortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedItems;
    
    const query = searchQuery.toLowerCase();
    return sortedItems.filter(item => 
      item.designation.toLowerCase().includes(query) ||
      item.inventory_code.toLowerCase().includes(query) ||
      item.group.toLowerCase().includes(query) ||
      item.antenna_dep.toLowerCase().includes(query) ||
      item.antenna_ret.toLowerCase().includes(query)
    );
  }, [sortedItems, searchQuery]);

  // Memoized sort class function
  const getSortClass = useCallback((column: HistorySortColumn): string => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? 'sort-asc' : 'sort-desc';
    }
    return 'sortable';
  }, [sortColumn, sortDirection]);

  // Memoized column headers
  const columnHeaders = useMemo(() => [
    { key: 'group' as HistorySortColumn, label: 'Group' },
    { key: 'designation' as HistorySortColumn, label: 'Designation' },
    { key: 'depposix' as HistorySortColumn, label: 'Départ le' },
    { key: 'antenna_dep' as HistorySortColumn, label: 'Ant_D' },
    { key: 'retposix' as HistorySortColumn, label: 'Retour le' },
    { key: 'antenna_ret' as HistorySortColumn, label: 'Ant_R' },
    { key: 'inventory_code' as HistorySortColumn, label: 'CODE INV' },
    { key: 'delai' as HistorySortColumn, label: 'Durée du Départ' }
  ], []);

  if (!items || items.length === 0) {
    return <p>No history items found</p>;
  }

  return (
    <div className="data-table" ref={scrollRef}>
      <table className="data-table">
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
          {filteredItems.map((item, index) => (
            <tr key={`${item.inventory_code}-${index}`} className="data-table-body-row">
              <td>{item.group}</td>
              <td>{item.designation}</td>
              <td>
                <button 
                  className="btn btn-primary btn-sm cctv-button"
                  onClick={() => onCCTVClick(item.depposix, item.designation, 'départ')}
                >
                  {item.dep}
                </button>
              </td>
              <td>{item.antenna_dep}</td>
              <td>
                <button 
                  className="btn btn-secondary btn-sm cctv-button"
                  onClick={() => onCCTVClick(item.retposix, item.designation, 'retour')}
                >
                  {item.ret}
                </button>
              </td>
              <td>{item.antenna_ret}</td>
              <td>{item.inventory_code}</td>
              <td className="status-badge status-badge--neutral">{item.delai}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryTable;