/**
 * Integración `getComercialesDashboard` — campo `weeklyRevenue` (sparkline 6 sem.)
 *
 * Valida que la segunda query del dashboard (CROSS JOIN generate_series) agrega
 * correctamente por comercial × semana ISO, rellena con 0 las semanas sin
 * cierres, respeta `includeInactive`, y excluye cierres fuera de la ventana de
 * 6 semanas aunque estén dentro del rango principal.
 *
 * Requiere `DATABASE_URL` (Neon) como el resto de tests de integración del repo.
 *
 * Siembra directamente `CommercialOperationFact` para aislar la prueba de la
 * cadena event-sourcing (ya cubierta en `dashboards-api-integration.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getCommissionRate,
  getComercialesDashboard,
  SPARKLINE_WEEKS,
} from "../queries";

const DAY_MS = 24 * 60 * 60 * 1000;

type SeededComercial = {
  id: string;
  nombre: string;
  activo: boolean;
  cierresInWindow: number;
  cierresOutOfWindow: number;
};

function createRunId(): string {
  return `weekly-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Ventana "segura" dentro de las últimas `SPARKLINE_WEEKS` semanas (42 días).
// Elegimos días desplazados para que caigan en semanas distintas aunque la
// semana ISO se trunque en lunes y el test se ejecute en cualquier día.
const IN_WINDOW_OFFSETS_DAYS = [1, 9, 20, 34] as const;
// Fuera de la ventana de sparkline (42 días) pero dentro del rango principal.
const OUT_OF_WINDOW_OFFSET_DAYS = 55;
const GROSS_PER_CLOSE_EUR = 100_000;

describe(
  "getComercialesDashboard — weeklyRevenue (sparkline 6 semanas)",
  { timeout: 60_000 },
  () => {
    const runId = createRunId();
    let activo: SeededComercial;
    let inactivo: SeededComercial;
    let sinCierres: SeededComercial;
    let commissionRate: number;
    let insertedFactIds: string[] = [];

    beforeAll(async () => {
      commissionRate = getCommissionRate();

      const mk = async (
        suffix: string,
        activoFlag: boolean,
      ): Promise<{ id: string; nombre: string }> => {
        const nombre = `WR${suffix}${runId.slice(-6)}`;
        const row = await prisma.comercial.create({
          data: { nombre, ciudad: "TestCity", activo: activoFlag },
        });
        return { id: row.id, nombre };
      };

      const a = await mk("A", true);
      const b = await mk("B", false);
      const c = await mk("C", true);

      const now = Date.now();

      const insertFact = async (
        comercialId: string,
        comercialNombre: string,
        offsetDays: number,
        seqKey: string,
      ): Promise<void> => {
        const sourceEventId = `wr-evt-${runId}-${seqKey}`;
        const fact = await prisma.commercialOperationFact.create({
          data: {
            sourceEventId,
            operacionId: `wr-op-${runId}-${seqKey}`,
            propertyCode: `wr-prop-${runId}-${seqKey}`.slice(0, 24),
            propertyRef: `REF-${seqKey}`,
            ciudad: "TestCity",
            zona: "TestZona",
            newEstado: "Vendida",
            closedAt: new Date(now - offsetDays * DAY_MS),
            firstSeenAt: new Date(now - (offsetDays + 90) * DAY_MS),
            daysToClose: 90,
            grossAmountEur: GROSS_PER_CLOSE_EUR,
            comercialId,
            comercialNombre,
          },
          select: { id: true },
        });
        insertedFactIds.push(fact.id);
      };

      // Activo: 4 cierres dentro de ventana + 1 fuera (pero dentro del rango)
      for (let i = 0; i < IN_WINDOW_OFFSETS_DAYS.length; i++) {
        await insertFact(a.id, a.nombre, IN_WINDOW_OFFSETS_DAYS[i], `a-in-${i}`);
      }
      await insertFact(a.id, a.nombre, OUT_OF_WINDOW_OFFSET_DAYS, "a-out");

      // Inactivo: 2 cierres dentro de ventana
      await insertFact(b.id, b.nombre, IN_WINDOW_OFFSETS_DAYS[0], "b-in-0");
      await insertFact(b.id, b.nombre, IN_WINDOW_OFFSETS_DAYS[2], "b-in-1");

      // Comercial "c" no tiene cierres (debe aparecer con tendencia toda cero
      // cuando está activo).

      activo = {
        id: a.id,
        nombre: a.nombre,
        activo: true,
        cierresInWindow: IN_WINDOW_OFFSETS_DAYS.length,
        cierresOutOfWindow: 1,
      };
      inactivo = {
        id: b.id,
        nombre: b.nombre,
        activo: false,
        cierresInWindow: 2,
        cierresOutOfWindow: 0,
      };
      sinCierres = {
        id: c.id,
        nombre: c.nombre,
        activo: true,
        cierresInWindow: 0,
        cierresOutOfWindow: 0,
      };
    });

    afterAll(async () => {
      if (insertedFactIds.length > 0) {
        await prisma.commercialOperationFact.deleteMany({
          where: { id: { in: insertedFactIds } },
        });
      }
      for (const id of [activo?.id, inactivo?.id, sinCierres?.id].filter(
        (x): x is string => Boolean(x),
      )) {
        await prisma.comercial.delete({ where: { id } }).catch(() => {});
      }
      await prisma.$disconnect();
    });

    // Rango principal amplio para que el aggregate incluya también el cierre
    // fuera de la ventana de sparkline.
    function buildRange() {
      const to = new Date();
      const from = new Date(to.getTime() - 75 * DAY_MS);
      return { from, to };
    }

    it("weeklyRevenue tiene longitud fija SPARKLINE_WEEKS para cada fila", async () => {
      const { rows } = await getComercialesDashboard(buildRange());
      const forTest = rows.filter((r) =>
        [activo.id, sinCierres.id].includes(r.comercialId),
      );
      expect(forTest.length).toBe(2);
      for (const r of forTest) {
        expect(r.weeklyRevenue).toBeDefined();
        expect(r.weeklyRevenue!.length).toBe(SPARKLINE_WEEKS);
        for (const v of r.weeklyRevenue!) {
          expect(typeof v).toBe("number");
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("comercial activo: suma de weeklyRevenue = cierres en ventana × gross × commissionRate", async () => {
      const { rows } = await getComercialesDashboard(buildRange());
      const row = rows.find((r) => r.comercialId === activo.id);
      expect(row).toBeDefined();

      const expectedInWindow =
        activo.cierresInWindow * GROSS_PER_CLOSE_EUR * commissionRate;
      const actualSum = (row!.weeklyRevenue ?? []).reduce((a, b) => a + b, 0);

      // Comparación en € enteros para evitar ruido de float.
      expect(Math.round(actualSum)).toBe(Math.round(expectedInWindow));

      // Sanity: el aggregate principal SÍ incluye el cierre fuera de ventana.
      const expectedTotal =
        (activo.cierresInWindow + activo.cierresOutOfWindow) *
        GROSS_PER_CLOSE_EUR *
        commissionRate;
      expect(Math.round(row!.estimatedRevenueEur)).toBe(
        Math.round(expectedTotal),
      );

      // Esto implica que al menos un cierre quedó fuera del sparkline.
      expect(Math.round(row!.estimatedRevenueEur - actualSum)).toBe(
        Math.round(GROSS_PER_CLOSE_EUR * commissionRate),
      );
    });

    it("weeklyRevenue distribuye cierres en semanas distintas (no colapsa a un solo bucket)", async () => {
      const { rows } = await getComercialesDashboard(buildRange());
      const row = rows.find((r) => r.comercialId === activo.id);
      expect(row).toBeDefined();

      const nonZeroBuckets = (row!.weeklyRevenue ?? []).filter((v) => v > 0).length;

      // Los offsets 1, 9, 20, 34 caen en al menos 3 semanas ISO distintas
      // para cualquier día de ejecución (el peor caso con `to` un lunes
      // agrupa offset 1 con offset 9 en semanas distintas; offsets 20 y 34
      // siempre caen en semanas propias separadas).
      expect(nonZeroBuckets).toBeGreaterThanOrEqual(3);
      expect(nonZeroBuckets).toBeLessThanOrEqual(activo.cierresInWindow);
    });

    it("comercial activo sin cierres: weeklyRevenue es array de 6 ceros", async () => {
      const { rows } = await getComercialesDashboard(buildRange());
      const row = rows.find((r) => r.comercialId === sinCierres.id);
      expect(row).toBeDefined();
      expect(row!.weeklyRevenue).toEqual(new Array(SPARKLINE_WEEKS).fill(0));
      expect(row!.estimatedRevenueEur).toBe(0);
      expect(row!.closings).toBe(0);
    });

    it("comercial inactivo se excluye por defecto e incluye con includeInactive=true", async () => {
      const { rows: rowsDefault } = await getComercialesDashboard(buildRange());
      expect(
        rowsDefault.find((r) => r.comercialId === inactivo.id),
      ).toBeUndefined();

      const { rows: rowsWithInactive } = await getComercialesDashboard(
        buildRange(),
        { includeInactive: true },
      );
      const row = rowsWithInactive.find((r) => r.comercialId === inactivo.id);
      expect(row).toBeDefined();
      expect(row!.weeklyRevenue).toBeDefined();
      expect(row!.weeklyRevenue!.length).toBe(SPARKLINE_WEEKS);

      const expectedRevenue =
        inactivo.cierresInWindow * GROSS_PER_CLOSE_EUR * commissionRate;
      const actualSum = (row!.weeklyRevenue ?? []).reduce((a, b) => a + b, 0);
      expect(Math.round(actualSum)).toBe(Math.round(expectedRevenue));
    });

    it("el orden del array es cronológico (último elemento ≥ que semanas más antiguas acumuladas por offset)", async () => {
      // Offset 1 día siempre cae en la semana más reciente (última posición).
      // Insertamos un cierre adicional SOLO en offset 1 para un comercial
      // temporal, verificamos que queda en el índice SPARKLINE_WEEKS - 1.
      const tmpNombre = `WROrd${runId.slice(-6)}`;
      const tmp = await prisma.comercial.create({
        data: { nombre: tmpNombre, ciudad: "TestCity", activo: true },
      });

      const fact = await prisma.commercialOperationFact.create({
        data: {
          sourceEventId: `wr-order-${runId}`,
          operacionId: `wr-order-op-${runId}`,
          propertyCode: `wr-order-prop-${runId}`.slice(0, 24),
          propertyRef: "REF-ORDER",
          ciudad: "TestCity",
          zona: "TestZona",
          newEstado: "Vendida",
          closedAt: new Date(Date.now() - 1 * DAY_MS),
          grossAmountEur: GROSS_PER_CLOSE_EUR,
          comercialId: tmp.id,
          comercialNombre: tmpNombre,
        },
        select: { id: true },
      });

      try {
        const { rows } = await getComercialesDashboard(buildRange());
        const row = rows.find((r) => r.comercialId === tmp.id);
        expect(row).toBeDefined();
        const weeks = row!.weeklyRevenue!;
        const lastIdx = weeks.length - 1;

        // El cierre de hace 1 día debe estar en el último bucket (más reciente).
        expect(weeks[lastIdx]).toBeGreaterThan(0);
        // Todas las demás posiciones deben ser 0 (no hay otros cierres).
        for (let i = 0; i < lastIdx; i++) {
          expect(weeks[i]).toBe(0);
        }
      } finally {
        await prisma.commercialOperationFact
          .delete({ where: { id: fact.id } })
          .catch(() => {});
        await prisma.comercial
          .delete({ where: { id: tmp.id } })
          .catch(() => {});
      }
    });
  },
);
