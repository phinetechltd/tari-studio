"use client";

import { Clapperboard, FastForward, ImageIcon, MessageSquare, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AnimatedAIChat, type CommandSuggestion } from "@/components/ui/animated-ai-chat";
import { formatKES } from "@/lib/money";
import type { Pricing } from "@/lib/pricing";
import { costOf, interpret, type Intent } from "@/lib/studio-intent";

import { prefillOrder } from "./order-events";

/**
 * The Studio's chat on the landing page. It quotes exactly what the real Studio
 * would (the same parser and prices), but generates nothing: a visitor can turn
 * the quote into an order, or sign in to use the Studio itself.
 */

interface Turn {
  id: number;
  user: string;
  reply: { kind: "quote"; intent: Intent } | { kind: "text"; text: string };
  example?: { src: string; poster: string; label: string };
}

export const STUDIO_COMMANDS: CommandSuggestion[] = [
  { icon: <Clapperboard className="h-4 w-4" />, label: "Video", description: "A clip from a description", prefix: "/video" },
  { icon: <ImageIcon className="h-4 w-4" />, label: "Image", description: "A still image", prefix: "/image" },
  { icon: <Wand2 className="h-4 w-4" />, label: "Animate", description: "Bring an image to life", prefix: "/animate" },
  { icon: <FastForward className="h-4 w-4" />, label: "Extend", description: "Continue the last clip", prefix: "/extend" },
  { icon: <MessageSquare className="h-4 w-4" />, label: "Quote", description: "Voice-over, music, captions", prefix: "/quote" },
];

function describe(intent: Intent): string {
  if (intent.mode === "image") return `A ${intent.aspectRatio} image`;
  if (intent.mode === "animate") return `A ${intent.seconds}-second animation of your image`;
  if (intent.mode === "extend") return `${intent.seconds} more seconds of your clip`;
  return `A ${intent.seconds}-second ${intent.aspectRatio} video`;
}

const FIRST: Turn = {
  id: 0,
  user: "/video Tenants top up their own prepaid meters by M-Pesa while the landlord relaxes, 5 seconds, 16:9",
  reply: {
    kind: "quote",
    intent: {
      mode: "video",
      prompt: "Tenants top up their own prepaid meters by M-Pesa while the landlord relaxes",
      seconds: 5,
      aspectRatio: "16:9",
    },
  },
  example: { src: "/showcase/tari-spot-5s.mp4", poster: "/showcase/tari-spot-5s.jpg", label: "Example output: the 5-second spot made for Tari" },
};

export function StudioDemo({ pricing }: { pricing: Pricing }) {
  const [turns, setTurns] = useState<Turn[]>([FIRST]);
  const [draft, setDraft] = useState("");

  const live = useMemo(() => {
    if (!draft.trim()) return null;
    const { command, meta } = interpret(draft);
    if (command === "quote" || command === "help") return null;
    try {
      return { meta, cost: costOf(pricing, meta) };
    } catch {
      return null;
    }
  }, [draft, pricing]);

  const onSend = (text: string) => {
    const { command, meta } = interpret(text);
    const reply: Turn["reply"] =
      command === "quote"
        ? { kind: "text", text: "Voice-over, music, captions, subtitles and resizes are priced on request. Use the quote form below and we will reply with a price." }
        : command === "help"
          ? { kind: "text", text: "Try /video or /image followed by what you want. Add a length (“15 seconds”) or a shape (“vertical”)." }
          : meta.prompt.length < 3
            ? { kind: "text", text: "Describe what you want after the command." }
            : { kind: "quote", intent: meta };
    setTurns((prev) => [...prev.slice(-3), { id: Date.now(), user: text, reply }]);
  };

  return (
    <AnimatedAIChat
      headline="Make it by chatting"
      subline="Type an idea. The Studio works out the length, the shape and the price before anything is made."
      placeholder="/video a boda boda rider delivers a meter to a landlord, 15 seconds, vertical"
      commands={STUDIO_COMMANDS}
      onSend={onSend}
      onDraftChange={setDraft}
      assistantName="Studio"
      className="rounded-3xl px-4 py-10 sm:px-8 sm:py-14"
      footer={
        live ? (
          <p className="text-center text-sm text-white/60" aria-live="polite">
            {describe(live.meta)}: {live.cost.credits} credits, <span className="font-medium text-white">{formatKES(live.cost.cents)}</span>
          </p>
        ) : null
      }
    >
      <div className="space-y-5" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-wash/[0.08] px-4 py-3 text-sm text-white/90">
              {t.user}
            </div>
            <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-wash/[0.08] bg-wash/[0.03] p-4 text-sm text-white/80">
              {t.reply.kind === "text" ? (
                <p>{t.reply.text}</p>
              ) : (
                <QuoteCard intent={t.reply.intent} pricing={pricing} />
              )}
              {t.example && (
                <figure className="mt-4 max-w-md">
                  <video
                    src={t.example.src}
                    poster={t.example.poster}
                    className="aspect-video w-full rounded-xl bg-black object-cover"
                    muted
                    loop
                    playsInline
                    autoPlay
                    preload="metadata"
                  />
                  <figcaption className="mt-2 text-xs text-white/50">{t.example.label}</figcaption>
                </figure>
              )}
            </div>
          </div>
        ))}
      </div>
    </AnimatedAIChat>
  );
}

function QuoteCard({ intent, pricing }: { intent: Intent; pricing: Pricing }) {
  const cost = costOf(pricing, intent);
  const isVideo = intent.mode !== "image";
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40">Quote</p>
      <p className="mt-1 text-white/90">{describe(intent)}</p>
      <p className="mt-1 text-white/60">&ldquo;{intent.prompt}&rdquo;</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs text-violet-200">
          {cost.credits} credits
        </span>
        <span className="rounded-full bg-wash/[0.08] px-3 py-1 text-xs text-white">{formatKES(cost.cents)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            prefillOrder({
              kind: isVideo ? "VIDEO" : "IMAGE",
              seconds: intent.seconds ?? undefined,
              images: isVideo ? undefined : 1,
              brief: intent.prompt,
              aspectRatio: intent.aspectRatio,
            })
          }
          className="min-h-[40px] rounded-lg bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-wash/90"
        >
          Order this {isVideo ? "video" : "image"}
        </button>
        <Link
          href="/login"
          className="flex min-h-[40px] items-center rounded-lg border border-wash/15 px-4 text-sm text-white/80 hover:bg-wash/[0.06]"
        >
          Make it yourself in the Studio
        </Link>
      </div>
    </div>
  );
}
