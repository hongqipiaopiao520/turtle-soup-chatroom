module.exports = {
  apps: [
    {
      name: "turtle-soup-chatroom",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "8787",
        DATABASE_URL: "file:./data/app.sqlite"
      },
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      time: true
    }
  ]
};
