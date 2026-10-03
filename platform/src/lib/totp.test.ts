import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { base32Decode, base32Encode, generateSecret, otpauthUri, totpAt, verifyTotp } from "./totp";

// RFC 6238 Appendix B: SHA-1, secret "12345678901234567890", 8 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC_VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [t, expected] of RFC_VECTORS) {
      assert.equal(totpAt(RFC_SECRET, t * 1000, 8), expected, `T=${t}`);
    }
  });

  it("base32 round-trips arbitrary bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 17, 34]);
    assert.deepEqual(base32Decode(base32Encode(buf)), buf);
    assert.throws(() => base32Decode("not*base32"));
  });

  it("generates a 32-character secret from 20 random bytes", () => {
    const s = generateSecret();
    assert.match(s, /^[A-Z2-7]{32}$/);
    assert.notEqual(s, generateSecret());
  });

  it("accepts the current code and one step of drift either way, but not two", () => {
    const now = 1_700_000_000_000;
    const at = (stepOffset: number) => totpAt(RFC_SECRET, now + stepOffset * 30_000);

    assert.equal(verifyTotp(RFC_SECRET, at(0), now).ok, true);
    assert.equal(verifyTotp(RFC_SECRET, at(-1), now).ok, true);
    assert.equal(verifyTotp(RFC_SECRET, at(1), now).ok, true);
    assert.equal(verifyTotp(RFC_SECRET, at(-2), now).ok, false);
    assert.equal(verifyTotp(RFC_SECRET, at(2), now).ok, false);
  });

  it("reports the matched counter so a replay can be refused", () => {
    const now = 1_700_000_000_000;
    const result = verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now), now);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.counter, Math.floor(now / 30_000));
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5"]) {
      assert.equal(verifyTotp(RFC_SECRET, bad).ok, false, JSON.stringify(bad));
    }
  });

  it("tolerates spaces in a pasted code", () => {
    const now = 1_700_000_000_000;
    const code = totpAt(RFC_SECRET, now);
    assert.equal(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now).ok, true);
  });

  it("builds an otpauth URI an authenticator app understands", () => {
    const uri = otpauthUri({ secret: "ABC234", account: "a@b.co", issuer: "Example" });
    assert.match(uri, /^otpauth:\/\/totp\/Example%3Aa%40b\.co\?/);
    assert.match(uri, /secret=ABC234/);
    assert.match(uri, /issuer=Example/);
    assert.match(uri, /digits=6/);
    assert.match(uri, /period=30/);
  });
});
