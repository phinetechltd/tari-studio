"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { EmptyState } from "@/components/ui";

/**
 * Catches a client-side exception anywhere in the console and offers a way out
 * instead of Next.js's default "Application error" dead end. Without a boundary
 * a single throw in one client component takes the whole page with it.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the detail; the boundary is what the person never sees.
    console.error("[console] render failed", error);
  }, [error]);

  return (
    <div className="px-4 py-10 sm:px-6">
      <EmptyState
        title="This screen ran into a problem"
        icon={<AlertTriangle className="h-5 w-5" />}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={reset} className="btn-primary">
              Try again
            </button>
            <Link href="/app" className="btn-quiet">
              Back to dashboard
            </Link>
          </div>
        }
      >
        Your data is safe. Reloading usually clears it. If it keeps happening, quote this code to support:{" "}
        <code className="font-mono text-xs">{error.digest ?? "no-digest"}</code>
      </EmptyState>
    </div>
  );
}
