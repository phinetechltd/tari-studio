/**
 * Canonical forms for the things people are identified by.
 *
 * Identity is compared in canonical form, never as typed. IntelliCash shipped
 * duplicate accounts because "0712 345 678" and "+254712345678" are the same
 * person and were matched as raw strings; the same mistake here would split one
 * customer's WhatsApp history in two.
 */

/** Trimmed, lower-cased email, or null when it is not plausibly an address. */
export function normaliseEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/**
 * International digits only, no "+", no leading zeros — the form `wa.me` links
 * and the WhatsApp API expect. A bare local number is assumed to be Kenyan.
 * Returns null rather than guessing when the input cannot be a phone number.
 */
export function canonicalPhone(input: string, defaultCountryCode = "254"): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (!hadPlus && digits.startsWith("00")) digits = digits.slice(2);
  else if (!hadPlus) {
    if (digits.startsWith("0") && digits.length === 10) {
      // National format: 0712 345 678 → 254712345678
      digits = defaultCountryCode + digits.slice(1);
    } else if (digits.length === 9 && /^[71]/.test(digits)) {
      // Local number typed without its leading 0
      digits = defaultCountryCode + digits;
    }
  }

  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith(defaultCountryCode) && defaultCountryCode === "254") {
    // A Kenyan number is 254 + exactly nine digits.
    if (digits.length !== 12) return null;
  }
  return digits;
}

/** Combining accents (U+0300 to U+036F), built from code points so the source has no invisible characters. */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
