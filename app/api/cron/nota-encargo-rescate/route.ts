/**
 * Cron de rescate de Notas de Encargo huérfanas.
 *
 * Detecta sesiones PENDING/PENDIENTE_PROPIEDAD con visitDateTime pasado y fuerza
 * el envío del formulario al comercial (idempotente).
 *
 * Recomendado en QStash: cada 15 minutos → `/api/cron/nota-encargo-rescate`
 */

import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { rescueOrphanNotaEncargos } from "@/lib/nota-encargo/rescue";

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
    const result = await rescueOrphanNotaEncargos({
      graceMinutes: envInt("NOTA_ENCARGO_RESCATE_GRACE_MIN", 5),
      lookbackMinutes: envInt("NOTA_ENCARGO_RESCATE_LOOKBACK_MIN", 10080),
      maxBatch: envInt("NOTA_ENCARGO_RESCATE_MAX_BATCH", 50),
    });

    console.log(
      `[cron/nota-encargo-rescate] scanned=${result.scanned} rescued=${result.rescued} failed=${result.failed} skipped=${result.skipped}`,
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/nota-encargo-rescate] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al rescatar notas de encargo huérfanas" },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/nota-encargo-rescate" },
  postHandler,
);

export const maxDuration = 60;
