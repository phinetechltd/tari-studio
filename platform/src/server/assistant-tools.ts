import "server-only";

import { readFile } from "node:fs/promises";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { untrusted } from "@/lib/assistant-guard";
import { toolAllowed, type AssistantConfig, type AssistantToolKey, type Tier } from "@/lib/assistant-config";
import { db } from "@/lib/db";
import { formatKES, parseAmountToCents } from "@/lib/money";
import { can, type Permission, type Principal } from "@/lib/rbac";
import { orgIdOf } from "@/lib/tenant";

import { createBrand, updateBrand } from "./brands";
import { addCharacterImages, characterSchema, createCharacter } from "./characters";
import { addProductImages, createProduct, productSchema } from "./products";
import { resolveKey } from "./storage";
import { createThread, postMessage } from "./studio";
import { addTemplateImages, createOrgTemplate, orgTemplateSchema } from "./templates";

/**
 * What the assistant can do. Every tool is declared here and nowhere else; the model cannot name one that
 * is not in this table, and every call is checked again on the server:
 *
 *  - the person must hold the permission (and the module) the same action needs anywhere else in the app;
 *  - the organisation always comes from the signed-in session, never from the model's arguments;
 *  - ids the model supplies are looked up inside the organisation, so another team's ids find nothing;
 *  - arguments are validated and size-limited;
 *  - tools that read return only fields meant for the model (no stock numbers, no contact details);
 *  - tools that save do NOT save: `propose` returns a plain-words summary, and the change happens only
 *    when the person presses Apply, which runs `apply` again under their own permissions.
 */

export interface ToolContext {
  principal: Principal;
  organizationId: string;
  tier: Tier;
  /** Pictures the person attached to this message or earlier ones in the chat (stored files) */
  pictures: Array<{ key: string; mimeType: string }>;
}

export interface Proposal {
  tool: AssistantToolKey;
  args: Record<string, unknown>;
  summary: string;
  /** "link": applying only opens a screen */
  kind: "change" | "link";
  href?: string;
}

interface ToolSpec {
  key: AssistantToolKey;
  /** What the model is told about it */
  description: string;
  argsHint: string;
  permission: Permission;
  /** READ returns data to the model; PROPOSE/LINK/GENERATE return a proposal for the person */
  kind: "READ" | "PROPOSE" | "LINK" | "GENERATE";
  run?: (ctx: ToolContext, raw: unknown) => Promise<string>;
  propose?: (ctx: ToolContext, raw: unknown) => Promise<Proposal>;
  apply?: (ctx: ToolContext, args: Record<string, unknown>) => Promise<{ message: string; href?: string }>;
}

const text = (max: number) => z.string().trim().max(max);
const idString = z.string().trim().min(1).max(40);

async function ownedBrandId(ctx: ToolContext, id: string | undefined | null): Promise<string | null> {
  if (!id) return null;
  const b = await db.brand.findFirst({ where: { id, organizationId: ctx.organizationId, status: "ACTIVE" }, select: { id: true } });
  if (!b) throw new ApiError(422, "VALIDATION_FAILED", "That brand is not one of this team's brands.");
  return b.id;
}

/** The picture the person uploaded, read back as a File so it passes the same checks as any upload. */
async function uploadedPicture(ctx: ToolContext): Promise<File | null> {
  const pic = ctx.pictures[ctx.pictures.length - 1];
  if (!pic) return null;
  const bytes = await readFile(resolveKey(pic.key));
  return new File([new Uint8Array(bytes)], "assistant-upload", { type: pic.mimeType });
}

// ── reading ─────────────────────────────────────────────────────────────

