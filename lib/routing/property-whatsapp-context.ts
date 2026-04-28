/**
 * Datos de propiedad para mensajes WhatsApp (referencia, dirección legible, foto).
 */

import { prisma } from "@/lib/prisma";

export type PricingNotifyPropertyContext = {
  propertyRef: string;
  propertyAddress: string;
  mainPhotoUrl: string | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function buildAddressFromRaw(
  raw: unknown,
  current: { titulo: string; ciudad: string; zona: string } | null,
): string {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const calle = str(o.calle);
    const numero = o.numero != null ? String(o.numero).trim() : "";
    if (calle) {
      return numero ? `${calle} ${numero}`.trim() : calle;
    }
  }
  const titulo = current?.titulo?.trim() ?? "";
  if (titulo.length > 0) return titulo;
  const parts = [current?.ciudad?.trim(), current?.zona?.trim()].filter(
    (p): p is string => Boolean(p && p.length > 0),
  );
  return parts.length > 0 ? parts.join(" · ") : "Sin dirección en sistema";
}

/**
 * Carga ref, dirección (calle/número del raw de snapshot si existe; si no titulo o ciudad·zona)
 * y URL de foto principal (prioriza `properties_current`, fallback `property_snapshots`).
 */
export async function getPricingNotifyPropertyContext(
  propertyCode: string,
): Promise<PricingNotifyPropertyContext> {
  const [current, snapshot] = await Promise.all([
    prisma.propertyCurrent.findUnique({
      where: { codigo: propertyCode },
      select: {
        ref: true,
        titulo: true,
        ciudad: true,
        zona: true,
        mainPhotoUrl: true,
      },
    }),
    prisma.propertySnapshot.findUnique({
      where: { codigo: propertyCode },
      select: {
        raw: true,
        mainPhotoUrl: true,
        ref: true,
        titulo: true,
        ciudad: true,
        zona: true,
      },
    }),
  ]);

  const propertyRef =
    str(current?.ref) || str(snapshot?.ref) || propertyCode;

  const addressCurrent = {
    titulo: str(current?.titulo) || str(snapshot?.titulo),
    ciudad: str(current?.ciudad) || str(snapshot?.ciudad),
    zona: str(current?.zona) || str(snapshot?.zona),
  };

  const propertyAddress = buildAddressFromRaw(snapshot?.raw ?? null, addressCurrent);

  const mainPhotoUrlRaw =
    str(current?.mainPhotoUrl) || str(snapshot?.mainPhotoUrl) || null;

  return {
    propertyRef,
    propertyAddress,
    mainPhotoUrl: mainPhotoUrlRaw,
  };
}
