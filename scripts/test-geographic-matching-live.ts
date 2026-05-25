/**
 * Simulacion cercana a produccion del flujo de rematch de una demanda.
 *
 * - Usa datos reales de Neon.
 * - Ejecuta el motor real matchPropertiesToDemand.
 * - Reporta cuantas propiedades pasan, cuantas se rechazan por geografia,
 *   y cuantos MATCH_GENERADO se emitirian segun la deduplicacion por delta score.
 * - Por defecto es read-only. Solo escribe eventos con --apply.
 *
 * Uso:
 *   npm run test:matching-geographic:live -- --demand=40116955
 *   npm run test:matching-geographic:live -- --demand=40116955 --days=30 --top=10
 *   npm run test:matching-geographic:live -- --demand=40116955 --apply
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { enqueueJob } from "@/lib/job-queue";
import { computeMatchScore, DEFAULT_CONFIG } from "@/lib/matching/scoring";
import { buildDemandLocationContext } from "@/lib/matching/location-context";
import { matchPropertiesToDemand } from "@/lib/matching/match-properties";
import { ACTIVE_DEMAND_STATES } from "@/lib/matching/match-demands";
import type { DemandForMatching, PropertyForMatching } from "@/lib/matching";
import type { JsonValue } from "@/lib/event-store/types";

const SCORE_DELTA_THRESHOLD = 5;

interface CliOptions {
  demandId: string;
  days: number;
  top: number;
  apply: boolean;
  json: boolean;
}

interface SimulationLine {
  propertyId: string;
  propertyRef: string;
  score: number;
  zoneMatched: boolean;
  zoneReason: string;
  decision: "emit" | "skip";
  previousScore: number | null;
  delta: number | null;
}

interface EvaluatedPropertyLine {
  propertyId: string;
  propertyRef: string;
  location: string;
  score: number;
  isMatch: boolean;
  blockedByLocation: boolean;
  zoneMatched: boolean;
  zoneReason: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args: CliOptions = {
    demandId: "",
    days: 30,
    top: 15,
    apply: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg === "--json") args.json = true;
    else if (arg.startsWith("--demand=")) args.demandId = arg.slice("--demand=".length);
    else if (arg.startsWith("--days=")) args.days = Number(arg.slice("--days=".length));
    else if (arg.startsWith("--top=")) args.top = Number(arg.slice("--top=".length));
  }

  if (!Number.isFinite(args.days) || args.days <= 0) args.days = 30;
  if (!Number.isFinite(args.top) || args.top <= 0) args.top = 15;
  args.top = Math.min(args.top, 100);
  return args;
}

async function loadEligiblePropertiesForDiagnostics(
  demand: DemandForMatching,
): Promise<PropertyForMatching[]> {
  const hasMin = demand.presupuestoMin > 0;
  const hasMax = demand.presupuestoMax > 0;
  const priceFilter: Record<string, unknown> =
    hasMin || hasMax
      ? {
          AND: [
            ...(hasMax
              ? [{ precio: { lte: demand.presupuestoMax * 1.25 } }]
              : []),
            ...(hasMin
              ? [{ precio: { gte: demand.presupuestoMin * 0.75 } }]
              : []),
          ],
        }
      : {};

  const rows = await prisma.propertyCurrent.findMany({
    where: {
      estado: "Libre",
      nodisponible: false,
      precio: { gt: 0 },
      ciudad: { not: "" },
      zona: { not: "" },
      ...priceFilter,
    },
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      tipoOfer: true,
      precio: true,
      metrosConstruidos: true,
      habitaciones: true,
      ciudad: true,
      zona: true,
    },
  });

  return rows.map((row) => ({
    codigo: row.codigo,
    ref: row.ref,
    titulo: row.titulo,
    tipoOfer: row.tipoOfer,
    precio: row.precio,
    metrosConstruidos: row.metrosConstruidos,
    habitaciones: row.habitaciones,
    ciudad: row.ciudad,
    zona: row.zona,
  }));
}

function toDemandForMatching(row: {
  codigo: string;
  ref: string;
  nombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  metrosMin: number | null;
  metrosMax: number | null;
  tipoOperacion: string | null;
}): DemandForMatching {
  return {
    codigo: row.codigo,
    ref: row.ref,
    nombre: row.nombre,
    presupuestoMin: row.presupuestoMin,
    presupuestoMax: row.presupuestoMax,
    habitacionesMin: row.habitacionesMin,
    tipos: row.tipos,
    zonas: row.zonas,
    ...(row.metrosMin != null ? { metrosMin: row.metrosMin } : {}),
    ...(row.metrosMax != null ? { metrosMax: row.metrosMax } : {}),
    ...(row.tipoOperacion ? { tipoOperacion: row.tipoOperacion } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.demandId) {
    throw new Error("Falta --demand=ID_DEMANDA");
  }

  const demandRow = await prisma.demandCurrent.findUnique({
    where: { codigo: options.demandId },
    select: {
      codigo: true,
      ref: true,
      nombre: true,
      estadoId: true,
      presupuestoMin: true,
      presupuestoMax: true,
      habitacionesMin: true,
      tipos: true,
      zonas: true,
      metrosMin: true,
      metrosMax: true,
      tipoOperacion: true,
    },
  });
  if (!demandRow) {
    throw new Error(`Demanda ${options.demandId} no encontrada en demand_current`);
  }
  if (!ACTIVE_DEMAND_STATES.includes(demandRow.estadoId)) {
    throw new Error(`Demanda ${options.demandId} no activa (estadoId=${demandRow.estadoId})`);
  }

  const demand = toDemandForMatching(demandRow);
  const locationContext = await buildDemandLocationContext(demand);
  const result = await matchPropertiesToDemand(demand);
  const diagnosticProperties = await loadEligiblePropertiesForDiagnostics(demand);
  const evaluatedProperties: EvaluatedPropertyLine[] = diagnosticProperties
    .map((property) => {
      const score = computeMatchScore(property, demand, {
        ...DEFAULT_CONFIG,
        location: locationContext,
      });
      return {
        propertyId: property.codigo,
        propertyRef: property.ref,
        location: `${property.zona} (${property.ciudad})`,
        score: score.totalScore,
        isMatch: score.isMatch,
        blockedByLocation: score.blockedByLocation,
        zoneMatched: score.matchScore.zone.matched,
        zoneReason: score.matchScore.zone.reason,
      };
    })
    .sort((a, b) => b.score - a.score);

  const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
  const lines: SimulationLine[] = [];
  let wouldEmit = 0;
  let wouldSkip = 0;
  let applied = 0;

  for (const match of result.matches) {
    const aggregateId = `${match.demandId}:${match.propertyId}`;
    const previous = await prisma.event.findFirst({
      where: {
        type: "MATCH_GENERADO",
        aggregateId,
        createdAt: { gte: since },
      },
      orderBy: { position: "desc" },
      select: { payload: true },
    });
    const previousPayload = previous?.payload as Record<string, unknown> | null;
    const previousScore = typeof previousPayload?.totalScore === "number"
      ? previousPayload.totalScore
      : null;
    const delta = previousScore == null ? null : Math.abs(match.totalScore - previousScore);
    const shouldEmit = previousScore == null || delta == null || delta >= SCORE_DELTA_THRESHOLD;

    lines.push({
      propertyId: match.propertyId,
      propertyRef: match.propertyRef,
      score: match.totalScore,
      zoneMatched: match.matchScore.zone.matched,
      zoneReason: match.matchScore.zone.reason,
      decision: shouldEmit ? "emit" : "skip",
      previousScore,
      delta,
    });

    if (shouldEmit) {
      wouldEmit++;
      if (options.apply) {
        const matchEvent = await appendEvent({
          type: "MATCH_GENERADO",
          aggregateType: "MATCH",
          aggregateId,
          payload: {
            demandId: match.demandId,
            demandRef: match.demandRef,
            demandNombre: match.demandNombre,
            propertyId: match.propertyId,
            propertyRef: match.propertyRef,
            totalScore: match.totalScore,
            matchScore: JSON.parse(JSON.stringify(match.matchScore)),
            source: "geo_live_simulation",
          } as unknown as JsonValue,
        });

        await enqueueJob({
          type: "PROCESS_EVENT",
          payload: { eventId: matchEvent.id },
          idempotencyKey: `process_event:${matchEvent.id}`,
          sourceEventId: matchEvent.id,
        });
        applied++;
      }
    } else {
      wouldSkip++;
    }
  }

  const summary = {
    demand: {
      codigo: demandRow.codigo,
      ref: demandRow.ref,
      nombre: demandRow.nombre,
      estadoId: demandRow.estadoId,
      zonas: demandRow.zonas,
      presupuestoMin: demandRow.presupuestoMin,
      presupuestoMax: demandRow.presupuestoMax,
      habitacionesMin: demandRow.habitacionesMin,
    },
    simulation: {
      readOnly: !options.apply,
      locationContext,
      totalPropertiesScanned: result.totalProperties,
      filteredOut: result.filteredOut,
      geographicallyRejected: result.geographicallyRejected,
      candidatesAfterScoring: result.matches.length,
      wouldEmit,
      wouldSkip,
      emittedNow: applied,
      scoreDeltaThreshold: SCORE_DELTA_THRESHOLD,
      dedupWindowDays: options.days,
    },
    top: lines.slice(0, options.top),
    diagnostics: {
      acceptedOrNearby: evaluatedProperties
        .filter((line) => line.zoneMatched)
        .slice(0, options.top),
      rejectedByLocation: evaluatedProperties
        .filter((line) => line.blockedByLocation)
        .slice(0, options.top),
      belowThresholdAfterGeo: evaluatedProperties
        .filter((line) => line.zoneMatched && !line.isMatch)
        .slice(0, options.top),
    },
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("== Simulacion live de matching geografico ==");
    console.log(
      `Demanda ${summary.demand.ref} (${summary.demand.codigo}) — ${summary.demand.nombre}`,
    );
    console.log(
      `Zonas: ${summary.demand.zonas} | Presupuesto: ${summary.demand.presupuestoMin}-${summary.demand.presupuestoMax}`,
    );
    console.log("");
    console.log(`Propiedades evaluadas: ${summary.simulation.totalPropertiesScanned}`);
    console.log(`Ciudad inferida: ${summary.simulation.locationContext.demandCity ?? "(sin inferir)"}`);
    console.log(`Zonas exactas: ${(summary.simulation.locationContext.exactZones ?? []).join(", ") || "(ninguna)"}`);
    console.log(`Zonas cercanas: ${(summary.simulation.locationContext.nearbyZones ?? []).join(", ") || "(ninguna)"}`);
    console.log(`Filtradas duras: ${summary.simulation.filteredOut}`);
    console.log(`Rechazadas por geografia: ${summary.simulation.geographicallyRejected}`);
    console.log(`Candidatas finales (score+gate): ${summary.simulation.candidatesAfterScoring}`);
    console.log(`Se emitirian MATCH_GENERADO: ${summary.simulation.wouldEmit}`);
    console.log(`Se saltarian por dedup delta<${SCORE_DELTA_THRESHOLD}: ${summary.simulation.wouldSkip}`);
    if (options.apply) {
      console.log(`MATCH_GENERADO emitidos en esta ejecucion: ${summary.simulation.emittedNow}`);
    } else {
      console.log("Modo: read-only (usa --apply para emitir eventos)");
    }
    console.log("");
    console.log(`Top ${summary.top.length} resultados:`);
    for (const line of summary.top) {
      const dedup = line.decision === "emit" ? "EMIT" : "SKIP";
      console.log(
        `- [${dedup}] ${line.propertyRef} (${line.propertyId}) score=${line.score} ` +
          `zoneMatched=${line.zoneMatched} prev=${line.previousScore ?? "-"} delta=${line.delta ?? "-"}\n` +
          `  zoneReason: ${line.zoneReason}`,
      );
    }
    console.log("");
    console.log("Diagnostico geografico:");
    for (const line of summary.diagnostics.acceptedOrNearby) {
      console.log(`- [GEO OK] ${line.propertyRef} ${line.location} score=${line.score} :: ${line.zoneReason}`);
    }
    for (const line of summary.diagnostics.rejectedByLocation.slice(0, Math.max(0, options.top - summary.diagnostics.acceptedOrNearby.length))) {
      console.log(`- [GEO REJECT] ${line.propertyRef} ${line.location} score=${line.score} :: ${line.zoneReason}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

