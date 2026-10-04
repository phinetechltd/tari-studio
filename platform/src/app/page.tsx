import {
  ArrowRight,
  ArrowUpRight,
  Captions,
  CircleCheck,
  Clapperboard,
  Film,
  ImageIcon,
  Link2,
  MessageCircle,
  Send,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { KenteDivider, Mandala, Savanna, SunDisc } from "@/components/landing/afro-art";
import { CountUp } from "@/components/landing/count-up";
import { Hero3D } from "@/components/landing/hero-3d";
import { HeroParallax } from "@/components/landing/hero-parallax";
import { LazyVideo } from "@/components/landing/lazy-video";
import { OrderForm } from "@/components/landing/order-form";
import { Reveal } from "@/components/landing/reveal";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { StudioDemo } from "@/components/landing/studio-demo";
import { TiltCard } from "@/components/landing/tilt-card";
import { PlanGrid } from "@/components/pricing/plan-grid";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { VIDEO_MAX_SECONDS, videoCreditsFor } from "@/lib/pricing";
import { CLIENT_CASE, faqFor, HOW_IT_WORKS, SAMPLE_CLIPS, SHOWREEL, TARI_CLIPS, type Clip } from "@/lib/showcase";
import { getPricing } from "@/server/pricing-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const pricing = await getPricing();
  return {
    title: { absolute: `${PRODUCT_NAME}: AI video and image ads for African brands` },
    description: `Make AI video ads and posters in minutes, publish them, and sell on WhatsApp. Plans from ${formatKES(pricing.plans.BASIC.monthlyCents)} a month; pay by M-Pesa or card.`,
    openGraph: { images: [{ url: SHOWREEL.poster }] },
  };
}

type Accent = "gold" | "clay" | "green" | "red";
const ACCENT: Record<Accent, string> = {
  gold: "bg-primary/[0.14] text-primary",
  clay: "bg-[#E8693A]/[0.14] text-[#F08A5E]",
  green: "bg-success/[0.14] text-success",
  red: "bg-[#C8321E]/[0.2] text-[#FF8B77]",
};

const TOOLS: Array<{ title: string; body: string; icon: LucideIcon; accent: Accent; tag?: "Hot" | "New" }> = [
  { title: "Video ads", body: `Seedance 2.5, up to ${VIDEO_MAX_SECONDS} seconds, with sound`, icon: Clapperboard, accent: "gold", tag: "Hot" },
  { title: "Image ads", body: "Posters and product shots in every social shape", icon: ImageIcon, accent: "clay" },
  { title: "Animate an image", body: "Bring a finished poster to life", icon: Wand2, accent: "green", tag: "New" },
  { title: "Extend a clip", body: "Keep the story going from the last frame", icon: Film, accent: "red" },
  { title: "Captions by Claude", body: "Hooks, captions and calls to action that fit the ad", icon: Captions, accent: "red" },
  { title: "Facebook & Instagram", body: "Schedule posts from the same place you make them", icon: Send, accent: "green" },
  { title: "WhatsApp auto-replies", body: "Answer every message in seconds, from your catalogue", icon: MessageCircle, accent: "gold", tag: "New" },
  { title: "Tracked links", body: "Know which post brought the customer who paid", icon: Link2, accent: "clay" },
];

function ClipCard({ clip, sample }: { clip: Clip; sample?: string }) {
  const portrait = clip.orientation === "portrait";
  return (
    <figure className={portrait ? "w-[200px] shrink-0 sm:w-[230px]" : "w-[340px] shrink-0 sm:w-[420px]"}>
      <div className={`relative overflow-hidden rounded-2xl border border-primary/20 ${portrait ? "aspect-[9/16]" : "aspect-video"}`}>
        <LazyVideo src={clip.src} poster={clip.poster} label={clip.title} className="h-full w-full" />
        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
          {clip.tag}
        </span>
        {sample ? (
          <a
            href={sample}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur hover:text-white"
          >
            Stock sample · Pexels
          </a>
        ) : null}
      </div>
      <figcaption className="mt-2 text-sm font-medium text-ink/90">{clip.title}</figcaption>
    </figure>
  );
}

