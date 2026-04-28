import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  coerceMicrositeCuratedProperties,
  type MicrositeCuratedProperty,
} from "@/lib/microsite/selection";

export type VisitInterestContact = {
  kind: "propietario" | "agencia" | "anunciante" | "desconocido";
  name: string | null;
  phones: string[];
  source: "property_current" | "microsite_json";
};

export type VisitInterestProperty = {
  propertyId: string;
  source: "internal" | "external";
  title: string;
  reference: string;
  cadastralReference: string | null;
  address: string;
  city: string | null;
  zone: string | null;
  price: number | null;
  rooms: number | null;
  metersBuilt: number | null;
  portalUrl: string | null;
  contact: VisitInterestContact;
  missingContactPhone: boolean;
  interestedAt: string;
};

export type VisitInterestDemand = {
  demandId: string;
  demandName: string;
  buyerPhone: string;
  comercialId: string | null;
  leadStatus: string;
};

export type VisitInterestPackage = {
  demand: VisitInterestDemand;
  selectionId: string | null;
  properties: VisitInterestProperty[];
};

type DemandRow = {
  codigo: string;
  nombre: string;
  telefono: string;
  comercialId: string | null;
  leadStatus: string;
};

type SelectionRow = {
  id: string;
  properties: Prisma.JsonValue;
  feedbacks: Array<{
    propertyId: string;
    createdAt: Date;
  }>;
};

type PropertyCurrentRow = {
  codigo: string;
  ref: string;
  refCatastral: string | null;
  titulo: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  ciudad: string;
  zona: string;
  propietarioNombre: string | null;
  propietarioPhone: string | null;
  portalUrl: string | null;
};

