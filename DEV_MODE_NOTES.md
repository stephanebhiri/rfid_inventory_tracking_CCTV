# Development Mode Setup Notes

## Issue: Environment Variable Conflicts

### Root Cause
The `.env` file contained variables that affected both frontend and backend:
```
PORT=3002
HOST=0.0.0.0
```

### Problems Encountered
1. **Port Conflict**: React dev server tried to use port 3002 (same as backend)
2. **Webpack Error**: `allowedHosts[0] should be a non-empty string` due to HOST=0.0.0.0
3. **Configuration Pollution**: Same env vars affecting both services

### Solution Applied
1. **Removed PORT/HOST from .env** - let React use default port 3000
2. **Backend uses SERVER_PORT/SERVER_HOST** - separated environment variables
3. **Webpack bypass**: `DANGEROUSLY_DISABLE_HOST_CHECK=true npm start`
4. **Proxy config**: `"proxy": "http://xxxxxx.xx:3002"` in package.json

### Working Development Setup
```bash
# Backend on port 3002
node server/index.js

# Frontend on port 3000 with proxy
DANGEROUSLY_DISABLE_HOST_CHECK=true npm start

# Or combined
npm run dev
```

### Key Lesson
**Separate environment variables for frontend vs backend in Create React App projects.**
- Use `REACT_APP_` prefix for frontend-specific vars
- Use custom prefixes like `SERVER_` for backend vars
- Avoid generic `PORT`/`HOST` that affect both services

### Verification Commands
```bash
# Check both servers running
netstat -tulpn | grep -E ':300[0-2]'

# Test proxy working
curl http://xxxxxx.xx:3000/api/items

# Verify dev mode (not production)
curl -s http://xxxxxx.xx:3000/static/js/bundle.js | grep ReactRefreshEntry
```

## Additional Issues Encountered in actinvent8

### Missing Dependencies Problem
**Root Cause**: When copying files from actinvent7 to create actinvent8, essential dependencies were accidentally removed from package.json during cleanup.

**Symptoms**:
- Backend crashes immediately with exit code 1
- No error messages (silent crash)
- Environment validation passes but server won't start

**Missing Dependencies**:
- `on-finished` - Required by `server/middleware/httpLogger.js`
- `xmldom` - Required by `server/utils/cctvApi.js` and `server/utils/auth.js`
- `moment` - Date/time utility library
- `web-vitals` - Performance monitoring

**Solution**:
```bash
npm install on-finished xmldom moment web-vitals
```

**Why I Struggled**:
1. **Over-optimization**: Removed "unused" dependencies that were actually required
2. **Silent failures**: Node.js crashes without clear error messages when modules are missing
3. **Focused on wrong issues**: Spent time on environment variables when the real issue was missing packages
4. **Incomplete dependency analysis**: Should have traced all `require()` statements in server code

### File Watcher Limits
**Problem**: `ENOSPC: System limit for number of file watchers reached`

**Solution**:
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Start Order Matters
**Issue**: Frontend starts but shows blank page because backend isn't running

**Correct startup order**:
1. Start backend first: `node server/index.js &`
2. Start frontend: `DANGEROUSLY_DISABLE_HOST_CHECK=true npm start`
3. Or use combined: `npm run dev` (but only if both services are working)

### Key Lesson Extended
**Always verify all dependencies are present before debugging configuration issues.**
- Use `npm ls` to check for missing packages
- Test minimal server startup before complex configurations
- Don't over-optimize by removing dependencies without proper analysis

Date: 2025-07-22 (Updated)