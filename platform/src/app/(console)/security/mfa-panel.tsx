"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JsonForm, callApi } from "@/components/json-form";

export function MfaPanel(props: { enabled: boolean; since: string | null }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (props.enabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm">Turned on{props.since ? ` since ${props.since}` : ""}.</p>
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">Turn off two-factor authentication</summary>
          <div className="mt-3">
            <JsonForm
              endpoint="/api/account/mfa"
              toBody={(v) => ({ step: "disable", password: v.password })}
              submitLabel="Turn off"
              fields={[
                {
                  name: "password",
                  label: "Confirm with your password",
                  type: "password",
                  required: true,
                  autoComplete: "current-password",
                  help: "Roles that need it will be locked out of publishing and approvals until you turn it back on.",
                },
              ]}
            />
          </div>
        </details>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const res = await callApi<{ secret: string; uri: string }>("/api/account/mfa", "POST", { step: "begin" });
            setPending(false);
            if (!res.ok || !res.data) return setError(res.error?.message ?? "Could not start setup.");
            const qr = await QRCode.toDataURL(res.data.uri, { margin: 1, width: 192 });
            setSetup({ ...res.data, qr });
          }}
        >
          {pending ? "Working…" : "Set up two-factor authentication"}
        </button>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open your authenticator app and add an account by scanning this code.</li>
        <li>Enter the 6-digit code it shows to finish.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code for your authenticator app" width={192} height={192} className="rounded-lg border border-line bg-white p-1" />
      <p className="text-xs text-muted">
        Can&apos;t scan? Enter this key manually: <code className="select-all break-all rounded bg-surface px-1">{setup.secret}</code>
      </p>
      <JsonForm
        endpoint="/api/account/mfa"
        toBody={(v) => ({ step: "confirm", code: v.code })}
        submitLabel="Turn on"
        onSuccess={() => setSetup(null)}
        then={{ redirect: "/security" }}
        fields={[
          {
            name: "code",
            label: "6-digit code",
            required: true,
            inputMode: "numeric",
            autoComplete: "one-time-code",
            placeholder: "123 456",
          },
        ]}
      />
    </div>
  );
}
