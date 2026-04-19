/**
 * Utilidades compartidas para tests de integración de dashboards (BD real).
 * Patrón alineado con `lib/__tests__/pipeline-integration.test.ts`: IDs de corrida,
 * limpieza explícita y worker dedicado.
 */
import { prisma } from "@/lib/prisma";
import { runConsumerCycle } from "@/lib/workers/consumer";

export const DASHBOARD_INTEGRATION_WORKER_PREFIX = "dashboard-integration-";

export function createDashboardRunId(): string {
  return `dash-int-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDashboardWorkerId(): string {
  return `${DASHBOARD_INTEGRATION_WORKER_PREFIX}${Date.now()}`;
}

/**
 * Elimina eventos por correlationId y datos derivados (jobs, hechos comerciales vinculados).
 */
export async function cleanupEventsByCorrelationIds(
  correlationIds: string[],
): Promise<void> {
  if (correlationIds.length === 0) return;

  const events = await prisma.event.findMany({
    where: { correlationId: { in: correlationIds } },
    select: { id: true },
  });
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return;

  await prisma.jobQueue.deleteMany({
    where: { sourceEventId: { in: eventIds } },
  });

  await prisma.commercialOperationFact.deleteMany({
    where: { sourceEventId: { in: eventIds } },
  });

  await prisma.event.deleteMany({
    where: { id: { in: eventIds } },
  });
}

export type DashboardScenarioIds = {
  comercialId: string;
  propertyCode: string;
  operacionId: string;
  colaboradorId: string;
  asignacionId: string;
};

/**
 * Limpia entidades de dominio creadas por un escenario de test (orden seguro de FKs).
 */
export async function cleanupDashboardScenario(ids: DashboardScenarioIds): Promise<void> {
  await prisma.colaboradorAsignacion.deleteMany({
    where: { id: ids.asignacionId },
  });
  await prisma.operacion.delete({ where: { id: ids.operacionId } }).catch(() => {});
  await prisma.colaborador.delete({ where: { id: ids.colaboradorId } }).catch(() => {});
  await prisma.propertySnapshot.delete({ where: { codigo: ids.propertyCode } }).catch(() => {});
  await prisma.comercial.delete({ where: { id: ids.comercialId } }).catch(() => {});
}

/**
 * Drena jobs PROCESS_EVENT hasta vaciar la cola o alcanzar maxCycles.
 */
export async function drainProcessEventJobs(
  workerId: string,
  maxCycles = 50,
): Promise<{ processed: number }> {
  let processed = 0;
  for (let i = 0; i < maxCycles; i++) {
    const result = await runConsumerCycle({
      workerId,
      types: ["PROCESS_EVENT"],
    });
    if (result.noWork) break;
    processed += result.processed;
  }
  return { processed };
}
