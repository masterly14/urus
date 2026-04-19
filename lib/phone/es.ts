/**
 * Normaliza el número introducido tras el prefijo +34 a dígitos E.164 sin "+"
 * (ej. 34612345678). Solo acepta España: código 34 + 9 dígitos nacionales.
 */
export function normalizeSpainPhoneLocalInput(localPart: string): string | null {
  const digits = localPart.replace(/\D/g, "").replace(/^0+/, "");
  let n = digits;
  if (n.startsWith("34")) {
    // usuario pegó número completo con 34
  } else {
    n = `34${n}`;
  }
  if (n.length !== 11 || !n.startsWith("34")) return null;
  const national = n.slice(2);
  if (national.length !== 9) return null;
  return n;
}
