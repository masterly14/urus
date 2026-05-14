/**
 * Tipos cliente para `/platform/captacion/oportunidades`.
 *
 * Sincronizados con `lib/market/properties.ts` (`PropertyClusterDTO`):
 * 1 fila = 1 MarketProperty (cluster cross-portal). Los listings huerfanos
 * sin propertyId aparecen como cluster "virtual" de un solo portal.
 *
 * Para retrocompatibilidad con la UI ya construida, exponemos el cluster con
 * un alias `id = representativeListingId` (la mutacion de captacion, asignacion
 * y CRM siguen operando sobre el listing canonico, no sobre la property).
 */

export interface ClusterPortalEntry {
  source: string;
  listingId: string;
  externalId: string;
  canonicalUrl: string;
  price: number | null;
  pricePerMeter: number | null;
  status: string;
  mainImageUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  listingReference: string | null;
}

export interface ListingOpportunity {
  /**
   * Alias del `representativeListingId` para mantener retrocompat con
   * la UI que muta acciones por listing. Para navegar a la ficha cluster
   * usar `propertyId`.
   */
  id: string;
  /** id del cluster `MarketProperty` o `virtual:<listingId>` si esta huerfano. */
  propertyId: string;
  /** true si el cluster reune al menos 2 portales en una property real. */
  clustered: boolean;
  /** Lista de portales agrupados (siempre >= 1). */
  portals: ClusterPortalEntry[];
  /** Min/max de precio observado entre portales (null si sin precio o coinciden). */
  minPrice: number | null;
  maxPrice: number | null;
  /** (max - min) / min cuando ambos > 0. Util para resaltar oportunidades. */
  priceSpreadPct: number | null;
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
