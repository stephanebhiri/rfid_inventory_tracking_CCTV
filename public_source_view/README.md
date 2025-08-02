# RFID Inventory Tracking System

A real-time RFID inventory tracking system with CCTV integration for warehouse management.

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or higher
- MySQL 8.x
- Nginx
- PM2 (for production)
- Redis 6.x (optional, for WebSocket scaling)

### Installation

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd actinvent8
npm install
```

2. **Environment setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database setup**
```bash
# Import your MySQL schema
mysql -u root -p < schema.sql
```

4. **Start services**
```bash
# Development
npm run dev

# Production
npm run build
node main_web_server.js

# Or with PM2
pm2 start ecosystem.config.js
```

## 🏗️ Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   RFID Readers  │───▶│   Node.js API   │───▶│     MySQL       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend│◀───│     Nginx       │    │     Redis       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   CCTV System   │
                       └─────────────────┘
```

### Tech Stack
- **Frontend**: React 18 + TypeScript
- **Backend**: Node.js + Express
- **Database**: MySQL 8
- **Cache**: Redis + LRU Cache
- **Reverse Proxy**: Nginx
- **Process Manager**: PM2
- **Testing**: Jest + Supertest

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment | `production` | ✅ |
| `DB_HOST` | MySQL host | `127.0.0.1` | ✅ |
| `DB_USER` | MySQL user | - | ✅ |
| `DB_PASSWORD` | MySQL password | - | ✅ |
| `DB_NAME` | Database name | `actinvent` | ✅ |
| `SERVER_PORT` | API server port | `3002` | ✅ |
| `CCTV_BASE_URL` | CCTV server URL | - | ✅ |
| `CCTV_LOGIN` | CCTV username | - | ✅ |
| `CCTV_PASSWORD` | CCTV password | - | ✅ |
| `METRICS_TOKEN` | Prometheus auth token | - | ✅ |
| `WS_ALLOWED_ORIGINS` | WebSocket origins | - | ✅ |
| `LOG_LEVEL` | Logging level | `info` | ❌ |
| `INPUT_CONCURRENCY` | RFID batch size | `20` | ❌ |
| `CORS_ORIGINS` | HTTP CORS origins | - | ✅ |

### Cache Configuration
- **Video files**: On-demand download with filesystem cache
- **Static assets**: 1-year browser cache (React build)
- **API responses**: No cache (real-time RFID data)
- **Metrics**: No cache (live Prometheus metrics)

## 📡 API Reference

### Health & Monitoring

#### Health Check
```http
GET /api/health
```

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "checks": {
    "database": { "status": "healthy" },
    "filesystem": { "status": "healthy" }
  },
  "uptime": 12345
}
```

#### Metrics
```http
GET /metrics
```

**Note**: Requires `Authorization: Bearer <METRICS_TOKEN>` header

### Data Endpoints

#### Get Items
```http
GET /api/items?page=1&limit=1000
```

**Response**
```json
{
  "success": true,
  "data": [
    {
      "epc": "300833B2DDD9014000038653",
      "designation": "Camera Sony",
      "updated_at": "2025-01-01T12:00:00.000Z",
      "updated_atposix": 1735689600,
      "group": "ENG1"
    }
  ],
  "meta": {
    "count": 186,
    "page": 1,
    "limit": 1000
  }
}
```

#### RFID Input
```http
POST /api/input
Content-Type: application/x-www-form-urlencoded

field_values=[["mac","reader","epc","antenna"]]
```

#### CCTV Integration
```http
GET /api/cctv/videos?timestamp=1735689600&designation=Camera&group_id=1
```

## 🛠️ Development

### Local Development
```bash
# Start all services
npm run dev

# Frontend only
npm start

# Backend only  
npm run server

# Backend with pretty logs
npm run dev:pretty

