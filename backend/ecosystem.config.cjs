module.exports = {
  apps: [
    {
      name: 'mp3juice-backend',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        ENABLE_AUTO_CLEANUP: 'true'
      }
    }
  ]
};
