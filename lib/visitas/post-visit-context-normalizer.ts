import type { DemandVariables } from "@/lib/agents/types";
import {
  POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD,
  POST_VISIT_NORMALIZER_VERSION,
  type PostVisitStructuredContext,
} from "./post-visit-context-types";

const KNOWN_EXTRAS = [
  "garaje",
  "terraza",
  "balcon",
  "balcón",
  "patio",
  "piscina",
  "ascensor",
  "trastero",
  "luz natural",
  "luminoso",
] as const;

const KNOWN_TYPES: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "piso", patterns: [/\bpiso\b/iu, /\bapartamento\b/iu] },
  { canonical: "casa", patterns: [/\bcasa\b/iu, /\bchalet\b/iu] },
  { canonical: "casa adosada", patterns: [/\badosad[oa]\b/iu] },
  { canonical: "estudio", patterns: [/\bestudio\b/iu, /\bloft\b/iu] },
  { canonical: "ático", patterns: [/\b[aá]tico\b/iu] },
];

const REJECTION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "tamaño insuficiente", pattern: /\b(pequeñ[oa]|se le hizo pequeño|poco espacio|falta espacio)\b/iu },
  { label: "precio alto", pattern: /\b(car[oa]|precio alto|se pasa de presupuesto|muy caro)\b/iu },
  { label: "zona no encaja", pattern: /\b(no le gusta la zona|zona no|otra zona|cambiar de zona)\b/iu },
  { label: "ruido", pattern: /\b(ruido|ruidos[ao]|calle concurrida|mucho trafico|mucho tráfico)\b/iu },
  { label: "poca luz", pattern: /\b(poca luz|oscuro|oscura|sin luz)\b/iu },
  { label: "planta baja", pattern: /\b(planta baja|bajo)\b/iu },
];

