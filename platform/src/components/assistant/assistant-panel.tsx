"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";

/**
 * The assistant chat screen. Threads are listed on the left, the active chat on the right.
 * Proposals the assistant prepares show under its message with Apply / Dismiss; links open
 * the thing it prepared (for example a prompt in the Studio).
 */

interface ProposalView {
  id: string;
  summary: string;
  kind: "change" | "link";
  href: string | null;
  status: string;
  error: string | null;
}

interface MessageView {
  id: string;
  role: "USER" | "ASSISTANT";
  text: string;
  attachments: number;
  createdAt: string;
  proposals: ProposalView[];
}

interface ThreadView {
  id: string;
  title: string;
}

interface ThreadDetail {
  thread: ThreadView;
  messages: MessageView[];
}

interface SendResult {
  thread: ThreadView;
  messages: MessageView[];
}

/** Same envelope as callApi, for multipart bodies (pictures attached). */
async function postForm<T>(url: string, form: FormData): Promise<{ ok: boolean; status: number; data?: T; error?: { message: string } }> {
  try {
    const res = await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
    const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message: string } } | null;
    if (json && typeof json.ok === "boolean") return { ...json, status: res.status };
    return { ok: false, status: res.status, error: { message: "The server sent an unexpected response." } };
  } catch {
    return { ok: false, status: 0, error: { message: "Could not reach the server. Check your connection and try again." } };
  }
}

const statusLabel: Record<string, string> = { APPLIED: "Applied", DISMISSED: "Dismissed", EXPIRED: "Expired", FAILED: "Failed" };

export function AssistantPanel(props: {
  initialThreads: ThreadView[];
  assistantName: string;
  welcome: string;
  tier: "free" | "paid";
  vision: boolean;
  maxInputChars: number;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadView[]>(props.initialThreads);
  const [activeId, setActiveId] = useState<string | null>(props.initialThreads[0]?.id ?? null);
  const [activeTitle, setActiveTitle] = useState<string>(props.initialThreads[0]?.title ?? "");
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId) return;
    void (async () => {
      const res = await callApi<ThreadDetail>(`/api/assistant/threads/${activeId}`, "GET");
      if (res.ok && res.data) {
        setMessages(res.data.messages);
        setActiveTitle(res.data.thread.title);
      }
    })();
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  async function newChat() {
    const res = await callApi<ThreadView>("/api/assistant/threads", "POST", {});
    if (res.ok && res.data) {
      setThreads((t) => [res.data as ThreadView, ...t]);
      setActiveId(res.data.id);
      setActiveTitle(res.data.title);
      setMessages([]);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || busy) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    setBusy(true);
    setError(null);
    let res;
    if (files.length > 0) {
      const form = new FormData();
      form.set("text", trimmed);
      for (const f of files) form.append("file", f);
      res = await postForm<SendResult>(`/api/assistant/threads/${activeId}/messages`, form);
    } else {
      res = await callApi<SendResult>(`/api/assistant/threads/${activeId}/messages`, "POST", { text: trimmed });
    }
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? "Something went wrong.");
      return;
    }
    setText("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    setMessages((m) => [...m, ...res.data!.messages]);
    setActiveTitle(res.data.thread.title);
    setThreads((t) => t.map((x) => (x.id === activeId ? { ...x, title: res.data!.thread.title } : x)));
  }

  async function decide(proposalId: string, action: "apply" | "dismiss") {
    const res = await callApi<{ proposal: ProposalView; result: { message: string; href?: string } | null }>(`/api/assistant/proposals/${proposalId}`, "POST", { action });
    if (!res.ok || !res.data) {
      setError(res.error?.message ?? "Something went wrong.");
      return;
    }
    setMessages((ms) => ms.map((m) => ({ ...m, proposals: m.proposals.map((p) => (p.id === proposalId ? { ...p, status: res.data!.proposal.status, error: res.data!.proposal.error } : p)) })));
    if (action === "apply" && res.data.result) {
      const href = res.data.result.href;
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "ASSISTANT", text: res.data!.result!.message, attachments: 0, createdAt: new Date().toISOString(), proposals: [] }]);
      if (href) router.push(href);
    }
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="card h-fit p-3">
        <button type="button" onClick={newChat} className="btn-primary w-full">
          + New chat
        </button>
        <ul className="mt-3 space-y-1">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${t.id === activeId ? "bg-raised font-medium" : "text-muted hover:bg-raised"}`}
              >
                {t.title}
              </button>
            </li>
          ))}
          {threads.length === 0 ? <li className="px-3 py-2 text-sm text-muted">No chats yet.</li> : null}
        </ul>
      </aside>

      <section className="card flex min-h-[60vh] flex-col p-4">
        <h2 className="border-b border-line pb-3 text-sm font-medium">{activeTitle || props.assistantName}</h2>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-line bg-raised p-4 text-sm">
              <p className="font-medium">{props.assistantName}</p>
              <p className="mt-1 text-muted">{props.welcome}</p>
              {!props.vision ? <p className="mt-2 text-xs text-muted">Tip: attached pictures are read by the premium assistant (an active plan or a recent top-up).</p> : null}
            </div>
          ) : null}
          {messages.map((m) => (
            <div key={m.id} className={m.role === "USER" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
              <div
                className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "USER" ? "bg-primary text-onprimary" : "border border-line bg-raised"
                }`}
              >
                {m.text}
                {m.attachments > 0 ? <p className={`mt-1 text-xs ${m.role === "USER" ? "text-onprimary/80" : "text-muted"}`}>{m.attachments} picture{m.attachments === 1 ? "" : "s"} attached</p> : null}
              </div>
              {m.proposals.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {m.proposals.map((p) => (
                    <div key={p.id} className="rounded-xl border border-line p-3 text-sm">
                      <p>{p.summary}</p>
                      {p.status === "PENDING" ? (
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => decide(p.id, "apply")} className="btn-primary px-3 py-1.5 text-xs">
                            {p.kind === "link" ? "Open" : "Apply"}
                          </button>
                          <button type="button" onClick={() => decide(p.id, "dismiss")} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-raised">
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <p className={`mt-2 text-xs ${p.status === "FAILED" ? "text-danger" : "text-muted"}`}>
                          {statusLabel[p.status] ?? p.status}
                          {p.error ? `: ${p.error}` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-muted">{props.assistantName} is working…</p> : null}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <p role="alert" className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {activeId ? (
          <form onSubmit={send} className="border-t border-line pt-3">
            {files.length > 0 ? <p className="mb-1 text-xs text-muted">{files.map((f) => f.name).join(", ")}</p> : null}
            <div className="flex items-end gap-2">
              <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-muted hover:bg-raised" title="Attach a picture">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}
                />
                Attach
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, props.maxInputChars))}
                rows={2}
                placeholder={`Message ${props.assistantName}…`}
                className="input min-h-[44px] flex-1 resize-y"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(e);
                  }
                }}
              />
              <button type="submit" disabled={busy || (!text.trim() && files.length === 0)} className="btn-primary">
                Send
              </button>
            </div>
          </form>
        ) : (
          <p className="border-t border-line pt-3 text-sm text-muted">Start a new chat to talk to {props.assistantName}.</p>
        )}
      </section>
    </div>
  );
}
