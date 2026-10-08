"use client";

import { LoaderIcon, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";
import { keywordsToArray, type BlogFormValues, type BlogStatus } from "@/lib/blog";
import { slugify } from "@/lib/identity";

interface DraftResult {
  title: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  model: string;
}

const TONES = ["Helpful and clear", "Friendly and warm", "Bold and direct", "Expert and detailed", "Conversational"];

/**
 * The blog post editor: title, body (Markdown), category and cover, a search
 * section (title tag, description, keywords, share card, canonical), and an AI
 * panel that drafts the whole post from a topic. The AI only fills the form;
 * nothing is public until a person saves and publishes.
 */
export function BlogEditor({
  initial,
  categories,
  brands,
  canAi,
}: {
  initial: BlogFormValues;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  canAi: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [touchedSlug, setTouchedSlug] = useState(Boolean(initial.slug));
  const [busy, setBusy] = useState<"save" | "ai" | null>(null);
  const [saveAs, setSaveAs] = useState<BlogStatus>(initial.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [ai, setAi] = useState({ topic: "", tone: TONES[0], keywords: "", brandId: "", categoryId: "" });
  const creating = !v.id;

  const err = (name: string) => (fields[name] ? <p className="mt-1 text-xs text-danger">{fields[name]}</p> : null);
  const set = (patch: Partial<BlogFormValues>) => setV((cur) => ({ ...cur, ...patch }));

  async function generateDraft() {
    setError(null);
    if (ai.topic.trim().length < 4) return setError("Describe the post in a few words first.");
    if (v.body.trim() && !window.confirm("Replace the current title, excerpt and body with the AI draft?")) return;
    setBusy("ai");
    const res = await callApi<{ draft: DraftResult }>("/api/blog/posts/generate", {
      method: "POST",
      body: JSON.stringify({
        topic: ai.topic,
        tone: ai.tone,
        keywords: keywordsToArray(ai.keywords),
        categoryId: ai.categoryId || undefined,
        brandId: ai.brandId || undefined,
      }),
    });
    setBusy(null);
    if (res.error) return setError(res.error);
    const d = res.data!.draft;
    setV((cur) => ({
      ...cur,
      title: d.title,
      slug: cur.slug,
      excerpt: d.excerpt,
      body: d.body,
      seoTitle: d.seoTitle,
      seoDescription: d.seoDescription,
      seoKeywords: d.seoKeywords.join(", "),
    }));
    setTouchedSlug(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    const body = {
      title: v.title,
      slug: v.slug || undefined,
      excerpt: v.excerpt,
      body: v.body,
      coverImageUrl: v.coverImageUrl || null,
      categoryId: v.categoryId || null,
      seoTitle: v.seoTitle,
      seoDescription: v.seoDescription,
      seoKeywords: keywordsToArray(v.seoKeywords),
      ogImageUrl: v.ogImageUrl || null,
      canonicalUrl: v.canonicalUrl || null,
      noindex: v.noindex,
      status: saveAs,
    };
    setBusy("save");
    const res = creating
      ? await callApi<{ post: { id: string } }>("/api/blog/posts", { method: "POST", body: JSON.stringify(body) })
      : await callApi<{ post: { id: string } }>(`/api/blog/posts/${v.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setBusy(null);
    if (res.error) {
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    if (creating) router.push(`/app/blog/${res.data!.post.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {canAi && (
        <section className="card space-y-3 border-primary/25 p-4" aria-labelledby="ai-draft">
          <h2 id="ai-draft" className="flex items-center gap-2 font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-primary" /> Draft with AI
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ai-topic">What should the post be about?</label>
              <textarea
                id="ai-topic"
                className="input min-h-[64px]"
                value={ai.topic}
                onChange={(e) => setAi({ ...ai, topic: e.target.value })}
                placeholder="e.g. How short-form video ads double walk-in traffic for Nairobi restaurants"
              />
            </div>
            <div>
              <label className="label" htmlFor="ai-tone">Tone of voice</label>
              <select id="ai-tone" className="input" value={ai.tone} onChange={(e) => setAi({ ...ai, tone: e.target.value })}>
                {TONES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ai-brand">Write for brand (optional)</label>
              <select id="ai-brand" className="input" value={ai.brandId} onChange={(e) => setAi({ ...ai, brandId: e.target.value })}>
                <option value="">The agency itself</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="ai-keywords">Search phrases to include (optional, comma separated)</label>
              <input id="ai-keywords" className="input" value={ai.keywords} onChange={(e) => setAi({ ...ai, keywords: e.target.value })} placeholder="e.g. video ads Kenya, restaurant marketing" />
            </div>
          </div>
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={generateDraft}>
            {busy === "ai" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy === "ai" ? "Writing..." : "Generate draft"}
          </button>
          <p className="text-xs text-muted">The draft lands in the form below for you to review. AI use is metered on your plan, like captions in the Studio.</p>
        </section>
      )}

      <section className="card space-y-3 p-4" aria-labelledby="post-fields">
        <h2 id="post-fields" className="font-semibold text-ink">Post</h2>
        <div>
          <label className="label" htmlFor="p-title">Title</label>
          <input
            id="p-title"
            className="input"
            value={v.title}
            onChange={(e) => {
              const patch: Partial<BlogFormValues> = { title: e.target.value };
              if (!touchedSlug) patch.slug = slugify(e.target.value);
              set(patch);
            }}
            placeholder="e.g. How video ads double walk-in traffic"
          />
          {err("title")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-slug">Link (slug)</label>
            <input
              id="p-slug"
              className="input font-mono text-sm"
              value={v.slug}
              onChange={(e) => {
                setTouchedSlug(true);
                set({ slug: slugify(e.target.value) });
              }}
              placeholder="my-first-post"
            />
            <p className="mt-1 text-xs text-muted">Public address: /blog/{v.slug || "..."}</p>
          </div>
          <div>
            <label className="label" htmlFor="p-category">Category</label>
            <select id="p-category" className="input" value={v.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="p-excerpt">Excerpt</label>
          <textarea
            id="p-excerpt"
            className="input min-h-[56px]"
            value={v.excerpt}
            maxLength={400}
            onChange={(e) => set({ excerpt: e.target.value })}
            placeholder="One or two sentences shown on the blog index and in search results."
          />
          <p className="mt-1 text-xs text-muted">{v.excerpt.length}/400</p>
        </div>
        <div>
          <label className="label" htmlFor="p-body">Body (Markdown)</label>
          <textarea
            id="p-body"
            className="input min-h-[320px] font-mono text-sm"
            value={v.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder={"## The problem\n\nShort paragraphs. **Bold** the point that matters.\n\n- one idea per line\n\n## The fix\n\n..."}
          />
          <p className="mt-1 text-xs text-muted">Supports ## headings, **bold**, *italic*, lists, &gt; quotes, `code`, [links](https://...).</p>
        </div>
        <div>
          <label className="label" htmlFor="p-cover">Cover image URL (optional)</label>
          <input id="p-cover" className="input" value={v.coverImageUrl} onChange={(e) => set({ coverImageUrl: e.target.value })} placeholder="https://... or /showcase/example.jpg" />
          {err("coverImageUrl")}
        </div>
      </section>

      <details className="card p-4" open={Boolean(v.seoTitle || v.seoDescription || v.seoKeywords || v.ogImageUrl || v.canonicalUrl || v.noindex)}>
        <summary className="cursor-pointer font-semibold text-ink">Search engines (SEO)</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="p-seo-title">Search title</label>
            <input id="p-seo-title" className="input" value={v.seoTitle} maxLength={200} onChange={(e) => set({ seoTitle: e.target.value })} placeholder={v.title || "Defaults to the post title"} />
            <p className="mt-1 text-xs text-muted">{v.seoTitle.length}/60 recommended</p>
          </div>
          <div>
            <label className="label" htmlFor="p-seo-desc">Search description</label>
            <textarea id="p-seo-desc" className="input min-h-[56px]" value={v.seoDescription} maxLength={320} onChange={(e) => set({ seoDescription: e.target.value })} placeholder="Defaults to the excerpt" />
            <p className="mt-1 text-xs text-muted">{v.seoDescription.length}/160 recommended</p>
          </div>
          <div>
            <label className="label" htmlFor="p-seo-keywords">Keywords (comma separated)</label>
            <input id="p-seo-keywords" className="input" value={v.seoKeywords} onChange={(e) => set({ seoKeywords: e.target.value })} placeholder="video ads, restaurant marketing, Kenya" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-og">Share card image URL (optional)</label>
              <input id="p-og" className="input" value={v.ogImageUrl} onChange={(e) => set({ ogImageUrl: e.target.value })} placeholder="A branded card is generated when empty" />
              {err("ogImageUrl")}
            </div>
            <div>
              <label className="label" htmlFor="p-canonical">Canonical URL (optional)</label>
              <input id="p-canonical" className="input" value={v.canonicalUrl} onChange={(e) => set({ canonicalUrl: e.target.value })} placeholder="Only if this was first published elsewhere" />
              {err("canonicalUrl")}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={v.noindex} onChange={(e) => set({ noindex: e.target.checked })} />
            Keep out of search results (readable by link, and off the public index)
          </label>
        </div>
      </details>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className={v.status === "PUBLISHED" ? "btn-primary" : "btn-quiet"}
          disabled={busy !== null}
          onClick={() => setSaveAs(creating ? "DRAFT" : v.status)}
        >
          {busy === "save" && saveAs !== "PUBLISHED" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
          {v.status === "PUBLISHED" ? "Save changes" : "Save draft"}
        </button>
        {v.status !== "PUBLISHED" && (
          <button type="submit" className="btn-primary" disabled={busy !== null} onClick={() => setSaveAs("PUBLISHED")}>
            {busy === "save" && saveAs === "PUBLISHED" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
            Save and publish
          </button>
        )}
        {v.status === "PUBLISHED" && v.slug && (
          <a href={`/blog/${v.slug}`} target="_blank" rel="noreferrer" className="btn-quiet">
            View public post
          </a>
        )}
      </div>
    </form>
  );
}
