import { Check, Circle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Requirement } from "@/server/readiness";

/**
 * Shows what still has to be set up, one friendly step at a time, and the page behind it once
 * everything is in place. Nothing here decides access: the API and the worker run the same checks.
 */
export function RequirementsGate({
  requirements,
  title = "Set up the essentials first",
  intro,
  children,
  blocking = true,
}: {
  requirements: Requirement[];
  title?: string;
  intro?: ReactNode;
  children?: ReactNode;
  /** When false the checklist is shown above the page instead of replacing it */
  blocking?: boolean;
}) {
  const missing = requirements.filter((r) => !r.ok);
  if (missing.length === 0) return <>{children}</>;
  const done = requirements.length - missing.length;
  return (
    <>
      <section className="card mb-6 max-w-2xl p-5" aria-labelledby="gate-title">
        <h2 id="gate-title" className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">
          {intro ?? "A few things need to be in place first, so every post is good from the start."} {done} of {requirements.length} done.
        </p>
        <ol className="mt-4 space-y-3">
          {requirements.map((r) => (
            <li key={r.key} className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${r.ok ? "bg-success/20 text-success" : "border border-line text-muted"}`}>
                {r.ok ? <Check className="h-4 w-4" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
                <span className="sr-only">{r.ok ? "Done" : "Still to do"}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${r.ok ? "text-muted line-through" : "text-ink"}`}>{r.title}</p>
                {!r.ok && <p className="text-sm text-muted">{r.why}</p>}
              </div>
              {!r.ok && (
                <Link href={r.href} className="btn-primary shrink-0">{r.action}</Link>
              )}
            </li>
          ))}
        </ol>
      </section>
      {blocking ? null : children}
    </>
  );
}
