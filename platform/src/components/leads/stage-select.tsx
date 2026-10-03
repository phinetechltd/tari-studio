"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";
import { STAGE_LABELS, STAGES } from "@/lib/automation-rules";

/** Moves a lead through the pipeline from its row. */
export function StageSelect({ contactId, stage, disabled }: { contactId: string; stage: string; disabled?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(stage);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <select
        aria-label="Stage"
        value={value}
        disabled={disabled}
        onChange={async (e) => {
          const next = e.target.value;
          const previous = value;
          setValue(next);
          setError(null);
          const r = await callApi(`/api/leads/${contactId}`, "PATCH", { stage: next });
          if (!r.ok) {
            setValue(previous);
            setError(r.error?.message ?? "Not saved.");
            return;
          }
          router.refresh();
        }}
        className="input !min-h-[32px] !w-auto py-0 text-xs"
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
