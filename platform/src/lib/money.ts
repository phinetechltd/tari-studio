/**
 * Money is stored as integer minor units (cents) throughout. Nothing here
 * returns a float that later gets written back to the database — rounding is
 * applied at the moment a value becomes a stored amount, never after.
 *
 * Currency is per brand (KES by default), so formatting takes it explicitly
 * rather than assuming the platform's home market.
 */

export const DEFAULT_CURRENCY = "KES";

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** "KES 214,500" — whole units, the form used on product marketing. */
export function formatMoney(
  cents: number,
  currency: string = DEFAULT_CURRENCY,
  opts?: { decimals?: boolean },
): string {
  const decimals = opts?.decimals ?? false;
  const value = cents / 100;
  return `${currency} ${value.toLocaleString("en-KE", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

export const formatKES = (cents: number, opts?: { decimals?: boolean }): string =>
  formatMoney(cents, "KES", opts);

/**
 * "1,250.50" or "1250" typed by a person into whole minor units, without floating point.
 * Returns null for an empty box (no price) and undefined for anything that is not an amount.
 */
export function parseAmountToCents(input: string): number | null | undefined {
  const t = input.replace(/[,\s]/g, "");
  if (t === "") return null;
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** Sum of integer cents, refusing anything that is not a safe integer. */
export function sumCents(values: ReadonlyArray<number>): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new Error(`Not a whole number of cents: ${v}`);
    total += v;
  }
  return total;
}
