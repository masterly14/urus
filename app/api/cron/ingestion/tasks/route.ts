import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { runTasksIngestionCycle } from "@/lib/workers/ingestion/tasks";
import { withObservedRoute } from "@/lib/observability";

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tasks ingestion depende del flujo legacy de Inmovilla (Playwright + login web),
  // que no es ejecutable en Vercel serverless. Se deshabilita en entornos donde
  // Playwright no esté disponible. Para activarlo en un runtime compatible,
  // setear TASKS_INGESTION_ENABLED=true y asegurar Chromium instalado.
  const enabled = ["true", "1", "yes"].includes(
    (process.env.TASKS_INGESTION_ENABLED ?? "").toLowerCase(),
  );
  if (!enabled) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "tasks_ingestion_disabled",
        message:
          "Tasks ingestion requiere Playwright y está deshabilitado. Set TASKS_INGESTION_ENABLED=true en un runtime compatible.",
      },
      { status: 200 },
    );
  }

  const result = await runTasksIngestionCycle();

  if (result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/ingestion/tasks" },
  postHandler,
);

export const maxDuration = 120;
