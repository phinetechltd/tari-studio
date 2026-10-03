"use client";

import { Check, Copy, Link2, MessageCircle, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";
import { cn } from "@/lib/utils";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this link:", value);
        }
      }}
      className="btn-quiet min-h-[30px] px-2.5 text-xs"
      aria-label={`${label}: ${value}`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

const NEXT: Record<string, Array<{ status: string; label: string }>> = {
  DRAFT: [{ status: "ACTIVE", label: "Start campaign" }],
  ACTIVE: [
    { status: "PAUSED", label: "Pause" },
    { status: "COMPLETED", label: "Mark completed" },
  ],
  PAUSED: [
    { status: "ACTIVE", label: "Resume" },
    { status: "COMPLETED", label: "Mark completed" },
  ],
  COMPLETED: [{ status: "ACTIVE", label: "Reopen" }],
  ARCHIVED: [{ status: "DRAFT", label: "Restore" }],
};

/** Moves a campaign through DRAFT → ACTIVE ⇄ PAUSED → COMPLETED. Links keep redirecting in every state. */
export function StatusControls({ campaignId, status }: { campaignId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(NEXT[status] ?? []).map((n, i) => (
        <button
          key={n.status}
          type="button"
          disabled={pending !== null}
          onClick={async () => {
            setPending(n.status);
            setError(null);
            const r = await callApi(`/api/campaigns/${campaignId}`, "PATCH", { status: n.status });
            setPending(null);
            if (!r.ok) return setError(r.error?.message ?? "Not changed.");
            router.refresh();
          }}
          className={i === 0 ? "btn-primary" : "btn-quiet"}
        >
          {pending === n.status ? "Saving…" : n.label}
        </button>
      ))}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

/** Creates a tracked link: a wa.me link with a ref code, or a web page with UTM tags. */
export function NewLinkForm({ campaignId, defaultPhone }: { campaignId: string; defaultPhone?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"whatsapp" | "web">("whatsapp");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setPending(true);
        setError(null);
        const body =
          kind === "whatsapp"
            ? { kind, label: String(f.get("label")), phone: String(f.get("phone")), message: String(f.get("message")) }
            : { kind, label: String(f.get("label")), destinationUrl: String(f.get("destinationUrl")) };
        const r = await callApi(`/api/campaigns/${campaignId}/links`, "POST", body);
        setPending(false);
        if (!r.ok) {
          const issues = (r.error?.details as { issues?: Array<{ message: string }> } | undefined)?.issues;
          return setError(issues?.length ? issues.map((i) => i.message).join(" ") : r.error?.message ?? "Not created.");
        }
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      <div className="flex gap-1 rounded-full bg-wash/[0.04] p-1" role="tablist" aria-label="Link type">
        {(
          [
            ["whatsapp", "WhatsApp chat", MessageCircle],
            ["web", "Web page", Link2],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium", kind === value ? "bg-wash/10 text-ink" : "text-muted")}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <input name="label" required maxLength={80} className="input" placeholder={kind === "whatsapp" ? "Where it will appear, e.g. Facebook ad" : "e.g. Product page"} aria-label="Label" />
      {kind === "whatsapp" ? (
        <>
          <input name="phone" required defaultValue={defaultPhone} className="input" placeholder="WhatsApp number, e.g. 0712 345 678" aria-label="WhatsApp number" />
          <textarea
            name="message"
            required
            rows={2}
            maxLength={500}
            className="input py-2"
            defaultValue="Hi, I saw your offer and I'd like to know more."
            aria-label="Pre-filled message"
          />
          <p className="text-xs text-muted">A ref code is added to the message, so the chat is credited to this campaign.</p>
        </>
      ) : (
        <input name="destinationUrl" type="url" required className="input" placeholder="https://" aria-label="Destination" />
      )}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating…" : "Create tracked link"}
      </button>
    </form>
  );
}

export function DeleteLinkButton({ campaignId, linkId }: { campaignId: string; linkId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (!window.confirm("Delete this link? Anyone who taps it afterwards lands on your home page, and its click history is removed.")) return;
          const r = await callApi(`/api/campaigns/${campaignId}/links/${linkId}`, "DELETE");
          if (!r.ok) return setError(r.error?.message ?? "Not deleted.");
          router.refresh();
        }}
        className="btn-ghost min-h-[30px] px-2"
        aria-label="Delete link"
      >
        <Trash className="h-3.5 w-3.5" />
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </>
  );
}
