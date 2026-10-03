/**
 * Phone numbers as WhatsApp sees them: digits only, country code first, no "+"
 * (its `wa_id`). Every contact is keyed on this form, so "0712 345 678",
 * "+254712345678" and "254712345678" are one person, not three.
 *
 * Kenyan local forms (07…, 01…, or the bare nine digits) gain the 254 prefix;
 * anything written with a "+" or 00 is taken as already international.
 */

export const DEFAULT_COUNTRY_CODE = "254";

export function toWhatsAppId(input: string, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (international && digits.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    if (digits.startsWith("0") && digits.length === 10) digits = countryCode + digits.slice(1);
    else if (/^[17]\d{8}$/.test(digits)) digits = countryCode + digits;
  }

  // E.164 allows up to 15 digits; nothing real is shorter than 8.
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** "254712345678" → "+254 712 345 678" for Kenyan numbers, "+<digits>" otherwise. */
export function formatPhone(waId: string): string {
  if (/^254\d{9}$/.test(waId)) return `+254 ${waId.slice(3, 6)} ${waId.slice(6, 9)} ${waId.slice(9)}`;
  return `+${waId}`;
}
