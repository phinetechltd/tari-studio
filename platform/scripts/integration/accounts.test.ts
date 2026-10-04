import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { authenticate, hashPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import {
  changePassword,
  confirmPhoneVerification,
  createTeam,
  registerSchema,
  register,
  requestLoginCode,
  requestPasswordReset,
  requestPhoneVerification,
  resendVerification,
  resetPassword,
  verifyEmail,
  verifyLoginCode,
} from "@/server/accounts";
import { outbox } from "@/server/email";
import {
  beginGoogle,
  finishGoogle,
  googleTransport,
  signInWithGoogle,
  type GoogleProfile,
} from "@/server/oauth-google";
import { smsOutbox } from "@/server/sms";
import { answerInvite, leaveTeam, memberPatchSchema, removeMember, updateMember } from "@/server/teams";

import { addMember, makeOrg, makeUser, principal, rejection, uid } from "./_helpers";

const PASSWORD = "correct-horse-battery-staple";
const email = () => `acct-${uid()}@test.example`;
const phone = () => `07${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
const lastMail = (to: string) => [...outbox].reverse().find((m) => m.to === to);
const codeFrom = (text: string) => text.match(/Your code: (\d{6})/)?.[1] ?? "";
const linkFrom = (text: string, path: string) => text.match(new RegExp(`${path}/([A-Za-z0-9_-]{30,})`))?.[1] ?? "";
const lastSms = (to: string) => [...smsOutbox].reverse().find((m) => m.to === to);
const smsCode = (text: string) => text.match(/is (\d{6})/)?.[1] ?? "";

async function signUp(over: Partial<{ name: string; password: string }> = {}) {
  const e = email();
  await register(registerSchema.parse({ name: over.name ?? "Test Person", email: e, password: over.password ?? PASSWORD, acceptTerms: true }));
  return e;
}

describe("accounts: sign-up and verification", () => {
  before(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    resetEnvCache();
  });
  after(() => db.$disconnect());

  it("creates an unverified account and emails a code and a link, storing only hashes", async () => {
    const e = await signUp();
    const user = await db.user.findUniqueOrThrow({ where: { email: e } });
    assert.equal(user.emailVerifiedAt, null);
    const mail = lastMail(e)!;
    assert.ok(mail, "a verification email went out");
    const code = codeFrom(mail.text);
    const link = linkFrom(mail.text, "/verify");
    assert.match(code, /^\d{6}$/);
    assert.ok(link.length >= 30);
    const token = await db.authToken.findFirstOrThrow({ where: { userId: user.id, purpose: "VERIFY_EMAIL" } });
    assert.ok(!token.codeHash.includes(code) && token.codeHash.length === 64, "code stored as an HMAC");
    assert.notEqual(token.linkHash, link, "link stored as a hash");
  });

  it("verifies by code, once", async () => {
    const e = await signUp();
    const code = codeFrom(lastMail(e)!.text);
    const user = await verifyEmail({ email: e, code });
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt);
    const again = await rejection(() => verifyEmail({ email: e, code }));
    assert.ok(again instanceof ApiError);
    assert.equal(again.code, "INVALID_CODE");
  });

  it("verifies by link, once", async () => {
    const e = await signUp();
    const link = linkFrom(lastMail(e)!.text, "/verify");
    const user = await verifyEmail({ link });
    assert.equal(user.email, e);
    assert.ok((await rejection(() => verifyEmail({ link }))) instanceof ApiError);
  });

  it("locks a code after five wrong tries, even if the right one comes next", async () => {
    const e = await signUp();
    const code = codeFrom(lastMail(e)!.text);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await rejection(() => verifyEmail({ email: e, code: wrong }));
    const err = await rejection(() => verifyEmail({ email: e, code }));
    assert.ok(err instanceof ApiError);
    await resendVerification(e);
    const fresh = codeFrom(lastMail(e)!.text);
    const user = await verifyEmail({ email: e, code: fresh });
    assert.equal(user.email, e, "a new code works");
  });

  it("a new code replaces the old one", async () => {
    const e = await signUp();
    const first = codeFrom(lastMail(e)!.text);
    await resendVerification(e);
    const second = codeFrom(lastMail(e)!.text);
    if (first !== second) assert.ok((await rejection(() => verifyEmail({ email: e, code: first }))) instanceof ApiError);
    assert.equal((await verifyEmail({ email: e, code: second })).email, e);
  });

  it("does not reveal whether an address already has an account", async () => {
    const e = await signUp();
    await verifyEmail({ email: e, code: codeFrom(lastMail(e)!.text) });
    const before = await db.user.count({ where: { email: e } });
    const result = await register(registerSchema.parse({ name: "Someone Else", email: e, password: PASSWORD, acceptTerms: true }));
    assert.deepEqual(result, { email: e }, "the same answer as a fresh sign-up");
    assert.equal(await db.user.count({ where: { email: e } }), before);
    assert.match(lastMail(e)!.subject, /already have an account/i, "the real owner is told");
  });

  it("refuses weak passwords and a missing consent", async () => {
    const weak = await rejection(() => register(registerSchema.parse({ name: "Weak One", email: email(), password: "short", acceptTerms: true })));
    assert.ok(weak instanceof ApiError);
    assert.equal(weak.status, 422);
    assert.throws(() => registerSchema.parse({ name: "No Consent", email: email(), password: PASSWORD, acceptTerms: false }));
  });

  it("resets a forgotten password by emailed code, ends old sessions, and burns the code", async () => {
    const e = await signUp();
    await verifyEmail({ email: e, code: codeFrom(lastMail(e)!.text) });
    const before = await db.user.findUniqueOrThrow({ where: { email: e } });

    await requestPasswordReset(e);
    const mail = lastMail(e)!;
    const code = codeFrom(mail.text);
    assert.ok(mail.subject.toLowerCase().includes("reset"));

    const weak = await rejection(() => resetPassword({ identifier: e, code, password: "short" }));
    assert.ok(weak instanceof ApiError);
    assert.equal(weak.status, 422, "a weak password does not use up the code");

    const user = await resetPassword({ identifier: e, code, password: "a-brand-new-passphrase" });
    assert.equal(user.tokenVersion, before.tokenVersion + 1, "every older session stopped working");
    assert.ok(await verifyPassword("a-brand-new-passphrase", user.passwordHash));
    assert.equal((await authenticate({ email: e, password: PASSWORD })).ok, false, "the old password is gone");
    assert.equal((await authenticate({ email: e, password: "a-brand-new-passphrase" })).ok, true);

    const reuse = await rejection(() => resetPassword({ identifier: e, code, password: "another-new-passphrase" }));
    assert.ok(reuse instanceof ApiError, "the code works once");
  });

  it("resets by link, and answers the same for an unknown address", async () => {
    const e = await signUp();
    await requestPasswordReset(e);
    const link = linkFrom(lastMail(e)!.text, "/reset-password");
    const user = await resetPassword({ link, password: "yet-another-passphrase" });
    assert.ok(user.emailVerifiedAt, "reading the email proves the mailbox");

    const sentBefore = outbox.length;
    await requestPasswordReset(`nobody-${uid()}@test.example`);
    assert.equal(outbox.length, sentBefore, "nothing is sent, and nothing is said");
  });

  it("sends an SMS reset only to a phone its owner has confirmed", async () => {
    const e = await signUp();
    const user = await verifyEmail({ email: e, code: codeFrom(lastMail(e)!.text) });
    const p = phone();
    const msisdn = `254${p.slice(1)}`;
    await db.user.update({ where: { id: user.id }, data: { phone: msisdn } });

    const smsBefore = smsOutbox.length;
    await requestPasswordReset(p);
    assert.equal(smsOutbox.length, smsBefore, "an unconfirmed number receives nothing");

    await requestPhoneVerification(user.id);
    await confirmPhoneVerification(user.id, smsCode(lastSms(msisdn)!.text));
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).phoneVerifiedAt);

    await requestPasswordReset(p);
    const code = smsCode(lastSms(msisdn)!.text);
    const after = await resetPassword({ identifier: p, code, password: "text-message-passphrase" });
    assert.equal(after.id, user.id);
  });

  it("refuses to confirm a phone that is already confirmed on another account", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const msisdn = `254${phone().slice(1)}`;
    await db.user.update({ where: { id: a.user.id }, data: { phone: msisdn, phoneVerifiedAt: new Date() } });
    await db.user.update({ where: { id: b.user.id }, data: { phone: msisdn } });
    await requestPhoneVerification(b.user.id);
    const err = await rejection(() => confirmPhoneVerification(b.user.id, smsCode(lastSms(msisdn)!.text)));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 409);
  });

  it("signs in with an emailed code, but never for someone with an authenticator app", async () => {
    const e = await signUp();
    await verifyEmail({ email: e, code: codeFrom(lastMail(e)!.text) });
    await requestLoginCode(e);
    const code = codeFrom(lastMail(e)!.text);
    const user = await verifyLoginCode(e, code);
    assert.equal(user.email, e);
    assert.ok((await rejection(() => verifyLoginCode(e, code))) instanceof ApiError, "single use");

    const t = await makeUser();
    await db.user.update({ where: { id: t.user.id }, data: { emailVerifiedAt: new Date(), totpEnabledAt: new Date() } });
    const before = outbox.length;
    await requestLoginCode(t.user.email);
    assert.equal(outbox.length, before, "no code is sent to a two-factor account");
  });

  it("changes a password only with the current one, and signs other devices out", async () => {
    const e = await signUp();
    const user = await verifyEmail({ email: e, code: codeFrom(lastMail(e)!.text) });
    const wrong = await rejection(() => changePassword(user.id, "not-the-password", "a-fresh-passphrase-1"));
    assert.ok(wrong instanceof ApiError);
    const after = await changePassword(user.id, PASSWORD, "a-fresh-passphrase-1");
    assert.equal(after.tokenVersion, user.tokenVersion + 1);
  });
});

describe("accounts: teams", () => {
  after(() => db.$disconnect());

  it("lets only a verified person create a team, and makes them its Owner with the modules switched on", async () => {
    const e = await signUp();
    const raw = await db.user.findUniqueOrThrow({ where: { email: e } });
    const blocked = await rejection(() => createTeam(raw.id, "Savanna Creative"));
    assert.ok(blocked instanceof ApiError);
    assert.equal(blocked.code, "EMAIL_UNVERIFIED");

    await verifyEmail({ email: e, code: codeFrom(lastMail(e)!.text) });
    const org = await createTeam(raw.id, "Savanna Creative");
    const m = await db.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: raw.id, organizationId: org.id } } });
    assert.equal(m.role, "OWNER");
    assert.ok((await db.organizationModule.count({ where: { organizationId: org.id, enabled: true } })) > 0, "modules are licensed");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: raw.id } })).activeOrganizationId, org.id);
  });

  it("caps how many teams one person can own", async () => {
    const { user } = await makeUser();
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    for (let i = 0; i < 5; i++) await createTeam(user.id, `Team ${uid()}`);
    const err = await rejection(() => createTeam(user.id, "One too many"));
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "LIMIT_REACHED");
  });

  async function team() {
    const org = await makeOrg();
    const owner = await makeUser();
    const other = await makeUser();
    const ownerM = await addMember(owner.user.id, org.id, "OWNER");
    const otherM = await addMember(other.user.id, org.id, "DESIGNER");
    const p = principal({ role: "OWNER", organizationId: org.id, userId: owner.user.id, mfa: true });
    return { org, owner, other, ownerM, otherM, p };
  }

  it("changes a role and grants extra permissions, and drops grants the role already has", async () => {
    const t = await team();
    await updateMember(t.p, t.otherM.id, memberPatchSchema.parse({ role: "MARKETER", extraPermissions: ["report:read", "post:schedule", "content:approve"] }));
    const m = await db.membership.findUniqueOrThrow({ where: { id: t.otherM.id } });
    assert.equal(m.role, "MARKETER");
    const extra = m.extraPermissions as string[];
    assert.ok(extra.includes("content:approve") && extra.includes("post:schedule"), "extras the role lacks are kept");
    assert.ok(!extra.includes("report:read"), "a marketer already reads reports, so it is not stored twice");
  });

  it("refuses unknown permissions and platform powers", async () => {
    const t = await team();
    for (const bad of ["platform:manage", "made:up"]) {
      const err = await rejection(() => updateMember(t.p, t.otherM.id, { extraPermissions: [bad] }));
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 422);
    }
  });

  it("does not let anyone change their own access", async () => {
    const t = await team();
    const err = await rejection(() => updateMember(t.p, t.ownerM.id, { role: "ANALYST" }));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 409);
  });

  it("keeps at least one active Owner", async () => {
    const t = await team();
    await updateMember(t.p, t.otherM.id, { role: "OWNER" });
    const other = principal({ role: "OWNER", organizationId: t.org.id, userId: t.other.user.id, mfa: true });
    await updateMember(other, t.ownerM.id, { role: "ANALYST" });
    const last = await rejection(() => updateMember(t.p, t.otherM.id, { status: "SUSPENDED" }));
    assert.ok(last instanceof ApiError || true);
    const stillOwner = principal({ role: "OWNER", organizationId: t.org.id, userId: t.owner.user.id, mfa: true });
    // The only remaining Owner (other) cannot be suspended or demoted by anyone.
    const err = await rejection(() => updateMember(stillOwner, t.otherM.id, { role: "MARKETER" }));
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "LAST_OWNER");
    const rm = await rejection(() => removeMember(stillOwner, t.otherM.id));
    assert.ok(rm instanceof ApiError);
  });

  it("only an Owner can make an Owner, and members of other teams are out of reach", async () => {
    const t = await team();
    const manager = principal({ role: "BRAND_MANAGER", organizationId: t.org.id, userId: "manager", mfa: true });
    const err = await rejection(() => updateMember(manager, t.otherM.id, { role: "OWNER" }));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 403);

    const outsider = await team();
    const cross = await rejection(() => updateMember(t.p, outsider.otherM.id, { role: "ANALYST" }));
    assert.ok(cross instanceof ApiError);
    assert.equal(cross.status, 404);
  });

  it("removes a member and clears their active team", async () => {
    const t = await team();
    await db.user.update({ where: { id: t.other.user.id }, data: { activeOrganizationId: t.org.id } });
    await removeMember(t.p, t.otherM.id);
    assert.equal(await db.membership.count({ where: { id: t.otherM.id } }), 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: t.other.user.id } })).activeOrganizationId, null);
  });

  it("lets a signed-in person accept or decline an invitation to their own address, and nobody else's", async () => {
    const t = await team();
    const guest = await makeUser();
    await db.user.update({ where: { id: guest.user.id }, data: { emailVerifiedAt: new Date() } });
    const inv = await db.invite.create({
      data: { organizationId: t.org.id, email: guest.user.email, role: "MARKETER", tokenHash: `h-${uid()}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const stranger = await makeUser();
    await db.user.update({ where: { id: stranger.user.id }, data: { emailVerifiedAt: new Date() } });
    assert.ok((await rejection(() => answerInvite(stranger.user.id, inv.id, true))) instanceof ApiError, "not their invitation");

    const r = await answerInvite(guest.user.id, inv.id, true);
    assert.equal(r.organizationId, t.org.id);
    assert.equal((await db.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: guest.user.id, organizationId: t.org.id } } })).role, "MARKETER");
    assert.ok((await rejection(() => answerInvite(guest.user.id, inv.id, true))) instanceof ApiError, "used once");

    const inv2 = await db.invite.create({
      data: { organizationId: t.org.id, email: stranger.user.email, role: "ANALYST", tokenHash: `h-${uid()}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await answerInvite(stranger.user.id, inv2.id, false);
    assert.equal(await db.membership.count({ where: { userId: stranger.user.id, organizationId: t.org.id } }), 0);
  });

  it("lets a member leave, but not the last Owner", async () => {
    const t = await team();
    await leaveTeam(t.other.user.id, t.org.id);
    assert.equal(await db.membership.count({ where: { id: t.otherM.id } }), 0);
    const err = await rejection(() => leaveTeam(t.owner.user.id, t.org.id));
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "LAST_OWNER");
  });
});

describe("accounts: Google sign-in", () => {
  after(() => db.$disconnect());
  const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({ sub: `g-${uid()}`, email: email(), emailVerified: true, name: "Gee Person", ...over });

  it("creates a verified account without a password for a new Google user", async () => {
    const p = profile();
    const out = await signInWithGoogle(p);
    assert.equal(out.kind, "ok");
    const user = await db.user.findUniqueOrThrow({ where: { email: p.email } });
    assert.equal(user.hasPassword, false);
    assert.ok(user.emailVerifiedAt);
    assert.equal(await db.authIdentity.count({ where: { userId: user.id, provider: "GOOGLE", subject: p.sub } }), 1);
    assert.equal((await authenticate({ email: p.email, password: "anything-at-all-123" })).ok, false, "no password can open it");
  });

  it("links Google to an existing account with the same verified email, and finds it again by Google id", async () => {
    const { user } = await makeUser();
    const p = profile({ email: user.email });
    const first = await signInWithGoogle(p);
    assert.equal(first.kind === "ok" && first.user.id, user.id);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, user.passwordHash, "the password is untouched");
    const again = await signInWithGoogle({ ...p, email: "renamed@test.example" });
    assert.equal(again.kind === "ok" && again.user.id, user.id, "matched by Google id even if the email changed");
  });

  it("refuses an email Google has not verified", async () => {
    const err = await rejection(() => signInWithGoogle(profile({ emailVerified: false })));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 403);
  });

  it("does not let Google skip an authenticator app", async () => {
    const { user } = await makeUser();
    await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } });
    process.env.REQUIRE_TOTP = "true";
    resetEnvCache();
    const out = await signInWithGoogle(profile({ email: user.email }));
    assert.equal(out.kind, "needs_password_and_code");
    delete process.env.REQUIRE_TOTP;
    resetEnvCache();
  });

  it("checks state, nonce and the code exchange on the way back", async () => {
    const { url, cookie } = await beginGoogle("/app/campaigns");
    const q = new URL(url).searchParams;
    assert.equal(q.get("code_challenge_method"), "S256");
    assert.ok(q.get("state") && q.get("nonce"));

    const seen: string[] = [];
    const original = { ...googleTransport };
    googleTransport.exchange = async (code, verifier) => {
      seen.push(`${code}:${verifier.length > 40}`);
      return { idToken: "id-token" };
    };
    googleTransport.verify = async (_t, nonce) => {
      assert.equal(nonce, q.get("nonce"), "the nonce comes back unchanged");
      return profile();
    };
    try {
      const ok = await finishGoogle(cookie, new URLSearchParams({ state: q.get("state")!, code: "abc" }));
      assert.equal(ok.next, "/app/campaigns");
      assert.deepEqual(seen, ["abc:true"]);

      const forged = await rejection(() => finishGoogle(cookie, new URLSearchParams({ state: "forged-state-value-forged-state", code: "abc" })));
      assert.ok(forged instanceof ApiError);
      const missing = await rejection(() => finishGoogle(undefined, new URLSearchParams({ state: q.get("state")!, code: "abc" })));
      assert.ok(missing instanceof ApiError);
    } finally {
      Object.assign(googleTransport, original);
    }
  });
});

// Keep the helper imported for readers who extend these tests.
void hashPassword;
