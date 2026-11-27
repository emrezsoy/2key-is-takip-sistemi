// PM2: Mesaj Otomasyonu arka plan süreci (dm-worker). Web uygulaması (puantaj-sistemi) ayrı süreçtir, bu dosya ona dokunmaz.
// Sunucuda: cd /opt/gorev-puantaj && pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "dm-worker",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "worker/index.ts",
      interpreter: "node",
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
      restart_delay: 3000,
      max_restarts: 50,
      autorestart: true,
      time: true,
    },
  ],
};
