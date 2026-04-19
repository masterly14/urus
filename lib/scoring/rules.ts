import type { ScoringInput } from "./types";

const POINTS = {
  // Comprador (v1)
  PREAPROBACION: 25,
  PRESUPUESTO: 15,
  PLAZO_30_DIAS: 20,
  MENSAJE_DETALLES: 10,
  REFERIDO: 15,
  SOLO_MIRANDO: -20,
  // Propietario (v1)
  URGENCIA_VENTA: 20,
  PRECIO_CERCANO: 15,
  EXCLUSIVA: 15,
  DOCUMENTACION: 10,
  PROBAR_SIN_AGENCIA: -25,
  // v2: calidad de mensaje
  MSG_LARGO: 5,
  MSG_MUY_DETALLADO: 10,
  MSG_PRESUPUESTO: 8,
  MSG_ZONA: 5,
  MSG_URGENCIA: 10,
  // v2: historial per-lead
  HIST_WA_ENGAGED: 10,
  HIST_WA_VERY_ENGAGED: 15,
  HIST_VISITA_ALTO: 20,
  HIST_VISITA_MEDIO: 5,
  HIST_MICROSITE_INTERES: 10,
} as const;

const SOURCE_BONUS: Record<string, number> = {
  referido: 20,
  web_propia: 10,
  idealista: 5,
  fotocasa: 5,
  walkin: 5,
  telefono: 5,
};

export type RawPoints = {
  pclose: number;
  value: number;
  urgency: number;
  reasons: string[];
};

const RANGES = {
  comprador: {
    pclose: { min: -20, max: 75 },
    value: { min: 0, max: 58 },
    urgency: { min: 0, max: 30 },
  },
  propietario: {
    pclose: { min: -25, max: 55 },
    value: { min: 0, max: 48 },
    urgency: { min: 0, max: 30 },
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

  // ── v2: origen del lead (aplica a ambos tipos) ──

  if (input.source) {
    const normalized = input.source.toLowerCase().replace(/\s+/g, "_");
    const bonus = SOURCE_BONUS[normalized] ?? 0;
    if (bonus !== 0) {
      pclose += bonus;
      reasons.push(`Origen "${input.source}" +${bonus}`);
    }
  }

  // ── v2: calidad del mensaje (aplica a ambos tipos) ──

  if (typeof input.mensajeLongitud === "number") {
    if (input.mensajeLongitud > 150) {
      value += POINTS.MSG_MUY_DETALLADO;
      reasons.push(`Mensaje muy detallado (>${input.mensajeLongitud} chars) +${POINTS.MSG_MUY_DETALLADO}`);
    } else if (input.mensajeLongitud > 50) {
      value += POINTS.MSG_LARGO;
      reasons.push(`Mensaje con contenido (>${input.mensajeLongitud} chars) +${POINTS.MSG_LARGO}`);
    }
  }

  if (input.mensajeKeywords?.length) {
    const kws = new Set(input.mensajeKeywords.map((k) => k.toLowerCase()));
    if (kws.has("presupuesto")) {
      value += POINTS.MSG_PRESUPUESTO;
      reasons.push(`Mensaje menciona presupuesto +${POINTS.MSG_PRESUPUESTO}`);
    }
    if (kws.has("zona")) {
      value += POINTS.MSG_ZONA;
      reasons.push(`Mensaje menciona zona/barrio +${POINTS.MSG_ZONA}`);
    }
    if (kws.has("urgencia")) {
      urgency += POINTS.MSG_URGENCIA;
      reasons.push(`Mensaje indica urgencia +${POINTS.MSG_URGENCIA}`);
    }
  }

  // ── v2: historial de interacciones per-lead ──

  const hist = input.historySignals;
  if (hist) {
    if (hist.whatsappTurnCount >= 5) {
      pclose += POINTS.HIST_WA_VERY_ENGAGED;
      reasons.push(`WhatsApp muy engaged (${hist.whatsappTurnCount} turnos) +${POINTS.HIST_WA_VERY_ENGAGED}`);
    } else if (hist.whatsappTurnCount >= 2) {
      pclose += POINTS.HIST_WA_ENGAGED;
      reasons.push(`WhatsApp engaged (${hist.whatsappTurnCount} turnos) +${POINTS.HIST_WA_ENGAGED}`);
    }

    if (hist.visitaInteres === "alto") {
      pclose += POINTS.HIST_VISITA_ALTO;
      reasons.push(`Visita con interés alto +${POINTS.HIST_VISITA_ALTO}`);
    } else if (hist.visitaInteres === "medio") {
      pclose += POINTS.HIST_VISITA_MEDIO;
      reasons.push(`Visita con interés medio +${POINTS.HIST_VISITA_MEDIO}`);
    }

    if (hist.micrositeInteresCount > 0) {
      value += POINTS.HIST_MICROSITE_INTERES;
      reasons.push(`Microsite: ${hist.micrositeInteresCount} selecciones ME_INTERESA +${POINTS.HIST_MICROSITE_INTERES}`);
    }
  }

  // ── Señales por tipo (v1, sin cambios) ──

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
      reasons.push(`"Solo estoy mirando" ${POINTS.SOLO_MIRANDO}`);
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
      reasons.push(`"Probar sin agencia" ${POINTS.PROBAR_SIN_AGENCIA}`);
    }
  }

  return { pclose, value, urgency, reasons };
}

export { RANGES, POINTS, SOURCE_BONUS };

