import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  SecretsUnavailableError,
  decryptFor,
  encryptFor,
  generateMasterKey,
  maskSecret,
  openJson,
  secretsAvailable,
  sealJson,
} from "./secrets";

describe("secrets vault", () => {
  const saved = process.env.CREDENTIALS_KEY;
  beforeEach(() => {
    process.env.CREDENTIALS_KEY = generateMasterKey();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CREDENTIALS_KEY;
    else process.env.CREDENTIALS_KEY = saved;
  });

  it("round-trips a secret for the scope it was sealed under", () => {
    const sealed = encryptFor("org_a", "EAAG-page-token-1234");
    assert.equal(decryptFor("org_a", sealed), "EAAG-page-token-1234");
  });

  it("a blob moved to another scope fails to decrypt (the tenancy backstop)", () => {
    const sealed = encryptFor("org_a", "tenant A's token");
    assert.equal(decryptFor("org_b", sealed), null);
  });

  it("a tampered cipher text, tag or IV fails to decrypt", () => {
    const sealed = encryptFor("org_a", "secret");
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, "base64");
      buf[0] = buf[0]! ^ 0xff;
      return buf.toString("base64");
    };
    assert.equal(decryptFor("org_a", { ...sealed, cipherText: flip(sealed.cipherText) }), null);
    assert.equal(decryptFor("org_a", { ...sealed, authTag: flip(sealed.authTag) }), null);
    assert.equal(decryptFor("org_a", { ...sealed, iv: flip(sealed.iv) }), null);
  });

  it("never reuses an IV, so the same plaintext seals differently each time", () => {
    const a = encryptFor("org_a", "same");
    const b = encryptFor("org_a", "same");
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.cipherText, b.cipherText);
  });

  it("a rotated master key makes old secrets unreadable rather than throwing", () => {
    const sealed = encryptFor("org_a", "secret");
    process.env.CREDENTIALS_KEY = generateMasterKey();
    assert.equal(decryptFor("org_a", sealed), null);
  });

  it("refuses to store anything without a valid key, and reports it up front", () => {
    delete process.env.CREDENTIALS_KEY;
    assert.equal(secretsAvailable(), false);
    assert.throws(() => encryptFor("org_a", "x"), SecretsUnavailableError);

    process.env.CREDENTIALS_KEY = Buffer.from("too-short").toString("base64");
    assert.equal(secretsAvailable(), false, "a short key must not be accepted");
  });

  it("round-trips JSON bundles and returns null for a non-JSON payload", () => {
    const sealed = sealJson("org_a", { pageId: "1", token: "t" });
    assert.deepEqual(openJson("org_a", sealed), { pageId: "1", token: "t" });
    assert.equal(openJson("org_a", encryptFor("org_a", "not json")), null);
  });

  it("masks all but the last four characters", () => {
    assert.equal(maskSecret("EAAGabcd1234"), "••••1234");
    assert.equal(maskSecret("abc"), "••••");
  });
});
