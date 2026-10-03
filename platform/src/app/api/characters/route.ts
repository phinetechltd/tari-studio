import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { characterSchema, createCharacter, listCharacters } from "@/server/characters";

export const dynamic = "force-dynamic";

export const GET = handler({ permission: "character:read" }, async ({ principal, searchParams }) =>
  listCharacters(orgIdOf(principal), { brandId: searchParams.get("brandId") || undefined }),
);

/** Create a character; add its images with POST /api/characters/<id>/images. */
export const POST = handler({ permission: "character:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, characterSchema);
  const c = await createCharacter(principal, input, request);
  return { id: c.id };
});
