"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { JsonForm, callApi } from "@/components/json-form";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/rbac";

interface InviteResult {
  email: string;
  emailSent: boolean;
  emailError: string | null;
  acceptUrl: string;
}

export function InviteForm() {
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <JsonForm<InviteResult>
        endpoint="/api/team/invites"
        submitLabel="Send invitation"
        fields={[
          { name: "email", label: "Email address", type: "email", required: true, autoComplete: "off", inputMode: "email" },
          {
            name: "role",
            label: "Role",
            type: "select",
            defaultValue: "DESIGNER",
            options: ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          },
        ]}
        onSuccess={(data) => {
          setResult(data);
          setCopied(false);
        }}
      />

      {result ? (
        <div role="status" className="rounded-lg border border-line bg-surface p-3 text-sm">
          <p className="font-medium">
            {result.emailSent ? `Invitation emailed to ${result.email}.` : `Invitation created for ${result.email}.`}
          </p>
          {!result.emailSent ? (
            <p className="mt-1 text-muted">
              The email could not be sent{result.emailError ? ` (${result.emailError})` : ""}. Share this link with them
              yourself; it works once and expires in 7 days.
            </p>
          ) : (
            <p className="mt-1 text-muted">You can also share this link directly.</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={result.acceptUrl} aria-label="Invitation link" className="input !min-h-[40px] text-xs" />
            <button
              type="button"
              className="btn-quiet !min-h-[40px]"
              onClick={async () => {
                await navigator.clipboard?.writeText(result.acceptUrl).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RevokeInviteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn-quiet !min-h-[36px] !px-3 text-danger"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm("Withdraw this invitation? The link will stop working.")) return;
          setPending(true);
          const res = await callApi(`/api/team/invites/${id}`, "DELETE");
          setPending(false);
          if (!res.ok) return setError(res.error?.message ?? "Could not withdraw it.");
          router.refresh();
        }}
      >
        Withdraw
      </button>
      {error ? <span role="alert" className="ml-2 text-xs text-danger">{error}</span> : null}
    </>
  );
}
