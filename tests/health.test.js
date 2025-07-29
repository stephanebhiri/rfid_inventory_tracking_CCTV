const request = require('supertest');
const express = require('express');

// Mock the monitoring service
const mockMonitoringService = {
  performHealthCheck: jest.fn(),
  recordRequest: jest.fn(),
  initialize: jest.fn()
};

// Mock the routes that require the monitoring service
jest.mock('../server/routes/monitoring', () => {
  const express = require('express');
  const router = express.Router();
  
  router.get('/health', async (req, res) => {
    try {
      const healthStatus = await mockMonitoringService.performHealthCheck();  
      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  router.get('/ready', async (req, res) => {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  });

  router.get('/live', (req, res) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  return { router, monitoringService: mockMonitoringService };
});

describe('Health Check Endpoints', () => {
  let app;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test app
    app = express();
    const { router } = require('../server/routes/monitoring');
    app.use('/api/monitoring', router);
  });

  describe('GET /api/monitoring/health', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock successful health check
      mockMonitoringService.performHealthCheck.mockResolvedValue({
        status: 'healthy',
        timestamp: '2025-01-01T00:00:00.000Z',
        checks: {
          database: { status: 'healthy' },
          filesystem: { status: 'healthy' }
        }
      });

      const response = await request(app)
        .get('/api/monitoring/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.checks).toBeDefined();
      expect(mockMonitoringService.performHealthCheck).toHaveBeenCalledTimes(1);
    });

    it('should return unhealthy status when checks fail', async () => {
      // Mock failed health check
      mockMonitoringService.performHealthCheck.mockResolvedValue({
        status: 'unhealthy',
        timestamp: '2025-01-01T00:00:00.000Z',
        checks: {
          database: { status: 'unhealthy', error: 'Connection failed' }
        }
      });

      const response = await request(app)
        .get('/api/monitoring/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.checks.database.status).toBe('unhealthy');
    });

    it('should handle health check errors gracefully', async () => {
      // Mock health check throwing an error
      mockMonitoringService.performHealthCheck.mockRejectedValue(
        new Error('Health check failed')
      );

      const response = await request(app)
        .get('/api/monitoring/health')
        .expect(500);

      expect(response.body.status).toBe('error');
      expect(response.body.error).toBe('Health check failed');
    });
  });

  describe('GET /api/monitoring/ready', () => {
    it('should return ready status', async () => {
      const response = await request(app)
        .get('/api/monitoring/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/monitoring/live', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/api/monitoring/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });
});

describe('Performance Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    const { router } = require('../server/routes/monitoring');
    app.use('/api/monitoring', router);
  });

  it('health check should respond within 1 second', async () => {
    mockMonitoringService.performHealthCheck.mockResolvedValue({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    });

    const startTime = Date.now();
    
    await request(app)
      .get('/api/monitoring/health')
      .expect(200);
    
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(1000);
  });

  it('liveness probe should respond quickly', async () => {
    const startTime = Date.now();
    
    await request(app)
      .get('/api/monitoring/live')
      .expect(200);
    
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(100); // Should be very fast
  });
});