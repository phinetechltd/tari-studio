import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  absoluteUrl,
  breadcrumbLd,
  faqLd,
  jsonLdText,
  NOINDEX,
  ogImagePath,
  organizationLd,
  pageMetadata,
  softwareApplicationLd,
  verificationMetadata,
  videoLd,
} from "./seo";

const BASE = "https://tari.studio";

describe("SEO helpers", () => {
  it("gives every public page a canonical URL, a share card and indexable robots", () => {
    const m = pageMetadata({ title: "Pricing", description: "Plans in KES", path: "/pricing", siteName: "Studio" });
    assert.equal(m.alternates?.canonical, "/pricing");
    assert.equal(m.title, "Pricing");
    const og = m.openGraph as { url: string; title: string; images: Array<{ url: string; width: number }> };
    assert.equal(og.url, "/pricing");
    assert.equal(og.title, "Pricing · Studio");
    assert.equal(og.images[0]!.width, 1200);
    assert.match(og.images[0]!.url, /^\/og\?title=Pricing&subtitle=Plans\+in\+KES$/);
    assert.equal((m.twitter as { card: string }).card, "summary_large_image");
    assert.deepEqual((m.robots as { index: boolean }).index, true);
  });

  it("keeps private pages out of search results", () => {
    const m = pageMetadata({ title: "x", description: "y", path: "/x", siteName: "S", noindex: true });
    assert.equal((m.robots as { index: boolean; follow: boolean }).index, false);
    assert.equal((NOINDEX.robots as { index: boolean }).index, false);
  });

  it("adds Search Console and Bing codes only when set", () => {
    assert.equal(verificationMetadata(undefined, ""), undefined);
    assert.deepEqual(verificationMetadata(" abc ", null), { google: "abc" });
    assert.deepEqual(verificationMetadata("g", "b"), { google: "g", other: { "msvalidate.01": "b" } });
  });

  it("builds absolute URLs and share-card links safely", () => {
    assert.equal(absoluteUrl(`${BASE}/`, "/pricing"), `${BASE}/pricing`);
    assert.equal(absoluteUrl(BASE, "icon.png"), `${BASE}/icon.png`);
    assert.equal(absoluteUrl(BASE, "https://cdn.example/x.jpg"), "https://cdn.example/x.jpg");
    assert.ok(ogImagePath("x".repeat(500)).length < 120, "titles are trimmed");
    assert.match(ogImagePath("Ads & more"), /title=Ads\+%26\+more/);
  });

  it("describes plans as offers in Kenyan shillings", () => {
    const ld = softwareApplicationLd({ name: "S", url: BASE, description: "d", image: `${BASE}/i.jpg`, offers: [{ name: "Free", monthlyCents: 0 }, { name: "Pro", monthlyCents: 495_000 }] }) as {
      "@type": string;
      offers: Array<{ price: string; priceCurrency: string; priceSpecification?: { billingDuration: string } }>;
    };
    assert.equal(ld["@type"], "SoftwareApplication");
    assert.deepEqual(ld.offers.map((o) => [o.price, o.priceCurrency]), [["0.00", "KES"], ["4950.00", "KES"]]);
    assert.equal(ld.offers[0]!.priceSpecification, undefined, "a free plan has no billing period");
    assert.equal(ld.offers[1]!.priceSpecification?.billingDuration, "P1M");
  });

  it("produces valid FAQ, breadcrumb, organisation and video data", () => {
    const faq = faqLd([{ q: "How do I pay?", a: "By M-Pesa." }]) as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    assert.equal(faq.mainEntity[0]!.acceptedAnswer.text, "By M-Pesa.");
    const crumbs = breadcrumbLd(BASE, [{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]) as { itemListElement: Array<{ position: number; item: string }> };
    assert.deepEqual(crumbs.itemListElement.map((i) => [i.position, i.item]), [[1, `${BASE}/`], [2, `${BASE}/pricing`]]);
    const org = organizationLd({ name: "S", url: BASE, logo: `${BASE}/icon.png`, sameAs: [] }) as Record<string, unknown>;
    assert.equal(org.sameAs, undefined, "no empty sameAs");
    assert.equal(org["@id"], `${BASE}/#organization`);
    assert.equal((videoLd({ name: "v", description: "d", thumbnailUrl: "t", contentUrl: "c", uploadDate: "2026-10-02", durationSeconds: 24.4 }) as { duration: string }).duration, "PT24S");
  });

  it("cannot be broken out of its script tag", () => {
    const text = jsonLdText({ name: "</script><script>alert(1)</script>" });
    assert.equal(text.includes("<"), false);
    assert.deepEqual(JSON.parse(text), { name: "</script><script>alert(1)</script>" }, "still the same data");
  });
});
