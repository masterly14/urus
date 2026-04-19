import {
  addDays,
  addMinutes,
  startOfDay,
  isBefore,
  isAfter,
  isEqual,
  getDay,
  format,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";

import { prisma } from "@/lib/prisma";
import { getFreeBusy } from "@/lib/composio/calendar";
import {
  WORKING_HOURS,
  VISIT_DURATION_MIN,
  BUFFER_BETWEEN_VISITS_MIN,
  LOOKAHEAD_BUSINESS_DAYS,
  MAX_SLOTS_TO_PROPOSE,
  MAX_CONCURRENT_VISITS_PER_PROPERTY,
  COMPOSIO_DIRECT_API_MAX_RETRIES,
} from "./constants";
import type {
  TimeSlot,
  ProposedSlot,
  FreeBusyBlock,
  SlotFinderInput,
  SlotFinderResult,
} from "./types";

const TZ = WORKING_HOURS.timezone;

// ---------------------------------------------------------------------------
// 1. generateWorkingSlots
// ---------------------------------------------------------------------------

/**
 * Genera todos los slots de {@link VISIT_DURATION_MIN} min dentro del horario
 * laboral, avanzando en pasos de 30 min, para los próximos N días laborables.
 *
 * Los slots se generan en la zona {@link TZ} y se devuelven como `Date` UTC.
 */
export function generateWorkingSlots(
  startDate: Date,
  businessDays: number = LOOKAHEAD_BUSINESS_DAYS,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const now = new Date();
  const STEP_MIN = 30;
  const zonedStart = toZonedTime(startDate, TZ);
  let cursor = startOfDay(zonedStart);
  let counted = 0;

  while (counted < businessDays) {
    const dow = getDay(cursor); // 0=Sun
    const isoDay = dow === 0 ? 7 : dow; // 1=Mon … 7=Sun

    if ((WORKING_HOURS.days as readonly number[]).includes(isoDay)) {
      for (const block of WORKING_HOURS.blocks) {
        const [bStartH, bStartM] = block.start.split(":").map(Number);
        const [bEndH, bEndM] = block.end.split(":").map(Number);

        const blockStart = new Date(cursor);
        blockStart.setHours(bStartH, bStartM, 0, 0);

        const blockEnd = new Date(cursor);
        blockEnd.setHours(bEndH, bEndM, 0, 0);

        let slotStart = new Date(blockStart);

        while (true) {
          const slotEnd = addMinutes(slotStart, VISIT_DURATION_MIN);
          if (isAfter(slotEnd, blockEnd)) break;

          const utcStart = fromZonedTime(slotStart, TZ);
          const utcEnd = fromZonedTime(slotEnd, TZ);

          if (isAfter(utcStart, now) || isEqual(utcStart, now)) {
            slots.push({ start: utcStart, end: utcEnd });
          }

          slotStart = addMinutes(slotStart, STEP_MIN);
        }
      }
      counted++;
    }

    cursor = addDays(cursor, 1);
  }

  return slots;
}

// ---------------------------------------------------------------------------
// 2. filterByCalendar
// ---------------------------------------------------------------------------

/**
 * Elimina slots que colisionan con bloques ocupados del calendario,
 * incluyendo un buffer de {@link BUFFER_BETWEEN_VISITS_MIN} min antes y después.
 */
export function filterByCalendar(
  slots: TimeSlot[],
  busyBlocks: FreeBusyBlock[],
): TimeSlot[] {
  if (busyBlocks.length === 0) return slots;

  const parsed = busyBlocks.map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  return slots.filter((slot) => {
    const bufferedStart = addMinutes(slot.start, -BUFFER_BETWEEN_VISITS_MIN);
    const bufferedEnd = addMinutes(slot.end, BUFFER_BETWEEN_VISITS_MIN);

    return !parsed.some(
      (busy) =>
        isBefore(bufferedStart, busy.end) && isAfter(bufferedEnd, busy.start),
    );
  });
}

// ---------------------------------------------------------------------------
// 3. filterByLocks
// ---------------------------------------------------------------------------

/**
 * Elimina slots que tienen un soft-lock activo (no expirado, no liberado)
 * de otro proceso de negociación del mismo comercial.
 */
export async function filterByLocks(
  slots: TimeSlot[],
  comercialId: string,
  excludeSessionId?: string,
): Promise<TimeSlot[]> {
  if (slots.length === 0) return [];

  const earliest = slots[0].start;
  const latest = slots[slots.length - 1].end;

  const locks = await prisma.visitSlotLock.findMany({
    where: {
      comercialId,
      released: false,
      expiresAt: { gt: new Date() },
      slotStart: { lt: latest },
      slotEnd: { gt: earliest },
      ...(excludeSessionId ? { sessionId: { not: excludeSessionId } } : {}),
    },
    select: { slotStart: true, slotEnd: true },
  });

  if (locks.length === 0) return slots;

  return slots.filter((slot) => {
    return !locks.some(
      (lock) =>
        isBefore(slot.start, lock.slotEnd) &&
        isAfter(slot.end, lock.slotStart),
    );
  });
}

// ---------------------------------------------------------------------------
// 4. filterByPropertyCapacity
// ---------------------------------------------------------------------------

/**
 * Elimina slots donde la propiedad ya alcanzó el máximo de visitas confirmadas
 * simultáneas ({@link MAX_CONCURRENT_VISITS_PER_PROPERTY}).
 */
export async function filterByPropertyCapacity(
  slots: TimeSlot[],
  propertyCode: string,
): Promise<TimeSlot[]> {
  if (slots.length === 0) return [];

  const earliest = slots[0].start;
  const latest = slots[slots.length - 1].end;

  const existingVisits = await prisma.propertyVisitSlot.findMany({
    where: {
      propertyCode,
      cancelled: false,
      slotStart: { lt: latest },
      slotEnd: { gt: earliest },
    },
    select: { slotStart: true, slotEnd: true },
  });

  if (existingVisits.length === 0) return slots;

  return slots.filter((slot) => {
    const overlapping = existingVisits.filter(
      (v) => isBefore(slot.start, v.slotEnd) && isAfter(slot.end, v.slotStart),
    );
    return overlapping.length < MAX_CONCURRENT_VISITS_PER_PROPERTY;
  });
}

// ---------------------------------------------------------------------------
// 5. selectTopSlots
// ---------------------------------------------------------------------------

/**
 * Selecciona los mejores N slots usando heurísticas:
 * - Proximidad temporal (más cercanos primero)
 * - Distribución por día (max 2 por día para dar opciones variadas)
 * - Preferencia mañana (09:00–14:00) sobre tarde
 */
export function selectTopSlots(
  slots: TimeSlot[],
  maxCount: number = MAX_SLOTS_TO_PROPOSE,
): TimeSlot[] {
  if (slots.length <= maxCount) return slots;

  const sorted = [...slots].sort((a, b) => {
    const dayA = startOfDay(a.start).getTime();
    const dayB = startOfDay(b.start).getTime();
    if (dayA !== dayB) return dayA - dayB;

    const hourA = toZonedTime(a.start, TZ).getHours();
    const hourB = toZonedTime(b.start, TZ).getHours();
    const isMorningA = hourA < 14 ? 0 : 1;
    const isMorningB = hourB < 14 ? 0 : 1;
    if (isMorningA !== isMorningB) return isMorningA - isMorningB;

    return a.start.getTime() - b.start.getTime();
  });

  const selected: TimeSlot[] = [];
  const perDay = new Map<string, number>();
  const MAX_PER_DAY = 2;

  for (const slot of sorted) {
    if (selected.length >= maxCount) break;

    const dayKey = startOfDay(slot.start).toISOString();
    const dayCount = perDay.get(dayKey) ?? 0;

    if (dayCount < MAX_PER_DAY) {
      selected.push(slot);
      perDay.set(dayKey, dayCount + 1);
    }
  }

  if (selected.length < maxCount) {
    for (const slot of sorted) {
      if (selected.length >= maxCount) break;
      if (!selected.includes(slot)) {
        selected.push(slot);
      }
    }
  }

  return selected;
}

// ---------------------------------------------------------------------------
// 6. formatSlotLabel
// ---------------------------------------------------------------------------

/**
 * Genera una etiqueta legible para WhatsApp.
 * Ejemplo: "Mar 15 Abr · 10:00–11:00"
 */
export function formatSlotLabel(slot: TimeSlot): string {
  const zonedStart = toZonedTime(slot.start, TZ);
  const zonedEnd = toZonedTime(slot.end, TZ);

  const dayName = format(zonedStart, "EEE", { locale: es });
  const dayNum = format(zonedStart, "d");
  const month = format(zonedStart, "MMM", { locale: es });
  const startTime = format(zonedStart, "HH:mm");
  const endTime = format(zonedEnd, "HH:mm");

  const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  return `${capitalized} ${dayNum} ${month} · ${startTime}–${endTime}`;
}

// ---------------------------------------------------------------------------
// 7. findAvailableSlots — Orquestador principal
// ---------------------------------------------------------------------------

/**
 * Pipeline completo de búsqueda de disponibilidad:
 * 1. Genera slots del horario laboral (L–S, 09–14 + 16–20)
 * 2. Consulta busy blocks vía Composio (API directa, fallback a agente)
 * 3. Filtra por calendario
 * 4. Filtra por soft-locks de otras sesiones
 * 5. Filtra por capacidad de la propiedad
 * 6. Selecciona top N con heurísticas
 * 7. Genera labels legibles
 */
export async function findAvailableSlots(
  input: SlotFinderInput,
): Promise<SlotFinderResult> {
  const now = new Date();

  // 1. Generar todos los slots del horario laboral
  const workingSlots = generateWorkingSlots(now);

  if (workingSlots.length === 0) {
    return { available: [], totalCandidates: 0 };
  }

  // 2. Obtener busy blocks del calendario vía Composio
  const timeMin = workingSlots[0].start.toISOString();
  const timeMax = workingSlots[workingSlots.length - 1].end.toISOString();

  // H30: se eliminó el fallback con agente LLM (getFreeBusyWithAgent).
  // El LLM no es determinista y podía proponer slots sobre bloques ocupados,
  // generando doble reserva en el calendario del comercial. Si la API directa
  // de Composio falla tras los reintentos, propagamos el error para que el
  // orquestador escale la visita al comercial en vez de usar datos dudosos.
  const freeBusy = await getFreeBusy(
    input.composioConnectionId,
    timeMin,
    timeMax,
  );
  if (!freeBusy.success) {
    throw new Error(
      `No se pudo consultar disponibilidad de calendario tras ${COMPOSIO_DIRECT_API_MAX_RETRIES} intentos: ${freeBusy.error ?? "Composio free/busy API no respondió"}`,
    );
  }
  const busyBlocks: FreeBusyBlock[] = freeBusy.busy;
  // 3. Filtrar por calendario
  let filtered = filterByCalendar(workingSlots, busyBlocks);

  // 4. Filtrar por soft-locks
  filtered = await filterByLocks(
    filtered,
    input.comercialId,
    input.excludeSessionId,
  );

  // 5. Filtrar por capacidad de la propiedad
  filtered = await filterByPropertyCapacity(filtered, input.propertyCode);

  // 6. Excluir slots ya rechazados en rondas anteriores
  if (input.excludeSlotStarts?.length) {
    const excludedMs = new Set(input.excludeSlotStarts.map((d) => d.getTime()));
    filtered = filtered.filter((s) => !excludedMs.has(s.start.getTime()));
  }

  const totalCandidates = filtered.length;

  // 7. Seleccionar top N
  const top = selectTopSlots(filtered);

  // 7. Generar ProposedSlots con labels
  const available: ProposedSlot[] = top.map((slot) => ({
    ...slot,
    label: formatSlotLabel(slot),
  }));

  return { available, totalCandidates };
}

// ---------------------------------------------------------------------------
// 8. findSpecificSlot — Busca disponibilidad en una fecha/hora concreta
// ---------------------------------------------------------------------------

/**
 * Verifica si un slot específico (indicado por el comprador) está disponible.
 * Usado en el flujo "ASKING_BUYER_PREFERENCE" cuando el comprador indica
 * un día/hora concreto y se necesita verificar contra el calendario.
 */
export async function findSpecificSlot(
  input: SlotFinderInput & { preferredDate: Date },
): Promise<SlotFinderResult> {
  const slotStart = input.preferredDate;
  const slotEnd = addMinutes(slotStart, VISIT_DURATION_MIN);

  const zonedStart = toZonedTime(slotStart, TZ);
  const hour = zonedStart.getHours();
  const dow = getDay(zonedStart);
  const isoDay = dow === 0 ? 7 : dow;

  if (!(WORKING_HOURS.days as readonly number[]).includes(isoDay)) {
    return { available: [], totalCandidates: 0 };
  }

  const inBlock = WORKING_HOURS.blocks.some((block) => {
    const [bStartH, bStartM] = block.start.split(":").map(Number);
    const [bEndH, bEndM] = block.end.split(":").map(Number);
    const blockStartMin = bStartH * 60 + bStartM;
    const blockEndMin = bEndH * 60 + bEndM;
    const slotStartMin = hour * 60 + zonedStart.getMinutes();
    const slotEndMin = slotStartMin + VISIT_DURATION_MIN;
    return slotStartMin >= blockStartMin && slotEndMin <= blockEndMin;
  });

  if (!inBlock) {
    return { available: [], totalCandidates: 0 };
  }

  const dayStart = fromZonedTime(
    startOfDay(zonedStart),
    TZ,
  );
  const dayEnd = addDays(dayStart, 1);

  // H30: sin fallback LLM — si la API directa falla, propagamos para que
  // el orquestador escale al comercial en vez de arriesgar doble reserva.
  const freeBusy = await getFreeBusy(
    input.composioConnectionId,
    dayStart.toISOString(),
    dayEnd.toISOString(),
  );
  if (!freeBusy.success) {
    throw new Error(
      `No se pudo verificar disponibilidad para el slot específico: ${freeBusy.error ?? "Composio free/busy API no respondió"}`,
    );
  }
  const busyBlocks: FreeBusyBlock[] = freeBusy.busy;

  const candidate: TimeSlot = { start: slotStart, end: slotEnd };

  let filtered = filterByCalendar([candidate], busyBlocks);
  filtered = await filterByLocks(
    filtered,
    input.comercialId,
    input.excludeSessionId,
  );
  filtered = await filterByPropertyCapacity(filtered, input.propertyCode);

  const available: ProposedSlot[] = filtered.map((slot) => ({
    ...slot,
    label: formatSlotLabel(slot),
  }));

  return { available, totalCandidates: filtered.length };
}
