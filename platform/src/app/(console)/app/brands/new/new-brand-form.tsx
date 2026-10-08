"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function NewBrandForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement)?.value?.trim() || "",
      avatarUrl: (form.elements.namedItem("avatarUrl") as HTMLInputElement)?.value?.trim() || undefined,
      slogan: (form.elements.namedItem("slogan") as HTMLInputElement)?.value?.trim() || undefined,
      contactName: (form.elements.namedItem("contactName") as HTMLInputElement)?.value?.trim() || undefined,
      contactEmail: (form.elements.namedItem("contactEmail") as HTMLInputElement)?.value?.trim() || undefined,
      contactPhone: (form.elements.namedItem("contactPhone") as HTMLInputElement)?.value?.trim() || undefined,
      website: (form.elements.namedItem("website") as HTMLInputElement)?.value?.trim() || undefined,
      timezone: (form.elements.namedItem("timezone") as HTMLSelectElement)?.value || "Africa/Nairobi",
      defaultCurrency: (form.elements.namedItem("defaultCurrency") as HTMLSelectElement)?.value || "KES",
    };

    if (!data.name || data.name.length < 2) {
      setError("Enter the brand name.");
      setPending(false);
      return;
    }

    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setPending(false);

    if (res.ok) {
      // Straight on to the profile (cover picture, logo, files): brands with a complete profile make better content.
      const json = (await res.json().catch(() => null)) as { data?: { brand?: { id?: string } } } | null;
      const id = json?.data?.brand?.id;
      router.push(id ? `/app/brands/${id}/edit?new=1` : "/app/brands");
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
            Brand Name <span className="text-danger">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={200}
            className="input"
            placeholder="e.g. Safaricom"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="slogan">
            Slogan
          </label>
          <input id="slogan" name="slogan" maxLength={160} className="input" placeholder="e.g. Fresh from the farm, every day" />
          <p className="mt-1 text-xs text-muted">Optional. A short line the brand is known for. Captions and videos use it.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="avatarUrl">
            Brand Avatar / Logo URL
          </label>
          <input
            id="avatarUrl"
            name="avatarUrl"
            type="url"
            className="input"
            placeholder="e.g. https://example.com/logo.png"
          />
          <p className="mt-1 text-xs text-muted">Optional. Public URL to the brand's logo or avatar.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="contactName">
            Contact Name
          </label>
          <input
            id="contactName"
            name="contactName"
            className="input"
            placeholder="e.g. Jane Doe"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="contactEmail">
            Contact Email
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            className="input"
            placeholder="e.g. jane@safaricom.co.ke"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="contactPhone">
            Contact Phone
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            className="input"
            placeholder="e.g. +254 700 123 456"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="website">
            Website
          </label>
          <input
            id="website"
            name="website"
            type="url"
            className="input"
            placeholder="e.g. https://safaricom.co.ke"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="timezone">Timezone</label>
            <select id="timezone" name="timezone" className="input" defaultValue="Africa/Nairobi">
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
            <select id="defaultCurrency" name="defaultCurrency" className="input" defaultValue="KES">
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

        {error ? (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary"
          >
            {pending ? "Creating…" : "Create Brand"}
          </button>
          <Link
            href="/app/brands"
            className="inline-flex min-h-[44px] items-center rounded-button border border-line bg-bg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
