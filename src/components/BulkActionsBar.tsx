import React, { useState, useEffect, useRef } from 'react';
import { Item } from '../services/ItemsService';
import { Group } from '../services/GroupsService';

interface BulkActionsBarProps {
  selectedItems: Item[];
  onDelete: (itemIds: number[]) => Promise<void>;
  onUpdateGroup: (itemIds: number[], groupId: number) => Promise<void>;
  onUpdateCategory: (itemIds: number[], category: string) => Promise<void>;
  onClearSelection: () => void;
  groups: Group[];
}

const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedItems,
  onDelete,
  onUpdateGroup,
  onUpdateCategory,
  onClearSelection,
  groups = []
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showGroupSelect, setShowGroupSelect] = useState(false);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categoryMode, setCategoryMode] = useState<'predefined' | 'custom'>('predefined');
  
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(target)) {
        setShowGroupSelect(false);
      }
      
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(target)) {
        setShowCategoryInput(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Common categories (could be fetched from API later)
  const commonCategories = [
    'Caméra',
    'Microphone', 
    'Éclairage',
    'Accessoire',
    'Câble',
    'Batterie',
    'Stockage',
    'Audio',
    'Vidéo',
    'Trépied'
  ];

  const selectedIds = selectedItems.map(item => item.id);
  const count = selectedItems.length;

  const handleDelete = async () => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer ${count} item(s) ?`)) {
      return;
    }

    setIsLoading(true);
    try {
      await onDelete(selectedIds);
      onClearSelection();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression des items');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGroupChange = async (groupId: number) => {
    setIsLoading(true);
    try {
      await onUpdateGroup(selectedIds, groupId);
      setShowGroupSelect(false);
      onClearSelection();
    } catch (error) {
      console.error('Erreur lors du changement de groupe:', error);
      alert('Erreur lors du changement de groupe');
    } finally {
      setIsLoading(false);
    }
  };

  // Debug log
  console.log('🔍 BulkActionsBar groups:', groups.length, 'showGroupSelect:', showGroupSelect);

  const handleCategorySelect = async (category: string) => {
    setIsLoading(true);
    try {
      await onUpdateCategory(selectedIds, category);
      setShowCategoryInput(false);
      setNewCategory('');
      onClearSelection();
    } catch (error) {
      console.error('Erreur lors du changement de catégorie:', error);
      alert('Erreur lors du changement de catégorie');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorySubmit = async () => {
    if (!newCategory.trim()) return;
    await handleCategorySelect(newCategory.trim());
  };

  return (
    <div className="bulk-actions-bar">
      <div className="bulk-actions-info">
        <span className="bulk-count">{count} item(s) sélectionné(s)</span>
        <button 
          onClick={onClearSelection}
          className="btn-link"
          disabled={isLoading}
        >
          Annuler
        </button>
      </div>

      <div className="bulk-actions-buttons">
        {/* Delete Action */}
        <button
          onClick={handleDelete}
          className="btn btn-danger btn-sm"
          disabled={isLoading}
          title="Supprimer les items sélectionnés"
        >
          🗑️ Supprimer
        </button>

        {/* Group Action */}
        <div className="bulk-action-dropdown" ref={groupDropdownRef}>
          <button
            onClick={() => {
              setShowGroupSelect(!showGroupSelect);
              setShowCategoryInput(false); // Close category dropdown
            }}
            className="btn btn-secondary btn-sm"
            disabled={isLoading}
          >
            📦 Groupe
          </button>
          {showGroupSelect && (
            <div className="dropdown-menu dropdown-menu-groups">
              {groups.length === 0 ? (
                <div className="dropdown-item dropdown-empty">
                  Aucun groupe disponible
                </div>
              ) : (
                groups.map(group => {
                  console.log('🔍 Rendering group:', group);
                  return (
                    <button
                      key={group.id}
                      onClick={() => handleGroupChange(Number(group.group_id))}
                      className="dropdown-item dropdown-group-item"
                      disabled={isLoading}
                    >
                      <span className="group-icon">📦</span>
                      <span className="group-name">{group.group_name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Category Action */}
        <div className="bulk-action-dropdown" ref={categoryDropdownRef}>
          <button
            onClick={() => {
              setShowCategoryInput(!showCategoryInput);
              setShowGroupSelect(false); // Close group dropdown
            }}
            className="btn btn-secondary btn-sm"
            disabled={isLoading}
          >
            🏷️ Catégorie
          </button>
          {showCategoryInput && (
            <div className="dropdown-menu category-dropdown">
              <div className="category-tabs">
                <button
                  onClick={() => setCategoryMode('predefined')}
                  className={`tab-button ${categoryMode === 'predefined' ? 'active' : ''}`}
                >
                  Courantes
                </button>
                <button
                  onClick={() => setCategoryMode('custom')}
                  className={`tab-button ${categoryMode === 'custom' ? 'active' : ''}`}
                >
                  Personnalisée
                </button>
              </div>

              {categoryMode === 'predefined' ? (
                <div className="category-grid">
                  {commonCategories.map(category => (
                    <button
                      key={category}
                      onClick={() => handleCategorySelect(category)}
                      className="category-button"
                      disabled={isLoading}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="category-input-form">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Nouvelle catégorie"
                    className="form-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleCategorySubmit()}
                    autoFocus
                  />
                  <div className="category-input-buttons">
                    <button
                      onClick={handleCategorySubmit}
                      className="btn btn-primary btn-xs"
                      disabled={!newCategory.trim() || isLoading}
                    >
                      Valider
                    </button>
                    <button
                      onClick={() => {
                        setShowCategoryInput(false);
                        setNewCategory('');
                        setCategoryMode('predefined');
                      }}
                      className="btn btn-secondary btn-xs"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="bulk-loading">
          <div className="spinner"></div>
          <span>Traitement en cours...</span>
        </div>
      )}
    </div>
  );
};

export default BulkActionsBar;