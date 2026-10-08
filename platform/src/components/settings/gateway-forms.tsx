"use client";

import { JsonForm, type FormField } from "@/components/json-form";

export interface GatewayStatus {
  name: string;
  summary: string;
  vaultReady: boolean;
  fields: Array<{
    name: string;
    label: string;
    secret: boolean;
    envHint: string;
    placeholder?: string;
    source: "org" | "deployment" | null;
    value: string | null;
  }>;
}

/** One gateway's editable form. Secrets arrive masked; blank keeps the stored one. */
export function GatewayForm({ gateway, status }: { gateway: string; status: GatewayStatus }) {
  if (!status.vaultReady) {
    return (
      <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
        CREDENTIALS_KEY is not set on this server, so credentials cannot be stored. Ask the operator to set it, then reload.
      </p>
    );
  }

  const fields: FormField[] = status.fields.map((f) => ({
    name: f.name,
    label: f.secret ? `${f.label} (leave blank to keep)` : f.label,
    type: f.secret ? "password" : "text",
    required: false,
    autoComplete: "off",
    placeholder:
      f.secret
        ? f.source === "org"
          ? `Stored: ${f.value}`
          : "Not stored yet"
        : (f.value ?? f.placeholder ?? ""),
    help: `Deployment default: ${f.envHint}`,
  }));

  return (
    <JsonForm
      endpoint="/api/account/settings"
      method="PUT"
      fields={fields}
      submitLabel={`Save ${status.name}`}
      toBody={(values) => ({ gateway, values })}
      then="refresh"
      successMessage="Saved."
    />
  );
}
