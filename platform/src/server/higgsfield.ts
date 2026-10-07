import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";
import { normaliseStatus, outputUrl, type GenerationMode, type RemoteStatus } from "@/lib/generation-models";
import { providerName } from "@/lib/providers";

/**
 * Talks to the Higgsfield API (docs.higgsfield.ai): submit a request, then poll
 * `/requests/{id}/status` until it completes. Plain fetch against the documented
 * REST API rather than `@higgsfield/client`, whose v2 client can only submit or
 * block until done; the worker needs a separate status call it can schedule.
 *
 * A simulator stands in during development and tests (GENERATION_PROVIDER=
 * simulator): it "finishes" after a few seconds with the bundled sample media,
 * and a prompt containing "[fail]" fails, so refunds can be exercised.
 */

export class GenerationProviderError extends Error {
  constructor(
    message: string,
    /** False when retrying cannot help (bad key, no credits, rejected input) */
    readonly retryable: boolean,
    /** The provider account has no credits left (HTTP 403) */
    readonly outOfCredits = false,
  ) {
    super(message);
    this.name = "GenerationProviderError";
  }
}

export interface RemoteState {
  status: RemoteStatus;
  url: string | null;
  raw: unknown;
}

/** What the provider says a request will cost, before it is sent. */
export interface CostEstimate {
  /** Thousandths of a provider credit */
  milliCredits: number;
  /** USD micro-units, when given */
  usdMicros: number | null;
}

export interface GenerationProvider {
  readonly name: "higgsfield" | "simulator";
  /** Whose credits pay: the platform's account, or an organisation's own saved key */
  readonly billedTo: "platform" | "organization";
  submit(endpoint: string, input: Record<string, unknown>, mode: GenerationMode): Promise<string>;
  status(requestId: string): Promise<RemoteState>;
  /** The cost of a request, from POST /estimate/{endpoint} (same body as the request). Null when unavailable. */
  estimate(endpoint: string, input: Record<string, unknown>, mode: GenerationMode): Promise<CostEstimate | null>;
  /**
   * Hands the provider a picture and returns the public URL to pass as `image_url`
   * (docs.higgsfield.ai, "File uploads": generate-upload-url, then PUT to the presigned URL).
   */
  uploadImage(bytes: Uint8Array, mimeType: string): Promise<string>;
}

/** "1.500" credits, "0.094" dollars → integers. Null for anything unreadable. */
export function parseEstimate(body: unknown): CostEstimate | null {
  const b = body as { credits?: unknown; usd?: unknown } | null;
  const credits = Number(b?.credits);
  if (!b || !Number.isFinite(credits) || credits < 0) return null;
  const usd = Number(b.usd);
  return { milliCredits: Math.round(credits * 1000), usdMicros: Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1_000_000) : null };
}

const BASE = "https://api.higgsfield.ai";

function describeHttpError(status: number, body: unknown): GenerationProviderError {
  const detail =
    typeof (body as { detail?: unknown })?.detail === "string"
      ? (body as { detail: string }).detail
      : JSON.stringify((body as { detail?: unknown })?.detail ?? body ?? "").slice(0, 300);
  if (status === 401) return new GenerationProviderError("The generation service rejected our API key.", false);
  if (status === 403) return new GenerationProviderError("The generation account is out of credits.", false, true);
  if (status === 400 || status === 422) {
    return new GenerationProviderError(`The generation service rejected the request: ${detail}`, false);
  }
  if (status === 429) return new GenerationProviderError("The generation service is busy. Retrying.", true);
  return new GenerationProviderError(`The generation service returned ${status}.`, status >= 500);
}

