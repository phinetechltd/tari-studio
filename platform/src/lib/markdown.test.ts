import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseInline, parseMarkdown, plainText, readingMinutes, safeHref } from "./markdown";

describe("markdown parser", () => {
  it("parses headings, paragraphs and emphasis", () => {
    const blocks = parseMarkdown("# Hello **world**\n\nA paragraph with *italic* text.");
    assert.deepEqual(blocks, [
      { t: "heading", level: 1, children: [{ t: "text", text: "Hello " }, { t: "bold", children: [{ t: "text", text: "world" }] }] },
      { t: "paragraph", children: [{ t: "text", text: "A paragraph with " }, { t: "italic", children: [{ t: "text", text: "italic" }] }, { t: "text", text: " text." }] },
    ]);
  });

  it("parses unordered and ordered lists", () => {
    const blocks = parseMarkdown("- one\n- two\n\n1. first\n2. second");
    assert.deepEqual(blocks, [
      { t: "list", ordered: false, items: [[{ t: "text", text: "one" }], [{ t: "text", text: "two" }]] },
      { t: "list", ordered: true, items: [[{ t: "text", text: "first" }], [{ t: "text", text: "second" }]] },
    ]);
  });

  it("keeps fenced code literal, even markdown-looking text inside", () => {
    const blocks = parseMarkdown("```\n# not a heading\n**not bold**\n```");
    assert.deepEqual(blocks, [{ t: "code", text: "# not a heading\n**not bold**" }]);
  });

  it("allows safe link URLs and renders unsafe ones as literal text", () => {
    assert.equal(safeHref("https://example.com/x"), "https://example.com/x");
    assert.equal(safeHref("/blog/hello"), "/blog/hello");
    assert.equal(safeHref("mailto:a@b.co"), "mailto:a@b.co");
    assert.equal(safeHref("javascript:alert(1)"), null);
    assert.equal(safeHref("data:text/html,<script>"), null);

    const safe = parseInline("[site](/blog) and [web](https://ex.co)");
    assert.deepEqual(safe, [
      { t: "link", text: "site", href: "/blog" },
      { t: "text", text: " and " },
      { t: "link", text: "web", href: "https://ex.co" },
    ]);

    const unsafe = parseInline("[click](javascript:alert(1))");
    // The parser must never emit a node with that URL.
    for (const node of unsafe) {
      if (node.t === "link" || node.t === "image") assert.fail("unsafe URL became a node");
    }
  });

  it("parses images but not with unsafe sources", () => {
    const ok = parseInline("![alt text](https://ex.co/a.png)");
    assert.deepEqual(ok, [{ t: "image", src: "https://ex.co/a.png", alt: "alt text" }]);
    const bad = parseInline("![x](javascript:alert(1))");
    for (const node of bad) {
      if (node.t === "image") assert.fail("unsafe image became a node");
    }
  });

  it("parses quotes and rules, joins lazy paragraph lines", () => {
    const blocks = parseMarkdown("> quoted\n> words\n\n---\n\nlazy\nlines");
    assert.deepEqual(blocks, [
      { t: "quote", children: [{ t: "text", text: "quoted words" }] },
      { t: "rule" },
      { t: "paragraph", children: [{ t: "text", text: "lazy lines" }] },
    ]);
  });

  it("computes plain text and a minimum one-minute reading time", () => {
    const blocks = parseMarkdown("## Hi\n\nSome **plain** words here.");
    assert.equal(plainText(blocks), "Hi\n\nSome plain words here.");
    assert.equal(readingMinutes(blocks), 1);
  });
});
