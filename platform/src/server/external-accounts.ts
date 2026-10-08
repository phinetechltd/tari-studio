import "server-only";

import type { ExternalAccount, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { decryptFor, encryptFor } from "@/lib/secrets";

/**
 * An organisation's sign-ins to Pinterest and TikTok's Business API. Tokens
 * are sealed with the organisation id as additional data and only ever read
 * here, on the server.
 */

export type ExternalProvider = "PINTEREST" | "TIKTOK_BUSINESS";

export interface TokenSet {
  accessToken: string;
  accessExpiresAt: Date | null;
  refreshToken: string | null;
  refreshExpiresAt: Date | null;
  scopes: string[];
}

function seal(organizationId: string, tokens: TokenSet) {
  const access = encryptFor(organizationId, tokens.accessToken);
  const refresh = tokens.refreshToken ? encryptFor(organizationId, tokens.refreshToken) : null;
  return {
    accessCipher: access.cipherText,
    accessIv: access.iv,
    accessTag: access.authTag,
    accessExpiresAt: tokens.accessExpiresAt,
    refreshCipher: refresh?.cipherText ?? null,
    refreshIv: refresh?.iv ?? null,
    refreshTag: refresh?.authTag ?? null,
    refreshExpiresAt: tokens.refreshExpiresAt,
    scopes: tokens.scopes,
  };
}

export function accessTokenOf(a: Pick<ExternalAccount, "organizationId" | "accessCipher" | "accessIv" | "accessTag">): string | null {
  return decryptFor(a.organizationId, { cipherText: a.accessCipher, iv: a.accessIv, authTag: a.accessTag });
}

export function refreshTokenOf(a: Pick<ExternalAccount, "organizationId" | "refreshCipher" | "refreshIv" | "refreshTag">): string | null {
  if (!a.refreshCipher || !a.refreshIv || !a.refreshTag) return null;
  return decryptFor(a.organizationId, { cipherText: a.refreshCipher, iv: a.refreshIv, authTag: a.refreshTag });
}

export async function saveExternalAccount(input: {
  organizationId: string;
  provider: ExternalProvider;
  externalId: string;
  name: string;
  handle?: string | null;
  channelId?: string | null;
  tokens: TokenSet;
  connectedById: string;
  metadata?: Record<string, unknown>;
}): Promise<ExternalAccount> {
  const sealed = seal(input.organizationId, input.tokens);
  const data = {
    name: input.name.slice(0, 120),
    handle: input.handle ?? null,
    channelId: input.channelId ?? null,
    status: "ACTIVE",
    connectedById: input.connectedById,
    ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    ...sealed,
  };
  return db.externalAccount.upsert({
    where: { organizationId_provider_externalId: { organizationId: input.organizationId, provider: input.provider, externalId: input.externalId } },
    create: { organizationId: input.organizationId, provider: input.provider, externalId: input.externalId, ...data },
    update: data,
  });
}

export async function updateTokens(account: ExternalAccount, tokens: TokenSet): Promise<ExternalAccount> {
  return db.externalAccount.update({ where: { id: account.id }, data: seal(account.organizationId, tokens) });
}

/** The organisation's active sign-in for a provider (Pinterest has one per organisation). */
export async function activeAccount(organizationId: string, provider: ExternalProvider, channelId?: string): Promise<ExternalAccount | null> {
  return db.externalAccount.findFirst({
    where: { organizationId, provider, status: "ACTIVE", ...(channelId ? { channelId } : {}) },
    orderBy: { updatedAt: "desc" },
  });
}

export async function disconnectAccount(organizationId: string, id: string): Promise<boolean> {
  const r = await db.externalAccount.updateMany({ where: { id, organizationId }, data: { status: "DISCONNECTED" } });
  return r.count === 1;
}

/** Fields safe to send to a browser. */
export function accountView(a: ExternalAccount | null) {
  return a ? { id: a.id, provider: a.provider, name: a.name, handle: a.handle, connectedAt: a.updatedAt.toISOString(), scopes: a.scopes } : null;
}
