import { prisma } from "@/lib/prisma";
import type { TimeSlot } from "./types";

// ---------------------------------------------------------------------------
// 1. createSlotLocks
// ---------------------------------------------------------------------------

/**
 * Crea soft-locks para cada slot propuesto al comercial.
 * Evita que otra sesión concurrente reserve los mismos horarios.
 *
 * Usa `createMany` + `skipDuplicates` para idempotencia:
 * si el lock ya existe (mismo comercial + slot + released=false) se ignora.
 */
export async function createSlotLocks(
  sessionId: string,
  comercialId: string,
  propertyCode: string | null,
  slots: TimeSlot[],
  ttlMs: number,
): Promise<number> {
  const expiresAt = new Date(Date.now() + ttlMs);

  const result = await prisma.visitSlotLock.createMany({
    data: slots.map((slot) => ({
      sessionId,
      comercialId,
      propertyCode,
      slotStart: slot.start,
      slotEnd: slot.end,
      expiresAt,
      released: false,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// 2. releaseLocksForSession
// ---------------------------------------------------------------------------

/**
 * Libera todos los soft-locks de una sesión eliminándolos.
 * Se usa al finalizar, cancelar o escalar la sesión.
 *
 * Usamos deleteMany en lugar de updateMany(released=true) para evitar
 * la violación del unique constraint (comercialId, slotStart, slotEnd, released)
 * cuando el mismo slot es propuesto en más de una ronda.
 */
export async function releaseLocksForSession(
  sessionId: string,
): Promise<number> {
  const result = await prisma.visitSlotLock.deleteMany({
    where: { sessionId, released: false },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// 3. releaseLocksExcept
// ---------------------------------------------------------------------------

/**
 * Libera todos los locks de la sesión excepto el slot seleccionado
 * por el comercial, eliminándolos de la DB.
 *
 * Usamos deleteMany en lugar de updateMany(released=true) para evitar
 * la violación del unique constraint (comercialId, slotStart, slotEnd, released)
 * cuando el mismo slot existe con released=true de una ronda anterior.
 */
export async function releaseLocksExcept(
  sessionId: string,
  keepSlotStart: Date,
  keepSlotEnd: Date,
): Promise<number> {
  const result = await prisma.visitSlotLock.deleteMany({
    where: {
      sessionId,
      released: false,
      NOT: {
        AND: [{ slotStart: keepSlotStart }, { slotEnd: keepSlotEnd }],
      },
    },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// 4. getActiveLocksForComercial
// ---------------------------------------------------------------------------

/**
 * Devuelve los locks activos (no expirados, no liberados) de un comercial.
 * Opcionalmente excluye una sesión específica (útil para re-fetch).
 */
export async function getActiveLocksForComercial(
  comercialId: string,
  excludeSessionId?: string,
) {
  return prisma.visitSlotLock.findMany({
    where: {
      comercialId,
      released: false,
      expiresAt: { gt: new Date() },
      ...(excludeSessionId ? { sessionId: { not: excludeSessionId } } : {}),
    },
    orderBy: { slotStart: "asc" },
  });
}

// ---------------------------------------------------------------------------
// 5. cleanupExpiredLocks
// ---------------------------------------------------------------------------

/**
 * Elimina todos los locks cuyo TTL ha expirado.
 * Destinada a ejecutarse periódicamente (cron / job de limpieza).
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const result = await prisma.visitSlotLock.deleteMany({
    where: {
      released: false,
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// 6. hasActiveLockForSlot
// ---------------------------------------------------------------------------

/**
 * Verifica si existe un lock activo (vigente, no liberado) para una sesión
 * y un slot específico. Usado en la confirmación atómica.
 */
export async function hasActiveLockForSlot(
  sessionId: string,
  slotStart: Date,
  slotEnd: Date,
): Promise<boolean> {
  const lock = await prisma.visitSlotLock.findFirst({
    where: {
      sessionId,
      slotStart,
      slotEnd,
      released: false,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return lock !== null;
}
