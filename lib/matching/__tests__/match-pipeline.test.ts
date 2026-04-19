/**
 * Test de integración E2E del pipeline Smart Matching (M5, Día 9):
 *
 * Flujo completo:
 * 1. Crear demanda activa en demands_current
 * 2. Crear propiedad → PROPIEDAD_CREADA → consumer → cruce → MATCH_GENERADO
 * 3. Verificar evento MATCH_GENERADO con score correcto
 * 4. Simular DEMANDA_ACTUALIZADA (comprador ajusta variables)
 * 5. Verificar que demands_current se actualiza
 * 6. Crear nueva propiedad → cruce con demanda actualizada → verificar nuevo match
 *
 * Usa BD real (Neon). Mock: ninguno (no invoca NLU en este test).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { runConsumerCycle } from "@/lib/workers/consumer";
import { runProjectionCycle } from "@/lib/projections";
import { matchDemandsToProperty } from "@/lib/matching";
import type { PropertyForMatching } from "@/lib/matching";

const TEST_RUN = `match-e2e-${Date.now()}`;
const WORKER_ID = `match-worker-${Date.now()}`;
const createdAggregateIds: string[] = [];
const createdEventIds: string[] = [];

async function cleanup() {
  if (createdEventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: createdEventIds } },
    });
  }

  const matchEvents = await prisma.event.findMany({
    where: { correlationId: { startsWith: TEST_RUN } },
    select: { id: true },
  });
  const matchEventIds = matchEvents.map((e) => e.id);
  if (matchEventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: matchEventIds } },
    });
  }

  await prisma.event.deleteMany({
    where: { correlationId: { startsWith: TEST_RUN } },
  });

  if (createdAggregateIds.length > 0) {
    await prisma.propertyCurrent.deleteMany({
      where: { codigo: { in: createdAggregateIds } },
    });
    await prisma.demandCurrent.deleteMany({
      where: { codigo: { in: createdAggregateIds } },
    });
    await prisma.demandSnapshot.deleteMany({
      where: { codigo: { in: createdAggregateIds } },
    });
  }
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function drainConsumerAndProjections(maxCycles = 20): Promise<void> {
  for (let i = 0; i < maxCycles; i++) {
    const consumer = await runConsumerCycle({
      workerId: WORKER_ID,
      types: ["PROCESS_EVENT"],
    });
    const projection = await runProjectionCycle({ workerId: WORKER_ID });
    if (consumer.noWork && projection.noWork) break;
  }
}

function trackId(id: string): string {
  createdAggregateIds.push(id);
  return id;
}

// ── Helpers: insertar datos de test ──────────────────────────────────────────

async function insertDemand(
  codigo: string,
  opts: {
    presupuestoMin: number;
    presupuestoMax: number;
    habitacionesMin: number;
    tipos: string;
    zonas: string;
  },
) {
  const correlationId = `${TEST_RUN}-demand-${codigo}`;
  const event = await appendEvent({
    type: "DEMANDA_CREADA",
    aggregateType: "DEMAND",
    aggregateId: codigo,
    payload: {
      snapshot: {
        codigo,
        ref: `REF-${codigo}`,
        nombre: `Demanda test ${codigo}`,
        estadoId: "1",
        estadoNombre: "Activa",
        presupuestoMin: opts.presupuestoMin,
        presupuestoMax: opts.presupuestoMax,
        habitacionesMin: opts.habitacionesMin,
        tipos: opts.tipos,
        zonas: opts.zonas,
        fechaActualizacion: new Date().toISOString(),
        agente: "test-agent",
      },
    },
    correlationId,
  });
  createdEventIds.push(event.id);

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    idempotencyKey: `process_event:${event.id}`,
    sourceEventId: event.id,
  });

  await drainConsumerAndProjections();
}

async function insertProperty(
  codigo: string,
  opts: {
    precio: number;
    metrosConstruidos: number;
    habitaciones: number;
    ciudad: string;
    zona: string;
    tipoOfer: string;
  },
) {
  const correlationId = `${TEST_RUN}-prop-${codigo}`;
  const event = await appendEvent({
    type: "PROPIEDAD_CREADA",
    aggregateType: "PROPERTY",
    aggregateId: codigo,
    payload: {
      snapshot: {
        codigo,
        ref: `REF-${codigo}`,
        titulo: `Propiedad test ${codigo}`,
        tipoOfer: opts.tipoOfer,
        precio: opts.precio,
        metrosConstruidos: opts.metrosConstruidos,
        habitaciones: opts.habitaciones,
        banyos: 1,
        ciudad: opts.ciudad,
        zona: opts.zona,
        estado: "Activo",
        fechaAlta: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
        numFotos: 3,
        agente: "test-agent",
      },
    },
    correlationId,
  });
  createdEventIds.push(event.id);

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    idempotencyKey: `process_event:${event.id}`,
    sourceEventId: event.id,
  });

  await drainConsumerAndProjections();
  return event;
}

async function ensureDemandSnapshot(
  codigo: string,
  opts: {
    presupuestoMin: number;
    presupuestoMax: number;
    habitacionesMin: number;
    tipos: string;
    zonas: string;
  },
) {
  await prisma.demandSnapshot.upsert({
    where: { codigo },
    create: {
      codigo,
      ref: `REF-${codigo}`,
      nombre: `Demanda test ${codigo}`,
      estadoId: "1",
      estadoNombre: "Activa",
      presupuestoMin: opts.presupuestoMin,
      presupuestoMax: opts.presupuestoMax,
      habitacionesMin: opts.habitacionesMin,
      tipos: opts.tipos,
      zonas: opts.zonas,
      agente: "test-agent",
      raw: {
        keycli: "CLI-001",
        keyagente: "AGT-001",
        tipopropiedad: opts.tipos,
      },
    },
    update: {
      presupuestoMin: opts.presupuestoMin,
      presupuestoMax: opts.presupuestoMax,
      habitacionesMin: opts.habitacionesMin,
      tipos: opts.tipos,
      zonas: opts.zonas,
      raw: {
        keycli: "CLI-001",
        keyagente: "AGT-001",
        tipopropiedad: opts.tipos,
      },
    },
  });
}

async function emitDemandaActualizada(
  demandId: string,
  variables: Record<string, unknown>,
) {
  const correlationId = `${TEST_RUN}-update-${demandId}`;
  const event = await appendEvent({
    type: "DEMANDA_ACTUALIZADA",
    aggregateType: "DEMAND",
    aggregateId: demandId,
    payload: {
      variables,
      detectedAt: new Date().toISOString(),
      source: { test: true },
    },
    correlationId,
  });
  createdEventIds.push(event.id);

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: event.id },
    idempotencyKey: `process_event:${event.id}`,
    sourceEventId: event.id,
  });

  await drainConsumerAndProjections();
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe("Smart Matching Pipeline E2E", { timeout: 60_000 }, () => {

  it("matchDemandsToProperty encuentra match cuando demanda y propiedad coinciden", async () => {
    const demandId = trackId(`DEM-MATCH-A-${Date.now()}`);
    const propId = trackId(`PROP-MATCH-A-${Date.now()}`);

    await insertDemand(demandId, {
      presupuestoMin: 200_000,
      presupuestoMax: 350_000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
    });

    await insertProperty(propId, {
      precio: 280_000,
      metrosConstruidos: 95,
      habitaciones: 3,
      ciudad: "Córdoba",
      zona: "Centro",
      tipoOfer: "Piso",
    });

    const prop: PropertyForMatching = {
      codigo: propId,
      ref: `REF-${propId}`,
      titulo: "Piso test",
      tipoOfer: "Piso",
      precio: 280_000,
      metrosConstruidos: 95,
      habitaciones: 3,
      ciudad: "Córdoba",
      zona: "Centro",
    };

    const result = await matchDemandsToProperty(prop);

    const ourMatch = result.matches.find((m) => m.demandId === demandId);
    expect(ourMatch).toBeDefined();
    expect(ourMatch!.totalScore).toBeGreaterThanOrEqual(70);
    expect(ourMatch!.matchScore.zone.matched).toBe(true);
    expect(ourMatch!.matchScore.price.matched).toBe(true);
    expect(ourMatch!.matchScore.type.matched).toBe(true);
  });

  it("matchDemandsToProperty NO genera match cuando zona y tipo no coinciden", async () => {
    const demandId = trackId(`DEM-NOMATCH-${Date.now()}`);
    const propId = trackId(`PROP-NOMATCH-${Date.now()}`);

    await insertDemand(demandId, {
      presupuestoMin: 100_000,
      presupuestoMax: 150_000,
      habitacionesMin: 4,
      tipos: "Casa",
      zonas: "Nervión",
    });

    await insertProperty(propId, {
      precio: 400_000,
      metrosConstruidos: 60,
      habitaciones: 1,
      ciudad: "Málaga",
      zona: "Pedregalejo",
      tipoOfer: "Estudio",
    });

    const prop: PropertyForMatching = {
      codigo: propId,
      ref: `REF-${propId}`,
      titulo: "Estudio test",
      tipoOfer: "Estudio",
      precio: 400_000,
      metrosConstruidos: 60,
      habitaciones: 1,
      ciudad: "Málaga",
      zona: "Pedregalejo",
    };

    const result = await matchDemandsToProperty(prop);
    const ourMatch = result.matches.find((m) => m.demandId === demandId);
    expect(ourMatch).toBeUndefined();
  });

  it("PROPIEDAD_CREADA → consumer genera evento MATCH_GENERADO en el event store", async () => {
    const demandId = trackId(`DEM-EVT-${Date.now()}`);
    const propId = trackId(`PROP-EVT-${Date.now()}`);

    await insertDemand(demandId, {
      presupuestoMin: 150_000,
      presupuestoMax: 300_000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
    });

    await insertProperty(propId, {
      precio: 220_000,
      metrosConstruidos: 80,
      habitaciones: 2,
      ciudad: "Córdoba",
      zona: "Centro",
      tipoOfer: "Piso",
    });

    const matchEvents = await prisma.event.findMany({
      where: {
        type: "MATCH_GENERADO",
        aggregateId: { contains: propId },
      },
    });

    const ourEvent = matchEvents.find((e) => {
      const p = e.payload as Record<string, unknown>;
      return p.demandId === demandId && p.propertyId === propId;
    });

    expect(ourEvent).toBeDefined();
    const payload = ourEvent!.payload as Record<string, unknown>;
    expect(payload.totalScore).toBeGreaterThanOrEqual(70);
    expect(payload.demandRef).toBeTruthy();
    expect(payload.propertyRef).toBeTruthy();
  });

  it("DEMANDA_ACTUALIZADA actualiza demands_current y cambia resultados del cruce", async () => {
    const demandId = trackId(`DEM-UPD-${Date.now()}`);

    const demandOpts = {
      presupuestoMin: 200_000,
      presupuestoMax: 300_000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
    };
    await insertDemand(demandId, demandOpts);
    await ensureDemandSnapshot(demandId, demandOpts);

    const demandBefore = await prisma.demandCurrent.findUnique({
      where: { codigo: demandId },
    });
    expect(demandBefore).not.toBeNull();
    expect(demandBefore!.presupuestoMax).toBe(300_000);
    expect(demandBefore!.zonas).toBe("Centro");

    await emitDemandaActualizada(demandId, {
      precioMax: 150_000,
      zonas: ["Macarena"],
    });

    const demandAfter = await prisma.demandCurrent.findUnique({
      where: { codigo: demandId },
    });
    expect(demandAfter).not.toBeNull();
    expect(demandAfter!.presupuestoMax).toBe(150_000);
    expect(demandAfter!.zonas).toContain("Macarena");

    const mismatchedProperty: PropertyForMatching = {
      codigo: "PROP-MISMATCH",
      ref: "REF-MIS",
      titulo: "Piso fuera de criterios",
      tipoOfer: "Piso",
      precio: 280_000,
      metrosConstruidos: 90,
      habitaciones: 3,
      ciudad: "Córdoba",
      zona: "Centro",
    };

    const result = await matchDemandsToProperty(mismatchedProperty);
    const match = result.matches.find((m) => m.demandId === demandId);
    expect(match).toBeUndefined();
  });

  it("flujo completo: propiedad → match → ajuste demanda → recruce con resultados diferentes", async () => {
    const demandId = trackId(`DEM-FULL-${Date.now()}`);
    const propId1 = trackId(`PROP-FULL1-${Date.now()}`);
    const propId2 = trackId(`PROP-FULL2-${Date.now()}`);

    const demandOpts = {
      presupuestoMin: 200_000,
      presupuestoMax: 300_000,
      habitacionesMin: 2,
      tipos: "Piso",
      zonas: "Centro",
    };

    // 1. Demanda activa: busca piso en Centro, 200k–300k
    await insertDemand(demandId, demandOpts);
    await ensureDemandSnapshot(demandId, demandOpts);

    // 2. Propiedad 1: Piso en Centro 250k → match
    await insertProperty(propId1, {
      precio: 250_000,
      metrosConstruidos: 90,
      habitaciones: 3,
      ciudad: "Córdoba",
      zona: "Centro",
      tipoOfer: "Piso",
    });

    const matchEventsRound1 = await prisma.event.findMany({
      where: {
        type: "MATCH_GENERADO",
        aggregateId: { contains: propId1 },
      },
    });
    const round1Match = matchEventsRound1.find((e) => {
      const p = e.payload as Record<string, unknown>;
      return p.demandId === demandId;
    });
    expect(round1Match).toBeDefined();

    // 3. El comprador dice "no me encaja, busco algo más barato en Macarena"
    //    → DEMANDA_ACTUALIZADA: baja presupuesto, cambia zona
    await emitDemandaActualizada(demandId, {
      precioMax: 180_000,
      zonas: ["Macarena"],
    });

    const updatedDemand = await prisma.demandCurrent.findUnique({
      where: { codigo: demandId },
    });
    expect(updatedDemand!.presupuestoMax).toBe(180_000);
    expect(updatedDemand!.zonas).toContain("Macarena");

    // 4. Propiedad 2: Piso en Centro 260k → NO debe hacer match
    //    (la demanda ahora busca Macarena y <180k)
    await insertProperty(propId2, {
      precio: 260_000,
      metrosConstruidos: 85,
      habitaciones: 2,
      ciudad: "Córdoba",
      zona: "Centro",
      tipoOfer: "Piso",
    });

    const matchEventsRound2 = await prisma.event.findMany({
      where: {
        type: "MATCH_GENERADO",
        aggregateId: { contains: propId2 },
      },
    });
    const round2Match = matchEventsRound2.find((e) => {
      const p = e.payload as Record<string, unknown>;
      return p.demandId === demandId;
    });
    expect(round2Match).toBeUndefined();
  });
});
