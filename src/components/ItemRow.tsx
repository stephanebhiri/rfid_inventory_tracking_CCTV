import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Item } from '../services/ItemsService';

interface ItemRowProps {
  item: Item;
  index: number;
  onClick: (timestamp: number, designation: string, groupId: number) => void;
  isSelected?: boolean;
  onToggleSelect?: (itemId: number) => void;
  selectionMode?: boolean;
  onItemClick?: (itemId: number, itemIndex: number, event: React.MouseEvent) => void;
  onMouseDown?: (itemIndex: number) => void;
  onMouseEnter?: (itemIndex: number) => void;
  isDragging?: boolean;
  editingItem?: number | null;
  onStartEdit?: (itemId: number) => void;
  onSaveEdit?: (itemId: number, updates: Partial<Item>) => void;
  onCancelEdit?: () => void;
  onDeleteItem?: (itemId: number) => void;
  // Options pour le dropdown de catégorie (facultatif : défaut -> input texte)
  categoryOptions?: string[];
}

// --- Dropdown léger, accessible, rendu en portail ---
function CategoryDropdown({
  value,
  options,
  onSelect,
  onClose,
}: {
  value?: string;
  options: string[];
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(280, vw - 16);
    let top = r.bottom;
    let left = Math.min(r.left, vw - width - 8);
    const estHeight = 240;
    if (top + estHeight > vh) top = Math.max(0, r.top - estHeight);
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      // Close if clicking outside this dropdown
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
        onClose();
      }
    };
    // Close this dropdown if another dropdown is opened
    const onOtherDropdown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if clicking on another dropdown trigger
      if (target.classList.contains('dropdown-trigger') && target !== btnRef.current) {
        setOpen(false);
        onClose();
      }
    };
    const onR = () => place();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('click', onOtherDropdown, true);
    window.addEventListener('resize', onR);
    window.addEventListener('scroll', onR, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('click', onOtherDropdown, true);
      window.removeEventListener('resize', onR);
      window.removeEventListener('scroll', onR, true);
    };
  }, [open, place, onClose]);

  const mountMenu = open && ReactDOM.createPortal(
    <div
      ref={menuRef}
      role="listbox"
      tabIndex={-1}
      aria-label="Choisir une catégorie"
      className="dropdown-menu"
      style={{ 
        position: 'fixed', 
        top: pos.top, 
        left: pos.left, 
        width: pos.width, 
        maxHeight: 240, 
        overflowY: 'auto',
        zIndex: 9999  // Force high z-index to avoid overlap
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); onClose(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
        else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
        else if (e.key === 'Enter') {
          const v = options[active];
          onSelect(v);
          setOpen(false);
          onClose();
        }
      }}
    >
      {options.map((opt, i) => (
        <div
          key={opt}
          role="option"
          aria-selected={i === active}
          className={`dropdown-item ${i === active ? 'is-active' : ''}`}
          onMouseDown={(e) => e.preventDefault()} // ne pas perdre le focus
          onClick={() => { onSelect(opt); setOpen(false); onClose(); }}
          onMouseEnter={() => setActive(i)}
        >
          {opt}
        </div>
      ))}
    </div>,
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="dropdown-trigger inline-edit-input"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => (o ? o : (place(), true))); }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault(); setOpen(true); setActive(0); setTimeout(place, 0);
          }
        }}
        title="Choisir une catégorie"
      >
        {value ?? 'Choisir…'}
      </button>
      {mountMenu}
    </>
  );
}

// Time buckets (data-driven)
const TIME_BUCKETS: ReadonlyArray<[limit: number, cls: string]> = [
  [60, 'time-fresh'],
  [300, 'time-recent'],
  [900, 'time-5min'],
  [1800, 'time-15min'],
  [3600, 'time-30min'],
  [7200, 'time-1hour'],
  [21600, 'time-2hour'],
  [43200, 'time-6hour'],
  [86400, 'time-12hour'],
  [172800, 'time-24hour'],
];
const getTimeClass = (seconds: number): string =>
  TIME_BUCKETS.find(([t]) => seconds < t)?.[1] ?? 'time-48hour';

