/**
 * Carga de contextos del microsite para el banco de pruebas del NLU:
 *  - Mocks estáticos (propiedades Madrid / Córdoba y mock-selection curado).
 *  - Escenarios predefinidos de la suite eval (lib/eval/scenarios/*).
 *  - MicrositeSelection reales persistidos en Neon.
 *
 * Todos los contextos se normalizan a { properties: MicrositeCuratedProperty[],
 * conversationHistory: ConversationTurn[] } para que el pipeline los persista
 * igual que los generados por GENERATE_MICROSITE en producción.
 */

import { prisma } from "@/lib/prisma";
import type {
  PropertySummaryForNLU,
  ConversationTurn,
} from "@/lib/agents";
import type { MicrositeCuratedProperty } from "@/lib/microsite/selection";
import { coerceMicrositeCuratedProperties } from "@/lib/microsite/selection";
import {
  MOCK_PROPERTIES,
  MOCK_PROPERTIES_CORDOBA,
} from "@/lib/eval/scenarios/mock-properties";
import { getMicrositeMockSelection } from "@/lib/microsite/mock-selection";
import { ALL_SCENARIOS } from "@/lib/eval/scenarios";
import type { EvalScenario, ExpectedOutcome } from "@/lib/eval/types";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type ContextSource = "mock" | "scenario" | "real";

export type ContextSpec =
  | { source: "mock"; id: MockContextId }
  | { source: "scenario"; id: string }
  | { source: "real"; id: string };

export type MockContextId = "mock-madrid" | "mock-cordoba" | "mock-selection";

export interface ContextCatalogEntry {
  source: ContextSource;
  id: string;
  label: string;
  description: string;
  propertiesCount: number;
  /** Solo en escenarios: categoría de evaluación (property_resolution, etc.). */
  category?: string;
  /** Solo en escenarios: persona sintética asignada. */
  personaId?: string;
  /** Solo en real: fecha de creación del microsite. */
  createdAt?: string;
  /** Solo en real: demandId asociado. */
  demandId?: string;
}

export interface ResolvedContext {
  spec: ContextSpec;
  label: string;
  description: string;
  /** Lista curada que se persiste en MicrositeSelection.properties. */
  curatedProperties: MicrositeCuratedProperty[];
  /** Resumen ligero que consume el NLU. */
  summaryProperties: PropertySummaryForNLU[];
  /** Historial semilla (solo viene poblado en escenarios multi-turn). */
  conversationHistory: ConversationTurn[];
  /** Solo en escenarios: ground truth para el juez. */
  expectedOutcome?: ExpectedOutcome;
  /** Solo en escenarios: instrucciones del comprador sintético. */
  buyerInstructions?: string;
  /** Solo en escenarios: id de persona asignada. */
  personaId?: string;
  /** Solo en escenarios: id del escenario (para el juez). */
  scenarioId?: string;
}

// ---------------------------------------------------------------------------
// Helpers de normalización
// ---------------------------------------------------------------------------

function summaryFromCurated(
  properties: MicrositeCuratedProperty[],
): PropertySummaryForNLU[] {
  return properties.map((p) => ({
    propertyId: p.propertyId,
    title: p.title,
    price: p.price,
    zone: p.zone,
    city: p.city,
    metersBuilt: p.metersBuilt,
    rooms: p.rooms,
    extras: p.extras.slice(0, 5),
  }));
}

/**
 * Convierte propiedades del NLU (las usadas por escenarios y mocks mínimos)
 * a la forma curada completa que se persiste en MicrositeSelection. Los
 * campos no disponibles en el resumen quedan como null / [].
 */
