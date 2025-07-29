const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validators, handleValidationErrors } = require('../middleware/validation');
const ApiResponse = require('../utils/responseFormatter');
const { logger, loggers } = require('../config/logger');
const { DatabaseService } = require('../utils/dbOptimizations');

// Initialize database service
const dbService = new DatabaseService(pool);

// Get items with pagination and optimization
router.get('/', 
  validators.pagination, 
  handleValidationErrors,
  async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000; // Default to 1000 to maintain compatibility
    const groupId = req.query.group_id ? parseInt(req.query.group_id) : null;
    
    let items, total;
    
    if (groupId) {
      // Get items by specific group
      items = await dbService.getItemsByGroup(groupId, page, limit, req.correlationId);
      // For group filtering, we'd need a separate count query, but for now use items length
      total = items.length;
    } else {
      // Get all items with pagination
      [items, total] = await Promise.all([
        dbService.getAllItems(page, limit, req.correlationId),
        limit < 1000 ? dbService.getItemCount(req.correlationId) : null // Only get count if pagination is used
      ]);
    }
    
    logger.info('Items fetched successfully', {
      correlationId: req.correlationId,
      itemCount: items.length,
      page,
      limit,
      groupId
    });
    
    const meta = {
      count: items.length,
      endpoint: 'items',
      page,
      limit
    };
    
    // Add pagination info if total count was fetched
    if (total !== null) {
      meta.total = total;
      meta.totalPages = Math.ceil(total / limit);
      meta.hasNextPage = page < meta.totalPages;
      meta.hasPrevPage = page > 1;
    }
    
    return ApiResponse.success(res, items, meta);
    
  } catch (error) {
    logger.error('Failed to fetch items', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.databaseError(res, error);
  }
});

// Get single item by ID with optimization
router.get('/:id', 
  validators.itemId, 
  handleValidationErrors,
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const items = await dbService.getItemById(id, req.correlationId);
    
    if (items.length === 0) {
      logger.warn('Item not found', {
        correlationId: req.correlationId,
        itemId: id
      });
      return ApiResponse.notFound(res, 'Item');
    }
    
    logger.info('Item fetched successfully', {
      correlationId: req.correlationId,
      itemId: id
    });
    
    return ApiResponse.success(res, items[0], {
      itemId: id,
      cached: true // Indicate this might be from cache
    });
    
  } catch (error) {
    logger.error('Failed to fetch item', {
      correlationId: req.correlationId,
      itemId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.databaseError(res, error);
  }
});

module.exports = router;