function normalizeText(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function toNumber(raw: string): number {
  const normalized = raw.toLowerCase().replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  if (/\b(k|mil|pavos|palos)\b/iu.test(raw) || value < 1000) return Math.round(value * 1000);
  return Math.round(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function setConfidence(
  confidenceByField: PostVisitStructuredContext["confidenceByField"],
  field: keyof DemandVariables | "rejections",
  value: number,
) {
  confidenceByField[field] = Math.max(confidenceByField[field] ?? 0, value);
}

function extractPrice(text: string, variables: DemandVariables, confidence: PostVisitStructuredContext["confidenceByField"]) {
  const between = text.match(/\b(?:entre)\s+(\d+(?:[.,]\d+)?)\s*(?:k|mil|pavos|palos)?\s+(?:y|e)\s+(\d+(?:[.,]\d+)?)\s*(k|mil|pavos|palos)?\b/iu);
  if (between) {
    const suffix = between[3] ? ` ${between[3]}` : "";
    variables.precioMin = toNumber(`${between[1]}${suffix}`);
    variables.precioMax = toNumber(`${between[2]}${suffix}`);
    setConfidence(confidence, "precioMin", 0.92);
    setConfidence(confidence, "precioMax", 0.92);
    return;
  }

  const max = text.match(/\b(?:hasta|máximo|maximo|tope|no pasar de|no más de|no mas de)\s+(\d+(?:[.,]\d+)?)\s*(k|mil|pavos|palos)?\b/iu);
  if (max) {
    variables.precioMax = toNumber(`${max[1]}${max[2] ? ` ${max[2]}` : ""}`);
    setConfidence(confidence, "precioMax", 0.93);
  }

  const min = text.match(/\b(?:desde|mínimo|minimo|al menos)\s+(\d+(?:[.,]\d+)?)\s*(k|mil|pavos|palos)?\b/iu);
  if (min) {
    variables.precioMin = toNumber(`${min[1]}${min[2] ? ` ${min[2]}` : ""}`);
    setConfidence(confidence, "precioMin", 0.88);
  }

  const budget = text.match(/\b(?:presupuesto|budget)\D{0,20}(\d+(?:[.,]\d+)?)\s*(k|mil|pavos|palos)?\b/iu);
  if (budget && variables.precioMax == null) {
    variables.precioMax = toNumber(`${budget[1]}${budget[2] ? ` ${budget[2]}` : ""}`);
    setConfidence(confidence, "precioMax", 0.86);
  }
}

function extractRoomsMeters(text: string, variables: DemandVariables, confidence: PostVisitStructuredContext["confidenceByField"]) {
  const rooms = text.match(/\b(?:mínimo|minimo|al menos|necesita|quiere|busca)?\s*(\d+)\s*(?:habitaciones|dormitorios|cuartos|hab)\b/iu);
  if (rooms) {
    variables.habitacionesMin = Number.parseInt(rooms[1], 10);
    setConfidence(confidence, "habitacionesMin", 0.9);
  }

  const metersMin = text.match(/\b(?:mínimo|minimo|al menos|desde|más de|mas de)\s*(\d+)\s*(?:m2|m²|metros)\b/iu);
  if (metersMin) {
    variables.metrosMin = Number.parseInt(metersMin[1], 10);
    setConfidence(confidence, "metrosMin", 0.9);
  }

  const metersMax = text.match(/\b(?:máximo|maximo|hasta|no más de|no mas de)\s*(\d+)\s*(?:m2|m²|metros)\b/iu);
  if (metersMax) {
    variables.metrosMax = Number.parseInt(metersMax[1], 10);
    setConfidence(confidence, "metrosMax", 0.9);
  }
}

function extractZones(text: string, variables: DemandVariables, confidence: PostVisitStructuredContext["confidenceByField"]) {
  const city = text.match(/\b(?:ciudad|en)\s+(cordoba|córdoba|sevilla|madrid|malaga|málaga)\b/iu);
  if (city) {
    variables.ciudad = city[1].replace(/^cordoba$/iu, "Córdoba").replace(/^malaga$/iu, "Málaga");
    setConfidence(confidence, "ciudad", 0.86);
  }

  const zoneMatches = [...text.matchAll(/\b(?:zona|barrio|por|en)\s+([a-záéíóúñü\s]{3,35})(?=,|\.|;|\sy\s|\spero\s|\scon\s|$)/giu)];
  const zones = zoneMatches
    .map((match) => match[1].trim())
    .filter((zone) => !/^(cordoba|córdoba|sevilla|madrid|malaga|málaga)$/iu.test(zone))
    .map((zone) => zone.replace(/\b\w/g, (char) => char.toUpperCase()));
  if (zones.length > 0) {
    variables.zonas = unique([...(variables.zonas ?? []), ...zones]);
    setConfidence(confidence, "zonas", 0.82);
  }
}

function extractTypes(text: string, variables: DemandVariables, confidence: PostVisitStructuredContext["confidenceByField"]) {
  const types = KNOWN_TYPES
    .filter((type) => type.patterns.some((pattern) => pattern.test(text)))
    .filter((type) => !new RegExp(`\\b(?:no|evitar|descarta|sin)\\s+${type.canonical}\\b`, "iu").test(text))
    .map((type) => type.canonical);
  if (types.length > 0) {
    variables.tipos = unique(types);
    setConfidence(confidence, "tipos", 0.86);
  }
}

function extractExtras(text: string, variables: DemandVariables, confidence: PostVisitStructuredContext["confidenceByField"]) {
  const desired: string[] = [];
  const rejected: string[] = [];

  for (const extra of KNOWN_EXTRAS) {
    const canonical = extra === "balcón" ? "balcon" : extra;
    const extraPattern = extra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(?:sin|no quiere|evitar|descarta)\\s+(?:[^.,;]{0,15}\\s)?${extraPattern}\\b`, "iu").test(text)) {
      rejected.push(canonical);
      continue;
    }
    if (new RegExp(`\\b(?:con|quiere|busca|prioriza|necesita|valora)\\s+(?:[^.,;]{0,15}\\s)?${extraPattern}\\b|\\b${extraPattern}\\b`, "iu").test(text)) {
      desired.push(canonical);
    }
  }

  if (desired.length > 0) {
    variables.extras = unique(desired);
    setConfidence(confidence, "extras", 0.78);
  }
  if (rejected.length > 0) {
    variables.extrasNoDeseados = unique(rejected);
    setConfidence(confidence, "extrasNoDeseados", 0.8);
  }
}

function extractRejections(text: string, confidence: PostVisitStructuredContext["confidenceByField"]): string[] {
  const rejections = REJECTION_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.label);
  if (rejections.length > 0) setConfidence(confidence, "rejections", 0.78);
  return unique(rejections);
}

function buildSummary(variables: DemandVariables, rejections: string[]): string {
  const parts: string[] = [];
  if (variables.precioMax != null) parts.push(`tope ${variables.precioMax.toLocaleString("es-ES")} EUR`);
  if (variables.habitacionesMin != null) parts.push(`mínimo ${variables.habitacionesMin} habitaciones`);
  if (variables.metrosMin != null) parts.push(`desde ${variables.metrosMin} m2`);
  if (variables.zonas?.length) parts.push(`zonas: ${variables.zonas.join(", ")}`);
  if (variables.tipos?.length) parts.push(`tipo: ${variables.tipos.join(", ")}`);
  if (variables.extras?.length) parts.push(`valora ${variables.extras.join(", ")}`);
  if (rejections.length) parts.push(`no encajó por ${rejections.join(", ")}`);
  return parts.length ? parts.join("; ") : "Contexto comercial sin variables estructuradas claras";
}

export function normalizePostVisitContext(rawText: string): PostVisitStructuredContext | null {
  const text = normalizeText(rawText);
  if (!text) return null;

  const variables: DemandVariables = {};
  const confidenceByField: PostVisitStructuredContext["confidenceByField"] = {};

  extractPrice(text, variables, confidenceByField);
  extractRoomsMeters(text, variables, confidenceByField);
  extractZones(text, variables, confidenceByField);
  extractTypes(text, variables, confidenceByField);
  extractExtras(text, variables, confidenceByField);
  const rejections = extractRejections(text, confidenceByField);

  const hardConstraints: PostVisitStructuredContext["hardConstraints"] = {
    ...(variables.precioMin != null && { precioMin: variables.precioMin }),
    ...(variables.precioMax != null && { precioMax: variables.precioMax }),
    ...(variables.metrosMin != null && { metrosMin: variables.metrosMin }),
    ...(variables.metrosMax != null && { metrosMax: variables.metrosMax }),
    ...(variables.habitacionesMin != null && { habitacionesMin: variables.habitacionesMin }),
    ...(variables.ciudad && { ciudad: variables.ciudad }),
    ...(variables.zonas?.length && { zonas: variables.zonas }),
    ...(variables.tipos?.length && { tipos: variables.tipos }),
  };
  const softPreferences: PostVisitStructuredContext["softPreferences"] = {
    ...(variables.extras?.length && { extras: variables.extras }),
    ...(variables.extrasNoDeseados?.length && { extrasNoDeseados: variables.extrasNoDeseados }),
  };

  const autoPromotableVariables = Object.fromEntries(
    Object.entries(hardConstraints).filter(([field]) => {
      const confidence = confidenceByField[field as keyof DemandVariables] ?? 0;
      return confidence >= POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD;
    }),
  ) as DemandVariables;

  const requiresBuyerConfirmation = unique([
    ...Object.keys(softPreferences),
    ...Object.keys(hardConstraints).filter((field) => {
      const confidence = confidenceByField[field as keyof DemandVariables] ?? 0;
      return confidence < POST_VISIT_AUTO_UPDATE_CONFIDENCE_THRESHOLD;
    }),
    ...(rejections.length > 0 ? ["rejections"] : []),
  ]) as Array<keyof DemandVariables | "rejections">;

  const ambiguities = requiresBuyerConfirmation.map((field) =>
    field === "rejections"
      ? "Motivos de rechazo detectados requieren confirmación del comprador"
      : `Confirmar ${String(field)} con el comprador`,
  );

  return {
    source: "commercial_post_visit",
    rawText: text,
    summary: buildSummary(variables, rejections),
    hardConstraints,
    softPreferences,
    rejections,
    ambiguities,
    confidenceByField,
    autoPromotableVariables,
    requiresBuyerConfirmation,
    normalizedAt: new Date().toISOString(),
    normalizerVersion: POST_VISIT_NORMALIZER_VERSION,
  };
}
