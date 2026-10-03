import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalPhone, normaliseEmail, slugify } from "./identity";

describe("canonicalPhone", () => {
  it("collapses every way of writing one Kenyan number to a single form", () => {
    const forms = [
      "0712 345 678",
      "0712345678",
      "+254 712 345 678",
      "+254712345678",
      "254712345678",
      "254 712-345-678",
      "712345678",
      "00254712345678",
      "(0712) 345 678",
    ];
    for (const f of forms) assert.equal(canonicalPhone(f), "254712345678", f);
  });

  it("handles the 01xx Kenyan mobile range", () => {
    assert.equal(canonicalPhone("0112345678"), "254112345678");
    assert.equal(canonicalPhone("112345678"), "254112345678");
  });

  it("keeps a foreign number in international digits", () => {
    assert.equal(canonicalPhone("+1 415 555 2671"), "14155552671");
    assert.equal(canonicalPhone("+44 20 7946 0958"), "442079460958");
  });

  it("returns null instead of guessing", () => {
    for (const bad of ["", "   ", "abc", "12345", "0712", "+254 71234", "254 7123456789", "1234567890123456"]) {
      assert.equal(canonicalPhone(bad), null, JSON.stringify(bad));
    }
  });
});

describe("normaliseEmail", () => {
  it("trims and lower-cases", () => {
    assert.equal(normaliseEmail("  Jane.Doe@Example.COM "), "jane.doe@example.com");
  });
  it("rejects things that are not addresses", () => {
    for (const bad of ["", "no-at-sign", "a@b", "a b@c.com", "@x.com", `${"a".repeat(250)}@x.com`]) {
      assert.equal(normaliseEmail(bad), null, JSON.stringify(bad));
    }
  });
});

describe("slugify", () => {
  it("makes url-safe slugs and strips accents", () => {
    assert.equal(slugify("Acme Digital Ltd."), "acme-digital-ltd");
    assert.equal(slugify("  Café  Nairobi! "), "cafe-nairobi");
    assert.equal(slugify("---"), "");
  });
  it("caps the length", () => {
    assert.ok(slugify("x".repeat(200)).length <= 48);
  });
});
