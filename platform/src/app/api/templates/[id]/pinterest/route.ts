import { ApiError, handler } from "@/lib/api";
import { importPins } from "@/server/templates";

export const dynamic = "force-dynamic";

/** Adds pins (own, from a board, found by search or pasted) to a template's pack, each with its credit link. */
export const POST = handler<{ id: string }>({ permission: "template:write", allowPlatform: true }, async ({ principal, request, params }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the pins as JSON.");
  }
  return importPins(principal, params.id, (body as { pins?: unknown } | null)?.pins, request);
});