const listBrands: ToolSpec = {
  key: "list_brands",
  description: "Lists this team's active brands with their slogan and voice notes.",
  argsHint: "{}",
  permission: "brand:read",
  kind: "READ",
  async run(ctx) {
    const rows = await db.brand.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, take: 25, select: { id: true, name: true, slogan: true, website: true, guidelines: true } });
    if (rows.length === 0) return untrusted("brands", "(this team has no brands yet)");
    return untrusted(
      "brands",
      rows
        .map((b) => {
          const g = (b.guidelines ?? {}) as Record<string, unknown>;
          const voice = typeof g.voice === "string" ? g.voice : "";
          return `- id=${b.id} | ${b.name}${b.slogan ? ` | slogan: ${b.slogan}` : ""}${voice ? ` | voice: ${voice}` : ""}${b.website ? ` | ${b.website}` : ""}`;
        })
        .join("\n"),
    );
  },
};

const listProducts: ToolSpec = {
  key: "list_products",
  description: "Lists this team's active products with price and short description.",
  argsHint: '{"brandId": "optional brand id"}',
  permission: "product:read",
  kind: "READ",
  async run(ctx, raw) {
    const { brandId } = z.object({ brandId: idString.optional() }).parse(raw ?? {});
    const rows = await db.catalogueItem.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE", ...(brandId ? { brandId } : {}) },
      orderBy: { name: "asc" },
      take: 40,
      select: { id: true, name: true, priceCents: true, description: true, brandId: true },
    });
    if (rows.length === 0) return untrusted("products", "(no products found)");
    return untrusted("products", rows.map((p) => `- id=${p.id} | ${p.name} | ${p.priceCents === null ? "price on request" : formatKES(p.priceCents)}${p.description ? ` | ${p.description.slice(0, 160)}` : ""}`).join("\n"));
  },
};

const listCharacters: ToolSpec = {
  key: "list_characters",
  description: "Lists this team's characters with their descriptions.",
  argsHint: "{}",
  permission: "character:read",
  kind: "READ",
  async run(ctx) {
    const rows = await db.character.findMany({ where: { organizationId: ctx.organizationId, archivedAt: null }, orderBy: { name: "asc" }, take: 25, select: { id: true, name: true, description: true } });
    if (rows.length === 0) return untrusted("characters", "(no characters yet)");
    return untrusted("characters", rows.map((c) => `- id=${c.id} | ${c.name}${c.description ? ` | ${c.description.slice(0, 160)}` : ""}`).join("\n"));
  },
};

// ── prompts ─────────────────────────────────────────────────────────────

const improvePromptArgs = z.object({ prompt: text(1500).min(5), kind: z.enum(["image", "video"]).default("image") });

const improvePrompt: ToolSpec = {
  key: "improve_prompt",
  description: "Shows the person a better prompt, with a button that opens it in the Studio. You write the improved prompt yourself.",
  argsHint: '{"prompt": "the improved prompt", "kind": "image" | "video"}',
  permission: "ai:generate",
  kind: "LINK",
  async propose(_ctx, raw) {
    const a = improvePromptArgs.parse(raw);
    return {
      tool: "improve_prompt",
      args: a,
      kind: "link",
      summary: `Open in the Studio: “${a.prompt.slice(0, 200)}”`,
      href: `/content?prompt=${encodeURIComponent(a.prompt.slice(0, 1500))}`,
    };
  },
};

// ── brands ──────────────────────────────────────────────────────────────

const brandFields = z.object({
  slogan: text(160).optional(),
  voice: text(500).optional(),
  dos: text(500).optional(),
  donts: text(500).optional(),
  colors: text(200).optional(),
  website: z.string().trim().url().max(300).optional(),
});
const updateBrandArgs = brandFields.extend({ brandId: idString.optional() });

const describeBrandFields = (a: z.infer<typeof brandFields>) =>
  Object.entries({ Slogan: a.slogan, Voice: a.voice, Always: a.dos, Never: a.donts, Colours: a.colors, Website: a.website })
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

