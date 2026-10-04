import { handler, parseBody } from "@/lib/api";
import { register, registerSchema } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Create an account. It starts unverified: a code and a link are emailed, and nothing says whether the address was already registered. */
export const POST = handler({ public: true }, async ({ request }) => {
  const input = await parseBody(request, registerSchema);
  return register(input, request);
});