# Run tests
npm run test:api
npm run test:coverage
```

### Code Structure
```
actinvent8/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API services
│   └── pages/             # Application pages
├── server/                # Node.js backend
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── middleware/       # Express middleware
│   ├── config/           # Configuration
│   └── utils/            # Utilities
├── tests/                # API tests
├── static/               # Static assets & cache
└── build/                # Production build
```

### Database Schema
Key tables:
- `item`: RFID inventory items
- `groupname`: Item groups/categories
- `hist`: Movement history
- `antenna`: RFID reader locations

## 🚀 Production Deployment

### System Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB minimum, 8GB recommended  
- **Storage**: 100GB+ (for video cache)
- **Network**: 1Gbps recommended

### Deployment Steps

1. **System Setup**
```bash
# Install Node.js, MySQL, Redis, Nginx
sudo apt update
sudo apt install nodejs npm mysql-server redis-server nginx

# Install PM2 globally
sudo npm install -g pm2
```

2. **Application Deployment**
```bash
# Build application
npm run build

# Copy environment file
cp .env.example .env
# Configure .env for production

# Configure Nginx
sudo cp nginx-complete.conf /etc/nginx/sites-available/actinvent8
sudo ln -s /etc/nginx/sites-available/actinvent8 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

3. **Process Management**
```bash
# Start with PM2 (recommended)
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Or manual start
node main_web_server.js
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    
    # Static files
    location / {
        root /var/www/actinvent8/build;
        try_files $uri /index.html;
    }
    
    # API proxy
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔍 Monitoring & Troubleshooting

### Health Checks
- **Application**: `GET /api/health`
- **Readiness**: `GET /api/ready` (database connectivity)
- **WebSocket**: `GET /api/ws/status`
- **Metrics**: `GET /metrics` (with auth token)

### Log Files
```bash
# Application logs
tail -f logs/combined.log

# PM2 logs
pm2 logs actinvent8-web-server

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Performance Monitoring
- **Prometheus metrics**: `GET /metrics` (with auth)
- **Health status**: `GET /api/health`
- **System readiness**: `GET /api/ready`
- **WebSocket status**: `GET /api/ws/status`

### Common Issues

#### RFID Not Updating
```bash
# Check RFID input logs
curl -X POST http://localhost:3002/api/input \
  -d "field_values=[[\"test\",\"reader\",\"epc\",\"1\"]]"

# Check system health
curl http://localhost:3002/api/health
```

#### High Memory Usage
```bash
# Check Prometheus metrics (requires token)
curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3002/metrics | grep process

# Monitor video cache size
du -sh static/cache/videos/
```

#### Database Connection Issues
```bash
# Test database connection
mysql -u $DB_USER -p$DB_PASSWORD -h $DB_HOST $DB_NAME -e "SELECT 1;"

# Check database readiness
curl http://localhost:3002/api/ready
```

### Performance Tuning

#### Cache Optimization
- Database cache: 5-second TTL (configurable)
- Video cache: On-demand with LRU eviction
- Static assets: 1-year browser cache

#### Database Optimization
- Indexed columns: `epc`, `updated_at`, `group_id`
- Connection pooling: 10 connections max
- Query optimization with prepared statements

#### Nginx Optimization
- Gzip compression enabled
- Static file caching
- Proxy buffering for API calls

## 🔒 Security

### Security Features
- **Rate limiting**: 200 requests per 15 minutes
- **CORS**: Configured allowed origins
- **Input validation**: Request size limits (10MB)
- **Security headers**: XSS protection, frame options
- **Error handling**: No sensitive data exposure

### Security Checklist
- [ ] Environment files secured (600 permissions)
- [ ] Database credentials rotated
- [ ] CORS origins configured
- [ ] Rate limiting enabled
- [ ] Security headers configured
- [ ] Input validation implemented

## 📞 Support

### Getting Help
1. Check the logs first
2. Verify configuration
3. Run health checks
4. Check system resources

### Development Team
- Architecture: Node.js + React real-time polling
- Database: MySQL with optimized caching
- Performance: 5-second cache TTL, 1-second frontend refresh
- Monitoring: Comprehensive health checks and metrics

---

**Production Ready**: This system is configured for production deployment with monitoring, security, and performance optimizations.