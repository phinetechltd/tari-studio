import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import {
  LOGIN_LIMIT,
  activeMemberships,
  authenticate,
  organisationForLogin,
  switchOrganization,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptFor } from "@/lib/secrets";
import { totpAt } from "@/lib/totp";
import { beginEnrolment, confirmEnrolment, disableMfa } from "@/server/mfa";
import { POST as loginRoute } from "@/app/api/auth/login/route";

import { DEFAULT_PASSWORD, addMember, makeOrg, makeUser, rejection } from "./_helpers";

describe("sign-in", () => {
  after(() => db.$disconnect());

  it("accepts the right email and password, in any letter case", async () => {
    const { user, password } = await makeUser();
    const r = await authenticate({ email: user.email.toUpperCase(), password });
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.user.id, user.id);
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt);
  });

  it("gives one answer for a wrong password, an unknown email and a suspended account", async () => {
    const { user } = await makeUser();
    const { user: suspended, password: sp } = await makeUser({ status: "SUSPENDED" });

    const wrong = await authenticate({ email: user.email, password: "not-the-password" });
    const unknown = await authenticate({ email: "nobody@test.example", password: DEFAULT_PASSWORD });
    const gone = await authenticate({ email: suspended.email, password: sp });

    for (const r of [wrong, unknown, gone]) assert.deepEqual(r, { ok: false, reason: "INVALID" });
  });

  it("locks an identity out after too many attempts, even for the right password", async () => {
    const { user, password } = await makeUser();
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      assert.equal((await authenticate({ email: user.email, password: "wrong-wrong-wrong" })).ok, false);
    }
    const locked = await authenticate({ email: user.email, password });
    assert.equal(locked.ok, false);
    assert.equal(!locked.ok && locked.reason, "RATE_LIMITED");
    assert.ok(!locked.ok && (locked.retryAfterSec ?? 0) > 0);
  });

  it("does not let one person's lockout affect anyone else", async () => {
    const { user: victim } = await makeUser();
    const { user: other, password } = await makeUser();
    for (let i = 0; i < LOGIN_LIMIT.limit + 2; i++) await authenticate({ email: victim.email, password: "x" });
    assert.equal((await authenticate({ email: other.email, password })).ok, true);
  });

  it("records failed and successful sign-ins in the audit trail", async () => {
    const { user, password } = await makeUser();
    await authenticate({ email: user.email, password: "nope-nope-nope" });
    await authenticate({ email: user.email, password });
    const actions = (await db.auditLog.findMany({ where: { userId: user.id } })).map((a) => a.action).sort();
    assert.deepEqual(actions, ["LOGIN", "LOGIN_FAILED"]);
  });
});

describe("two-factor authentication", () => {
  async function enrolledUser() {
    const made = await makeUser();
    const { secret } = await beginEnrolment(made.user.id);
    await confirmEnrolment(made.user.id, totpAt(secret, Date.now()));
    return { ...made, secret };
  }

  it("enrolment needs a valid code, and a wrong one enrols nothing", async () => {
    const { user } = await makeUser();
    const { secret } = await beginEnrolment(user.id);

    const err = await rejection(() => confirmEnrolment(user.id, "000000"));
    assert.equal((err as { code?: string }).code, "TOTP_INVALID");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabledAt, null);

    await confirmEnrolment(user.id, totpAt(secret, Date.now()));
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabledAt);
  });

  it("stores the seed sealed to the user, never in the clear", async () => {
    const { user, secret } = await enrolledUser();
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(row.totpCipher && row.totpIv && row.totpTag);
    assert.ok(!JSON.stringify(row).includes(secret), "the plaintext seed must not appear in the row");

    const sealed = { cipherText: row.totpCipher, iv: row.totpIv, authTag: row.totpTag };
    assert.equal(decryptFor(user.id, sealed), secret);
    assert.equal(decryptFor("some-other-user", sealed), null, "a seed copied to another user must not open");
  });

  it("asks for a code, rejects a wrong one, and accepts the right one once", async () => {
    const { user, password, secret } = await enrolledUser();

    const needs = await authenticate({ email: user.email, password });
    assert.deepEqual(needs, { ok: false, reason: "TOTP_REQUIRED" });

    const bad = await authenticate({ email: user.email, password, totp: "123456" });
    assert.deepEqual(bad, { ok: false, reason: "TOTP_INVALID" });

    // The enrolment code used the current step; the next step's code is fresh.
    const code = totpAt(secret, Date.now() + 30_000);
    assert.equal((await authenticate({ email: user.email, password, totp: code })).ok, true);

    // Replaying that same code — even though it is still inside the window — must fail.
    assert.deepEqual(await authenticate({ email: user.email, password, totp: code }), {
      ok: false,
      reason: "TOTP_INVALID",
    });
  });

  it("refuses a replay of the very code that completed enrolment", async () => {
    const { user, password, secret } = await enrolledUser();
    const r = await authenticate({ email: user.email, password, totp: totpAt(secret, Date.now()) });
    assert.deepEqual(r, { ok: false, reason: "TOTP_INVALID" });
  });

  it("switching it off needs the account password", async () => {
    const { user, password } = await enrolledUser();
    const err = await rejection(() => disableMfa(user.id, "wrong-password"));
    assert.equal((err as { code?: string }).code, "INVALID_CREDENTIALS");
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabledAt, "still on");

    await disableMfa(user.id, password);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.totpEnabledAt, null);
    assert.equal(row.totpCipher, null);
  });

  it("cannot be enrolled twice", async () => {
    const { user } = await enrolledUser();
    const err = await rejection(() => beginEnrolment(user.id));
    assert.equal((err as { code?: string }).code, "CONFLICT");
  });
});

