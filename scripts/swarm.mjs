#!/usr/bin/env node
// `npm run swarm` — run the whole AICH stack from source behind ONE port (default 10016).
//
//   http://localhost:10016        Web UI (chat, console, admin)
//   http://localhost:10016/v1     OpenAI-compatible API (proxied to the gateway)
//
// 10016 is the only fixed port. The gateway, Postgres and Redis listen on random free ports bound to
// 127.0.0.1 (picked by the OS at start), so they are never reachable from outside and never collide.
//
// Steps: .env secrets → Postgres/Redis (docker compose, unless DATABASE_URL is set)
//        → cargo build --release → gateway on 127.0.0.1:<random> → next build (when sources changed)
//        → Next.js standalone server on 0.0.0.0:10016. Ctrl+C (or closing the terminal) stops gateway
//        and web; the database containers keep running (stop them with `npm run swarm:down`).
//
// Environment (shell or .env): SWARM_PORT=10016  SWARM_HOST=0.0.0.0  SWARM_PUBLIC_URL=http://localhost:10016
//   DATABASE_URL / REDIS_URL (use your own services instead of docker)
// Flags: --no-build (reuse existing builds)   --down (stop the database containers)

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
const GATEWAY = path.join(ROOT, "gateway");
const ENV_FILE = path.join(ROOT, ".env");
const PID_FILE = path.join(ROOT, ".swarm.pid");
const COMPOSE = ["compose", "-f", path.join(ROOT, "docker-compose.yml"), "-f", path.join(ROOT, "scripts", "swarm.compose.yml")];
const args = new Set(process.argv.slice(2));
const IS_WIN = process.platform === "win32";

const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = c(2), bold = c(1), red = c(31), green = c(32), cyan = c(36), magenta = c(35);
const log = (msg) => console.log(`${bold(cyan("[swarm]"))} ${msg}`);
const die = (msg) => {
  console.error(`${bold(red("[swarm]"))} ${msg}`);
  process.exit(1);
};

// ---------- .env ----------
function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    const sample = path.join(ROOT, ".env.sample");
    fs.copyFileSync(sample, ENV_FILE);
    fs.chmodSync(ENV_FILE, 0o600);
    log(`created .env from .env.sample`);
  }
  const vars = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    vars[m[1]] = v;
  }
  return vars;
}

/** Fill AICH_MASTER_KEY / AICH_JWT_SECRET in .env when missing (same as scripts/init_env.sh). */
function ensureSecrets(fileVars) {
  const wanted = {
    AICH_MASTER_KEY: () => randomBytes(32).toString("hex"),
    AICH_JWT_SECRET: () => randomBytes(48).toString("base64"),
  };
  let text = fs.readFileSync(ENV_FILE, "utf8");
  let changed = false;
  for (const [name, gen] of Object.entries(wanted)) {
    if (process.env[name] || fileVars[name]) continue;
    const value = gen();
    const re = new RegExp(`^${name}=\\s*$`, "m");
    text = re.test(text) ? text.replace(re, `${name}=${value}`) : `${text.replace(/\n?$/, "\n")}${name}=${value}\n`;
    fileVars[name] = value;
    changed = true;
    log(`generated ${name} in .env`);
  }
  if (changed) fs.writeFileSync(ENV_FILE, text, { mode: 0o600 });
}

// ---------- helpers ----------
function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: "inherit", shell: IS_WIN, ...opts });
  if (r.error) die(`${cmd} failed: ${r.error.message}`);
  if (r.status !== 0) die(`${cmd} ${argv.join(" ")} exited with code ${r.status}`);
}

function has(cmd, argv = ["--version"]) {
  const r = spawnSync(cmd, argv, { stdio: "ignore", shell: IS_WIN });
  return !r.error && r.status === 0;
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}

/** Ask the OS for a free loopback port. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Stop gateway/web processes left behind by a previous swarm that was killed without cleanup. */
function reapStale() {
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
  } catch {
    return;
  }
  const commandOf = (pid) => (IS_WIN ? "" : (spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).stdout ?? ""));
  if (prev.swarm && prev.swarm !== process.pid && alive(prev.swarm) && (IS_WIN || /swarm\.mjs/.test(commandOf(prev.swarm)))) {
    die(`npm run swarm is already running (pid ${prev.swarm}). Stop it first (Ctrl+C in its terminal, or kill ${prev.swarm}).`);
  }
  for (const pid of prev.children ?? []) {
    if (!alive(pid)) continue;
    // Next.js renames its process to "next-server (vX)".
    if (/aich-gateway|next-server|standalone[\\/]server\.js/.test(commandOf(pid))) {
      log(`stopping leftover process from a previous run (pid ${pid})`);
      process.kill(pid, "SIGTERM");
    }
  }
  fs.rmSync(PID_FILE, { force: true });
}

