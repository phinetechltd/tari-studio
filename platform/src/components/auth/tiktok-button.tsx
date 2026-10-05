/** "Continue with TikTok". A plain link: the server starts the Login Kit OAuth flow. */
export function TiktokButton({ next, label = "Continue with TikTok" }: { next?: string | null; label?: string }) {
  const href = `/api/auth/tiktok/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <a href={href} className="btn-quiet w-full gap-3">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path
          fill="currentColor"
          d="M16.6 3c.4 2.3 1.9 3.7 4.4 3.8v2.9c-1.6 0-3-.5-4.4-1.4v6.3c0 3.9-2.7 6.4-6.2 6.4-3.3 0-6-2.6-6-6.2 0-3.9 3.2-6.6 7.1-6.2v3.1c-2.2-.5-4 1-4 3.2 0 1.7 1.4 3 3 3 1.9 0 3-1.5 3-3.6V3h3.1z"
        />
      </svg>
      {label}
    </a>
  );
}
