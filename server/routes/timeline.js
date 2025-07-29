const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { logger } = require('../config/logger');

// Helper function to get icon for group
function getGroupIcon(groupName) {
  const icons = {
    'ENG1': '📹',
    'ENG2': '🎥', 
    'ENG3': '📺',
    'ENG4': '🎬',
    'SPARE': '📦',
    'LiveU': '📡',
    'FS7': '🎦',
    'Accessoires': '🔧',
    'ZZ_Not_Reg': '❓',
    'LUMIERES': '💡',
    'KITSON': '🎧',
    'DATAS': '💾',
    'Alpha7s': '📷',
    'ZZ_LOST': '❌'
  };
  return icons[groupName] || '📁';
}

// Get tree structure for timeline groups (like original /api/tree)
router.get('/tree', async (req, res) => {
  try {
    // Fetch real groups from database
    const query = `SELECT group_id, group_name, color FROM groupname ORDER BY group_id`;
    const [rows] = await pool.execute(query);
    
    const treeElements = rows.map(row => ({
      key: row.group_id.toString(),
      label: `${getGroupIcon(row.group_name)} ${row.group_name}`,
      parent: null,
      open: true,
      color: row.color
    }));

    logger.info('Timeline tree data requested', { 
      itemCount: treeElements.length 
    });

    res.json(treeElements);
  } catch (error) {
    logger.error('Error fetching timeline tree data', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch timeline tree data' 
    });
  }
});

// Get timeline history events (like original /api/treehist)
router.get('/treehist', async (req, res) => {
  try {
    // Get timeScale parameter to adjust date range
    const timeScale = req.query.timeScale || 'month';
    let intervalClause;
    let limitClause;
    
    switch (timeScale) {
      case 'day':
        intervalClause = 'DATE_SUB(NOW(), INTERVAL 7 DAY)';
        limitClause = 'LIMIT 1000';
        break;
      case 'week':
        intervalClause = 'DATE_SUB(NOW(), INTERVAL 2 WEEK)';
        limitClause = 'LIMIT 1000';
        break;
      case 'month':
        intervalClause = 'DATE_SUB(NOW(), INTERVAL 6 MONTH)';
        limitClause = 'LIMIT 2000';
        break;
      case 'year':
        intervalClause = 'DATE_SUB(NOW(), INTERVAL 2 YEAR)';
        limitClause = 'LIMIT 5000';
        break;
      default:
        intervalClause = 'DATE_SUB(NOW(), INTERVAL 6 MONTH)';
        limitClause = 'LIMIT 1000';
    }

    // Real database query for all timeline events with actual groups
    const query = `
      SELECT 
        h.id,
        i.epc as rfid_tag_id,
        i.designation as text,
        DATE_FORMAT(h.dep, '%Y-%m-%d %H:%i:%s') as start_date,
        DATE_FORMAT(h.ret, '%Y-%m-%d %H:%i:%s') as end_date,
        i.group_id as section_id,
        CASE 
          WHEN h.ret IS NULL THEN '#ef4444'
          ELSE COALESCE(g.color, '#667eea')
        END as color
      FROM hist h
      JOIN item i ON h.epchist = i.epc 
      LEFT JOIN groupname g ON i.group_id = g.group_id
      WHERE h.dep >= ${intervalClause}
        AND i.group_id != 9
      ORDER BY h.dep DESC
      ${limitClause}
    `;

    const [rows] = await pool.execute(query);
    
    // Transform data for vis-timeline format
    const timelineEvents = rows.map(row => ({
      id: row.id.toString(),
      rfid_tag_id: row.rfid_tag_id,
      text: row.text,
      start_date: row.start_date,
      end_date: row.end_date,
      section_id: row.section_id,
      color: row.color
    }));

    logger.info('Timeline events data requested', { 
      eventCount: timelineEvents.length,
      timeScale: timeScale,
      intervalClause: intervalClause
    });

    res.json(timelineEvents);
  } catch (error) {
    logger.error('Error fetching timeline events data', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch timeline events data' 
    });
  }
});

module.exports = router;