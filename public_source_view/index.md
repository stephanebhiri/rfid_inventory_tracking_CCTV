# RFID Inventory System - Source Code

## Quick Access Links

### Core Files
- [README.md](README.md) - Complete documentation
- [package.json](package.json) - Dependencies and scripts  
- [schema.sql](schema.sql) - Database schema
- [main_web_server.js](main_web_server.js) - Main server
- [ecosystem.config.js](ecosystem.config.js) - PM2 config

### Frontend (React/TypeScript)
- [src/index.tsx](src/index.tsx) - App entry point
- [src/pages/RFIDDashboard.tsx](src/pages/RFIDDashboard.tsx) - Main dashboard
- [src/services/ItemsService.ts](src/services/ItemsService.ts) - API service
- [src/components/](src/components/) - React components
- [src/hooks/](src/hooks/) - Custom hooks

### Backend (Node.js)
- [server/routes/input.js](server/routes/input.js) - RFID input processing
- [server/routes/items.js](server/routes/items.js) - Items API
- [server/routes/cctv.js](server/routes/cctv.js) - Video streaming
- [server/middleware/videoStreaming.js](server/middleware/videoStreaming.js) - Tee streaming
- [server/logger/index.js](server/logger/index.js) - Pino logging
- [server/metrics.js](server/metrics.js) - Prometheus metrics

**Generated**: Tue Jul 29 19:58:17 UTC 2025
**Source**: https://github.com/stephanebhiri/rfid_inventory_tracking_CCTV
