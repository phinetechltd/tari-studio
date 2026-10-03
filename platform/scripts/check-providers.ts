/**
 * Live connectivity check for every external provider this deployment uses:
 *   npm run check:providers
 *
 * Uses the same checks as the platform admin's "Test connections" button
 * (src/server/provider-checks.ts), with the keys saved in the console applied
 * over the .env. Posts nothing, messages no one, charges no one, prints no secret.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be provided by the shell.
}

import { db } from "@/lib/db";
import { refreshPlatformConfig } from "@/lib/platform-config";
import { runProviderChecks } from "@/server/provider-checks";

async function main() {
  await refreshPlatformConfig(true);
  const results = await runProviderChecks();
  for (const r of results) {
    const mark = r.outcome === "ok" ? "✔" : r.outcome === "fail" ? "✖" : "–";
    console.log(`${mark} ${r.name.padEnd(18)} ${r.detail}`);
  }
  const failed = results.filter((r) => r.outcome === "fail").length;
  console.log(failed ? `\n${failed} provider check(s) failed.` : "\nEvery configured provider answered.");
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
