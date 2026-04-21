/**
 * Phone number normalization for WhatsApp Cloud API.
 *
 * WhatsApp `wa_id` format: country code + national number, no `+` prefix.
 * For Spain: `34XXXXXXXXX` (9-digit national number).
 */

/**
 * Normalizes a Spanish phone number to E.164-style without `+` (wa_id format).
 * Strips spaces, dashes, dots and leading `+`. If the result is 9 digits,
 * prefixes with `34` (Spain). Returns the cleaned string as-is if already
 * 11+ digits (assumes country code is present).
 */
export function normalizePhoneES(raw: string): string {
  const cleaned = raw.replace(/[\s\-\.\+\(\)]/g, "");
  if (cleaned.length === 9 && /^\d{9}$/.test(cleaned)) {
    return `34${cleaned}`;
  }
  return cleaned;
}
