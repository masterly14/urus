import { prisma } from "@/lib/prisma";

/**
 * Normaliza a dígitos para WhatsApp Cloud API (sin +; Meta suele esperar E.164 sin símbolos).
 */
export function normalizeWhatsAppDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 9) return "";
  return digits;
}

function extractFromUnknown(raw: unknown, depth = 0): string {
  if (depth > 6 || raw === null || raw === undefined) return "";
  if (typeof raw === "string") {
    const n = normalizeWhatsAppDigits(raw);
    return n.length >= 9 ? n : "";
  }
  if (typeof raw === "number") {
    return extractFromUnknown(String(raw), depth + 1);
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const v = extractFromUnknown(item, depth + 1);
      if (v) return v;
    }
    return "";
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const keys = [
      "telefono",
      "tlf",
      "phone",
      "movil",
      "mobile",
      "tel",
      "telefono1",
      "numero",
    ];
    for (const k of keys) {
      if (k in o) {
        const v = extractFromUnknown(o[k], depth + 1);
        if (v) return v;
      }
    }
    for (const v of Object.values(o)) {
      const found = extractFromUnknown(v, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/**
 * Resuelve el teléfono del comprador para enviar el enlace del microsite.
 * 1) `demands_current.telefono` (proyección / ingesta).
 * 2) `demand_snapshots.raw` (JSON legacy Inmovilla).
 */
export async function resolveBuyerPhoneForDemand(demandId: string): Promise<string> {
  const current = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: { telefono: true },
  });
  const fromCurrent = normalizeWhatsAppDigits(current?.telefono ?? "");
  if (fromCurrent.length >= 9) return fromCurrent;

  const snap = await prisma.demandSnapshot.findUnique({
    where: { codigo: demandId },
    select: { raw: true },
  });
  const fromRaw = extractFromUnknown(snap?.raw);
  return fromRaw.length >= 9 ? fromRaw : "";
}
