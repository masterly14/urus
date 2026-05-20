/**
 * Cron de rescate de Partes de Visita huérfanos.
 *
 * Detecta `ParteVisitaSession` en estado `PENDING` con `visitDateTime` ya
 * pasado y fuerza el envío (idempotente — el claim atómico en
 * `sendParteVisitaForSession` evita duplicados si QStash dispara en paralelo).
 *
 * Recomendado en Upstash QStash: cada 15 minutos.
 *   cron expression: `*\/15 * * * *`
 *   destination    : https://platform.uruscapitalgroup.com/api/cron/parte-visita-rescate
 *
 * Variables de entorno opcionales (ver `.env.example`):
 *   PARTE_VISITA_RESCATE_GRACE_MIN     (default: 5)
 *   PARTE_VISITA_RESCATE_LOOKBACK_MIN  (default: 10080 = 7 días)
 *   PARTE_VISITA_RESCATE_MAX_BATCH     (default: 50)
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { rescueOrphanParteVisitas } from "@/lib/parte-visita/rescue";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await rescueOrphanParteVisitas({
      graceMinutes: envInt("PARTE_VISITA_RESCATE_GRACE_MIN", 5),
      lookbackMinutes: envInt("PARTE_VISITA_RESCATE_LOOKBACK_MIN", 10080),
      maxBatch: envInt("PARTE_VISITA_RESCATE_MAX_BATCH", 50),
    });

    console.log(
      `[cron/parte-visita-rescate] scanned=${result.scanned} rescued=${result.rescued} failed=${result.failed} skipped=${result.skipped}`,
    );

    if (result.failed > 0) {
      const errors = result.outcomes
        .filter((o) => o.error)
        .map((o) => `${o.sessionId}: ${o.error}`)
        .slice(0, 5)
        .join(" | ");
      console.warn(`[cron/parte-visita-rescate] errores (primeros 5): ${errors}`);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/parte-visita-rescate] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al rescatar partes de visita huérfanos" },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/parte-visita-rescate" },
  postHandler,
);

export const maxDuration = 60;
