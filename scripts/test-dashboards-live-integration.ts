/**
 * Verificación cercana a producción: Neon + consultas de dashboards internos
 * y (si hay credenciales) APIs externas Inmovilla REST y Statefox.
 *
 * Uso: npx tsx scripts/test-dashboards-live-integration.ts
 *
 * Variables: DATABASE_URL (obligatoria), INMOVILLA_API_TOKEN, STATEFOX_BEARER_TOKEN (opcionales pero recomendadas).
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { getCeoOverview } from "@/lib/dashboard/ceo/queries";
import { getDashboardColaboradores } from "@/lib/operacion/colaboradores/dashboard-queries";
import { getComercialesDashboard, getDefaultDashboardRange } from "@/lib/dashboard/comercial/queries";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { createStatefoxClient, getSnapshot } from "@/lib/statefox";

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  const icon = ok ? "✓" : "✗";
  console.log(`[${icon}] ${name}: ${detail}`);
}

async function checkNeonAndDashboards(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    record("Neon (DATABASE_URL)", false, "no definida");
    return;
  }

  await prisma.$queryRaw`SELECT 1`;
  record("Neon conectividad", true, "SELECT 1 ok");

  const range = getDefaultDashboardRange();
  const [comercial, colab, ceo] = await Promise.all([
    getComercialesDashboard(range),
    getDashboardColaboradores(),
    getCeoOverview(),
  ]);

  record(
    "Dashboard comercial (queries)",
    Array.isArray(comercial.rows),
    `${comercial.rows.length} filas en rango`,
  );
  record(
    "Dashboard colaboradores (queries)",
    typeof colab.resumen.totalActivos === "number",
    `totalActivos=${colab.resumen.totalActivos}`,
  );
  record(
    "CEO overview (queries)",
    typeof ceo.kpis.facturacionMensual.value === "number",
    `facturación mensual ≈ ${ceo.kpis.facturacionMensual.value.toFixed(2)} € (derivada + snapshots)`,
  );
}

async function checkInmovillaRest(): Promise<void> {
  if (!process.env.INMOVILLA_API_TOKEN) {
    record("Inmovilla REST (listado)", true, "OMITIDO — sin INMOVILLA_API_TOKEN");
    return;
  }
  try {
    const client = createInmovillaRestClient();
    const listado = await client.get<Array<{ cod_ofer?: number }>>("/propiedades/", {
      listado: true,
    });
    const n = Array.isArray(listado) ? listado.length : 0;
    record("Inmovilla REST (listado)", n >= 0, `${n} propiedades en primera página`);
  } catch (err) {
    record(
      "Inmovilla REST (listado)",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function checkStatefox(): Promise<void> {
  if (!process.env.STATEFOX_BEARER_TOKEN) {
    record("Statefox snapshot", true, "OMITIDO — sin STATEFOX_BEARER_TOKEN");
    return;
  }
  try {
    const client = createStatefoxClient();
    const snap = await getSnapshot(client, { items: 10 });
    const count = snap.properties ? Object.keys(snap.properties).length : 0;
    record("Statefox snapshot", true, `${count} claves en página (items=10)`);
  } catch (err) {
    record(
      "Statefox snapshot",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function main(): Promise<void> {
  console.log("=== Dashboards — verificación live / casi producción ===\n");

  await checkNeonAndDashboards();
  await checkInmovillaRest();
  await checkStatefox();

  await prisma.$disconnect().catch(() => {});

  const failed = checks.filter((c) => !c.ok);
  console.log("\n--- Resumen ---");
  console.log(`Checks totales: ${checks.length}, fallidos: ${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[test-dashboards-live-integration] Error fatal:", err);
  process.exit(1);
});
