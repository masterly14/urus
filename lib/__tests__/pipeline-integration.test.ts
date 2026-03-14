/**
 * Tests de integración E2E del pipeline completo:
 * Ingestion → appendEvent + PROCESS_EVENT → Consumer → UPDATE_*_PROJECTION → Projection Worker → *_current
 *
 * Estos tests usan la BD real (Neon) y verifican el flujo de datos de punta a punta.
 * Son resilientes a ejecución paralela con otros test files que también crean jobs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { publishEventsForDiff } from "@/lib/workers/ingestion/event-publisher";
import { publishDemandEventsForDiff } from "@/lib/workers/ingestion/demands/event-publisher";
import { runConsumerCycle } from "@/lib/workers/consumer";
import { runProjectionCycle } from "@/lib/projections";
import type { PropertyDiffResult } from "@/lib/workers/ingestion/types";
import type { DemandDiffResult } from "@/lib/workers/ingestion/demands/types";

const TEST_RUN_ID = `pipeline-e2e-${Date.now()}`;
const WORKER_ID = `e2e-worker-${Date.now()}`;
const cycleIds: string[] = [];

function testCycleId(suffix: string): string {
  const id = `${TEST_RUN_ID}-${suffix}`;
  cycleIds.push(id);
  return id;
}

async function cleanupTestData() {
  if (cycleIds.length === 0) return;

  const events = await prisma.event.findMany({
    where: { correlationId: { in: cycleIds } },
    select: { id: true, aggregateId: true, aggregateType: true },
  });

  const eventIds = events.map((e) => e.id);
  const propertyAggregateIds = events
    .filter((e) => e.aggregateType === "PROPERTY")
    .map((e) => e.aggregateId);
  const demandAggregateIds = events
    .filter((e) => e.aggregateType === "DEMAND")
    .map((e) => e.aggregateId);

  if (eventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: eventIds } },
    });
  }

  if (propertyAggregateIds.length > 0) {
    await prisma.propertyCurrent.deleteMany({
      where: { codigo: { in: propertyAggregateIds } },
    });
  }

  if (demandAggregateIds.length > 0) {
    await prisma.demandCurrent.deleteMany({
      where: { codigo: { in: demandAggregateIds } },
    });
  }

  await prisma.event.deleteMany({
    where: { correlationId: { in: cycleIds } },
  });
}

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helpers: datos de prueba
// ---------------------------------------------------------------------------

function buildPropertyCreatedDiff(codigo: string): PropertyDiffResult {
  return {
    created: [
      {
        type: "created",
        property: {
          codigo,
          ref: `REF-${codigo}`,
          titulo: "Piso E2E creación",
          tipoOfer: "Piso",
          precio: 250_000,
          metrosConstruidos: 90,
          habitaciones: 3,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Centro",
          estado: "Activo",
          fechaAlta: "2026-03-14 08:00:00",
          fechaActualizacion: "2026-03-14 08:00:00",
          numFotos: 5,
          agente: "AgentE2E",
          raw: {},
        },
      },
    ],
    modified: [],
    statusChanged: [],
    unchanged: 0,
  };
}

function buildPropertyModifiedDiff(codigo: string): PropertyDiffResult {
  return {
    created: [],
    modified: [
      {
        type: "modified",
        property: {
          codigo,
          ref: `REF-${codigo}`,
          titulo: "Piso E2E modificado",
          tipoOfer: "Piso",
          precio: 275_000,
          metrosConstruidos: 90,
          habitaciones: 3,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Centro",
          estado: "Activo",
          fechaAlta: "2026-03-14 08:00:00",
          fechaActualizacion: "2026-03-14 10:00:00",
          numFotos: 5,
          agente: "AgentE2E",
          raw: {},
        },
        before: {
          precio: 250_000,
          metrosConstruidos: 90,
          habitaciones: 3,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Centro",
          estado: "Activo",
          fechaActualizacion: "2026-03-14 08:00:00",
        },
        changedFields: ["precio", "fechaActualizacion"],
      },
    ],
    statusChanged: [],
    unchanged: 0,
  };
}

function buildPropertyStatusChangedDiff(codigo: string): PropertyDiffResult {
  return {
    created: [],
    modified: [],
    statusChanged: [
      {
        type: "status_changed",
        property: {
          codigo,
          ref: `REF-${codigo}`,
          titulo: "Piso E2E estado",
          tipoOfer: "Piso",
          precio: 300_000,
          metrosConstruidos: 95,
          habitaciones: 4,
          banyos: 2,
          ciudad: "Madrid",
          zona: "Salamanca",
          estado: "Reservado",
          fechaAlta: "2026-03-14 08:00:00",
          fechaActualizacion: "2026-03-14 12:00:00",
          numFotos: 8,
          agente: "AgentE2E",
          raw: {},
        },
        previousEstado: "Activo",
        newEstado: "Reservado",
        otherChangedFields: ["fechaActualizacion"],
      },
    ],
    unchanged: 0,
  };
}

function buildDemandCreatedDiff(codigo: string): DemandDiffResult {
  return {
    created: [
      {
        type: "created",
        demand: {
          codigo,
          ref: `REF-${codigo}`,
          nombre: "Demanda E2E creación",
          estadoId: "20",
          estadoNombre: "Buscando",
          presupuestoMin: 100_000,
          presupuestoMax: 200_000,
          habitacionesMin: 2,
          tipos: "Piso",
          zonas: "Centro",
          fechaActualizacion: "2026-03-14 08:00:00",
          agente: "AgentE2E",
          raw: {},
        },
      },
    ],
    modified: [],
    statusChanged: [],
    unchanged: 0,
  };
}

function buildDemandStatusChangedDiff(codigo: string): DemandDiffResult {
  return {
    created: [],
    modified: [],
    statusChanged: [
      {
        type: "status_changed",
        demand: {
          codigo,
          ref: `REF-${codigo}`,
          nombre: "Demanda E2E estado",
          estadoId: "30",
          estadoNombre: "Comprada",
          presupuestoMin: 150_000,
          presupuestoMax: 300_000,
          habitacionesMin: 3,
          tipos: "Piso",
          zonas: "Retiro",
          fechaActualizacion: "2026-03-14 14:00:00",
          agente: "AgentE2E",
          raw: {},
        },
        previousEstadoId: "20",
        previousEstadoNombre: "Buscando",
        newEstadoId: "30",
        newEstadoNombre: "Comprada",
        otherChangedFields: ["fechaActualizacion"],
      },
    ],
    unchanged: 0,
  };
}

function buildMultiEventPropertyDiff(codigoBase: string): PropertyDiffResult {
  return {
    created: [
      {
        type: "created",
        property: {
          codigo: `${codigoBase}-C`,
          ref: `REF-${codigoBase}-C`,
          titulo: "Nueva propiedad multi",
          tipoOfer: "Piso",
          precio: 180_000,
          metrosConstruidos: 70,
          habitaciones: 2,
          banyos: 1,
          ciudad: "Barcelona",
          zona: "Eixample",
          estado: "Activo",
          fechaAlta: "2026-03-14 09:00:00",
          fechaActualizacion: "2026-03-14 09:00:00",
          numFotos: 4,
          agente: "AgentMulti",
          raw: {},
        },
      },
    ],
    modified: [
      {
        type: "modified",
        property: {
          codigo: `${codigoBase}-M`,
          ref: `REF-${codigoBase}-M`,
          titulo: "Modificada multi",
          tipoOfer: "Piso",
          precio: 220_000,
          metrosConstruidos: 80,
          habitaciones: 3,
          banyos: 1,
          ciudad: "Barcelona",
          zona: "Gracia",
          estado: "Activo",
          fechaAlta: "2026-03-10 09:00:00",
          fechaActualizacion: "2026-03-14 11:00:00",
          numFotos: 6,
          agente: "AgentMulti",
          raw: {},
        },
        before: {
          precio: 210_000,
          metrosConstruidos: 80,
          habitaciones: 3,
          banyos: 1,
          ciudad: "Barcelona",
          zona: "Gracia",
          estado: "Activo",
          fechaActualizacion: "2026-03-13 09:00:00",
        },
        changedFields: ["precio", "fechaActualizacion"],
      },
    ],
    statusChanged: [
      {
        type: "status_changed",
        property: {
          codigo: `${codigoBase}-S`,
          ref: `REF-${codigoBase}-S`,
          titulo: "Cambio estado multi",
          tipoOfer: "Chalet",
          precio: 500_000,
          metrosConstruidos: 200,
          habitaciones: 5,
          banyos: 3,
          ciudad: "Barcelona",
          zona: "Sarrià",
          estado: "Vendido",
          fechaAlta: "2026-03-01 09:00:00",
          fechaActualizacion: "2026-03-14 13:00:00",
          numFotos: 12,
          agente: "AgentMulti",
          raw: {},
        },
        previousEstado: "Reservado",
        newEstado: "Vendido",
        otherChangedFields: ["fechaActualizacion"],
      },
    ],
    unchanged: 5,
  };
}

// ---------------------------------------------------------------------------
// Helper: drenar todo el trabajo pendiente del pipeline
// Resiliente a jobs de otros tests que comparten la cola.
// ---------------------------------------------------------------------------

async function drainPipeline(maxCycles = 30): Promise<{
  consumerProcessed: number;
  projectionsProcessed: number;
}> {
  let consumerProcessed = 0;
  let projectionsProcessed = 0;

  for (let i = 0; i < maxCycles; i++) {
    const result = await runConsumerCycle({
      workerId: WORKER_ID,
      types: ["PROCESS_EVENT"],
    });
    if (result.noWork) break;
    consumerProcessed += result.processed;
  }

  for (let i = 0; i < maxCycles; i++) {
    const result = await runProjectionCycle({ workerId: WORKER_ID });
    if (result.noWork) break;
    projectionsProcessed += result.processed;
  }

  return { consumerProcessed, projectionsProcessed };
}

/**
 * Espera hasta que todos los jobs vinculados a los eventIds dados
 * hayan pasado a COMPLETED (o DEAD_LETTER), con un timeout.
 */