// Function to format time elapsed
const formatTimeElapsed = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}j`;
  return `${Math.floor(seconds / 604800)}sem`;
};

const ItemRow: React.FC<ItemRowProps> = ({
  item,
  index,
  onClick,
  isSelected = false,
  onToggleSelect,
  selectionMode = false,
  onItemClick,
  onMouseDown,
  onMouseEnter,
  isDragging = false,
  editingItem,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteItem,
  categoryOptions
}) => {
  // Calculate real-time seconds elapsed from Unix timestamp (safe + consistent)
  const now = Math.floor(Date.now() / 1000);
  const timestamp = item.updated_atposix ?? item.sec ?? 0;
  const secondsElapsed = Math.max(0, now - timestamp);
  
  const timeClass = getTimeClass(secondsElapsed);
  const timeElapsed = formatTimeElapsed(secondsElapsed);
  
  const isEditing = editingItem === item.id;
  const [editValues, setEditValues] = useState({
    designation: item.designation || '',
    brand: item.brand || '',
    model: item.model || '',
    category: item.category || ''
  });

  // Keep local edit state in sync when entering edit mode or when item changes
  useEffect(() => {
    if (isEditing) {
      setEditValues({
        designation: item.designation || '',
        brand: item.brand || '',
        model: item.model || '',
        category: item.category || ''
      });
    }
  }, [isEditing, item.designation, item.brand, item.model, item.category]);

  // Single vs double click handling
  const CLICK_DELAY = 200;
  const clickTimerRef = useRef<number | null>(null);
  const clearClickTimer = () => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };
  const handleRowClick = useCallback((e: React.MouseEvent<HTMLTableRowElement>) => {
    if (isEditing) return; // ignore during editing
    if (selectionMode) {
      onItemClick?.(item.id, index, e);
      return;
    }
    clearClickTimer();
    // defer open to see if a dblclick occurs
    clickTimerRef.current = window.setTimeout(() => {
      onClick(timestamp, item.designation || 'Unknown', item.group_id || 0);
      clearClickTimer();
    }, CLICK_DELAY);
  }, [isEditing, selectionMode, onItemClick, item.id, index, onClick, timestamp, item.designation, item.group_id]);



  const handleDoubleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    e.stopPropagation();
    if (!isEditing) {
      clearClickTimer(); // cancel pending single-click action
      onStartEdit?.(item.id);
    }
  };

  const handleSave = () => {
    if (onSaveEdit) {
      onSaveEdit(item.id, editValues);
    }
  };

  const handleCancel = () => {
    setEditValues({
      designation: item.designation || '',
      brand: item.brand || '',
      model: item.model || '',
      category: item.category || ''
    });
    if (onCancelEdit) {
      onCancelEdit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteItem && window.confirm(`Êtes-vous sûr de vouloir supprimer "${item.designation}" ?`)) {
      onDeleteItem(item.id);
    }
  };

  return (
    <tr 
      className={`item-clickable ${timeClass} ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`} 
      onClick={handleRowClick}
      onDoubleClick={handleDoubleClick}
      tabIndex={0}
      aria-selected={!!isSelected}
      onMouseDown={(e) => {
        if (selectionMode && !isEditing && e.button === 0) {
          const target = e.target as HTMLElement;
          // Don't start drag on interactive elements
          if (target.tagName !== 'INPUT' && target.tagName !== 'BUTTON') {
            e.preventDefault();
            if (onMouseDown) onMouseDown(index);
          }
        }
      }}
      onMouseEnter={() => {
        if (selectionMode && onMouseEnter && isDragging && !isEditing) {
          onMouseEnter(index);
        }
      }}
      style={{ cursor: isEditing ? 'text' : 'pointer' }}
    >
      {selectionMode && (
        <td className="selection-column">
          <input
            type="checkbox"
            checked={isSelected}
            readOnly
            tabIndex={-1}
            className="selection-checkbox"
            style={{ pointerEvents: 'none' }}
          />
        </td>
      )}
      {selectionMode && (
        <td className="edit-actions-column">
          {isEditing ? (
            <div className="inline-edit-actions">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="btn-edit-save"
                title="Sauvegarder (Entrée)"
              >
                ✓
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="btn-edit-cancel"
                title="Annuler (Échap)"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="inline-edit-actions">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(e);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="btn-delete-item"
                title="Supprimer cet item"
              >
                🗑️
              </button>
            </div>
          )}
        </td>
      )}
      <td>
        <span className="status-badge status-badge--neutral">{item.group || 'Unknown'}</span>
      </td>
      <td>
        {isEditing ? (
          <input
            type="text"
            value={editValues.designation}
            onChange={(e) => setEditValues(prev => ({...prev, designation: e.target.value}))}
            onKeyDown={handleKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-edit-input"
            autoFocus
          />
        ) : (
          <strong>{item.designation || 'N/A'}</strong>
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            type="text"
            value={editValues.brand}
            onChange={(e) => setEditValues(prev => ({...prev, brand: e.target.value}))}
            onKeyDown={handleKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-edit-input"
          />
        ) : (
          item.brand || 'N/A'
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            type="text"
            value={editValues.model}
            onChange={(e) => setEditValues(prev => ({...prev, model: e.target.value}))}
            onKeyDown={handleKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-edit-input"
          />
        ) : (
          item.model || 'N/A'
        )}
      </td>
      <td>
        {isEditing ? (
          categoryOptions && categoryOptions.length > 0 ? (
            <CategoryDropdown
              value={editValues.category}
              options={categoryOptions}
              onSelect={(v) => setEditValues(prev => ({ ...prev, category: v }))}
              onClose={() => {/* retour du focus géré dans le bouton */}}
            />
          ) : (
            <input
              type="text"
              value={editValues.category}
              onChange={(e) => setEditValues(prev => ({...prev, category: e.target.value}))}
              onKeyDown={handleKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              className="inline-edit-input"
            />
          )
        ) : (
          item.category || 'N/A'
        )}
      </td>
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