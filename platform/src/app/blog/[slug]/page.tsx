import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/blog/markdown";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { JsonLd } from "@/components/seo/json-ld";
import { formatDate } from "@/components/ui";
import { PRODUCT_NAME } from "@/lib/brand";
import { parseMarkdown, readingMinutes } from "@/lib/markdown";
import { absoluteUrl, blogPostingLd, breadcrumbLd, pageMetadata } from "@/lib/seo";
import { getPublicPost } from "@/server/blog";
import { siteSeo } from "@/server/seo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** The post's own SEO fields win; the title, excerpt and a generated card are the fallbacks. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const [site, { post }] = await Promise.all([siteSeo(), getPublicPost(slug)]);
  if (!post) return {};
  const title = post.seoTitle?.trim() || post.title;
  const description = post.seoDescription?.trim() || post.excerpt?.trim() || `Read on the ${PRODUCT_NAME} blog.`;
  const image = post.ogImageUrl || post.coverImageUrl || undefined;
  const base = pageMetadata({
    title,
    description: description.slice(0, 300),
    path: `/blog/${post.slug}`,
    image,
    siteName: PRODUCT_NAME,
    noindex: post.noindex || !site.indexable,
  });
  return {
    ...base,
    ...(post.canonicalUrl ? { alternates: { canonical: post.canonicalUrl } } : {}),
    ...(post.seoKeywords.length ? { keywords: post.seoKeywords } : {}),
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: post.author ? [post.author.name] : undefined,
      ...(post.category ? { section: post.category.name } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const [site, { org, post }] = await Promise.all([siteSeo(), getPublicPost(slug)]);
  if (!post || !org) notFound();

  const url = absoluteUrl(site.base, `/blog/${post.slug}`);
  const blocks = parseMarkdown(post.body);
  const minutes = readingMinutes(blocks);

  return (
    <div className="theme-afro theme-afro-night min-h-screen bg-bg text-ink">
      <JsonLd
        data={[
          blogPostingLd({
            headline: post.seoTitle?.trim() || post.title,
            description: (post.seoDescription?.trim() || post.excerpt?.trim() || post.title).slice(0, 300),
            url: post.canonicalUrl ?? url,
            image: post.ogImageUrl ?? post.coverImageUrl ?? absoluteUrl(site.base, "/og?title=" + encodeURIComponent(post.title.slice(0, 90))),
            datePublished: (post.publishedAt ?? post.updatedAt).toISOString(),
            dateModified: post.updatedAt.toISOString(),
            authorName: post.author?.name ?? PRODUCT_NAME,
            publisherName: PRODUCT_NAME,
            publisherUrl: site.base,
            keywords: post.seoKeywords,
            section: post.category?.name,
          }),
          breadcrumbLd(site.base, [
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <SiteHeader />
      <main className="px-4 pb-24 pt-14 sm:px-6">
        <article className="mx-auto max-w-3xl">
          <nav className="text-sm text-muted" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-ink">Home</Link>
            <span aria-hidden className="mx-2">/</span>
            <Link href="/blog" className="hover:text-ink">Blog</Link>
            {post.category && (
              <>
                <span aria-hidden className="mx-2">/</span>
                <Link href={`/blog?category=${post.category.slug}`} className="hover:text-ink">{post.category.name}</Link>
              </>
            )}
          </nav>

          {post.category && <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{post.category.name}</p>}
          <h1 className="mt-2 font-poppins text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{post.title}</h1>
          <p className="mt-4 text-sm text-muted">
            {post.author ? `${post.author.name} · ` : ""}
            {post.publishedAt ? formatDate(post.publishedAt) : ""} · {minutes} min read
          </p>

          {post.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- authors paste any public URL; next/image cannot size unknown remote hosts
            <img src={post.coverImageUrl} alt={post.title} className="mt-8 w-full rounded-3xl border border-wash/[0.08] object-cover" />
          )}

          <div className="mt-8">
            <Markdown source={post.body} />
          </div>

          <footer className="mt-14 rounded-3xl border border-wash/[0.08] bg-surface p-6 text-center">
            <p className="font-poppins text-xl font-bold">Want this working for your business?</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {PRODUCT_NAME} makes AI video and image ads for Kenyan businesses, in minutes.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Link href="/signup" className="btn-primary min-h-[38px] px-4 text-sm">Get started</Link>
              <Link href="/blog" className="btn-quiet min-h-[38px] px-4 text-sm">More from the blog</Link>
            </div>
          </footer>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