async function waitFor(url, ms, child) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (child && child.exitCode !== null) return false;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function newestMtime(entries) {
  let newest = 0;
  const walk = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    } else newest = Math.max(newest, st.mtimeMs);
  };
  entries.forEach(walk);
  return Math.floor(newest);
}

// ---------- main ----------
const fileVars = readEnvFile();
const env = { ...fileVars, ...process.env };

if (args.has("--down")) {
  run("docker", [...COMPOSE, "stop", "postgres", "redis"], { cwd: ROOT, env });
  process.exit(0);
}

ensureSecrets(fileVars);
Object.assign(env, fileVars, process.env);

const PORT = Number(env.SWARM_PORT || 10016);
const HOST = env.SWARM_HOST || "0.0.0.0";
const PUBLIC_URL = (env.SWARM_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const API_BASE = `${PUBLIC_URL}/v1`;
const build = !args.has("--no-build");

reapStale();
if (!(await portFree(PORT, HOST))) {
  await new Promise((r) => setTimeout(r, 1500)); // a reaped leftover may still be releasing it
  if (!(await portFree(PORT, HOST))) die(`port ${PORT} is already in use (set SWARM_PORT to use another port)`);
}

// 1. Database + Redis
let databaseUrl = env.DATABASE_URL;
let redisUrl = env.REDIS_URL;
if (!databaseUrl) {
  if (!has("docker", ["compose", "version"])) {
    die("DATABASE_URL is not set and Docker is not available. Install Docker, or set DATABASE_URL (and optionally REDIS_URL) in .env.");
  }
  if (!has("docker", ["info"])) {
    die("DATABASE_URL is not set and the Docker daemon is not running. Start Docker (Desktop), or set DATABASE_URL in .env.");
  }
  log("starting postgres and redis with docker compose…");
  run("docker", [...COMPOSE, "up", "-d", "--wait", "postgres", "redis"], { cwd: ROOT, env });
  // Docker published them on random 127.0.0.1 ports (scripts/swarm.compose.yml); look them up.
  const published = (service, port) => {
    const r = spawnSync("docker", [...COMPOSE, "port", service, String(port)], { cwd: ROOT, env, encoding: "utf8", shell: IS_WIN });
    const m = (r.stdout ?? "").trim().match(/:(\d+)$/m);
    if (!m) die(`could not find the published port of ${service}: ${(r.stderr ?? "").trim()}`);
    return m[1];
  };
  const pgPort = published("postgres", 5432);
  const redisPort = published("redis", 6379);
  log(dim(`postgres 127.0.0.1:${pgPort}, redis 127.0.0.1:${redisPort} (internal)`));
  databaseUrl = `postgres://aich:${encodeURIComponent(env.POSTGRES_PASSWORD || "aich")}@127.0.0.1:${pgPort}/aich`;
  redisUrl = redisUrl || `redis://127.0.0.1:${redisPort}`;
} else {
  log(`using DATABASE_URL from environment${redisUrl ? " and REDIS_URL" : " (no REDIS_URL: in-memory rate limits/cache)"}`);
}

// 2. Gateway
const gwBin = path.join(GATEWAY, "target", "release", IS_WIN ? "aich-gateway.exe" : "aich-gateway");
if (build) {
  if (!has("cargo")) die("cargo not found. Install Rust from https://rustup.rs (or run with --no-build after building the gateway).");
  log("building gateway (cargo build --release)…");
  run("cargo", ["build", "--release", "--locked"], { cwd: GATEWAY });
}
if (!fs.existsSync(gwBin)) die(`gateway binary missing: ${gwBin} (run without --no-build)`);

// 3. Web
const standaloneDir = path.join(WEB, ".next", "standalone");
const serverJs = path.join(standaloneDir, "server.js");
if (build) {
  const lock = path.join(WEB, "package-lock.json");
  const installed = path.join(WEB, "node_modules", ".package-lock.json");
  if (!fs.existsSync(installed) || fs.statSync(lock).mtimeMs > fs.statSync(installed).mtimeMs) {
    log("installing web dependencies (npm ci)…");
    run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: WEB });
  }
  const stampFile = path.join(WEB, ".next", "swarm-build.json");
  const stamp = JSON.stringify({
    apiBase: API_BASE,
    sources: newestMtime(["src", "public", "package-lock.json", "package.json", "next.config.ts"].map((p) => path.join(WEB, p))),
  });
  const prev = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, "utf8") : "";
  if (prev !== stamp || !fs.existsSync(serverJs)) {
    log(`building web (next build, API base ${API_BASE})…`);
    run("npm", ["run", "build"], { cwd: WEB, env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: API_BASE, NEXT_TELEMETRY_DISABLED: "1" } });
    // standalone output needs the static assets next to server.js (same as web/Dockerfile)
    fs.cpSync(path.join(WEB, ".next", "static"), path.join(standaloneDir, ".next", "static"), { recursive: true });
    fs.cpSync(path.join(WEB, "public"), path.join(standaloneDir, "public"), { recursive: true });
    fs.writeFileSync(stampFile, stamp);
  } else {
    log("web build is up to date");
  }
}
if (!fs.existsSync(serverJs)) die(`web build missing: ${serverJs} (run without --no-build)`);

