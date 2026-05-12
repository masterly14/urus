/**
 * Handler de `SEND_BUYER_INTEREST_ACK`.
 *
 * Se encola desde `handleSeleccionComprador` cuando el comprador pulsa
 * "Me encaja" en una propiedad del micrositio (`source.channel === "microsite_card"`).
 *
 * Responsabilidades:
 *  - Cargar la `MicrositeSelection` para obtener `buyerPhone`, `demandNombre`,
 *    y la propiedad concreta (con su `title` curado) desde el JSON `properties`.
 *  - Dedup defensiva: si ya existe un `WHATSAPP_ENVIADO` con
 *    `kind = "buyer_interest_ack"` y `selectionId + propertyId` coincidentes,
 *    no se reenvía (idempotencia ante reintentos o doble click).
 *  - Enviar la plantilla `microsite_propiedad_me_encaja` via
 *    `sendBuyerInterestAckToBuyer`.
 *
 * Errores permanentes (no reintentables):
 *  - Payload inválido o sin `selectionId`/`propertyId`.
 *  - Selección no encontrada en BD.
 *  - `propertyId` no presente en `selection.properties`.
 *  - `buyerPhone` no normalizable a `waId`.
 */

import type { JobRecord } from "@/lib/job-queue/types";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { sendBuyerInterestAckToBuyer } from "@/lib/whatsapp/send";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";
import type { MicrositeCuratedProperty } from "@/lib/microsite/selection";

export const BUYER_INTEREST_ACK_KIND = "buyer_interest_ack";

interface BuyerInterestAckPayload {
  selectionId: string;
  propertyId: string;
  demandId?: string;
  sourceEventId?: string;
}

function parsePayload(raw: unknown): BuyerInterestAckPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.selectionId !== "string" || !p.selectionId) return null;
  if (typeof p.propertyId !== "string" || !p.propertyId) return null;
  return {
    selectionId: p.selectionId,
    propertyId: p.propertyId,
    demandId: typeof p.demandId === "string" ? p.demandId : undefined,
    sourceEventId: typeof p.sourceEventId === "string" ? p.sourceEventId : undefined,
  };
}

function findCuratedProperty(
  properties: unknown,
  propertyId: string,
): MicrositeCuratedProperty | null {
  if (!Array.isArray(properties)) return null;
  for (const item of properties) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (candidate.propertyId === propertyId && typeof candidate.title === "string") {
      return item as MicrositeCuratedProperty;
    }
  }
  return null;
}

async function findExistingAck(selectionId: string, propertyId: string) {
  return prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      payload: {
        path: ["kind"],
        equals: BUYER_INTEREST_ACK_KIND,
      },
      AND: [
        { payload: { path: ["selectionId"], equals: selectionId } },
        { payload: { path: ["propertyId"], equals: propertyId } },
      ],
    },
    select: { id: true, payload: true },
  });
}

export async function handleSendBuyerInterestAck(
  job: JobRecord,
): Promise<HandlerResult> {
  const payload = parsePayload(job.payload);
  if (!payload) {
    return {
      success: false,
      error: "SEND_BUYER_INTEREST_ACK sin payload válido (selectionId/propertyId)",
      permanent: true,
    };
  }

  const existing = await findExistingAck(payload.selectionId, payload.propertyId);
  if (existing) {
    console.log(
      `[consumer] SEND_BUYER_INTEREST_ACK job ${job.id} — ya enviado previamente (selectionId=${payload.selectionId} propertyId=${payload.propertyId}), skip`,
    );
    return { success: true };
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { id: payload.selectionId },
    select: {
      id: true,
      token: true,
      demandId: true,
      demandNombre: true,
      buyerPhone: true,
      properties: true,
    },
  });

  if (!selection) {
    return {
      success: false,
      error: `Selección no encontrada: ${payload.selectionId}`,
      permanent: true,
    };
  }

  const property = findCuratedProperty(selection.properties, payload.propertyId);
  if (!property) {
    return {
      success: false,
      error: `propertyId=${payload.propertyId} no está en selection=${payload.selectionId}`,
      permanent: true,
    };
  }

  const digits = normalizeWhatsAppDigits(selection.buyerPhone);
  if (digits.length < 9) {
    return {
      success: false,
      error: `Comprador sin teléfono normalizable (selection=${payload.selectionId})`,
      permanent: true,
    };
  }

  const propertyTitle = property.title?.trim() || "tu propiedad seleccionada";
  const buyerName = selection.demandNombre?.trim() || "";

  try {
    const result = await sendBuyerInterestAckToBuyer(
      digits,
      { buyerName, propertyTitle },
      {
        trace: {
          source: "consumer:buyer-interest-ack",
          kind: BUYER_INTEREST_ACK_KIND,
          aggregateId: digits,
          causationId: job.sourceEventId ?? payload.sourceEventId ?? null,
          payload: {
            selectionId: selection.id,
            selectionToken: selection.token,
            demandId: selection.demandId,
            propertyId: payload.propertyId,
            propertyTitle,
          },
        },
      },
    );
    const wamid = result.messages?.[0]?.id ?? null;
    console.log(
      `[consumer] SEND_BUYER_INTEREST_ACK job ${job.id} — enviado a ${digits} selection=${selection.id} property=${payload.propertyId} wamid=${wamid ?? "N/A"}`,
    );
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[consumer] SEND_BUYER_INTEREST_ACK job ${job.id} — error: ${msg}`,
    );
    return { success: false, error: msg };
  }
}
