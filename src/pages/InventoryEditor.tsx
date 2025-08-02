import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Item, ItemsService } from '../services/ItemsService';
import { Group, GroupsService } from '../services/GroupsService';
import ItemsTable from '../components/ItemsTable';
import BulkActionsBar from '../components/BulkActionsBar';
import AddItemModal from '../components/AddItemModal';

const InventoryEditor: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedItems, setSelectedItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<number | null>(null);

  // Common categories for dropdown
  const categoryOptions = [
    'Caméra',
    'Microphone', 
    'Éclairage',
    'Accessoire',
    'Câble',
    'Batterie',
    'Stockage',
    'Audio',
    'Vidéo',
    'Trépied',
    'Objectif',
    'Moniteur',
    'Enregistreur',
    'Stabilisateur',
    'Drone'
  ];

  const itemsService = useMemo(() => new ItemsService(), []);
  const groupsService = useMemo(() => new GroupsService(), []);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔍 Loading data...');
      const [itemsData, groupsData] = await Promise.all([
        itemsService.getItemsWithRetry(1), // Force refresh with retry
        groupsService.getGroups()
      ]);
      console.log('🔍 Loaded groups:', groupsData);
      console.log('🔍 Loaded items count:', itemsData.length);
      setItems([...itemsData]); // Force new array reference
      setGroups(groupsData);
    } catch (err) {
      console.error('🔍 Load error:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [itemsService, groupsService]);

  // Filtered items based on search and group filter
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        (item.designation?.toLowerCase().includes(term)) ||
        (item.brand?.toLowerCase().includes(term)) ||
        (item.model?.toLowerCase().includes(term)) ||
        (item.category?.toLowerCase().includes(term)) ||
        (item.epc?.toLowerCase().includes(term))
      );
    }

    // Group filter
    if (selectedGroupFilter !== null) {
      filtered = filtered.filter(item => item.group_id === selectedGroupFilter);
    }

    return filtered;
  }, [items, searchTerm, selectedGroupFilter]);

  // Handlers
  const handleAddItem = useCallback(async (item: Partial<Item>) => {
    try {
      console.log('🔍 Adding item:', item);
      await itemsService.createItem(item);
      console.log('🔍 Item added, refreshing data...');
      await loadData(); // Refresh data
      console.log('🔍 Data refreshed after add');
    } catch (error) {
      console.error('🔍 Add item error:', error);
      throw error;
    }
  }, [itemsService, loadData]);

  const handleBulkDelete = useCallback(async (itemIds: number[]) => {
    try {
      console.log('🔍 Bulk deleting items:', itemIds);
      await itemsService.bulkDelete(itemIds);
      console.log('🔍 Items deleted, refreshing data...');
      await loadData();
      console.log('🔍 Data refreshed after bulk delete');
    } catch (error) {
      console.error('🔍 Bulk delete error:', error);
      alert('Erreur lors de la suppression en lot');
    }
  }, [itemsService, loadData]);

  const handleBulkUpdateGroup = useCallback(async (itemIds: number[], groupId: number) => {
    await itemsService.bulkUpdateGroup(itemIds, groupId);
    await loadData();
  }, [itemsService, loadData]);

  const handleBulkUpdateCategory = useCallback(async (itemIds: number[], category: string) => {
    await itemsService.bulkUpdateCategory(itemIds, category);
    await loadData();
  }, [itemsService, loadData]);

  const handleSelectionChange = useCallback((items: Item[]) => {
    setSelectedItems(items);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedItems([]);
  }, []);

  const handleStartEdit = useCallback((itemId: number) => {
    setEditingItem(itemId);
  }, []);

  const handleSaveEdit = useCallback(async (itemId: number, updates: Partial<Item>) => {
    try {
      console.log('🔍 Updating item:', itemId, updates);
      await itemsService.updateItem(itemId, updates);
      setEditingItem(null);
      console.log('🔍 Item updated, refreshing data...');
      await loadData(); // Refresh data
      console.log('🔍 Data refreshed after edit');
    } catch (error) {
      console.error('🔍 Edit item error:', error);
      alert('Erreur lors de la modification de l\'item');
    }
  }, [itemsService, loadData]);

  const handleCancelEdit = useCallback(() => {
    setEditingItem(null);
  }, []);

  const handleDeleteItem = useCallback(async (itemId: number) => {
    try {
      console.log('🔍 Deleting item:', itemId);
      await itemsService.deleteItem(itemId);
      console.log('🔍 Item deleted, waiting 100ms before refresh...');
      
      // Small delay to ensure DB consistency
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('🔍 Refreshing data...');
      await loadData(); // Refresh data
      console.log('🔍 Data refreshed after delete');
    } catch (error) {
      console.error('🔍 Delete item error:', error);
      alert('Erreur lors de la suppression de l\'item');
    }
  }, [itemsService, loadData]);

  // Debug log
  console.log('🔍 InventoryEditor render - groups:', groups.length, groups);

  // Dummy onClick handler (no CCTV in editor mode)
  const handleItemClick = useCallback((timestamp: number, designation: string, groupId: number) => {
    // No action in editor mode - items are editable, not clickable for CCTV
    console.log('Item clicked in editor mode - no action');
  }, []);

  return (
    <div className="surface-card">
      {/* Header */}
      <div className="surface-card-header">
        <div className="stack-horizontal stack-between">
          <div className="flex-items-gap-3">
            <div className="icon-container icon-container-primary">
              <svg className="icon-medium" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
              </svg>
            </div>
            <div>
              <h2 className="surface-card-title">Gestion de l'Inventaire</h2>
              <p className="surface-card-subtitle">Édition en lot, filtres et recherche avancée</p>
            </div>
          </div>
          <div className="flex-items-gap-3">
            <button 
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary"
            >
              <svg className="icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nouvel Item</span>
            </button>
            <button 
              onClick={loadData}
              className="btn btn-secondary"
              disabled={loading}
            >
              <svg className="icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Actualiser</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="search">Recherche</label>
          <input
            id="search"
            type="text"
            placeholder="Nom, marque, modèle, catégorie, EPC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="group-filter">Groupe</label>
          <select
            id="group-filter"
            value={selectedGroupFilter || ''}
            onChange={(e) => setSelectedGroupFilter(e.target.value ? Number(e.target.value) : null)}
            className="form-select"
          >
            <option value="">Tous les groupes</option>
            {groups.map(group => (
              <option key={group.group_id} value={group.group_id}>
                {group.group_name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-stats">
          <span className="items-count">
            {filteredItems.length} / {items.length} items
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert-message alert-message--error">
          <strong>❌ ERREUR:</strong> {error}
          <button onClick={() => setError(null)} className="btn-link">✕</button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-message">
          <div className="spinner"></div>
          <span>Chargement de l'inventaire...</span>
        </div>
      )}

      {/* Bulk Actions Bar - Always visible */}
      <div className="bulk-actions-visible">
        <BulkActionsBar
          selectedItems={selectedItems}
          onDelete={handleBulkDelete}
          onUpdateGroup={handleBulkUpdateGroup}
          onUpdateCategory={handleBulkUpdateCategory}
          onClearSelection={handleClearSelection}
          groups={groups}
        />
      </div>

      {/* Items Table */}
      <div className="has-bulk-actions">
        <ItemsTable 
          items={filteredItems} 
          onItemClick={handleItemClick}
          selectionMode={true}
          onSelectionChange={handleSelectionChange}
          editingItem={editingItem}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onDeleteItem={handleDeleteItem}
          categoryOptions={categoryOptions}
        />
      </div>

      {/* Add Item Modal */}
      <AddItemModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddItem}
      />
    </div>
  );
};

export default InventoryEditor;