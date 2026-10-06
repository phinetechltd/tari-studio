import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { JsonLd } from "@/components/seo/json-ld";
import { formatDate } from "@/components/ui";
import { PRODUCT_NAME } from "@/lib/brand";
import { breadcrumbLd, pageMetadata } from "@/lib/seo";
import { listPublicCategories, listPublicPosts } from "@/server/blog";
import { siteSeo } from "@/server/seo";

/** Reads the database, so the index is rendered per request like the pricing page. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await siteSeo();
  return pageMetadata({
    title: "Blog",
    description: `Guides, ideas and results on AI video and image marketing in Kenya, from the ${PRODUCT_NAME} team.`,
    path: "/blog",
    siteName: PRODUCT_NAME,
    noindex: !site.indexable,
  });
}

const chip = (on: boolean) =>
  `min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary/10 text-primary" : "border-wash/15 bg-wash/[0.04] text-muted hover:text-ink"}`;

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  const { category, q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const [site, listing, catList] = await Promise.all([
    siteSeo(),
    listPublicPosts({ category, q: q?.slice(0, 80), page }),
    listPublicCategories(),
  ]);
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { category, q, page: page > 1 ? String(page) : undefined, ...over };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/blog${s ? `?${s}` : ""}`;
  };

  return (
    <div className="theme-afro theme-afro-night min-h-screen bg-bg text-ink">
      <JsonLd
        data={breadcrumbLd(site.base, [
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ])}
      />
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden px-4 pb-8 pt-20 sm:px-6">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(45%_60%_at_50%_0%,rgba(245,166,35,0.18),transparent_70%)]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Blog</p>
            <h1 className="mt-3 font-poppins text-4xl font-extrabold uppercase leading-[1.02] tracking-tight sm:text-5xl">
              Ideas that <span className="text-brand-gradient">get seen</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
              Guides and results on AI video and image marketing for Kenyan businesses.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1100px] px-4 pb-20 sm:px-6">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <form method="get" action="/blog" role="search" className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="blog-q">Search the blog</label>
              <input id="blog-q" name="q" defaultValue={q ?? ""} className="input max-w-xs" placeholder="Search posts" />
              {category && <input type="hidden" name="category" value={category} />}
              <button className="btn-quiet" type="submit">Search</button>
            </form>
          </div>
          {catList.categories.length > 0 && (
            <nav className="mb-8 flex flex-wrap gap-2" aria-label="Categories">
              <Link href={href({ category: undefined, page: undefined })} className={chip(!category)}>All</Link>
              {catList.categories.map((c) => (
                <Link key={c.id} href={href({ category: c.slug, page: undefined })} className={chip(category === c.slug)}>
                  {c.name} ({c._count.posts})
                </Link>
              ))}
            </nav>
          )}

          {listing.posts.length === 0 ? (
            <div className="rounded-3xl border border-wash/[0.08] p-10 text-center">
              <p className="font-poppins text-xl font-bold">{q || category ? "No posts match" : "The first post is on its way"}</p>
              <p className="mt-2 text-muted">
                {q || category ? "Try another search or category." : `${PRODUCT_NAME} is writing about AI marketing for local businesses. Check back soon.`}
              </p>
            </div>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listing.posts.map((post) => (
                <li key={post.id}>
                  <Link href={`/blog/${post.slug}`} className="group block h-full overflow-hidden rounded-3xl border border-wash/[0.08] bg-surface transition-colors hover:border-primary/40">
                    <div className="relative aspect-[16/9] overflow-hidden bg-wash/[0.04]">
                      {post.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authors paste any public URL; next/image cannot size unknown remote hosts
                        <img src={post.coverImageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[radial-gradient(60%_60%_at_50%_30%,rgba(245,166,35,0.18),transparent_75%)] font-poppins text-4xl font-extrabold text-primary/60">
                          {post.title.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      {post.category && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{post.category.name}</p>}
                      <h2 className="mt-1.5 font-poppins text-lg font-bold leading-snug text-ink group-hover:text-primary">{post.title}</h2>
                      {post.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted">{post.excerpt}</p>}
                      <p className="mt-3 text-xs text-muted">
                        {post.publishedAt ? formatDate(post.publishedAt) : ""}
                        {post.author ? ` · ${post.author.name}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {listing.pages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pages">
              {page > 1 && (
                <Link href={href({ page: String(page - 1) })} className="btn-quiet">
                  Newer posts
                </Link>
              )}
              <span className="text-sm text-muted">
                Page {listing.page} of {listing.pages}
              </span>
              {page < listing.pages && (
                <Link href={href({ page: String(page + 1) })} className="btn-quiet">
                  Older posts
                </Link>
              )}
            </nav>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
