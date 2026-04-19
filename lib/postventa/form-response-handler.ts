/**
 * Handler del `nfm_reply` del formulario post-venta (M9).
 *
 * Al recibir la respuesta del WhatsApp Flow:
 *   1. Actualiza la `PostventaSurveySession` con nombre, email y fecha de nacimiento.
 *   2. Emite `POSTVENTA_FORMULARIO_COMPLETADO`.
 *   3. Encola `SCHEDULE_POSTVENTA_BIRTHDAY` y `SCHEDULE_POSTVENTA_NAVIDAD` para
 *      programar los primeros envíos anuales.
 *
 * Si la sesión no existe o ya estaba completada, es idempotente (no-op).
 */

import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";

/**
 * Parsea `fecha_nacimiento` tal y como lo entrega Meta en el `nfm_reply`.
 *
 * Meta `DatePicker` devuelve valor serializado como número (epoch ms en string)
 * o como `DD/MM/AAAA` cuando se renderiza como input libre. Probamos ambos y
 * guardamos siempre el raw original.
 */
export function parseBirthDate(raw: unknown): { date: Date | null; raw: string | null } {
  if (raw == null) return { date: null, raw: null };
  const rawStr = String(raw).trim();
  if (!rawStr) return { date: null, raw: null };

  const asNumber = Number(rawStr);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const epoch = asNumber > 1e12 ? asNumber : asNumber * 1000;
    const d = new Date(epoch);
    if (!Number.isNaN(d.getTime())) {
      return { date: normalizeToUtcDate(d), raw: rawStr };
    }
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(rawStr);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(dt.getTime())) return { date: dt, raw: rawStr };
  }

  const esMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(rawStr);
  if (esMatch) {
    const day = Number(esMatch[1]);
    const month = Number(esMatch[2]);
    let year = Number(esMatch[3]);
    if (year < 100) year += year < 40 ? 2000 : 1900;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(dt.getTime())) return { date: dt, raw: rawStr };
  }

  return { date: null, raw: rawStr };
}

function normalizeToUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function handlePostventaFormNfmReply(
  from: string,
  responseJson: string,
): Promise<boolean> {
  let responseData: Record<string, unknown>;
  try {
    responseData = JSON.parse(responseJson);
  } catch {
    console.error("[postventa:form-webhook] nfm_reply JSON inválido");
    return false;
  }

  const flowToken =
    typeof responseData.flow_token === "string" ? responseData.flow_token : "";
  if (!flowToken) return false;

  const session = await prisma.postventaSurveySession.findUnique({
    where: { id: flowToken },
  });
  if (!session) return false;

  // Validar pertenencia del flow_token al comprador remitente para evitar cross-session.
  const fromDigits = from.replace(/\D/g, "");
  const sessionDigits = session.buyerPhone.replace(/\D/g, "");
  if (fromDigits && sessionDigits && !fromDigits.endsWith(sessionDigits) && !sessionDigits.endsWith(fromDigits)) {
    console.warn(
      `[postventa:form-webhook] flow_token=${flowToken} pertenece a ${sessionDigits} pero llegó desde ${fromDigits} — ignorando`,
    );
    return false;
  }

  if (session.status === "COMPLETED") {
    return true;
  }

  const buyerName =
    typeof responseData.nombre_completo === "string"
      ? responseData.nombre_completo.trim()
      : null;
  const buyerEmail =
    typeof responseData.email === "string" ? responseData.email.trim() : null;
  const { date: birthDate, raw: birthDateRaw } = parseBirthDate(
    responseData.fecha_nacimiento,
  );

  await prisma.postventaSurveySession.update({
    where: { id: session.id },
    data: {
      status: "COMPLETED",
      buyerName: buyerName ?? session.buyerName,
      buyerEmail: buyerEmail ?? session.buyerEmail,
      birthDate: birthDate ?? session.birthDate,
      birthDateRaw: birthDateRaw ?? session.birthDateRaw,
      completedAt: new Date(),
    },
  });

  const event = await appendEvent({
    type: "POSTVENTA_FORMULARIO_COMPLETADO",
    aggregateType: "OPERACION",
    aggregateId: session.operacionId,
    payload: {
      sessionId: session.id,
      propertyCode: session.propertyCode,
      buyerPhone: session.buyerPhone,
      buyerName: buyerName ?? session.buyerName ?? "",
      buyerEmail: buyerEmail ?? session.buyerEmail ?? "",
      birthDate: birthDate ? birthDate.toISOString() : null,
      birthDateRaw: birthDateRaw ?? null,
      completedAt: new Date().toISOString(),
    },
  });

  if (birthDate) {
    await enqueueJob({
      type: "SCHEDULE_POSTVENTA_BIRTHDAY",
      payload: {
        sessionId: session.id,
        operacionId: session.operacionId,
        propertyCode: session.propertyCode,
        buyerPhone: session.buyerPhone,
        birthDate: birthDate.toISOString(),
      },
      idempotencyKey: `schedule_birthday:${session.operacionId}`,
      sourceEventId: event.id,
    });
  } else {
    console.warn(
      `[postventa:form-webhook] session=${session.id} sin birthDate parseable (raw="${birthDateRaw}") — no se programa cumpleaños`,
    );
  }

  await enqueueJob({
    type: "SCHEDULE_POSTVENTA_NAVIDAD",
    payload: {
      sessionId: session.id,
      operacionId: session.operacionId,
      propertyCode: session.propertyCode,
      buyerPhone: session.buyerPhone,
    },
    idempotencyKey: `schedule_navidad:${session.operacionId}`,
    sourceEventId: event.id,
  });

  console.log(
    `[postventa:form-webhook] session=${session.id} operacionId=${session.operacionId} — formulario completado` +
      `${birthDate ? ` (birthDate=${birthDate.toISOString().slice(0, 10)})` : " (sin fecha nacimiento)"}`,
  );

  return true;
}
