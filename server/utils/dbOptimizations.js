const { LRUCache } = require('lru-cache');
const { logger } = require('../config/logger');

// Query result cache with TTL
const queryCache = new LRUCache({
  max: 100,
  ttl: 1000 * 5, // 5 seconds
  updateAgeOnGet: false // Don't reset TTL on access for real-time data
});

/**
 * Optimized SQL queries with modern JOIN syntax and performance improvements
 */
const optimizedQueries = {
  /**
   * Get all items with pagination and modern JOIN syntax
   * Replaces old-style implicit JOIN with explicit INNER JOIN
   */
  getAllItems: (page = 1, limit = 1000) => {
    const offset = (page - 1) * limit;
    
    return {
      sql: `
        SELECT 
          i.mac_address, 
          i.brand, 
          i.model, 
          i.serial_number, 
          i.epc, 
          i.image, 
          i.inventory_code, 
          i.category, 
          i.updated_at, 
          i.antenna, 
          i.group_id, 
          i.designation, 
          TIMESTAMPDIFF(SECOND, i.updated_at, NOW()) as sec, 
          DATE_FORMAT(CONVERT_TZ(i.updated_at,'GMT','Europe/Paris'), '%d/%m/%Y à %Hh%imin%ss') as heure, 
          UNIX_TIMESTAMP(i.updated_at) as updated_atposix, 
          g.group_name as 'group' 
        FROM item i
        INNER JOIN groupname g ON i.group_id = g.group_id
        WHERE i.group_id <> 9 
        ORDER BY i.updated_at DESC
        LIMIT ? OFFSET ?
      `,
      params: [limit, offset]
    };
  },

  /**
   * Get total count for pagination
   */
  getItemCount: () => {
    return {
      sql: `
        SELECT COUNT(*) as total 
        FROM item i
        INNER JOIN groupname g ON i.group_id = g.group_id
        WHERE i.group_id <> 9
      `,
      params: []
    };
  },

  /**
   * Get single item by ID with optimized query
   */
  getItemById: (id) => {
    return {
      sql: `
        SELECT 
          i.mac_address, 
          i.brand, 
          i.model, 
          i.serial_number, 
          i.epc, 
          i.image, 
          i.inventory_code, 
          i.category, 
          i.updated_at, 
          i.antenna, 
          i.group_id, 
          i.designation, 
          TIMESTAMPDIFF(SECOND, i.updated_at, NOW()) as sec, 
          DATE_FORMAT(CONVERT_TZ(i.updated_at,'GMT','Europe/Paris'), '%d/%m/%Y à %Hh%imin%ss') as heure, 
          UNIX_TIMESTAMP(i.updated_at) as updated_atposix, 
          g.group_name as 'group' 
        FROM item i
        INNER JOIN groupname g ON i.group_id = g.group_id
        WHERE i.id = ?
      `,
      params: [id]
    };
  },

  /**
   * Get items by group for filtering
   */
  getItemsByGroup: (groupId, page = 1, limit = 1000) => {
    const offset = (page - 1) * limit;
    
    return {
      sql: `
        SELECT 
          i.mac_address, 
          i.brand, 
          i.model, 
          i.serial_number, 
          i.epc, 
          i.image, 
          i.inventory_code, 
          i.category, 
          i.updated_at, 
          i.antenna, 
          i.group_id, 
          i.designation, 
          TIMESTAMPDIFF(SECOND, i.updated_at, NOW()) as sec, 
          DATE_FORMAT(CONVERT_TZ(i.updated_at,'GMT','Europe/Paris'), '%d/%m/%Y à %Hh%imin%ss') as heure, 
          UNIX_TIMESTAMP(i.updated_at) as updated_atposix, 
          g.group_name as 'group' 
        FROM item i
        INNER JOIN groupname g ON i.group_id = g.group_id
        WHERE i.group_id = ?
        ORDER BY i.category, i.designation, i.model, i.antenna, i.updated_at ASC
        LIMIT ? OFFSET ?
      `,
      params: [groupId, limit, offset]
    };
  }
};

