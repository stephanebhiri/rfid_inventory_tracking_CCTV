const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validators, handleValidationErrors } = require('../middleware/validation');
const ApiResponse = require('../utils/responseFormatter');
const { logger, loggers } = require('../logger');
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

// Create new item
router.post('/', async (req, res) => {
  try {
    console.log('🔍 POST /api/items - Request body:', JSON.stringify(req.body, null, 2));
    
    const {
      designation,
      brand = '',
      model = '',
      serial_number = '',
      epc = '',
      inventory_code = '',
      category = '',
      group_id = 1
    } = req.body;

    console.log('🔍 Extracted values:', { designation, brand, model, serial_number, epc, inventory_code, category, group_id });

    if (!designation || designation.trim() === '') {
      return ApiResponse.badRequest(res, 'Designation is required');
    }

    // Generate unique EPC if not provided
    let finalEpc = epc;
    if (!finalEpc || finalEpc.trim() === '') {
      const prefix = '300833B2DDD9014';
      const randomHex = Array.from({ length: 9 }, () => 
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
      ).join('');
      finalEpc = prefix + randomHex;
      console.log('🔍 Generated EPC:', finalEpc);
    } else {
      console.log('🔍 Using provided EPC:', finalEpc);
    }

    const query = `
      INSERT INTO item (
        designation, brand, model, serial_number, epc, 
        inventory_code, category, group_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    console.log('🔍 Final values before INSERT:', {
      designation: designation.trim(),
      brand: brand.trim(),
      model: model.trim(),
      serial_number: serial_number.trim(),
      finalEpc: finalEpc.trim(),
      inventory_code: inventory_code.trim(),
      category: category.trim(),
      group_id: parseInt(group_id)
    });

    const [result] = await pool.execute(query, [
      designation.trim(),
      brand.trim(),
      model.trim(),
      serial_number.trim(),
      finalEpc.trim(),
      inventory_code.trim(),
      category.trim(),
      parseInt(group_id)
    ]);

    const itemId = result.insertId;
    
    // Fetch the created item
    const selectQuery = `
      SELECT i.*, g.group_name as \`group\`, UNIX_TIMESTAMP(i.updated_at) as updated_atposix
      FROM item i 
      LEFT JOIN groupname g ON i.group_id = g.group_id
      WHERE i.id = ?
    `;
    
    const [createdItem] = await pool.execute(selectQuery, [itemId]);

    logger.info('Item created successfully', {
      correlationId: req.correlationId,
      itemId,
      designation
    });

    return ApiResponse.success(res, createdItem[0], {
      itemId,
      endpoint: 'items'
    });

  } catch (error) {
    logger.error('Failed to create item', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.databaseError(res, error);
  }
});

// Bulk delete items
router.delete('/bulk', async (req, res) => {
  try {
    console.log('🗑️ Bulk delete request:', JSON.stringify(req.body, null, 2));
    
    const { itemIds } = req.body;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return ApiResponse.badRequest(res, 'itemIds array is required');
    }

    // Validate all IDs are numbers
    const validIds = itemIds.filter(id => Number.isInteger(Number(id)));
    if (validIds.length !== itemIds.length) {
      return ApiResponse.badRequest(res, 'All itemIds must be valid integers');
    }

    const placeholders = validIds.map(() => '?').join(',');
    const deleteQuery = `DELETE FROM item WHERE id IN (${placeholders})`;
    
    const [result] = await pool.execute(deleteQuery, validIds);
    
    logger.info('Bulk delete completed', {
      correlationId: req.correlationId,
      deletedCount: result.affectedRows,
      requestedCount: validIds.length
    });

    return ApiResponse.success(res, {
      deletedCount: result.affectedRows,
      requestedCount: validIds.length
    });

  } catch (error) {
    logger.error('Failed to bulk delete items', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.databaseError(res, error);
  }
});

// Bulk update group
router.patch('/bulk/group', async (req, res) => {
  try {
    console.log('📦 Bulk group update request:', JSON.stringify(req.body, null, 2));
    
    const { itemIds, groupId } = req.body;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return ApiResponse.badRequest(res, 'itemIds array is required');
    }

    if (!Number.isInteger(Number(groupId))) {
      return ApiResponse.badRequest(res, 'groupId must be a valid integer');
    }

    const validIds = itemIds.filter(id => Number.isInteger(Number(id)));
    if (validIds.length !== itemIds.length) {
      return ApiResponse.badRequest(res, 'All itemIds must be valid integers');
    }

    const placeholders = validIds.map(() => '?').join(',');
    const updateQuery = `UPDATE item SET group_id = ?, updated_at = NOW() WHERE id IN (${placeholders})`;
    
    const [result] = await pool.execute(updateQuery, [groupId, ...validIds]);
    
    logger.info('Bulk group update completed', {
      correlationId: req.correlationId,
      updatedCount: result.affectedRows,
      requestedCount: validIds.length,
      newGroupId: groupId
    });

    return ApiResponse.success(res, {
      updatedCount: result.affectedRows,
      requestedCount: validIds.length,
      groupId: groupId
    });

  } catch (error) {
    logger.error('Failed to bulk update group', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.databaseError(res, error);
  }
});

// Bulk update category
router.patch('/bulk/category', async (req, res) => {
  try {
    console.log('🏷️ Bulk category update request:', JSON.stringify(req.body, null, 2));
    
    const { itemIds, category } = req.body;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return ApiResponse.badRequest(res, 'itemIds array is required');
    }

    if (!category || typeof category !== 'string') {
      return ApiResponse.badRequest(res, 'category must be a non-empty string');
    }

    const validIds = itemIds.filter(id => Number.isInteger(Number(id)));
    if (validIds.length !== itemIds.length) {
      return ApiResponse.badRequest(res, 'All itemIds must be valid integers');
    }

    const placeholders = validIds.map(() => '?').join(',');
    const updateQuery = `UPDATE item SET category = ?, updated_at = NOW() WHERE id IN (${placeholders})`;
    
    const [result] = await pool.execute(updateQuery, [category.trim(), ...validIds]);
    
    logger.info('Bulk category update completed', {
      correlationId: req.correlationId,
      updatedCount: result.affectedRows,
      requestedCount: validIds.length,
      newCategory: category.trim()
    });

    return ApiResponse.success(res, {
      updatedCount: result.affectedRows,
      requestedCount: validIds.length,
      category: category.trim()
    });

  } catch (error) {
    logger.error('Failed to bulk update category', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.databaseError(res, error);
  }
});

// Update single item
router.patch('/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    const updates = req.body;
    
    // Build dynamic UPDATE query
    const allowedFields = ['designation', 'brand', 'model', 'category', 'inventory_code', 'serial_number'];
    const fieldsToUpdate = Object.keys(updates).filter(field => allowedFields.includes(field));
    
    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
    const values = fieldsToUpdate.map(field => updates[field]);
    values.push(itemId);

    const updateQuery = `
      UPDATE item 
      SET ${setClause}, updated_at = NOW() 
      WHERE id = ?
    `;

    const [result] = await pool.execute(updateQuery, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Fetch updated item
    const [rows] = await pool.execute(`
      SELECT i.*, g.group_name as \`group\`, UNIX_TIMESTAMP(i.updated_at) as updated_atposix
      FROM item i
      LEFT JOIN groupname g ON i.group_id = g.group_id
      WHERE i.id = ?
    `, [itemId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Updated item not found' });
    }

    return ApiResponse.success(res, rows[0]);
  } catch (error) {
    logger.error('Error updating item:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to update item',
      details: error.message 
    });
  }
});

module.exports = router;