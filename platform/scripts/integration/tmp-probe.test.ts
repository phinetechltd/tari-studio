import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { db } from "@/lib/db";
import { resendVerification } from "@/server/accounts";

import { makeUser, uid } from "./_helpers";

describe("probe: resendVerification vs db handle", () => {
  after(async () => {
    await db.$disconnect();
  });

  it("a second makeUser still works after resendVerification", async () => {
    const a = await makeUser();
    await resendVerification(a.user.email);
    console.log("after resend: DATABASE_URL set?", Boolean(process.env.DATABASE_URL), "TEST_DATABASE_URL set?", Boolean(process.env.TEST_DATABASE_URL));
    const b = await makeUser();
    assert.ok(b.user.id, `uid ${uid()}`);
  });
});