const updateBrandTool: ToolSpec = {
  key: "update_brand",
  description: "Proposes details for a brand (slogan, voice, always/never, colours, website), for example read from a picture the person attached. Only fill what you can actually see or were told. Leave brandId out to use the team's only brand.",
  argsHint: '{"brandId": "optional", "slogan": "...", "voice": "...", "dos": "...", "donts": "...", "colors": "...", "website": "https://..."}',
  permission: "brand:write",
  kind: "PROPOSE",
  async propose(ctx, raw) {
    const a = updateBrandArgs.parse(raw);
    if (!describeBrandFields(a)) throw new ApiError(422, "VALIDATION_FAILED", "Nothing to fill in.");
    let brandId = await ownedBrandId(ctx, a.brandId);
    if (!brandId) {
      const brands = await db.brand.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, select: { id: true }, take: 2 });
      if (brands.length !== 1) throw new ApiError(422, "VALIDATION_FAILED", "Say which brand to fill in (use list_brands first).");
      brandId = brands[0]!.id;
    }
    const b = await db.brand.findUniqueOrThrow({ where: { id: brandId }, select: { name: true } });
    return { tool: "update_brand", args: { ...a, brandId }, kind: "change", summary: `Update brand “${b.name}” — ${describeBrandFields(a)}` };
  },
  async apply(ctx, args) {
    const a = updateBrandArgs.parse(args);
    const brandId = await ownedBrandId(ctx, a.brandId);
    if (!brandId) throw new ApiError(422, "VALIDATION_FAILED", "Brand missing.");
    const existing = await db.brand.findUniqueOrThrow({ where: { id: brandId }, select: { guidelines: true, name: true } });
    const g = { ...((existing.guidelines ?? {}) as Record<string, unknown>) };
    if (a.voice) g.voice = a.voice;
    if (a.dos) g.dos = a.dos;
    if (a.donts) g.donts = a.donts;
    if (a.colors) g.colors = a.colors;
    await updateBrand(ctx.principal, brandId, { ...(a.slogan ? { slogan: a.slogan } : {}), ...(a.website ? { website: a.website } : {}), guidelines: g });
    return { message: `Saved to ${existing.name}.`, href: `/app/brands/${brandId}/edit` };
  },
};

const createBrandArgs = brandFields.extend({ name: text(120).min(2) });

const createBrandTool: ToolSpec = {
  key: "create_brand",
  description: "Proposes a new brand.",
  argsHint: '{"name": "...", "slogan": "...", "voice": "...", "colors": "...", "website": "https://..."}',
  permission: "brand:write",
  kind: "PROPOSE",
  async propose(_ctx, raw) {
    const a = createBrandArgs.parse(raw);
    return { tool: "create_brand", args: a, kind: "change", summary: `Create brand “${a.name}”${describeBrandFields(a) ? ` — ${describeBrandFields(a)}` : ""}` };
  },
  async apply(ctx, args) {
    const a = createBrandArgs.parse(args);
    const g: Record<string, unknown> = {};
    if (a.voice) g.voice = a.voice;
    if (a.dos) g.dos = a.dos;
    if (a.donts) g.donts = a.donts;
    if (a.colors) g.colors = a.colors;
    const brand = await createBrand({ organizationId: ctx.organizationId, name: a.name, slogan: a.slogan, website: a.website, guidelines: Object.keys(g).length ? g : undefined, createdById: ctx.principal.userId });
    return { message: `Created ${a.name}.`, href: `/app/brands/${brand.id}/edit?new=1` };
  },
};

// ── characters, templates, products ─────────────────────────────────────

const createCharacterArgs = z.object({
  name: text(80).min(2),
  description: text(600).default(""),
  brandId: idString.optional(),
  useUploadedPicture: z.boolean().default(false),
});

