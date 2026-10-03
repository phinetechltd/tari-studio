import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_PRICING } from "./pricing";
import { costOf, interpret } from "./studio-intent";

describe("studio intent", () => {
  it("defaults to a 10-second video in the mode's default shape", () => {
    const { command, meta } = interpret("a landlord relaxes on the balcony");
    assert.equal(command, "video");
    assert.equal(meta.seconds, 10);
    assert.equal(meta.aspectRatio, "9:16");
  });

  it("reads commands, lengths and shapes", () => {
    const v = interpret("/video tenants top up, 15 seconds, landscape").meta;
    assert.deepEqual([v.mode, v.seconds, v.aspectRatio], ["video", 15, "16:9"]);
    const i = interpret("/image a poster, square").meta;
    assert.deepEqual([i.mode, i.seconds, i.aspectRatio], ["image", null, "1:1"]);
    assert.equal(interpret("/video clip 3:4").meta.aspectRatio, "3:4");
  });

  it("clamps lengths to what the models accept", () => {
    assert.equal(interpret("/video 2s clip").meta.seconds, 4);
    assert.equal(interpret("/video 90 seconds").meta.seconds, 30);
  });

  it("treats unknown commands as help and /quote as a request for a price", () => {
    assert.equal(interpret("/dance now").command, "help");
    assert.equal(interpret("/quote voice-over").command, "quote");
  });

  it("costs credits the same way the server charges them", () => {
    assert.deepEqual(costOf(DEFAULT_PRICING, { mode: "image", seconds: null }), { credits: 2, cents: 2_800 });
    // 21 s is five started 5-second steps: 110 credits, KES 1,512.50 rounded up to KES 1,513.
    assert.deepEqual(costOf(DEFAULT_PRICING, { mode: "video", seconds: 21 }), { credits: 110, cents: 151_300 });
  });
});
