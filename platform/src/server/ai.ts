import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { costMicros, DEFAULT_MODEL, DEFAULT_QUICK_MODEL, parseChain, supportsEffort, type ChainEntry } from "@/lib/ai-models";
import { auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { StandInProviderError, providerName } from "@/lib/providers";
import type { Principal } from "@/lib/rbac";
import { ApiError } from "@/lib/api";
import { effectiveLimits } from "@/lib/limits";
import { resolveGateway } from "@/server/gateways";

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
   * Whose gateway settings to use. Set for anything on behalf of an
   * organisation, so a key an Owner saved in Settings is the key that runs.
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

interface ProviderCall {
  prompt: string;
  model: string;
  maxTokens: number;
  system?: string;
  /** The organisation's own key when it has one, else the deployment's. */
  apiKey?: string;
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

async function callAnthropic({ prompt, model, maxTokens, system, apiKey }: ProviderCall): Promise<ProviderOutput> {
  // The org's own key, else the platform admin's (console) or the .env value — env() merges those two.
  const key = apiKey?.trim() || env().ANTHROPIC_API_KEY?.trim();
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

/** Friendly names the settings screen may hold, mapped to NVIDIA model ids. */
export const NVIDIA_MODEL_MAP: Record<string, string> = {
  "nvidia-nemotron-3-nano": "nvidia/nemotron-3-nano",
  "nvidia-nemotron-3-super": "nvidia/nemotron-3-super",
  "nvidia-nemotron-3-ultra": "nvidia/nemotron-3-ultra",
  "nvidia-k3:free": "moonshotai/kimi-k3",
};

export function resolveModel(model: string): string {
  return NVIDIA_MODEL_MAP[model] ?? model;
}

async function callNvidia({ prompt, model, maxTokens, system, apiKey: apiKeyArg }: ProviderCall): Promise<ProviderOutput> {
  const apiKey = apiKeyArg?.trim() || env().NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new AiNotConfiguredError("NVIDIA_API_KEY is not set.");

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolveModel(model),
      messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(env().AI_TIMEOUT_SEC * 1000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`NVIDIA API error ${response.status}: ${body.slice(0, 300)}`);
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

/**
 * The org's own gateway choice as a one-link chain. A key an Owner saved in
 * Settings runs ahead of the deployment's env chain: the org pays for its own
 * tokens, so it chooses the model. No org choice, or fixtures, defers to env.
 */
function orgChain(org: Record<string, string> | null): ChainEntry[] | null {
  if (!org?.provider || org.provider === "fixtures") return null;
  if (org.provider !== "anthropic" && org.provider !== "nvidia") return null;
  return [{ provider: org.provider, model: org.model || undefined }];
}

export function aiChain(): ChainEntry[] {
  const e = env();
  const chain = parseChain(e.AI_FALLBACK_CHAIN, providerName("AI"));
  // The production stand-in rule applies to every link of the chain, not just the first.
  if (process.env.NODE_ENV === "production" && chain.some((c) => c.provider === "fixtures")) {
    throw new StandInProviderError("AI", "fixtures");
  }
  return chain;
}

function defaultModelFor(entry: ChainEntry, tier: "standard" | "quick"): string {
  if (entry.model) return entry.model;
  const e = env();
  if (entry.provider === "anthropic") {
    return tier === "quick" ? e.AI_CHEAP_MODEL || DEFAULT_QUICK_MODEL : e.AI_MODEL || DEFAULT_MODEL;
  }
  if (entry.provider === "nvidia") return "nvidia-nemotron-3-super";
  return "fixtures";
}

/** Runs the chain without metering. Callers below record usage. */
async function runChain(prompt: string, options: AiGenerateOptions): Promise<AiResult> {
  // An organisation's own key and model choice, resolved once per request.
  const org = options.organizationId
    ? await resolveGateway(options.organizationId, "ai").catch(() => null)
    : null;
  const chain = orgChain(org) ?? aiChain();
  const failures: string[] = [];
  for (const entry of chain) {
    const orgModel = options.tier === "quick" ? org?.quickModel : org?.model;
    const model =
      options.model && entry === chain[0]
        ? options.model
        : orgModel || defaultModelFor(entry, options.tier ?? "standard");
    const started = Date.now();
    try {
      const out = await CALLERS[entry.provider]({
        prompt,
        model,
        maxTokens: options.maxTokens ?? 4000,
        system: options.system,
        apiKey: org?.apiKey,
      });
      if (!out.text) throw new Error("The model returned no text.");
      return { ...out, provider: entry.provider, latencyMs: Date.now() - started };
    } catch (error) {
      if (error instanceof AiRefusedError) throw error;
      failures.push(`${entry.provider}:${model}: ${describe(error)}`);
    }
  }
  const allUnconfigured = failures.every((f) => f.includes("is not set"));
  const message = `No AI provider answered. ${failures.join(" | ")}`;
  throw allUnconfigured ? new AiNotConfiguredError(message) : new Error(message);
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
 * dollar micro-units of provider cost). An organisation on its own AI key pays
 * the provider itself and is not limited; neither is a plan with no limit.
 * Reaching it tells the owners once a month and refuses further calls with 402.
 */
export async function assertAiAllowance(organizationId: string, now = new Date()): Promise<void> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { plan: true, limitsOverride: true } });
  if (!org) return;
  const limit = effectiveLimits(org.plan, org.limitsOverride).aiCreditsMicros;
  if (limit === null) return;
  const own = await resolveGateway(organizationId, "ai").catch(() => null);
  if (own?.apiKey) return;
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
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolveModel(call.model),
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
  if (!response.ok) throw new Error(`NVIDIA API error ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
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
 */
export async function chatAi(input: ChatInput): Promise<AiResult> {
  if (chatTransportOverride) {
    const out = await chatTransportOverride(input);
    return { text: out.text, requestId: `test_${crypto.randomUUID()}`, provider: "fixtures", model: out.model ?? "test", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0 };
  }
  const chain: ChainEntry[] =
    input.provider === "platform"
      ? aiChain()
      : [{ provider: input.provider, model: input.model || undefined }, ...aiChain().filter((c) => c.provider !== input.provider)];
  if (process.env.NODE_ENV === "production" && chain.some((c) => c.provider === "fixtures")) throw new StandInProviderError("AI", "fixtures");
  const failures: string[] = [];
  for (const entry of chain) {
    const model = (entry === chain[0] && input.model) || defaultModelFor(entry, "standard");
    const started = Date.now();
    try {
      const out = await CHAT_CALLERS[entry.provider]({ system: input.system, messages: input.messages, maxTokens: input.maxTokens, vision: input.vision, model });
      if (!out.text) throw new Error("The model returned no text.");
      const result: AiResult = { ...out, provider: entry.provider, latencyMs: Date.now() - started };
      await meter(input.organizationId, result, { feature: input.feature });
      return result;
    } catch (error) {
      if (error instanceof AiRefusedError) throw error;
      failures.push(`${entry.provider}:${model}: ${describe(error)}`);
    }
  }
  const message = `No AI provider answered. ${failures.join(" | ")}`;
  throw failures.every((f) => f.includes("is not set")) ? new AiNotConfiguredError(message) : new Error(message);
}