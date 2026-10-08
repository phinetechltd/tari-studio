import { Globe2, Lock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listForOrganization, type TemplateCard } from "@/server/templates";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "mine", label: "Ours" },
  { id: "shared", label: "From other organisations" },
  { id: "platform", label: "From the platform team" },
] as const;

function badges(t: TemplateCard) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {t.scope === "mine" ? (
        <>
          <Badge tone={t.visibility === "PUBLIC" ? "primary" : "neutral"}>
            {t.visibility === "PUBLIC" ? <Globe2 className="mr-1 inline h-3 w-3" aria-hidden /> : <Lock className="mr-1 inline h-3 w-3" aria-hidden />}
            {t.visibility === "PUBLIC" ? "Public" : "Private"}
          </Badge>
          {t.status === "DRAFT" ? <Badge tone="warning">Draft</Badge> : null}
          {t.hidden ? <Badge tone="danger">Hidden by admin</Badge> : null}
        </>
      ) : t.scope === "shared" ? (
        <Badge>By {t.organizationName ?? "another organisation"}</Badge>
      ) : (
        <Badge tone="primary">Platform</Badge>
      )}
      {t.fromPinterest ? <Badge>Pinterest</Badge> : null}
    </span>
  );
}

/** Look-and-feel packs: the platform team's, your organisation's own, and other organisations' public ones. */
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { principal, organizationId } = await requirePermission("template:read");
  const { show } = await searchParams;
  const filter = FILTERS.some((f) => f.id === show) ? (show as (typeof FILTERS)[number]["id"]) : "all";
  const all = await listForOrganization(organizationId);
  const templates = filter === "all" ? all : all.filter((t) => t.scope === filter);
  const canWrite = can(principal, "template:write");

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Start from a ready-made look: a description and a pack of reference images. Make your own, keep them private or share them with everyone."
        actions={
          canWrite ? (
            <Link href="/app/templates/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New template
            </Link>
          ) : null
        }
      />
      <Hint id="templates.intro" title="Make a template from your own pictures or Pinterest">
        Create a template, upload reference pictures or bring them in from Pinterest, then use it in the Studio. Private templates stay with your team; public ones appear for every organisation. Pictures from other people&apos;s pins keep a template private.
      </Hint>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Show templates">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/app/templates" : `/app/templates?show=${f.id}`}
            aria-current={filter === f.id ? "page" : undefined}
            className={cn("min-h-[34px] rounded-full border px-3 py-1.5 text-xs", filter === f.id ? "border-primary bg-primary/15 text-ink" : "border-line text-muted hover:text-ink")}
          >
            {f.label} ({f.id === "all" ? all.length : all.filter((t) => t.scope === f.id).length})
          </Link>
        ))}
      </nav>

      {templates.length === 0 ? (
        <EmptyState
          title={filter === "mine" ? "No templates of your own yet" : "No templates here yet"}
          action={
            canWrite ? (
              <Link href="/app/templates/new" className="btn-primary">
                Create one
              </Link>
            ) : undefined
          }
        >
          {filter === "mine" ? "Make one from your own pictures or from Pinterest." : "New templates appear here when they are published."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/app/templates/${t.id}`} className="card group block h-full overflow-hidden transition-colors hover:border-primary/50">
                <div className="aspect-[4/3] overflow-hidden bg-surface">
                  {t.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  ) : null}
                </div>
                <div className="space-y-2 p-4">
                  {badges(t)}
                  <h2 className="font-semibold text-ink">{t.title}</h2>
                  <p className="line-clamp-2 text-sm text-muted">{t.description}</p>
                  <p className="text-xs text-muted">
                    {t.imageCount} image{t.imageCount === 1 ? "" : "s"}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
