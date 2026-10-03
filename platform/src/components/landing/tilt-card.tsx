"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

/** A list card that leans toward the mouse in 3D. Touch and reduced-motion users get a flat card. */
export function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLLIElement>(null);

  function move(e: PointerEvent<HTMLLIElement>) {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * 9).toFixed(2)}deg) rotateY(${(x * 11).toFixed(2)}deg) translateZ(6px)`;
  }
  function leave() {
    if (ref.current) ref.current.style.transform = "";
  }

  return (
    <li ref={ref} onPointerMove={move} onPointerLeave={leave} className={`tilt-card ${className}`}>
      {children}
    </li>
  );
}
