/**
 * Runs once when the server starts. A bad configuration (a missing AUTH_SECRET,
 * an unreadable DATABASE_URL, a stand-in provider in production) should stop
 * the deploy loudly, not surface on the first customer's request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { env } = await import("@/lib/env");
  try {
    env();
  } catch (e) {
    console.error("[startup] Invalid configuration:", e instanceof Error ? e.message : e);
    if (process.env.NODE_ENV === "production") throw e;
  }
}
