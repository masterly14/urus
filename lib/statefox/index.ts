/**
 * Cliente API REST de Statefox (solo lectura).
 * statefox.com/public/aapi/props — Bearer token.
 */

export {
  createStatefoxClient,
  getProperties,
  getSnapshot,
  type StatefoxClient,
  type StatefoxClientConfig,
} from "./client";

export type {
  GetPropertiesFilters,
  GetPropertiesResponse,
  GetSnapshotParams,
  GetSnapshotResponse,
  StatefoxProperty,
  StatefoxPropertiesMeta,
  StatefoxSnapshotProperty,
  StatefoxSnapshotMeta,
  StatefoxSource,
  StatefoxListingType,
  StatefoxHousing,
  StatefoxSnapshotStatus,
} from "./types";

export {
  buildStatefoxQuery,
  mapTiposToHousing,
  parseLocationKeywords,
  matchesStatefoxFilters,
  filterStatefoxResults,
} from "./query-builder";

export type {
  DemandFilterInput,
  StatefoxQueryParams,
  StatefoxResultFilters,
  StatefoxDemandQuery,
} from "./query-builder";
