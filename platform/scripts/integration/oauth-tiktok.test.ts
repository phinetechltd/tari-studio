import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { SignJWT } from "jose";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { totpAt } from "@/lib/totp";
import { beginEnrolment, confirmEnrolment } from "@/server/mfa";
import {
  beginTiktok,
  completeTiktokSignup,
  finishTiktok,
  readTiktokPending,
  sealTiktokPending,
  signInWithTiktok,
  tiktokLoginTransport,
} from "@/server/oauth-tiktok";

import { makeUser, rejection, uid } from "./_helpers";

/**
 * TikTok Login Kit (sign-in / sign-up). Everything but the network: the two TikTok calls are
 * scripted. Proves the state/PKCE handshake, the link-by-identity rule, the no-email sign-up
 * path (pending ticket -> complete with a real email + password), and the replay rules.
 */

const fakeTokens = (openId: string) => ({
  openId,
  accessToken: `atk_${uid()}`,
  accessExpiresAt: new Date(Date.now() + 3600_000),
  refreshToken: `rtk_${uid()}`,
  refreshExpiresAt: new Date(Date.now() + 3600_000 * 24 * 365),
  scopes: ["user.info.basic"],
});

async function runFlow(openId: string, displayName = "Demo TikToker") {
  tiktokLoginTransport.exchange = async () => fakeTokens(openId);
  tiktokLoginTransport.profile = async () => ({ openId, displayName, avatarUrl: null });
  const { url, cookie } = await beginTiktok(null);
  const authorize = new URL(url);
  assert.equal(authorize.hostname, "www.tiktok.com");
  assert.match(authorize.pathname, /auth\/authorize/);
  assert.equal(authorize.searchParams.get("scope"), "user.info.basic");
  assert.ok(authorize.searchParams.get("code_challenge"), "PKCE challenge is sent");
  const query = new URLSearchParams({ code: `code_${uid()}`, state: authorize.searchParams.get("state")! });
  return { cookie, out: await finishTiktok(cookie, query) };
}

describe("sign in with TikTok", () => {
  after(async () => {
    tiktokLoginTransport.exchange = null;
    tiktokLoginTransport.profile = null;
    await db.$disconnect();
  });

  it("rejects a callback whose state does not match", async () => {
    tiktokLoginTransport.exchange = async () => fakeTokens(`oid_${uid()}`);
    tiktokLoginTransport.profile = async () => ({ openId: `oid_${uid()}`, displayName: "x", avatarUrl: null });
    const { cookie } = await beginTiktok(null);
    const err = await rejection(() => finishTiktok(cookie, new URLSearchParams({ code: "c", state: "forged-state" })));
    assert.ok((err as ApiError).code === "TIKTOK_FAILED");
  });

  it("signs in a previously linked identity (one account per TikTok identity)", async () => {
    const { user } = await makeUser();
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    const openId = `oid_${uid()}`;
    await db.authIdentity.create({ data: { userId: user.id, provider: "TIKTOK", subject: openId, email: user.email } });

    const { out } = await runFlow(openId);
    const outcome = await signInWithTiktok(out.profile);
    assert.equal(outcome.kind, "ok");
    assert.equal(outcome.kind === "ok" && outcome.user.id, user.id, "the TikTok identity lands on its linked account");
  });

  it("an enrolled two-factor account is never bypassed by TikTok", async () => {
    const { user } = await makeUser();
    const { secret } = await beginEnrolment(user.id);
    await confirmEnrolment(user.id, totpAt(secret, Date.now()));
    const openId = `oid_${uid()}`;
    await db.authIdentity.create({ data: { userId: user.id, provider: "TIKTOK", subject: openId, email: user.email } });

    const { out } = await runFlow(openId);
    const outcome = await signInWithTiktok(out.profile);
    assert.equal(outcome.kind, "needs_password_and_code");
  });

  it("a new TikTok identity becomes a pending ticket, and complete() creates the account with the link and an email code", async () => {
    const openId = `oid_${uid()}`;
    const { out } = await runFlow(openId);
    const outcome = await signInWithTiktok(out.profile);
    assert.equal(outcome.kind, "new", "TikTok shares no email: a first-time identity cannot sign straight in");

    const pendingValue = await sealTiktokPending({ openId, name: "Demo TikToker", avatarUrl: null }, null);
    const pending = await readTiktokPending(pendingValue);
    assert.ok(pending);
    assert.equal(pending!.openId, openId);

    // A tampered or foreign ticket is refused.
    const forged = await new SignJWT({ kind: "tiktok-pending", openId })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("wrong-secret"));
    assert.equal(await readTiktokPending(forged), null);

    const email = `tt_${uid()}@test.example`;
    const done = await completeTiktokSignup(pending!, { email, password: "tiktok-demo-pass-1208" });
    assert.equal(done.email, email);
    const created = await db.user.findUniqueOrThrow({ where: { email }, include: { authIdentities: true } });
    assert.equal(created.authIdentities.length, 1);
    assert.equal(created.authIdentities[0]!.provider, "TIKTOK");
    assert.equal(created.authIdentities[0]!.subject, openId);
    assert.ok(created.passwordHash, "the chosen password is stored");
    assert.equal(created.emailVerifiedAt, null, "created unverified — the emailed code still confirms the address");
    // The confirmation code was issued (console-delivered in tests).
    assert.ok(await db.authToken.count({ where: { userId: created.id } }), "a verification code exists for the new account");

    // And a second run at the same openId is now a sign-in, not another account.
    const again = await signInWithTiktok({ openId, displayName: "Demo TikToker", avatarUrl: null });
    assert.equal(again.kind, "ok");
    assert.equal(again.kind === "ok" && again.user.id, created.id);
  });

  it("refuses to reuse an email that already has an account", async () => {
    const { user } = await makeUser();
    const err = await rejection(() => completeTiktokSignup({ openId: `oid_${uid()}`, name: "X", avatarUrl: null }, { email: user.email, password: "anything-safe-1" }));
    assert.equal((err as ApiError).status, 409);
  });
});
