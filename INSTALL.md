# 🚀 RFID Inventory System - Fresh Installation Guide

Complete setup guide for deploying the RFID Inventory System from scratch.

## 📋 Prerequisites  

### System Requirements
```bash
# Node.js 18+ (for native fetch and AbortSignal.timeout)
node --version  # >= 18.0.0

# MySQL 8.0+ or MariaDB 10.5+
mysql --version

# PM2 for process management
npm install -g pm2

# Nginx for reverse proxy
sudo apt install nginx
```

### Hardware Requirements
- **CPU**: 2+ cores recommended
- **RAM**: 4GB+ for video caching
- **Storage**: 50GB+ for video cache
- **Network**: Stable connection to CCTV system

## 🗄️ Database Setup

### 1. Create Database and User
```bash
mysql -u root -p
```

```sql
-- Create database
CREATE DATABASE actinvent CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Create user with proper permissions
CREATE USER 'actuauser'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON actinvent.* TO 'actuauser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2. Import Schema
```bash
# Import the complete schema (tables + trigger + sample data)
mysql -u actuauser -p actinvent < schema.sql
```

### 3. Verify Installation
```bash
mysql -u actuauser -p actinvent -e "SHOW TABLES;"
```

Expected output:
```
+---------------------+
| Tables_in_actinvent |
+---------------------+
| groupname           |
| hist                |
| item                |
+---------------------+
```

## ⚙️ Application Setup

### 1. Clone and Install
```bash
git clone <your-repository-url>
cd actinvent8
npm install --production
```

### 2. Configure Environment
```bash
# Copy and edit environment template
cp .env.example .env
vim .env  # Configure your values
```

**Critical settings to configure:**
```bash
# Database (REQUIRED)
DB_PASSWORD=your_secure_password
DB_USER=actuauser
DB_NAME=actinvent

# Security (REQUIRED)
METRICS_TOKEN=your-prometheus-secret-token
WS_ALLOWED_ORIGINS=https://yourdomain.com

# CCTV (configure for your system)
CCTV_BASE_URL=http://your-cctv-server.com:8090
CCTV_LOGIN=your_cctv_login
CCTV_PASSWORD=your_cctv_password
```

### 3. Build Frontend
```bash
npm run build
```

### 4. Test Database Connection
```bash
# Quick test
node -e "
const pool = require('./server/config/database');
pool.execute('SELECT COUNT(*) AS count FROM groupname')
  .then(([rows]) => console.log('✅ Database OK:', rows[0]))
  .catch(err => console.error('❌ Database Error:', err.message))
  .finally(() => process.exit());
"
```

## 🔧 Production Deployment

### 1. Configure PM2
```bash
# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup auto-restart on boot
pm2 startup
# Follow the generated instructions
```

### 2. Configure Nginx
```bash
# Copy production Nginx config
sudo cp nginx-complete.conf /etc/nginx/sites-available/actinvent8

# Create symbolic link
sudo ln -sf /etc/nginx/sites-available/actinvent8 /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Verify Installation
```bash
# Check application health
curl http://localhost:3002/api/health

# Check database connectivity  
curl http://localhost:3002/api/ready

# Check metrics (with authentication)
curl -H "Authorization: Bearer your-prometheus-token" http://localhost:3002/metrics
```

## 📊 Database Schema Overview

### Core Tables

**`item`** - Main RFID inventory items
- `epc` (UNIQUE) - RFID tag identifier
- `group_id` - Category (references groupname)
- `updated_at` - Last seen timestamp
- `antenna` - Last detection antenna

**`hist`** - Automatic movement history
- `epchist` - References item.epc
- `dep` - Departure time  
- `ret` - Return time
- `antenna_dep/ret` - Movement antennas

**`groupname`** - Categories/groups
- `group_id` - Unique identifier
- `group_name` - Display name
- `color` - UI color code

### Automatic History Trigger

The `tr_historique` trigger automatically creates movement records when:
- An item's `updated_at` changes by more than **15 minutes**
- Creates history entry showing departure → return movement
- Tracks antenna changes for location awareness

## 🔒 Security Checklist

- [ ] Database user has minimal required permissions
- [ ] `METRICS_TOKEN` is secure and unique
- [ ] `WS_ALLOWED_ORIGINS` restricts WebSocket access
- [ ] Nginx security headers are enabled
- [ ] PM2 runs as non-root user
- [ ] `.env` file permissions are restricted (600)
- [ ] Firewall allows only necessary ports

## 🚨 Troubleshooting

### Database Connection Issues
```bash
# Test MySQL connectivity
mysql -h 127.0.0.1 -u actuauser -p actinvent -e "SELECT 1;"

# Check environment variables
grep DB_ .env
```

### Application Won't Start
```bash
# Check logs
pm2 logs actinvent8-web-server

# Check process status
pm2 status

# Restart if needed
pm2 restart actinvent8-web-server
```

### RFID Input Not Working
```bash
# Test RFID endpoint
curl -X POST http://localhost:3002/api/input \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "reader_name=TEST&mac_address=TEST&field_delim=,&field_values=\"1\",\"E200123456789012\""

# Check for trigger
mysql -u actuauser -p actinvent -e "SHOW TRIGGERS LIKE 'item';"
```

### Video Streaming Issues
- Check CCTV credentials in `.env`
- Verify CCTV server accessibility
- Check Nginx proxy configuration
- Monitor `/var/www/actinvent8/static/cache/videos/` permissions

## 📈 Monitoring

### Key Metrics to Monitor
```bash
# Cache performance
curl -s http://localhost:3002/metrics | grep cctv_cache

# RFID processing
curl -s http://localhost:3002/metrics | grep cctv_downloads

# System health
curl -s http://localhost:3002/metrics | grep process_
```

### Log Analysis
```bash
# Follow application logs
pm2 logs actinvent8-web-server -f

# Search for errors
pm2 logs actinvent8-web-server | grep ERROR

# Check RFID processing
pm2 logs actinvent8-web-server | grep "RFID data processed"
```

---

## ✅ Installation Complete!

Your RFID Inventory System is now ready for production use with:
- ✅ Complete database schema with automatic history tracking
- ✅ Production-ready observability (Pino + Prometheus)
- ✅ Bulletproof video streaming with tee architecture
- ✅ Enterprise security and error handling
- ✅ Scalable RFID input processing

**Next Steps:**
1. Configure your RFID readers to POST to `/api/input` or `/api/input2`
2. Set up Prometheus scraping for metrics
3. Configure your monitoring dashboards
4. Import your existing inventory data

For advanced configuration, see `README_PRODUCTION.md` and `README_OBS.md`.