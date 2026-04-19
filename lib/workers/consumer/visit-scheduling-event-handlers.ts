import type { Event } from "@/types/domain";
import type { HandlerResult } from "./types";
import { prisma } from "@/lib/prisma";
import { updateDemandLeadStatus } from "@/lib/projections/update-lead-status";

/**
 * Extrae el demandId del payload de un evento de visit scheduling.
 * Todos los eventos de esta familia llevan demandId en el payload.
 */
function extractDemandId(event: Event): string | undefined {
  const p = event.payload as Record<string, unknown> | null;
  return typeof p?.demandId === "string" ? p.demandId : undefined;
}

/**
 * VISITA_SOLICITADA — Comprador expresa interés en visitar.
 * La lógica pesada (creación de sesión, fetch de slots) ya se ejecutó
 * en el orquestador. Aquí avanzamos el leadStatus a VISITA_PENDIENTE.
 */
export async function handleVisitaSolicitada(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  const demandId = extractDemandId(event);
  console.log(
    `[visit-scheduling] VISITA_SOLICITADA sessionId=${payload?.sessionId ?? "?"} demandId=${demandId ?? event.aggregateId}`,
  );
  if (demandId) {
    await updateDemandLeadStatus(demandId, "VISITA_PENDIENTE");
  }
  return { success: true };
}

/**
 * VISITA_SLOTS_PROPUESTOS — Agente envió opciones al comercial.
 * Audit trail; no requiere side effects adicionales.
 */
export async function handleVisitaSlotsPropuestos(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  console.log(
    `[visit-scheduling] VISITA_SLOTS_PROPUESTOS sessionId=${payload?.sessionId ?? "?"} slotsCount=${payload?.slotsCount ?? "?"}`,
  );
  return { success: true };
}

/**
 * VISITA_SLOT_SELECCIONADO — Comercial eligió un slot.
 */
export async function handleVisitaSlotSeleccionado(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  console.log(
    `[visit-scheduling] VISITA_SLOT_SELECCIONADO sessionId=${payload?.sessionId ?? "?"} slotIndex=${payload?.slotIndex ?? "?"}`,
  );
  return { success: true };
}

/**
 * VISITA_PROPUESTA_ENVIADA — Agente envió propuesta al comprador.
 */
export async function handleVisitaPropuestaEnviada(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  console.log(
    `[visit-scheduling] VISITA_PROPUESTA_ENVIADA sessionId=${payload?.sessionId ?? "?"} buyerWaId=${payload?.buyerWaId ?? "?"}`,
  );
  return { success: true };
}

/**
 * VISITA_COMPRADOR_ACEPTO — Comprador confirmó el horario.
 * Avanza leadStatus a VISITA_CONFIRMADA.
 */
export async function handleVisitaCompradorAcepto(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  const demandId = extractDemandId(event);
  console.log(
    `[visit-scheduling] VISITA_COMPRADOR_ACEPTO sessionId=${payload?.sessionId ?? "?"} demandId=${demandId ?? "?"}`,
  );
  if (demandId) {
    await updateDemandLeadStatus(demandId, "VISITA_CONFIRMADA");
  }
  return { success: true };
}

/**
 * VISITA_COMPRADOR_RECHAZO — Comprador rechazó el horario propuesto.
 * El estado permanece en VISITA_PENDIENTE; el orquestador inicia nueva ronda.
 */
export async function handleVisitaCompradorRechazo(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  console.log(
    `[visit-scheduling] VISITA_COMPRADOR_RECHAZO sessionId=${payload?.sessionId ?? "?"} round=${payload?.round ?? "?"}`,
  );
  return { success: true };
}

/**
 * VISITA_DATOS_RECOPILADOS — Comprador proporcionó sus datos de visita.
 * Avanza leadStatus a VISITA_REALIZADA (los datos están listos, visita se ejecutará).
 */
export async function handleVisitaDatosRecopilados(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  const demandId = extractDemandId(event);
  console.log(
    `[visit-scheduling] VISITA_DATOS_RECOPILADOS sessionId=${payload?.sessionId ?? "?"} demandId=${demandId ?? "?"}`,
  );
  if (demandId) {
    await updateDemandLeadStatus(demandId, "VISITA_REALIZADA");
  }
  return { success: true };
}

/**
 * VISITA_ESCALADA_MANUAL — Escalado a asignación manual tras agotar rondas.
 * Marca el lead como PERDIDO si no se pudo coordinar la visita.
 */
export async function handleVisitaEscaladaManual(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  const sessionId = payload?.sessionId as string | undefined;
  const reason = payload?.reason as string | undefined;
  const demandId = extractDemandId(event);

  console.warn(
    `[visit-scheduling] VISITA_ESCALADA_MANUAL sessionId=${sessionId ?? "?"} reason="${reason ?? "unknown"}" demandId=${demandId ?? "?"}`,
  );

  if (demandId) {
    await updateDemandLeadStatus(demandId, "PERDIDO");
  }
  return { success: true };
}

/**
 * VISITA_CANCELADA — Visita cancelada.
 * Vuelve el lead a EN_SELECCION (comprador aún puede elegir otra propiedad)
 * y libera recursos residuales (locks) como red de seguridad.
 */
export async function handleVisitaCancelada(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  const sessionId = payload?.sessionId as string | undefined;
  const demandId = extractDemandId(event);

  console.log(
    `[visit-scheduling] VISITA_CANCELADA sessionId=${sessionId ?? "?"} demandId=${demandId ?? "?"}`,
  );

  if (sessionId) {
    try {
      await prisma.visitSlotLock.deleteMany({
        where: { sessionId, released: false },
      });
    } catch (err) {
      console.warn(
        `[visit-scheduling] VISITA_CANCELADA cleanup locks error: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (demandId) {
    await updateDemandLeadStatus(demandId, "EN_SELECCION");
  }

  return { success: true };
}

/**
 * VISITA_REPROGRAMADA — Solicitud de reprogramación (→ escalado manual).
 */
export async function handleVisitaReprogramada(
  event: Event,
): Promise<HandlerResult> {
  const payload = event.payload as Record<string, unknown> | null;
  console.log(
    `[visit-scheduling] VISITA_REPROGRAMADA sessionId=${payload?.sessionId ?? "?"}`,
  );
  return { success: true };
}
