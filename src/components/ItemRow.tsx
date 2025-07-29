import React from 'react';
import { Item } from '../services/ItemsService';

interface ItemRowProps {
  item: Item;
  onClick: (timestamp: number, designation: string, groupId: number) => void;
}

// Function to determine time-based CSS class in logarithmic fashion
const getTimeClass = (seconds: number): string => {
  if (seconds < 60) return 'time-fresh';        // < 1 minute - bright green
  if (seconds < 300) return 'time-recent';      // < 5 minutes - light green
  if (seconds < 900) return 'time-5min';        // < 15 minutes - yellow-green
  if (seconds < 1800) return 'time-15min';      // < 30 minutes - yellow
  if (seconds < 3600) return 'time-30min';      // < 1 hour - orange-yellow
  if (seconds < 7200) return 'time-1hour';      // < 2 hours - orange
  if (seconds < 21600) return 'time-2hour';     // < 6 hours - red-orange
  if (seconds < 43200) return 'time-6hour';     // < 12 hours - light red
  if (seconds < 86400) return 'time-12hour';    // < 24 hours - red
  if (seconds < 172800) return 'time-24hour';   // < 48 hours - dark red
  return 'time-48hour';                         // >= 48 hours - very dark red
};

// Function to format time elapsed
const formatTimeElapsed = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}j`;
  return `${Math.floor(seconds / 604800)}sem`;
};

const ItemRow: React.FC<ItemRowProps> = ({ item, onClick }) => {
  // Calculate real-time seconds elapsed from Unix timestamp
  const now = Math.floor(Date.now() / 1000);
  const secondsElapsed = now - (item.updated_atposix || item.sec);
  
  const timeClass = getTimeClass(secondsElapsed);
  const timeElapsed = formatTimeElapsed(secondsElapsed);

  const handleClick = () => {
    onClick(item.updated_atposix, item.designation || 'Unknown', item.group_id || 0);
  };

  return (
    <tr className={`item-clickable ${timeClass}`} onClick={handleClick}>
      <td>
        <span className="status-badge status-badge--neutral">{item.group || 'Unknown'}</span>
      </td>
      <td>
        <strong>{item.designation || 'N/A'}</strong>
      </td>
      <td>{item.brand || 'N/A'}</td>
      <td>{item.model || 'N/A'}</td>
      <td>{item.category || 'N/A'}</td>
      <td>{item.antenna || 'N/A'}</td>
      <td>{item.heure || 'N/A'}</td>
      <td>
        <span className="time-elapsed">vu il y a: {timeElapsed}</span>
      </td>
    </tr>
  );
};

ItemRow.displayName = 'ItemRow';

export default ItemRow;