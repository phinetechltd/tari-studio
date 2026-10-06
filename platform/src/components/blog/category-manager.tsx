"use client";

import { LoaderIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  posts: number;
}

/** Add, rename and delete blog categories. Deleting one never deletes its posts. */
export function CategoryManager({ categories: initial, canWrite }: { categories: Category[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(c: Category | null) {
    setEditing(c);
    setName(c?.name ?? "");
    setDescription(c?.description ?? "");
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("save");
    const res = editing
      ? await callApi(`/api/blog/categories/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name, description }) })
      : await callApi("/api/blog/categories", { method: "POST", body: JSON.stringify({ name, description }) });
    setBusy(null);
    if (res.error) return setError(res.error);
    startEdit(null);
    router.refresh();
  }

  async function remove(c: Category) {
    setError(null);
    if (!window.confirm(`Delete "${c.name}"? Its ${c.posts} post${c.posts === 1 ? "" : "s"} stay published, simply without a category.`)) return;
    setBusy(c.id);
    const res = await callApi(`/api/blog/categories/${c.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.error) return setError(res.error);
    if (editing?.id === c.id) startEdit(null);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-2">
        {initial.length === 0 && <li className="card p-4 text-sm text-muted">No categories yet. Add one on the right.</li>}
        {initial.map((c) => (
          <li key={c.id} className="card flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{c.name}</p>
              <p className="truncate text-sm text-muted">
                /blog?category={c.slug} · {c.posts} post{c.posts === 1 ? "" : "s"}
                {c.description ? ` · ${c.description}` : ""}
              </p>
            </div>
            {canWrite && (
              <>
                <button type="button" className="btn-quiet px-2 py-1.5" title="Rename" onClick={() => startEdit(c)}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" className="btn-quiet px-2 py-1.5 text-danger" title="Delete" disabled={busy !== null} onClick={() => remove(c)}>
                  {busy === c.id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {canWrite && (
        <form onSubmit={save} className="card h-fit space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">{editing ? `Rename "${editing.name}"` : "New category"}</h2>
            {editing && (
              <button type="button" className="btn-quiet px-2 py-1" title="Cancel" onClick={() => startEdit(null)}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div>
            <label className="label" htmlFor="c-name">Name</label>
            <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Guides" />
          </div>
          <div>
            <label className="label" htmlFor="c-desc">Description (optional)</label>
            <textarea id="c-desc" className="input min-h-[64px]" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="Shown on the blog to introduce the topic." />
          </div>
          {error && (
            <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy !== null}>
            {busy === "save" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editing ? "Save category" : "Add category"}
          </button>
        </form>
      )}
    </div>
  );
}
