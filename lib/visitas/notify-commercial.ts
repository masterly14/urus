import { prisma } from "@/lib/prisma";
import { sendVisitInterestPackageToCommercial } from "@/lib/whatsapp/visit-messages";
import { shouldSendWhatsAppToCommercials } from "@/lib/whatsapp/send";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";
import type { VisitInterestPackage, VisitInterestProperty } from "./interest-package";
import { getVisitInterestPackageByDemand } from "./interest-package";

function formatMoney(value: number | null): string {
  if (value === null) return "precio no disponible";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function contactLine(property: VisitInterestProperty): string {
  const label =
    property.contact.kind === "agencia"
      ? "Agencia"
      : property.contact.kind === "propietario"
        ? "Propietario"
        : "Contacto";
  const name = property.contact.name ? ` ${property.contact.name}` : "";
  const phones = property.contact.phones.length > 0
    ? property.contact.phones.join(", ")
    : "SIN TELÉFONO DISPONIBLE";
  return `${label}${name}: ${phones}`;
}

export function buildCommercialVisitInterestMessage(pkg: VisitInterestPackage): string {
  const header = [
    "Solicitud de gestión de visita",
    "",
    `Demanda: ${pkg.demand.demandName || pkg.demand.demandId}`,
    `Tel. comprador: ${pkg.demand.buyerPhone || "sin teléfono"}`,
    "",
    "Propiedades de interés:",
  ].join("\n");

  const propertiesText = pkg.properties.map((property, index) => {
    const specs = [
      property.rooms !== null ? `${property.rooms} hab.` : null,
      property.metersBuilt !== null ? `${property.metersBuilt} m2` : null,
      formatMoney(property.price),
    ].filter(Boolean).join(" · ");

    return [
      `${index + 1}. ${property.title}`,
      `Ref: ${property.reference}`,
      `Ref. catastral: ${property.cadastralReference ?? "no disponible"}`,
      `Dirección: ${property.address}`,
      `Tipo cartera: ${property.source === "internal" ? "interna" : "externa"}`,
      `Datos: ${specs}`,
      contactLine(property),
      property.portalUrl ? `Enlace: ${property.portalUrl}` : null,
      property.missingContactPhone
        ? "Acción: completar teléfono antes de coordinar la visita."
        : "Acción: llamar para coordinar disponibilidad de visita.",
    ].filter((line): line is string => Boolean(line)).join("\n");
  }).join("\n\n");

  return [
    header,
    propertiesText || "No hay propiedades con teléfono/datos suficientes.",
    "",
    "Cuando tengas día y hora acordados, regístralo en Urus > Visitas para crear el evento de calendario y activar el Flow de parte de visita.",
  ].join("\n");
}

function mapContactLabel(property: VisitInterestProperty): string {
  if (property.contact.kind === "agencia") return "Agencia";
  if (property.contact.kind === "propietario") return "Propietario";
  return property.contact.name ? "Contacto" : "Interlocutor";
}

export async function notifyCommercialVisitInterest(input: {
  demandId: string;
  causationId?: string | null;
  correlationId?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const pkg = await getVisitInterestPackageByDemand(input.demandId);
  if (!pkg || pkg.properties.length === 0) {
    return { sent: false, reason: "sin_propiedades_interes" };
  }

  if (!pkg.demand.comercialId) {
    return { sent: false, reason: "demanda_sin_comercial" };
  }

  const comercial = await prisma.comercial.findUnique({
    where: { id: pkg.demand.comercialId },
    select: { waId: true, telefono: true },
  });
  const to = comercial?.waId || comercial?.telefono || "";
  if (!to) {
    return { sent: false, reason: "comercial_sin_whatsapp" };
  }

  await updateDemandLeadStatus(input.demandId, "VISITA_PENDIENTE");
  if (!shouldSendWhatsAppToCommercials()) {
    console.log(
      `[visitas] Notificación comercial desactivada para demandId=${input.demandId}`,
    );
    return { sent: false, reason: "whatsapp_comercial_desactivado" };
  }

  await sendVisitInterestPackageToCommercial(to, {
    demandLabel: pkg.demand.demandName || pkg.demand.demandId,
    buyerPhone: pkg.demand.buyerPhone,
    properties: pkg.properties.map((property) => ({
      title: property.title,
      reference: property.reference,
      cadastralReference: property.cadastralReference,
      address: property.address,
      contactLabel: mapContactLabel(property),
      phones: property.contact.phones,
      source: property.source,
      missingContactPhone: property.missingContactPhone,
    })),
  }, {
    trace: {
      source: "visitas",
      kind: "visit_interest_package_template",
      aggregateId: to,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      payload: {
        demandId: input.demandId,
        selectionId: pkg.selectionId,
        propertyIds: pkg.properties.map((property) => property.propertyId),
      },
    },
  });

  return { sent: true };
}
