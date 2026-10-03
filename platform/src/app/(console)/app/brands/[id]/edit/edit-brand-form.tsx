"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Brand {
  id: string;
  name: string;
  slug: string;
  brandNumber: string;
  guidelines?: Record<string, unknown>;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  status: string;
  timezone?: string;
  defaultCurrency?: string;
  avatarUrl?: string;
}

export function EditBrandForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}`)
      .then(r => r.json())
      .then(d => setBrand(d.data?.brand ?? null))
      .catch(() => setError("Failed to load brand."));
  }, [brandId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!brand) return;
    setPending(true);
    setError(null);

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim() || "",
      avatarUrl: (form.elements.namedItem("avatarUrl") as HTMLInputElement)?.value?.trim() || undefined,
      guidelines: (form.elements.namedItem("guidelines") as HTMLTextAreaElement)?.value?.trim() || undefined,
      contactName: (form.elements.namedItem("contactName") as HTMLInputElement)?.value?.trim() || undefined,
      contactEmail: (form.elements.namedItem("contactEmail") as HTMLInputElement)?.value?.trim() || undefined,
      contactPhone: (form.elements.namedItem("contactPhone") as HTMLInputElement)?.value?.trim() || undefined,
      website: (form.elements.namedItem("website") as HTMLInputElement)?.value?.trim() || undefined,
      status: (form.elements.namedItem("status") as HTMLSelectElement)?.value || "ACTIVE",
      timezone: (form.elements.namedItem("timezone") as HTMLSelectElement)?.value || undefined,
      defaultCurrency: (form.elements.namedItem("defaultCurrency") as HTMLSelectElement)?.value || undefined,
    };

    const res = await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setPending(false);

    if (res.ok) {
      router.refresh();
      router.push(`/app/brands/${brandId}`);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error?.message || "Something went wrong.");
    }
  }

  if (!brand) {
    return (
      <div className="card p-6">
        <p className="text-muted">Loading brand…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl p-6">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="name">
            Brand Name <span className="text-danger">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={200}
            defaultValue={brand.name}
            className="input"
            placeholder="e.g. GreenLeaf Organics"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="avatarUrl">
            Brand Avatar / Logo URL
          </label>
          <input
            id="avatarUrl"
            name="avatarUrl"
            type="url"
            defaultValue={brand.avatarUrl ?? ""}
            className="input"
            placeholder="e.g. https://example.com/brand-logo.png"
          />
          <p className="mt-1 text-xs text-muted">Optional. Public URL to the brand's logo or avatar image.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="guidelines">
            Brand Guidelines
          </label>
          <textarea
            id="guidelines"
            name="guidelines"
            rows={5}
            className="input font-mono text-xs"
            placeholder='{"tone": "friendly", "colors": "#22c55e, #16a34a", "voice": "Warm and approachable, like a neighbour"}'
          >{brand.guidelines ? JSON.stringify(brand.guidelines, null, 2) : ""}</textarea>
          <p className="mt-1 text-xs text-muted">JSON format: tone, voice, colors, fonts, dos and don'ts.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="contactName">Contact Name</label>
            <input
              id="contactName"
              name="contactName"
              defaultValue={brand.contactName ?? ""}
              className="input"
              placeholder="e.g. Jane Wanjiku"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="contactEmail">Contact Email</label>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={brand.contactEmail ?? ""}
              className="input"
              placeholder="e.g. jane@greenleaf.co.ke"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="contactPhone">Contact Phone</label>
            <input
              id="contactPhone"
              name="contactPhone"
              defaultValue={brand.contactPhone ?? ""}
              className="input"
              placeholder="e.g. +254 700 123 456"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              type="url"
              defaultValue={brand.website ?? ""}
              className="input"
              placeholder="e.g. https://greenleaf.co.ke"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="timezone">Timezone</label>
            <select id="timezone" name="timezone" className="input" defaultValue={brand.timezone ?? "Africa/Nairobi"}>
              <option value="Africa/Nairobi">Africa/Nairobi (E. Africa Time)</option>
              <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
              <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
              <option value="Africa/Cairo">Africa/Cairo (EET)</option>
              <option value="Europe/London">Europe/London (BST/GMT)</option>
              <option value="Europe/Berlin">Europe/Berlin (CET)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="America/Chicago">America/Chicago (CST)</option>
              <option value="America/Denver">America/Denver (MST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              <option value="Pacific/Auckland">Pacific/Auckland (NZST)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="defaultCurrency">Default Currency</label>
            <select id="defaultCurrency" name="defaultCurrency" className="input" defaultValue={brand.defaultCurrency ?? "KES"}>
              <option value="KES">Kenyan Shilling (KES)</option>
              <option value="USD">US Dollar (USD)</option>
              <option value="EUR">Euro (EUR)</option>
              <option value="GBP">British Pound (GBP)</option>
              <option value="TZS">Tanzanian Shilling (TZS)</option>
              <option value="UGX">Ugandan Shilling (UGX)</option>
              <option value="ZAR">South African Rand (ZAR)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={brand.status}>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary"
          >
            {pending ? "Saving…" : "Save Changes"}
          </button>
          <Link
            href={`/app/brands/${brandId}`}
            className="inline-flex min-h-[44px] items-center rounded-button border border-line bg-bg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
