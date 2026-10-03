"use client";

import { JsonForm } from "@/components/json-form";

/** Renames an organisation. The slug (its address) stays the same. */
export function RenameOrg({ orgId, name }: { orgId: string; name: string }) {
  return (
    <section aria-labelledby="rename" className="card max-w-lg p-5">
      <h2 id="rename" className="mb-3 text-lg font-medium">
        Name
      </h2>
      <JsonForm
        endpoint={`/api/platform/orgs/${orgId}`}
        method="PATCH"
        submitLabel="Rename"
        idPrefix="rename-org"
        fields={[{ name: "name", label: "Organisation name", required: true, defaultValue: name }]}
        successMessage="Renamed."
      />
    </section>
  );
}
