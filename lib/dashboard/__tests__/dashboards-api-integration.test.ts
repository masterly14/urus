/**
 * Integración dashboards: OPERACION_CERRADA → consumer → CommercialOperationFact
 * → GET /api/dashboard/*, /api/ceo/overview, /api/colaboradores/dashboard
 *
 * Requiere DATABASE_URL (Neon) configurada como el resto de tests de integración del repo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { prisma } from "@/lib/prisma";
import { HEADER_ROLE } from "@/lib/auth/session";
import { GET as getComerciales } from "@/app/api/dashboard/comerciales/route";
import { GET as getComercialById } from "@/app/api/dashboard/comercial/[id]/route";
import { GET as getCeoOverviewApi } from "@/app/api/ceo/overview/route";
import { GET as getColaboradoresDashboard } from "@/app/api/colaboradores/dashboard/route";
import {
  cleanupDashboardScenario,
  cleanupEventsByCorrelationIds,
  createDashboardRunId,
  createDashboardWorkerId,
  drainProcessEventJobs,
  type DashboardScenarioIds,
} from "./integration-harness";

const workerId = createDashboardWorkerId();
let runId: string | undefined;
let scenario: DashboardScenarioIds | undefined;

async function waitForProcessEventCompleted(
  eventId: string,
  timeoutMs = 45_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await prisma.jobQueue.findFirst({
      where: { sourceEventId: eventId, type: "PROCESS_EVENT" },
    });
    if (job?.status === "COMPLETED") return;
    if (job?.status === "DEAD_LETTER") {
      throw new Error(`PROCESS_EVENT en DEAD_LETTER para evento ${eventId}`);
    }
    await drainProcessEventJobs(workerId, 3);
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timeout esperando PROCESS_EVENT COMPLETED para ${eventId}`);
}

describe(
  "Dashboards API — evento OPERACION_CERRADA → hechos → APIs",
  { timeout: 120_000, hookTimeout: 120_000 },
  () => {
    beforeAll(async () => {
      runId = createDashboardRunId();
      const short = runId.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
      const comercialNombre = `DashInt${short}`;

      const comercial = await prisma.comercial.create({
        data: {
          nombre: comercialNombre,
          ciudad: "Sevilla",
          activo: true,
        },
      });

      const propertyCode = `D${short}`.slice(0, 24);

      await prisma.propertySnapshot.create({
        data: {
          codigo: propertyCode,
          ref: `REF-${short}`,
          titulo: "Test integración dashboard",
          precio: 250_000,
          ciudad: "Sevilla",
          zona: "Centro",
          estado: "Vendida",
          agente: comercialNombre,
          firstSeenAt: new Date(Date.now() - 7 * 86_400_000),
        },
      });

      const operacion = await prisma.operacion.create({
        data: {
          codigo: `OP${short}`,
          propertyCode,
          estado: "CERRADA_VENTA",
          closedAt: new Date(),
          comercialId: comercial.id,
          ciudad: "Sevilla",
        },
      });

      const colaborador = await prisma.colaborador.create({
        data: {
          nombre: `ColDash${short}`,
          tipo: "abogado",
          ciudad: "Sevilla",
          activo: true,
        },
      });

      const asignacion = await prisma.colaboradorAsignacion.create({
        data: {
          colaboradorId: colaborador.id,
          operacionId: operacion.id,
          estado: "COMPLETADA",
        },
      });

      scenario = {
        comercialId: comercial.id,
        propertyCode,
        operacionId: operacion.id,
        colaboradorId: colaborador.id,
        asignacionId: asignacion.id,
      };

      const closedAtIso = new Date(Date.now() - 60_000).toISOString();

      const event = await appendEvent({
        type: "OPERACION_CERRADA",
        aggregateType: "OPERACION",
        aggregateId: propertyCode,
        correlationId: runId,
        payload: {
          propertyCode,
          newEstado: "Vendida",
          previousEstado: "Reservada",
          closedAt: closedAtIso,
          operacionId: operacion.id,
        },
      });

      await enqueueJob({
        type: "PROCESS_EVENT",
        payload: { eventId: event.id, eventType: event.type },
        sourceEventId: event.id,
        idempotencyKey: `process-event:${event.id}`,
      });

      await waitForProcessEventCompleted(event.id);

      const fact = await prisma.commercialOperationFact.findFirst({
        where: { sourceEventId: event.id },
      });
      expect(fact).not.toBeNull();
      expect(fact!.comercialId).toBe(comercial.id);
      expect(fact!.operacionId).toBe(operacion.id);
      expect(fact!.grossAmountEur).toBe(250_000);
    });

    afterAll(async () => {
      if (runId) await cleanupEventsByCorrelationIds([runId]);
      if (scenario) {
        await prisma.commercialClassification.deleteMany({
          where: { comercialId: scenario.comercialId },
        });
        await cleanupDashboardScenario(scenario);
      }
      await prisma.$disconnect();
    });

    it("GET /api/dashboard/comerciales incluye cierre y facturación estimada", async () => {
      const res = await getComerciales(
        new Request("http://localhost/api/dashboard/comerciales"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        rows: Array<{ comercialId: string; closings: number; estimatedRevenueEur: number }>;
      };
      expect(body.ok).toBe(true);
      const row = body.rows.find((r) => r.comercialId === scenario.comercialId);
      expect(row).toBeDefined();
      expect(row!.closings).toBeGreaterThanOrEqual(1);
      expect(row!.estimatedRevenueEur).toBeGreaterThan(0);
    });

    it("GET /api/dashboard/comercial/:id devuelve resumen con cierres", async () => {
      const res = await getComercialById(
        new Request("http://localhost/api/dashboard/comercial/" + scenario.comercialId),
        { params: { id: scenario.comercialId } },
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        summary: { closings: number } | null;
      };
      expect(body.ok).toBe(true);
      expect(body.summary?.closings).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/ceo/overview refleja ingresos derivados de hechos comerciales", async () => {
      const res = await getCeoOverviewApi(
        new Request("http://localhost/api/ceo/overview", {
          headers: { [HEADER_ROLE]: "ceo" },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        kpis: { facturacionMensual: { value: number } };
      };
      expect(body.ok).toBe(true);
      expect(body.kpis.facturacionMensual.value).toBeGreaterThan(0);
    });

    it("GET /api/colaboradores/dashboard expone ranking con facturación vinculada", async () => {
      const res = await getColaboradoresDashboard();
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ranking: Array<{ id: string; facturacionVinculadaEur: number }>;
      };
      const row = body.ranking.find((r) => r.id === scenario.colaboradorId);
      expect(row).toBeDefined();
      expect(row!.facturacionVinculadaEur).toBeGreaterThan(0);
    });
  },
);
