/** @vitest-environment jsdom */
/**
 * Integración visual mínima: datos de `getCeoOverview()` (misma fuente que GET /api/ceo/overview)
 * renderizados en componentes compartidos del dashboard CEO (KpiCard).
 *
 * Requiere DATABASE_URL (Neon) como el resto de tests de integración con BD real.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Semaforo } from "@/components/dashboard/semaforo";
import { getCeoOverview } from "@/lib/dashboard/ceo/queries";
import type { KpiValue } from "@/lib/dashboard/ceo/types";

function trendOf(kpi: KpiValue): "up" | "down" | "stable" {
  if (kpi.changePercent == null || kpi.changePercent === 0) return "stable";
  return kpi.changePercent > 0 ? "up" : "down";
}

describe(
  "Dashboard UI — KPIs y semáforos con datos de getCeoOverview()",
  { timeout: 60_000 },
  () => {
    it("renderiza KpiCard con facturación mensual", async () => {
      const data = await getCeoOverview();
      const kpi = data.kpis.facturacionMensual;

      render(
        <KpiCard
          title="Facturación mensual"
          value={kpi.value}
          change={kpi.changePercent ?? 0}
          trend={trendOf(kpi)}
          icon={TrendingUp}
          format="currency"
        />,
      );

      expect(screen.getByText("Facturación mensual")).toBeInTheDocument();
      expect(screen.getByText(/^[\d.,\s]+€$/)).toBeInTheDocument();
    });

    it("renderiza Semaforo para estado de facturación", async () => {
      const data = await getCeoOverview();
      render(<Semaforo label="Facturación" status={data.semaforos.facturacion} />);
      expect(screen.getByText("Facturación")).toBeInTheDocument();
    });
  },
);
