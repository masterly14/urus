/**
 * Helper compartido: resuelve teléfono y nombre del comprador a partir del
 * propertyCode. Usa primero `LegalDocumentParty` (role COMPRADOR) y cae a
 * `DemandCurrent` vía el último evento `SELECCION_COMPRADOR`.
 */

import { prisma } from "@/lib/prisma";

export interface BuyerInfo {
  phone: string;
  name: string;
  demandId?: string;
}

export async function getBuyerInfoForProperty(
  propertyCode: string,
): Promise<BuyerInfo | null> {
  const party = await prisma.legalDocumentParty.findFirst({
    where: {
      role: "COMPRADOR",
      legalDocument: { propertyCode },
    },
    select: { phone: true, fullName: true },
    orderBy: { createdAt: "desc" },
  });

  if (party?.phone) {
    return { phone: party.phone, name: party.fullName ?? "" };
  }

  const selectionEvent = await prisma.event.findFirst({
    where: {
      aggregateId: propertyCode,
      type: "SELECCION_COMPRADOR",
    },
    select: { payload: true },
    orderBy: { occurredAt: "desc" },
  });

  if (selectionEvent?.payload) {
    const ep = selectionEvent.payload as Record<string, unknown>;
    const demandId = typeof ep.demandId === "string" ? ep.demandId : null;
    if (demandId) {
      const demand = await prisma.demandCurrent.findUnique({
        where: { codigo: demandId },
        select: { telefono: true, nombre: true },
      });
      if (demand?.telefono) {
        return { phone: demand.telefono, name: demand.nombre ?? "", demandId };
      }
    }
  }

  return null;
}
