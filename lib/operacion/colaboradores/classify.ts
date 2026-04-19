import type { ColaboradorListRow } from "./queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColaboradorClasificacion =
  | "partner_estrategico"
  | "funcional"
  | "lento"
  | "critico"
  | "sin_datos";

export type ClasificacionResult = {
  clasificacion: ColaboradorClasificacion;
  slaCumplimiento: number;
  hitosVencidos: number;
  asignacionesTotales: number;
};

// ---------------------------------------------------------------------------
// Labels & styles
// ---------------------------------------------------------------------------

export const CLASIFICACION_LABELS: Record<ColaboradorClasificacion, string> = {
  partner_estrategico: "Partner Estratégico",
  funcional: "Funcional",
  lento: "Lento",
  critico: "Crítico",
  sin_datos: "Sin datos",
};

export const CLASIFICACION_COLORS: Record<ColaboradorClasificacion, string> = {
  partner_estrategico: "var(--urus-success)",
  funcional: "var(--urus-info)",
  lento: "var(--urus-warning)",
  critico: "var(--urus-danger)",
  sin_datos: "var(--muted-foreground)",
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function getClassifyConfig() {
  return {
    minAsignaciones: envInt("COLAB_CLASSIFY_MIN_ASIGNACIONES", 2),
    partnerMinSla: envFloat("COLAB_CLASSIFY_PARTNER_MIN_SLA", 90),
    funcionalMinSla: envFloat("COLAB_CLASSIFY_FUNCIONAL_MIN_SLA", 70),
    lentoMinSla: envFloat("COLAB_CLASSIFY_LENTO_MIN_SLA", 50),
  };
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

export function classifyColaborador(
  row: ColaboradorListRow,
  teamAvgAsignaciones: number,
  config = getClassifyConfig(),
): ClasificacionResult {
  const base = {
    slaCumplimiento: row.slaCumplimiento,
    hitosVencidos: row.hitosVencidos,
    asignacionesTotales: row.asignacionesTotales,
  };

  if (row.asignacionesTotales < config.minAsignaciones) {
    return { clasificacion: "sin_datos", ...base };
  }

  const sla = row.slaCumplimiento;
  const hasRecurrentBlocks = row.hitosVencidos >= 3;

  if (sla < config.lentoMinSla || hasRecurrentBlocks) {
    return { clasificacion: "critico", ...base };
  }

  if (sla < config.funcionalMinSla) {
    return { clasificacion: "lento", ...base };
  }

  if (
    sla >= config.partnerMinSla &&
    row.asignacionesTotales >= teamAvgAsignaciones
  ) {
    return { clasificacion: "partner_estrategico", ...base };
  }

  return { clasificacion: "funcional", ...base };
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

export type ClassifiedColaborador = ColaboradorListRow & {
  clasificacion: ClasificacionResult;
};

export function classifyAll(
  rows: ColaboradorListRow[],
  config = getClassifyConfig(),
): ClassifiedColaborador[] {
  const eligible = rows.filter((r) => r.asignacionesTotales >= config.minAsignaciones);
  const teamAvgAsignaciones =
    eligible.length > 0
      ? eligible.reduce((s, r) => s + r.asignacionesTotales, 0) / eligible.length
      : 0;

  return rows.map((row) => ({
    ...row,
    clasificacion: classifyColaborador(row, teamAvgAsignaciones, config),
  }));
}
