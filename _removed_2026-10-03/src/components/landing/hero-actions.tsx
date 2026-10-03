"use client";

import { ArrowRight } from "lucide-react";

import { formatKES } from "@/lib/money";
import { IMAGE_TOKEN_CENTS, VIDEO_TOKEN_CENTS } from "@/lib/pricing";

import { prefillOrder } from "./order-events";

export function HeroActions() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        className="btn-primary whitespace-nowrap px-6"
        onClick={() => prefillOrder({ kind: "IMAGE", images: 1 })}
      >
        Order an image
        <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-semibold">{formatKES(IMAGE_TOKEN_CENTS)}</span>
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="btn-quiet whitespace-nowrap px-6"
        onClick={() => prefillOrder({ kind: "VIDEO", seconds: 10 })}
      >
        Order a video
        <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
          {formatKES(VIDEO_TOKEN_CENTS)} / 10 s
        </span>
      </button>
    </div>
  );
}
