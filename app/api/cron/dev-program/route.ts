import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { scheduleDevExercises } from "@/lib/dev-program/schedule";
import { withObservedRoute } from "@/lib/observability";


/**
 * Cron de desarrollo continuo (M12).
 * Ejecutar L-V a las ~8:30 vía Upstash QStash.
 * Encola un SEND_DEV_EXERCISE_NUDGE por cada comercial activo.
 */
const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scheduleDevExercises();
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/dev-program] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al programar ejercicios de desarrollo" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/dev-program" }, postHandler);

export const maxDuration = 60;
