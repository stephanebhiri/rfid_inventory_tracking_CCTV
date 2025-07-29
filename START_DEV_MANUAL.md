# Actinvent8 Development Mode - Manual Start Guide

## Prerequisites
- Ensure file watcher limits are set: `fs.inotify.max_user_watches=524288`
- Both servers must be started separately due to webpack HOST issues

## Start Commands (Run in /var/www/actinvent8)

### 1. Start Backend Server
```bash
cd /var/www/actinvent8
node server/index.js > backend.log 2>&1 &
```

**Expected output signs:**
- ✅ Database pool created for actinvent@127.0.0.1
- ✅ Server started successfully on port 3002
- ✅ Features enabled: enableCacheEndpoints, enablePerformanceMonitoring, etc.

### 2. Start Frontend Server  
```bash
cd /var/www/actinvent8
HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true npx react-scripts start &
```

**Expected output signs:**
- ✅ Compiled successfully!
- ✅ You can now view cctv-viewer in the browser
- ✅ Bound to HOST environment variable: 0.0.0.0

## Verification Commands

### Check Both Servers Running
```bash
# Frontend
curl -I http://xxxxxx.xx:3000

# Backend API
curl -I http://xxxxxx.xx:3002/api/health

# Test Proxy
curl -s http://xxxxxx.xx:3000/api/items | head -c 100
```

### Check Processes
```bash
# Backend process
ps aux | grep "node server/index.js"

# Frontend process  
ps aux | grep "react-scripts start"

# Ports listening
netstat -tulpn | grep -E ':300[0-2]'
```

## Troubleshooting

### Backend Won't Start
- Check dependencies: `npm ls on-finished xmldom moment web-vitals`
- Check database connection in logs
- Ensure port 3002 is free: `lsof -i:3002`

### Frontend Won't Start
- **Common Error**: `allowedHosts[0] should be a non-empty string`
- **Solution**: Always use `HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true`
- Check file watchers: `cat /proc/sys/fs/inotify/max_user_watches`

### Empty Page / No Data
- Backend must be running BEFORE frontend loads
- Check proxy errors in frontend logs
- Verify API calls work: `curl http://xxxxxx.xx:3002/api/items`

## Full Restart Sequence

### Kill Everything
```bash
pkill -f "node server/index.js"
pkill -f "react-scripts"
```

### Start Fresh
```bash
cd /var/www/actinvent8

# 1. Backend first
node server/index.js > backend.log 2>&1 &

# 2. Wait 3 seconds
sleep 3

# 3. Frontend with proper HOST binding
HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true npx react-scripts start &

# 4. Verify
sleep 10 && curl -I http://xxxxxx.xx:3000
```

## URLs
- **Frontend**: http://xxxxxx.xx:3000
- **Backend**: http://xxxxxx.xx:3002  
- **API Test**: http://xxxxxx.xx:3002/api/items

---
**Note**: The combined `npm run dev` doesn't work reliably due to webpack HOST configuration conflicts. Use manual startup for guaranteed results.

Date: 2025-07-23