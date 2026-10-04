/** Shapes the Studio's API returns (see src/server/studio.ts and src/server/generation.ts). */

export interface AssetView {
  id: string;
  status: "GENERATING" | "READY" | "FAILED" | string;
  mediaType: "IMAGE" | "VIDEO" | string;
  mode: string;
  prompt: string;
  durationSeconds: number | null;
  aspectRatio: string | null;
  tokensCharged: number;
  error: string | null;
  threadId: string | null;
  orderId: string | null;
  parentAssetId: string | null;
  canDerive: boolean;
  fileUrl: string | null;
  downloadCount: number;
  createdAt: string;
  readyAt: string | null;
}

export interface QuoteMeta {
  mode: "image" | "video" | "animate" | "extend";
  prompt: string;
  seconds: number | null;
  aspectRatio: string;
  parentAssetId: string | null;
  /** The catalogue model it runs on (src/server/ai-models.ts) */
  modelKey?: string | null;
  brandId?: string | null;
  productId?: string | null;
  templateId?: string | null;
  characterIds?: string[];
  /** The picture a video starts from (null = words only) */
  startImage?: { source: string; id: string } | null;
  /** Names and the starting picture, written when the quote was made */
  using?: { labels: string[]; start: { thumb: string; label: string } | null };
}

export interface MessageView {
  id: string;
  role: "USER" | "ASSISTANT" | string;
  kind: "TEXT" | "QUOTE" | "GENERATION" | string;
  body: string;
  meta: QuoteMeta | null;
  asset: AssetView | null;
  createdAt: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
  archived: boolean;
  clips: number;
}

export interface ThreadOrder {
  id: string;
  number: string;
  status: string;
  customerName: string;
  kind: string;
  imageTokens: number;
  videoSeconds: number;
  brief: string;
}

export interface ThreadDetail {
  thread: { id: string; title: string; archived: boolean };
  order: ThreadOrder | null;
  messages: MessageView[];
}

/** The organisation's credit wallet (src/server/credits.ts). */
export interface Balances {
  credits: number;
  unmetered: boolean;
}
