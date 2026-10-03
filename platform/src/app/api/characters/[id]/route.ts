import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { characterSchema, getCharacter, updateCharacter } from "@/server/characters";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "character:read" }, async ({ principal, params }) => getCharacter(principal, params.id));

const patch = characterSchema.partial().extend({ archived: z.boolean().optional() });

/** Rename, re-describe, move to another brand, or archive / restore. */
export const PATCH = handler<{ id: string }>({ permission: "character:write" }, async ({ principal, request, params }) => {
  const input = await parseBody(request, patch);
  const c = await updateCharacter(principal, params.id, input, request);
  return { id: c.id };
});
