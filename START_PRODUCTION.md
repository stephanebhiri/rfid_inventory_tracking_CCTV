# Actinvent8 Production Deployment Guide

Guide de déploiement professionnel utilisant PM2 + Nginx selon les bonnes pratiques industrie.

---

## Architecture Production

```
Internet → Nginx (port 80/443) → PM2 Node.js (port 3002)
```

- **Nginx** : Reverse proxy, SSL, static files, load balancing
- **PM2** : Process management, monitoring, auto-restart, clustering

---

## Prérequis Systématiques

### 1. Installation PM2 (si pas déjà fait)
```bash
sudo npm install -g pm2
```

### 2. Build Frontend (si changements)
```bash
cd /var/www/actinvent8
npm run build
```

---

## Déploiement Standard

### 1. Démarrage avec PM2
```bash
cd /var/www/actinvent8

# Démarrer avec la configuration ecosystem
pm2 start ecosystem.config.js

# OU commande directe
pm2 start server/index.js --name "actinvent8-rfid"
```

### 2. Configurer PM2 au démarrage système
```bash
# Générer le script de démarrage
pm2 startup

# Sauvegarder la configuration actuelle
pm2 save
```

### 3. Démarrer Nginx
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Commandes de Gestion

### PM2 Management
```bash
# Status des processus
pm2 status

# Logs en temps réel
pm2 logs actinvent8-rfid

# Logs des 100 dernières lignes
pm2 logs actinvent8-rfid --lines 100

# Redémarrage sans downtime
pm2 reload actinvent8-rfid

# Redémarrage complet
pm2 restart actinvent8-rfid

# Arrêt
pm2 stop actinvent8-rfid

# Monitoring en temps réel
pm2 monit
```

### Nginx Management
```bash
# Status
sudo systemctl status nginx

# Redémarrer
sudo systemctl restart nginx

# Recharger config
sudo systemctl reload nginx

# Logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Vérification du Déploiement

### 1. Vérifier les processus
```bash
# PM2 process
pm2 status

# Nginx process
ps aux | grep nginx

# Ports d'écoute
sudo netstat -tulpn | grep ":80\|:3002"
```

### 2. Tests des endpoints
```bash
# Via Nginx (production)
curl -s http://xxxxxx.xx/api/health

# Direct Node.js (debug)
curl -s http://localhost:3002/api/health

# Frontend
curl -I http://xxxxxx.xx
```

### 3. Vérifier les logs
```bash
# PM2 logs
pm2 logs --lines 20

# Nginx logs
sudo tail -20 /var/log/nginx/error.log
```

---

## Monitoring Production

### Health Checks Automatiques
```bash
# Endpoint de santé complet
curl -s http://xxxxxx.xx/api/health | jq .

# Métriques système
curl -s http://xxxxxx.xx/api/metrics/json | jq .
```

### Surveillance Continue
```bash
# Dashboard PM2 en temps réel
pm2 monit

# Logs en continu
pm2 logs --lines 0
```

---

## Procédures d'Urgence

### Redémarrage Complet
```bash
cd /var/www/actinvent8

# 1. Arrêter services
pm2 stop all
sudo systemctl stop nginx

# 2. Attendre
sleep 3

# 3. Redémarrer tout
pm2 start ecosystem.config.js
sudo systemctl start nginx

# 4. Vérifier
pm2 status
curl -I http://xxxxxx.xx/api/health
```

### Rollback Rapide
```bash
# Si problème, revenir à la version précédente
pm2 stop actinvent8-rfid
git checkout HEAD~1
npm run build
pm2 restart actinvent8-rfid
```

---

## Configuration Files

### PM2 Ecosystem (`ecosystem.config.js`)
```javascript
module.exports = {
  apps: [{
    name: 'actinvent8-rfid',
    script: './server/index.js',
    env: {
      NODE_ENV: 'production'
    },
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log'
  }]
};
```

### Nginx Config (`/etc/nginx/sites-available/actinvent8`)
```nginx
server {
    listen 80;
    server_name xxxxxx.xx;
    client_max_body_size 50M;

    # Static files
    location / {
        root /var/www/actinvent8/build;
        try_files $uri $uri/ /index.html;
    }

    # API proxy to PM2
    location /api/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Points de Contrôle Production

### ✅ Checklist Déploiement
- [ ] PM2 process actif (`pm2 status`)
- [ ] Nginx actif (`systemctl status nginx`)
- [ ] API répond (`curl /api/health`)
- [ ] Frontend accessible (`curl -I /`)
- [ ] Logs sans erreurs critiques
- [ ] Base de données connectée
- [ ] Cache fonctionnel
- [ ] Monitoring actif

### 🚨 Alertes à Surveiller
- Memory usage > 90%
- Response time > 5s
- Error rate > 5%
- Database connection failed
- PM2 process restart loops

---

**Cette configuration respecte les standards industrie pour Node.js en production.**