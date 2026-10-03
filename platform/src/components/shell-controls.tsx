"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { THEME_COOKIE } from "@/lib/theme";

import { callApi } from "./json-form";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-wash/[0.08] hover:text-ink disabled:opacity-50"
      disabled={pending}
      aria-label="Sign out"
      title="Sign out"
      onClick={async () => {
        setPending(true);
        await callApi("/api/auth/logout", "POST");
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

/**
 * Light/dark switch. The choice lives in a cookie so the server renders the
 * right theme on the next request (no flash); the class flips at once here.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.classList.contains("theme-afro-light"));
  }, []);
  function toggle() {
    const next = !light;
    const root = document.documentElement;
    root.classList.toggle("theme-afro-light", next);
    root.dataset.theme = next ? "light" : "dark";
    document.cookie = `${THEME_COOKIE}=${next ? "light" : "dark"}; path=/; max-age=31536000; samesite=lax`;
    setLight(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      title={light ? "Dark theme" : "Light theme"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-wash/[0.08] hover:text-ink ${className}`}
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}

/** Switches the organisation (or platform mode) the user is working in. */
export function OrgSwitcher(props: {
  current: string | null;
  options: Array<{ id: string; name: string }>;
  canUsePlatform: boolean;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const value = props.current ?? "__platform__";

  if (props.options.length + (props.canUsePlatform ? 1 : 0) < 2) return null;

  return (
    <div>
      <label htmlFor="org-switcher" className="sr-only">
        Working in
      </label>
      <select
        id="org-switcher"
        className="input !min-h-[40px] py-1"
        value={value}
        onChange={async (e) => {
          setError(null);
          const target = e.target.value === "__platform__" ? null : e.target.value;
          const res = await callApi<{ next: string }>("/api/auth/switch-org", "POST", { organizationId: target });
          if (!res.ok) return setError(res.error?.message ?? "Could not switch.");
          router.push(res.data!.next);
          router.refresh();
        }}
      >
        {props.canUsePlatform ? <option value="__platform__">Platform admin</option> : null}
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error && !props.collapsed ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
