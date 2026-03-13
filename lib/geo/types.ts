/**
 * Tipos para el módulo de geocoding y polígonos geoespaciales.
 *
 * Formato Inmovilla para polígonos: `;lat1+lng1,lat2+lng2,...`
 * - Prefijo `;` obligatorio
 * - Vértices separados por `,`
 * - Coordenadas lat/lng separadas por `+`
 */

export type LatLng = {
  lat: number;
  lng: number;
};

export type BoundingBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type GeoPolygon = {
  vertices: LatLng[];
  center: LatLng;
  zoom: number;
};

export type InmovillaGeoFields = {
  "selpoli-selpoli": string;
  poli: string;
  "demandas-centrolatitud": string;
  "demandas-centroaltitud": string;
  "demandas-zoom": string;
  "demandas-porarea": string;
};

export type GeoResolutionResult = {
  polygon: GeoPolygon;
  source: "predefined" | "nominatim" | "fallback-bbox";
  label: string;
};

export type NominatimResponse = {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: [string, string, string, string];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  geojson?: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
};
