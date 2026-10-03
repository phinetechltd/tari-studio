"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Fades and lifts its children in the first time they scroll into view.
 * The hidden state lives in CSS behind `@media (scripting: enabled)`, so
 * without JavaScript, or with reduced motion, the content is simply there.
 */
export function Reveal({
  children,
  delay = 0,
  from,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  from?: "left" | "right";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const dir = from === "left" ? "reveal-left" : from === "right" ? "reveal-right" : "";
  return (
    <div ref={ref} className={`reveal ${dir} ${className}`} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
