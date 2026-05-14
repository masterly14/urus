/**
 * /platform/market/dashboard
 *
 * Inteligencia de mercado: convierte el inventario capturado en metricas
 * accionables para el equipo comercial.
 *
 * Secciones:
 *  - KPIs (4): activos, nuevos 7d, retirados 7d, rebajas 7d.
 *  - Evolucion 30d eur/m² mediano.
 *  - Por zona: precio mediano, eur/m², n activos, delta vs 30d.
 *  - Por tipologia.
 *  - Top advertisers por inventario activo (link a CRM cuando ya esta).
 *
 * Filtros: ciudad libre (default cordoba) y ventana temporal (7-90d).
 *
 * Permisos: cualquier usuario autenticado.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/market/dashboard";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ city?: string; days?: string }>;
}

export default async function MarketDashboardPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login?redirectTo=/platform/market/dashboard");

  const params = (await searchParams) ?? {};
  const city = params.city?.trim() || "cordoba";
  const days = params.days ? Math.min(Math.max(7, Number(params.days)), 90) : 30;
  const data = await getDashboardData(city, days);

  return (
    <div className="p-6">
      <DashboardClient data={data} initialCity={city} initialDays={days} />
    </div>
  );
}
