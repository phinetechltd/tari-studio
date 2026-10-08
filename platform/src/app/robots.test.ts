import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { resetEnvCache } from "@/lib/env";

import robots from "./robots";
import sitemap from "./sitemap";

const BASE_ENV = { DATABASE_URL: "postgresql://x@localhost/x", AUTH_SECRET: "a-test-secret-that-is-long-enough-0123" };

function withBase(url: string) {
  Object.assign(process.env, BASE_ENV, { APP_BASE_URL: url });
  resetEnvCache();
}

describe("robots.txt and sitemap.xml", () => {
  const saved = process.env.APP_BASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = saved;
    resetEnvCache();
  });

  it("lets crawlers into the public pages of the live site, and keeps them out of private areas", () => {
    withBase("https://tari.studio/");
    const r = robots();
    const rule = (Array.isArray(r.rules) ? r.rules[0] : r.rules)!;
    assert.ok((rule.allow as string[]).includes("/pricing"));
    for (const p of ["/api/", "/app/", "/platform/", "/order/", "/media/", "/l/", "/billing"]) assert.ok((rule.disallow as string[]).includes(p), p);
    assert.equal(r.sitemap, "https://tari.studio/sitemap.xml");
  });

  it("asks crawlers to stay out of anything that is not the live https site", () => {
    for (const url of ["http://localhost:3400", "https://staging.local", "http://tari.studio"]) {
      withBase(url);
      const rule = (Array.isArray(robots().rules) ? (robots().rules as Array<{ disallow?: string | string[] }>)[0] : robots().rules) as { disallow?: string | string[] };
      assert.equal(rule.disallow, "/", url);
    }
  });

  it("lists only public pages, with absolute live URLs", async () => {
    withBase("https://tari.studio");
    // The sitemap now reads published posts from the database; a unit test has
    // none reachable, so only the static pages come back.
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    assert.ok(urls.includes("https://tari.studio") && urls.includes("https://tari.studio/pricing"));
    assert.ok(urls.includes("https://tari.studio/blog"));
    assert.equal(urls.some((u) => /\/(app|platform|api|order|pay)\b/.test(u)), false);
    assert.ok(entries.every((e) => e.lastModified instanceof Date));
  });
});