const createCharacterTool: ToolSpec = {
  key: "create_character",
  description: "Proposes a character: a name and a description of how they look and act. Set useUploadedPicture true to keep the picture the person attached as the character's image.",
  argsHint: '{"name": "...", "description": "how they look and act", "brandId": "optional", "useUploadedPicture": true|false}',
  permission: "character:write",
  kind: "PROPOSE",
  async propose(ctx, raw) {
    const a = createCharacterArgs.parse(raw);
    await ownedBrandId(ctx, a.brandId);
    if (a.useUploadedPicture && ctx.pictures.length === 0) throw new ApiError(422, "VALIDATION_FAILED", "There is no uploaded picture to use.");
    return { tool: "create_character", args: a, kind: "change", summary: `Create character “${a.name}”${a.description ? ` — ${a.description.slice(0, 200)}` : ""}${a.useUploadedPicture ? " (with your picture)" : ""}` };
  },
  async apply(ctx, args) {
    const a = createCharacterArgs.parse(args);
    const brandId = await ownedBrandId(ctx, a.brandId);
    const c = await createCharacter(ctx.principal, characterSchema.parse({ name: a.name, description: a.description, brandId }));
    let note = "";
    if (a.useUploadedPicture) {
      const file = await uploadedPicture(ctx);
      if (file) {
        try {
          await addCharacterImages(ctx.principal, c.id, [file]);
        } catch (e) {
          note = ` The picture could not be added (${e instanceof ApiError ? e.message : "it did not pass the image checks"}).`;
        }
      }
    }
    return { message: `Created ${a.name}.${note}`, href: `/app/characters/${c.id}` };
  },
};

const createTemplateArgs = z.object({
  title: text(120).min(3),
  description: text(1500).min(10),
  promptHint: text(600).optional(),
  category: text(60).optional(),
  useUploadedPicture: z.boolean().default(false),
});

const createTemplateTool: ToolSpec = {
  key: "create_template",
  description: "Proposes a private template: a title, a description of the look, and a prompt hint that is put in front of prompts. Set useUploadedPicture true to add the attached picture as its first image.",
  argsHint: '{"title": "...", "description": "what the look is for", "promptHint": "words put in front of prompts", "category": "optional", "useUploadedPicture": true|false}',
  permission: "template:read",
  kind: "PROPOSE",
  async propose(ctx, raw) {
    const a = createTemplateArgs.parse(raw);
    if (a.useUploadedPicture && ctx.pictures.length === 0) throw new ApiError(422, "VALIDATION_FAILED", "There is no uploaded picture to use.");
    return { tool: "create_template", args: a, kind: "change", summary: `Create private template “${a.title}” — ${a.description.slice(0, 200)}${a.promptHint ? ` | hint: ${a.promptHint.slice(0, 120)}` : ""}` };
  },
  async apply(ctx, args) {
    const a = createTemplateArgs.parse(args);
    const t = await createOrgTemplate(ctx.principal, orgTemplateSchema.parse({ title: a.title, description: a.description, promptHint: a.promptHint ?? null, category: a.category ?? null, status: "DRAFT", visibility: "PRIVATE" }));
    let note = "";
    if (a.useUploadedPicture) {
      const file = await uploadedPicture(ctx);
      if (file) {
        try {
          await addTemplateImages(ctx.principal, t.id, [file], null);
        } catch (e) {
          note = ` The picture could not be added (${e instanceof ApiError ? e.message : "it did not pass the image checks"}).`;
        }
      }
    }
    return { message: `Created the template “${a.title}” as a private draft.${note}`, href: `/app/templates/${t.id}/edit` };
  },
};

const createProductArgs = z.object({
  brandId: idString.optional(),
  name: text(200).min(1),
  description: text(1500).optional(),
  priceKes: z.union([z.number().min(0).max(100_000_000), z.string().max(20)]).optional(),
  category: text(80).optional(),
  useUploadedPicture: z.boolean().default(false),
});

