"use client";

import { Archive, Globe, LoaderIcon, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/landing/order-events";
import type { BlogStatus } from "@/lib/blog";

/**
 * The quick actions on a post row: publish, unpublish, archive, delete.
 * Deleting a published post is refused by the API — unpublish first — so the
 * public site never 404s without the author choosing to.
 */
export function PostRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: BlogStatus | "DELETE") {
    setError(null);
    setBusy(action);
    const res =
      action === "DELETE"
        ? await callApi(`/api/blog/posts/${id}`, { method: "DELETE" })
        : await callApi(`/api/blog/posts/${id}`, { method: "PATCH", body: JSON.stringify({ status: action }) });
    setBusy(null);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  const icon = (action: string) => (busy === action ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null);

  return (
    <div className="flex items-center gap-1" title={error ?? undefined}>
      {status !== "PUBLISHED" ? (
        <button type="button" className="btn-quiet px-2 py-1.5 text-sm" disabled={busy !== null} onClick={() => act("PUBLISHED")} title="Publish">
          {icon("PUBLISHED") ?? <Globe className="h-4 w-4" />}
        </button>
      ) : (
        <button type="button" className="btn-quiet px-2 py-1.5 text-sm" disabled={busy !== null} onClick={() => act("DRAFT")} title="Back to draft (unpublish)">
          {icon("DRAFT") ?? <Undo2 className="h-4 w-4" />}
        </button>
      )}
      {status !== "ARCHIVED" && (
        <button type="button" className="btn-quiet px-2 py-1.5 text-sm" disabled={busy !== null} onClick={() => act("ARCHIVED")} title="Archive">
          {icon("ARCHIVED") ?? <Archive className="h-4 w-4" />}
        </button>
      )}
      {status !== "PUBLISHED" && (
        <button
          type="button"
          className="btn-quiet px-2 py-1.5 text-sm text-danger"
          disabled={busy !== null}
          onClick={() => {
            if (window.confirm("Delete this post for good? This cannot be undone.")) void act("DELETE");
          }}
          title="Delete"
        >
          {icon("DELETE") ?? <Trash2 className="h-4 w-4" />}
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
