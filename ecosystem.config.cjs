// PM2: pm2 start ecosystem.config.cjs && pm2 save
// Runs `npm run swarm` (UI + /v1 API on port 10016) and keeps it alive across crashes and reboots.
const os = require("node:os");
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "AICH",
      cwd: __dirname,
      script: "npm",
      args: "run swarm",
      // PM2 does not load your shell profile: make rustup's cargo visible for `cargo build`.
      env: {
        PATH: [path.join(os.homedir(), ".cargo", "bin"), process.env.PATH].filter(Boolean).join(path.delimiter),
      },
      // first start compiles the gateway (several minutes); let swarm stop gateway + web cleanly
      kill_timeout: 10000,
      min_uptime: 60000,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
