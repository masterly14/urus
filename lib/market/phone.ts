const E164_REGEX = /^\+\d{8,15}$/;
const ES_LOCAL_REGEX = /^[6789]\d{8}$/;

export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry: "ES" = "ES",
): string | null {
  if (typeof raw !== "string") return null;

  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/^tel:\s*/i, "");
  value = value.replace(/[\s().-]/g, "");

  // Conservamos solo digitos y, opcionalmente, el prefijo internacional "+".
  if (value.startsWith("+")) {
    value = `+${value.slice(1).replace(/\D/g, "")}`;
  } else {
    value = value.replace(/\D/g, "");
  }

  if (!/\d/.test(value)) return null;

  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  }

  if (!value.startsWith("+")) {
    if (value.length === 9 && defaultCountry === "ES") {
      value = `+34${value}`;
    } else if (value.length >= 8 && value.length <= 15) {
      value = `+${value}`;
    } else {
      return null;
    }
  }

  if (!E164_REGEX.test(value)) return null;

  if (value.startsWith("+34")) {
    const local = value.slice(3);
    if (!ES_LOCAL_REGEX.test(local)) return null;
  }

  return value;
}

export function normalizePhones(raws: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of raws) {
    const normalized = normalizePhone(raw);
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}
