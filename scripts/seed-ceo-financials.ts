/**
 * Seed de datos financieros CEO para demo y desarrollo.
 *
 * Crea filas en CeoMonthlySnapshot (6 meses) y CeoTarget (mensual + anual)
 * para que la API GET /api/ceo/overview devuelva datos realistas.
 *
 * Ejecución: npx tsx scripts/seed-ceo-financials.ts
 * Idempotente: usa upsert sobre el campo unique `period` / `year+month`.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SNAPSHOTS = [
  { period: "2026-01", revenueEur: 120000, grossVolumeEur: 4000000, operationsClosed: 8, operationsActive: 15, ebitdaEur: 35000, operatingCostEur: 85000, cashAvailableEur: 90000, fixedCostsEur: 50000, variableCostsEur: 35000, avgMarginPerOp: 15000, reinvestmentCapacity: 30000 },
  { period: "2026-02", revenueEur: 135000, grossVolumeEur: 4500000, operationsClosed: 9, operationsActive: 18, ebitdaEur: 42000, operatingCostEur: 93000, cashAvailableEur: 105000, fixedCostsEur: 52000, variableCostsEur: 41000, avgMarginPerOp: 15000, reinvestmentCapacity: 38000 },
  { period: "2026-03", revenueEur: 128000, grossVolumeEur: 4260000, operationsClosed: 7, operationsActive: 20, ebitdaEur: 38000, operatingCostEur: 90000, cashAvailableEur: 110000, fixedCostsEur: 52000, variableCostsEur: 38000, avgMarginPerOp: 18290, reinvestmentCapacity: 35000 },
  { period: "2026-04", revenueEur: 85000, grossVolumeEur: 2830000, operationsClosed: 5, operationsActive: 23, ebitdaEur: 28000, operatingCostEur: 57000, cashAvailableEur: 120000, fixedCostsEur: 52000, variableCostsEur: 5000, avgMarginPerOp: 17000, reinvestmentCapacity: 40000 },
];

const TARGETS = [
  { year: 2026, month: 0, targetRevenueEur: 1_800_000, targetEbitdaEur: 540_000, maxOperatingCostEur: 1_200_000 },
  { year: 2026, month: 1, targetRevenueEur: 130_000, targetEbitdaEur: 40_000, maxOperatingCostEur: 95_000 },
  { year: 2026, month: 2, targetRevenueEur: 140_000, targetEbitdaEur: 45_000, maxOperatingCostEur: 100_000 },
  { year: 2026, month: 3, targetRevenueEur: 145_000, targetEbitdaEur: 48_000, maxOperatingCostEur: 100_000 },
  { year: 2026, month: 4, targetRevenueEur: 150_000, targetEbitdaEur: 50_000, maxOperatingCostEur: 105_000 },
];

async function main() {
  console.log("[seed-ceo] Upserting CeoMonthlySnapshot...");
  for (const s of SNAPSHOTS) {
    await prisma.ceoMonthlySnapshot.upsert({
      where: { period: s.period },
      create: s,
      update: s,
    });
    console.log(`  ${s.period} ✓`);
  }

  console.log("[seed-ceo] Upserting CeoTarget...");
  for (const t of TARGETS) {
    await prisma.ceoTarget.upsert({
      where: { year_month: { year: t.year, month: t.month } },
      create: t,
      update: t,
    });
    console.log(`  ${t.year}-${t.month === 0 ? "anual" : String(t.month).padStart(2, "0")} ✓`);
  }

  console.log("[seed-ceo] Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
