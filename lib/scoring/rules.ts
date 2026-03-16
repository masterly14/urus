import type { ScoringInput } from "./types";

// Points as defined in plan.md (MVP)
const POINTS = {
  // Comprador
  PREAPROBACION: 25,
  PRESUPUESTO: 15,
  PLAZO_30_DIAS: 20,
  MENSAJE_DETALLES: 10,
  REFERIDO: 15,
  SOLO_MIRANDO: -20,
  // Propietario
  URGENCIA_VENTA: 20,
  PRECIO_CERCANO: 15,
  EXCLUSIVA: 15,
  DOCUMENTACION: 10,
  PROBAR_SIN_AGENCIA: -25,
} as const;

export type RawPoints = {
  pclose: number;
  value: number;
  urgency: number;
  reasons: string[];
};

// Ranges for normalization (min,max) for each dimension per tipo
const RANGES = {
  comprador: {
    pclose: { min: -20, max: 40 }, // possible sum from rules for Pclose
    value: { min: 0, max: 25 },
    urgency: { min: 0, max: 20 },
  },
  propietario: {
    pclose: { min: -25, max: 15 },
    value: { min: 0, max: 25 },
    urgency: { min: 0, max: 20 },
  },
} as const;

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

function normalizeTo100(value: number, min: number, max: number) {
  if (max === min) return clamp(value, 0, 100);
  const ratio = (value - min) / (max - min);
  return clamp(Math.round(ratio * 100));
}

export function computePoints(input: ScoringInput): RawPoints {
  const reasons: string[] = [];
  let pclose = 0;
  let value = 0;
  let urgency = 0;

  if (input.tipo === "comprador") {
    if (input.preaprobacionHipotecaria) {
      pclose += POINTS.PREAPROBACION;
      reasons.push(`Preaprobación hipotecaria +${POINTS.PREAPROBACION}`);
    }
    if (input.referido) {
      pclose += POINTS.REFERIDO;
      reasons.push(`Referido +${POINTS.REFERIDO}`);
    }
    if (input.soloMirando) {
      pclose += POINTS.SOLO_MIRANDO;
      reasons.push(`\"Solo estoy mirando\" ${POINTS.SOLO_MIRANDO}`);
    }

    if (input.presupuestoDefinido) {
      value += POINTS.PRESUPUESTO;
      reasons.push(`Presupuesto definido +${POINTS.PRESUPUESTO}`);
    }
    if (input.mensajeConDetalles) {
      value += POINTS.MENSAJE_DETALLES;
      reasons.push(`Mensaje con detalles +${POINTS.MENSAJE_DETALLES}`);
    }

    if (typeof input.plazoDias === "number" && input.plazoDias <= 30) {
      urgency += POINTS.PLAZO_30_DIAS;
      reasons.push(`Plazo ≤ 30 días +${POINTS.PLAZO_30_DIAS}`);
    }
  } else {
    // propietario
    if (input.urgenciaVenta) {
      urgency += POINTS.URGENCIA_VENTA;
      reasons.push(`Urgencia de venta +${POINTS.URGENCIA_VENTA}`);
    }
    if (input.precioCercanoMercado) {
      value += POINTS.PRECIO_CERCANO;
      reasons.push(`Precio cercano a mercado +${POINTS.PRECIO_CERCANO}`);
    }
    if (input.exclusivaAceptable) {
      pclose += POINTS.EXCLUSIVA;
      reasons.push(`Exclusiva aceptable +${POINTS.EXCLUSIVA}`);
    }
    if (input.documentacionDisponible) {
      value += POINTS.DOCUMENTACION;
      reasons.push(`Documentación disponible +${POINTS.DOCUMENTACION}`);
    }
    if (input.probarSinAgencia) {
      pclose += POINTS.PROBAR_SIN_AGENCIA;
      reasons.push(`\"Probar sin agencia\" ${POINTS.PROBAR_SIN_AGENCIA}`);
    }
  }

  // Return raw sums and reasons; normalization handled upstream
  return { pclose, value, urgency, reasons };
}

export { RANGES, POINTS };

