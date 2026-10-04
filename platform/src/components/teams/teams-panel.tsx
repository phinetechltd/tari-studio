"use client";

import { Check, LoaderIcon, LogOut, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

export interface TeamRow {
  id: string;
  name: string;
  plan: string;
  role: string;
  suspended: boolean;
  current: boolean;
}
export interface InviteRow {
  id: string;
  role: string;
  teamName: string;
  expiresAt: string;
}

/** Every team you belong to, invitations waiting for you, and a way to start a new team. */
export function TeamsPanel({ teams, invites, canCreate }: { teams: TeamRow[]; invites: InviteRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function open(id: string) {
    setBusy(id);
    setError(null);
    const res = await callApi<{ next: string }>("/api/account/switch-team", "POST", { organizationId: id });
    setBusy(null);
    if (res.ok) {
      router.push(res.data!.next);
      router.refresh();
    } else setError(res.error?.message ?? "Could not open that team.");
  }

  async function answer(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError(null);
    const res = await callApi<{ next: string | null }>(`/api/teams/invites/${id}`, "POST", { action });
    setBusy(null);
    if (!res.ok) return setError(res.error?.message ?? "Could not answer that invitation.");
    if (res.data!.next) {
      router.push(res.data!.next);
      router.refresh();
    } else router.refresh();
  }

  async function leave(t: TeamRow) {
    if (!window.confirm(`Leave ${t.name}? You will lose access until someone invites you again.`)) return;
    setBusy(t.id);
    setError(null);
    const res = await callApi("/api/teams/leave", "POST", { organizationId: t.id });
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error?.message ?? "Could not leave the team.");
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    const res = await callApi<{ next: string }>("/api/orgs", "POST", { name });
    setBusy(null);
    if (res.ok) {
      router.push(res.data!.next);
      router.refresh();
    } else setError(res.error?.message ?? "Could not create the team.");
  }

  return (
    <div className="space-y-8">
      {error ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

      {invites.length > 0 && (
        <section aria-labelledby="inv">
          <h2 id="inv" className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Invitations for you</h2>
          <ul className="space-y-2">
            {invites.map((i) => (
              <li key={i.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-ink">{i.teamName}</p>
                  <p className="text-sm text-muted">Join as {ROLE_LABELS[i.role as Role] ?? i.role}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void answer(i.id, "accept")}>
                    {busy === i.id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
                  </button>
                  <button type="button" className="btn-quiet" disabled={busy !== null} onClick={() => void answer(i.id, "decline")}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="teams">
        <h2 id="teams" className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Your teams ({teams.length})</h2>
        {teams.length === 0 ? (
          <p className="card p-4 text-sm text-muted">You are not in a team yet. Create one below, or accept an invitation.</p>
        ) : (
          <ul className="space-y-2">
            {teams.map((t) => (
              <li key={t.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-ink">
                    {t.name}
                    {t.current ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">Current</span> : null}
                    {t.suspended ? <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-danger">Suspended</span> : null}
                  </p>
                  <p className="text-sm text-muted">{ROLE_LABELS[t.role as Role] ?? t.role}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={busy !== null || t.suspended} onClick={() => void open(t.id)}>
                    {busy === t.id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null} {t.current ? "Open" : "Switch to this team"}
                  </button>
                  <button type="button" className="btn-ghost" disabled={busy !== null} onClick={() => void leave(t)} aria-label={`Leave ${t.name}`} title="Leave this team">
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canCreate && (
        <section aria-labelledby="new" className="card p-5">
          <h2 id="new" className="font-semibold text-ink">Start a new team</h2>
          <p className="mt-1 text-sm text-muted">A team is your agency or business: it holds your brands, content, members and credits. You become its Owner.</p>
          <form onSubmit={create} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="team-name" className="sr-only">Team name</label>
            <input id="team-name" className="input" required minLength={2} maxLength={80} placeholder="e.g. Savanna Creative" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn-primary shrink-0" disabled={busy !== null}>
              {busy === "create" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create team
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
