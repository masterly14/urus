/**
 * Genera gastos recurrentes para la fecha actual o fecha forzada.
 *
 * Uso:
 *   npx tsx scripts/finance/generate-recurring.ts
 *   npx tsx scripts/finance/generate-recurring.ts --date=2026-06-05
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { generateRecurringExpensesForDate } from "@/lib/finance/recurring/generator";

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida");
  }

  const forcedDate = getArg("date");
  const date = forcedDate ? new Date(`${forcedDate}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Fecha inválida. Usa formato --date=YYYY-MM-DD");
  }

  const result = await generateRecurringExpensesForDate(date);
  console.log(
    `[finance:generate-recurring] period=${result.period} day=${result.day} scanned=${result.scanned} created=${result.created} skipped=${result.skipped}`,
  );
}

main().catch(async (error) => {
  console.error(
    "[finance:generate-recurring] Error:",
    error instanceof Error ? error.message : String(error),
  );
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