const createProductTool: ToolSpec = {
  key: "create_product",
  description: "Proposes a product with a price in KES and a description taken only from what the person said or showed. Set useUploadedPicture true to keep the attached picture as its image.",
  argsHint: '{"brandId": "optional if the team has one brand", "name": "...", "description": "...", "priceKes": 750, "category": "optional", "useUploadedPicture": true|false}',
  permission: "product:write",
  kind: "PROPOSE",
  async propose(ctx, raw) {
    const a = createProductArgs.parse(raw);
    let brandId = await ownedBrandId(ctx, a.brandId);
    if (!brandId) {
      const brands = await db.brand.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE" }, select: { id: true }, take: 2 });
      if (brands.length !== 1) throw new ApiError(422, "VALIDATION_FAILED", "Say which brand the product belongs to.");
      brandId = brands[0]!.id;
    }
    const price = a.priceKes === undefined ? null : parseAmountToCents(String(a.priceKes));
    if (price === undefined) throw new ApiError(422, "VALIDATION_FAILED", "The price is not a number.");
    if (a.useUploadedPicture && ctx.pictures.length === 0) throw new ApiError(422, "VALIDATION_FAILED", "There is no uploaded picture to use.");
    return {
      tool: "create_product",
      args: { ...a, brandId },
      kind: "change",
      summary: `Add product “${a.name}”${price !== null ? ` at ${formatKES(price, { decimals: price % 100 !== 0 })}` : ""}${a.description ? ` — ${a.description.slice(0, 160)}` : ""}`,
    };
  },
  async apply(ctx, args) {
    const a = createProductArgs.parse(args);
    const brandId = await ownedBrandId(ctx, a.brandId);
    if (!brandId) throw new ApiError(422, "VALIDATION_FAILED", "Brand missing.");
    const price = a.priceKes === undefined ? null : parseAmountToCents(String(a.priceKes));
    if (price === undefined) throw new ApiError(422, "VALIDATION_FAILED", "The price is not a number.");
    const p = await createProduct(ctx.principal, productSchema.parse({ brandId, name: a.name, description: a.description, priceCents: price, category: a.category }));
    let note = "";
    if (a.useUploadedPicture) {
      const file = await uploadedPicture(ctx);
      if (file) {
        try {
          await addProductImages(ctx.principal, p.id, [file]);
        } catch (e) {
          note = ` The picture could not be added (${e instanceof ApiError ? e.message : "it did not pass the image checks"}).`;
        }
      }
    }
    return { message: `Added ${a.name}.${note}`, href: `/app/products/${p.id}` };
  },
};

// ── images ──────────────────────────────────────────────────────────────

const createImageArgs = z.object({
  prompt: text(1500).min(5),
  aspectRatio: z.enum(["1:1", "9:16", "16:9", "3:4", "4:3"]).default("1:1"),
  brandId: idString.optional(),
  productId: idString.optional(),
  characterIds: z.array(idString).max(3).optional(),
});

const createImageTool: ToolSpec = {
  key: "create_image",
  description: "Prepares an image in the Studio from a prompt you write (optionally with a brand, product or characters). The person sees the credit cost and nothing is charged until they press Generate in the Studio.",
  argsHint: '{"prompt": "...", "aspectRatio": "1:1|9:16|16:9|3:4|4:3", "brandId": "optional", "productId": "optional", "characterIds": ["optional"]}',
  permission: "ai:generate",
  kind: "GENERATE",
  async propose(ctx, raw) {
    const a = createImageArgs.parse(raw);
    return { tool: "create_image", args: a, kind: "change", summary: `Prepare an image in the Studio (${a.aspectRatio}): “${a.prompt.slice(0, 200)}”. You see the price before anything is charged.` };
  },
  async apply(ctx, args) {
    const a = createImageArgs.parse(args);
    const thread = await createThread(ctx.organizationId, ctx.principal.userId, a.prompt.slice(0, 60));
    await postMessage(ctx.organizationId, thread.id, `/image ${a.prompt}, ${a.aspectRatio}`, {
      context: { brandId: a.brandId ?? null, productId: a.productId ?? null, characterIds: a.characterIds ?? [] },
    });
    return { message: "The image is ready to generate in the Studio. Check the price and press Generate.", href: `/content?project=${thread.id}` };
  },
};

