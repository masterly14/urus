import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlaScanResult = {
  hitosEscaneados: number;
  breachesDetectados: number;
  eventosCreados: number;
  deduplicados: number;
};

type BreachRow = {
  hitoId: string;
  hitoNombre: string;
  slaDias: number;
  slaVenceAt: Date;
  diasExcedidos: number;
  asignacionId: string;
  colaboradorId: string;
  colaboradorNombre: string;
  operacionId: string;
  operacionCodigo: string;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getSlaScanConfig() {
  return {
    deduplicationWindowDays: envInt("COLAB_SLA_DEDUP_WINDOW_DAYS", 3),
    criticalThresholdDays: envInt("COLAB_SLA_CRITICAL_THRESHOLD_DAYS", 3),
  };
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export async function scanColaboradorSlaBreaches(
  now = new Date(),
): Promise<SlaScanResult> {
  const config = getSlaScanConfig();

  const vencidos = await prisma.colaboradorHito.findMany({
    where: {
      slaVenceAt: { lt: now },
      estado: { notIn: ["COMPLETADO", "CANCELADO"] },
    },
    include: {
      asignacion: {
        include: {
          colaborador: { select: { id: true, nombre: true } },
          operacion: { select: { id: true, codigo: true } },
        },
      },
    },
  });

  const breaches: BreachRow[] = vencidos.map((h) => ({
    hitoId: h.id,
    hitoNombre: h.nombre,
    slaDias: h.slaDias ?? 0,
    slaVenceAt: h.slaVenceAt!,
    diasExcedidos: Math.ceil(
      (now.getTime() - h.slaVenceAt!.getTime()) / (1000 * 60 * 60 * 24),
    ),
    asignacionId: h.asignacionId,
    colaboradorId: h.asignacion.colaborador.id,
    colaboradorNombre: h.asignacion.colaborador.nombre,
    operacionId: h.asignacion.operacion.id,
    operacionCodigo: h.asignacion.operacion.codigo,
  }));

  const windowStart = new Date(
    now.getTime() - config.deduplicationWindowDays * 24 * 60 * 60 * 1000,
  );

  const recentEvents = await prisma.event.findMany({
    where: {
      type: "COLABORADOR_SLA_BREACH",
      occurredAt: { gte: windowStart },
    },
    select: { payload: true },
  });

  const recentKeys = new Set(
    recentEvents.map((e) => {
      const p = e.payload as Record<string, unknown>;
      return `${p.hitoId}`;
    }),
  );

  let eventosCreados = 0;
  const deduplicados = breaches.filter((b) => recentKeys.has(b.hitoId)).length;
  const nuevos = breaches.filter((b) => !recentKeys.has(b.hitoId));

  for (const breach of nuevos) {
    const severity =
      breach.diasExcedidos >= config.criticalThresholdDays ? "critical" : "warning";

    await appendEvent({
      type: "COLABORADOR_SLA_BREACH",
      aggregateType: "OPERACION",
      aggregateId: breach.operacionCodigo,
      payload: {
        hitoId: breach.hitoId,
        hitoNombre: breach.hitoNombre,
        asignacionId: breach.asignacionId,
        colaboradorId: breach.colaboradorId,
        colaboradorNombre: breach.colaboradorNombre,
        operacionId: breach.operacionId,
        operacionCodigo: breach.operacionCodigo,
        slaDias: breach.slaDias,
        diasExcedidos: breach.diasExcedidos,
        severity,
      },
    });

    eventosCreados++;
  }

  return {
    hitosEscaneados: vencidos.length,
    breachesDetectados: breaches.length,
    eventosCreados,
    deduplicados,
  };
}
