import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPinterestImageUrl, largerPinImage, parsePinUrl, pinPromptHint } from "./pinterest";

describe("Pinterest helpers", () => {
  it("reads pasted pin links in the forms people share", () => {
    assert.deepEqual(parsePinUrl("https://www.pinterest.com/pin/123456789012/"), { kind: "pin", id: "123456789012", url: "https://www.pinterest.com/pin/123456789012/" });
    assert.equal((parsePinUrl("https://pinterest.co.uk/pin/987654321/?utm=x") as { id: string }).id, "987654321");
    assert.equal((parsePinUrl("https://za.pinterest.com/pin/coffee-ideas--5551234567/") as { id: string }).id, "5551234567");
    assert.equal(parsePinUrl("https://pin.it/3xYz9AbC")?.kind, "short");
  });

  it("refuses anything that is not a single pin on Pinterest", () => {
    for (const bad of [
      "https://www.pinterest.com/someone/boards/",
      "https://www.pinterest.com/someone/",
      "https://evil.example/pin/123456789/",
      "https://pinterest.com.evil.example/pin/123456789/",
      "javascript:alert(1)",
      "not a url",
      "https://pin.it/",
    ]) {
      assert.equal(parsePinUrl(bad), null, bad);
    }
  });

  it("downloads only from Pinterest's image CDN, at a usable size", () => {
    assert.equal(isPinterestImageUrl("https://i.pinimg.com/236x/ab/cd/ef/abcdef.jpg"), true);
    assert.equal(isPinterestImageUrl("http://i.pinimg.com/236x/a.jpg"), false, "https only");
    assert.equal(isPinterestImageUrl("https://i.pinimg.com.evil.example/a.jpg"), false);
    assert.equal(isPinterestImageUrl("https://169.254.169.254/latest/meta-data"), false);
    assert.equal(largerPinImage("https://i.pinimg.com/236x/ab/cd/ef/abcdef.jpg"), "https://i.pinimg.com/736x/ab/cd/ef/abcdef.jpg");
    assert.equal(largerPinImage("https://example.com/236x/a.jpg"), "https://example.com/236x/a.jpg", "other hosts untouched");
  });

  it("turns pins into words for the prompt, without repeats", () => {
    assert.equal(pinPromptHint([]), null);
    assert.equal(pinPromptHint([{ title: "Golden hour burger", description: "Golden hour burger" }]), "In the style of these references: Golden hour burger");
    assert.ok((pinPromptHint([{ title: "x".repeat(800), description: null }]) ?? "").length <= 600);
  });
});
