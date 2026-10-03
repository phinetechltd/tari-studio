"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { callApi } from "@/components/json-form";

interface TestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  sample?: string;
  error?: string;
  notConfigured?: boolean;
}

/** One live round trip to the configured model. */
export function AiTestButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setResult(null);
          const r = await callApi<TestResult>("/api/ai/test", "POST", {});
          setPending(false);
          setResult(r.ok && r.data ? r.data : { ok: false, error: r.error?.message ?? "The test did not run." });
        }}
        className="btn-primary"
      >
        <Sparkles className="h-4 w-4" /> {pending ? "Asking the model…" : "Test the AI connection"}
      </button>
      {result ? (
        result.ok ? (
          <div role="status" className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3 text-sm">
            <p className="font-medium text-success">
              Connected: {result.provider} · {result.model} · {result.latencyMs} ms · {result.inputTokens} in / {result.outputTokens} out tokens
            </p>
            <p className="mt-1 text-ink/80">“{result.sample}”</p>
          </div>
        ) : (
          <div role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {result.notConfigured ? "No AI key is loaded on the server. " : ""}
            {result.error}
          </div>
        )
      ) : null}
    </div>
  );
}
