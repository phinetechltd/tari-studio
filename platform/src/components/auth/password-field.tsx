"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** A password input with a show/hide button and, for new passwords, a plain-words strength hint. */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  showHint,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "new-password" | "current-password";
  showHint?: boolean;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const [inner, setInner] = useState("");
  const v = value ?? inner;
  const strength = v.length === 0 ? 0 : v.length < 10 ? 1 : v.length < 14 || !/\d/.test(v) || !/[a-zA-Z]/.test(v) ? 2 : 3;
  const words = ["", "Use at least 10 characters", "Fine. Longer with letters and numbers is stronger", "Strong"];
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          required
          autoComplete={autoComplete}
          className="input pr-11"
          value={v}
          onChange={(e) => {
            setInner(e.target.value);
            onChange?.(e.target.value);
          }}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink"
          aria-label={shown ? "Hide password" : "Show password"}
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {showHint && v.length > 0 ? (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`h-1 flex-1 rounded-full ${strength >= n ? (strength === 1 ? "bg-danger" : strength === 2 ? "bg-warning" : "bg-success") : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{words[strength]}</p>
        </div>
      ) : null}
    </div>
  );
}
