export function normalizeCadastralRef(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function looksLikeSpanishCadastralRef(value: string): boolean {
  return /^[A-Z0-9]{20}$/.test(normalizeCadastralRef(value));
}

export function buildCadastralRefWarning(value: string): string | null {
  const normalized = normalizeCadastralRef(value);
  if (!normalized) return "La referencia catastral es obligatoria.";
  if (looksLikeSpanishCadastralRef(normalized)) return null;
  return "La referencia catastral no tiene el formato estándar de 20 caracteres; se guardará igualmente.";
}
