"use client";

import { useState } from "react";

import { JsonForm } from "@/components/json-form";
import { PLAN_KEYS } from "@/lib/limits";

interface Created {
  id: string;
  emailSent: boolean;
  acceptUrl: string;
}

export function CreateOrgForm() {
  const [created, setCreated] = useState<Created | null>(null);

  return (
    <div className="space-y-4">
      <JsonForm<Created>
        endpoint="/api/platform/orgs"
        submitLabel="Create and invite Owner"
        fields={[
          { name: "name", label: "Agency name", required: true },
          {
            name: "plan",
            label: "Plan",
            type: "select",
            defaultValue: "TRIAL",
            options: PLAN_KEYS.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() })),
          },
          { name: "ownerEmail", label: "Owner's email", type: "email", required: true, inputMode: "email", autoComplete: "off" },
        ]}
        onSuccess={setCreated}
      />
      {created ? (
        <div role="status" className="rounded-lg border border-line bg-surface p-3 text-sm">
          <p className="font-medium">Organisation created.</p>
          <p className="mt-1 text-muted">
            {created.emailSent ? "The Owner has been emailed. " : "Email could not be sent, so share this link yourself. "}
            It works once and expires in 7 days.
          </p>
          <input readOnly value={created.acceptUrl} aria-label="Owner invitation link" className="input mt-2 !min-h-[40px] text-xs" />
        </div>
      ) : null}
    </div>
  );
}
