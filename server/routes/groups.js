const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const ApiResponse = require('../utils/responseFormatter');
const { logger } = require('../logger');

// Get all groups
router.get('/', async (req, res) => {
  console.log('🎯 Groups route hit!');
  try {
    const query = 'SELECT * FROM groupname ORDER BY group_id';
    const [groups] = await pool.execute(query);
    
    logger.info('Groups fetched successfully', {
      correlationId: req.correlationId,
      groupCount: groups.length
    });
    
    return ApiResponse.success(res, groups, {
      count: groups.length,
      endpoint: 'groups'
    });
    
  } catch (error) {
    logger.error('Failed to fetch groups', {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack
    });
    return ApiResponse.databaseError(res, error);
  }
});

module.exports = router;