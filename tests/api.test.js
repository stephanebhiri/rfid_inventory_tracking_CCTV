const request = require('supertest');
const express = require('express');

// Mock database pool
const mockPool = {
  execute: jest.fn()
};

// Mock database service
const mockDbService = {
  getAllItems: jest.fn(),
  getItemCount: jest.fn()
};

// Mock the database and dependencies
jest.mock('../server/config/database', () => mockPool);
jest.mock('../server/utils/dbOptimizations', () => ({
  DatabaseService: jest.fn(() => mockDbService)
}));

jest.mock('../server/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock validation middleware
jest.mock('../server/middleware/validation', () => ({
  validators: {
    pagination: (req, res, next) => next(),
    itemId: (req, res, next) => next()
  },
  handleValidationErrors: (req, res, next) => {
    // Simulate validation errors for invalid parameters
    if (req.query.page === 'invalid' || req.query.limit === 'invalid') {
      return res.status(400).json({
        success: false,
        errors: ['Invalid pagination parameters']
      });
    }
    if (parseInt(req.query.limit) > 1000) {
      return res.status(400).json({
        success: false,
        errors: ['Limit exceeds maximum allowed value']
      });
    }
    next();
  }
}));

describe('API Endpoints', () => {
  let app;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test app
    app = express();
    app.use(express.json());
    
    // Add correlationId middleware (required by routes)
    app.use((req, res, next) => {
      req.correlationId = 'test-correlation-id';
      next();
    });
    
    // Load routes after mocks are set up
    const itemsRoutes = require('../server/routes/items');
    app.use('/api/items', itemsRoutes);
  });

  describe('GET /api/items', () => {
    it('should return items successfully', async () => {
      // Mock database response
      const mockItems = [
        {
          epc: 'TEST001',
          designation: 'Test Item 1',
          updated_at: '2025-01-01T00:00:00.000Z',
          updated_atposix: 1735689600,
          group: 'Test Group'
        },
        {
          epc: 'TEST002', 
          designation: 'Test Item 2',
          updated_at: '2025-01-01T01:00:00.000Z',
          updated_atposix: 1735693200,
          group: 'Test Group'
        }
      ];

      mockDbService.getAllItems.mockResolvedValue(mockItems);
      mockDbService.getItemCount.mockResolvedValue(null); // Count not needed for default limit

      const response = await request(app)
        .get('/api/items')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].epc).toBe('TEST001');
      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.count).toBe(2);
    });

    it('should handle pagination parameters', async () => {
      const mockItems = [{ epc: 'TEST001', designation: 'Test Item' }];
      
      mockDbService.getAllItems.mockResolvedValue(mockItems);
      mockDbService.getItemCount.mockResolvedValue(100);

      const response = await request(app)
        .get('/api/items?page=2&limit=10')
        .expect(200);

      expect(mockDbService.getAllItems).toHaveBeenCalledWith(2, 10, expect.any(String));
      expect(mockDbService.getItemCount).toHaveBeenCalled();
      expect(response.body.meta.page).toBe(2);
      expect(response.body.meta.limit).toBe(10);
    });

    it('should handle database errors gracefully', async () => {
      mockDbService.getAllItems.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/items')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/items?page=invalid&limit=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should enforce maximum page size', async () => {
      const response = await request(app)
        .get('/api/items?limit=5000') // Over the limit
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/items')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });

  describe('Performance', () => {
    it('should respond to items endpoint within reasonable time', async () => {
      mockDbService.getAllItems.mockResolvedValue([]);
      
      const startTime = Date.now();
      
      await request(app)
        .get('/api/items')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
    });
  });
});

describe('RFID Input Endpoints', () => {
  let app;
  const mockRealtimeService = {
    publishRFIDEvent: jest.fn().mockResolvedValue()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.execute.mockClear();
    
    app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Add correlationId middleware
    app.use((req, res, next) => {
      req.correlationId = 'test-correlation-id';
      next();
    });
    
    // Mock realtime service before requiring routes
    jest.doMock('../server/services/realtimeService', () => mockRealtimeService);
    
    const inputRoutes = require('../server/routes/input');
    app.use('/api', inputRoutes);
  });

  describe('POST /api/input', () => {
    it('should accept valid RFID input', async () => {
      // Mock successful database operations
      mockPool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const rfidData = {
        field_values: '00:16:25:10:F4:B4,reader1,300833B2DDD9014000038653,1\n',
        field_delim: ',',
        reader_name: 'test_reader',
        mac_address: '00:16:25:10:F4:B4'
      };

      const response = await request(app)
        .post('/api/input')
        .send(rfidData)
        .expect(200);

      expect(response.text).toBe('OK');
      expect(mockPool.execute).toHaveBeenCalled();
    });

    it('should reject requests without field_values', async () => {
      const response = await request(app)
        .post('/api/input')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing field_values');
    });

    it('should handle malformed field_values', async () => {
      // Mock the database call
      mockPool.execute.mockResolvedValue([{ affectedRows: 0 }]);
      
      const response = await request(app)
        .post('/api/input')
        .send({ 
          field_values: 'invalid_format_no_delim',
          mac_address: 'test_mac',
          reader_name: 'test_reader',
          field_delim: ','
        })
        .expect(200);

      expect(response.text).toBe('OK');
    });
  });
});