/**
 * What shapes a Studio prompt, shared by the screen and the server. Pure.
 *
 * A person may pick any or all of: a brand, a product, characters, a template (and a campaign).
 * Their words always go into the prompt. Their pictures can also start a VIDEO: Higgsfield's
 * image-to-video endpoints take one `image_url`, so one picture is chosen as the first frame.
 * (Its text-to-image endpoint has no reference-image input, so images use words only.)
 */

export type StartSource = "product" | "character" | "brand" | "template";

/** One picture that can start a video. `id` is the image row id, or "cover" / "logo" for a brand. */
export interface StartImageRef {
  source: StartSource;
  id: string;
}

export interface StartCandidate extends StartImageRef {
  label: string;
  /** Where the browser can show it */
  thumb: string;
}

export interface StudioContext {
  templateId: string | null;
  characterIds: string[];
  campaignId: string | null;
  brandId: string | null;
  productId: string | null;
  /** undefined = use the first picture that is available; null = the person chose words only */
  startImage?: StartImageRef | null;
}

export const EMPTY_CONTEXT: StudioContext = { templateId: null, characterIds: [], campaignId: null, brandId: null, productId: null };

export interface ContextSources {
  products: Array<{ id: string; name: string; brandId: string; images: Array<{ id: string; url: string }> }>;
  characters: Array<{ id: string; name: string; images: Array<{ id: string; url: string }> }>;
  brands: Array<{ id: string; name: string; hasCover: boolean; hasLogo: boolean }>;
  templates: Array<{ id: string; title: string; coverId: string | null; coverUrl: string | null }>;
}

const MAX_CANDIDATES = 8;

/** The pictures that could start a video, best first: the product, then characters, the brand's cover and logo, the template. */
export function startCandidates(src: ContextSources, ctx: Pick<StudioContext, "brandId" | "productId" | "characterIds" | "templateId">): StartCandidate[] {
  const out: StartCandidate[] = [];
  const product = ctx.productId ? src.products.find((p) => p.id === ctx.productId) : null;
  if (product) for (const img of product.images.slice(0, 3)) out.push({ source: "product", id: img.id, label: product.name, thumb: img.url });
  for (const cid of ctx.characterIds) {
    const c = src.characters.find((x) => x.id === cid);
    if (c) for (const img of c.images.slice(0, 2)) out.push({ source: "character", id: img.id, label: c.name, thumb: img.url });
  }
  const brand = ctx.brandId ? src.brands.find((b) => b.id === ctx.brandId) : null;
  if (brand?.hasCover) out.push({ source: "brand", id: "cover", label: `${brand.name} cover`, thumb: `/api/brands/${brand.id}/cover` });
  if (brand?.hasLogo) out.push({ source: "brand", id: "logo", label: `${brand.name} logo`, thumb: `/api/brands/${brand.id}/logo` });
  const template = ctx.templateId ? src.templates.find((t) => t.id === ctx.templateId) : null;
  if (template?.coverId && template.coverUrl) out.push({ source: "template", id: template.coverId, label: template.title, thumb: template.coverUrl });
  return out.slice(0, MAX_CANDIDATES);
}

export const sameRef = (a: StartImageRef | null | undefined, b: StartImageRef | null | undefined): boolean =>
  Boolean(a && b && a.source === b.source && a.id === b.id);

/** The picture that will be used: the person's choice if it is still available, words only if they chose that, otherwise the product's or a character's. */
export function pickStart(candidates: StartCandidate[], chosen: StartImageRef | null | undefined): StartCandidate | null {
  if (chosen === null) return null;
  const standard = candidates.find((c) => c.source === "product" || c.source === "character") ?? null;
  // Brand and template pictures are only used when picked.
  if (chosen) return candidates.find((c) => sameRef(c, chosen)) ?? standard;
  return standard;
}

/** Where the browser shows a chosen picture from. */
export function startImageThumb(ref: StartImageRef, brandId: string | null | undefined): string | null {
  switch (ref.source) {
    case "product":
      return `/api/products/images/${ref.id}`;
    case "character":
      return `/api/characters/images/${ref.id}`;
    case "template":
      return `/api/templates/images/${ref.id}`;
    case "brand":
      return brandId ? `/api/brands/${brandId}/${ref.id === "logo" ? "logo" : "cover"}` : null;
  }
}

/** What a quote shows under its prompt: the names it draws on and the picture a video starts from. */
export interface QuoteUsing {
  labels: string[];
  start: { thumb: string; label: string } | null;
}
/** Short ideas offered under "Improve"; one tap adds the words to the box. */
export const IMPROVE_IDEAS = [
  "Warmer, golden light",
  "Slower camera movement",
  "More energy and movement",
  "Closer on the product",
  "Cleaner, simpler background",
  "Make the brand colours stand out",
  "Friendlier, more natural expressions",
] as const;