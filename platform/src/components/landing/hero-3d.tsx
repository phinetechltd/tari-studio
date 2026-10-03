"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import { SunDisc } from "./afro-art";
import { GUARDIANS } from "./guardian-info";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

/**
 * Loads the three.js scene only in the browser, after the page has painted.
 * While it loads, or if WebGL is missing, a flat turning sun fills the space.
 * A caption names whichever guardian is currently passing in front.
 */
export function Hero3D() {
  const [failed, setFailed] = useState(false);
  const [front, setFront] = useState(0);
  const onFail = useCallback(() => setFailed(true), []);
  const onFront = useCallback((i: number) => setFront(i), []);
  const g = GUARDIANS[front] ?? GUARDIANS[0];

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 flex items-center justify-center">
        <SunDisc className="spin-slow h-[78%] w-[78%] max-w-[520px] opacity-60" />
      </div>
      {failed ? null : (
        <div className="absolute inset-0">
          <HeroScene onFail={onFail} onFront={onFront} />
        </div>
      )}
      {failed ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2" aria-live="off">
          <div key={g.id} className="guardian-caption glass rounded-2xl px-4 py-2 text-center">
            <p className="font-display text-sm font-bold tracking-wide text-primary">
              {g.name} <span className="text-white/50">·</span> {g.meaning}
            </p>
            <p className="text-xs text-white/70">{g.line}</p>
          </div>
        </div>
      )}
    </div>
  );
}
