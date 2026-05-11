import type { Operacion, OperacionEstado } from "@prisma/client";
import {
  BUYER_CLIENT_ID_KEYS,
  SELLER_CLIENT_ID_KEYS,
  asRecord,
  cleanString,
  createDefaultExtractionDeps,
  mapClientToPerson,
  pickClientCode,
  resolvePropertyData,
  type ExtractionDeps,
} from "@/lib/contracts/extraction/shared";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Datos ya conocidos (Neon + Inmovilla REST) modelados con la misma forma
 * que `STAGE_REQUIREMENTS` espera (rutas con punto y `[]`).
 *
 * Los campos que no se pudieron resolver se devuelven como `undefined`
 * (no como cadena vacía / objeto vacío) para que el validador los detecte
 * como faltantes y la UI los solicite al usuario.
 */
export interface ResolvedStageData {
  buyer?: {
    fullName?: string;
    nationalId?: string;
    fiscalAddress?: string;
  };
  buyers?: Array<{
    fullName?: string;
    nationalId?: string;
    fiscalAddress?: string;
  }>;
  sellers?: Array<{
    fullName?: string;
    nationalId?: string;
    fiscalAddress?: string;
  }>;
  property?: {
    addressLine?: string;
    cadastralReference?: string;
  };
}

export interface ResolveStageDataParams {
  operacion: Pick<
    Operacion,
    "propertyCode" | "demandId" | "buyerClientId" | "sellerClientId"
  >;
  targetEstado: OperacionEstado;
  deps?: ExtractionDeps;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAGES_NEEDING_SELLER: ReadonlySet<OperacionEstado> = new Set(["ARRAS"]);

function parseNumericClientId(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  return null;
}

function sanitizePerson(person: {
  fullName: string;
  nationalId: string;
  fiscalAddress: { streetLine: string };
}): ResolvedStageData["buyer"] | undefined {
  const fullName = cleanString(person.fullName);
  const nationalId = cleanString(person.nationalId);
  const street = cleanString(person.fiscalAddress?.streetLine);
  if (!fullName && !nationalId && !street) return undefined;

  const out: NonNullable<ResolvedStageData["buyer"]> = {};
  if (fullName) out.fullName = fullName;
  if (nationalId) out.nationalId = nationalId;
  if (street) out.fiscalAddress = street;
  return out;
}

function sanitizeProperty(property: {
  addressLine: string;
  cadastralReference: string;
}): ResolvedStageData["property"] | undefined {
  const addressLine = cleanString(property.addressLine);
  const cadastralReference = cleanString(property.cadastralReference);
  if (!addressLine && !cadastralReference) return undefined;

  const out: NonNullable<ResolvedStageData["property"]> = {};
  if (addressLine) out.addressLine = addressLine;
  if (cadastralReference) out.cadastralReference = cadastralReference;
  return out;
}

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * Resuelve los datos del comprador, vendedor (si aplica) y propiedad que ya
 * existen en Neon e Inmovilla REST para una operación dada.
 *
 * El resultado se devuelve con la forma esperada por `STAGE_REQUIREMENTS`
 * (paths como `buyer.fullName`, `buyers[].fiscalAddress`, etc.). Si un
 * campo no se pudo resolver, no aparece en el objeto — así
 * `validateStageRequirements` lo reporta como faltante y la UI lo pide.
 *
 * Se priorizan los códigos de cliente almacenados directamente en la
 * operación (`buyerClientId` / `sellerClientId`); si no están disponibles,
 * se intenta deducir desde la demanda en Neon (comprador) o desde el
 * inmueble en Neon/Inmovilla (vendedor).
 */
export async function resolveStageDataForOperacion(
  params: ResolveStageDataParams,
): Promise<ResolvedStageData> {
  const { operacion, targetEstado } = params;
  const deps = params.deps ?? createDefaultExtractionDeps();
  const needsSeller = STAGES_NEEDING_SELLER.has(targetEstado);

  const [neonDemand, neonProperty, inmovillaProperty] = await Promise.all([
    operacion.demandId
      ? deps.getDemandFromNeon(operacion.demandId)
      : Promise.resolve(null),
    deps.getPropertyFromNeon(operacion.propertyCode),
    deps.getInmovillaProperty(operacion.propertyCode),
  ]);

  let buyerClientCode = parseNumericClientId(operacion.buyerClientId);
  if (!buyerClientCode && neonDemand) {
    buyerClientCode = pickClientCode(asRecord(neonDemand.raw), BUYER_CLIENT_ID_KEYS);
  }

  let sellerClientCode: number | null = null;
  if (needsSeller) {
    sellerClientCode = parseNumericClientId(operacion.sellerClientId);
    if (!sellerClientCode) {
      sellerClientCode =
        pickClientCode(asRecord(inmovillaProperty), SELLER_CLIENT_ID_KEYS) ??
        pickClientCode(asRecord(neonProperty?.raw), SELLER_CLIENT_ID_KEYS);
    }
  }

  const [buyerClient, sellerClient] = await Promise.all([
    buyerClientCode ? deps.getInmovillaClient(buyerClientCode) : Promise.resolve(null),
    sellerClientCode ? deps.getInmovillaClient(sellerClientCode) : Promise.resolve(null),
  ]);

  const fallbackCity = cleanString(neonProperty?.ciudad);
  const buyerPerson = mapClientToPerson(
    buyerClient,
    cleanString(neonDemand?.nombre),
    fallbackCity,
  );
  const sellerPerson = needsSeller
    ? mapClientToPerson(
        sellerClient,
        cleanString(asRecord(neonProperty?.raw).propietario),
        fallbackCity,
      )
    : null;

  const propertyData = resolvePropertyData(inmovillaProperty, neonProperty);

  const buyer = sanitizePerson(buyerPerson);
  const seller = sellerPerson ? sanitizePerson(sellerPerson) : undefined;
  const property = sanitizeProperty(propertyData);

  const result: ResolvedStageData = {};
  if (buyer) {
    result.buyer = buyer;
    result.buyers = [buyer];
  }
  if (seller) {
    result.sellers = [seller];
  }
  if (property) {
    result.property = property;
  }
  return result;
}
