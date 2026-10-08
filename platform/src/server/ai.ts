import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { costMicros, DEFAULT_MODEL, DEFAULT_QUICK_MODEL, parseChain, supportsEffort, type ChainEntry } from "@/lib/ai-models";
import { auditAs } from "@/lib/audit";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { StandInProviderError, providerName } from "@/lib/providers";
import type { Principal } from "@/lib/rbac";
import { ApiError } from "@/lib/api";
import { effectiveLimits } from "@/lib/limits";

import { claimAlert, monthKeyEAT, monthStartEAT, textUsageMicros } from "./ai-credits";
import { notify } from "./notify";

/**
 * Text generation: captions, briefs, WhatsApp replies.
 *
 * One public entry point per caller shape — `generateAi` for a signed-in person,
 * `generateForOrganization` for the worker (automations have no principal) —
 * both licence-checked, metered into AiUsage and costed from the provider's own
 * token counts.
 *
 * AI is platform-managed: every organisation runs on the keys the platform's
 * admin saved (console Deployment keys, or the server .env). Agencies
 * configure their own social media apps, never AI or payment credentials, and a
 * plan's tier only changes quotas and allowances — never the key that runs.
 *
 * Providers are tried in the order AI_FALLBACK_CHAIN gives (default: just
 * AI_PROVIDER). A timeout or outage moves to the next; a refusal does not, since
 * asking a second model the same thing is not what a refusal should mean.
 */

export interface AiResult {
  text: string;
  requestId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
}

export interface AiGenerateOptions {
  /** A specific model; otherwise the chain's (or the tier's) default. */
  model?: string;
  /** "quick" routes to the cheaper model: classification, one-line copy. */
  tier?: "standard" | "quick";
  maxTokens?: number;
  system?: string;
  /** For AiUsage.feature: "caption", "whatsapp_reply", "test", … */
  feature?: string;
  brandId?: string | null;
  /**
   * Whose AiUsage row and allowance this is. All keys are the platform's;
   * the id exists for metering and limits only.
   */
  organizationId?: string | null;
}

export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export class AiRefusedError extends Error {
  constructor() {
    super("The model declined this request. Rephrase it or write the text yourself.");
    this.name = "AiRefusedError";
  }
}

/**
 * Every configured provider failed. The public message is deliberately generic
 * ("AI is temporarily unavailable. You can continue manually."); the real
 * failure — provider, model, HTTP status — is written to the log with the same
 * requestId, so support can pair a user's report with `service:"ai"` entries.
 */
export class AiUnavailableError extends Error {
  readonly requestId = crypto.randomUUID();
  constructor(readonly failureDetail: string) {
    super("AI is temporarily unavailable. You can continue manually.");
    this.name = "AiUnavailableError";
  }
}

/** One provider's call failed, carrying the structure the log line needs. */
class AiProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly model: string,
    readonly httpStatus: number | null,
    message: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

function failureMeta(error: unknown): { httpStatus: number | null; reason: string } {
  if (error instanceof AiProviderError) return { httpStatus: error.httpStatus, reason: error.message.slice(0, 300) };
  if (error instanceof Anthropic.APIError) return { httpStatus: error.status ?? null, reason: describe(error) };
  return { httpStatus: null, reason: describe(error) };
}

/**
 * One JSON line per AI call outcome: feature, provider, model, HTTP status,
 * latency and a failure reason. The field list is fixed here on purpose — API
 * keys, prompts and responses must never be logged.
 */
export function logAiEvent(event: {
  level: "info" | "error";
  feature: string;
  provider?: string;
  model?: string;
  httpStatus?: number | null;
  latencyMs?: number;
  requestId?: string;
  organizationId?: string | null;
  reason?: string;
}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), service: "ai", ...event });
  if (event.level === "error") console.error(line);
  else console.info(line);
}

interface ProviderCall {
  prompt: string;
  model: string;
  maxTokens: number;
  system?: string;
}

type ProviderOutput = Omit<AiResult, "latencyMs" | "provider">;

// ── anthropic ────────────────────────────────────────────────────────────

/** One client per key: an org's key and the deployment's must not share state. */
const anthropicClients = new Map<string, Anthropic>();

