import React from 'react';
import SimpleMultiCameraView from '../SimpleMultiCameraView';

interface CCTVModalProps {
  isVisible: boolean;
  targetTimestamp: number;
  itemName: string;
  isSearching: boolean;
  onClose: () => void;
  onError: (error: string) => void;
  position?: 'center' | 'left' | 'right';
}

const CCTVModal: React.FC<CCTVModalProps> = ({
  isVisible,
  targetTimestamp,
  itemName,
  isSearching,
  onClose,
  onError,
  position = 'center'
}) => {
  if (!isVisible) return null;

  const getModalClasses = () => {
    switch (position) {
      case 'left':
        return 'modal-backdrop modal-left';
      case 'right':
        return 'modal-backdrop modal-right';
      default:
        return 'modal-backdrop';
    }
  };

  const getSurfaceClasses = () => {
    switch (position) {
      case 'left':
        return 'modal-surface modal-surface-left';
      case 'right':
        return 'modal-surface modal-surface-right';
      default:
        return 'modal-surface';
    }
  };

  return (
    <div className={getModalClasses()} onClick={onClose}>
      <div className={getSurfaceClasses()} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            📹 CCTV Footage - {itemName}
          </h2>
          <button 
            className="button button--subtle"
            onClick={onClose}
            aria-label="Close CCTV modal"
          >
            ✕
          </button>
        </div>
        
        <div className="modal-content">
          <SimpleMultiCameraView
            targetTimestamp={targetTimestamp}
            onError={onError}
            isSearching={isSearching}
            itemName={itemName}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
};

export default CCTVModal;