/**
 * Creates the first platform admin, or makes an existing account one.
 *
 *   npm run admin:create
 *
 * Asks for the email, name and password at the terminal (the password is not
 * echoed and never appears in shell history or process lists). Run it on the
 * server, as the app's user, from the app directory. Afterwards sign in and
 * turn on two-factor sign-in under Security: admin settings need it.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be provided by the shell.
}

import readline from "node:readline";

import { assertPasswordAcceptable, hashPassword, WeakPasswordError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { normaliseEmail } from "@/lib/identity";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
// While a password is typed, print nothing but the prompt itself.
const out = rl as unknown as { _writeToOutput: (s: string) => void };
const writeToOutput = out._writeToOutput.bind(rl);
out._writeToOutput = (s: string) => {
  if (!muted) writeToOutput(s);
};

// Lines typed (or pasted) ahead of their question wait here rather than being lost.
const lines: string[] = [];
let waiting: { resolve: (l: string) => void; reject: (e: Error) => void } | null = null;
let closed = false;
rl.on("line", (line) => {
  if (waiting) {
    waiting.resolve(line);
    waiting = null;
  } else lines.push(line);
});
rl.on("close", () => {
  closed = true;
  waiting?.reject(new Error("Input ended before every answer was given."));
});

async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  try {
    if (lines.length) return lines.shift()!;
    if (closed) throw new Error("Input ended before every answer was given.");
    return await new Promise<string>((resolve, reject) => {
      waiting = { resolve, reject };
    });
  } finally {
    muted = false;
    if (hidden) process.stdout.write("\n");
  }
}

async function main() {
  if (!process.stdin.isTTY) throw new Error("Run this in an interactive terminal: it asks for the password.");

  const email = normaliseEmail(await ask("Email: "));
  if (!email) throw new Error("That is not an email address.");

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, name: true, isPlatformAdmin: true } });
  const name = existing ? existing.name : (await ask("Full name: ")).trim();
  if (!name) throw new Error("A name is required.");

  let passwordHash: string | undefined;
  const first = await ask(existing ? "New password (leave empty to keep the current one): " : "Password (10+ characters): ", true);
  if (first || !existing) {
    try {
      assertPasswordAcceptable(first, email);
    } catch (e) {
      if (e instanceof WeakPasswordError) throw new Error(e.message);
      throw e;
    }
    if ((await ask("Repeat the password: ", true)) !== first) throw new Error("The passwords do not match.");
    passwordHash = await hashPassword(first);
  }

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        isPlatformAdmin: true,
        status: "ACTIVE",
        // A new password signs every existing session out.
        ...(passwordHash ? { passwordHash, hasPassword: true, tokenVersion: { increment: 1 } } : {}),
      },
    });
    await audit({ userId: existing.id, action: "UPDATE", entity: "PlatformAdmin", entityId: existing.id, changes: { isPlatformAdmin: true, passwordChanged: Boolean(passwordHash), via: "scripts/create-admin.ts" } });
    console.log(existing.isPlatformAdmin ? `${email} was already a platform admin.${passwordHash ? " Password changed." : ""}` : `${email} is now a platform admin.`);
  } else {
    const user = await db.user.create({
      data: { email, name, passwordHash: passwordHash!, isPlatformAdmin: true, emailVerifiedAt: new Date() },
      select: { id: true },
    });
    await audit({ userId: user.id, action: "CREATE", entity: "PlatformAdmin", entityId: user.id, changes: { isPlatformAdmin: true, via: "scripts/create-admin.ts" } });
    console.log(`Created platform admin ${email}.`);
  }
  console.log("Next: sign in, then turn on two-factor sign-in under Security (admin settings require it).");
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    return db.$disconnect();
  });