export const TOOLS: Record<AssistantToolKey, ToolSpec> = {
  list_brands: listBrands,
  list_products: listProducts,
  list_characters: listCharacters,
  improve_prompt: improvePrompt,
  update_brand: updateBrandTool,
  create_brand: createBrandTool,
  create_character: createCharacterTool,
  create_template: createTemplateTool,
  create_product: createProductTool,
  create_image: createImageTool,
};

export function isToolKey(k: string): k is AssistantToolKey {
  return Object.prototype.hasOwnProperty.call(TOOLS, k);
}

/** The tools this person may use right now: switched on by the admin for their tier, and permitted by their role. */
export function toolsAvailable(config: AssistantConfig, tier: Tier, principal: Principal): ToolSpec[] {
  return (Object.values(TOOLS) as ToolSpec[]).filter((t) => toolAllowed(config, t.key, tier) && can(principal, t.permission));
}

export type ToolOutcome =
  | { kind: "text"; text: string }
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "error"; message: string };

/** Runs one tool call asked for by the model. Anything wrong comes back as an error the model can read, never a crash. */
export async function runToolCall(ctx: ToolContext, config: AssistantConfig, toolName: string, rawArgs: unknown): Promise<ToolOutcome> {
  if (!isToolKey(toolName)) return { kind: "error", message: `There is no tool called "${toolName.slice(0, 40)}".` };
  const spec = TOOLS[toolName];
  if (!toolAllowed(config, toolName, ctx.tier)) {
    return { kind: "error", message: ctx.tier === "free" && config.tools[toolName]?.enabled ? `"${toolName}" is part of the premium assistant.` : `"${toolName}" is not available.` };
  }
  if (!can(ctx.principal, spec.permission)) return { kind: "error", message: `This person's role does not allow "${toolName}".` };
  try {
    if (spec.kind === "READ" && spec.run) return { kind: "text", text: await spec.run(ctx, rawArgs) };
    if (spec.propose) return { kind: "proposal", proposal: await spec.propose(ctx, rawArgs) };
    return { kind: "error", message: "That tool cannot be used here." };
  } catch (e) {
    if (e instanceof z.ZodError) return { kind: "error", message: `The arguments were not valid: ${e.issues.map((i) => `${i.path.join(".") || "args"} ${i.message}`).join("; ").slice(0, 300)}` };
    if (e instanceof ApiError) return { kind: "error", message: e.message };
    console.error("[assistant] tool failed", toolName, e);
    return { kind: "error", message: "That did not work." };
  }
}

/** Carries out a proposal the person approved, under their own permissions, re-validating everything. */
export async function applyProposal(ctx: ToolContext, config: AssistantConfig, toolName: string, args: Record<string, unknown>): Promise<{ message: string; href?: string }> {
  if (!isToolKey(toolName)) throw new ApiError(422, "VALIDATION_FAILED", "Unknown action.");
  const spec = TOOLS[toolName];
  if (!toolAllowed(config, toolName, ctx.tier)) throw new ApiError(403, "FORBIDDEN", "That action is no longer available.");
  if (!can(ctx.principal, spec.permission)) throw new ApiError(403, "FORBIDDEN", "Your role does not allow that.");
  if (spec.kind === "LINK") return { message: "Opening it.", href: (await spec.propose!(ctx, args)).href };
  if (!spec.apply) throw new ApiError(422, "VALIDATION_FAILED", "That action cannot be applied.");
  try {
    return await spec.apply(ctx, args);
  } catch (e) {
    if (e instanceof z.ZodError) throw new ApiError(422, "VALIDATION_FAILED", e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ").slice(0, 300));
    throw e;
  }
}

export { orgIdOf };
