// Runs the database-backed test suite against a DEDICATED test database.
//
//   1. makes sure the local Postgres is up,
//   2. applies the real migrations to the *_test database (`migrate deploy`, the
//      same command production uses, so the migrations are what is tested),
//   3. runs scripts/integration/*.test.ts one file at a time.
//
// It never wipes anything. Every test builds its own uniquely named fixtures, so
// the suite is repeatable on a database that already holds earlier runs' rows.
// (`prisma migrate reset` is deliberately not used: Prisma blocks it for AI
// agents without explicit user consent, and it is not needed. For a blank
// slate, drop agency_test yourself and rerun.)
//
// It still refuses to run against anything whose name does not end in "_test":
// the tests write rows, and must never be pointed at a developer's own data.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fromDotEnv(name) {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return undefined;
  const m = fs.readFileSync(file, "utf8").match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return m?.[1];
}

const testUrl =
  process.env.TEST_DATABASE_URL ??
  fromDotEnv("TEST_DATABASE_URL") ??
  "postgresql://agency:agency@127.0.0.1:54329/agency_test?schema=public&connection_limit=5";

const dbName = new URL(testUrl).pathname.replace(/^\//, "");
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: "${dbName}" is not a *_test database. Integration tests write rows to their database.`);
  process.exit(2);
}

// Fixed, obviously-fake values: the suite must not depend on anyone's real .env.
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: testUrl,
  AUTH_SECRET: "integration-test-secret-only-used-by-the-test-suite-0123456789",
  CREDENTIALS_KEY: Buffer.alloc(32, 7).toString("base64"),
  ACCESS_TOKEN_TTL_MIN: "60",
  EMAIL_PROVIDER: "console",
  SMS_PROVIDER: "console",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  META_PROVIDER: "simulator",
  AI_PROVIDER: "fixtures",
  // Prisma loads the developer's .env into process.env at runtime, so anything
  // the suite depends on is pinned here. Above all, tests must never reach the
  // real M-Pesa or Higgsfield, whatever keys a developer has configured.
  REQUIRE_TOTP: "true",
  PAYMENT_PROVIDER: "simulator",
  GENERATION_PROVIDER: "simulator",
  MPESA_CONSUMER_KEY: "",
  MPESA_CONSUMER_SECRET: "",
  MPESA_PASSKEY: "",
  HF_CREDENTIALS: "",
  // Never real Paystack either; the secret only signs the webhook tests' payloads.
  PAYSTACK_PROVIDER: "simulator",
  PAYSTACK_SECRET_KEY: "sk_test_integration_only",
  // Never the real Claude or Meta from a test run, whatever the developer's .env holds.
  ANTHROPIC_API_KEY: "",
  NVIDIA_API_KEY: "",
  AI_FALLBACK_CHAIN: "",
  META_APP_ID: "",
  META_APP_SECRET: "integration-meta-app-secret",
  META_WEBHOOK_VERIFY_TOKEN: "integration-verify-token",
  APP_BASE_URL: "http://localhost:3400",
};

function run(cmd, args, label) {
  const res = spawnSync(cmd, args, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) {
    console.error(`\n✖ ${label} failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}

run("node", ["scripts/pg.mjs", "start"], "starting Postgres");
run("npx", ["prisma", "migrate", "deploy"], "applying migrations to the test database");

// Re-assert the UTC pin (see scripts/pg.mjs) so a database created any other way
// still runs in UTC; the clock tests fail loudly if it does not.
const { default: pg } = await import("pg");
const u = new URL(testUrl);
const admin = new pg.Client({
  host: u.hostname,
  port: Number(u.port),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: "postgres",
});
await admin.connect();
await admin.query(`ALTER DATABASE "${dbName}" SET timezone TO 'UTC'`);
await admin.end();

run(
  "npx",
  [
    "tsx",
    "--tsconfig",
    "scripts/tsconfig.json",
    "--test",
    "--test-concurrency=1",
    "scripts/integration/*.test.ts",
  ],
  "integration tests",
);
