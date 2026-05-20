import type { Prisma, PrismaClient } from "@prisma/client";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest";
import {
  createProperty,
  getKeyLocaByCiudad,
  getKeyTipoByNombre,
  getKeyZonaByZonaAndKeyLoca,
  safeUpdateProperty,
  type CreatePropertyPayload,
} from "@/lib/inmovilla/rest";
import { prisma } from "@/lib/prisma";

const HOUSING_TYPE_TO_INMOVILLA_NAME: Record<string, string> = {
  flat: "Piso",
  house: "Casa",
  countryhouse: "Casa de campo",
  duplex: "Duplex",
  penthouse: "Ático",
  studio: "Estudio",
  loft: "Loft",
  garage: "Garaje",
  office: "Oficina",
  premises: "Local comercial",
  land: "Terreno",
  building: "Edificio",
  storage: "Trastero",
  warehouse: "Nave industrial",
  room: "Habitación",
};

export class CaptacionServiceError extends Error {
  code:
    | "NOT_FOUND"
    | "IN_PROGRESS"
    | "INVALID_STAGE"
    | "INVALID_INPUT"
    | "MISSING_INMOVILLA_REF"
    | "EXTERNAL_ERROR";
  status: number;

  constructor(
    code: CaptacionServiceError["code"],
    message: string,
    status = 400,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type ListingForCaptacion = Prisma.MarketListingGetPayload<{
  include: {
    advertiser: {
      select: {
        displayName: true;
        inmovillaContactId: true;
      };
    };
  };
}>;

export type CreateProspectoFromListingInput = {
  listingId: string;
  actorUserId: string;
  keyLoca?: number;
  keyTipo?: number;
  keyZona?: number | null;
  keyAcci?: number;
  ref?: string;
  precioInmo?: number;
  banyos?: number;
  habitaciones?: number;
  calle?: string;
  numero?: number;
  planta?: number | string;
  fotos?: Record<string, { url: string; posicion?: number }>;
};

export type PromoteProspectoToPropertyInput = {
  listingId: string;
  actorUserId: string;
  keyLoca?: number;
  keyTipo?: number;
  keyZona?: number | null;
  precioInmo?: number;
  banyos?: number;
  habitaciones?: number;
  calle?: string;
  numero?: number;
  planta?: number | string;
  fotos?: Record<string, { url: string; posicion?: number }>;
  tituloes?: string;
  descripciones?: string;
};

export type CaptacionActionResult = {
  ok: true;
  status: "CREATED" | "UPDATED" | "ALREADY_DONE";
  stage:
    | "PROSPECT_CREATED"
    | "PROPERTY_CREATED"
    | "PROSPECT_CREATING"
    | "PROPERTY_CREATING";
  ref: string | null;
  codOfer: number | null;
};

export async function createProspectoFromListing(
  input: CreateProspectoFromListingInput,
): Promise<CaptacionActionResult> {
  const listing = await markListingCreating(input.listingId, "PROSPECT_CREATING");

  if (
    listing.captacionStage === "PROSPECT_CREATED" &&
    (listing.inmovillaProspectRef || listing.inmovillaPropertyCodOfer != null)
  ) {
    return {
      ok: true,
      status: "ALREADY_DONE",
      stage: "PROSPECT_CREATED",
      ref: listing.inmovillaProspectRef ?? null,
      codOfer: listing.inmovillaPropertyCodOfer ?? null,
    };
  }

  const build = await buildProspectPayload(listing, input);
  const client = createInmovillaRestClient();

  try {
    const response = await createProperty(client, build.payload);
    const codOfer =
      typeof response.cod_ofer === "number" ? response.cod_ofer : null;
    await finalizeListingStage(input.listingId, {
      stage: "PROSPECT_CREATED",
      prospectSentByUserId: input.actorUserId,
      prospectSentAt: new Date(),
      inmovillaProspectRef: build.ref,
      inmovillaPropertyCodOfer: codOfer,
      captacionLastError: null,
    });
    return {
      ok: true,
      status: "CREATED",
      stage: "PROSPECT_CREATED",
      ref: build.ref,
      codOfer,
    };
  } catch (error) {
    await markListingFailed(input.listingId, error);
    throw new CaptacionServiceError(
      "EXTERNAL_ERROR",
      toErrorMessage(error),
      502,
    );
  }
}

export async function promoteProspectoToProperty(
  input: PromoteProspectoToPropertyInput,
): Promise<CaptacionActionResult> {
  const listing = await markListingCreating(input.listingId, "PROPERTY_CREATING");

  if (
    listing.captacionStage === "PROPERTY_CREATED" &&
    listing.inmovillaPropertyCodOfer != null
  ) {
    return {
      ok: true,
      status: "ALREADY_DONE",
      stage: "PROPERTY_CREATED",
      ref: listing.inmovillaProspectRef ?? null,
      codOfer: listing.inmovillaPropertyCodOfer,
    };
  }

  if (
    listing.captacionStage !== "PROSPECT_CREATED" &&
    listing.captacionStage !== "READY_FOR_PROPERTY" &&
    listing.captacionStage !== "ENCARGO_ATTACHED"
  ) {
    throw new CaptacionServiceError(
      "INVALID_STAGE",
      `No se puede promover listing desde stage ${listing.captacionStage}.`,
      409,
    );
  }

  const ref = listing.inmovillaProspectRef;
  const codOfer = listing.inmovillaPropertyCodOfer;
  if (!ref && codOfer == null) {
    throw new CaptacionServiceError(
      "MISSING_INMOVILLA_REF",
      "El listing no tiene referencia Inmovilla para promoción.",
      409,
    );
  }

  const updatePatch = await buildPromotePatch(listing, input);
  const client = createInmovillaRestClient();

  try {
    const result = await safeUpdateProperty(
      client,
      { ref: ref ?? undefined, codOfer: codOfer ?? undefined },
      updatePatch,
      { maxAttempts: 12 },
    );
    const nextCod =
      result.response && typeof result.response.cod_ofer === "number"
        ? result.response.cod_ofer
        : codOfer ?? null;
    await finalizeListingStage(input.listingId, {
      stage: "PROPERTY_CREATED",
      inmovillaProspectRef: ref ?? null,
      inmovillaPropertyCodOfer: nextCod,
      captacionLastError: null,
    });
    return {
      ok: true,
      status: "UPDATED",
      stage: "PROPERTY_CREATED",
      ref: ref ?? null,
      codOfer: nextCod,
    };
  } catch (error) {
    await markListingFailed(input.listingId, error);
    throw new CaptacionServiceError(
      "EXTERNAL_ERROR",
      toErrorMessage(error),
      502,
    );
  }
}

async function markListingCreating(
  listingId: string,
  stage: "PROSPECT_CREATING" | "PROPERTY_CREATING",
): Promise<ListingForCaptacion> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "market_listings" WHERE id = ${listingId} FOR UPDATE`;
    const listing = await tx.marketListing.findUnique({
      where: { id: listingId },
      include: {
        advertiser: {
          select: {
            displayName: true,
            inmovillaContactId: true,
          },
        },
      },
    });
    if (!listing) {
      throw new CaptacionServiceError(
        "NOT_FOUND",
        "MarketListing no encontrado.",
        404,
      );
    }
    if (
      listing.captacionStage === "PROSPECT_CREATING" ||
      listing.captacionStage === "PROPERTY_CREATING"
    ) {
      throw new CaptacionServiceError(
        "IN_PROGRESS",
        "El listing ya tiene una operación de captación en curso.",
        409,
      );
    }
    await tx.marketListing.update({
      where: { id: listingId },
      data: {
        captacionStage: stage,
        captacionLastError: null,
        captacionUpdatedAt: new Date(),
      },
    });
    return listing;
  });
}

async function finalizeListingStage(
  listingId: string,
  data: {
    stage:
      | "PROSPECT_CREATED"
      | "PROPERTY_CREATED"
      | "READY_FOR_PROPERTY"
      | "ENCARGO_ATTACHED";
    prospectSentByUserId?: string | null;
    prospectSentAt?: Date | null;
    inmovillaProspectRef: string | null;
    inmovillaPropertyCodOfer: number | null;
    captacionLastError: string | null;
  },
) {
  await prisma.marketListing.update({
    where: { id: listingId },
    data: {
      captacionStage: data.stage,
      captacionProspectSentByUserId: data.prospectSentByUserId,
      captacionProspectSentAt: data.prospectSentAt,
      inmovillaProspectRef: data.inmovillaProspectRef,
      inmovillaPropertyCodOfer: data.inmovillaPropertyCodOfer,
      captacionLastError: data.captacionLastError,
      captacionUpdatedAt: new Date(),
    },
  });
}

async function markListingFailed(listingId: string, error: unknown) {
  await prisma.marketListing.update({
    where: { id: listingId },
    data: {
      captacionStage: "FAILED",
      captacionLastError: toErrorMessage(error),
      captacionUpdatedAt: new Date(),
    },
  });
}

async function buildProspectPayload(
  listing: ListingForCaptacion,
  input: CreateProspectoFromListingInput,
): Promise<{ payload: CreatePropertyPayload; ref: string }> {
  const keyLoca =
    input.keyLoca ??
    (await getKeyLocaByCiudad(prisma as unknown as PrismaClient, {
      ciudadNombre: listing.city,
    }));

  let keyTipo = input.keyTipo ?? null;
  if (keyTipo == null) {
    const inmovillaName = HOUSING_TYPE_TO_INMOVILLA_NAME[listing.housingType];
    if (inmovillaName) {
      keyTipo = await getKeyTipoByNombre(
        prisma as unknown as PrismaClient,
        inmovillaName,
      );
    }
  }

  if (keyLoca == null) {
    throw new CaptacionServiceError(
      "INVALID_INPUT",
      "No se pudo resolver key_loca; completa la ciudad/catálogo para crear prospecto.",
      422,
    );
  }
  if (keyTipo == null) {
    throw new CaptacionServiceError(
      "INVALID_INPUT",
      "No se pudo resolver key_tipo; completa la tipología para crear prospecto.",
      422,
    );
  }

  const keyZona =
    input.keyZona ??
    (listing.zone
      ? await getKeyZonaByZonaAndKeyLoca(
          prisma as unknown as PrismaClient,
          listing.zone,
          keyLoca,
        )
      : null);

  const keyAcci = input.keyAcci ?? mapOperationToKeyAcci(listing.operation);
  const ref =
    input.ref?.trim() ||
    listing.inmovillaProspectRef ||
    buildProspectRef(listing.source, listing.externalId, listing.id);

  const payload: CreatePropertyPayload = {
    ref,
    keyacci: keyAcci,
    key_tipo: keyTipo,
    key_loca: keyLoca,
    prospecto: true,
    nodisponible: false,
    precioinmo:
      input.precioInmo ?? listing.price ?? 0,
    banyos: input.banyos ?? listing.bathrooms ?? undefined,
    habitaciones: input.habitaciones ?? listing.rooms ?? undefined,
    calle: input.calle ?? listing.addressApprox ?? undefined,
    numero: input.numero,
    planta: input.planta != null ? Number(input.planta) : undefined,
    key_zona: keyZona ?? undefined,
    fotos: input.fotos ?? buildFotosFromListing(listing.imageUrls),
  };

  return { payload, ref };
}

async function buildPromotePatch(
  listing: ListingForCaptacion,
  input: PromoteProspectoToPropertyInput,
): Promise<Record<string, unknown>> {
  let keyLoca = input.keyLoca ?? null;
  if (keyLoca == null) {
    keyLoca = await getKeyLocaByCiudad(prisma as unknown as PrismaClient, {
      ciudadNombre: listing.city,
    });
  }

  let keyTipo = input.keyTipo ?? null;
  if (keyTipo == null) {
    const inmovillaName = HOUSING_TYPE_TO_INMOVILLA_NAME[listing.housingType];
    if (inmovillaName) {
      keyTipo = await getKeyTipoByNombre(
        prisma as unknown as PrismaClient,
        inmovillaName,
      );
    }
  }

  const keyZona =
    input.keyZona ??
    (listing.zone && keyLoca != null
      ? await getKeyZonaByZonaAndKeyLoca(
          prisma as unknown as PrismaClient,
          listing.zone,
          keyLoca,
        )
      : null);

  return {
    prospecto: false,
    nodisponible: false,
    keyacci: mapOperationToKeyAcci(listing.operation),
    key_loca: keyLoca ?? undefined,
    key_tipo: keyTipo ?? undefined,
    key_zona: keyZona ?? undefined,
    precioinmo: input.precioInmo ?? listing.price ?? undefined,
    banyos: input.banyos ?? listing.bathrooms ?? undefined,
    habitaciones: input.habitaciones ?? listing.rooms ?? undefined,
    calle: input.calle ?? listing.addressApprox ?? undefined,
    numero: input.numero,
    planta: input.planta != null ? Number(input.planta) : undefined,
    fotos: input.fotos ?? buildFotosFromListing(listing.imageUrls),
    tituloes: input.tituloes,
    descripciones: input.descripciones,
  };
}

/**
 * Construye el record `fotos` que Inmovilla espera a partir de la galería ya
 * capturada en el listing (scraping del portal). Sólo se usa cuando el
 * comercial no envía fotos manualmente; en ese caso las del portal son la
 * fuente correcta para no obligar al comercial a republicarlas a mano.
 *
 * Devuelve `undefined` si no hay fotos para no enviar la clave (mantiene el
 * payload limpio y compatible con la API de Inmovilla).
 */
function buildFotosFromListing(
  imageUrls: string[] | null | undefined,
): Record<string, { url: string; posicion: number }> | undefined {
  if (!imageUrls || imageUrls.length === 0) return undefined;
  const out: Record<string, { url: string; posicion: number }> = {};
  imageUrls.forEach((url, idx) => {
    if (typeof url !== "string" || url.trim().length === 0) return;
    const position = idx + 1;
    out[String(position)] = { url, posicion: position };
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

function mapOperationToKeyAcci(operation: string): number {
  if (operation === "rent") return 2;
  return 1;
}

function buildProspectRef(source: string, externalId: string, listingId: string): string {
  const safeSource = source.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const safeExternal = (externalId || "").replace(/[^a-z0-9]/gi, "").slice(0, 10);
  const safeListing = listingId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  return `MK-${safeSource}-${safeExternal || safeListing}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof CaptacionServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
