"use client";

import { LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";
import { PERMISSION_GROUPS, ROLE_INFO } from "@/lib/role-info";
import { ASSIGNABLE_ROLES, ROLE_LABELS, permissionsOf, type Role } from "@/lib/rbac";

/** One member's controls for an Owner: role, extra permissions, suspend or restore, remove. */
export function MemberControls({
  id,
  name,
  role,
  suspended,
  extra,
  isSelf,
  viewerIsOwner,
}: {
  id: string;
  name: string;
  role: string;
  suspended: boolean;
  extra: string[];
  isSelf: boolean;
  viewerIsOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [extras, setExtras] = useState(new Set(extra));
  const carried = new Set<string>(permissionsOf(role as Role));

  if (isSelf) return <span className="text-xs text-muted">This is you</span>;
  const locked = role === "OWNER" && !viewerIsOwner;

  async function patch(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setError(null);
    const res = await callApi(`/api/team/members/${id}`, "PATCH", body);
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error?.message ?? "Could not save that.");
    return res.ok;
  }

  async function remove() {
    if (!window.confirm(`Remove ${name} from this team? They lose access immediately.`)) return;
    setBusy("remove");
    setError(null);
    const res = await callApi(`/api/team/members/${id}`, "DELETE");
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error?.message ?? "Could not remove them.");
  }

  return (
    <div className="space-y-2 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`role-${id}`}>Role for {name}</label>
        <select
          id={`role-${id}`}
          className="input !min-h-[36px] w-auto py-1 text-sm"
          value={role}
          disabled={busy !== null || locked}
          onChange={(e) => void patch({ role: e.target.value }, "role")}
        >
          {ASSIGNABLE_ROLES.filter((r) => viewerIsOwner || r !== "OWNER").map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {busy === "role" && <LoaderIcon className="h-4 w-4 animate-spin" />}
        <button type="button" className="btn-quiet !min-h-[36px] px-3 text-xs" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={locked}>
          Permissions{extra.length ? ` (+${extra.length})` : ""}
        </button>
        <button type="button" className="btn-quiet !min-h-[36px] px-3 text-xs" disabled={busy !== null || locked} onClick={() => void patch({ status: suspended ? "ACTIVE" : "SUSPENDED" }, "status")}>
          {suspended ? "Restore" : "Suspend"}
        </button>
        <button type="button" className="btn-danger !min-h-[36px] px-3 text-xs" disabled={busy !== null || locked} onClick={() => void remove()}>
          Remove
        </button>
      </div>
      {ROLE_INFO[role as keyof typeof ROLE_INFO] ? <p className="max-w-md text-xs text-muted">{ROLE_INFO[role as keyof typeof ROLE_INFO].summary}</p> : null}

      {open && (
        <div className="card max-w-xl space-y-4 p-4">
          <p className="text-xs text-muted">
            Ticked and greyed permissions come with the role. Tick others to give {name} more than their role normally allows.
          </p>
          {PERMISSION_GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{g.title}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {g.items.map((p) => {
                  const fromRole = carried.has(p.key);
                  return (
                    <label key={p.key} className={`flex items-center gap-2 text-sm ${fromRole ? "text-muted" : "text-ink"}`}>
                      <input
                        type="checkbox"
                        className="accent-[rgb(var(--c-primary))]"
                        checked={fromRole || extras.has(p.key)}
                        disabled={fromRole}
                        onChange={(e) => {
                          const next = new Set(extras);
                          if (e.target.checked) next.add(p.key);
                          else next.delete(p.key);
                          setExtras(next);
                        }}
                      />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={async () => { if (await patch({ extraPermissions: [...extras] }, "perms")) setOpen(false); }}>
            {busy === "perms" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null} Save permissions
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
