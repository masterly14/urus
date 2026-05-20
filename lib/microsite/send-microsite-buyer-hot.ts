/**
 * Envío en caliente del microsite al comprador.
 *
 * Usado por:
 *  - `approveMicrositeByAI` para el flujo canónico IA-first.
 *  - `handleSendMicrositeToBuyer` (consumer) para la cola y reintentos.
 *
 * Idempotencia: si ya existe un evento WHATSAPP_ENVIADO con
 * `kind = "microsite_link"` y `payload.selectionId = selection.id`,
 * se considera enviado previamente y no se reenvía.
 */

import { prisma } from "@/lib/prisma";
import { sendMicrositeLinkToBuyer } from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";

export interface SendMicrositeToBuyerArgs {
  selectionId: string;
  /** Etiqueta para trazabilidad del origen (api / consumer / script). */
  source: string;
  /** Evento causal para correlación (p.ej. SELECCION_VALIDADA.id). */
  causationId?: string | null;
}

export interface SendMicrositeToBuyerResult {
  ok: boolean;
  wamid?: string | null;
  alreadySent?: boolean;
  /** Indica que la selección no estaba en estado APPROVED y se omitió el envío. */
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export const MICROSITE_LINK_KIND = "microsite_link";

async function findExistingSend(selectionId: string) {
  return prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      payload: {
        path: ["kind"],
        equals: MICROSITE_LINK_KIND,
      },
      AND: [
        {
          payload: {
            path: ["selectionId"],
            equals: selectionId,
          },
        },
      ],
    },
    select: { id: true, payload: true },
  });
}

export async function sendMicrositeToBuyerHot(
  args: SendMicrositeToBuyerArgs,
): Promise<SendMicrositeToBuyerResult> {
  const previous = await findExistingSend(args.selectionId);
  if (previous) {
    const payload = (previous.payload ?? {}) as Record<string, unknown>;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    return { ok: true, alreadySent: true, wamid: messageId };
  }

  const selection = await prisma.micrositeSelection.findUnique({
    where: { id: args.selectionId },
    select: {
      id: true,
      token: true,
      status: true,
      demandId: true,
      demandNombre: true,
      buyerPhone: true,
    },
  });

  if (!selection) {
    return { ok: false, error: "Selección no encontrada" };
  }

  if (selection.status !== "APPROVED") {
    return {
      ok: true,
      skipped: true,
      skipReason: `selection.status=${selection.status} (se requiere APPROVED)`,
    };
  }

  const digits = normalizeWhatsAppDigits(selection.buyerPhone);
  if (digits.length < 9) {
    return {
      ok: false,
      error: "El comprador no tiene un teléfono normalizable a waId",
    };
  }

  const base = getPublicAppUrl();
  const buyerUrl = `${base}/seleccion/${selection.token}`;

  let wamid: string | null = null;
  try {
    const result = await sendMicrositeLinkToBuyer(
      digits,
      {
        demandNombre: selection.demandNombre,
        buyerUrl,
      },
      {
        trace: {
          source: args.source,
          kind: MICROSITE_LINK_KIND,
          aggregateId: digits,
          causationId: args.causationId ?? null,
          payload: {
            demandId: selection.demandId,
            selectionId: selection.id,
            selectionToken: selection.token,
            buyerUrl,
          },
        },
      },
    );
    wamid = result.messages?.[0]?.id ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  try {
    await prisma.whatsAppBuyerSession.upsert({
      where: { waId: digits },
      create: {
        waId: digits,
        demandId: selection.demandId,
        selectionId: selection.id,
        selectionToken: selection.token,
      },
      update: {
        demandId: selection.demandId,
        selectionId: selection.id,
        selectionToken: selection.token,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[microsite] upsert whatsAppBuyerSession falló (selectionId=${selection.id}, waId=${digits}): ${msg}`,
    );
  }

  return { ok: true, wamid };
}
