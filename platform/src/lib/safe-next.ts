/**
 * Where to send someone after signing in, from a `?next=` parameter. Only a
 * path on this site is allowed ("/billing?plan=PRO" yes; "//evil.example",
 * "/\evil.example" or "https://…" no), so the parameter cannot be used to
 * bounce a freshly signed-in user to another site.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next.length <= 300 ? next : null;
}
