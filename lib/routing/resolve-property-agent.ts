/**
 * Resolución del teléfono del comercial asignado a una propiedad.
 *
 * Delega en resolveComercialByProperty (cadena: comercialId FK → keyagente → nombre).
 * Fallback a ALERT_WHATSAPP_TO si no se encuentra teléfono.
 */

import { resolveComercialByProperty } from "@/lib/routing/resolve-comercial";

export interface ResolvedAgent {
  comercialId: string | null;
  nombre: string;
  telefono: string;
}

export async function resolveAgentPhoneByProperty(
  propertyCode: string,
): Promise<ResolvedAgent | null> {
  const comercial = await resolveComercialByProperty(propertyCode);

  if (comercial?.telefono) {
    return {
      comercialId: comercial.id,
      nombre: comercial.nombre,
      telefono: comercial.telefono,
    };
  }

  if (comercial) {
    console.warn(
      `[resolve-agent] Comercial "${comercial.nombre}" encontrado para ${propertyCode} pero sin teléfono`,
    );
  }

  const fallbackPhone = process.env.ALERT_WHATSAPP_TO?.trim();
  if (fallbackPhone) {
    return {
      comercialId: comercial?.id ?? null,
      nombre: comercial?.nombre ?? "Comercial",
      telefono: fallbackPhone,
    };
  }

  if (!comercial) {
    console.warn(
      `[resolve-agent] Propiedad ${propertyCode} — sin comercial y sin ALERT_WHATSAPP_TO`,
    );
  }
  return null;
}
