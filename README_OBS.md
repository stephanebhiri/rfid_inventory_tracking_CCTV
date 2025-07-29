# 📊 Observabilité RFID Inventory System

Documentation pour l'observabilité production-ready du système RFID avec streaming vidéo CCTV.

## 🎯 Vue d'ensemble

Le système inclut une observabilité complète basée sur :
- **Pino** : Logging structuré JSON avec traçage de requêtes
- **Prometheus** : Métriques pour monitoring et alerting
- **x-request-id** : Traçage distribué des requêtes

## 🔧 Configuration

### Variables d'environnement

```bash
# Niveau de logging (default: info)
LOG_LEVEL=info          # trace, debug, info, warn, error, fatal

# Environment (affecte le format des logs)
NODE_ENV=production     # production = JSON, development = pretty print
```

### Logs structurés (Pino)

Les logs sont automatiquement formatés selon l'environnement :
- **Production** : JSON structuré pour ingestion par ELK/Loki
- **Development** : Pretty print coloré pour debugging local

#### Champs automatiquement masqués (sécurité)
- `authorization`, `cookie`, `sid`
- `req.headers.authorization`, `req.headers.cookie`
- `req.query.sid`, `req.body.sid`

## 📈 Métriques Prometheus

### Endpoint
```bash
curl http://localhost:3002/metrics
```

### Métriques système (par défaut)
- `process_*` : CPU, mémoire, GC
- `nodejs_*` : Event loop, heap
- `http_*` : Requêtes HTTP génériques

### Métriques CCTV spécifiques

#### Cache & Performance
```prometheus
# Efficacité du cache vidéo
cctv_cache_hits_total
cctv_cache_misses_total

# Durée end-to-end des requêtes vidéo
video_request_duration_seconds{cache_status="hit|miss"}
```

#### Téléchargements
```prometheus
# Téléchargements en cours (gauge qui monte/descend)
cctv_downloads_in_progress

# Durée des téléchargements depuis le serveur CCTV  
cctv_download_duration_seconds

# Erreurs par type
cctv_download_errors_total{type="INVALID_CAMERA|VIDEO_NOT_FOUND|UPSTREAM_ERROR|ABORT|UNKNOWN"}

# Requêtes concurrentes dans le middleware
cctv_concurrent_requests
```

## 🚀 Utilisation en développement

### Logs pretty (développement local)
```bash
# Option 1: Variable d'environnement
NODE_ENV=development npm run server

# Option 2: Script dédié
npm run dev:pretty
```

### Monitoring en temps réel
```bash
# Surveiller les métriques CCTV
watch -n 1 'curl -s http://localhost:3002/metrics | grep cctv'

# Suivre les logs en temps réel
pm2 logs actinvent8-web-server --lines 50
```

## 📊 Exemples de requêtes

### Métriques clés pour monitoring

#### Cache effectiveness
```bash
curl -s http://localhost:3002/metrics | grep -E "(cctv_cache_hits|cctv_cache_misses)"
```

#### Downloads en cours
```bash
curl -s http://localhost:3002/metrics | grep "cctv_downloads_in_progress"
```

#### Erreurs par type
```bash
curl -s http://localhost:3002/metrics | grep "cctv_download_errors_total"
```

### Logs structurés

Les logs incluent automatiquement :
- `requestId` : ID unique pour tracer une requête
- `filename` : Nom du fichier vidéo demandé
- `cameraId` : ID de la caméra CCTV
- `duration` : Durée des opérations
- `error` : Détails d'erreur avec stack trace

Exemple de log :
```json
{
  "level": 30,
  "time": "2024-01-20T10:30:45.123Z",
  "msg": "Video download completed successfully",
  "filename": "cam1_1642680645_abc123.mp4",
  "cameraId": 1,
  "duration": 2340,
  "cacheSize": 15728640,
  "requestId": "req_123e4567-e89b-12d3-a456-426614174000"
}
```

## 🔍 Debugging

### Traçage de requête complète
1. Récupérer le `x-request-id` depuis les headers de réponse
2. Grep les logs avec cet ID :
```bash
pm2 logs | grep "req_123e4567-e89b-12d3-a456-426614174000"
```

### Problèmes de performance
1. Vérifier `cctv_downloads_in_progress` (max 8)
2. Analyser `cctv_download_duration_seconds` buckets
3. Examiner `video_request_duration_seconds` par `cache_status`

### Erreurs fréquentes
- `INVALID_CAMERA` : Caméra non configurée dans CCTV.cameras
- `VIDEO_NOT_FOUND` : Vidéo absent du serveur CCTV 
- `UPSTREAM_ERROR` : Serveur CCTV inaccessible/erreur
- `ABORT` : Client déconnecté pendant téléchargement

## ⚡ Scripts npm

Ajoutez à votre `package.json` :
```json
{
  "scripts": {
    "dev:pretty": "NODE_ENV=development node main_web_server.js | pino-pretty",
    "logs:follow": "pm2 logs actinvent8-web-server --lines 100 -f",
    "metrics:watch": "watch -n 2 'curl -s http://localhost:3002/metrics | grep cctv'"
  }
}
```

## 📈 Grafana Dashboard (suggestion)

Panneau recommandés :
1. **CCTV Downloads** : `cctv_downloads_in_progress` (gauge)
2. **Cache Hit Rate** : `rate(cctv_cache_hits_total[5m]) / (rate(cctv_cache_hits_total[5m]) + rate(cctv_cache_misses_total[5m]))`
3. **Download Duration** : `histogram_quantile(0.95, cctv_download_duration_seconds)`
4. **Error Rate** : `rate(cctv_download_errors_total[5m])`

## 🚨 Alerting (suggestions Prometheus)

```yaml
# AlertManager rules
groups:
- name: cctv_alerts
  rules:
  - alert: CCTVDownloadStuck
    expr: cctv_downloads_in_progress > 8
    for: 5m
    
  - alert: CCTVHighErrorRate  
    expr: rate(cctv_download_errors_total[5m]) > 0.1
    for: 2m
    
  - alert: CCTVCacheMissHigh
    expr: rate(cctv_cache_misses_total[5m]) / (rate(cctv_cache_hits_total[5m]) + rate(cctv_cache_misses_total[5m])) > 0.8
    for: 5m
```

---

## 🔒 Sécurité

- Les logs automatiquement masquent les données sensibles
- Pas d'exposition de tokens/credentials dans les métriques
- Request tracing sans leak d'informations privées

L'observabilité est **additive** : aucune modification de la logique métier existante.