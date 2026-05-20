import { prisma } from "@/lib/prisma";
import { costTypeFromBucket } from "@/lib/finance/category-cost-type";

function currentPeriodFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildExpenseDateUtc(date: Date, dayOfMonth: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const safeDay = Math.min(Math.max(dayOfMonth, 1), 28);
  return new Date(Date.UTC(year, month, safeDay, 12, 0, 0, 0));
}

export async function generateRecurringExpensesForDate(date = new Date()) {
  const period = currentPeriodFromDate(date);
  const day = date.getUTCDate();

  const recurring = await prisma.recurringExpense.findMany({
    where: {
      active: true,
      dayOfMonth: day,
    },
  });

  let created = 0;
  let skipped = 0;

  for (const item of recurring) {
    if (item.lastGeneratedPeriod === period) {
      skipped += 1;
      continue;
    }

    const syntheticMessageId = `recurring:${item.id}:${period}`;
    const exists = await prisma.expense.findUnique({
      where: { sourceMessageId: syntheticMessageId },
      select: { id: true },
    });
    if (exists) {
      await prisma.recurringExpense.update({
        where: { id: item.id },
        data: { lastGeneratedPeriod: period },
      });
      skipped += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.expense.create({
        data: {
          waId: "SYSTEM_RECURRING",
          sourceMessageId: syntheticMessageId,
          amount: item.amountEur,
          currency: "EUR",
          category: item.category,
          bucket: item.bucket,
          costType: costTypeFromBucket(item.bucket),
          recurringExpenseId: item.id,
          accountId: item.accountId,
          description: item.name,
          vendor: item.vendor,
          expenseDate: buildExpenseDateUtc(date, item.dayOfMonth),
          status: "EXPECTED",
          rawInput: {
            source: "recurring_generator",
            recurringExpenseId: item.id,
            period,
          },
          aiConfidence: null,
          createdByRole: "system",
        },
      }),
      prisma.recurringExpense.update({
        where: { id: item.id },
        data: { lastGeneratedPeriod: period },
      }),
    ]);
    created += 1;
  }

  return {
    period,
    day,
    scanned: recurring.length,
    created,
    skipped,
  };
}