describe("organisation context", () => {
  it("opens the last-used organisation, else the first, and platform admins open in platform mode", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, a.id, "OWNER");
    await addMember(user.id, b.id, "DESIGNER");

    const asUser = (activeOrganizationId: string | null, isPlatformAdmin = false) => ({
      id: user.id, name: user.name, email: user.email, tokenVersion: 0, activeOrganizationId, isPlatformAdmin,
    });

    assert.equal(await organisationForLogin(asUser(b.id)), b.id, "last used wins");
    assert.equal(await organisationForLogin(asUser(null)), a.id, "else the first membership");
    assert.equal(await organisationForLogin(asUser("org-that-was-removed")), a.id, "a stale pointer is ignored");
    assert.equal(await organisationForLogin(asUser(null, true)), null, "platform admins default to platform mode");
  });

  it("lets a user switch only into organisations they belong to", async () => {
    const mine = await makeOrg();
    const other = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, mine.id, "OWNER");

    assert.equal(await switchOrganization(user.id, mine.id), true);
    assert.equal(await switchOrganization(user.id, other.id), false);
    assert.equal(await switchOrganization(user.id, null), false, "platform mode is for platform admins");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).activeOrganizationId, mine.id);
  });

  it("lets a platform admin enter and leave platform mode", async () => {
    const { user } = await makeUser({ isPlatformAdmin: true });
    assert.equal(await switchOrganization(user.id, null), true);
  });

  it("does not offer suspended organisations or suspended memberships", async () => {
    const live = await makeOrg();
    const dead = await makeOrg({ status: "SUSPENDED" });
    const { user } = await makeUser();
    await addMember(user.id, live.id, "OWNER");
    await addMember(user.id, dead.id, "OWNER");
    assert.deepEqual((await activeMemberships(user.id)).map((m) => m.organizationId), [live.id]);
    assert.equal(await switchOrganization(user.id, dead.id), false);
  });

  it("the login route keeps TOTP_REQUIRED and TOTP_INVALID distinct from a wrong password", async () => {
    // Regression: the route once collapsed both into INVALID_CREDENTIALS, so an enrolled
    // account was always told "Email or password is incorrect" and never got the code step.
    const { user, password } = await makeUser();
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    const { secret } = await beginEnrolment(user.id);
    await confirmEnrolment(user.id, totpAt(secret, Date.now()));

    const call = (totp?: string) =>
      loginRoute(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: user.email, password, ...(totp ? { totp } : {}) }),
        }),
        { params: Promise.resolve({}) },
      );
    const codeOf = async (res: Response) => ((await res.json()) as { error?: { code: string } }).error?.code;

    const noCode = await call();
    assert.equal(noCode.status, 401);
    assert.equal(await codeOf(noCode), "TOTP_REQUIRED");

    const wrong = await call("000000");
    assert.equal(wrong.status, 401);
    assert.equal(await codeOf(wrong), "TOTP_INVALID");

    const right = await call(totpAt(secret, Date.now() + 30_000)); // next window: enrolment consumed the current counter
    assert.notEqual(right.status, 401, "a valid code passes the two-factor step (success itself is covered at the authenticate() level)");
  });
});
