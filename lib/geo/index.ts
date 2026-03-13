export type {
  LatLng,
  BoundingBox,
  GeoPolygon,
  InmovillaGeoFields,
  GeoResolutionResult,
  NominatimResponse,
} from "./types";

export {
  serializePolygon,
  calculateCenter,
  estimateZoom,
  vertexBounds,
  bboxToPolygon,
  polygonToInmovillaFields,
} from "./format";

export {
  findPredefinedPolygon,
  listPredefinedAliases,
} from "./predefined";

export {
  geocodeWithNominatim,
  clearGeoCache,
  geoCacheSize,
} from "./nominatim";

export {
  resolveGeoPolygon,
  resolveGeoFields,
  emptyGeoFields,
} from "./resolver";
export type { ResolveGeoOptions } from "./resolver";

export {
  buildDemandGeoFields,
} from "./demand-geo";
export type { BuildDemandGeoOptions, DemandGeoResult } from "./demand-geo";

export {
  buildCreateDemandPayload,
} from "./build-demand-payload";
export type { DemandInput, BuildDemandResult } from "./build-demand-payload";
