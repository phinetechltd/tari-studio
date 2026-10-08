import Link from "next/link";
import type { ReactNode } from "react";

import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

/**
 * Renders the parsed Markdown subset to React elements. All text goes through
 * React's escaping and link URLs were validated by the parser, so post bodies
 * (including AI drafts) can never inject raw HTML or unsafe links.
 */

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.t) {
      case "text":
        return <span key={i}>{node.text}</span>;
      case "bold":
        return (
          <strong key={i} className="font-semibold text-ink">
            {renderInline(node.children)}
          </strong>
        );
      case "italic":
        return <em key={i}>{renderInline(node.children)}</em>;
      case "code":
        return (
          <code key={i} className="rounded bg-wash/[0.08] px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
            {node.text}
          </code>
        );
      case "link":
        return node.href.startsWith("/") ? (
          <Link key={i} href={node.href} className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
            {node.text}
          </Link>
        ) : (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
            {node.text}
          </a>
        );
      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element -- post authors paste any public URL; next/image cannot size unknown remote hosts
          <img key={i} src={node.src} alt={node.alt} loading="lazy" className="my-4 w-full rounded-2xl border border-line" />
        );
    }
  });
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.t) {
    case "heading": {
      const children = renderInline(block.children);
      const id = `h-${i}`;
      if (block.level === 1)
        return (
          <h1 key={i} id={id} className="mt-10 text-3xl font-bold text-ink">
            {children}
          </h1>
        );
      if (block.level === 2)
        return (
          <h2 key={i} id={id} className="mt-10 text-2xl font-bold text-ink">
            {children}
          </h2>
        );
      if (block.level === 3)
        return (
          <h3 key={i} id={id} className="mt-8 text-xl font-semibold text-ink">
            {children}
          </h3>
        );
      return (
        <h4 key={i} id={id} className="mt-6 text-lg font-semibold text-ink">
          {children}
        </h4>
      );
    }
    case "paragraph":
      return (
        <p key={i} className="mt-5 leading-relaxed text-ink/85">
          {renderInline(block.children)}
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol key={i} className="mt-5 list-decimal space-y-2 pl-6 leading-relaxed text-ink/85">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={i} className="mt-5 list-disc space-y-2 pl-6 leading-relaxed text-ink/85 marker:text-primary">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote key={i} className="mt-6 border-l-4 border-primary/40 pl-4 italic text-ink/75">
          {renderInline(block.children)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={i} className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface p-4 font-mono text-sm text-ink">
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr key={i} className="my-10 border-line" />;
  }
}

export function Markdown({ source }: { source: string }) {
  return <div className="max-w-none">{parseMarkdown(source).map(renderBlock)}</div>;
}
