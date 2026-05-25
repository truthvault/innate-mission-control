export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let raw = String(value).trim();
  if (!raw) return null;

  // Keep a leading +, then remove separators/labels commonly seen in SMS payloads.
  raw = raw.replace(/[^\d+]/g, "");
  if (!raw) return null;

  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D/g, "")}`;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // NZ local mobile/landline form, e.g. 0273502083 or 033275012.
  if (digits.startsWith("0")) return `+64${digits.slice(1)}`;

  // 2talk portal often shows NZ numbers as 64xxxxxxxxx without +.
  if (digits.startsWith("64")) return `+${digits}`;

  return `+${digits}`;
}

export function samePhoneNumber(a: unknown, b: unknown): boolean {
  const normalizedA = normalizePhoneNumber(a);
  const normalizedB = normalizePhoneNumber(b);
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
}
