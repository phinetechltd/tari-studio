// Dev/test Postgres lifecycle: `node scripts/pg.mjs start|stop|status`.
//
// Runs the Postgres binaries that the `embedded-postgres` dev dependency ships
// (no installer, no admin rights, nothing outside this folder). The cluster
// lives in `.pg/`, which is gitignored. Production uses a system Postgres; this
// exists so `npm run verify` works on a bare Windows laptop.
//
// It listens on 127.0.0.1:54329 (not 5432) so it can never collide with a
// Postgres someone already runs, and it uses password auth even locally.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PORT = 54329;
const USER = "agency";
const PASSWORD = "agency";
const DATABASES = ["agency_dev", "agency_test"];

const pgDir = path.join(root, ".pg");
const dataDir = path.join(pgDir, "data");
const logFile = path.join(pgDir, "postgres.log");

function binDir() {
  const pkg =
    process.platform === "win32"
      ? "@embedded-postgres/windows-x64"
      : process.platform === "darwin"
        ? `@embedded-postgres/darwin-${process.arch}`
        : `@embedded-postgres/linux-${process.arch}`;
  // The package's `exports` map hides its own package.json from require.resolve,
  // so the binaries are located by path instead.
  const dir = path.join(root, "node_modules", pkg, "native", "bin");
  if (!fs.existsSync(dir)) throw new Error(`Embedded Postgres binaries not found at ${dir}`);
  return dir;
}

const exe = (name) => path.join(binDir(), process.platform === "win32" ? `${name}.exe` : name);

function pgCtl(args, opts = {}) {
  return spawnSync(exe("pg_ctl"), args, { encoding: "utf8", ...opts });
}

function isRunning() {
  return pgCtl(["status", "-D", dataDir]).status === 0;
}

function initCluster() {
  if (fs.existsSync(path.join(dataDir, "PG_VERSION"))) return;
  fs.mkdirSync(pgDir, { recursive: true });
  const pwFile = path.join(pgDir, "pw.tmp");
  fs.writeFileSync(pwFile, PASSWORD);
  try {
    console.log("[pg] initialising cluster in .pg/data …");
    execFileSync(
      exe("initdb"),
      ["-D", dataDir, "-U", USER, `--pwfile=${pwFile}`, "-A", "scram-sha-256", "-E", "UTF8", "--locale=C"],
      { stdio: "inherit" },
    );
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
}

async function ensureDatabases() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    host: "127.0.0.1",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  try {
    for (const name of DATABASES) {
      const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      if (!rowCount) {
        await client.query(`CREATE DATABASE "${name}"`);
        console.log(`[pg] created database ${name}`);
      }
      // Prisma stores timestamps as naive UTC. A session in another zone (this
      // laptop is UTC+3) makes `now()` comparisons shift by hours and silently
      // breaks scheduling, so every database is pinned to UTC. Production needs
      // the same: ALTER DATABASE <name> SET timezone TO 'UTC'.
      await client.query(`ALTER DATABASE "${name}" SET timezone TO 'UTC'`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  initCluster();
  if (isRunning()) {
    console.log(`[pg] already running on 127.0.0.1:${PORT}`);
  } else {
    // stdio MUST be "ignore", not "pipe": the daemonised server inherits pipe
    // handles, so spawnSync would wait forever for pipes that never close. The
    // server's own output goes to the log file instead.
    const res = pgCtl(
      ["start", "-D", dataDir, "-l", logFile, "-w", "-t", "60", "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`],
      { stdio: "ignore" },
    );
    if (res.status !== 0) {
      if (fs.existsSync(logFile)) console.error(fs.readFileSync(logFile, "utf8").split("\n").slice(-20).join("\n"));
      process.exit(1);
    }
    console.log(`[pg] started on 127.0.0.1:${PORT}`);
  }
  await ensureDatabases();
}

function stop() {
  if (!isRunning()) return console.log("[pg] not running");
  const res = pgCtl(["stop", "-D", dataDir, "-m", "fast", "-w"], { stdio: "inherit" });
  process.exit(res.status ?? 0);
}

const cmd = process.argv[2];
if (cmd === "start") await start();
else if (cmd === "stop") stop();
else if (cmd === "status") console.log(isRunning() ? `[pg] running on 127.0.0.1:${PORT}` : "[pg] stopped");
else {
  console.error("usage: node scripts/pg.mjs start|stop|status");
  process.exit(2);
}
