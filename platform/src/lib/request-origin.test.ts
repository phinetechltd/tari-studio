import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestOrigin } from "./request-origin";

const headersOf = (entries: Record<string, string>) => new Headers(entries);

describe("requestOrigin", () => {
  it("rebuilds the public origin from the proxy's forwarded headers", () => {
    const h = headersOf({ "x-forwarded-host": "taristudio.africa", "x-forwarded-proto": "https" });
    assert.equal(requestOrigin(h, "http://localhost:3400"), "https://taristudio.africa");
  });

  it("uses the plain Host header when the proxy did not forward one", () => {
    const h = headersOf({ host: "taristudio.africa", "x-forwarded-proto": "https" });
    assert.equal(requestOrigin(h, "http://localhost:3400"), "https://taristudio.africa");
  });

  it("keeps ports and plain http for direct/local traffic", () => {
    const h = headersOf({ host: "127.0.0.1:3400" });
    assert.equal(requestOrigin(h, "http://unused"), "http://127.0.0.1:3400");
  });

  it("takes the first value from a comma-joined list", () => {
    const h = headersOf({ "x-forwarded-host": "taristudio.africa, proxy.internal", "x-forwarded-proto": "https, http" });
    assert.equal(requestOrigin(h, "http://localhost:3400"), "https://taristudio.africa");
  });

  it("falls back when the host is absent or junk (a forged redirect target)", () => {
    assert.equal(requestOrigin(headersOf({}), "http://localhost:3400"), "http://localhost:3400");
    assert.equal(requestOrigin(headersOf({ host: "evil.com/p@th" }), "http://localhost:3400"), "http://localhost:3400");
    assert.equal(requestOrigin(headersOf({ host: "<script>" }), "http://localhost:3400"), "http://localhost:3400");
  });
});
