"use client";

import { Archive, ArchiveRestore, Check, Coins, FolderOpen, Library, Pencil, Plus, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { callApi } from "@/components/landing/order-events";
import { STUDIO_COMMANDS } from "@/components/landing/studio-demo";
import { AnimatedAIChat, type AnimatedAIChatHandle } from "@/components/ui/animated-ai-chat";

import { ContextBar, type ContextOptions, type StudioContext } from "./context-bar";
import { formatKES } from "@/lib/money";
import type { CatalogueModel } from "@/lib/generation-models";
import type { Pricing } from "@/lib/pricing";
import { interpret } from "@/lib/studio-intent";
import { cn } from "@/lib/utils";

import { BuyCredits } from "./buy-credits";
import { AssistantText, GenerationCard, QuoteCard, quoteCost, UserBubble } from "./message-cards";
import type { Balances, MessageView, QuoteMeta, ThreadDetail, ThreadSummary } from "./types";

/**
 * The Video Studio: projects on the left, the chat in the middle, credits up
 * top. Every action is a small API call (src/app/api/studio/**); generations
 * run on the worker, so cards poll until their asset is READY or FAILED.
 */
export function StudioApp({
  initialThreads,
  initialDetail,
  initialBalances,
  pricing,
  models,
  canBuy,
  initialDraft,
  contextOptions,
  initialContext,
  canAutomate,
}: {
  initialThreads: ThreadSummary[];
  initialDetail: ThreadDetail | null;
  initialBalances: Balances;
  /** The price list in force, so quotes here match what the server charges */
  pricing: Pricing;
  /** The enabled models customers can pick (Platform admin → AI & credits) */
  models: CatalogueModel[];
  canBuy: boolean;
  /** Text carried over from the dashboard's prompt bar, placed in the composer (not sent). */
  initialDraft?: string;
  /** Templates, characters and campaigns the prompt can draw on */
  contextOptions?: ContextOptions;
  initialContext?: Partial<StudioContext>;
  /** The person may set up Autopilot (permission and module) */
  canAutomate?: boolean;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [detail, setDetail] = useState<ThreadDetail | null>(initialDetail);
  const [balances, setBalances] = useState<Balances>(initialBalances);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyNeed, setBuyNeed] = useState<number | null>(null);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [ctx, setCtx] = useState<StudioContext>({
    templateId: initialContext?.templateId ?? null,
    characterIds: initialContext?.characterIds ?? [],
    campaignId: initialContext?.campaignId ?? null,
    brandId: initialContext?.brandId ?? null,
    productId: initialContext?.productId ?? null,
  });
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const chatRef = useRef<AnimatedAIChatHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeId = detail?.thread.id ?? null;
  const messages = detail?.messages ?? [];

  const loadThreads = useCallback(async (archived: boolean, q: string) => {
    const params = new URLSearchParams();
    if (archived) params.set("archived", "1");
    if (q) params.set("q", q);
    const r = await callApi<ThreadSummary[]>(`/api/studio/threads?${params}`);
    if (r.data) setThreads(r.data);
  }, []);

  const refreshBalances = useCallback(async () => {
    const r = await callApi<{ balance: Balances }>("/api/billing/wallet");
    if (r.data) setBalances(r.data.balance);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadThreads(showArchived, query.trim()), 250);
    return () => clearTimeout(t);
  }, [showArchived, query, loadThreads]);

  // Keep the conversation pinned to its newest message. Only the message list
  // scrolls; the page itself never jumps.
  const scrollToEnd = useCallback((smooth = true) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);
  useEffect(() => scrollToEnd(false), [activeId, scrollToEnd]);
  useEffect(() => scrollToEnd(), [messages.length, scrollToEnd]);
  const onMediaLoaded = useCallback(() => {
    const el = listRef.current;
    // Follow new media only if the reader is already near the bottom.
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 400) scrollToEnd();
  }, [scrollToEnd]);

  // Poll generations that are still running.
  const running = useMemo(() => messages.filter((m) => m.asset?.status === "GENERATING").map((m) => m.id), [messages]);
  useEffect(() => {
    if (running.length === 0) return;
    const t = setInterval(async () => {
      if (document.hidden) return; // nobody is looking; catch up when the tab returns
      const updates = await Promise.all(running.map((id) => callApi<MessageView>(`/api/studio/messages/${id}`)));
      const byId = new Map(updates.filter((u) => u.data).map((u) => [u.data!.id, u.data!]));
      setDetail((d) => (d ? { ...d, messages: d.messages.map((m) => byId.get(m.id) ?? m) } : d));
      // A failure refunds credits; refresh the chip (and the project counts) when anything finishes.
      if ([...byId.values()].some((m) => m.asset?.status !== "GENERATING")) {
        void refreshBalances();
        void loadThreads(showArchived, query.trim());
      }
    }, 4000);
    return () => clearInterval(t);
  }, [running, refreshBalances, loadThreads, showArchived, query]);

  const openThread = async (id: string) => {
    setError(null);
    const r = await callApi<ThreadDetail>(`/api/studio/threads/${id}`);
    if (r.error) {
      setError(r.error);
      return;
    }
    setDetail(r.data!);
    setProjectsOpen(false);
    router.replace(`/content?project=${id}`, { scroll: false });
  };

  const newThread = async (): Promise<string | null> => {
    const r = await callApi<{ id: string; title: string }>("/api/studio/threads", { method: "POST", body: JSON.stringify({}) });
    if (r.error) {
      setError(r.error);
      return null;
    }
    setDetail({ thread: { id: r.data!.id, title: r.data!.title, archived: false }, order: null, messages: [] });
    setThreads((prev) => [{ id: r.data!.id, title: r.data!.title, updatedAt: new Date().toISOString(), archived: false, clips: 0 }, ...prev]);
    setProjectsOpen(false);
    router.replace(`/content?project=${r.data!.id}`, { scroll: false });
    chatRef.current?.focus();
    return r.data!.id;
  };

  const appendMessages = (list: MessageView[]) =>
    setDetail((d) => (d ? { ...d, messages: [...d.messages, ...list] } : d));

  const replaceMessage = (m: MessageView) =>
    setDetail((d) => (d ? { ...d, messages: d.messages.map((x) => (x.id === m.id ? m : x)) } : d));

  const send = async (text: string) => {
    setError(null);
    const threadId = activeId ?? (await newThread());
    if (!threadId) throw new Error("no project");
    const r = await callApi<MessageView[]>(`/api/studio/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        text,
        templateId: ctx.templateId,
        characterIds: ctx.characterIds,
        campaignId: ctx.campaignId,
        brandId: ctx.brandId,
        productId: ctx.productId,
        // undefined (never chosen) is left out so the server picks the product's or a character's picture
        ...(ctx.startImage !== undefined ? { startImage: ctx.startImage } : {}),
      }),
    });
    if (r.error) {
      setError(r.error);
      throw new Error(r.error);
    }
    appendMessages(r.data!);
    void loadThreads(showArchived, query.trim());
  };

  const patchQuote = async (id: string, patch: Partial<Pick<QuoteMeta, "seconds" | "aspectRatio" | "prompt" | "mode" | "modelKey">>) => {
    const r = await callApi<MessageView>(`/api/studio/messages/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (r.error) setError(r.error);
    else replaceMessage(r.data!);
  };

  const generate = async (id: string) => {
    setError(null);
    const r = await callApi<MessageView>(`/api/studio/messages/${id}/generate`, { method: "POST", body: JSON.stringify({}) });
    if (r.error) {
      setError(r.error);
      void refreshBalances();
      return;
    }
    replaceMessage(r.data!);
    void refreshBalances();
  };

  const derive = async (assetId: string, mode: "animate" | "extend") => {
    const r = await callApi<MessageView>("/api/studio/derive", { method: "POST", body: JSON.stringify({ assetId, mode }) });
    if (r.error) setError(r.error);
    else appendMessages([r.data!]);
  };

  const improve = async (assetId: string, suggestions: string) => {
    setError(null);
    const r = await callApi<MessageView>("/api/studio/improve", { method: "POST", body: JSON.stringify({ assetId, suggestions }) });
    if (r.error) setError(r.error);
    else appendMessages([r.data!]);
  };

  const again = async (id: string) => {
    const r = await callApi<MessageView>(`/api/studio/messages/${id}/again`, { method: "POST", body: JSON.stringify({}) });
    if (r.error) setError(r.error);
    else appendMessages([r.data!]);
  };

  const setArchived = async (archived: boolean) => {
    if (!detail) return;
    const r = await callApi<{ archived: boolean }>(`/api/studio/threads/${detail.thread.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    });
    if (r.error) {
      setError(r.error);
      return;
    }
    setDetail({ ...detail, thread: { ...detail.thread, archived } });
    void loadThreads(showArchived, query.trim());
  };

  const rename = async (raw: string) => {
    if (!detail) return;
    const title = raw.trim();
    setRenaming(null);
    if (!title || title === detail.thread.title) return;
    const r = await callApi<{ title: string }>(`/api/studio/threads/${detail.thread.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    if (r.error) setError(r.error);
    else {
      setDetail({ ...detail, thread: { ...detail.thread, title: r.data!.title } });
      void loadThreads(showArchived, query.trim());
    }
  };

  const openBuy = (need: number | null) => {
    if (!canBuy) {
      setError("Ask an owner or brand manager in your organisation to top up credits.");
      return;
    }
    setBuyNeed(need);
    setBuyOpen(true);
  };

  const live = useMemo(() => {
    if (!draft.trim()) return null;
    const { command, meta } = interpret(draft);
    if (command === "quote" || command === "help") return null;
    try {
      return quoteCost(pricing, models, { ...meta, modelKey: null });
    } catch {
      return null;
    }
  }, [draft, pricing, models]);

  return (
    <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[272px_minmax(0,1fr)]">
      {/* ── Projects ─────────────────────────────────────────── */}
      <aside
        id="studio-projects"
        className={cn("min-h-0 flex-col overflow-hidden border-line bg-surface lg:flex lg:border-r", projectsOpen ? "flex max-h-[70vh] border-b" : "hidden")}
        aria-label="Projects"
      >
        <div className="space-y-3 border-b border-line p-3">
          <button type="button" className="btn-primary w-full" onClick={() => void newThread()}>
            <Plus className="h-4 w-4" /> New project
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <label className="sr-only" htmlFor="project-search">Search projects</label>
            <input
              id="project-search"
              className="input pl-9"
              placeholder="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex rounded-lg bg-surface p-0.5 text-xs">
            {[false, true].map((a) => (
              <button
                key={String(a)}
                type="button"
                className={cn("min-h-[32px] flex-1 rounded-md", showArchived === a ? "bg-raised font-medium text-ink shadow-sm" : "text-muted")}
                onClick={() => setShowArchived(a)}
                aria-pressed={showArchived === a}
              >
                {a ? "Archived" : "Active"}
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {showArchived ? "No archived projects." : "No projects yet. Describe a video to start one."}
            </li>
          )}
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void openThread(t.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  t.id === activeId ? "bg-primary/10 text-ink" : "text-ink hover:bg-surface",
                )}
                aria-current={t.id === activeId ? "true" : undefined}
              >
                <span className="line-clamp-1 font-medium">{t.title}</span>
                <span className="text-xs text-muted">
                  {t.clips} item{t.clips === 1 ? "" : "s"} · {new Date(t.updatedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          <Link href="/content/assets" className="btn-quiet w-full">
            <Library className="h-4 w-4" /> Media library
          </Link>
        </div>
      </aside>

      {/* ── Chat ─────────────────────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-quiet min-h-[36px] px-3 text-xs lg:hidden"
            onClick={() => setProjectsOpen((o) => !o)}
            aria-expanded={projectsOpen}
            aria-controls="studio-projects"
          >
            <FolderOpen className="h-4 w-4" /> Projects ({threads.length})
          </button>
          <div className="mr-auto min-w-0 basis-full sm:basis-auto">
            {renaming !== null ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void rename(renaming);
                }}
              >
                <label className="sr-only" htmlFor="rename-project">Project name</label>
                <input
                  id="rename-project"
                  autoFocus
                  className="input min-h-[36px] py-1"
                  value={renaming}
                  maxLength={120}
                  onChange={(e) => setRenaming(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                />
                <button type="submit" className="btn-primary min-h-[36px] px-3" aria-label="Save name"><Check className="h-4 w-4" /></button>
                <button type="button" className="btn-quiet min-h-[36px] px-3" aria-label="Cancel" onClick={() => setRenaming(null)}><X className="h-4 w-4" /></button>
              </form>
            ) : (
              <h2 className="line-clamp-1 text-lg font-semibold text-ink">{detail?.thread.title ?? "New project"}</h2>
            )}
            {detail && renaming === null && (
              <div className="flex gap-3 text-xs text-muted">
                <button type="button" className="inline-flex min-h-[28px] items-center gap-1 hover:text-ink" onClick={() => setRenaming(detail.thread.title)}>
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </button>
                <button type="button" className="inline-flex min-h-[28px] items-center gap-1 hover:text-ink" onClick={() => void setArchived(!detail.thread.archived)}>
                  {detail.thread.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {detail.thread.archived ? "Restore" : "Archive"}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2" aria-label="Credit balance">
            {balances.unmetered ? (
              <span className="rounded-full border border-line bg-raised px-3 py-1.5 text-xs text-muted">Internal plan: credits not charged</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-xs text-ink">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> {balances.credits.toLocaleString("en-KE")} credits
              </span>
            )}
            {canBuy && !balances.unmetered && (
              <button type="button" className="btn-quiet min-h-[36px] px-3 text-xs" onClick={() => openBuy(null)}>
                <Coins className="h-4 w-4" /> Top up
              </button>
            )}
          </div>
        </div>

        {detail?.order && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
            Producing order <Link href={`/app/orders/${detail.order.id}`} className="font-semibold underline">{detail.order.number}</Link> for{" "}
            {detail.order.customerName}:{" "}
            {detail.order.kind === "VIDEO" ? `a ${detail.order.videoSeconds}-second video` : `${detail.order.imageTokens} image(s)`}. Finished
            files are attached to the order.
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {contextOptions ? <ContextBar options={contextOptions} value={ctx} onChange={setCtx} disabled={detail?.thread.archived ?? false} /> : null}
        <AnimatedAIChat
          ref={chatRef}
          commands={STUDIO_COMMANDS}
          onSend={send}
          onDraftChange={setDraft}
          disabled={detail?.thread.archived ?? false}
          placeholder={detail?.thread.archived ? "Restore this project to keep working" : "Describe a video, or type / for commands"}
          assistantName="Studio"
          className="min-h-0 flex-1 rounded-2xl border border-line px-3 py-4 sm:px-6"
          hideChips={messages.length > 0}
          footer={
            live ? (
              <p className="text-center text-xs text-ink/50" aria-live="polite">
                Quote on send: {live.credits} credits ({formatKES(live.cents)} at the pay-as-you-go rate). Nothing is charged until you press Generate.
              </p>
            ) : null
          }
        >
          <div ref={listRef} className="min-h-[200px] flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
            {messages.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-lg text-ink/80">What are we making?</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink/50">
                  Describe a scene. Say how long (&ldquo;15 seconds&rdquo;) and which shape (&ldquo;vertical&rdquo;). You will see the
                  credit cost before anything is generated.
                </p>
                {canAutomate && (
                  <div className="mx-auto mt-6 grid max-w-xl gap-2 text-left sm:grid-cols-2">
                    <a href="/app/autopilot/new" className="rounded-xl border border-line p-3 transition-colors hover:border-primary/50">
                      <span className="block text-sm font-medium text-ink">Show off a product every week</span>
                      <span className="block text-xs text-ink/50">Autopilot makes the post and asks you before it goes out.</span>
                    </a>
                    <a href="/app/autopilot" className="rounded-xl border border-line p-3 transition-colors hover:border-primary/50">
                      <span className="block text-sm font-medium text-ink">See what Autopilot has made</span>
                      <span className="block text-xs text-ink/50">Approve waiting posts and check what went out.</span>
                    </a>
                  </div>
                )}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id}>
                {m.role === "USER" ? (
                  <UserBubble text={m.body} />
                ) : m.asset ? (
                  <GenerationCard
                    asset={m.asset}
                    onDerive={(mode) => derive(m.asset!.id, mode)}
                    onAgain={() => again(m.id)}
                    onImprove={(text) => improve(m.asset!.id, text)}
                    onAutomate={canAutomate ? () => router.push(`/app/autopilot/new?asset=${m.asset!.id}`) : undefined}
                    onMediaLoaded={onMediaLoaded}
                  />
                ) : m.kind === "QUOTE" && m.meta ? (
                  <QuoteCard
                    pricing={pricing}
                    models={models}
                    message={m}
                    balances={balances}
                    onPatch={(p) => patchQuote(m.id, p)}
                    onGenerate={() => generate(m.id)}
                    onBuy={(need) => openBuy(need)}
                    producingOrder={detail?.order?.number ?? null}
                  />
                ) : (
                  <AssistantText text={m.body} />
                )}
              </div>
            ))}
          </div>
        </AnimatedAIChat>
      </section>

      <BuyCredits open={buyOpen} onClose={() => setBuyOpen(false)} onBalances={setBalances} short={buyNeed} />
    </div>
  );
}
