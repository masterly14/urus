/**
 * Verificación cercana a producción para agregación financiera mensual.
 *
 * Uso:
 *   npx tsx scripts/finance/verify-aggregation.ts --period=2026-05
 *
 * Requiere DATABASE_URL.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  getMonthCash,
  getMonthEbitda,
  getMonthExpensesAggregate,
  getMonthIncomeAggregate,
} from "@/lib/finance/aggregator";

function currentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida");
  }

  const period = getArg("period") ?? currentPeriod();
  console.log(`\n[finance:verify] Periodo: ${period}`);

  await prisma.$queryRaw`SELECT 1`;
  console.log("[finance:verify] DB conectada");

  const [expenses, income, ebitda, cash, treasury] = await Promise.all([
    getMonthExpensesAggregate(period),
    getMonthIncomeAggregate(period),
    getMonthEbitda(period),
    getMonthCash(period),
    prisma.treasuryBalance.findUnique({ where: { period } }),
  ]);

  console.log("[finance:verify] Gastos:");
  console.log(`  total=${expenses.total.toFixed(2)} fixed=${expenses.fixed.toFixed(2)} variable=${expenses.variable.toFixed(2)}`);
  console.log("[finance:verify] Ingresos:");
  console.log(`  derived=${income.derived.toFixed(2)} manual=${income.manual.toFixed(2)} total=${income.total.toFixed(2)}`);
  console.log("[finance:verify] KPI derivadas:");
  console.log(`  EBITDA=${ebitda.toFixed(2)} CASH=${cash.toFixed(2)}`);
  console.log(
    `[finance:verify] Tesorería inicial declarada: ${treasury ? "sí" : "no"}${treasury ? ` (${treasury.openingBalanceEur.toString()} €)` : ""}`,
  );

  await prisma.$disconnect().catch(() => {});
}

main().catch(async (error) => {
  console.error("[finance:verify] Error:", error instanceof Error ? error.message : String(error));
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
