# Troubleshooting Guide

This guide helps diagnose and resolve common issues with the RFID Inventory Tracking System.

## 🚨 Emergency Checklist

When the system is down, check these items **in order**:

1. **Services Running**
   ```bash
   pm2 status                    # Check if Node.js is running
   systemctl status nginx        # Check if Nginx is running  
   systemctl status mysql        # Check if MySQL is running
   systemctl status redis        # Check if Redis is running
   ```

2. **Health Check**
   ```bash
   curl http://localhost:3002/api/monitoring/health
   ```

3. **Basic Connectivity**
   ```bash
   curl http://xxxxxx.xx/api/monitoring/live  # Should return "alive"
   ```

## 🔧 Common Issues

### Issue: RFID Data Not Updating

**Symptoms:**
- Frontend shows old data
- Items don't refresh
- "Last update" timestamp is old

**Diagnosis:**
```bash
# 1. Test RFID input directly
curl -X POST http://localhost:3002/api/input \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "field_values=[[\"test_mac\",\"test_reader\",\"test_epc\",\"1\"]]"

# Should return: OK

# 2. Check if data reaches database
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME \
  -e "SELECT * FROM item ORDER BY updated_at DESC LIMIT 5;"

# 3. Check API response
curl http://localhost:3002/api/items | head -n 20

# 4. Check cache status
curl http://localhost:3002/api/monitoring/metrics
```

**Solutions:**
1. **Cache Issue**: Cache not expiring properly
   ```bash
   # Restart server to clear cache
   pm2 restart actinvent8
   ```

2. **Database Connection**: Connection pool exhausted
   ```bash
   # Check database connections
   mysql -u root -p -e "SHOW PROCESSLIST;"
   
   # Restart if needed
   sudo systemctl restart mysql
   ```

3. **RFID Readers**: Not sending to correct endpoint
   - Verify RFID reader configuration points to: `http://xxxxxx.xx/api/input`
   - Check network connectivity from readers

---

### Issue: High Memory Usage

**Symptoms:**
- Server becomes slow
- Memory alerts in monitoring
- System crashes

**Diagnosis:**
```bash
# Check memory usage
curl http://localhost:3002/api/monitoring/system

# Check PM2 memory usage
pm2 monit

# Check system memory
free -h
```

**Solutions:**
1. **Video Cache Too Large**
   ```bash
   # Check cache size
   du -sh /var/www/actinvent8/static/cache/
   
   # Clear video cache
   curl -X DELETE http://localhost:3002/api/cache/clear
   ```

2. **Memory Leak**
   ```bash
   # Restart application
   pm2 restart actinvent8
   
   # Monitor memory over time
   pm2 monit
   ```

3. **Database Connections**
   ```bash
   # Check connection pool
   curl http://localhost:3002/api/monitoring/health | grep database
   ```

---

### Issue: Slow Response Times

**Symptoms:**
- Frontend loading slowly
- API responses take >5 seconds
- Monitoring shows high response times

**Diagnosis:**
```bash
# Check response times
curl -o /dev/null -s -w "Time: %{time_total}s\n" http://localhost:3002/api/items

# Check database performance
curl http://localhost:3002/api/monitoring/performance

# Check system load
htop
```

**Solutions:**
1. **Database Performance**
   ```bash
   # Check slow queries
   mysql -u root -p -e "SHOW VARIABLES LIKE 'slow_query_log';"
   mysql -u root -p -e "SET GLOBAL slow_query_log = 'ON';"
   
   # Optimize database
   mysql -u root -p $DB_NAME -e "OPTIMIZE TABLE item, groupname;"
   ```

2. **Cache Miss Rate**
   ```bash
   # Check cache efficiency
   curl http://localhost:3002/api/monitoring/metrics | grep cache
   
   # If hit rate < 80%, investigate cache TTL settings
   ```

3. **Network Issues**
   ```bash
   # Test network latency
   ping xxxxxx.xx
   
   # Check nginx status
   sudo nginx -t
   curl -I http://xxxxxx.xx
   ```

---

### Issue: Database Connection Errors

**Symptoms:**
- "Database connection failed" errors
- 500 Internal Server Error
- Health check shows database unhealthy

**Diagnosis:**
```bash
# Test database connection manually
mysql -u $DB_USER -p$DB_PASSWORD -h $DB_HOST $DB_NAME -e "SELECT 1;"

# Check database logs
sudo tail -f /var/log/mysql/error.log

# Check connection limits
mysql -u root -p -e "SHOW VARIABLES LIKE 'max_connections';"
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"
```

**Solutions:**
1. **Connection Limit Reached**
   ```bash
   # Increase MySQL max connections
   sudo mysql -u root -p -e "SET GLOBAL max_connections = 200;"
   
   # Make permanent in /etc/mysql/my.cnf:
   # [mysqld]
   # max_connections = 200
   ```

2. **Database Server Down**
   ```bash
   sudo systemctl start mysql
   sudo systemctl enable mysql
   ```

3. **Wrong Credentials**
   ```bash
   # Verify .env file
   cat .env | grep DB_
   
   # Test credentials
   mysql -u $DB_USER -p$DB_PASSWORD -e "SELECT USER();"
   ```

---

### Issue: CCTV Videos Not Loading

**Symptoms:**
- Video player shows error
- CCTV section empty
- Network timeouts

