module.exports = {
  apps: [{
    name: 'wa-bot-premiuminplus',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M', // Optimasi: restart jika memory > 300MB
    restart_delay: 5000, // Optimasi: delay 5 detik sebelum restart
    env: {
      NODE_ENV: 'production'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true,
    // Optimasi: PM2 production mode
    exec_mode: 'fork',
    // Optimasi: disable PM2 logs untuk performa
    disable_logs: false,
    // Optimasi: graceful shutdown
    kill_timeout: 5000,
    // Optimasi: auto restart on crash
    min_uptime: '10s',
    max_restarts: 10
  }]
}