import type { Propiedad, SemaforoStatus } from "@/lib/mock-data/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClusterComparable {
  id: string;
  direccion: string;
  precio: number;
  metros: number;
  habitaciones: number;
  zona: string;
  extras: Record<string, boolean>;
  portalPos: number;
  diasPublicado: number;
}

export interface PositionHistoryEntry {
  month: string;
  position: number;
}

export interface Recommendation {
  action: string;
  colorToken: "danger" | "warning" | "success";
  text: string;
}

export interface PortfolioStats {
  total: number;
  verde: number;
  amarillo: number;
  rojo: number;
  burned: number;
  avgGap: number;
  avgPosition: number;
  avgPrice: number;
  avgPricePerM2: number;
}

// ---------------------------------------------------------------------------
// Cluster generation (simulated comparables)
// ---------------------------------------------------------------------------

const CLUSTER_SEEDS = [
  { suffix: "4ºA", delta: -0.08, metrosDelta: -5, pos: 1, dias: 15 },
  { suffix: "2ºB", delta: -0.04, metrosDelta: 0, pos: 2, dias: 22 },
  { suffix: "6ºC", delta: 0.02, metrosDelta: 10, pos: 4, dias: 8 },
  { suffix: "1ºD", delta: 0.06, metrosDelta: -10, pos: 5, dias: 35 },
  { suffix: "3ºE", delta: 0.12, metrosDelta: 15, pos: 8, dias: 45 },
  { suffix: "Bajo", delta: -0.12, metrosDelta: -15, pos: 3, dias: 12 },
] as const;

export function generateCluster(prop: Propiedad): ClusterComparable[] {
  const base = prop.precio;
  return CLUSTER_SEEDS.map((c, i) => ({
    id: `cluster-${i}`,
    direccion: `${prop.zona}, ${c.suffix}`,
    precio: Math.round(base * (1 + c.delta)),
    metros: prop.metros + c.metrosDelta,
    habitaciones: prop.habitaciones,
    zona: prop.zona,
    extras: {
      terraza: i % 2 === 0,
      garaje: i < 3,
      ascensor: i !== 4,
      reformado: i < 2,
    },
    portalPos: c.pos,
    diasPublicado: c.dias,
  }));
}

// ---------------------------------------------------------------------------
// Position history (simulated portal ranking over time)
// ---------------------------------------------------------------------------

const HISTORY_MONTHS = ["Sep", "Oct", "Nov", "Dic", "Ene", "Feb"] as const;

export function generatePositionHistory(
  currentPos: number,
  rng: () => number = Math.random,
): PositionHistoryEntry[] {
  const startPos = Math.min(20, currentPos + Math.floor(rng() * 8) + 3);
  return HISTORY_MONTHS.map((month, i) => {
    const progress = i / (HISTORY_MONTHS.length - 1);
    const position = Math.round(
      startPos + (currentPos - startPos) * progress + (rng() * 2 - 1),
    );
    const final = i === HISTORY_MONTHS.length - 1 ? currentPos : position;
    return { month, position: Math.max(1, final) };
  });
}

// ---------------------------------------------------------------------------
// AI Recommendation
// ---------------------------------------------------------------------------

export function getRecommendation(prop: Propiedad): Recommendation {
  if (prop.semaforo === "rojo") {
    if (prop.gapPrecio > 10) {
      const reductionEur = (prop.precio * Math.abs(prop.gapPrecio) / 100)
        .toFixed(0)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const avgEurPerM2 = Math.round(
        (prop.precio / prop.metros) * (1 - prop.gapPrecio / 100),
      );
      const targetPrice = (prop.precio * (1 - prop.gapPrecio / 100))
        .toFixed(0)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

      return {
        action: "Bajar precio",
        colorToken: "danger",
        text: `Para competir con los 5 primeros resultados en ${prop.zona}, el precio debería reducirse un ${Math.abs(prop.gapPrecio).toFixed(1)}% (≈ ${reductionEur} €). Las propiedades comparables en esta zona se venden a una media de ${avgEurPerM2} €/m². Llevas ${prop.diasSinLlamadas} días sin recibir llamadas, lo que confirma un desajuste con el mercado. Recomendamos ajustar el precio a ${targetPrice} € para reactivar el interés.`,
      };
    }
    return {
      action: "Reposicionar",
      colorToken: "danger",
      text: `Esta propiedad lleva ${prop.diasSinLlamadas} días sin actividad y ocupa la posición #${prop.posicionPortal} en portales. Sugerimos retirar temporalmente del mercado, mejorar la presentación visual y volver a publicar con un precio ajustado. Esto genera efecto "novedad" en los portales y mejora el posicionamiento orgánico.`,
    };
  }

  if (prop.semaforo === "amarillo") {
    return {
      action: "Mejorar fotos",
      colorToken: "warning",
      text: `La propiedad tiene una diferencia de precio moderada (+${prop.gapPrecio}%) respecto al mercado y su posición en portal (#${prop.posicionPortal}) sugiere baja visibilidad. Antes de ajustar precio, recomendamos invertir en fotografía profesional, home staging virtual y mejorar la descripción. Propiedades con fotos profesionales en ${prop.zona} reciben 3x más solicitudes de visita.`,
    };
  }

  return {
    action: "Mantener estrategia",
    colorToken: "success",
    text: `La propiedad está bien posicionada (#${prop.posicionPortal}) con un precio competitivo (${prop.gapPrecio}% respecto al mercado). Recomendamos mantener la estrategia actual y monitorear semanalmente. Si la posición cae por debajo del #5, considere reajustar.`,
  };
}

// ---------------------------------------------------------------------------
// Semáforo derivation
// ---------------------------------------------------------------------------

export function computeSemaforoStatus(
  gapPrecio: number,
  posicionPortal: number,
  diasSinLlamadas: number,
): SemaforoStatus {
  if (gapPrecio > 10 || (posicionPortal > 10 && diasSinLlamadas > 20)) {
    return "rojo";
  }
  if (gapPrecio > 3 || posicionPortal > 5 || diasSinLlamadas > 10) {
    return "amarillo";
  }
  return "verde";
}

// ---------------------------------------------------------------------------
// Portfolio aggregation
// ---------------------------------------------------------------------------

export function computePortfolioStats(props: Propiedad[]): PortfolioStats {
  const total = props.length;
  if (total === 0) {
    return {
      total: 0,
      verde: 0,
      amarillo: 0,
      rojo: 0,
      burned: 0,
      avgGap: 0,
      avgPosition: 0,
      avgPrice: 0,
      avgPricePerM2: 0,
    };
  }

  const verde = props.filter((p) => p.semaforo === "verde").length;
  const amarillo = props.filter((p) => p.semaforo === "amarillo").length;
  const rojo = props.filter((p) => p.semaforo === "rojo").length;
  const burned = props.filter(
    (p) => p.semaforo === "rojo" || (p.gapPrecio > 10 && p.diasSinLlamadas > 20),
  ).length;

  const avgGap = props.reduce((s, p) => s + p.gapPrecio, 0) / total;
  const avgPosition = props.reduce((s, p) => s + p.posicionPortal, 0) / total;
  const avgPrice = Math.round(props.reduce((s, p) => s + p.precio, 0) / total);
  const avgPricePerM2 = Math.round(
    props.reduce((s, p) => s + p.precio / p.metros, 0) / total,
  );

  return { total, verde, amarillo, rojo, burned, avgGap, avgPosition, avgPrice, avgPricePerM2 };
}
