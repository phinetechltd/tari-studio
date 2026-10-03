"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * A silent looping clip that only downloads and plays while it is on screen,
 * so a page with twenty of them stays light. People who ask their system for
 * reduced motion see the poster, never an autoplaying video.
 */
export function LazyVideo({
  src,
  poster,
  label,
  className,
  eager,
}: {
  src: string;
  poster?: string;
  label: string;
  className?: string;
  /** Start straight away (the hero), instead of when scrolled into view */
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const play = () => {
      if (!video.src) video.src = src;
      void video.play().catch(() => undefined);
    };
    if (eager) {
      play();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) play();
        else video.pause();
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [src, eager]);

  return (
    <video
      ref={ref}
      poster={poster}
      className={cn("bg-black object-cover", className)}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
    />
  );
}