function anthropic(apiKey: string): Anthropic {
  let client = anthropicClients.get(apiKey);
  if (!client) {
    client = new Anthropic({
      apiKey,
      // Pinned, so an ANTHROPIC_BASE_URL inherited from a developer's shell can
      // never reroute production traffic. ANTHROPIC_API_URL overrides on purpose.
      baseURL: process.env.ANTHROPIC_API_URL?.trim() || "https://api.anthropic.com",
      timeout: env().AI_TIMEOUT_SEC * 1000,
      maxRetries: 2,
    });
    anthropicClients.set(apiKey, client);
  }
  return client;
}

async function callAnthropic({ prompt, model, maxTokens, system }: ProviderCall): Promise<ProviderOutput> {
  // The platform admin's console key or the .env value — env() merges those two.
  const key = env().ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AiNotConfiguredError("ANTHROPIC_API_KEY is not set.");
  const response = await anthropic(key).messages.create({
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    // Short marketing copy does not need deep reasoning; low effort keeps a
    // WhatsApp reply to a few seconds. Haiku rejects the parameter, so it is
    // only sent where accepted.
    ...(supportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") throw new AiRefusedError();

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  return {
    text,
    requestId: response.id,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

// ── nvidia NIM (OpenAI-compatible endpoint) ──────────────────────────────

/**
 * Friendly names the settings screen may hold, mapped to NVIDIA's *hosted*
 * model ids. The hosted API (integrate.api.nvidia.com) only knows the full
 * catalogue ids ("…-120b-a12b") — the short aliases are vLLM
 * `--served-model-name` values for self-hosted NIMs, and they get a 404 from
 * the hosted endpoint. Anything not listed passes through untouched, so an
 * admin can always paste a full id directly.
 */
export const NVIDIA_MODEL_MAP: Record<string, string> = {
  "nvidia-nemotron-3-nano": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "nvidia-nemotron-3-super": "nvidia/nemotron-3-super-120b-a12b",
  "nvidia-nemotron-3-ultra": "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia-k3": "moonshotai/kimi-k3",
  "nvidia-k3:free": "moonshotai/kimi-k3",
};

export function resolveModel(model: string): string {
  return NVIDIA_MODEL_MAP[model] ?? model;
}

/** The default chat model for NVIDIA: Kimi K3 is multimodal, so one default serves text and image work. */
export const NVIDIA_DEFAULT_MODEL = "moonshotai/kimi-k3";
/** Cheaper model for one-line tasks (classification, short copy). */
export const NVIDIA_QUICK_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

async function callNvidia({ prompt, model, maxTokens, system }: ProviderCall): Promise<ProviderOutput> {
  const apiKey = env().NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new AiNotConfiguredError("NVIDIA_API_KEY is not set.");

  const resolved = resolveModel(model);
  let response: Response;
  try {
    response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolved,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(env().AI_TIMEOUT_SEC * 1000),
    });
  } catch (e) {
    throw new AiProviderError("nvidia", resolved, null, `NVIDIA request failed: ${describe(e)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiProviderError("nvidia", resolved, response.status, `NVIDIA API error ${response.status}: ${body.slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    id: string;
    model?: string;
    choices: Array<{ message: { content: string | null } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: (json.choices[0]?.message.content ?? "").trim(),
    requestId: json.id,
    model: json.model ?? resolveModel(model),
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

// ── fixtures (development and CI stand-in; refused in production) ─────────

async function callFixtures({ prompt, model }: ProviderCall): Promise<ProviderOutput> {
  const subject = prompt.replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    text: `[fixtures] ${subject}${prompt.length > 80 ? "…" : ""}`,
    requestId: `fixtures_${crypto.randomUUID()}`,
    model,
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

const CALLERS: Record<ChainEntry["provider"], (call: ProviderCall) => Promise<ProviderOutput>> = {
  anthropic: callAnthropic,
  nvidia: callNvidia,
  fixtures: callFixtures,
};

// ── chain ────────────────────────────────────────────────────────────────

export function aiChain(): ChainEntry[] {
  const e = env();
  const chain = parseChain(e.AI_FALLBACK_CHAIN, providerName("AI"));
  // The production stand-in rule applies to every link of the chain, not just the first.
  if (process.env.NODE_ENV === "production" && chain.some((c) => c.provider === "fixtures")) {
    throw new StandInProviderError("AI", "fixtures");
  }
  return chain;
}

export function defaultModelFor(entry: ChainEntry, tier: "standard" | "quick"): string {
  if (entry.model) return resolveModel(entry.model);
  const e = env();
  if (entry.provider === "anthropic") {
    return tier === "quick" ? e.AI_CHEAP_MODEL || DEFAULT_QUICK_MODEL : e.AI_MODEL || DEFAULT_MODEL;
  }
  if (entry.provider === "nvidia") return tier === "quick" ? NVIDIA_QUICK_MODEL : NVIDIA_DEFAULT_MODEL;
  return "fixtures";
}

/**
 * Runs the platform's chain without metering. Callers below record usage.
 * A per-entry failure is logged with its HTTP status; when nothing answered,
 * callers get AiNotConfiguredError (no keys anywhere) or AiUnavailableError
 * (outages, dead model ids) whose requestId pairs with the log lines.
 */
async function runChain(prompt: string, options: AiGenerateOptions): Promise<AiResult> {
  const chain = aiChain();
  const failures: string[] = [];
  for (const entry of chain) {
    const model =
      options.model && entry === chain[0]
        ? resolveModel(options.model)
        : defaultModelFor(entry, options.tier ?? "standard");
    const started = Date.now();
    try {
      const out = await CALLERS[entry.provider]({
        prompt,
        model,
        maxTokens: options.maxTokens ?? 4000,
        system: options.system,
      });
      if (!out.text) throw new AiProviderError(entry.provider, model, null, "The model returned no text.");
      logAiEvent({
        level: "info",
        feature: options.feature ?? "generate",
        provider: entry.provider,
        model: out.model,
        latencyMs: Date.now() - started,
        requestId: out.requestId,
        organizationId: options.organizationId ?? null,
      });
      return { ...out, provider: entry.provider, latencyMs: Date.now() - started };
    } catch (error) {
      if (error instanceof AiRefusedError) throw error;
      const meta = failureMeta(error);
      failures.push(`${entry.provider}:${model}${meta.httpStatus ? ` (HTTP ${meta.httpStatus})` : ""}: ${meta.reason}`);
      logAiEvent({
        level: "error",
        feature: options.feature ?? "generate",
        provider: entry.provider,
        model,
        httpStatus: meta.httpStatus,
        latencyMs: Date.now() - started,
        organizationId: options.organizationId ?? null,
        reason: meta.reason,
      });
    }
  }
  const allUnconfigured = failures.every((f) => f.includes("is not set"));
  const message = `No AI provider answered. ${failures.join(" | ")}`;
  if (allUnconfigured) throw new AiNotConfiguredError(message);
  const error = new AiUnavailableError(message);
  logAiEvent({
    level: "error",
    feature: options.feature ?? "generate",
    organizationId: options.organizationId ?? null,
    requestId: error.requestId,
    reason: "chain exhausted; " + message,
  });
  throw error;
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.APIError) return `${error.status ?? "network"} ${error.message}`.slice(0, 300);
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

async function meter(organizationId: string, result: AiResult, options: AiGenerateOptions): Promise<void> {
  await db.aiUsage.create({
    data: {
      organizationId,
      brandId: options.brandId ?? null,
      feature: options.feature ?? "generate",
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens,
      costMicros: costMicros(result.model, result),
      requestId: result.requestId,
    },
  });
}

/**
 * The organisation's monthly AI allowance (plan limit `aiCreditsMicros`, in US
 * dollar micro-units of provider cost). Every organisation runs on the
 * platform's AI keys, so the plan's limit always applies unless it is null.
 * Reaching it tells the owners once a month and refuses further calls with 402.
 */
export async function assertAiAllowance(organizationId: string, now = new Date()): Promise<void> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { plan: true, limitsOverride: true } });
  if (!org) return;
  const limit = effectiveLimits(org.plan, org.limitsOverride).aiCreditsMicros;
  if (limit === null) return;
  const used = await textUsageMicros(monthStartEAT(now), organizationId);
  if (used < limit) return;
  if (await claimAlert(`ai-limit:${organizationId}:${monthKeyEAT(now)}`)) {
    await notify({
      event: "ai.limit_reached",
      organizationId,
      title: "This month's AI writing allowance is used up",
      body: `Captions, replies and briefs used US$${(used / 1_000_000).toFixed(2)} of the plan's US$${(limit / 1_000_000).toFixed(2)}. It resets on the 1st; a bigger plan raises it.`,
      href: "/billing",
    }).catch((error) => console.error("[ai] limit notice", error));
  }
  throw new ApiError(402, "AI_LIMIT", "This month's AI writing allowance is used up. It resets on the 1st, or upgrade your plan for more.", {
    usedMicros: used,
    limitMicros: limit,
  });
}

/** A signed-in person asking for text. Checks the AI licence, meters, audits. */
export async function generateAi(input: string, options: AiGenerateOptions, principal: Principal): Promise<AiResult> {
  if (principal.role !== "SUPER_ADMIN" && !principal.enabledModules.has("AI_CONTENT")) {
    throw new Error("AI_CONTENT module is not licensed to this organisation.");
  }
  if (!principal.organizationId) throw new Error("AI generation happens inside an organisation.");
  await assertAiAllowance(principal.organizationId);
  const result = await runChain(input, { ...options, organizationId: principal.organizationId });
  await meter(principal.organizationId, result, options);
  await auditAs(principal, "AI_GENERATE", "AiUsage", result.requestId, {
    feature: options.feature ?? "generate",
    provider: result.provider,
    model: result.model,
    outputTokens: result.outputTokens,
  });
  return result;
}

/** The worker asking on an organisation's behalf (automations). Licence read from the database. */
export async function generateForOrganization(
  organizationId: string,
  input: string,
  options: AiGenerateOptions,
): Promise<AiResult> {
  const licensed = await db.organizationModule.findFirst({
    where: { organizationId, moduleKey: "AI_CONTENT", enabled: true },
    select: { id: true },
  });
  if (!licensed) throw new Error("AI_CONTENT module is not licensed to this organisation.");
  await assertAiAllowance(organizationId);
  const result = await runChain(input, { ...options, organizationId });
  await meter(organizationId, result, options);
  return result;
}

/**
 * An operator's connectivity probe (scripts/check-providers.ts): one short call
 * through the configured chain, not metered to any organisation.
 */
export async function probeAi(): Promise<AiResult> {
  return runChain("Reply with exactly one word: Connected", { maxTokens: 200, tier: "standard", feature: "probe" });
}

/**
 * One live call to a specific provider and model, for the admin's "Test
 * connections": proves the exact model id answers, not just that some entry in
 * the chain does. Unmetered; failures carry the provider's HTTP status.
 */
export async function probeProvider(provider: ChainEntry["provider"], model: string): Promise<AiResult> {
  if (process.env.NODE_ENV === "production" && provider === "fixtures") throw new StandInProviderError("AI", "fixtures");
  const started = Date.now();
  try {
    const out = await CALLERS[provider]({ prompt: "Reply with exactly one word: Connected", model, maxTokens: 50 });
    if (!out.text) throw new AiProviderError(provider, model, null, "The model returned no text.");
    return { ...out, provider, latencyMs: Date.now() - started };
  } catch (error) {
    const meta = failureMeta(error);
    logAiEvent({ level: "error", feature: "probe", provider, model, httpStatus: meta.httpStatus, latencyMs: Date.now() - started, reason: meta.reason });
    throw error;
  }
}

/** What the settings screen shows: never a key, only whether one is loaded. */
export function aiStatus() {
  const e = env();
  let chain: ChainEntry[] = [];
  let error: string | null = null;
  try {
    chain = aiChain();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return {
    chain: chain.map((c) => ({
      provider: c.provider,
      model: defaultModelFor(c, "standard"),
      quickModel: defaultModelFor(c, "quick"),
      keyLoaded:
        c.provider === "anthropic"
          ? Boolean(e.ANTHROPIC_API_KEY?.trim())
          : c.provider === "nvidia"
            ? Boolean(e.NVIDIA_API_KEY?.trim())
            : true,
    })),
    timeoutSec: e.AI_TIMEOUT_SEC,
    error,
  };
}

export function getAiProviderName(): string {
  return providerName("AI");
}

// ── chat (the in-app assistant) ──────────────────────────────────────────

export interface ChatImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataBase64: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

export interface ChatInput {
  system: string;
  messages: ChatMessage[];
  /** "platform" = the deployment's own chain (AI_PROVIDER / AI_FALLBACK_CHAIN) */
  provider: "anthropic" | "nvidia" | "platform";
  /** Empty = the provider's default */
  model?: string;
  maxTokens: number;
  organizationId: string;
  feature: string;
  /** Whether pictures may be sent to this model */
  vision: boolean;
}

type ChatCall = Omit<ChatInput, "provider" | "organizationId" | "feature"> & { model: string };

async function chatAnthropic(call: ChatCall): Promise<ProviderOutput> {
  const key = env().ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AiNotConfiguredError("ANTHROPIC_API_KEY is not set.");
  const response = await anthropic(key).messages.create({
    model: call.model,
    max_tokens: call.maxTokens,
    system: call.system,
    ...(supportsEffort(call.model) ? { output_config: { effort: "low" as const } } : {}),
    messages: call.messages.map((m) => ({
      role: m.role,
      content:
        m.images?.length && call.vision
          ? [
              ...m.images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mimeType, data: img.dataBase64 } })),
              { type: "text" as const, text: m.content || "(picture attached)" },
            ]
          : m.content,
    })),
  });
  if (response.stop_reason === "refusal") throw new AiRefusedError();
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return {
    text,
    requestId: response.id,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

async function chatNvidia(call: ChatCall): Promise<ProviderOutput> {
  const apiKey = env().NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new AiNotConfiguredError("NVIDIA_API_KEY is not set.");
  const resolved = resolveModel(call.model);
  let response: Response;
  try {
    response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolved,
        messages: [
          { role: "system", content: call.system },
          ...call.messages.map((m) => ({
            role: m.role,
            content:
              m.images?.length && call.vision
                ? [
                    { type: "text", text: m.content || "(picture attached)" },
                    ...m.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` } })),
                  ]
                : m.content,
          })),
        ],
        max_tokens: call.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(env().AI_TIMEOUT_SEC * 1000),
    });
  } catch (e) {
    throw new AiProviderError("nvidia", resolved, null, `NVIDIA request failed: ${describe(e)}`);
  }
  if (!response.ok) {
    throw new AiProviderError("nvidia", resolved, response.status, `NVIDIA API error ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    id: string;
    model?: string;
    choices: Array<{ message: { content: string | null } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: (json.choices[0]?.message.content ?? "").trim(),
    requestId: json.id,
    model: json.model ?? resolveModel(call.model),
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

/**
 * Development and CI stand-in for the assistant: a few keyword rules that answer in the assistant's JSON
 * shape, so every screen and tool can be tried without a model. Refused in production like every stand-in.
 */
async function chatFixtures(call: ChatCall): Promise<ProviderOutput> {
  const last = call.messages[call.messages.length - 1];
  const said = (last?.content ?? "").replace(/<untrusted[\s\S]*?<\/untrusted>/g, "").trim();
  const lower = said.toLowerCase();
  const hasTool = (k: string) => call.system.includes(`- ${k}:`);
  const after = (re: RegExp) => re.exec(said)?.[1]?.trim();
  // The image → form service asks for bare suggestions JSON: answer with a
  // sample set, so every upload-and-fill screen can be tried without a model.
  if (/reply with only compact json/i.test(call.system)) {
    const text = JSON.stringify({
      title: "Fresh market basket",
      description: "A colourful basket of fresh produce, picked this morning and ready for your shop.",
      caption: "Fresh from the market this morning. Visit us for the best prices in town.",
      keywords: ["fresh produce", "market day", "farm fresh"],
      hashtags: ["#FreshProduce", "#MarketDay", "#FarmFresh"],
    });
    return { text, requestId: `fixtures_${crypto.randomUUID()}`, model: call.model, inputTokens: Math.ceil((call.system.length + said.length) / 4), outputTokens: Math.ceil(text.length / 4), cacheReadTokens: 0, cacheWriteTokens: 0 };
  }
  let out: { message: string; calls: Array<{ tool: string; args: Record<string, unknown> }> };
  if (/^tool results/i.test(said)) {
    out = { message: "Here is what I found. Tell me what you would like to do next.", calls: [] };
  } else if (hasTool("create_character") && /character/.test(lower)) {
    const name = after(/character(?: called| named)?:?\s*([A-Z][\w' -]{1,30}?)(?:[,.:]|\s+-|\s+who|$)/) ?? "New character";
    out = { message: `I can create ${name}. Check the details below and press Apply.`, calls: [{ tool: "create_character", args: { name, description: said.slice(0, 300), useUploadedPicture: Boolean(last?.images?.length) } }] };
  } else if (hasTool("update_brand") && /brand/.test(lower) && (last?.images?.length || /fill|slogan|logo/.test(lower))) {
    out = { message: "I filled in what I could see. Check it and press Apply.", calls: [{ tool: "update_brand", args: { slogan: "Quality you can trust", voice: "Warm and friendly", colors: "to be confirmed" } }] };
  } else if (hasTool("improve_prompt") && /prompt|better|improve/.test(lower)) {
    out = { message: "Here is a stronger prompt.", calls: [{ tool: "improve_prompt", args: { prompt: `${said.replace(/^(make|improve)[^:]*:\s*/i, "").slice(0, 400)}, natural light, sharp focus, clean background`, kind: "image" } }] };
  } else if (hasTool("create_image") && /image|picture|photo/.test(lower)) {
    out = { message: "I have prepared this image in the Studio; you see the price before anything is charged.", calls: [{ tool: "create_image", args: { prompt: said.slice(0, 400), aspectRatio: "1:1" } }] };
  } else if (hasTool("create_template") && /template/.test(lower)) {
    out = { message: "Here is a template you could start from.", calls: [{ tool: "create_template", args: { title: "Fresh and simple", description: said.slice(0, 300) || "A clean template for product photos.", promptHint: "Bright, simple, product centred" } }] };
  } else if (hasTool("list_brands") && /my brands?|which brands?/.test(lower)) {
    out = { message: "Let me look at your brands.", calls: [{ tool: "list_brands", args: {} }] };
  } else {
    out = { message: "I can fill in your brand, create characters and templates, and improve prompts. What would you like to do?", calls: [] };
  }
  const text = JSON.stringify(out);
  return { text, requestId: `fixtures_${crypto.randomUUID()}`, model: call.model, inputTokens: Math.ceil((call.system.length + said.length) / 4), outputTokens: Math.ceil(text.length / 4), cacheReadTokens: 0, cacheWriteTokens: 0 };
}

const CHAT_CALLERS: Record<ChainEntry["provider"], (call: ChatCall) => Promise<ProviderOutput>> = {
  anthropic: chatAnthropic,
  nvidia: chatNvidia,
  fixtures: chatFixtures,
};

/** Replaces the model in tests (a scripted answer), or null to go back to the real providers. */
let chatTransportOverride: ((call: ChatInput) => Promise<{ text: string; model?: string }>) | null = null;
export function setChatTransportForTests(fn: typeof chatTransportOverride): void {
  chatTransportOverride = fn;
}

/**
 * One assistant turn. The platform's own keys are used (never an organisation's), the call is metered into
 * AiUsage under the organisation, and a failing or unconfigured provider falls through to the next in the chain.
 *
 * The deployment chain is evaluated defensively: when the tier carries an
 * explicit provider (assistant config), a broken or unconfigured deployment
 * chain must not stop that provider from answering — the deployment error is
 * logged and the tier's provider runs on its own.
 */
export async function chatAi(input: ChatInput): Promise<AiResult> {
  if (chatTransportOverride) {
    const out = await chatTransportOverride(input);
    return { text: out.text, requestId: `test_${crypto.randomUUID()}`, provider: "fixtures", model: out.model ?? "test", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0 };
  }
  let envChain: ChainEntry[];
  try {
    envChain = aiChain();
  } catch (e) {
    if (input.provider === "platform") throw e;
    logAiEvent({ level: "error", feature: input.feature, organizationId: input.organizationId, reason: `deployment chain unusable: ${describe(e)}` });
    envChain = [];
  }
  const chain: ChainEntry[] =
    input.provider === "platform"
      ? envChain
      : [{ provider: input.provider, model: input.model || undefined }, ...envChain.filter((c) => c.provider !== input.provider)];
  if (process.env.NODE_ENV === "production" && chain.some((c) => c.provider === "fixtures")) throw new StandInProviderError("AI", "fixtures");
  const failures: string[] = [];
  for (const entry of chain) {
    const model = (entry === chain[0] && input.model ? resolveModel(input.model) : null) || defaultModelFor(entry, "standard");
    const started = Date.now();
    try {
      const out = await CHAT_CALLERS[entry.provider]({ system: input.system, messages: input.messages, maxTokens: input.maxTokens, vision: input.vision, model });
      if (!out.text) throw new AiProviderError(entry.provider, model, null, "The model returned no text.");
      const result: AiResult = { ...out, provider: entry.provider, latencyMs: Date.now() - started };
      await meter(input.organizationId, result, { feature: input.feature });
      logAiEvent({
        level: "info",
        feature: input.feature,
        provider: entry.provider,
        model: out.model,
        latencyMs: result.latencyMs,
        requestId: out.requestId,
        organizationId: input.organizationId,
      });
      return result;
    } catch (error) {
      if (error instanceof AiRefusedError) throw error;
      const meta = failureMeta(error);
      failures.push(`${entry.provider}:${model}${meta.httpStatus ? ` (HTTP ${meta.httpStatus})` : ""}: ${meta.reason}`);
      logAiEvent({
        level: "error",
        feature: input.feature,
        provider: entry.provider,
        model,
        httpStatus: meta.httpStatus,
        latencyMs: Date.now() - started,
        organizationId: input.organizationId,
        reason: meta.reason,
      });
    }
  }
  const message = `No AI provider answered. ${failures.join(" | ")}`;
  if (failures.every((f) => f.includes("is not set"))) throw new AiNotConfiguredError(message);
  const error = new AiUnavailableError(message);
  logAiEvent({ level: "error", feature: input.feature, organizationId: input.organizationId, requestId: error.requestId, reason: "chain exhausted; " + message });
  throw error;
}

// ── image → form fields ────────────────────────────────────────────────

/** What one image can fill in a form. Every field is optional; arrays may be empty. */
export interface ImageFieldSuggestions {
  title?: string;
  description?: string;
  caption?: string;
  keywords?: string[];
  hashtags?: string[];
}

const FORM_KIND_HINTS: Record<string, string> = {
  template: "a reusable content template for social media designs",
  post: "a social media post (caption and hashtags for Facebook, Instagram or TikTok)",
  product: "a product in the organisation's catalogue (name and sales description)",
  character: "a brand character or mascot (name and a description of the look)",
  campaign: "a marketing campaign (name and goal/description)",
};

/**
 * Reads one image and drafts the fields a form is missing. Used by every
 * upload-and-fill flow (templates, posts, products, characters, campaigns).
 *
 * Always runs on the platform's chain, metered as `image_autofill` to the
 * organisation. Failures return null instead of throwing: the form keeps
 * working without suggestions, and the reason is in the logs.
 */
export async function analyzeImage(input: {
  image: ChatImage;
  organizationId: string;
  formKind: string;
  /** Brand name/voice, template category, campaign — whatever the caller knows. */
  context?: string;
  /** Fields the person already filled; the model must not second-guess them. */
  existing?: Record<string, string>;
}): Promise<ImageFieldSuggestions | null> {
  if (!input.image.dataBase64 || !input.image.mimeType.startsWith("image/")) return null;
  try {
    await assertAiAllowance(input.organizationId);
    const known = Object.entries(input.existing ?? {})
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: "${v.trim().slice(0, 160)}"`)
      .join("\n");
    const result = await chatAi({
      system: [
        `You prepare marketing form fields for ${PRODUCT_NAME}, a platform for African agencies and businesses.`,
        `The image belongs to ${FORM_KIND_HINTS[input.formKind] ?? "a marketing form"}.`,
        "Look at the image and write for what you actually see: the subject, setting, colours, style and mood.",
        "Write in clear, warm, modern English suited to African businesses and their customers.",
        known ? `Already written by the person (do NOT repeat or rework these):\n${known}` : "The form is empty; suggest everything.",
        input.context?.trim() ? `Context to match: ${input.context.trim().slice(0, 400)}` : "",
        'Reply with ONLY compact JSON, all keys optional: {"title":string,"description":string,"caption":string,"keywords":string[],"hashtags":string[]}. No markdown, no commentary.',
      ]
        .filter(Boolean)
        .join("\n"),
      messages: [{ role: "user", content: "Suggest the missing fields for this form.", images: [input.image] }],
      provider: "platform",
      maxTokens: 900,
      organizationId: input.organizationId,
      feature: "image_autofill",
      vision: true,
    });
    const match = /\{[\s\S]*\}/.exec(result.text);
    if (!match) return null;
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const list = (v: unknown, max: number) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, max) : undefined;
    const out: ImageFieldSuggestions = {
      title: text(raw.title, 120),
      description: text(raw.description, 1000),
      caption: text(raw.caption, 2200),
      keywords: list(raw.keywords, 12),
      hashtags: list(raw.hashtags, 12)?.map((h) => (h.startsWith("#") ? h : `#${h.replace(/^#/, "")}`)),
    };
    return Object.values(out).some((v) => (Array.isArray(v) ? v.length > 0 : v)) ? out : null;
  } catch (e) {
    // The form must continue without AI. The reason survives in the log only.
    logAiEvent({ level: "error", feature: "image_autofill", organizationId: input.organizationId, reason: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    return null;
  }
}