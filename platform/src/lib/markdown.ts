/**
 * A small, safe Markdown subset for the blog: headings, paragraphs, lists,
 * quotes, code spans and fenced code, bold, italic, links and images.
 *
 * The parser returns plain data (no HTML strings), and the renderer
 * (src/components/blog/markdown.tsx) turns it into React elements, so post
 * text — including anything an AI drafts — is never injected as raw HTML.
 * Link and image URLs are limited to https/http/mailto and site-relative
 * paths; anything else renders as literal text.
 */

export type Inline =
  | { t: "text"; text: string }
  | { t: "bold"; children: Inline[] }
  | { t: "italic"; children: Inline[] }
  | { t: "code"; text: string }
  | { t: "link"; text: string; href: string }
  | { t: "image"; src: string; alt: string };

export type Block =
  | { t: "heading"; level: 1 | 2 | 3 | 4; children: Inline[] }
  | { t: "paragraph"; children: Inline[] }
  | { t: "list"; ordered: boolean; items: Inline[][] }
  | { t: "quote"; children: Inline[] }
  | { t: "code"; text: string }
  | { t: "rule" };

/** Protocols a reader may be sent to. "javascript:" et al. stay plain text. */
export function safeHref(url: string): string | null {
  const v = url.trim();
  if (/^https?:\/\//i.test(v) || /^mailto:/i.test(v)) return v;
  if (/^\/[^/\\]/.test(v)) return v;
  return null;
}

export function parseInline(src: string, depth = 0): Inline[] {
  const nodes: Inline[] = [];
  const push = (buf: string) => {
    if (buf) nodes.push({ t: "text", text: buf });
    return "";
  };
  let buf = "";
  let i = 0;
  // Recursion only happens inside **...** / *...*; the depth stop keeps a pathological string linear.
  const nested = (text: string): Inline[] => (depth > 4 ? [{ t: "text", text }] : parseInline(text, depth + 1));

  while (i < src.length) {
    if (src[i] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        buf = push(buf);
        nodes.push({ t: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end >= i + 3 || (end !== -1 && end > i + 2)) {
        buf = push(buf);
        nodes.push({ t: "bold", children: nested(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === "*" && !src.startsWith("**", i)) {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1) {
        buf = push(buf);
        nodes.push({ t: "italic", children: nested(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith("![", i)) {
      const close = src.indexOf("](", i + 2);
      if (close > i + 2) {
        const paren = src.indexOf(")", close + 2);
        if (paren > close + 2) {
          const href = safeHref(src.slice(close + 2, paren));
          if (href && !/^mailto:/i.test(href)) {
            buf = push(buf);
            nodes.push({ t: "image", src: href, alt: src.slice(i + 2, close) });
            i = paren + 1;
            continue;
          }
        }
      }
    }
    if (src[i] === "[") {
      const close = src.indexOf("](", i + 1);
      if (close > i + 1) {
        const paren = src.indexOf(")", close + 2);
        if (paren > close + 2) {
          const href = safeHref(src.slice(close + 2, paren));
          if (href) {
            buf = push(buf);
            nodes.push({ t: "link", text: src.slice(i + 1, close), href });
            i = paren + 1;
            continue;
          }
        }
      }
    }
    buf += src[i];
    i++;
  }
  push(buf);
  return nodes;
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const UL_ITEM = /^\s*[-*]\s+(.*)$/;
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(?:---+|\*\*\*+|___+)\s*$/;
const FENCE = /^\s*```(.*)$/;

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      const children = parseInline(paragraph.join(" ").trim());
      if (children.length) blocks.push({ t: "paragraph", children });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (code !== null) {
      if (FENCE.test(line)) {
        blocks.push({ t: "code", text: code.join("\n") });
        code = null;
      } else {
        code.push(line);
      }
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      flushParagraph();
      code = [];
      i++;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ t: "heading", level: heading[1].length as 1 | 2 | 3 | 4, children: parseInline(heading[2].trim()) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ t: "rule" });
      i++;
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      flushParagraph();
      const parts: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]);
        if (!q) break;
        parts.push(q[1]);
        i++;
      }
      blocks.push({ t: "quote", children: parseInline(parts.join(" ").trim()) });
      continue;
    }
    if (UL_ITEM.test(line) || OL_ITEM.test(line)) {
      flushParagraph();
      const ordered = OL_ITEM.test(line);
      const re = ordered ? OL_ITEM : UL_ITEM;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const item = re.exec(lines[i]);
        if (!item) break;
        items.push(parseInline(item[1].trim()));
        i++;
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }
    paragraph.push(line.trim());
    i++;
  }
  if (code !== null) blocks.push({ t: "code", text: code.join("\n") });
  flushParagraph();
  return blocks;
}

/** Plain text of a post, for excerpts and reading time. */
export function plainText(blocks: Block[]): string {
  const inlineText = (nodes: Inline[]): string =>
    nodes
      .map((n) => {
        switch (n.t) {
          case "text":
            return n.text;
          case "code":
            return n.text;
          case "link":
            return n.text;
          case "image":
            return n.alt;
          default:
            return inlineText(n.children);
        }
      })
      .join("");
  return blocks
    .map((b) => {
      switch (b.t) {
        case "heading":
        case "paragraph":
        case "quote":
          return inlineText(b.children);
        case "list":
          return b.items.map(inlineText).join(". ");
        case "code":
          return b.text;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Rough minutes-to-read from a post's parsed blocks. */
export function readingMinutes(blocks: Block[]): number {
  const words = plainText(blocks).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
