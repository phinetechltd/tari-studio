"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Brand {
  id: string;
  name: string;
}

export function NewChannelForm() {
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
      name: (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim() || "",
      brandId: (form.elements.namedItem("brandId") as HTMLSelectElement)?.value || "",
      platform: (form.elements.namedItem("platform") as HTMLSelectElement)?.value || "FACEBOOK",
      externalId: (form.elements.namedItem("externalId") as HTMLInputElement)?.value?.trim() || undefined,
      handle: (form.elements.namedItem("handle") as HTMLInputElement)?.value?.trim() || undefined,
    };

    if (!data.name || !data.brandId) {
      setError("Name and brand are required.");
      setPending(false);
      return;
    }

    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setPending(false);

    if (res.ok) {
      router.push("/app/social");
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
          <label className="mb-1 block text-sm font-medium" htmlFor="name">
            Channel Name <span className="text-danger">*</span>
          </label>
          <input id="name" name="name" required maxLength={200} className="input" placeholder="e.g. TechVault Official" autoFocus />
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

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="platform">Platform</label>
          <select id="platform" name="platform" className="input">
            <option value="FACEBOOK">Facebook</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="TWITTER">Twitter</option>
            <option value="LINKEDIN">LinkedIn</option>
            <option value="TIKTOK">TikTok</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="externalId">External ID</label>
          <input id="externalId" name="externalId" className="input" placeholder="e.g. page ID" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="handle">Handle</label>
          <input id="handle" name="handle" className="input" placeholder="e.g. @techvault" />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Creating…" : "Connect Channel"}
          </button>
          <button type="button" onClick={() => router.push("/app/social")} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
