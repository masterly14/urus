/**
 * Backfill de bucket + costType para gastos existentes.
 *
 * Uso:
 *   npx tsx scripts/finance/backfill-expense-buckets.ts
 *
 * Requiere DATABASE_URL.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  costTypeFromBucket,
  defaultExpenseBucket,
} from "@/lib/finance/category-cost-type";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida");
  }

  const expenses = await prisma.expense.findMany({
    select: { id: true, category: true, bucket: true, costType: true },
  });

  let updated = 0;
  for (const row of expenses) {
    const inferredBucket = defaultExpenseBucket(row.category);
    const inferredCostType = costTypeFromBucket(inferredBucket);
    if (row.bucket === inferredBucket && row.costType === inferredCostType) {
      continue;
    }
    await prisma.expense.update({
      where: { id: row.id },
      data: {
        bucket: inferredBucket,
        costType: inferredCostType,
      },
    });
    updated += 1;
  }

  console.log(
    `[finance:backfill-buckets] total=${expenses.length} updated=${updated}`,
  );
}

main().catch(async (error) => {
  console.error(
    "[finance:backfill-buckets] Error:",
    error instanceof Error ? error.message : String(error),
  );
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
