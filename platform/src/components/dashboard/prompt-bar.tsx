"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The floating "describe it" bar. It does not spend anything: it carries the
 * text to the Studio, where the quote is shown before any token is used.
 */
export function PromptBar({ tokens }: { tokens: { credits: number; unmetered: boolean } | null }) {
  const router = useRouter();
  const [text, setText] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = text.trim();
    router.push(prompt ? `/content?prompt=${encodeURIComponent(prompt)}` : "/content");
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:pl-[232px]">
      <form
        onSubmit={submit}
        className="glass pointer-events-auto flex w-full max-w-[640px] items-center gap-3 rounded-2xl p-2.5 pl-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <label htmlFor="dashboard-prompt" className="sr-only">
          Describe the ad you want to make
        </label>
        <input
          id="dashboard-prompt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the ad you want to make…"
          maxLength={2000}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        {tokens ? (
          <span className="pill-gradient hidden h-8 text-sm sm:inline-flex" title="Credits in your wallet">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {tokens.unmetered ? "∞" : tokens.credits.toLocaleString("en-KE")}
          </span>
        ) : null}
        <button
          type="submit"
          aria-label="Open in the Studio"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-onprimary hover:bg-primary/85"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