**Diagnosis:**
```bash
# Test CCTV API directly
curl -i "http://localhost:3002/api/cctv/videos?timestamp=1735689600&designation=Camera&group_id=1"

# Check CCTV server connectivity
curl -i $CCTV_BASE_URL

# Check video cache
ls -la /var/www/actinvent8/static/cache/videos/
```

**Solutions:**
1. **CCTV Server Unreachable**
   ```bash
   # Check network connectivity
   ping cctv.xxxxxx.xx
   
   # Verify CCTV credentials
   echo $CCTV_PASSWORD | base64 -d
   ```

2. **Video Cache Issues**
   ```bash
   # Clear video cache
   rm -rf /var/www/actinvent8/static/cache/videos/*
   
   # Check disk space
   df -h /var/www/actinvent8/static/cache/
   ```

---

### Issue: Nginx 502 Bad Gateway

**Symptoms:**
- Web interface shows Nginx error page
- API calls return 502
- Unable to access application

**Diagnosis:**
```bash
# Check if Node.js server is running
curl http://localhost:3002/api/monitoring/live

# Check Nginx configuration
sudo nginx -t

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

**Solutions:**
1. **Node.js Server Down**
   ```bash
   pm2 restart actinvent8
   pm2 logs actinvent8
   ```

2. **Port Mismatch**
   ```bash
   # Verify server port in .env
   grep SERVER_PORT .env
   
   # Verify Nginx proxy_pass matches
   grep proxy_pass /etc/nginx/sites-available/actinvent8
   ```

3. **Nginx Configuration Error**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## 🔍 Diagnostic Commands

### Quick Health Check
```bash
#!/bin/bash
echo "=== System Health Check ==="
echo "Date: $(date)"
echo ""

echo "1. Services Status:"
pm2 status | grep actinvent8
systemctl is-active nginx mysql redis

echo -e "\n2. Health Endpoint:"
curl -s http://localhost:3002/api/monitoring/health | head -n 5

echo -e "\n3. Memory Usage:"
free -h | head -n 2

echo -e "\n4. Disk Space:"
df -h / | tail -n 1

echo -e "\n5. Recent Errors:"
tail -n 5 logs/combined.log | grep -i error
```

### Performance Check
```bash
#!/bin/bash
echo "=== Performance Diagnostics ==="

echo "1. Response Times:"
for endpoint in "/api/monitoring/live" "/api/items" "/api/monitoring/health"; do
  time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3002$endpoint)
  echo "$endpoint: ${time}s"
done

echo -e "\n2. Cache Performance:"
curl -s http://localhost:3002/api/monitoring/metrics | grep -E "hitRate|hits|misses"

echo -e "\n3. Database Performance:"
curl -s http://localhost:3002/api/monitoring/performance | grep -E "queryTime|queriesPerSecond"
```

### Log Analysis
```bash
#!/bin/bash
echo "=== Log Analysis ==="

echo "1. Error Patterns (last 100 lines):"
tail -n 100 logs/combined.log | grep -i error | sort | uniq -c | sort -rn

echo -e "\n2. Request Volume (last hour):"
tail -n 1000 logs/combined.log | grep "$(date -d '1 hour ago' '+%Y-%m-%d')" | wc -l

echo -e "\n3. Slow Requests:"
tail -n 500 logs/combined.log | grep -E "duration.*[5-9][0-9]{3}" | head -n 5
```

## 📊 Monitoring Alerts

### Critical Alerts
- **Database connection failed**: Immediate action required
- **Memory usage >90%**: Clear cache or restart
- **Response time >10s**: Check database and network
- **Error rate >10%**: Investigate logs immediately

### Warning Alerts  
- **Memory usage >80%**: Monitor closely
- **Response time >5s**: Performance degradation
- **Cache hit rate <70%**: Cache optimization needed
- **Disk usage >85%**: Clean old video cache

## 🛠️ Maintenance Tasks

### Daily
```bash
# Check system health
curl http://localhost:3002/api/monitoring/health

# Review error logs
tail -n 50 logs/combined.log | grep -i error

# Check disk space
df -h /var/www/actinvent8/static/cache/
```

### Weekly
```bash
# Clean old video cache (>7 days)
find /var/www/actinvent8/static/cache/videos/ -name "*.mp4" -mtime +7 -delete

# Optimize database tables
mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME -e "OPTIMIZE TABLE item, groupname, hist;"

# Review performance metrics
curl http://localhost:3002/api/monitoring/performance
```

### Monthly
```bash
# Update dependencies (test environment first)
npm audit
npm update

# Review and rotate logs
logrotate -f /etc/logrotate.conf

# Database backup
mysqldump -u $DB_USER -p$DB_PASSWORD $DB_NAME > backup_$(date +%Y%m%d).sql
```

## 🆘 Emergency Procedures

### Complete System Recovery
```bash
#!/bin/bash
echo "=== Emergency System Recovery ==="

# 1. Stop all services
pm2 stop all
sudo systemctl stop nginx

# 2. Clear all caches
rm -rf /var/www/actinvent8/static/cache/videos/*
redis-cli FLUSHALL

# 3. Restart database
sudo systemctl restart mysql
sleep 10

# 4. Start services in order
pm2 start actinvent8
sleep 5
sudo systemctl start nginx

# 5. Verify system
curl http://localhost:3002/api/monitoring/health
echo "Recovery complete. Check health status above."
```

### Rollback Procedure
```bash
# If deployment fails, rollback to previous version
git checkout <previous-commit>
npm run build
pm2 restart actinvent8
```

---

**Remember**: Always test fixes in a non-production environment first!