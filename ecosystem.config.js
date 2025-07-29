module.exports = {
  apps: [{
    name: 'actinvent8-rfid',
    script: 'rfid_server.js',
    cwd: '/var/www/actinvent8',
    
    // Instance configuration
    instances: 1, // Single instance for simplicity (can be scaled later)
    exec_mode: 'fork', // Use fork mode for single instance
    
    // Environment
    env: {
      NODE_ENV: 'development',
      PORT: 3002
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    
    // Process management
    autorestart: true,
    watch: false, // Disable in production (use CI/CD for updates)
    max_memory_restart: '1G', // Restart if memory usage exceeds 1GB
    
    // Logging
    log_file: './logs/pm2-combined.log',
    out_file: './logs/pm2-out.log',
    error_file: './logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Advanced process management
    min_uptime: '10s', // Minimum uptime before considering restart
    max_restarts: 10, // Maximum restarts within restart_delay
    restart_delay: 5000, // Delay between restarts (5 seconds)
    
    // Performance monitoring
    pmx: true, // Enable PM2+ monitoring
    monitoring: true,
    
    // Graceful shutdown
    kill_timeout: 5000, // Time to wait for graceful shutdown
    listen_timeout: 3000, // Time to wait for app to listen
    
    // Process signals
    shutdown_with_message: true,
    
    // Health monitoring
    health_check_url: 'http://localhost:3002/api/monitoring/health',
    health_check_grace_period: 3000,
    
    // Node.js specific
    node_args: [
      '--max-old-space-size=2048', // Limit memory to 2GB
      '--optimize-for-size' // Optimize for memory usage over speed
    ],
    
    // Error handling
    ignore_watch: [
      'node_modules',
      'logs',
      'static/cache',
      '.git'
    ],
    
    // Environment-specific overrides
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3002,
      LOG_LEVEL: 'debug'
    }
  }],

  deploy: {
    production: {
      user: 'debian',
      host: 'xxxxxx.xx',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/actinvent8.git',
      path: '/var/www/actinvent8',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};