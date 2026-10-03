import Link from "next/link";
import type { ReactNode } from "react";

/** Small presentational pieces shared by console pages. Server-safe: no state, no hooks. */

export function PageHeader(props: { title: string; subtitle?: string; actions?: ReactNode; avatarUrl?: string; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {props.avatarUrl ? (
          <img src={props.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border border-line object-cover" />
        ) : null}
        <div className="min-w-0">
          {props.back ? (
            <Link href={props.back.href} className="mb-1 inline-block text-xs font-medium text-muted hover:text-ink">
              ← {props.back.label}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{props.title}</h1>
          {props.subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{props.subtitle}</p> : null}
        </div>
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

const TONES = {
  neutral: "border-wash/10 bg-wash/[0.05] text-ink/80",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  info: "border-info/25 bg-info/10 text-info",
  primary: "border-primary/25 bg-primary/10 text-primary",
} as const;

export type Tone = keyof typeof TONES;

export function Badge(props: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[props.tone ?? "neutral"]}`}>
      {props.children}
    </span>
  );
}

export function EmptyState(props: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-wash/10 bg-wash/[0.02] px-6 py-12 text-center">
      {props.icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-wash/[0.06] text-muted">{props.icon}</div> : null}
      <p className="font-medium text-ink">{props.title}</p>
      {props.children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{props.children}</div> : null}
      {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
    </div>
  );
}

export function Notice(props: { tone?: "warning" | "info" | "danger" | "success"; title: string; children?: ReactNode }) {
  const tone = props.tone ?? "info";
  return (
    <div role="note" className={`mb-6 rounded-card border px-4 py-3 text-sm ${TONES[tone]}`}>
      <p className="font-medium">{props.title}</p>
      {props.children ? <div className="mt-0.5 text-ink/80">{props.children}</div> : null}
    </div>
  );
}

/** A horizontally scrollable table wrapper so wide tables never break a phone layout. */
export function TableWrap(props: { children: ReactNode }) {
  return <div className="card overflow-x-auto [&_tbody_tr:hover]:bg-wash/[0.02] [&_th]:whitespace-nowrap">{props.children}</div>;
}

export function StatCard(props: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{props.label}</span>
        {props.icon ? <span className="text-muted">{props.icon}</span> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-muted">{props.hint}</div> : null}
    </>
  );
  return props.href ? (
    <Link href={props.href} className="card block p-4 transition-colors hover:bg-wash/[0.07]">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export function SectionTitle(props: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={props.id} className="text-lg font-semibold tracking-tight text-ink">
        {props.children}
      </h2>
      {props.action}
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });
const DATE_TIME = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

export function formatDate(d: Date | string | null | undefined): string {
  return d ? DATE.format(new Date(d)) : "—";
}

export function formatDateTime(d: Date | string | null | undefined): string {
  return d ? DATE_TIME.format(new Date(d)) : "—";
}

/** "3 min ago", "yesterday", or a date — for inbox and activity lists. */
export function timeAgo(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const ms = now.getTime() - new Date(d).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(d);
}
