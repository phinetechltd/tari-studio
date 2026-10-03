import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it, after } from "node:test";

import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import { LimitReachedError } from "@/lib/limits";
import { acceptInvite, createInvite, previewInvite, revokeInvite } from "@/server/invites";

import { DEFAULT_PASSWORD, addMember, makeOrg, makeUser, rejection, uid } from "./_helpers";

const codeOf = (e: unknown) => (e as { code?: string }).code;

describe("invitations", () => {
  after(() => db.$disconnect());

  it("stores only a hash of the token, never the token", async () => {
    const org = await makeOrg();
    const { token, inviteId } = await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "DESIGNER", invitedById: null });
    const row = await db.invite.findUniqueOrThrow({ where: { id: inviteId } });
    assert.equal(row.tokenHash, createHash("sha256").update(token).digest("hex"));
    assert.ok(!JSON.stringify(row).includes(token));
  });

  it("onboards a new person: sets a password, creates the account and the membership", async () => {
    const org = await makeOrg();
    const email = `${uid()}@x.example`;
    const { token } = await createInvite({ organizationId: org.id, email, role: "MARKETER", invitedById: null });

    const preview = await previewInvite(token);
    assert.deepEqual(preview && { email: preview.email, role: preview.role, hasAccount: preview.hasAccount }, {
      email,
      role: "MARKETER",
      hasAccount: false,
    });

    const { userId, organizationId } = await acceptInvite({ token, name: "Wanjiru K", password: "a-long-enough-password" });
    assert.equal(organizationId, org.id);

    const m = await db.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId, organizationId: org.id } } });
    assert.equal(m.role, "MARKETER");
    assert.equal((await authenticate({ email, password: "a-long-enough-password" })).ok, true);
    assert.equal(await previewInvite(token), null, "an accepted link is dead");
  });

  it("cannot be accepted twice", async () => {
    const org = await makeOrg();
    const { token } = await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "ANALYST", invitedById: null });
    await acceptInvite({ token, name: "First", password: "a-long-enough-password" });
    const err = await rejection(() => acceptInvite({ token, name: "Second", password: "a-long-enough-password" }));
    assert.equal(codeOf(err), "INVITE_INVALID");
  });

  it("accepts exactly once when two clicks race, and leaves no orphan account", async () => {
    const org = await makeOrg();
    const email = `${uid()}@x.example`;
    const { token } = await createInvite({ organizationId: org.id, email, role: "DESIGNER", invitedById: null });

    const results = await Promise.allSettled([
      acceptInvite({ token, name: "Racer", password: "a-long-enough-password" }),
      acceptInvite({ token, name: "Racer", password: "a-long-enough-password" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await db.user.count({ where: { email } }), 1);
    assert.equal(await db.membership.count({ where: { organizationId: org.id, user: { email } } }), 1);
  });

  it("rejects an expired, revoked or unknown token", async () => {
    const org = await makeOrg();
    const expired = await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "DESIGNER", invitedById: null });
    await db.invite.update({ where: { id: expired.inviteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(codeOf(await rejection(() => acceptInvite({ token: expired.token, name: "A B", password: DEFAULT_PASSWORD }))), "INVITE_INVALID");

    const revoked = await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "DESIGNER", invitedById: null });
    assert.equal(await revokeInvite(org.id, revoked.inviteId, "someone"), true);
    assert.equal(codeOf(await rejection(() => acceptInvite({ token: revoked.token, name: "A B", password: DEFAULT_PASSWORD }))), "INVITE_INVALID");

    assert.equal(codeOf(await rejection(() => acceptInvite({ token: "not-a-real-token", name: "A B", password: DEFAULT_PASSWORD }))), "INVITE_INVALID");
    assert.equal(await previewInvite("not-a-real-token"), null);
  });

  it("will not accept an invitation into a suspended organisation", async () => {
    const org = await makeOrg();
    const { token } = await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "DESIGNER", invitedById: null });
    await db.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    assert.equal(await previewInvite(token), null);
    assert.equal(codeOf(await rejection(() => acceptInvite({ token, name: "A B", password: DEFAULT_PASSWORD }))), "INVITE_INVALID");
  });

  it("makes someone who already has an account prove it, and a wrong password does not burn the link", async () => {
    const org = await makeOrg();
    const { user, password } = await makeUser();
    const { token } = await createInvite({ organizationId: org.id, email: user.email, role: "DESIGNER", invitedById: null });
    assert.equal((await previewInvite(token))?.hasAccount, true);

    const err = await rejection(() => acceptInvite({ token, password: "not-my-password" }));
    assert.equal(codeOf(err), "INVALID_CREDENTIALS");
    assert.equal(await db.membership.count({ where: { userId: user.id, organizationId: org.id } }), 0, "nothing attached");

    const ok = await acceptInvite({ token, password });
    assert.equal(ok.userId, user.id);
    assert.equal(await db.user.count({ where: { email: user.email } }), 1, "no duplicate account");
  });

  it("rejects a weak password or missing name for a new account, without burning the link", async () => {
    const org = await makeOrg();
    const { token } = await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "DESIGNER", invitedById: null });
    assert.equal(codeOf(await rejection(() => acceptInvite({ token, name: "Ok Name", password: "short" }))), "WEAK_PASSWORD");
    assert.equal(codeOf(await rejection(() => acceptInvite({ token, name: "", password: "a-long-enough-password" }))), "VALIDATION_FAILED");
    assert.ok(await previewInvite(token), "the link is still usable");
  });

  it("re-inviting supersedes the earlier link rather than leaving two live", async () => {
    const org = await makeOrg();
    const email = `${uid()}@x.example`;
    const first = await createInvite({ organizationId: org.id, email, role: "DESIGNER", invitedById: null });
    const second = await createInvite({ organizationId: org.id, email, role: "MARKETER", invitedById: null });
    assert.equal(await previewInvite(first.token), null);
    assert.equal((await previewInvite(second.token))?.role, "MARKETER");
  });

  it("refuses to invite someone already on the team, and validates address and role", async () => {
    const org = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER");
    assert.equal(codeOf(await rejection(() => createInvite({ organizationId: org.id, email: user.email, role: "DESIGNER", invitedById: null }))), "CONFLICT");
    assert.equal(codeOf(await rejection(() => createInvite({ organizationId: org.id, email: "not-an-email", role: "DESIGNER", invitedById: null }))), "VALIDATION_FAILED");
    assert.equal(codeOf(await rejection(() => createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "SUPER_ADMIN", invitedById: null }))), "VALIDATION_FAILED");
  });

  it("counts pending invitations against the seat limit", async () => {
    const org = await makeOrg({ limitsOverride: { seats: 2 } });
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER"); // 1 seat used

    await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "DESIGNER", invitedById: null }); // 2nd, pending
    const err = await rejection(() => createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "DESIGNER", invitedById: null }));
    assert.ok(err instanceof LimitReachedError, "the third seat must be refused");
  });

  it("re-sending to the same address does not use a second seat", async () => {
    const org = await makeOrg({ limitsOverride: { seats: 2 } });
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER");
    const email = `${uid()}@x.example`;
    await createInvite({ organizationId: org.id, email, role: "DESIGNER", invitedById: null });
    await createInvite({ organizationId: org.id, email, role: "DESIGNER", invitedById: null });
    await createInvite({ organizationId: org.id, email, role: "DESIGNER", invitedById: null });
  });

  it("lets a new tenant's first Owner be invited before any seat exists", async () => {
    const org = await makeOrg({ limitsOverride: { seats: 0 } });
    await createInvite({ organizationId: org.id, email: `${uid()}@x.example`, role: "OWNER", invitedById: null, skipSeatCheck: true });
  });
});