// 4. Run both, prefixing their output
const children = [];
let stopping = false;

function start(name, color, cmd, argv, opts) {
  const child = spawn(cmd, argv, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
  const tag = color(`[${name}]`.padEnd(10));
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) console.log(`${tag}${l}`);
    });
  }
  child.on("exit", (code, signal) => {
    if (stopping) return;
    log(red(`${name} exited (${signal ?? code}); stopping`));
    shutdown(1);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const ch of children) if (ch.exitCode === null) ch.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const ch of children) if (ch.exitCode === null) ch.kill("SIGKILL");
    process.exit(code);
  }, 5000);
  force.unref();
  Promise.all(children.map((ch) => (ch.exitCode !== null ? null : new Promise((r) => ch.once("exit", r))))).then(() => process.exit(code));
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => shutdown(0));
process.on("exit", () => {
  for (const ch of children) if (ch.exitCode === null) ch.kill("SIGKILL");
  try {
    const cur = JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
    if (cur.swarm === process.pid) fs.rmSync(PID_FILE, { force: true });
  } catch {
    /* already gone */
  }
});
const savePids = () =>
  fs.writeFileSync(PID_FILE, JSON.stringify({ swarm: process.pid, children: children.map((ch) => ch.pid).filter(Boolean) }));

const siteOrigins = [
  ...(env.AICH_CAFECA_SITE_ORIGINS || "").split(","),
  PUBLIC_URL,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter((s, i, a) => s && a.indexOf(s) === i)
  .join(",");

const GW_PORT = await freePort();
log(`starting gateway on 127.0.0.1:${GW_PORT} (internal)…`);
const gateway = start("gateway", magenta, gwBin, [], {
  cwd: GATEWAY,
  env: {
    ...env,
    DATABASE_URL: databaseUrl,
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    AICH_BIND: `127.0.0.1:${GW_PORT}`,
    AICH_CAFECA_SITE_ORIGINS: siteOrigins,
  },
});
savePids();
if (!(await waitFor(`http://127.0.0.1:${GW_PORT}/health`, 90_000, gateway))) {
  log(red("gateway did not become healthy"));
  shutdown(1);
} else {
  log(`starting web on ${HOST}:${PORT}…`);
  const web = start("web", green, process.execPath, [serverJs], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(PORT),
      HOSTNAME: HOST,
      GATEWAY_URL: `http://127.0.0.1:${GW_PORT}`,
    },
  });
  savePids();
  if (await waitFor(`http://127.0.0.1:${PORT}/gw/health`, 60_000, web)) {
    console.log(
      [
        "",
        bold(green("  AICH is running")),
        `  Web UI       ${bold(PUBLIC_URL)}`,
        `  OpenAI API   ${bold(API_BASE)}`,
        dim("  The first person to sign in becomes the administrator. Ctrl+C to stop."),
        "",
      ].join("\n"),
    );
  }
}
