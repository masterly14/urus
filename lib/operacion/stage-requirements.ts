import type { OperacionEstado } from "@prisma/client";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface StageRequirementField {
  field: string;
  label: string;
  source: "operacion" | "inmovilla_property" | "inmovilla_client" | "manual";
}

export interface MissingFieldResult {
  field: string;
  label: string;
  source: StageRequirementField["source"];
}

// ---------------------------------------------------------------------------
// Requisitos por etapa — sólo etapas que generan documento
// ---------------------------------------------------------------------------

export const STAGE_REQUIREMENTS: Partial<
  Record<OperacionEstado, StageRequirementField[]>
> = {
  OFERTA_FIRME: [
    { field: "buyer.fullName", label: "Nombre completo del comprador", source: "inmovilla_client" },
    { field: "buyer.nationalId", label: "DNI del comprador", source: "inmovilla_client" },
    { field: "property.addressLine", label: "Dirección del inmueble", source: "inmovilla_property" },
    { field: "property.cadastralReference", label: "Referencia catastral", source: "inmovilla_property" },
    { field: "offeredPrice", label: "Precio ofrecido", source: "manual" },
    { field: "offerDeposit", label: "Depósito de oferta", source: "manual" },
  ],
  RESERVA: [
    { field: "buyer.fullName", label: "Nombre del comprador", source: "inmovilla_client" },
    { field: "buyer.nationalId", label: "DNI del comprador", source: "inmovilla_client" },
    { field: "property.addressLine", label: "Dirección del inmueble", source: "inmovilla_property" },
    { field: "senalAmount", label: "Importe de señal", source: "manual" },
    { field: "offeredPrice", label: "Precio ofrecido", source: "manual" },
    { field: "timelines.businessDaysToArrasContract", label: "Días hábiles para arras", source: "manual" },
  ],
  ARRAS: [
    { field: "buyers[].fullName", label: "Nombre(s) comprador(es)", source: "inmovilla_client" },
    { field: "buyers[].nationalId", label: "DNI(s) comprador(es)", source: "inmovilla_client" },
    { field: "buyers[].fiscalAddress", label: "Domicilio fiscal comprador(es)", source: "inmovilla_client" },
    { field: "sellers[].fullName", label: "Nombre(s) vendedor(es)", source: "inmovilla_client" },
    { field: "sellers[].nationalId", label: "DNI(s) vendedor(es)", source: "inmovilla_client" },
    { field: "totalPurchasePrice", label: "Precio total de compraventa", source: "manual" },
    { field: "arrasAmount", label: "Importe de arras", source: "manual" },
    { field: "arrasPaymentAccount.iban", label: "IBAN para arras", source: "manual" },
    { field: "timelines.maxDeedDateIso", label: "Fecha límite escritura", source: "manual" },
  ],
};

// ---------------------------------------------------------------------------
// Resolución de valor en objetos con dot-notation y array paths
// ---------------------------------------------------------------------------

function resolveField(
  data: Record<string, unknown>,
  path: string,
): unknown {
  // "buyers[].fullName" → check if array "buyers" has at least one entry with "fullName"
  const arrayMatch = path.match(/^(\w+)\[\]\.(.+)$/);
  if (arrayMatch) {
    const [, arrayKey, subKey] = arrayMatch;
    const arr = data[arrayKey];
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return arr.some((item) => {
      if (!item || typeof item !== "object") return false;
      const val = (item as Record<string, unknown>)[subKey];
      return val !== undefined && val !== null && val !== "";
    })
      ? true
      : undefined;
  }

  const parts = path.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return value > 0;
  return true;
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

/**
 * Valida que `availableData` contenga todos los campos requeridos para
 * `targetStage`. Retorna los campos faltantes; lista vacía = todo OK.
 *
 * `availableData` se construye mergeando datos de Neon, Inmovilla REST
 * y los datos manuales que el comercial ingresa en el formulario.
 */
export function validateStageRequirements(
  targetStage: OperacionEstado,
  availableData: Record<string, unknown>,
): MissingFieldResult[] {
  const requirements = STAGE_REQUIREMENTS[targetStage];
  if (!requirements) return [];

  const missing: MissingFieldResult[] = [];
  for (const req of requirements) {
    const value = resolveField(availableData, req.field);
    if (!isPresent(value)) {
      missing.push({
        field: req.field,
        label: req.label,
        source: req.source,
      });
    }
  }
  return missing;
}

/**
 * Retorna los requisitos de todas las etapas saltadas más la etapa destino.
 * Útil para el flujo de "force" donde se saltan etapas intermedias.
 */
export function requirementsForSkippedAndTarget(
  skipped: OperacionEstado[],
  target: OperacionEstado,
): StageRequirementField[] {
  const allStages = [...skipped, target];
  const seen = new Set<string>();
  const result: StageRequirementField[] = [];

  for (const stage of allStages) {
    const reqs = STAGE_REQUIREMENTS[stage];
    if (!reqs) continue;
    for (const req of reqs) {
      if (!seen.has(req.field)) {
        seen.add(req.field);
        result.push(req);
      }
    }
  }

  return result;
}
