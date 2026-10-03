import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { kenyanMsisdn, maskMsisdn } from "@/lib/sms";

/**
 * A person's own profile: their name, the mobile number SMS notifications go
 * to, and whether the console shows first-use tips.
 */

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80).optional(),
  /** Empty clears it */
  phone: z.string().trim().max(20).optional(),
});

export async function updateProfile(userId: string, organizationId: string | null, raw: unknown, request?: Request) {
  const input = profileSchema.parse(raw);
  const data: { name?: string; phone?: string | null } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) {
    if (input.phone === "") data.phone = null;
    else {
      const msisdn = kenyanMsisdn(input.phone);
      if (!msisdn) throw new ApiError(422, "VALIDATION_FAILED", "Enter a Kenyan mobile number, e.g. 0712 345 678.");
      data.phone = msisdn;
    }
  }
  const user = await db.user.update({ where: { id: userId }, data, select: { name: true, phone: true } });
  await audit({
    organizationId,
    userId,
    action: "PROFILE_UPDATE",
    entity: "User",
    entityId: userId,
    changes: { ...(data.name !== undefined ? { name: data.name } : {}), ...(data.phone !== undefined ? { phone: data.phone ? maskMsisdn(data.phone) : "removed" } : {}) },
    request,
  });
  return user;
}

export const hintsSchema = z.union([
  z.object({ dismiss: z.string().regex(/^[a-z0-9.-]{2,60}$/) }),
  z.object({ enabled: z.boolean() }),
  z.object({ reset: z.literal(true) }),
]);

/** "Got it" on one tip, tips on or off, or show them all again. */
export async function updateHints(userId: string, raw: unknown) {
  const input = hintsSchema.parse(raw);
  if ("dismiss" in input) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { dismissedHints: true } });
    if (!user.dismissedHints.includes(input.dismiss)) {
      await db.user.update({ where: { id: userId }, data: { dismissedHints: { push: input.dismiss } } });
    }
  } else if ("enabled" in input) {
    await db.user.update({ where: { id: userId }, data: { hintsEnabled: input.enabled } });
  } else {
    await db.user.update({ where: { id: userId }, data: { hintsEnabled: true, dismissedHints: [] } });
  }
  return db.user.findUniqueOrThrow({ where: { id: userId }, select: { hintsEnabled: true, dismissedHints: true } });
}
