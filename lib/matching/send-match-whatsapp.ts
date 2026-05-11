/**
 * Envío en caliente del WhatsApp de match al comprador.
 *
 * Se invoca tanto desde el flujo automático (consumer al procesar
 * MATCH_GENERADO) como desde el endpoint manual de la UI de cruces.
 *
 * No usa job queue: el envío se realiza síncronamente para que el caller
 * conozca el resultado (wamid o error) inmediatamente.
 *
 * Idempotencia: si ya existe un evento `WHATSAPP_ENVIADO` con
 * `causationId = matchEventId` y `payload.kind = "match_notification"`,
 * se considera enviado previamente y no se reenvía.
 */

import { prisma } from "@/lib/prisma";
import { sendMatchNotification } from "@/lib/whatsapp/send";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { normalizeWhatsAppDigits } from "@/lib/microsite/buyer-phone";

export interface SendMatchWhatsAppArgs {
  matchEventId: string;
  demandId: string;
  propertyId: string;
  buyerPhone: string;
  buyerName: string;
  /** Etiqueta para trazabilidad del origen del envío (api / consumer / script). */
  source: string;
}

export interface SendMatchWhatsAppResult {
  ok: boolean;
  wamid?: string | null;
  alreadySent?: boolean;
  error?: string;
}

export const MATCH_WHATSAPP_KIND = "match_notification";

async function findExistingSend(matchEventId: string) {
  return prisma.event.findFirst({
    where: {
      type: "WHATSAPP_ENVIADO",
      causationId: matchEventId,
      payload: { path: ["kind"], equals: MATCH_WHATSAPP_KIND },
    },
    select: { id: true, payload: true },
  });
}

export async function sendMatchWhatsAppHot(
  args: SendMatchWhatsAppArgs,
): Promise<SendMatchWhatsAppResult> {
  const previous = await findExistingSend(args.matchEventId);
  if (previous) {
    const payload = (previous.payload ?? {}) as Record<string, unknown>;
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
    return { ok: true, alreadySent: true, wamid: messageId };
  }

  const waId = normalizeWhatsAppDigits(args.buyerPhone);
  const appUrl = getPublicAppUrl();
  const enlace = `${appUrl}/matching/cruces`;

  try {
    const result = await sendMatchNotification(
      args.buyerPhone,
      {
        nombre: args.buyerName,
        enlacePropiedad: enlace,
      },
      {
        trace: {
          source: args.source,
          kind: MATCH_WHATSAPP_KIND,
          aggregateId: waId || args.buyerPhone,
          causationId: args.matchEventId,
          payload: {
            demandId: args.demandId,
            propertyId: args.propertyId,
            enlacePropiedad: enlace,
          },
        },
      },
    );
    const wamid = result.messages?.[0]?.id ?? null;

    if (waId.length >= 9) {
      try {
        await prisma.whatsAppBuyerSession.upsert({
          where: { waId },
          create: { waId, demandId: args.demandId },
          update: { demandId: args.demandId },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[matching] upsert whatsAppBuyerSession falló (waId=${waId}): ${msg}`,
        );
      }
    } else {
      console.warn(
        `[matching] buyerPhone no normalizable a waId — se omite correlación NLU (demandId=${args.demandId})`,
      );
    }

    return { ok: true, wamid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
