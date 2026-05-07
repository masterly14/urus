/**
 * Tipos cliente para `/platform/captacion/oportunidades`.
 *
 * Sincronizados con `lib/market/listings.ts` (`ListingOpportunityDTO`).
 * Se duplican aqui para no arrastrar Prisma a componentes client.
 */

export interface ListingOpportunity {
  id: string;
  source: string;
  operation: string;
  housingType: string;
  status: string;
  canonicalUrl: string;

  addressApprox: string | null;
  city: string;
  zone: string | null;
  lat: number | null;
  lng: number | null;

  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;

  price: number | null;
  pricePerMeter: number | null;
  currency: string;

  mainImageUrl: string | null;
  /** URLs originales (del portal) de TODAS las fotos del inmueble. */
  imageUrls: string[];

  /** Descripcion completa de la ficha. Null hasta que MARKET_FETCH_DETAIL la rellene. */
  description: string | null;
  /** Codigo interno del anunciante en el portal (ej. VES250414SM). */
  listingReference: string | null;
  /** Referencia catastral oficial (20 chars). Solo cuando aparece. */
  cadastralRef: string | null;
  /** Fecha en que se enriquecio el detalle por ultima vez. Null = nunca. */
  detailFetchedAt: string | null;

  phoneCanonical: string | null;
  advertiserId: string | null;
  advertiserDisplayName: string | null;
  advertiserType: "particular" | "agency" | null;
  inmovillaContactId: string | null;
  assignedComercialId: string | null;
  assignedComercialNombre: string | null;
  assignedAt: string | null;
  captacionStage:
    | "NEW"
    | "PROSPECT_CREATING"
    | "PROSPECT_CREATED"
    | "ENCARGO_ATTACHED"
    | "READY_FOR_PROPERTY"
    | "PROPERTY_CREATING"
    | "PROPERTY_CREATED"
    | "FAILED";
  inmovillaProspectRef: string | null;
  inmovillaPropertyCodOfer: number | null;
  captacionLastError: string | null;
  captacionUpdatedAt: string;

  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ListingsApiResponse {
  ok: true;
  items: ListingOpportunity[];
  cursor: string | null;
  meta: {
    totalEstimated: number;
    polygonApplied: boolean;
    sourcesWithoutCoords: string[];
    freshAt: string;
  };
}

export type LngLat = [number, number];
