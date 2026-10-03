"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Brand {
  id: string;
  name: string;
}

export function NewContentForm() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/brands")
      .then(r => r.json())
      .then(d => setBrands(d.data?.brands ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = e.currentTarget;
    const data = {
      title: (form.elements.namedItem("title") as HTMLInputElement)?.value?.trim() || "",
      description: (form.elements.namedItem("description") as HTMLTextAreaElement)?.value?.trim() || "",
      brandId: (form.elements.namedItem("brandId") as HTMLSelectElement)?.value || "",
      contentType: (form.elements.namedItem("contentType") as HTMLSelectElement)?.value || "BRIEF",
      priority: (form.elements.namedItem("priority") as HTMLSelectElement)?.value || "MEDIUM",
    };

    if (!data.title || !data.brandId) {
      setError("Title and brand are required.");
      setPending(false);
      return;
    }

    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setPending(false);

    if (res.ok) {
      router.push("/app/content");
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error?.message || "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-lg p-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="title">
            Title <span className="text-danger">*</span>
          </label>
          <input id="title" name="title" required maxLength={300} className="input" placeholder="e.g. Q4 Campaign Brief" autoFocus />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} className="input" placeholder="Content details..." />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="brandId">
            Brand <span className="text-danger">*</span>
          </label>
          <select id="brandId" name="brandId" required className="input">
            <option value="">Select brand...</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="contentType">Type</label>
            <select id="contentType" name="contentType" className="input">
              <option value="BRIEF">Brief</option>
              <option value="DESIGN">Design</option>
              <option value="COPY">Copy</option>
              <option value="VIDEO">Video</option>
              <option value="IDEA">Idea</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="priority">Priority</label>
            <select id="priority" name="priority" className="input">
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Creating…" : "Create Task"}
          </button>
          <button type="button" onClick={() => router.push("/app/content")} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
