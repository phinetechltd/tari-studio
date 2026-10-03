"use client";

import { Bot, Check, CheckCheck, CircleAlert, Clock, MessageCircle, Pause, Play, Search, Send, Sparkles, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { callApi } from "@/components/json-form";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/automation-rules";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

export interface ConversationRow {
  id: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string | Date | null;
  lastMessagePreview: string | null;
  contact: { id: string; name: string | null; phone: string; stage: string; campaign: { id: string; name: string } | null };
  channel: { id: string; name: string; handle: string | null };
}

export interface MessageRow {
  id: string;
  direction: "IN" | "OUT" | string;
  type: string;
  body: string | null;
  status: string;
  error: string | null;
  author: string | null;
  createdAt: string | Date;
}

export interface ConversationDetail {
  id: string;
  status: string;
  automationsPaused: boolean;
  lastInboundAt: string | Date | null;
  contact: { id: string; name: string | null; phone: string; stage: string; notes: string | null; campaign: { id: string; name: string } | null };
  channel: { id: string; name: string; handle: string | null; status: string };
  messages: MessageRow[];
}

interface Props {
  initialConversations: ConversationRow[];
  initialDetail: { conversation: ConversationDetail; canReply: boolean } | null;
  whatsappChannels: Array<{ id: string; name: string }>;
  simulator: boolean;
  canReply: boolean;
  canEditLead: boolean;
  canUseAi: boolean;
}

const time = new Intl.DateTimeFormat("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
const day = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

function when(d: string | Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  return Date.now() - date.getTime() < 86_400_000 ? time.format(date) : day.format(date);
}

function initials(name: string | null, phone: string) {
  if (name) return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return phone.slice(-2);
}

export function InboxApp(props: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [conversations, setConversations] = useState(props.initialConversations);
  const [detail, setDetail] = useState(props.initialDetail);
  const [filter, setFilter] = useState<"OPEN" | "CLOSED" | "">("OPEN");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeId = detail?.conversation.id ?? null;

  const loadList = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filter) qs.set("status", filter);
    if (query.trim()) qs.set("q", query.trim());
    const r = await callApi<{ conversations: ConversationRow[] }>(`/api/inbox?${qs}`, "GET");
    if (r.ok && r.data) setConversations(r.data.conversations);
  }, [filter, query]);

  const loadDetail = useCallback(async (id: string) => {
    const r = await callApi<{ conversation: ConversationDetail; canReply: boolean }>(`/api/inbox/${id}`, "GET");
    if (r.ok && r.data) setDetail(r.data);
    return r;
  }, []);

  // Search and filter (debounced), then keep the list fresh.
  useEffect(() => {
    const t = setTimeout(() => void loadList(), 250);
    return () => clearTimeout(t);
  }, [loadList]);
  useEffect(() => {
    const t = setInterval(() => {
      void loadList();
      if (activeId) void loadDetail(activeId);
    }, 8000);
    return () => clearInterval(t);
  }, [loadList, loadDetail, activeId]);

  // Braces matter: newer browsers return a Promise from scrollIntoView, and an
  // effect must return nothing or a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.conversation.messages.length, activeId]);

  const open = async (id: string) => {
    setError(null);
    setDraft("");
    const r = await loadDetail(id);
    if (!r.ok) setError(r.error?.message ?? "Could not open the conversation.");
    const qs = new URLSearchParams(params.toString());
    qs.set("c", id);
    router.replace(`/app/inbox?${qs}`, { scroll: false });
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
  };

  const send = async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    setError(null);
    const r = await callApi(`/api/inbox/${activeId}/messages`, "POST", { text: draft });
    setSending(false);
    if (!r.ok) return setError(r.error?.message ?? "The message was not sent.");
    setDraft("");
    await Promise.all([loadDetail(activeId), loadList()]);
  };

  const suggest = async () => {
    if (!activeId) return;
    setSuggesting(true);
    setError(null);
    const r = await callApi<{ text: string }>(`/api/inbox/${activeId}/suggest`, "POST", {});
    setSuggesting(false);
    if (!r.ok || !r.data) return setError(r.error?.message ?? "No suggestion came back.");
    setDraft(r.data.text);
  };

  const patchConversation = async (body: { status?: "OPEN" | "CLOSED"; automationsPaused?: boolean }) => {
    if (!activeId) return;
    const r = await callApi(`/api/inbox/${activeId}`, "PATCH", body);
    if (!r.ok) return setError(r.error?.message ?? "Could not update the conversation.");
    await Promise.all([loadDetail(activeId), loadList()]);
  };

  const setStage = async (stage: Stage) => {
    if (!detail) return;
    const r = await callApi(`/api/leads/${detail.conversation.contact.id}`, "PATCH", { stage });
    if (!r.ok) return setError(r.error?.message ?? "Could not change the stage.");
    await loadDetail(detail.conversation.id);
  };

  if (props.whatsappChannels.length === 0 && conversations.length === 0) {
    return (
      <div className="panel flex flex-col items-center px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <MessageCircle className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">Connect a WhatsApp number to start</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          Customers who message your WhatsApp Business number land here, with the campaign that brought them. Replies,
          AI suggestions and automations all go out from the same number.
        </p>
        <Link href="/app/social/new" className="btn-primary mt-6">
          Connect WhatsApp
        </Link>
      </div>
    );
  }

  const c = detail?.conversation ?? null;

  return (
    <div className="grid min-h-[calc(100dvh-170px)] gap-4 lg:grid-cols-[340px_1fr]">
      {/* ── conversation list ─────────────────────────────────── */}
      <aside className={cn("card flex min-h-0 flex-col overflow-hidden", c && "hidden lg:flex")}>
        <div className="space-y-2 border-b border-wash/[0.06] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or number" className="input !min-h-[38px] pl-9" aria-label="Search conversations" />
          </div>
          <div className="flex gap-1" role="tablist" aria-label="Filter">
            {([["OPEN", "Open"], ["CLOSED", "Closed"], ["", "All"]] as const).map(([v, label]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={filter === v}
                onClick={() => setFilter(v)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === v ? "bg-wash/10 text-ink" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted">No conversations here.</li>
          ) : (
            conversations.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => void open(row.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-wash/[0.04] px-3 py-3 text-left transition-colors hover:bg-wash/[0.04]",
                    row.id === activeId && "bg-wash/[0.07]",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wash/10 text-sm font-semibold">
                    {initials(row.contact.name, row.contact.phone)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", row.unreadCount ? "font-semibold text-ink" : "text-ink/90")}>
                        {row.contact.name ?? formatPhone(row.contact.phone)}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted">{when(row.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="truncate text-xs text-muted">{row.lastMessagePreview}</span>
                      {row.unreadCount ? (
                        <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 text-[10px] font-bold text-black">
                          {row.unreadCount}
                        </span>
                      ) : null}
                    </span>
                    {row.contact.campaign ? <span className="mt-1 inline-block truncate text-[11px] text-primary">↳ {row.contact.campaign.name}</span> : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        {props.simulator && props.canReply && props.whatsappChannels.length > 0 ? (
          <SimulatePanel channels={props.whatsappChannels} onSent={loadList} />
        ) : null}
      </aside>

      {/* ── thread ─────────────────────────────────────────────── */}
      <section className={cn("card flex min-h-0 flex-col overflow-hidden", !c && "hidden lg:flex")}>
        {!c ? (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-sm text-muted">
            <MessageCircle className="mb-3 h-8 w-8" />
            Choose a conversation.
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-wash/[0.06] px-4 py-3">
              <button type="button" onClick={() => setDetail(null)} className="btn-ghost -ml-2 min-h-[32px] px-2 lg:hidden" aria-label="Back to conversations">
                ←
              </button>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-wash/10 text-sm font-semibold">
                {initials(c.contact.name, c.contact.phone)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.contact.name ?? formatPhone(c.contact.phone)}</p>
                <p className="truncate text-xs text-muted">
                  {formatPhone(c.contact.phone)} · via {c.channel.name}
                  {c.contact.campaign ? (
                    <>
                      {" · "}
                      <Link href={`/app/campaigns/${c.contact.campaign.id}`} className="text-primary hover:underline">
                        {c.contact.campaign.name}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="lead-stage">
                  Lead stage
                </label>
                <select
                  id="lead-stage"
                  value={c.contact.stage}
                  disabled={!props.canEditLead}
                  onChange={(e) => void setStage(e.target.value as Stage)}
                  className="input !min-h-[34px] !w-auto py-0 text-xs"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
                {props.canReply ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void patchConversation({ automationsPaused: !c.automationsPaused })}
                      className="btn-quiet min-h-[34px] px-3 text-xs"
                      title={c.automationsPaused ? "Automations will answer again" : "Stop automations answering while you handle this"}
                    >
                      {c.automationsPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      {c.automationsPaused ? "Resume automations" : "Pause automations"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void patchConversation({ status: c.status === "OPEN" ? "CLOSED" : "OPEN" })}
                      className="btn-quiet min-h-[34px] px-3 text-xs"
                    >
                      {c.status === "OPEN" ? "Close" : "Reopen"}
                    </button>
                  </>
                ) : null}
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {c.messages.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
              <div ref={endRef} />
            </div>

            {props.canReply ? (
              <div className="border-t border-wash/[0.06] p-3">
                {error ? (
                  <p role="alert" className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {error}
                  </p>
                ) : null}
                {!detail!.canReply ? (
                  <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    <Clock className="h-4 w-4 shrink-0" />
                    The customer last wrote more than 24 hours ago. WhatsApp only allows approved templates until they write again.
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <label htmlFor="reply" className="sr-only">
                      Reply
                    </label>
                    <textarea
                      id="reply"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      rows={Math.min(6, Math.max(1, draft.split("\n").length))}
                      maxLength={4096}
                      placeholder="Write a reply… (Enter sends, Shift+Enter for a new line)"
                      className="input min-h-[44px] flex-1 resize-none py-2.5"
                    />
                    {props.canUseAi ? (
                      <button type="button" onClick={() => void suggest()} disabled={suggesting} className="btn-quiet h-11 px-3" title="Draft a reply from the conversation and your catalogue">
                        <Sparkles className="h-4 w-4" />
                        <span className="hidden sm:inline">{suggesting ? "Thinking…" : "Suggest"}</span>
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} className="btn-primary h-11 px-4" aria-label="Send">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function StatusTick({ status }: { status: string }) {
  if (status === "READ") return <CheckCheck className="h-3.5 w-3.5 text-primary" aria-label="Read" />;
  if (status === "DELIVERED") return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />;
  if (status === "SENT") return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
  if (status === "FAILED") return <CircleAlert className="h-3.5 w-3.5 text-danger" aria-label="Failed" />;
  return <Clock className="h-3.5 w-3.5" aria-label="Sending" />;
}

function Bubble({ m }: { m: MessageRow }) {
  const out = m.direction === "OUT";
  const authorIcon = m.author === "AI" ? <Bot className="h-3 w-3" /> : m.author === "AUTOMATION" ? <Zap className="h-3 w-3" /> : <UserRound className="h-3 w-3" />;
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]",
          out ? "rounded-br-md bg-primary/20 text-ink" : "rounded-bl-md bg-wash/[0.08] text-ink",
          m.status === "FAILED" && "border border-danger/50",
        )}
      >
        {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : <p className="italic text-muted">({m.type})</p>}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-ink/55">
          {out ? (
            <span className="inline-flex items-center gap-0.5">
              {authorIcon}
              {m.author === "AI" ? "AI" : m.author === "AUTOMATION" ? "Automation" : "You"}
            </span>
          ) : null}
          <span>{when(m.createdAt)}</span>
          {out ? <StatusTick status={m.status} /> : null}
        </div>
        {m.status === "FAILED" && m.error ? <p className="mt-1 text-[11px] text-danger">{m.error}</p> : null}
      </div>
    </div>
  );
}

/** Development only: a customer message without a phone, through the real webhook path. */
function SimulatePanel({ channels, onSent }: { channels: Array<{ id: string; name: string }>; onSent: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="border-t border-wash/[0.06] p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-primary hover:underline">
        {open ? "Hide" : "Simulate a customer message"}
      </button>
      {open ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setPending(true);
            setNote(null);
            const r = await callApi<{ messages: number }>("/api/inbox/simulate", "POST", {
              channelId: String(f.get("channelId")),
              from: String(f.get("from")),
              name: String(f.get("name") ?? ""),
              body: String(f.get("body")),
            });
            setPending(false);
            if (!r.ok) return setNote(r.error?.message ?? "Not sent.");
            (e.target as HTMLFormElement).reset();
            setNote("Received. Automations run on the worker within a few seconds.");
            await onSent();
          }}
        >
          <select name="channelId" className="input !min-h-[36px] text-xs" aria-label="WhatsApp number">
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input name="from" required defaultValue="0712 345 678" className="input !min-h-[36px] text-xs" aria-label="Customer phone" />
            <input name="name" defaultValue="Wanjiku" className="input !min-h-[36px] text-xs" aria-label="Customer name" />
          </div>
          <textarea name="body" required rows={2} defaultValue="Hi, what is the price?" className="input text-xs" aria-label="Message" />
          <button type="submit" disabled={pending} className="btn-quiet min-h-[34px] w-full text-xs">
            {pending ? "Sending…" : "Send as customer"}
          </button>
          {note ? <p className="text-[11px] text-muted">{note}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
