/**
 * Simulacion read-only del reranker IA para microsites.
 *
 * Uso:
 *   npm run test:ai-ranker-live -- --demand=40116955 --dry-run
 *   npm run test:ai-ranker-live -- --demand=40116955 --json
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { searchSnapshotForDemand, type DemandFilterInput } from "@/lib/statefox";
import { buildDemandLocationContext } from "@/lib/matching/location-context";
import { buildCandidateExpansionSteps } from "@/lib/matching/candidate-expansion";
import { evaluateLocationMatch } from "@/lib/matching/location";
import {
  MIN_PREFERRED_RANKER_PROPERTIES,
  rankPropertiesWithAI,
  type AIRankerCandidate,
} from "@/lib/matching/ai-ranker";
import type { DemandForMatching, PropertyForMatching } from "@/lib/matching";
import type { StatefoxSnapshotProperty, StatefoxPropertyZone } from "@/lib/statefox";

interface CliOptions {
  demandId: string;
  json: boolean;
  dryRun: boolean;
  maxPages: number;
  targetResults: number;
  targetCandidates: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args: CliOptions = {
    demandId: "",
    json: false,
    dryRun: true,
    maxPages: 10,
    targetResults: 30,
    targetCandidates: Math.max(MIN_PREFERRED_RANKER_PROPERTIES, 12),
  };
  for (const arg of argv) {
    if (arg === "--json") args.json = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--demand=")) args.demandId = arg.slice("--demand=".length);
    else if (arg.startsWith("--max-pages=")) args.maxPages = Number(arg.slice("--max-pages=".length));
    else if (arg.startsWith("--target-results=")) {
      args.targetResults = Number(arg.slice("--target-results=".length));
    } else if (arg.startsWith("--target-candidates=")) {
      args.targetCandidates = Number(arg.slice("--target-candidates=".length));
    }
  }
  if (!args.demandId) throw new Error("Falta --demand=ID_DEMANDA");
  if (!Number.isFinite(args.maxPages) || args.maxPages <= 0) args.maxPages = 10;
  if (!Number.isFinite(args.targetResults) || args.targetResults <= 0) args.targetResults = 30;
  if (!Number.isFinite(args.targetCandidates) || args.targetCandidates <= 0) {
    args.targetCandidates = Math.max(MIN_PREFERRED_RANKER_PROPERTIES, 12);
  }
  args.targetCandidates = Math.max(
    MIN_PREFERRED_RANKER_PROPERTIES,
    Math.min(60, Math.round(args.targetCandidates)),
  );
  return args;
}

function resolveZoneName(pZone: string | StatefoxPropertyZone | undefined): string {
  if (!pZone) return "";
  if (typeof pZone === "string") return pZone;
  return pZone.name ?? "";
}

function extractImages(p: StatefoxSnapshotProperty): string[] {
  return Array.isArray(p.pImages)
    ? p.pImages.filter((src): src is string => typeof src === "string" && src.trim() !== "")
    : [];
}

function scoreForDemand(p: StatefoxSnapshotProperty, demand: DemandFilterInput): number {
  let score = 0;
  const imagesCount = extractImages(p).length;
  if (imagesCount > 0) score += 100 + Math.min(imagesCount, 6) * 5;
  if (typeof p.pRooms === "number" && p.pRooms >= Math.max(0, demand.habitacionesMin ?? 0)) {
    score += 20;
  }
  if (typeof p.pPrice === "number" && demand.presupuestoMax > 0) {
    const rel = Math.abs(p.pPrice - demand.presupuestoMax) / Math.max(1, demand.presupuestoMax);
    score += Math.max(0, 50 - rel * 100);
  }
  return score;
}

function toDemandForMatching(demandId: string, demand: DemandFilterInput): DemandForMatching {
  return {
    codigo: demandId,
    ref: demandId,
    nombre: "",
    presupuestoMin: demand.presupuestoMin,
    presupuestoMax: demand.presupuestoMax,
    habitacionesMin: demand.habitacionesMin,
    tipos: demand.tipos,
    zonas: demand.zonas,
    metrosMin: demand.metrosMin,
    metrosMax: demand.metrosMax,
    tipoOperacion: "venta",
  };
}

function toPropertyForMatching(propertyId: string, p: StatefoxSnapshotProperty): PropertyForMatching {
  return {
    codigo: propertyId,
    ref: propertyId,
    titulo: typeof p.pAddress === "string" ? p.pAddress : propertyId,
    tipoOfer: typeof p.pHousing === "string" ? p.pHousing : "",
    precio: typeof p.pPrice === "number" ? p.pPrice : 0,
    metrosConstruidos: typeof p.pMeters?.built === "number" ? p.pMeters.built : 0,
    habitaciones: typeof p.pRooms === "number" ? p.pRooms : 0,
    ciudad: typeof p.pCity?.cityName === "string" ? p.pCity.cityName : "",
    zona: resolveZoneName(p.pZone),
    tipoOperacion: "venta",
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const demandRow = await prisma.demandCurrent.findUnique({
    where: { codigo: options.demandId },
    select: {
      codigo: true,
      nombre: true,
      tipos: true,
      zonas: true,
      presupuestoMin: true,
      presupuestoMax: true,
      habitacionesMin: true,
      metrosMin: true,
      metrosMax: true,
    },
  });
  if (!demandRow) throw new Error(`Demanda ${options.demandId} no encontrada`);

  const demand: DemandFilterInput = {
    tipos: demandRow.tipos,
    zonas: demandRow.zonas,
    presupuestoMin: demandRow.presupuestoMin,
    presupuestoMax: demandRow.presupuestoMax,
    habitacionesMin: demandRow.habitacionesMin,
    metrosMin: demandRow.metrosMin ?? undefined,
    metrosMax: demandRow.metrosMax ?? undefined,
  };
  const matchingDemand = toDemandForMatching(demandRow.codigo, demand);
  const location = await buildDemandLocationContext(matchingDemand);
  const expansionSteps = buildCandidateExpansionSteps(demand, location);
  const seen = new Set<string>();
  const candidates: AIRankerCandidate[] = [];
  const discardedByGeo: string[] = [];
  const stepsUsed: string[] = [];

  for (const step of expansionSteps) {
    stepsUsed.push(step.label);
    const result = await searchSnapshotForDemand(step.demand, {
      listingType: "sale",
      maxPages: options.maxPages,
      targetResults: options.targetResults,
    });

    for (const match of result.properties) {
      if (seen.has(match.id) || extractImages(match.property).length === 0) continue;
      seen.add(match.id);
      const decision = evaluateLocationMatch(
        toPropertyForMatching(match.id, match.property),
        matchingDemand,
        location,
      );
      if (!decision.matched) {
        discardedByGeo.push(match.id);
        continue;
      }

      candidates.push({
        propertyId: match.id,
        deterministicScore: scoreForDemand(match.property, demand),
        geoFit:
          decision.matchedBy === "exact_zone"
            ? "exact"
            : decision.matchedBy === "nearby_zone" ||
                decision.matchedBy === "partial_zone" ||
                decision.matchedBy === "segment_overlap"
              ? "nearby"
              : decision.matchedBy === "city" || decision.matchedBy === "city_partial"
                ? "same_city"
                : "unknown",
        title: typeof match.property.pAddress === "string" ? match.property.pAddress : match.id,
        city: match.property.pCity?.cityName ?? null,
        zone: resolveZoneName(match.property.pZone) || null,
        price: match.property.pPrice ?? null,
        rooms: match.property.pRooms ?? null,
        metersBuilt: match.property.pMeters?.built ?? null,
        imagesCount: extractImages(match.property).length,
        advertiserType: match.property.pAdvert?.type ?? null,
      });
    }

    if (candidates.length >= options.targetCandidates) break;
  }

  const ranker = await rankPropertiesWithAI({
    demandId: options.demandId,
    demand,
    location,
    candidates,
    minPreferredProperties: MIN_PREFERRED_RANKER_PROPERTIES,
  });

  const candidateIds = new Set(candidates.map((candidate) => candidate.propertyId));
  const invalidSelectedIds = ranker.selected
    .filter((selected) => !candidateIds.has(selected.propertyId))
    .map((selected) => selected.propertyId);
  const selectedGeoFits = ranker.selected.map(
    (selected) =>
      candidates.find((candidate) => candidate.propertyId === selected.propertyId)?.geoFit ?? "unknown",
  );
  const selectedUnmappedGeoFit = selectedGeoFits.filter((fit) => fit === "unknown").length;
  const geoFitBreakdown = candidates.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.geoFit] = (acc[candidate.geoFit] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    dryRun: options.dryRun,
    demandId: options.demandId,
    demandNombre: demandRow.nombre,
    location,
    runConfig: {
      maxPages: options.maxPages,
      targetResults: options.targetResults,
      targetCandidates: options.targetCandidates,
    },
    stepsUsed,
    candidates: candidates.length,
    geoValidation: {
      discardedByGeo: discardedByGeo.length,
      geoFitBreakdown,
      invalidSelectedIds,
      selectedUnmappedGeoFit,
      passed: invalidSelectedIds.length === 0,
    },
    ranker: {
      model: ranker.model,
      fallbackApplied: ranker.fallbackApplied,
      fallbackReason: ranker.fallbackReason ?? null,
      needsMoreCandidates: ranker.needsMoreCandidates,
      expansionRequest: ranker.expansionRequest ?? null,
      selected: ranker.selected,
      rejected: ranker.rejected,
    },
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Demanda ${report.demandId} (${report.demandNombre})`);
    console.log(`Pasos usados: ${stepsUsed.join(" -> ")}`);
    console.log(
      `Config: maxPages=${options.maxPages}, targetResults=${options.targetResults}, targetCandidates=${options.targetCandidates}`,
    );
    console.log(`Candidatos seguros con foto: ${candidates.length}`);
    console.log(`Descartados por geografía: ${discardedByGeo.length}`);
    console.log(`Geo fit pool: ${JSON.stringify(geoFitBreakdown)}`);
    console.log(`Modelo: ${ranker.model}${ranker.fallbackApplied ? " (fallback)" : ""}`);
    if (ranker.fallbackReason) console.log(`Fallback reason: ${ranker.fallbackReason}`);
    console.log(`Pide mas candidatos: ${ranker.needsMoreCandidates ? "si" : "no"}`);
    console.log(
      `Validacion guardrails: ${invalidSelectedIds.length === 0 ? "OK" : "FAIL"}`,
    );
    if (invalidSelectedIds.length > 0) {
      console.log(`IDs invalidos en selección IA: ${invalidSelectedIds.join(", ")}`);
    }
    if (selectedUnmappedGeoFit > 0) {
      console.log(`Seleccionados con geo-fit no mapeado: ${selectedUnmappedGeoFit}`);
    }
    for (const selected of ranker.selected) {
      console.log(
        `#${selected.rank} ${selected.propertyId} fit=${selected.fitScore}: ${selected.reason}`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

