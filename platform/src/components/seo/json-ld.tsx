import { jsonLdText } from "@/lib/seo";

/** schema.org structured data for search engines. Server-rendered; never executed as script. */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
