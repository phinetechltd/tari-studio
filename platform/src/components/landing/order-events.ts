"use client";

/**
 * The pricing calculator and the Studio demo pre-fill the order form. They are
 * separate islands on a server-rendered page, so they talk through one DOM event.
 */

export interface OrderPrefill {
  kind: "IMAGE" | "VIDEO" | "QUOTE";
  images?: number;
  seconds?: number;
  brief?: string;
  aspectRatio?: string;
}

export const ORDER_PREFILL_EVENT = "order:prefill";

export function prefillOrder(detail: OrderPrefill): void {
  window.dispatchEvent(new CustomEvent<OrderPrefill>(ORDER_PREFILL_EVENT, { detail }));
  document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: { issues?: Array<{ path: string; message: string }> } };
}

/** fetch + JSON envelope, with a readable message for every failure. */
export async function callApi<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string; fields?: Record<string, string> }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    return { error: "No connection. Check your internet and try again." };
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (res.ok && body?.ok) return { data: body.data };
  const fields: Record<string, string> = {};
  for (const issue of body?.error?.details?.issues ?? []) {
    if (issue.path && !fields[issue.path]) fields[issue.path] = issue.message;
  }
  return {
    error: body?.error?.message ?? `Something went wrong (${res.status}). Please try again.`,
    fields: Object.keys(fields).length ? fields : undefined,
  };
}