async function waitForJobsCompleted(
  eventIds: string[],
  jobTypes: string[],
  timeoutMs = 25_000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Drenar un ciclo
    await runConsumerCycle({ workerId: WORKER_ID, types: ["PROCESS_EVENT"] });
    await runProjectionCycle({ workerId: WORKER_ID });

    const pending = await prisma.jobQueue.count({
      where: {
        sourceEventId: { in: eventIds },
        type: { in: jobTypes as never[] },
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });

    if (pending === 0) return;
  }

  throw new Error(`Timeout esperando jobs para eventIds: ${eventIds.join(", ")}`);
}

// ===========================================================================
// TESTS
// ===========================================================================

describe("Pipeline E2E: Ingestion → Consumer → Projection", { timeout: 30_000 }, () => {
  it("PROPIEDAD_CREADA: el ciclo completo materializa la propiedad en properties_current", async () => {
    const codigo = `E2E-PROP-CREATE-${Date.now()}`;
    const cycleId = testCycleId("prop-create");
    const diff = buildPropertyCreatedDiff(codigo);

    // 1. Ingestion: emitir evento + encolar PROCESS_EVENT
    const summary = await publishEventsForDiff(diff, cycleId);
    expect(summary.emitted).toBe(1);

    // Verificar evento en el Event Store
    const events = await prisma.event.findMany({
      where: { correlationId: cycleId },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("PROPIEDAD_CREADA");
    expect(events[0].aggregateId).toBe(codigo);

    // Verificar job PROCESS_EVENT encolado
    const processJobs = await prisma.jobQueue.findMany({
      where: { sourceEventId: events[0].id, type: "PROCESS_EVENT" },
    });
    expect(processJobs).toHaveLength(1);
    expect(processJobs[0].status).toBe("PENDING");

    // 2-3. Consumer + Projection Worker: drenar hasta que todos los jobs de ESTE evento estén completos
    await waitForJobsCompleted(
      [events[0].id],
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );

    // 4. Verificar PROCESS_EVENT marcado COMPLETED
    const processJobAfter = await prisma.jobQueue.findUnique({
      where: { id: processJobs[0].id },
    });
    expect(processJobAfter?.status).toBe("COMPLETED");

    // Verificar follow-up job UPDATE_PROPERTY_PROJECTION creado y completado
    const projJobs = await prisma.jobQueue.findMany({
      where: { sourceEventId: events[0].id, type: "UPDATE_PROPERTY_PROJECTION" },
    });
    expect(projJobs).toHaveLength(1);
    expect(projJobs[0].status).toBe("COMPLETED");

    // 5. Verificar estado final en properties_current
    const prop = await prisma.propertyCurrent.findUnique({ where: { codigo } });
    expect(prop).not.toBeNull();
    expect(prop!.precio).toBe(250_000);
    expect(prop!.habitaciones).toBe(3);
    expect(prop!.banyos).toBe(2);
    expect(prop!.ciudad).toBe("Madrid");
    expect(prop!.zona).toBe("Centro");
    expect(prop!.estado).toBe("Activo");
    expect(prop!.agente).toBe("AgentE2E");
    expect(prop!.lastEventId).toBe(events[0].id);
  });

  it("DEMANDA_CREADA: el ciclo completo materializa la demanda en demands_current", async () => {
    const codigo = `E2E-DEM-CREATE-${Date.now()}`;
    const cycleId = testCycleId("dem-create");
    const diff = buildDemandCreatedDiff(codigo);

    const summary = await publishDemandEventsForDiff(diff, cycleId);
    expect(summary.emitted).toBe(1);

    const events = await prisma.event.findMany({
      where: { correlationId: cycleId },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("DEMANDA_CREADA");

    await waitForJobsCompleted(
      [events[0].id],
      ["PROCESS_EVENT", "UPDATE_DEMAND_PROJECTION"],
    );

    // Verificar follow-up UPDATE_DEMAND_PROJECTION completado
    const projJobs = await prisma.jobQueue.findMany({
      where: { sourceEventId: events[0].id, type: "UPDATE_DEMAND_PROJECTION" },
    });
    expect(projJobs).toHaveLength(1);
    expect(projJobs[0].status).toBe("COMPLETED");

    // Verificar estado final
    const demand = await prisma.demandCurrent.findUnique({ where: { codigo } });
    expect(demand).not.toBeNull();
    expect(demand!.nombre).toBe("Demanda E2E creación");
    expect(demand!.estadoId).toBe("20");
    expect(demand!.estadoNombre).toBe("Buscando");
    expect(demand!.presupuestoMin).toBe(100_000);
    expect(demand!.presupuestoMax).toBe(200_000);
    expect(demand!.habitacionesMin).toBe(2);
    expect(demand!.zonas).toBe("Centro");
    expect(demand!.lastEventId).toBe(events[0].id);
  });

  it("PROPIEDAD_MODIFICADA: actualiza una propiedad ya proyectada con nuevos datos", async () => {
    const codigo = `E2E-PROP-MOD-${Date.now()}`;

    // Paso previo: crear la propiedad
    const createCycleId = testCycleId("prop-mod-setup");
    const createDiff = buildPropertyCreatedDiff(codigo);
    await publishEventsForDiff(createDiff, createCycleId);

    const createEvents = await prisma.event.findMany({
      where: { correlationId: createCycleId },
    });
    await waitForJobsCompleted(
      createEvents.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );

    const propBefore = await prisma.propertyCurrent.findUnique({ where: { codigo } });
    expect(propBefore).not.toBeNull();
    expect(propBefore!.precio).toBe(250_000);

    // Ahora: modificar la propiedad
    const modCycleId = testCycleId("prop-mod-update");
    const modDiff = buildPropertyModifiedDiff(codigo);
    const summary = await publishEventsForDiff(modDiff, modCycleId);
    expect(summary.emitted).toBe(1);

    const modEvents = await prisma.event.findMany({
      where: { correlationId: modCycleId },
    });
    await waitForJobsCompleted(
      modEvents.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );

    // Verificar que se actualizó
    const propAfter = await prisma.propertyCurrent.findUnique({ where: { codigo } });
    expect(propAfter).not.toBeNull();
    expect(propAfter!.precio).toBe(275_000);
    expect(propAfter!.fechaActualizacion).toBe("2026-03-14 10:00:00");
    expect(propAfter!.lastEventId).not.toBe(propBefore!.lastEventId);
  });

  it("multi-evento: procesa created + modified + status_changed en secuencia", async () => {
    const codigoBase = `E2E-MULTI-${Date.now()}`;
    const cycleId = testCycleId("multi-event");
    const diff = buildMultiEventPropertyDiff(codigoBase);

    // 1. Ingestion: emitir 3 eventos
    const summary = await publishEventsForDiff(diff, cycleId);
    expect(summary.emitted).toBe(3);

    const events = await prisma.event.findMany({
      where: { correlationId: cycleId },
      orderBy: { position: "asc" },
    });
    expect(events).toHaveLength(3);

    // 2-3. Drenar consumer + proyecciones para TODOS los eventos de este ciclo
    const eventIds = events.map((e) => e.id);
    await waitForJobsCompleted(
      eventIds,
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );

    // 4. Verificar las 3 propiedades en properties_current
    const propCreated = await prisma.propertyCurrent.findUnique({
      where: { codigo: `${codigoBase}-C` },
    });
    expect(propCreated).not.toBeNull();
    expect(propCreated!.precio).toBe(180_000);
    expect(propCreated!.ciudad).toBe("Barcelona");
    expect(propCreated!.zona).toBe("Eixample");
    expect(propCreated!.estado).toBe("Activo");

    const propModified = await prisma.propertyCurrent.findUnique({
      where: { codigo: `${codigoBase}-M` },
    });
    expect(propModified).not.toBeNull();
    expect(propModified!.precio).toBe(220_000);
    expect(propModified!.zona).toBe("Gracia");

    const propStatus = await prisma.propertyCurrent.findUnique({
      where: { codigo: `${codigoBase}-S` },
    });
    expect(propStatus).not.toBeNull();
    expect(propStatus!.estado).toBe("Vendido");
    expect(propStatus!.precio).toBe(500_000);
    expect(propStatus!.zona).toBe("Sarrià");
  });

  it("DEMANDA_ESTADO_CAMBIADO: actualiza la demanda con el nuevo estado", async () => {
    const codigo = `E2E-DEM-STATUS-${Date.now()}`;

    // Paso previo: crear la demanda
    const createCycleId = testCycleId("dem-status-setup");
    const createDiff = buildDemandCreatedDiff(codigo);
    await publishDemandEventsForDiff(createDiff, createCycleId);

    const createEvents = await prisma.event.findMany({
      where: { correlationId: createCycleId },
    });
    await waitForJobsCompleted(
      createEvents.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_DEMAND_PROJECTION"],
    );

    const demandBefore = await prisma.demandCurrent.findUnique({ where: { codigo } });
    expect(demandBefore).not.toBeNull();
    expect(demandBefore!.estadoNombre).toBe("Buscando");

    // Ahora: cambio de estado
    const statusCycleId = testCycleId("dem-status-change");
    const statusDiff = buildDemandStatusChangedDiff(codigo);
    const summary = await publishDemandEventsForDiff(statusDiff, statusCycleId);
    expect(summary.emitted).toBe(1);

    const statusEvents = await prisma.event.findMany({
      where: { correlationId: statusCycleId },
    });
    await waitForJobsCompleted(
      statusEvents.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_DEMAND_PROJECTION"],
    );

    // Verificar
    const demandAfter = await prisma.demandCurrent.findUnique({ where: { codigo } });
    expect(demandAfter).not.toBeNull();
    expect(demandAfter!.estadoId).toBe("30");
    expect(demandAfter!.estadoNombre).toBe("Comprada");
    expect(demandAfter!.presupuestoMin).toBe(150_000);
    expect(demandAfter!.presupuestoMax).toBe(300_000);
    expect(demandAfter!.zonas).toBe("Retiro");
    expect(demandAfter!.lastEventId).not.toBe(demandBefore!.lastEventId);
  });

  it("el checkpoint de proyección se actualiza tras procesar eventos", async () => {
    const checkpointBefore = await prisma.projectionCheckpoint.findUnique({
      where: { projectionName: "PROPERTIES_CURRENT" },
    });
    const positionBefore = checkpointBefore?.lastEventPosition ?? BigInt(0);

    const codigo = `E2E-CKPT-${Date.now()}`;
    const cycleId = testCycleId("checkpoint");
    const diff = buildPropertyCreatedDiff(codigo);

    await publishEventsForDiff(diff, cycleId);

    const events = await prisma.event.findMany({
      where: { correlationId: cycleId },
    });
    await waitForJobsCompleted(
      events.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );

    const checkpointAfter = await prisma.projectionCheckpoint.findUnique({
      where: { projectionName: "PROPERTIES_CURRENT" },
    });
    expect(checkpointAfter).not.toBeNull();
    expect(checkpointAfter!.lastEventPosition).toBeGreaterThan(positionBefore);
  });

  it("ESTADO_CAMBIADO de propiedad: actualiza properties_current con nuevo estado", async () => {
    const codigo = `E2E-PROP-STATUS-${Date.now()}`;

    // Crear primero
    const createCycleId = testCycleId("prop-status-setup");
    await publishEventsForDiff(buildPropertyCreatedDiff(codigo), createCycleId);

    const createEvents = await prisma.event.findMany({
      where: { correlationId: createCycleId },
    });
    await waitForJobsCompleted(
      createEvents.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );

    const propBefore = await prisma.propertyCurrent.findUnique({ where: { codigo } });
    expect(propBefore).not.toBeNull();
    expect(propBefore!.estado).toBe("Activo");

    // Cambio de estado
    const statusCycleId = testCycleId("prop-status-change");
    const statusDiff = buildPropertyStatusChangedDiff(codigo);
    await publishEventsForDiff(statusDiff, statusCycleId);

    const statusEvents = await prisma.event.findMany({
      where: { correlationId: statusCycleId },
    });
    await waitForJobsCompleted(
      statusEvents.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );

    const propAfter = await prisma.propertyCurrent.findUnique({ where: { codigo } });
    expect(propAfter).not.toBeNull();
    expect(propAfter!.estado).toBe("Reservado");
    expect(propAfter!.precio).toBe(300_000);
    expect(propAfter!.zona).toBe("Salamanca");
    expect(propAfter!.lastEventId).not.toBe(propBefore!.lastEventId);
  });

  it("idempotencia: re-encolar PROCESS_EVENT con misma idempotencyKey no duplica jobs", async () => {
    const codigo = `E2E-IDEMP-${Date.now()}`;
    const cycleId = testCycleId("idempotent");
    const diff = buildPropertyCreatedDiff(codigo);

    await publishEventsForDiff(diff, cycleId);

    // Intentar re-publicar (simulando re-ejecución de ingestion)
    await publishEventsForDiff(diff, cycleId);

    const allEvents = await prisma.event.findMany({
      where: { correlationId: cycleId },
    });
    expect(allEvents.length).toBeGreaterThanOrEqual(1);

    const uniqueIdempKeys = new Set(
      await prisma.jobQueue
        .findMany({
          where: {
            sourceEventId: { in: allEvents.map((e) => e.id) },
            type: "PROCESS_EVENT",
          },
          select: { idempotencyKey: true },
        })
        .then((jobs) => jobs.map((j) => j.idempotencyKey)),
    );

    expect(uniqueIdempKeys.size).toBe(allEvents.length);

    // Drenar los jobs creados para no contaminar el cleanup
    await waitForJobsCompleted(
      allEvents.map((e) => e.id),
      ["PROCESS_EVENT", "UPDATE_PROPERTY_PROJECTION"],
    );
  });
});
