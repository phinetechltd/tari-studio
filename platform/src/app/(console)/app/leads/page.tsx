import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { StageSelect } from "@/components/leads/stage-select";
import { Badge, EmptyState, PageHeader, TableWrap, timeAgo } from "@/components/ui";
import { STAGE_LABELS, STAGES } from "@/lib/automation-rules";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listContacts } from "@/server/whatsapp";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string }> }) {
  const { principal, organizationId } = await requirePermission("lead:read");
  const { stage, q } = await searchParams;

  const [contacts, counts] = await Promise.all([
    listContacts(principal, { stage, q }),
    db.contact.groupBy({ by: ["stage"], where: { organizationId }, _count: { _all: true } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.stage === s)?._count._all ?? 0;
  const total = counts.reduce((sum, c) => sum + c._count._all, 0);
  const canEdit = can(principal, "lead:write");
  const canInbox = can(principal, "inbox:read");

  const tab = (value: string | undefined, label: string, n: number) => {
    const qs = new URLSearchParams();
    if (value) qs.set("stage", value);
    if (q) qs.set("q", q);
    const active = (stage ?? "") === (value ?? "");
    return (
      <Link
        key={label}
        href={`/app/leads${qs.size ? `?${qs}` : ""}`}
        className={cn("rounded-full px-3 py-1.5 text-sm", active ? "bg-wash/10 font-medium text-ink" : "text-muted hover:text-ink")}
      >
        {label} <span className="text-muted">{n}</span>
      </Link>
    );
  };

  return (
    <>
      <PageHeader title="Leads" subtitle="Everyone who has messaged your WhatsApp numbers, with the campaign that brought them and where they are in the pipeline." />
      <Hint id="leads.intro" title="Everyone who got in touch">
        People who message you or click a tracked link become leads, with where they came from.
      </Hint>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Stages">
          {tab(undefined, "All", total)}
          {STAGES.map((s) => tab(s, STAGE_LABELS[s], countOf(s)))}
        </nav>
        <form className="w-full sm:w-64" action="/app/leads">
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          <input name="q" defaultValue={q} placeholder="Search name or number" className="input !min-h-[38px]" aria-label="Search leads" />
        </form>
      </div>

      {contacts.length === 0 ? (
        <EmptyState title={total === 0 ? "No leads yet" : "No leads match"} icon={<UsersRound className="h-5 w-5" />}>
          {total === 0 ? "A lead appears the first time someone messages one of your WhatsApp numbers." : "Try another stage or search."}
        </EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Last message</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
                return (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{c.name ?? "—"}</p>
                      <p className="text-xs text-muted">{formatPhone(c.phone)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StageSelect contactId={c.id} stage={c.stage} disabled={!canEdit} />
                    </td>
                    <td className="px-4 py-3">
                      {c.campaign ? (
                        <Link href={`/app/campaigns/${c.campaign.id}`} className="text-primary hover:underline">
                          {c.campaign.name}
                        </Link>
                      ) : (
                        <span className="text-muted">Direct</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{c.brand?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {tags.length ? tags.map((t) => <Badge key={t}>{t}</Badge>) : <span className="text-muted">—</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{timeAgo(c.lastMessageAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {canInbox && c.conversations[0] ? (
                        <Link href={`/app/inbox?c=${c.conversations[0].id}`} className="btn-quiet min-h-[32px] px-3 text-xs">
                          Open chat
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
