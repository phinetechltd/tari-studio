"use client";

import { CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { callApi } from "@/components/json-form";
import { cn } from "@/lib/utils";

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

/** Every notification, newest first, with "mark read" and "load more". */
export function NotificationList({ initial, initialUnread, home }: { initial: NotificationRow[]; initialUnread: number; home: string }) {
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [more, setMore] = useState(initial.length >= 50);
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    const r = await callApi("/api/notifications", "PATCH", {});
    setBusy(false);
    if (r.ok) {
      const now = new Date().toISOString();
      setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? now })));
      setUnread(0);
    }
  }

  async function markOne(id: string) {
    const r = await callApi("/api/notifications", "PATCH", { id });
    if (r.ok) {
      setItems((list) => list.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)));
      setUnread((u) => Math.max(0, u - 1));
    }
  }

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setBusy(true);
    const r = await callApi<{ items: NotificationRow[] }>(`/api/notifications?take=50&before=${encodeURIComponent(last.createdAt)}`, "GET");
    setBusy(false);
    if (r.ok && r.data) {
      setItems((list) => [...list, ...r.data!.items]);
      setMore(r.data.items.length >= 50);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread > 0 ? (
          <button type="button" onClick={markAll} disabled={busy} className="btn-quiet min-h-[36px] text-sm">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        ) : null}
      </div>
      <ul className="card divide-y divide-white/[0.06] overflow-hidden">
        {items.map((n) => (
          <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", n.readAt ? "opacity-70" : "")}>
            <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
            <div className="min-w-0 flex-1">
              <Link href={n.href ?? home} onClick={() => !n.readAt && void markOne(n.id)} className="font-medium text-ink hover:underline">
                {n.title}
              </Link>
              {n.body ? <p className="mt-0.5 text-sm text-muted">{n.body}</p> : null}
              <p className="mt-1 text-xs text-muted">{when(n.createdAt)}</p>
            </div>
            {!n.readAt ? (
              <button type="button" onClick={() => markOne(n.id)} className="shrink-0 rounded-full px-2 py-1 text-xs text-muted hover:bg-white/[0.06] hover:text-ink">
                Mark read
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {more ? (
        <button type="button" onClick={loadMore} disabled={busy} className="btn-quiet mt-4">
          {busy ? "Loading…" : "Load older"}
        </button>
      ) : null}
    </div>
  );
}
