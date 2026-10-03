"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { Badge } from "@/components/ui";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

/**
 * Members as the platform admin sees them: change a role, suspend or
 * reactivate, or invite someone (a new Owner when the old one has left). The
 * server refuses to leave an organisation without an active Owner.
 */
export function OrgMembers({ orgId, members, roles }: { orgId: string; members: Member[]; roles: Array<{ value: string; label: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [invite, setInvite] = useState<{ acceptUrl: string; emailSent: boolean } | null>(null);

  async function patch(member: Member, body: { role?: string; status?: string }, ok: string) {
    setBusy(member.id);
    setMessage(null);
    const r = await callApi(`/api/platform/orgs/${orgId}/members/${member.id}`, "PATCH", body);
    setBusy(null);
    if (!r.ok) return setMessage({ tone: "error", text: r.error?.message ?? "Could not change it." });
    setMessage({ tone: "ok", text: ok });
    router.refresh();
  }

  async function sendInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy("invite");
    setMessage(null);
    setInvite(null);
    const r = await callApi<{ acceptUrl: string; emailSent: boolean; email: string }>(`/api/platform/orgs/${orgId}/invites`, "POST", {
      email: String(data.get("email") ?? ""),
      role: String(data.get("role") ?? "OWNER"),
    });
    setBusy(null);
    if (!r.ok || !r.data) return setMessage({ tone: "error", text: r.error?.message ?? "Could not send the invitation." });
    setInvite({ acceptUrl: r.data.acceptUrl, emailSent: r.data.emailSent });
    setMessage({ tone: "ok", text: `Invitation created for ${r.data.email}.` });
    form.reset();
  }

  return (
    <section aria-labelledby="members" className="space-y-3">
      <h2 id="members" className="text-lg font-medium">
        Members ({members.length})
      </h2>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-success/40 bg-success/10 text-success"}`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  <span className="font-medium">{m.name}</span> <span className="text-muted">{m.email}</span>
                </td>
                <td className="px-4 py-2">
                  <select
                    className="input !min-h-[36px] w-44"
                    value={m.role}
                    disabled={busy !== null}
                    aria-label={`Role of ${m.name}`}
                    onChange={(e) => void patch(m, { role: e.target.value }, `${m.name} is now ${roles.find((r) => r.value === e.target.value)?.label ?? e.target.value}.`)}
                  >
                    {roles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">{m.status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className={m.status === "ACTIVE" ? "btn-quiet !min-h-[36px] text-danger" : "btn-quiet !min-h-[36px]"}
                    disabled={busy !== null}
                    onClick={() => {
                      if (m.status === "ACTIVE" && !window.confirm(`Suspend ${m.name}? They lose access to this organisation at once.`)) return;
                      void patch(m, { status: m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }, m.status === "ACTIVE" ? `${m.name} suspended.` : `${m.name} reactivated.`);
                    }}
                  >
                    {m.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted">Nobody has joined yet. Invite an Owner below.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form onSubmit={sendInvite} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="inv-email">Invite by email</label>
          <input id="inv-email" name="email" type="email" className="input" required placeholder="name@agency.co.ke" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="inv-role">Role</label>
          <select id="inv-role" name="role" className="input w-44" defaultValue="OWNER">
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          Send invitation
        </button>
        {invite ? (
          <div className="w-full text-sm">
            <p className="text-muted">{invite.emailSent ? "Emailed. " : "Email could not be sent; share this link yourself. "}It works once and expires in 7 days.</p>
            <input readOnly value={invite.acceptUrl} aria-label="Invitation link" className="input mt-2 !min-h-[40px] text-xs" />
          </div>
        ) : null}
      </form>
    </section>
  );
}
