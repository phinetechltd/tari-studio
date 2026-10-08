import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUILT_IN_MODELS,
  buildInput,
  buildModelInput,
  fitQuote,
  fitSeconds,
  imageSizeProblem,
  INPUT_IMAGE_LIMITS,
  modelCredits,
  MODES,
  normaliseStatus,
  outputUrl,
  secondsLabel,
  sendSize,
  supportsStartImage,
} from "./generation-models";
import { defaultPricingInput, resolvePricing } from "./pricing";

describe("generation models", () => {
  it("builds a Soul 2 image request", () => {
    assert.deepEqual(buildInput("image", { prompt: " A meter on a wall ", aspectRatio: "1:1" }), {
      prompt: "A meter on a wall",
      aspect_ratio: "1:1",
      resolution: "1080p",
      enhance_prompt: true,
      batch_size: 1,
    });
  });

  it("builds a Seedance text-to-video request with duration and aspect", () => {
    const input = buildInput("video", { prompt: "Landlord smiles", seconds: 10, aspectRatio: "9:16" });
    assert.equal(input.duration, 10);
    assert.equal(input.aspect_ratio, "9:16");
    assert.equal(input.resolution, "720p");
  });

  it("requires a public source for animate and extend", () => {
    assert.throws(() => buildInput("animate", { prompt: "move", seconds: 5, aspectRatio: "9:16" }));
    assert.equal(
      buildInput("animate", { prompt: "move", seconds: 5, aspectRatio: "9:16", sourceUrl: "https://cdn/x.png" }).image_url,
      "https://cdn/x.png",
    );
    assert.equal(
      buildInput("extend", { prompt: "continue", seconds: 5, aspectRatio: "9:16", sourceUrl: "https://cdn/x.mp4" }).video_url,
      "https://cdn/x.mp4",
    );
  });

  it("rejects video lengths outside 4 to 30 seconds", () => {
    assert.throws(() => buildInput("video", { prompt: "x", seconds: 3, aspectRatio: "16:9" }));
    assert.throws(() => buildInput("video", { prompt: "x", seconds: 31, aspectRatio: "16:9" }));
  });

  it("reads output URLs from the shapes the API returns", () => {
    assert.equal(outputUrl({ status: "completed", video: { url: "https://v.mp4" } }), "https://v.mp4");
    assert.equal(outputUrl({ status: "completed", images: [{ url: "https://i.png" }] }), "https://i.png");
    assert.equal(outputUrl({ image: "https://i2.png" }), "https://i2.png");
    assert.equal(outputUrl({ status: "queued" }), null);
  });

  it("normalises status words", () => {
    assert.equal(normaliseStatus("succeeded"), "completed");
    assert.equal(normaliseStatus("in_progress"), "in_progress");
    assert.equal(normaliseStatus("cancelled"), "canceled");
    assert.equal(normaliseStatus(undefined), "queued");
  });

  it("builds Kling 3.0 requests as its docs describe", () => {
    assert.deepEqual(buildModelInput("kling", "video", { prompt: "A coastal road", seconds: 10, aspectRatio: "9:16" }), {
      prompt: "A coastal road",
      duration: 10,
      sound: "on",
      aspect_ratio: "9:16",
    });
    assert.deepEqual(buildModelInput("kling", "animate", { prompt: "move", seconds: 5, aspectRatio: "9:16", sourceUrl: "https://cdn/x.png" }), {
      prompt: "move",
      duration: 5,
      sound: "on",
      image_url: "https://cdn/x.png",
    });
    assert.throws(() => buildModelInput("kling", "video", { prompt: "x", seconds: 16, aspectRatio: "9:16" }), /3 to 15/);
    assert.throws(() => buildModelInput("kling", "video", { prompt: "x", seconds: 5, aspectRatio: "4:3" }), /16:9/);
    assert.throws(() => buildModelInput("kling", "extend", { prompt: "x", seconds: 5, aspectRatio: "9:16", sourceUrl: "https://cdn/x.mp4" }), /cannot extend/);
  });

  it("builds Hailuo 2.3 requests: 6 or 10 seconds, no shape", () => {
    assert.deepEqual(buildModelInput("hailuo", "video", { prompt: "Waves", seconds: 6, aspectRatio: "16:9" }), { prompt: "Waves", duration: 6, prompt_optimizer: true });
    assert.throws(() => buildModelInput("hailuo", "video", { prompt: "Waves", seconds: 8, aspectRatio: "16:9" }), /6 or 10 seconds/);
  });

  it("prices a model at its own rate, or the price list's when it has none", () => {
    const p = resolvePricing(defaultPricingInput());
    assert.equal(modelCredits(p, { family: "soul", creditsPerImage: null, creditsPerStep: null }), p.imageCredits);
    assert.equal(modelCredits(p, { family: "soul", creditsPerImage: 5, creditsPerStep: null }), 5);
    assert.equal(modelCredits(p, { family: "seedance", creditsPerImage: null, creditsPerStep: null }, 10), 2 * p.videoCreditsPerStep);
    assert.equal(modelCredits(p, { family: "kling", creditsPerImage: null, creditsPerStep: 30 }, 3), 30, "3 s is one started step");
    assert.equal(modelCredits(p, { family: "hailuo", creditsPerImage: null, creditsPerStep: 20 }, 10), 40);
    assert.throws(() => modelCredits(p, { family: "hailuo", creditsPerImage: null, creditsPerStep: 20 }, 7));
    assert.equal(BUILT_IN_MODELS.every((m) => m.creditsPerImage === null && m.creditsPerStep === null), true, "built-ins charge the price list");
  });

  it("moves a quote onto another model at the nearest length and shape", () => {
    assert.deepEqual(fitQuote("hailuo", "video", 15, "9:16"), { seconds: 10, aspectRatio: "9:16" });
    assert.deepEqual(fitQuote("hailuo", "video", 4, "9:16"), { seconds: 6, aspectRatio: "9:16" });
    assert.deepEqual(fitQuote("kling", "video", 30, "3:4"), { seconds: 15, aspectRatio: "9:16" });
    assert.deepEqual(fitQuote("kling", "video", 10, "4:3"), { seconds: 10, aspectRatio: "16:9" });
    assert.deepEqual(fitQuote("seedance", "video", 12, "4:3"), { seconds: 12, aspectRatio: "4:3" });
    assert.deepEqual(fitQuote("soul", "image", null, "3:4"), { seconds: null, aspectRatio: "3:4" });
    assert.equal(secondsLabel({ choices: [6, 10] }), "6 or 10 s");
    assert.equal(secondsLabel({ min: 3, max: 15 }), "3 to 15 s");
    assert.equal(fitSeconds({ choices: [6, 10] }, 8), 6, "a tie goes to the shorter, cheaper length");
  });

  it("uses one media type per mode", () => {
    assert.equal(MODES.image.media, "IMAGE");
    for (const m of ["video", "animate", "extend"] as const) assert.equal(MODES[m].media, "VIDEO");
  });
});