/** Two identical copies side by side, each padded by one gap, so the -50% loop has no seam. */
function Marquee({ children, reverse, duration }: { children: ReactNode; reverse?: boolean; duration: number }) {
  return (
    <div className="marquee-host relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
      <div className={`marquee ${reverse ? "marquee-reverse" : ""}`} style={{ ["--marquee-duration" as string]: `${duration}s` }}>
        <div className="flex items-center gap-4 pr-4">{children}</div>
        <div aria-hidden className="flex items-center gap-4 pr-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title, children, center }: { eyebrow?: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {eyebrow ? (
        <p className={`flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary ${center ? "justify-center" : ""}`}>
          <span aria-hidden className="h-px w-8 bg-primary/60" />
          {eyebrow}
          <span aria-hidden className="h-px w-8 bg-primary/60" />
        </p>
      ) : null}
      <h2 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{title}</h2>
      {children ? <p className="mt-4 text-lg text-muted">{children}</p> : null}
    </div>
  );
}

/**
 * The public landing page: a sunset hero with a 3D kente gourd, the reel, the
 * tools, real client work, labelled stock formats, the Studio, plans in
 * shillings, and done-for-you ordering. Signed-in users go straight to their
 * workspace.
 */
export default async function Home() {
  const pricing = await getPricing();
  const pinned = await db.generatedAsset.findMany({
    where: { showcase: true, status: "READY", archivedAt: null, storageKey: { not: null } },
    orderBy: { showcasedAt: "desc" },
    take: 12,
    select: { id: true, mediaType: true, showcaseTitle: true, prompt: true, aspectRatio: true },
  });

  const [ad, , poster] = CLIENT_CASE.media;
  const portraitTari = TARI_CLIPS.filter((c) => c.orientation === "portrait");
  const wideTari = TARI_CLIPS.filter((c) => c.orientation === "landscape");
  const fromKes = Math.round(pricing.plans.BASIC.monthlyCents / 100);

  return (
    <div className="theme-afro theme-afro-night min-h-screen overflow-x-clip bg-bg text-ink">
      <SiteHeader />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <HeroParallax className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-30 bg-[radial-gradient(90%_70%_at_70%_30%,#5a2410_0%,#2a1209_45%,#0f0805_100%)]" />
          <div aria-hidden className="pattern-mudcloth absolute inset-0 -z-20 opacity-[0.05] [transform:translateY(calc(var(--p)*-60px))]" />
          <div
            aria-hidden
            className="sun-breathe pointer-events-none absolute -right-32 top-10 -z-20 hidden h-[760px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgba(245,166,35,0.45),rgba(210,86,43,0.18)_55%,transparent_75%)] lg:block [transform:translateY(calc(var(--p)*140px))]"
          />
          <Mandala className="spin-slow-rev pointer-events-none absolute -left-40 top-24 -z-10 h-[520px] w-[520px] text-primary/[0.14]" />

          <div className="mx-auto grid min-h-[88vh] w-full max-w-[1400px] items-center gap-6 px-4 pb-44 pt-28 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:pb-52">
            <div className="relative z-10">
              <p className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-white/90">
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-onprimary">Karibu</span>
                Seedance 2.5 video with sound, Soul 2 images, Claude captions
              </p>
              <h1 className="mt-6 font-display text-[52px] font-extrabold leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-[104px]">
                AI ads that <span className="text-brand-gradient">sell</span>
                <svg viewBox="0 0 300 14" className="mt-2 block h-3 w-48 sm:w-72" aria-hidden fill="none">
                  <path d="M2 8 Q 20 0 38 8 T 74 8 T 110 8 T 146 8 T 182 8 T 218 8 T 254 8 T 298 8" stroke="#f5a623" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="420" strokeDashoffset="420" style={{ animation: "draw-line 1.6s 0.4s ease-out forwards" }} />
                </svg>
              </h1>
              <p className="mt-5 font-display text-xl font-semibold tracking-wide text-primary sm:text-2xl">Tengeneza. Tangaza. Uza.</p>
              <p className="mt-4 max-w-xl text-lg text-white/75 sm:text-xl">
                Video and image ads for African brands, made in minutes. Publish to Facebook and Instagram, answer on WhatsApp, and see which ad brought the sale.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="btn-primary shine relative min-h-[54px] overflow-hidden px-8 text-base font-semibold">
                  Create a free account <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="#order" className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full border border-primary/40 bg-wash/5 px-7 text-base font-semibold text-white backdrop-blur hover:bg-primary/15">
                  Have us make it for you
                </Link>
              </div>
              <ul className="mt-9 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/70">
                <li className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-success" /> Plans from {formatKES(pricing.plans.BASIC.monthlyCents)}/month</li>
                <li className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-success" /> Pay by M-Pesa or card</li>
                <li className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-success" /> Credits never expire</li>
              </ul>
            </div>

            <div className="relative z-0 h-[360px] sm:h-[480px] lg:h-[640px] [transform:translateY(calc(var(--p)*-40px))]">
              <Hero3D />
            </div>
          </div>

          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-0 h-40 sm:h-56 lg:h-64 [transform:translateY(calc(var(--p)*30px))]">
            <Savanna className="h-full w-full" />
          </div>
        </HeroParallax>
        <div aria-hidden className="kente-band" />

        {/* ── Numbers ──────────────────────────────────────────────────── */}
        <section className="px-4 py-14 sm:px-6">
          <dl className="mx-auto grid max-w-[1400px] grid-cols-2 gap-6 text-center lg:grid-cols-4">
            {[
              { v: <CountUp to={pricing.imageCredits} suffix=" credits" />, k: "for a finished image ad" },
              { v: <CountUp to={VIDEO_MAX_SECONDS} suffix=" seconds" />, k: "of video, with sound" },
              { v: <CountUp to={fromKes} prefix="KES " />, k: "a month to start" },
              { v: "Never", k: "do your credits expire" },
            ].map((s, i) => (
              <Reveal key={s.k} delay={i * 90}>
                <div className="rounded-3xl border border-primary/15 bg-wash/[0.03] px-4 py-6">
                  <dd className="font-display text-3xl font-extrabold text-primary sm:text-4xl">{s.v}</dd>
                  <dt className="mt-1 text-sm text-muted">{s.k}</dt>
                </div>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* ── Reel ─────────────────────────────────────────────────────── */}
        <section className="relative px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-[1400px] items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal from="left">
              <SectionHead eyebrow="The reel" title={<>Stories that <span className="text-brand-gradient">move</span> a market</>}>
                From the first frame to the WhatsApp message that closes the sale, made for the way African businesses sell.
              </SectionHead>
              <Link href="#showcase" className="mt-6 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                See real campaigns <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Reveal>
            <Reveal from="right">
              <div className="relative mx-auto max-w-[760px]">
                <SunDisc className="spin-slow absolute -right-10 -top-10 -z-10 h-44 w-44 opacity-80" />
                <div className="pattern-mudcloth absolute -bottom-6 -left-6 -z-10 h-40 w-40 rounded-3xl bg-primary/10 opacity-60" />
                <div className="overflow-hidden rounded-[2rem] border-2 border-primary/40 shadow-[0_40px_120px_-40px_rgba(245,166,35,0.55)]">
                  <LazyVideo src={SHOWREEL.src} poster={SHOWREEL.poster} label={`${PRODUCT_NAME} showreel`} className="aspect-video w-full" />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <KenteDivider />

        {/* ── Tools ────────────────────────────────────────────────────── */}
        <section id="tools" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-[1400px]">
            <Reveal>
              <SectionHead eyebrow="The toolkit" title={<>Make it, post it, <span className="text-brand-gradient">sell it</span></>}>
                One workspace from the first idea to the WhatsApp message that closes the sale.
              </SectionHead>
            </Reveal>
            <ul className="mt-12 grid gap-4 [perspective:1200px] sm:grid-cols-2 lg:grid-cols-4">
              {TOOLS.map((t, i) => (
                <TiltCard key={t.title} className="group relative overflow-hidden rounded-3xl border border-primary/15 bg-wash/[0.035] p-6 hover:border-primary/50 hover:bg-wash/[0.06]">
                  <Reveal delay={(i % 4) * 80}>
                    <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[radial-gradient(closest-side,rgba(245,166,35,0.25),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="flex items-start justify-between">
                      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${ACCENT[t.accent]}`}>
                        <t.icon className="h-5 w-5" strokeWidth={1.7} />
                      </span>
                      {t.tag ? <span className={t.tag === "Hot" ? "tag-hot" : "tag-new"}>{t.tag}</span> : null}
                    </div>
                    <h3 className="mt-5 font-display text-xl font-bold text-ink">{t.title}</h3>
                    <p className="mt-1 text-sm text-muted">{t.body}</p>
                  </Reveal>
                </TiltCard>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Showcase rows ────────────────────────────────────────────── */}
        <section id="showcase" className="relative scroll-mt-20 space-y-14 py-16">
          <div aria-hidden className="pattern-mudcloth pointer-events-none absolute inset-0 -z-10 opacity-[0.035]" />
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal>
              <SectionHead eyebrow={`Made with ${PRODUCT_NAME}`} title="Real campaigns, real sales">
                Scenes from {CLIENT_CASE.client}&apos;s “{CLIENT_CASE.campaign}” campaign for {CLIENT_CASE.product}, made in the Studio.
              </SectionHead>
            </Reveal>
          </div>
          <Marquee duration={70}>
            {[...portraitTari, ...wideTari].map((c) => (
              <ClipCard key={c.src} clip={c} />
            ))}
          </Marquee>

          {pinned.length > 0 ? (
            <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Fresh from the Studio</p>
              <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {pinned.map((a) => (
                  <li key={a.id} className="overflow-hidden rounded-2xl border border-primary/20">
                    {a.mediaType === "VIDEO" ? (
                      <LazyVideo src={`/showcase/${a.id}`} label={a.showcaseTitle ?? a.prompt.slice(0, 80)} className="aspect-[9/16] w-full" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/showcase/${a.id}`} alt={a.showcaseTitle ?? a.prompt.slice(0, 120)} className="aspect-square w-full object-cover" loading="lazy" />
                    )}
                    <p className="line-clamp-1 px-3 py-2 text-xs text-muted">{a.showcaseTitle ?? a.prompt}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal>
              <SectionHead eyebrow="Formats people make" title="Every product, every shape">
                Product reveals, food, fashion, phones, real estate. These are royalty-free stock samples from Pexels, shown for the format; they were not made with {PRODUCT_NAME}.
              </SectionHead>
            </Reveal>
          </div>
          <Marquee reverse duration={80}>
            {SAMPLE_CLIPS.map((c) => (
              <ClipCard key={c.src} clip={c} sample={c.source} />
            ))}
          </Marquee>
        </section>

        {/* ── Case study ───────────────────────────────────────────────── */}
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[3fr_2fr] lg:items-center">
            <Reveal from="left">
              <div className="overflow-hidden rounded-3xl border-2 border-primary/30 shadow-[0_40px_120px_-40px_rgba(245,166,35,0.45)]">
                <video src={ad.src} poster={ad.poster} controls playsInline preload="none" className="aspect-video w-full bg-black" aria-label={`${CLIENT_CASE.client}: ${ad.title}`} />
              </div>
            </Reveal>
            <Reveal from="right">
              <Image src={CLIENT_CASE.logo} alt={`${CLIENT_CASE.client} logo`} width={120} height={48} className="h-10 w-auto" />
              <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight">A 24-second launch ad</h2>
              <p className="mt-4 text-muted">{CLIENT_CASE.summary}</p>
              <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
                {[
                  { k: "Length", v: "24 s" },
                  { k: "Credits", v: String(videoCreditsFor(pricing, 24)) },
                  { k: "Formats", v: "16:9 · 9:16" },
                ].map((s) => (
                  <div key={s.k} className="rounded-2xl border border-primary/15 bg-wash/[0.04] p-3">
                    <dt className="text-[11px] uppercase tracking-wider text-muted">{s.k}</dt>
                    <dd className="mt-1 font-display text-lg font-bold text-ink">{s.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 flex items-center gap-4">
                <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-primary/30">
                  <Image src={poster.src} alt="The campaign's launch poster" fill sizes="96px" className="object-cover object-top" />
                </div>
                <p className="text-sm text-muted">The launch poster, from the same brief: {pricing.imageCredits} credits.</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Studio demo ──────────────────────────────────────────────── */}
        <section id="studio" className="scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <StudioDemo pricing={pricing} />
            </Reveal>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-[1400px]">
            <Reveal>
              <SectionHead center eyebrow="How it works" title="Three steps to your next sale" />
            </Reveal>
            <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
              <div aria-hidden className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-primary/40 md:block" />
              {HOW_IT_WORKS.map((s, i) => (
                <li key={s.title}>
                  <Reveal delay={i * 140}>
                    <div className="relative rounded-3xl border border-primary/15 bg-wash/[0.03] p-7 pt-12">
                      <span className="arch absolute -top-8 left-7 flex h-16 w-14 items-end justify-center bg-afro-gradient pb-2 font-display text-2xl font-extrabold text-onprimary shadow-lg">
                        {i + 1}
                      </span>
                      <h3 className="font-display text-xl font-bold text-ink">{s.title}</h3>
                      <p className="mt-2 text-sm text-muted">{s.body}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────── */}
        <section id="pricing" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-[1400px]">
            <Reveal>
              <SectionHead center eyebrow="Pricing" title={<>Plans in <span className="text-brand-gradient">shillings</span></>}>
                Monthly credits for the Studio. An image is {pricing.imageCredits} credits; video is {pricing.videoCreditsPerStep} credits per started {pricing.videoStepSeconds} seconds. Pay by M-Pesa or card.
              </SectionHead>
            </Reveal>
            <div className="mt-10">
              <PlanGrid pricing={pricing} />
            </div>
            <p className="mt-8 text-center text-sm">
              <Link href="/pricing" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Compare plans, credit costs and top-ups <ArrowUpRight className="h-4 w-4" />
              </Link>
            </p>
          </div>
        </section>

        {/* ── Done for you ─────────────────────────────────────────────── */}
        <section id="order" className="scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="panel relative mx-auto grid max-w-[1400px] gap-10 overflow-hidden p-6 sm:p-10 lg:grid-cols-[2fr_3fr]">
            <div aria-hidden className="pattern-zigzag absolute inset-x-0 top-0" />
            <div className="pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Done for you</p>
              <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">No account? We make it.</h2>
              <p className="mt-3 text-muted">Tell us what you need. We confirm the price, you pay, and we make it. The estimate updates as you choose.</p>
              <ul className="mt-8 space-y-4 text-sm">
                {[
                  "We confirm your price first. Nothing is charged until you agree.",
                  "Then pay on your private page: M-Pesa prompt, or card, M-Pesa or Apple Pay on Paystack.",
                  "The same page tracks progress and holds your files to download.",
                  "Payment didn't go through? Try again from the order page.",
                  "Voice-over, music or captions? Choose “Something else” for a quote.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    <span className="text-ink/90">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-4">
              <OrderForm pricing={pricing} />
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <SectionHead center eyebrow="Maswali" title="Questions" />
            </Reveal>
            <div className="mt-8 divide-y divide-primary/10 rounded-3xl border border-primary/15 bg-wash/[0.02]">
              {faqFor(pricing).map((f) => (
                <details key={f.q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="text-xl text-primary transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing call to action ───────────────────────────────────── */}
        <section className="px-4 pb-20 sm:px-6">
          <Reveal>
            <div className="bg-afro-gradient relative mx-auto max-w-[1400px] overflow-hidden rounded-[2rem] p-10 text-center sm:p-16">
              <div aria-hidden className="absolute inset-0 bg-black/45" />
              <div aria-hidden className="pattern-mudcloth absolute inset-0 opacity-[0.07]" />
              <SunDisc className="spin-slow pointer-events-none absolute -right-24 -top-24 h-72 w-72 opacity-60" />
              <SunDisc className="spin-slow-rev pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 opacity-40" />
              <div className="relative">
                <Sparkles className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-white sm:text-6xl">Your next ad is one sentence away</h2>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link href="/pricing" className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full bg-white px-8 font-semibold text-black hover:bg-wash/90">
                    See plans <ArrowRight className="h-5 w-5" />
                  </Link>
                  <Link href="#order" className="inline-flex min-h-[54px] items-center justify-center rounded-full border border-wash/50 px-8 font-semibold text-white hover:bg-wash/10">
                    Order an ad
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
