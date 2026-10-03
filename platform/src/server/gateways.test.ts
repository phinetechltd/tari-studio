import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GATEWAYS } from "./gateways";

describe("gateway settings catalog", () => {
  it("every gateway names at least one field and every field carries an env hint", () => {
    for (const [key, spec] of Object.entries(GATEWAYS)) {
      assert.ok(spec.fields.length >= 1, `${key} has no fields`);
      assert.ok(spec.name, `${key} has no name`);
      for (const f of spec.fields) {
        assert.ok(f.envHint, `${key}.${f.name} has no env hint`);
        assert.equal(typeof f.secret, "boolean", `${key}.${f.name} secret must be boolean`);
      }
    }
  });

  it("secrets are declared for the credentials people type into a form", () => {
    // The values that must never sit in plaintext config.
    assert.equal(GATEWAYS.ai.fields.find((f) => f.name === "apiKey")?.secret, true);
    assert.equal(GATEWAYS.video.fields.find((f) => f.name === "apiKey")?.secret, true);
    assert.equal(GATEWAYS.social.fields.find((f) => f.name === "appSecret")?.secret, true);
    assert.equal(GATEWAYS.social.fields.find((f) => f.name === "webhookVerifyToken")?.secret, true);
    assert.equal(GATEWAYS.mpesa.fields.find((f) => f.name === "passkey")?.secret, true);
    // Non-secret identity fields stay readable.
    assert.equal(GATEWAYS.social.fields.find((f) => f.name === "appId")?.secret, false);
    assert.equal(GATEWAYS.mpesa.fields.find((f) => f.name === "shortcode")?.secret, false);
  });

  it("every gateway covers the four the console offers", () => {
    assert.deepEqual(Object.keys(GATEWAYS).sort(), ["ai", "mpesa", "social", "video"]);
  });
});