describe("input image rules", () => {
  it("accepts the limits themselves and refuses just outside them", () => {
    assert.equal(imageSizeProblem(INPUT_IMAGE_LIMITS.minSide, INPUT_IMAGE_LIMITS.minSide), null);
    assert.equal(imageSizeProblem(INPUT_IMAGE_LIMITS.maxSide, 1000), null);
    assert.match(imageSizeProblem(INPUT_IMAGE_LIMITS.minSide - 1, 1000) ?? "", /too small/);
    assert.match(imageSizeProblem(INPUT_IMAGE_LIMITS.maxSide + 1, 1000) ?? "", /too large/);
    assert.match(imageSizeProblem(0, 0) ?? "", /could not be read/);
  });

  it("scales only what is over the send size, keeping the shape", () => {
    assert.deepEqual(sendSize(1200, 800), { width: 1200, height: 800 });
    assert.deepEqual(sendSize(4096, 2048), { width: 2048, height: 1024 });
    assert.deepEqual(sendSize(1000, 4000), { width: 512, height: 2048 });
  });

  it("starts from a picture only on the video families Higgsfield documents for it", () => {
    assert.equal(supportsStartImage("seedance"), true);
    assert.equal(supportsStartImage("kling"), true);
    assert.equal(supportsStartImage("hailuo"), true);
    assert.equal(supportsStartImage("soul"), false);
  });
});
