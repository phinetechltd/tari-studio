"use client";

import { Globe2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { cn } from "@/lib/utils";

/** Creates a draft template and opens its editor, where the pictures are added. */
export function NewTemplateForm() {
  const router = useRouter();
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await callApi<{ id: string }>("/api/templates", "POST", {
      title: String(d.get("title") ?? ""),
      description: String(d.get("description") ?? ""),
      category: String(d.get("category") ?? "") || null,
      visibility,
    });
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error?.message ?? "Could not create the template.");
    router.push(`/app/templates/${r.data.id}/edit`);
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4 p-5">
      <div>
        <label className="label" htmlFor="nt-title">Title</label>
        <input id="nt-title" name="title" required minLength={3} maxLength={120} className="input" placeholder="e.g. Weekend food specials" />
      </div>
      <div>
        <label className="label" htmlFor="nt-desc">What it is for</label>
        <textarea id="nt-desc" name="description" required minLength={10} maxLength={4000} rows={4} className="input py-2.5" placeholder="Bright overhead food shots with a bold price tag, for Friday and Saturday offers." />
      </div>
      <div>
        <label className="label" htmlFor="nt-cat">Category (optional)</label>
        <input id="nt-cat" name="category" maxLength={60} className="input" placeholder="Food" />
      </div>
      <fieldset>
        <legend className="label">Who can use it</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["PRIVATE", "PUBLIC"] as const).map((vis) => (
            <label key={vis} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 text-sm", visibility === vis ? "border-primary bg-primary/10" : "border-line")}>
              <input type="radio" name="visibility" className="mt-1" checked={visibility === vis} onChange={() => setVisibility(vis)} />
              <span>
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  {vis === "PRIVATE" ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Globe2 className="h-3.5 w-3.5" aria-hidden />}
                  {vis === "PRIVATE" ? "Private" : "Public"}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {vis === "PRIVATE" ? "Only your organisation sees and uses it." : "Every organisation on the platform can use it once you publish it."}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">You can change this later. Pictures from other people&apos;s Pinterest pins can only go in private templates.</p>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Creating…" : "Create and add pictures"}
      </button>
    </form>
  );
}
