"use client";

import { Clapperboard, ImageIcon, MessageSquare } from "lucide-react";
import { useState } from "react";

import { formatKES } from "@/lib/money";
import {
  EXTRAS,
  IMAGE_TOKEN_CENTS,
  MAX_IMAGES_PER_ORDER,
  VIDEO_MAX_SECONDS,
  VIDEO_MIN_SECONDS,
  VIDEO_TOKEN_CENTS,
  videoTokensFor,
} from "@/lib/pricing";

import { prefillOrder } from "./order-events";

/** The price list and a calculator that hands its numbers to the order form. */
export function Pricing() {
  const [images, setImages] = useState(3);
  const [seconds, setSeconds] = useState(15);
  const videoTokens = videoTokensFor(seconds);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Image token */}
      <article className="card flex flex-col p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ImageIcon className="h-5 w-5" />
          </span>
          <h3 className="text-lg font-semibold text-ink">Image token</h3>
        </div>
        <p className="mt-5">
          <span className="text-4xl font-semibold tracking-tight text-ink">{formatKES(IMAGE_TOKEN_CENTS)}</span>
          <span className="ml-1 text-sm text-muted">per image</span>
        </p>
        <p className="mt-2 text-sm text-muted">Posters, product shots, social posts and banners, in the shape you need.</p>

        <div className="mt-6 rounded-lg bg-surface p-4">
          <label className="text-sm font-medium text-ink" htmlFor="calc-images">
            {images} image{images === 1 ? "" : "s"}
          </label>
          <input
            id="calc-images"
            type="range"
            min={1}
            max={MAX_IMAGES_PER_ORDER}
            value={images}
            onChange={(e) => setImages(Number(e.target.value))}
            className="mt-2 w-full accent-[rgb(var(--c-primary))]"
          />
          <p className="mt-2 text-sm text-muted">
            Total <span className="font-semibold tabular-nums text-ink">{formatKES(images * IMAGE_TOKEN_CENTS)}</span>
          </p>
        </div>
        <button
          type="button"
          className="btn-quiet mt-6"
          onClick={() => prefillOrder({ kind: "IMAGE", images })}
        >
          Order {images} image{images === 1 ? "" : "s"}
        </button>
      </article>

      {/* Video token */}
      <article className="card relative flex flex-col border-primary p-6 ring-1 ring-primary">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clapperboard className="h-5 w-5" />
          </span>
          <h3 className="text-lg font-semibold text-ink">Video token</h3>
        </div>
        <p className="mt-5">
          <span className="text-4xl font-semibold tracking-tight text-ink">{formatKES(VIDEO_TOKEN_CENTS)}</span>
          <span className="ml-1 text-sm text-muted">per 10 seconds</span>
        </p>
        <p className="mt-2 text-sm text-muted">Ads, reels and product stories with sound. Charged per started 10 seconds.</p>
        <ul className="mt-4 space-y-1 text-sm text-muted">
          <li className="flex justify-between"><span>5 or 10 seconds</span><span className="tabular-nums text-ink">1 token</span></li>
          <li className="flex justify-between"><span>15 or 20 seconds</span><span className="tabular-nums text-ink">2 tokens</span></li>
          <li className="flex justify-between"><span>30 seconds</span><span className="tabular-nums text-ink">3 tokens</span></li>
        </ul>

        <div className="mt-6 rounded-lg bg-surface p-4">
          <label className="text-sm font-medium text-ink" htmlFor="calc-seconds">
            {seconds} seconds
          </label>
          <input
            id="calc-seconds"
            type="range"
            min={VIDEO_MIN_SECONDS}
            max={VIDEO_MAX_SECONDS}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            className="mt-2 w-full accent-[rgb(var(--c-primary))]"
          />
          <p className="mt-2 text-sm text-muted">
            {videoTokens} video token{videoTokens === 1 ? "" : "s"}, total{" "}
            <span className="font-semibold tabular-nums text-ink">{formatKES(videoTokens * VIDEO_TOKEN_CENTS)}</span>
          </p>
        </div>
        <button type="button" className="btn-primary mt-6" onClick={() => prefillOrder({ kind: "VIDEO", seconds })}>
          Order a {seconds}-second video
        </button>
      </article>

      {/* On request */}
      <article className="card flex flex-col p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </span>
          <h3 className="text-lg font-semibold text-ink">Everything else</h3>
        </div>
        <p className="mt-5">
          <span className="text-2xl font-semibold tracking-tight text-ink">Price on request</span>
        </p>
        <ul className="mt-4 flex-1 space-y-3">
          {EXTRAS.map((x) => (
            <li key={x.key} className="text-sm">
              <span className="font-medium text-ink">{x.label}</span>
              <span className="block text-muted">{x.description}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-quiet mt-6" onClick={() => prefillOrder({ kind: "QUOTE" })}>
          Get a quote
        </button>
      </article>
    </div>
  );
}
