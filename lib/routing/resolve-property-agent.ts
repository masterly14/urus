/**
 * Resolución del teléfono del comercial asignado a una propiedad.
 *
 * PropertyCurrent.agente es un string con el nombre del agente (no un ID de Comercial).
 * Flujo: nombre textual → búsqueda en tabla comerciales → fallback ALERT_WHATSAPP_TO.
 */

import { prisma } from "@/lib/prisma";

export interface ResolvedAgent {
  comercialId: string | null;
  nombre: string;
  telefono: string;
}

export async function resolveAgentPhoneByProperty(
  propertyCode: string,
): Promise<ResolvedAgent | null> {
  const property = await prisma.propertyCurrent.findUnique({
    where: { codigo: propertyCode },
    select: { agente: true },
  });

  if (!property) {
    console.warn(
      `[resolve-agent] Propiedad ${propertyCode} no encontrada en PropertyCurrent`,
    );
    return null;
  }

  const agenteName = property.agente?.trim();

  if (agenteName) {
    const comercial = await prisma.comercial.findFirst({
      where: {
        nombre: { equals: agenteName, mode: "insensitive" },
        activo: true,
      },
      select: { id: true, nombre: true, telefono: true },
    });

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
  }

  const fallbackPhone = process.env.ALERT_WHATSAPP_TO?.trim();
  if (fallbackPhone) {
    return {
      comercialId: null,
      nombre: agenteName || "Comercial",
      telefono: fallbackPhone,
    };
  }

  console.warn(
    `[resolve-agent] Sin teléfono para propiedad ${propertyCode} (agente="${agenteName || ""}", sin ALERT_WHATSAPP_TO)`,
  );
  return null;
}
