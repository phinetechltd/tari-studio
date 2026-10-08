import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { db } from "@/lib/db";
import type { Principal } from "@/lib/rbac";
import { analyzeImage, setChatTransportForTests, type ChatImage } from "@/server/ai";
import { removeStored, saveUpload } from "@/server/storage";

import { enableModules, makeOrg, makeUser } from "./_helpers";

/**
 * The image → form service (analyzeImage). The provider is replaced with a
 * scripted answer, so the tests run without a model: a readable JSON answer
 * becomes suggestions, anything else fails soft (null) — the form keeps
 * working, which is the contract every upload-and-fill flow relies on.
 */

const png = async (): Promise<Uint8Array> => {
  const { default: sharp } = await import("sharp");
  return new Uint8Array(await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer());
};

describe("image to form fields", () => {
  let principal: Principal;
  let image: ChatImage;
  let key: string;
  let organizationId: string;

  before(async () => {
    const org = await makeOrg();
    organizationId = org.id;
    const { user } = await makeUser();
    await enableModules(org.id, ["AI_CONTENT"]);
    principal = { userId: user.id, organizationId: org.id, role: "OWNER", extraPermissions: [], enabledModules: new Set(["AI_CONTENT"]), mfa: false };
    const saved = await saveUpload(new Blob([(await png()).buffer as ArrayBuffer], { type: "image/png" }) as File, `autofill/${org.id}/${crypto.randomUUID()}`);
    key = saved.key;
    image = { mimeType: saved.mimeType as ChatImage["mimeType"], dataBase64: Buffer.from(await png()).toString("base64") };
  });
  after(async () => {
    await removeStored(key);
    await db.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("turns a JSON answer into suggestions, with hashtags normalised", async () => {
    setChatTransportForTests(() => Promise.resolve({ text: 'Here you go: {"title":"Smoked sausages","description":"Juicy beef sausages","keywords":"not an array","hashtags":["#offer","bbq"]}' }));
    const out = await analyzeImage({ image, organizationId, formKind: "product" });
    setChatTransportForTests(null);
    assert.ok(out, "a readable answer must produce suggestions");
    assert.equal(out!.title, "Smoked sausages");
    assert.equal(out!.description, "Juicy beef sausages");
    assert.deepEqual(out!.keywords, undefined, "a non-array is dropped, not guessed");
    assert.deepEqual(out!.hashtags, ["#offer", "#bbq"]);
  });

  it("fails soft on an unreadable answer, so the form keeps working", async () => {
    setChatTransportForTests(() => Promise.resolve({ text: "I could not read that image, sorry." }));
    const out = await analyzeImage({ image, organizationId, formKind: "post" });
    setChatTransportForTests(null);
    assert.equal(out, null);
  });

  it("refuses a non-image without calling a provider", async () => {
    setChatTransportForTests(() => {
      throw new Error("the provider must not be reached");
    });
    const out = await analyzeImage({ image: { mimeType: "application/pdf" as ChatImage["mimeType"], dataBase64: "AAAA" }, organizationId, formKind: "post" });
    setChatTransportForTests(null);
    assert.equal(out, null);
  });
});