/**
 * Database query executor with caching and optimization
 */
class DatabaseService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Execute query with optional caching
   * @param {string} cacheKey - Cache key for this query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} correlationId - Request correlation ID
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Array>} Query results
   */
  async executeQuery(cacheKey, sql, params = [], correlationId = null, useCache = true) {
    // Check cache first
    if (useCache && cacheKey) {
      const cached = queryCache.get(cacheKey);
      if (cached) {
        logger.debug('Database cache hit', {
          correlationId,
          cacheKey,
          resultCount: cached.length
        });
        return cached;
      }
    }

    const startTime = Date.now();
    
    try {
      // Execute query with connection pooling
      const [rows] = await this.pool.execute(sql, params);
      
      const duration = Date.now() - startTime;
      
      logger.debug('Database query executed', {
        correlationId,
        query: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        paramCount: params.length,
        resultCount: rows.length,
        durationMs: duration
      });

      // Cache successful results
      if (useCache && cacheKey && rows.length > 0) {
        queryCache.set(cacheKey, rows);
        logger.debug('Database result cached', {
          correlationId,
          cacheKey,
          resultCount: rows.length
        });
      }

      return rows;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Database query failed', {
        correlationId,
        query: sql.substring(0, 100),
        paramCount: params.length,
        durationMs: duration,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * Get all items with pagination and caching
   */
  async getAllItems(page = 1, limit = 1000, correlationId = null) {
    const query = optimizedQueries.getAllItems(page, limit);
    const cacheKey = `items:all:${page}:${limit}`;
    
    return await this.executeQuery(
      cacheKey,
      query.sql,
      query.params,
      correlationId,
      true // Use cache for items list
    );
  }

  /**
   * Get total item count for pagination
   */
  async getItemCount(correlationId = null) {
    const query = optimizedQueries.getItemCount();
    const cacheKey = 'items:count';
    
    const result = await this.executeQuery(
      cacheKey,
      query.sql,
      query.params,
      correlationId,
      true // Cache count for 5 minutes
    );
    
    return result[0]?.total || 0;
  }

  /**
   * Get single item by ID
   */
  async getItemById(id, correlationId = null) {
    const query = optimizedQueries.getItemById(id);
    const cacheKey = `item:${id}`;
    
    return await this.executeQuery(
      cacheKey,
      query.sql,
      query.params,
      correlationId,
      true // Cache individual items
    );
  }

  /**
   * Get items by group
   */
  async getItemsByGroup(groupId, page = 1, limit = 1000, correlationId = null) {
    const query = optimizedQueries.getItemsByGroup(groupId, page, limit);
    const cacheKey = `items:group:${groupId}:${page}:${limit}`;
    
    return await this.executeQuery(
      cacheKey,
      query.sql,
      query.params,
      correlationId,
      true
    );
  }

  /**
   * Clear cache for items (useful after updates)
   */
  clearItemsCache() {
    queryCache.clear();
    logger.info('Database cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: queryCache.size,
      max: queryCache.max,
      hits: queryCache.hits || 0,
      misses: queryCache.misses || 0
    };
  }
}

/**
 * Performance monitoring for database operations
 */
class DatabaseMonitor {
  constructor() {
    this.queryStats = new Map();
  }

  /**
   * Record query performance
   */
  recordQuery(queryType, duration, resultCount) {
    if (!this.queryStats.has(queryType)) {
      this.queryStats.set(queryType, {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        totalResults: 0
      });
    }

    const stats = this.queryStats.get(queryType);
    stats.count++;
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.count;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.totalResults += resultCount;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const stats = {};
    for (const [queryType, data] of this.queryStats) {
      stats[queryType] = { ...data };
    }
    return stats;
  }

  /**
   * Log performance summary
   */
  logPerformanceSummary() {
    const stats = this.getStats();
    logger.info('Database performance summary', { stats });
  }
}

module.exports = {
  optimizedQueries,
  DatabaseService,
  DatabaseMonitor,
  queryCache
};