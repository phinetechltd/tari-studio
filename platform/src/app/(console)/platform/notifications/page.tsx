import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { Badge, EmptyState, Notice, PageHeader, SectionTitle, TableWrap, type Tone } from "@/components/ui";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { eventSpec, EVENTS, resolvedPolicy } from "@/lib/notification-events";
import { requirePlatform } from "@/lib/session";
import { maskMsisdn } from "@/lib/sms";
import { getNotificationPolicy } from "@/server/notify";

import { PolicyMatrix, RetryButton, TestSend } from "./notification-admin";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const whenFmt = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });
const STATUS_TONE: Record<string, Tone> = { SENT: "success", FAILED: "danger", SUPPRESSED: "neutral", QUEUED: "warning", SENDING: "warning" };
const STATUS_LABEL: Record<string, string> = { SENT: "Sent", FAILED: "Failed", SUPPRESSED: "Not sent", QUEUED: "Queued", SENDING: "Sending" };

/**
 * Platform admin → Notifications: which channels each event uses, a test
 * send for email and SMS, and the delivery log (with why anything was not
 * sent). Provider credentials are in Settings → Email / SMS.
 */
export default async function PlatformNotificationsPage({ searchParams }: { searchParams: Promise<{ channel?: string; status?: string; q?: string }> }) {
  const { principal } = await requirePlatform();
  const f = await searchParams;
  const e = env();
  const channel = f.channel === "EMAIL" || f.channel === "SMS" ? f.channel : undefined;
  const status = f.status && STATUS_LABEL[f.status] ? f.status : undefined;
  const q = f.q?.trim();
  const since = new Date(Date.now() - 86_400_000);

  const [policy, me, deliveries, counts] = await Promise.all([
    getNotificationPolicy(true),
    db.user.findUniqueOrThrow({ where: { id: principal.userId }, select: { email: true, phone: true } }),
    db.notificationDelivery.findMany({
      where: { ...(channel ? { channel } : {}), ...(status ? { status } : {}), ...(q ? { OR: [{ recipient: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.notificationDelivery.groupBy({ by: ["channel", "status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const orgIds = Array.from(new Set(deliveries.map((d) => d.organizationId).filter((x): x is string => Boolean(x))));
  const orgs = await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const count = (c: string, s: string) => counts.find((x) => x.channel === c && x.status === s)?._count._all ?? 0;
  const filtered = Boolean(channel || status || q);

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Which channels each event uses, test messages, and every email and SMS sent."
        actions={
          <Link href="/settings#deployment" className="btn-quiet">
            Email and SMS settings
          </Link>
        }
      />

      <Hint id="platform.notifications" title="Set up email and SMS first">
        Enter your SMTP account and Bonga SMS credentials under Settings → Deployment keys, then send yourself a test below. Every message, including ones held back, appears in the log.
      </Hint>

      {e.EMAIL_PROVIDER === "console" || e.SMS_PROVIDER !== "bonga" ? (
        <Notice tone="info" title="Some channels are not live yet">
          Email is {e.EMAIL_PROVIDER === "smtp" ? "live (SMTP)" : "on the console stand-in"}; SMS is {e.SMS_PROVIDER === "bonga" ? "live (Bonga)" : e.SMS_PROVIDER === "off" ? "off" : "on the console stand-in"}. Stand-ins log messages without sending them, and are refused in production.
        </Notice>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["EMAIL", "SMS"] as const).map((c) => (
          <div key={c} className="card p-4">
            <p className="text-xs uppercase tracking-wider text-muted">{c === "EMAIL" ? "Emails" : "SMS"}, last 24 hours</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{count(c, "SENT")}</p>
            <p className="text-xs text-muted">
              sent · {count(c, "FAILED")} failed · {count(c, "SUPPRESSED")} not sent
            </p>
          </div>
        ))}
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-muted">SMS daily limit</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{e.SMS_DAILY_CAP}</p>
          <p className="text-xs text-muted">Change it in Settings → SMS</p>
        </div>
      </div>

      <section className="mt-10" aria-labelledby="channels">
        <SectionTitle id="channels">Channels per event</SectionTitle>
        <PolicyMatrix
          events={EVENTS.map((ev) => ({ key: ev.key, label: ev.label, description: ev.description, group: ev.group, essential: ev.essential, audience: ev.audience, defaults: ev.defaults }))}
          policy={resolvedPolicy(policy)}
          smsMode={e.SMS_PROVIDER}
          emailMode={e.EMAIL_PROVIDER}
        />
      </section>

      <section className="mt-10" aria-labelledby="test">
        <SectionTitle id="test">Send a test</SectionTitle>
        <TestSend defaultEmail={me.email} defaultPhone={me.phone} />
      </section>

      <section className="mt-10" aria-labelledby="log">
        <SectionTitle id="log">Delivery log</SectionTitle>
        <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="label" htmlFor="log-channel">Channel</label>
            <select id="log-channel" name="channel" className="input w-36" defaultValue={channel ?? ""}>
              <option value="">Any</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="log-status">Status</label>
            <select id="log-status" name="status" className="input w-36" defaultValue={status ?? ""}>
              <option value="">Any</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="log-q">Search</label>
            <input id="log-q" name="q" className="input w-56" defaultValue={q ?? ""} placeholder="Address, number or subject" />
          </div>
          <button type="submit" className="btn-primary">
            Filter
          </button>
          {filtered ? (
            <Link href="/platform/notifications" className="btn-quiet">
              Clear
            </Link>
          ) : null}
        </form>
        {deliveries.length === 0 ? (
          <EmptyState title={filtered ? "Nothing matches" : "Nothing sent yet"}>{filtered ? "Clear the filters to see everything." : "Emails and SMS appear here as notifications go out."}</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">To</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-line align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{whenFmt.format(d.createdAt)}</td>
                    <td className="px-4 py-2">
                      {d.event === "test" ? "Test" : (eventSpec(d.event)?.label ?? d.event)}
                      <span className="block text-xs text-muted">
                        {d.channel === "EMAIL" ? "Email" : "SMS"}
                        {d.organizationId ? ` · ${orgName.get(d.organizationId) ?? "organisation"}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{d.channel === "SMS" && /^\d+$/.test(d.recipient) ? maskMsisdn(d.recipient) : d.recipient}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{STATUS_LABEL[d.status] ?? d.status}</Badge>
                      {d.mock ? <span className="mt-1 block text-[11px] text-muted">stand-in</span> : null}
                    </td>
                    <td className="max-w-[320px] px-4 py-2 text-xs text-muted">
                      {d.error ?? (d.subject ? d.subject : d.body.slice(0, 120))}
                      {d.attempts > 1 ? <span className="block">{d.attempts} attempts</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right">{d.status === "FAILED" || (d.status === "SUPPRESSED" && d.event !== "test") ? <RetryButton id={d.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
