import { z } from "zod";

import { handler, ok } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { analyzeImage, type ChatImage } from "@/server/ai";
import { bytesForProvider, readUploads, sniffImage } from "@/server/storage";
import { db } from "@/lib/db";

/**
 * Image → form fields, the one entry point every upload-and-fill flow shares
 * (templates, posts, products, characters, campaigns). The caller sends the
 * picture (an upload, or an asset id from the media library) and the form's
 * current values; the answer suggests ready-to-use text for the EMPTY fields
 * only — the person's own words are never second-guessed, and nothing is
 * saved here. The client applies suggestions as editable, regeneratable text.
 *
 * AI is platform-managed and metered as `image_autofill`. A provider failure
 * returns `aiOk: false` with no suggestions instead of an error: the form
 * keeps working normally, and the reason is in the server log.
 */

const FORM_KINDS = ["template", "post", "product", "character", "campaign"] as const;

const JsonBody = z.object({
  formKind: z.enum(FORM_KINDS),
  /** The form's current values; suggestions come back only for the empty ones. */
  fields: z.record(z.string(), z.string().max(2200)).default({}),
  /** A media-library image (GeneratedAsset) instead of an upload. */
  assetId: z.string().optional(),
  brandId: z.string().nullable().optional(),
  context: z.string().max(400).optional(),
});

/** Ready-to-use strings per form kind, mapped from the model's suggestions. */
function toSuggestions(
  kind: (typeof FORM_KINDS)[number],
  s: { title?: string; description?: string; caption?: string; keywords?: string[]; hashtags?: string[] },
): Record<string, string> {
  const caption = s.caption || s.description;
  switch (kind) {
    case "template":
      return {
        ...(s.title ? { title: s.title } : {}),
        ...(s.description ? { description: s.description } : {}),
        ...(s.keywords?.length ? { promptHint: s.keywords.join(", ") } : {}),
      };
    case "post":
      return {
        ...(caption ? { caption } : {}),
        ...(s.hashtags?.length ? { hashtags: s.hashtags.join(" ") } : {}),
        ...(s.keywords?.length ? { keywords: s.keywords.join(", ") } : {}),
      };
    case "product":
    case "character":
    case "campaign":
      return {
        ...(s.title ? { name: s.title } : {}),
        ...(s.description ? { description: s.description } : {}),
      };
  }
}

export const POST = handler({ permission: "ai:generate" }, async ({ principal, request }) => {
  const organizationId = principal.organizationId;
  if (!organizationId) throw new Error("AI autofill works inside an organisation.");

  const limit = await hit(`ai-autofill:${principal.userId}`, { limit: 30, windowSec: 3600 });
  if (!limit.allowed) {
    return ok({ aiOk: false, suggestions: {}, reason: "Autofill is limited to thirty pictures an hour." });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let formKind: (typeof FORM_KINDS)[number];
  let current: Record<string, string>;
  let upload: File | null = null;
  let assetId: string | undefined;
  let brandId: string | null | undefined;
  let context: string | undefined;

  if (contentType.includes("application/json")) {
    const raw = (await request.json().catch(() => null)) as unknown;
    const parsed = JsonBody.safeParse(raw);
    if (!parsed.success) return ok({ aiOk: false, suggestions: {}, reason: "The autofill request was malformed." });
    ({ formKind, fields: current, assetId, brandId, context } = parsed.data);
  } else {
    try {
      const parts = await readUploads(request, 1);
      upload = parts.files[0] ?? null;
      const meta = parts.fields;
      formKind = (FORM_KINDS as readonly string[]).includes(meta.formKind) ? (meta.formKind as (typeof FORM_KINDS)[number]) : "post";
      current = parseJsonField(meta.fields);
      assetId = meta.assetId || undefined;
      brandId = meta.brandId || undefined;
      context = meta.context || undefined;
    } catch {
      return ok({ aiOk: false, suggestions: {}, reason: "The image could not be read." });
    }
  }

  // Only the empty fields get suggestions; nothing the person typed is reworked.
  const wanted = Object.keys(current).filter((k) => !(current[k] ?? "").trim());
  if (wanted.length === 0) return ok({ aiOk: true, suggestions: {} });

  let image: ChatImage | null = null;
  try {
    if (upload) {
      const buf = new Uint8Array(await upload.arrayBuffer());
      const kind = sniffImage(buf);
      if (!kind) return ok({ aiOk: false, suggestions: {}, reason: "Upload a PNG, JPEG or WebP image." });
      image = { mimeType: kind.mimeType, dataBase64: Buffer.from(buf).toString("base64") };
    } else if (assetId) {
      const asset = await db.generatedAsset.findFirst({
        where: { id: assetId, organizationId, mediaType: "IMAGE" },
        select: { storageKey: true },
      });
      if (!asset?.storageKey) return ok({ aiOk: false, suggestions: {}, reason: "That image is not in the media library." });
      const bytes = await bytesForProvider(asset.storageKey);
      image = { mimeType: bytes.mimeType, dataBase64: bytes.bytes.toString("base64") };
    }
  } catch {
    return ok({ aiOk: false, suggestions: {}, reason: "The image could not be read." });
  }
  if (!image) return ok({ aiOk: false, suggestions: {}, reason: "No image to analyse." });

  const brand =
    brandId
      ? await db.brand
          .findFirst({ where: { id: brandId, organizationId }, select: { name: true, slogan: true } })
          .catch(() => null)
      : null;
  const brandContext = brand ? [brand.name, brand.slogan].filter(Boolean).join(" — ") : "";
  const existing = Object.fromEntries(wanted.map((k) => [k, ""]));

  const suggestions = await analyzeImage({
    image,
    organizationId,
    formKind,
    context: [context, brandContext].filter(Boolean).join("; ") || undefined,
    existing: { ...current, ...existing },
  });

  if (!suggestions) return ok({ aiOk: false, suggestions: {}, reason: "AI is temporarily unavailable. You can continue manually." });

  const mapped = toSuggestions(formKind, suggestions);
  const filtered = Object.fromEntries(Object.entries(mapped).filter(([k]) => wanted.includes(k)));
  return ok({ aiOk: true, suggestions: filtered });
});

function parseJsonField(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v.slice(0, 2200);
    }
    return out;
  } catch {
    return {};
  }
}
