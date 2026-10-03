"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

/**
 * A small form that POSTs JSON to one of our own endpoints and speaks the API's
 * `{ ok, data | error }` envelope. It exists so every console form gets the same
 * behaviour: a disabled button while pending, the server's own error message
 * (never a generic one), and inputs that are 44 px tall for thumbs.
 *
 * Used from client components only — its callbacks are functions.
 */

export interface FormField {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  help?: string;
  defaultValue?: string;
  inputMode?: "numeric" | "text" | "email";
}

export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export async function callApi<T = unknown>(
  url: string,
  method: string,
  body?: unknown,
): Promise<ApiEnvelope<T> & { status: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (json && typeof json.ok === "boolean") return { ...json, status: res.status };
    return { ok: false, status: res.status, error: { code: "BAD_RESPONSE", message: "The server sent an unexpected response." } };
  } catch {
    return { ok: false, status: 0, error: { code: "NETWORK", message: "Could not reach the server. Check your connection and try again." } };
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function JsonForm<T = unknown>(props: {
  endpoint: string;
  method?: string;
  fields: FormField[];
  submitLabel: string;
  /** Build the request body from the raw field values. */
  toBody?: (values: Record<string, string>) => unknown;
  onSuccess?: (data: T) => void;
  /** After success: refresh the page's server data, or navigate. */
  then?: "refresh" | { redirect: string } | "none";
  successMessage?: string;
  footer?: ReactNode;
  /** Prefix for field ids; only needed when two forms with the same endpoint and label share a page. */
  idPrefix?: string;
}) {
  const router = useRouter();
  // Deterministic, not useId(): the dev-only Next devtools wrappers shift useId
  // paths between the server render and hydration (a mismatch warning on every
  // console form). Ids built from props are the same on both sides.
  const formId = props.idPrefix ?? `form-${slug(props.endpoint)}-${slug(props.submitLabel)}`;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setDone(null);

    const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const res = await callApi<T>(props.endpoint, props.method ?? "POST", props.toBody ? props.toBody(values) : values);
    setPending(false);

    if (!res.ok) {
      setError(res.error?.message ?? "Something went wrong.");
      return;
    }
    if (props.successMessage) setDone(props.successMessage);
    props.onSuccess?.(res.data as T);
    const then = props.then ?? "refresh";
    if (then === "refresh") router.refresh();
    else if (typeof then === "object") router.push(then.redirect);
    if (then !== "none" && typeof then !== "object") (e.target as HTMLFormElement).reset?.();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      {props.fields.map((f) => {
        const id = `${formId}-${f.name}`;
        return (
          <div key={f.name}>
            <label htmlFor={id} className="label">
              {f.label}
            </label>
            {f.type === "select" ? (
              <select id={id} name={f.name} defaultValue={f.defaultValue} required={f.required} className="input">
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={f.defaultValue}
                required={f.required}
                autoComplete={f.autoComplete}
                placeholder={f.placeholder}
                inputMode={f.inputMode}
                className="input"
                aria-describedby={f.help ? `${id}-help` : undefined}
              />
            )}
            {f.help ? (
              <p id={`${id}-help`} className="mt-1 text-xs text-muted">
                {f.help}
              </p>
            ) : null}
          </div>
        );
      })}

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {done}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "Working…" : props.submitLabel}
      </button>
      {props.footer}
    </form>
  );
}