function cleanString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniquePhones(phones: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const phone of phones) {
    const cleaned = cleanString(phone);
    if (!cleaned) continue;
    const key = cleaned.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function displayAddress(parts: Array<string | null | undefined>): string {
  return parts.map(cleanString).filter((x): x is string => Boolean(x)).join(", ");
}

function mapInternalProperty(
  propertyId: string,
  interestedAt: Date,
  row: PropertyCurrentRow,
): VisitInterestProperty {
  const phones = uniquePhones([row.propietarioPhone]);

  return {
    propertyId,
    source: "internal",
    title: cleanString(row.titulo) ?? cleanString(row.ref) ?? propertyId,
    reference: cleanString(row.ref) ?? propertyId,
    cadastralReference: cleanString(row.refCatastral),
    address: displayAddress([row.zona, row.ciudad]) || "Dirección no disponible",
    city: cleanString(row.ciudad),
    zone: cleanString(row.zona),
    price: row.precio > 0 ? row.precio : null,
    rooms: row.habitaciones > 0 ? row.habitaciones : null,
    metersBuilt: row.metrosConstruidos > 0 ? row.metrosConstruidos : null,
    portalUrl: cleanString(row.portalUrl),
    contact: {
      kind: "propietario",
      name: cleanString(row.propietarioNombre),
      phones,
      source: "property_current",
    },
    missingContactPhone: phones.length === 0,
    interestedAt: interestedAt.toISOString(),
  };
}

function mapExternalProperty(
  propertyId: string,
  interestedAt: Date,
  property: MicrositeCuratedProperty,
): VisitInterestProperty {
  const phones = uniquePhones(property.contactPhones);
  const contactKind = property.advertiserType === "professional"
    ? "agencia"
    : property.advertiserType === "private"
      ? "propietario"
      : "anunciante";

  return {
    propertyId,
    source: "external",
    title: property.title,
    reference: propertyId,
    cadastralReference: null,
    address:
      cleanString(property.address) ??
      (displayAddress([property.zone, property.city]) || "Dirección no disponible"),
    city: cleanString(property.city),
    zone: cleanString(property.zone),
    price: property.price,
    rooms: property.rooms,
    metersBuilt: property.metersBuilt,
    portalUrl: cleanString(property.link),
    contact: {
      kind: contactKind,
      name: cleanString(property.advertiserName),
      phones,
      source: "microsite_json",
    },
    missingContactPhone: phones.length === 0,
    interestedAt: interestedAt.toISOString(),
  };
}

function findCuratedProperty(
  properties: MicrositeCuratedProperty[],
  propertyId: string,
): MicrositeCuratedProperty | null {
  return properties.find((p) => p.propertyId === propertyId) ?? null;
}

export function buildVisitInterestPackageFromRows(input: {
  demand: DemandRow;
  selection: SelectionRow | null;
  propertyCurrents: PropertyCurrentRow[];
}): VisitInterestPackage {
  const propertyCurrentById = new Map(
    input.propertyCurrents.map((property) => [property.codigo, property]),
  );
  const curatedProperties = input.selection
    ? coerceMicrositeCuratedProperties(input.selection.properties)
    : [];

  const feedbacks = input.selection?.feedbacks ?? [];
  const properties = feedbacks
    .map((feedback): VisitInterestProperty | null => {
      const internal = propertyCurrentById.get(feedback.propertyId);
      if (internal) return mapInternalProperty(feedback.propertyId, feedback.createdAt, internal);

      const external = findCuratedProperty(curatedProperties, feedback.propertyId);
      if (external) return mapExternalProperty(feedback.propertyId, feedback.createdAt, external);

      return {
        propertyId: feedback.propertyId,
        source: "external",
        title: feedback.propertyId,
        reference: feedback.propertyId,
        cadastralReference: null,
        address: "Datos de propiedad no disponibles",
        city: null,
        zone: null,
        price: null,
        rooms: null,
        metersBuilt: null,
        portalUrl: null,
        contact: {
          kind: "desconocido",
          name: null,
          phones: [],
          source: "microsite_json",
        },
        missingContactPhone: true,
        interestedAt: feedback.createdAt.toISOString(),
      };
    })
    .filter((property): property is VisitInterestProperty => Boolean(property));

  return {
    demand: {
      demandId: input.demand.codigo,
      demandName: input.demand.nombre,
      buyerPhone: input.demand.telefono,
      comercialId: input.demand.comercialId,
      leadStatus: input.demand.leadStatus,
    },
    selectionId: input.selection?.id ?? null,
    properties,
  };
}

export async function getVisitInterestPackageByDemand(
  demandId: string,
): Promise<VisitInterestPackage | null> {
  const demand = await prisma.demandCurrent.findUnique({
    where: { codigo: demandId },
    select: {
      codigo: true,
      nombre: true,
      telefono: true,
      comercialId: true,
      leadStatus: true,
    },
  });

  if (!demand) return null;

  const selection = await prisma.micrositeSelection.findFirst({
    where: {
      demandId,
      feedbacks: { some: { decision: "ME_INTERESA" } },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      properties: true,
      feedbacks: {
        where: { decision: "ME_INTERESA" },
        select: { propertyId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const propertyIds = selection?.feedbacks.map((feedback) => feedback.propertyId) ?? [];
  const propertyCurrents = propertyIds.length > 0
    ? await prisma.propertyCurrent.findMany({
        where: { codigo: { in: propertyIds } },
        select: {
          codigo: true,
          ref: true,
          refCatastral: true,
          titulo: true,
          precio: true,
          metrosConstruidos: true,
          habitaciones: true,
          ciudad: true,
          zona: true,
          propietarioNombre: true,
          propietarioPhone: true,
          portalUrl: true,
        },
      })
    : [];

  return buildVisitInterestPackageFromRows({
    demand,
    selection,
    propertyCurrents,
  });
}

export async function listVisitInterestPackages(input: {
  comercialId?: string | null;
  limit?: number;
} = {}): Promise<VisitInterestPackage[]> {
  const limit = input.limit ?? 50;
  const selections = await prisma.micrositeSelection.findMany({
    where: {
      ...(input.comercialId ? { comercialId: input.comercialId } : {}),
      feedbacks: { some: { decision: "ME_INTERESA" } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { demandId: true },
    distinct: ["demandId"],
  });

  const packages = await Promise.all(
    selections.map((selection) => getVisitInterestPackageByDemand(selection.demandId)),
  );

  return packages.filter((pkg): pkg is VisitInterestPackage => Boolean(pkg));
}
