"use client";

import { ChevronLeft, ChevronRight, MessageCircle, MousePointerClick } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface HeroSlide {
  title: string;
  subtitle: string;
  href: string;
  /** A video plays muted in the centre card; an image or art fills the others. */
  video?: { src: string; poster: string };
  image?: string;
  art?: "whatsapp" | "campaign";
}

const ART: Record<NonNullable<HeroSlide["art"]>, { bg: string; icon: ReactNode }> = {
  whatsapp: {
    bg: "bg-[radial-gradient(120%_120%_at_20%_10%,#1f8a4c_0%,#0d3a22_45%,#0f0805_100%)]",
    icon: <MessageCircle className="h-24 w-24 text-[#ffd978]/80" strokeWidth={1.2} />,
  },
  campaign: {
    bg: "bg-[radial-gradient(120%_120%_at_80%_10%,#d2562b_0%,#4a1c0c_45%,#0f0805_100%)]",
    icon: <MousePointerClick className="h-24 w-24 text-[#ffd978]/80" strokeWidth={1.2} />,
  },
};

/**
 * The dashboard's feature carousel: a large centre card with its neighbours
 * peeking either side. Advances every six seconds unless the pointer is on it,
 * it has keyboard focus, or the person prefers reduced motion.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go(1), 6000);
    return () => clearInterval(t);
  }, [paused, count, go]);

  if (count === 0) return null;
  const at = (offset: number) => slides[(index + offset + count) % count]!;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What you can do"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative flex h-[220px] items-center justify-center sm:h-[260px] lg:h-[300px]">
        {count > 2 ? <Side slide={at(-1)} side="left" onClick={() => go(-1)} /> : null}
        <Card slide={at(0)} key={index} />
        {count > 1 ? <Side slide={at(1)} side="right" onClick={() => go(1)} /> : null}

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="glass absolute left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink hover:bg-wash/10 md:flex lg:left-6"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="glass absolute right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink hover:bg-wash/10 md:flex lg:right-6"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="Choose a slide">
          {slides.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.title}
              onClick={() => setIndex(i)}
              className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-ink/80" : "w-1.5 bg-wash/25 hover:bg-wash/40")}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Media({ slide, play }: { slide: HeroSlide; play: boolean }) {
  if (slide.video) {
    return play ? (
      <video
        src={slide.video.src}
        poster={slide.video.poster}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        aria-hidden
      />
    ) : (
      <img src={slide.video.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
    );
  }
  if (slide.image) return <img src={slide.image} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />;
  const art = ART[slide.art ?? "campaign"];
  return (
    <div className={cn("absolute inset-0 flex items-center justify-end pr-10", art.bg)} aria-hidden>
      {art.icon}
    </div>
  );
}

function Card({ slide }: { slide: HeroSlide }) {
  return (
    <Link
      href={slide.href}
      className="group relative z-10 h-full w-full max-w-[640px] overflow-hidden rounded-2xl border border-wash/10 shadow-2xl sm:w-[74%] lg:w-[46%]"
    >
      <Media slide={slide} play />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(0,0,0,0.85))]" />
      <div className="absolute inset-x-0 bottom-0 p-5 text-center sm:p-6">
        <p className="text-xl font-bold text-white drop-shadow sm:text-2xl">{slide.title}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-white/75 sm:text-sm">{slide.subtitle}</p>
      </div>
    </Link>
  );
}

function Side({ slide, side, onClick }: { slide: HeroSlide; side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={-1}
      aria-hidden
      className={cn(
        "absolute top-1/2 hidden h-[80%] w-[30%] -translate-y-1/2 overflow-hidden rounded-2xl opacity-60 transition-opacity hover:opacity-80 lg:block",
        side === "left" ? "left-0 [transform:translateY(-50%)_perspective(900px)_rotateY(12deg)]" : "right-0 [transform:translateY(-50%)_perspective(900px)_rotateY(-12deg)]",
      )}
    >
      <Media slide={slide} play={false} />
      <div className="absolute inset-0 bg-black/40" />
      <p className="absolute inset-x-0 bottom-4 px-4 text-center text-lg font-semibold text-white/90">{slide.title}</p>
    </button>
  );
}