function higgsfield(credentials: string, billedTo: GenerationProvider["billedTo"] = "platform"): GenerationProvider {
  const headers = { Authorization: `Key ${credentials}`, "Content-Type": "application/json", Accept: "application/json" };

  return {
    name: "higgsfield",
    billedTo,

    async estimate(endpoint, input) {
      try {
        const res = await fetch(`${BASE}/estimate/${endpoint}`, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        return parseEstimate(await res.json().catch(() => null));
      } catch {
        return null; // an estimate is bookkeeping; never a reason to fail the render
      }
    },

    async uploadImage(bytes, mimeType) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/files/generate-upload-url`, {
          method: "POST",
          headers,
          body: JSON.stringify({ content_type: mimeType }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        throw new GenerationProviderError(`Could not reach the generation service (${(e as Error).message}).`, true);
      }
      const body = (await res.json().catch(() => null)) as { upload_url?: string; public_url?: string; headers?: Record<string, string> } | null;
      if (!res.ok) throw describeHttpError(res.status, body);
      if (!body?.upload_url || !body.public_url) throw new GenerationProviderError("The generation service did not return an upload link.", true);
      try {
        // The presigned link is not ours to sign: never send the API key to it.
        const put = await fetch(body.upload_url, {
          method: "PUT",
          headers: { "Content-Type": mimeType, ...(body.headers ?? {}) },
          body: new Uint8Array(bytes),
          signal: AbortSignal.timeout(60_000),
        });
        if (!put.ok) throw new GenerationProviderError(`Sending the picture failed (HTTP ${put.status}).`, put.status >= 500);
      } catch (e) {
        if (e instanceof GenerationProviderError) throw e;
        throw new GenerationProviderError(`Could not send the picture (${(e as Error).message}).`, true);
      }
      return body.public_url;
    },

    async submit(endpoint, input) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/${endpoint}`, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (e) {
        throw new GenerationProviderError(`Could not reach the generation service (${(e as Error).message}).`, true);
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw describeHttpError(res.status, body);
      const requestId = (body as { request_id?: string; id?: string } | null)?.request_id ?? (body as { id?: string })?.id;
      if (!requestId) throw new GenerationProviderError("The generation service did not return a request id.", true);
      return requestId;
    },

    async status(requestId) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/requests/${encodeURIComponent(requestId)}/status`, {
          headers,
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        throw new GenerationProviderError(`Could not reach the generation service (${(e as Error).message}).`, true);
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw describeHttpError(res.status, body);
      return { status: normaliseStatus((body as { status?: unknown } | null)?.status), url: outputUrl(body), raw: body };
    },
  };
}

/** Bundled sample media the simulator "generates" (copied into public/showcase). */
const SAMPLES = {
  IMAGE: "sim://showcase/tari-poster.jpg",
  VIDEO: "sim://showcase/tari-spot-5s.mp4",
};

function simulator(delayMs = Number(process.env.SIMULATOR_GEN_MS ?? 8000)): GenerationProvider {
  return {
    name: "simulator",
    billedTo: "platform",
    // Plausible, fixed figures so the admin's AI page has numbers in development.
    async estimate(_endpoint, input, mode) {
      if (mode === "image") return { milliCredits: 1500, usdMicros: 94_000 };
      const seconds = Number(input.duration) || 5;
      return { milliCredits: seconds * 1250, usdMicros: seconds * 78_000 };
    },
    async uploadImage(bytes) {
      // A stand-in link: the simulator never reads it.
      return `sim://upload/${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`;
    },
    async submit(_endpoint, input, mode) {
      const fails = typeof input.prompt === "string" && input.prompt.includes("[fail]");
      const media = mode === "image" ? "IMAGE" : "VIDEO";
      return `sim_${media}_${fails ? "F" : "S"}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    },
    async status(requestId) {
      const [, media, outcome, at] = requestId.split("_");
      if (Date.now() - Number(at) < delayMs) return { status: "in_progress", url: null, raw: null };
      if (outcome === "F") return { status: "failed", url: null, raw: { status: "failed", detail: "Simulated failure" } };
      const url = media === "IMAGE" ? SAMPLES.IMAGE : SAMPLES.VIDEO;
      return { status: "completed", url, raw: { status: "completed" } };
    },
  };
}

/** The provider for new generations. Refuses the simulator in production. */
export function generationProvider(): GenerationProvider {
  if (providerName("GENERATION") === "simulator") return simulator();
  const credentials = env().HF_CREDENTIALS;
  if (!credentials || !credentials.includes(":")) {
    throw new GenerationProviderError("Generation is not configured: set HF_CREDENTIALS to KEY_ID:KEY_SECRET.", false);
  }
  return higgsfield(credentials);
}

/**
 * The provider for an organisation's generations: generation is platform-managed,
 * so every organisation runs on the deployment's HF_CREDENTIALS. The
 * organizationId stays in the signature for the callers and for metering; it no
 * longer selects a key.
 */
export async function generationProviderFor(organizationId: string): Promise<GenerationProvider> {
  void organizationId;
  if (providerName("GENERATION") === "simulator") return simulator();
  const credentials = env().HF_CREDENTIALS;
  if (!credentials || !credentials.includes(":")) {
    throw new GenerationProviderError("Generation is not configured: the platform admin sets HF_CREDENTIALS (console Deployment keys or the server .env).", false);
  }
  return higgsfield(credentials, "platform");
}

/**
 * The provider an existing request belongs to, judged by its id. A request
 * started on the simulator is never re-checked against Higgsfield. Generation
 * is platform-managed: the deployment's credentials handle every request.
 */
export async function providerForRequest(requestId: string, organizationId?: string): Promise<GenerationProvider> {
  void organizationId;
  if (requestId.startsWith("sim_")) return simulator();
  return generationProvider();
}
