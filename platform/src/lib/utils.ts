import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and lets a later Tailwind utility override an earlier one
 * (`cn("px-2", cond && "px-4")` yields `px-4`). The shadcn-style components in
 * `src/components/ui/` expect this helper at `@/lib/utils`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
