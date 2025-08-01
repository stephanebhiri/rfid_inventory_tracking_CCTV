import React, { useState } from 'react';
import { Item } from '../services/ItemsService';
import GroupSelect from './GroupSelect';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (item: Partial<Item>) => Promise<void>;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    designation: '',
    brand: '',
    model: '',
    serial_number: '',
    epc: '',
    inventory_code: '',
    category: '',
    group_id: 1
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'group_id' ? parseInt(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.designation.trim()) {
      alert('Designation est obligatoire');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setFormData({
        designation: '',
        brand: '',
        model: '',
        serial_number: '',
        epc: '',
        inventory_code: '',
        category: '',
        group_id: 1
      });
      onClose();
    } catch (error) {
      console.error('Erreur lors de l\'ajout:', error);
      alert('Erreur lors de l\'ajout de l\'item');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Ajouter un nouvel item</h2>
          <button onClick={onClose} className="btn-close">✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="designation">Designation *</label>
              <input
                type="text"
                id="designation"
                name="designation"
                value={formData.designation}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="brand">Marque</label>
              <input
                type="text"
                id="brand"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="model">Modèle</label>
              <input
                type="text"
                id="model"
                name="model"
                value={formData.model}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="serial_number">Numéro de série</label>
              <input
                type="text"
                id="serial_number"
                name="serial_number"
                value={formData.serial_number}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="epc">EPC</label>
              <input
                type="text"
                id="epc"
                name="epc"
                value={formData.epc}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="inventory_code">Code inventaire</label>
              <input
                type="text"
                id="inventory_code"
                name="inventory_code"
                value={formData.inventory_code}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">Catégorie</label>
              <input
                type="text"
                id="category"
                name="category"
                value={formData.category}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="group_id">Groupe</label>
              <GroupSelect
                id="group_id"
                name="group_id"
                value={formData.group_id}
                onChange={(value) => setFormData(prev => ({ ...prev, group_id: value }))}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              onClick={onClose}
              className="btn btn-secondary"
            >
              Annuler
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;