import type { DemandFilterInput } from "@/lib/statefox";
import type { LocationMatchContext } from "./types";

export interface CandidateExpansionStep {
  label: string;
  demand: DemandFilterInput;
  relaxation: "exact" | "price" | "nearby_zones" | "nearby_zones_price";
}

export interface CandidateExpansionOptions {
  priceExpansionPercent?: number;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function expandPrice(demand: DemandFilterInput, percent: number): DemandFilterInput {
  const factor = percent / 100;
  return {
    ...demand,
    presupuestoMin: Math.round((demand.presupuestoMin ?? 0) * (1 - factor)),
    presupuestoMax: Math.round((demand.presupuestoMax ?? 0) * (1 + factor)),
  };
}

function withNearbyZones(
  demand: DemandFilterInput,
  location: LocationMatchContext,
): DemandFilterInput | null {
  const nearbyZones = location.nearbyZones ?? [];
  if (nearbyZones.length === 0) return null;

  const zones = uniq([
    demand.zonas,
    ...(location.exactZones ?? []),
    ...nearbyZones,
  ]);
  if (zones.length === 0) return null;

  return { ...demand, zonas: zones.join(", ") };
}

export function buildCandidateExpansionSteps(
  demand: DemandFilterInput,
  location: LocationMatchContext,
  options: CandidateExpansionOptions = {},
): CandidateExpansionStep[] {
  const priceExpansionPercent = options.priceExpansionPercent ?? 20;
  const steps: CandidateExpansionStep[] = [
    { label: "exact", demand, relaxation: "exact" },
    {
      label: `price+${priceExpansionPercent}%`,
      demand: expandPrice(demand, priceExpansionPercent),
      relaxation: "price",
    },
  ];

  const nearby = withNearbyZones(demand, location);
  if (nearby) {
    steps.push({
      label: "nearby-zones",
      demand: nearby,
      relaxation: "nearby_zones",
    });
    steps.push({
      label: `nearby-zones,price+${priceExpansionPercent}%`,
      demand: expandPrice(nearby, priceExpansionPercent),
      relaxation: "nearby_zones_price",
    });
  }

  return steps;
}

