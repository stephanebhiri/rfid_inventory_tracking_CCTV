# 🧹 Repository Cleanup Guide

## 🚨 Current Problem
Repository contains ~50GB+ of tracked files that should NOT be in Git:
- Development logs (30+ files)  
- Video cache (500+ .mp4 files)
- Debug artifacts

## 🎯 Fresh Install Process (After Cleanup)

```bash
# 1. Clone clean repo
git clone https://github.com/user/repo.git
cd repo

# 2. Install dependencies  
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your values:
# - DB_HOST, DB_USER, DB_PASS, DB_NAME
# - METRICS_TOKEN=your-secret-token
# - WS_ALLOWED_ORIGINS=https://yourdomain.com

# 4. Setup database
npm run db:migrate  # If exists
# Or manually create tables

# 5. Build React frontend
npm run build

# 6. Setup Nginx
sudo cp nginx-complete.conf /etc/nginx/sites-available/yoursite
sudo ln -sf /etc/nginx/sites-available/yoursite /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. Start with PM2
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# 8. Verify
curl http://localhost:3002/api/health
curl http://localhost:3002/api/ready
```

## 🗑️ Files to Remove from Git Tracking

### 1. Clean logs & cache (IMMEDIATELY)
```bash
# Remove from tracking but keep local files
git rm --cached *.log
git rm --cached logs/*
git rm --cached static/cache/videos/*.mp4
git rm --cached static/cache/videos/*.part

# Or nuclear option - delete everything
git rm --cached -r logs/ static/cache/
rm -rf logs/ static/cache/videos/*.mp4
```

### 2. Update .gitignore (already good)
```
# .gitignore already contains:
logs/
*.log  
static/cache/
```

### 3. Commit cleanup
```bash
git add .gitignore
git commit -m "chore: Remove tracked logs and cache files

- Remove 500+ video files (~50GB) from tracking
- Remove development logs and debug artifacts  
- Keep .gitignore rules to prevent future pollution

Files removed:
- logs/*.log (development logs)
- static/cache/videos/*.mp4 (video cache)
- *.log (debug logs)

Repository now clean for fresh installs."

git push origin master
```

## 📋 Missing for Fresh Install

### 1. Environment Template
Create `.env.example`:
```bash
# Database
DB_HOST=localhost
DB_USER=youruser
DB_PASS=yourpass
DB_NAME=yourdb

# Security  
METRICS_TOKEN=your-prometheus-secret-token
WS_ALLOWED_ORIGINS=https://yourdomain.com

# App Config
NODE_ENV=production
PORT=3002
LOG_LEVEL=info
WS_MAX_PER_IP=5
```

### 2. Database Schema
Create `schema.sql` or migration files for fresh DB setup.

### 3. Installation Script
Create `install.sh`:
```bash
#!/bin/bash
echo "🚀 Installing RFID Inventory System..."

# Check Node.js version
node --version | grep -E "v(18|19|20)" || {
  echo "❌ Node.js 18+ required"
  exit 1
}

# Install dependencies
npm install

# Setup environment
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Configure .env with your settings"
fi

# Build frontend
npm run build

echo "✅ Installation complete!"
echo "📖 Next steps: Configure .env, setup database, configure Nginx"
```

## 🎯 Expected Clean Repository Size
- **Before**: ~50GB (with videos)
- **After**: ~50MB (code only)
- **Fresh clone**: ~10MB (without node_modules/build)

## ⚠️ URGENT TODO
1. **Remove tracked cache files** (50GB cleanup)
2. **Add .env.example template**  
3. **Add database schema/migrations**
4. **Test fresh install process**
5. **Document missing dependencies**