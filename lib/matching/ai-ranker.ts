import OpenAI from "openai";
import { z } from "zod";
import type { DemandFilterInput } from "@/lib/statefox";
import type { LocationMatchContext } from "./types";

export const MIN_PREFERRED_RANKER_PROPERTIES = 6;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MODEL = "gpt-4.1-mini";

export const AIRankerSelectedSchema = z.object({
  propertyId: z.string().min(1),
  rank: z.number().int().min(1),
  fitScore: z.number().min(0).max(100),
  reason: z.string().min(1).max(500),
  risks: z.array(z.string().max(240)).max(5).default([]),
});

export const AIRankerRejectedSchema = z.object({
  propertyId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export const AIRankerExpansionRequestSchema = z.object({
  reason: z.string().min(1).max(500),
  allowedRelaxations: z
    .array(z.enum(["more_results", "nearby_zones", "price", "rooms", "meters"]))
    .min(1)
    .max(5),
  targetCount: z.number().int().min(MIN_PREFERRED_RANKER_PROPERTIES).max(30),
});

export const AIRankerResponseSchema = z.object({
  selected: z.array(AIRankerSelectedSchema).max(12),
  rejected: z.array(AIRankerRejectedSchema).max(50).default([]),
  needsMoreCandidates: z.boolean(),
  expansionRequest: AIRankerExpansionRequestSchema.optional(),
  buyerFacingSummary: z.string().min(1).max(700),
});

export type AIRankerResponse = z.infer<typeof AIRankerResponseSchema>;

export interface AIRankerCandidate {
  propertyId: string;
  deterministicScore: number;
  geoFit: "exact" | "nearby" | "same_city" | "unknown";
  title: string;
  city: string | null;
  zone: string | null;
  price: number | null;
  rooms: number | null;
  metersBuilt: number | null;
  imagesCount: number;
  advertiserType: string | null;
  criteria?: Record<string, unknown>;
}

export interface AIRankerFeedbackContext {
  intent?: "more_options";
  rejectedPropertyIds?: string[];
  notes?: string[];
}

export interface AIRankerInput {
  demandId: string;
  demand: DemandFilterInput;
  location: LocationMatchContext;
  candidates: AIRankerCandidate[];
  feedback?: AIRankerFeedbackContext;
  minPreferredProperties?: number;
}

export interface AIRankerResult {
  selected: AIRankerSelectedSchemaType[];
  rejected: z.infer<typeof AIRankerRejectedSchema>[];
  needsMoreCandidates: boolean;
  expansionRequest?: z.infer<typeof AIRankerExpansionRequestSchema>;
  buyerFacingSummary: string;
  model: string;
  durationMs: number;
  fallbackApplied: boolean;
  fallbackReason?: string;
}

type AIRankerSelectedSchemaType = z.infer<typeof AIRankerSelectedSchema>;

function deterministicFallback(
  input: AIRankerInput,
  startedAt: number,
  reason: string,
): AIRankerResult {
  const minPreferred = input.minPreferredProperties ?? MIN_PREFERRED_RANKER_PROPERTIES;
  const rejectedIds = new Set(input.feedback?.rejectedPropertyIds ?? []);
  const selected = input.candidates
    .filter((candidate) => !rejectedIds.has(candidate.propertyId))
    .sort((a, b) => b.deterministicScore - a.deterministicScore)
    .slice(0, 12)
    .map((candidate, index) => ({
      propertyId: candidate.propertyId,
      rank: index + 1,
      fitScore: Math.max(0, Math.min(100, Math.round(candidate.deterministicScore))),
      reason: "Ranking determinista usado como fallback del reranker IA.",
      risks: candidate.geoFit === "unknown" ? ["Ajuste geografico no detallado"] : [],
    }));

  return {
    selected,
    rejected: input.candidates
      .filter((candidate) => rejectedIds.has(candidate.propertyId))
      .map((candidate) => ({
        propertyId: candidate.propertyId,
        reason: "Propiedad rechazada previamente por el comprador.",
      })),
    needsMoreCandidates: selected.length < minPreferred,
    expansionRequest:
      selected.length < minPreferred
        ? {
            reason: `Solo hay ${selected.length} candidatos utiles tras el fallback.`,
            allowedRelaxations: ["more_results", "nearby_zones", "price"],
            targetCount: minPreferred,
          }
        : undefined,
    buyerFacingSummary: "Seleccion basada en el ranking determinista disponible.",
    model: "deterministic-fallback",
    durationMs: Date.now() - startedAt,
    fallbackApplied: true,
    fallbackReason: reason,
  };
}

export function validateAIRankerOutput(
  response: AIRankerResponse,
  allowedIds: Set<string>,
): AIRankerResponse {
  const selectedIds = new Set<string>();
  for (const selected of response.selected) {
    if (!allowedIds.has(selected.propertyId)) {
      throw new Error(`AI ranker selected unknown propertyId=${selected.propertyId}`);
    }
    if (selectedIds.has(selected.propertyId)) {
      throw new Error(`AI ranker selected duplicate propertyId=${selected.propertyId}`);
    }
    selectedIds.add(selected.propertyId);
  }

  for (const rejected of response.rejected) {
    if (!allowedIds.has(rejected.propertyId)) {
      throw new Error(`AI ranker rejected unknown propertyId=${rejected.propertyId}`);
    }
  }

  return response;
}

function buildPrompt(input: AIRankerInput): string {
  return JSON.stringify(
    {
      instructions: [
        "Eres un reranker inmobiliario. Solo puedes ordenar candidatos ya filtrados.",
        "Nunca selecciones IDs que no esten en candidates.",
        "No puedes rescatar propiedades fuera de ciudad o zona no comparable.",
        "Prioriza exactitud geografica, precio, tipologia, metros, habitaciones, fotos y variedad.",
        "Si hay pocos candidatos buenos, pide expansion controlada y explica por que.",
      ],
      demand: input.demand,
      locationContext: input.location,
      feedback: input.feedback ?? null,
      minPreferredProperties:
        input.minPreferredProperties ?? MIN_PREFERRED_RANKER_PROPERTIES,
      candidates: input.candidates,
      outputSchema: {
        selected:
          "array de {propertyId, rank, fitScore 0-100, reason, risks[]} max 12",
        rejected: "array de {propertyId, reason}",
        needsMoreCandidates: "boolean",
        expansionRequest:
          "opcional {reason, allowedRelaxations, targetCount}; usar si faltan candidatos de calidad",
        buyerFacingSummary: "resumen breve en espanol",
      },
    },
    null,
    2,
  );
}

export async function rankPropertiesWithAI(input: AIRankerInput): Promise<AIRankerResult> {
  const startedAt = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return deterministicFallback(input, startedAt, "OPENAI_API_KEY missing");
  }

  if (input.candidates.length === 0) {
    return deterministicFallback(input, startedAt, "No candidates");
  }

  const model = process.env.AI_RANKER_MODEL ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await client.responses.create(
      {
        model,
        input: [
          {
            role: "system",
            content:
              "Devuelve exclusivamente JSON valido, sin markdown. La decision debe ser auditable y conservadora con geografia.",
          },
          { role: "user", content: buildPrompt(input) },
        ],
      },
      { signal: controller.signal },
    );

    const parsed = AIRankerResponseSchema.parse(
      JSON.parse(response.output_text ?? "{}"),
    );
    const safe = validateAIRankerOutput(
      parsed,
      new Set(input.candidates.map((candidate) => candidate.propertyId)),
    );

    return {
      ...safe,
      model,
      durationMs: Date.now() - startedAt,
      fallbackApplied: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return deterministicFallback(input, startedAt, message);
  } finally {
    clearTimeout(timeout);
  }
}