function curatedFromSummary(
  properties: PropertySummaryForNLU[],
): MicrositeCuratedProperty[] {
  return properties.map((p) => ({
    propertyId: p.propertyId,
    title: p.title,
    description: null,
    link: null,
    price: p.price,
    pricePerMeter: null,
    metersBuilt: p.metersBuilt,
    metersUsable: null,
    metersPlot: null,
    metersTerrace: null,
    rooms: p.rooms,
    baths: null,
    floor: null,
    orientation: null,
    address: null,
    city: p.city,
    zone: p.zone,
    housing: null,
    latitude: null,
    longitude: null,
    images: [],
    extras: p.extras,
    energyCertRating: null,
    energyCertValue: null,
    yearBuilt: null,
    condition: null,
    advertiserType: null,
    advertiserName: null,
  }));
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export function listMockContexts(): ContextCatalogEntry[] {
  const mockSel = getMicrositeMockSelection();
  return [
    {
      source: "mock",
      id: "mock-madrid",
      label: "Mock Madrid (MOCK_PROPERTIES)",
      description:
        "5 propiedades Madrid: Salamanca, Chamartín, Chamberí, Malasaña, Pozuelo.",
      propertiesCount: MOCK_PROPERTIES.length,
    },
    {
      source: "mock",
      id: "mock-cordoba",
      label: "Mock Córdoba (MOCK_PROPERTIES_CORDOBA)",
      description:
        "5 propiedades Córdoba: Centro, Brillante, Ciudad Jardín, Levante, Zoco.",
      propertiesCount: MOCK_PROPERTIES_CORDOBA.length,
    },
    {
      source: "mock",
      id: "mock-selection",
      label: "Mock Selection (microsite demo curado)",
      description:
        "3 propiedades Madrid con ficha completa (precio/m², imágenes, eficiencia).",
      propertiesCount: mockSel.properties.length,
    },
  ];
}

export function listScenarios(): ContextCatalogEntry[] {
  return ALL_SCENARIOS.map((s) => ({
    source: "scenario" as const,
    id: s.id,
    label: s.name,
    description:
      s.buyerInstructions.slice(0, 140) +
      (s.buyerInstructions.length > 140 ? "…" : ""),
    propertiesCount: s.properties.length,
    category: s.category,
    personaId: s.persona.id,
  }));
}

export async function listRealSelections(
  limit: number = 20,
): Promise<ContextCatalogEntry[]> {
  const rows = await prisma.micrositeSelection.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      token: true,
      demandId: true,
      demandNombre: true,
      properties: true,
      createdAt: true,
      status: true,
    },
  });

  return rows.map((r) => {
    const curated = coerceMicrositeCuratedProperties(r.properties);
    return {
      source: "real" as const,
      id: r.token,
      label: `${r.demandNombre || r.demandId} · ${r.status}`,
      description: `selectionId=${r.id.slice(0, 8)}… · ${curated.length} propiedades`,
      propertiesCount: curated.length,
      createdAt: r.createdAt.toISOString(),
      demandId: r.demandId,
    };
  });
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

function resolveMock(id: MockContextId): ResolvedContext {
  if (id === "mock-madrid") {
    const summary = MOCK_PROPERTIES;
    return {
      spec: { source: "mock", id },
      label: "Mock Madrid",
      description:
        "Set de 5 propiedades Madrid de la suite eval (MOCK_PROPERTIES).",
      curatedProperties: curatedFromSummary(summary),
      summaryProperties: summary,
      conversationHistory: [],
    };
  }

  if (id === "mock-cordoba") {
    const summary = MOCK_PROPERTIES_CORDOBA;
    return {
      spec: { source: "mock", id },
      label: "Mock Córdoba",
      description:
        "Set de 5 propiedades Córdoba de la suite eval (MOCK_PROPERTIES_CORDOBA).",
      curatedProperties: curatedFromSummary(summary),
      summaryProperties: summary,
      conversationHistory: [],
    };
  }

  const mockSel = getMicrositeMockSelection();
  const curated = mockSel.properties;
  return {
    spec: { source: "mock", id: "mock-selection" },
    label: "Mock Selection",
    description: mockSel.demandNombre,
    curatedProperties: curated,
    summaryProperties: summaryFromCurated(curated),
    conversationHistory: [],
  };
}

function resolveScenario(id: string): ResolvedContext {
  const scenario = ALL_SCENARIOS.find((s) => s.id === id);
  if (!scenario) {
    throw new Error(`Escenario no encontrado: ${id}`);
  }
  return buildScenarioContext(scenario);
}

function buildScenarioContext(scenario: EvalScenario): ResolvedContext {
  return {
    spec: { source: "scenario", id: scenario.id },
    label: `${scenario.category} · ${scenario.name}`,
    description: scenario.buyerInstructions,
    curatedProperties: curatedFromSummary(scenario.properties),
    summaryProperties: scenario.properties,
    conversationHistory: scenario.conversationHistory,
    expectedOutcome: scenario.expectedOutcome,
    buyerInstructions: scenario.buyerInstructions,
    personaId: scenario.persona.id,
    scenarioId: scenario.id,
  };
}

async function resolveRealSelection(token: string): Promise<ResolvedContext> {
  const row = await prisma.micrositeSelection.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      demandId: true,
      demandNombre: true,
      properties: true,
      status: true,
    },
  });

  if (!row) {
    throw new Error(`MicrositeSelection no encontrado: token=${token}`);
  }

  const curated = coerceMicrositeCuratedProperties(row.properties);
  if (curated.length === 0) {
    throw new Error(
      `Selection ${row.id} no tiene propiedades curadas válidas`,
    );
  }

  return {
    spec: { source: "real", id: row.token },
    label: `${row.demandNombre || row.demandId} · ${row.status}`,
    description: `Clonado de selection ${row.id} (demandId=${row.demandId}). Las acciones reales del pipeline se escriben contra la copia sintética, no sobre este selection.`,
    curatedProperties: curated,
    summaryProperties: summaryFromCurated(curated),
    conversationHistory: [],
  };
}

export async function resolveContext(
  spec: ContextSpec,
): Promise<ResolvedContext> {
  if (spec.source === "mock") {
    return resolveMock(spec.id);
  }
  if (spec.source === "scenario") {
    return resolveScenario(spec.id);
  }
  return resolveRealSelection(spec.id);
}
