import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { generateRecurringExpensesForDate } from "@/lib/finance/recurring/generator";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateRecurringExpensesForDate(new Date());
    console.log(
      `[cron/generate-recurring] period=${result.period} day=${result.day} scanned=${result.scanned} created=${result.created} skipped=${result.skipped}`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/generate-recurring] Error:", message);
    return NextResponse.json(
      { ok: false, error: "No se pudieron generar gastos recurrentes" },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/generate-recurring" },
  postHandler,
);

export const maxDuration = 60;
