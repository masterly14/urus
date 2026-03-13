/**
 * Serialización de polígonos al formato Inmovilla y cálculo de centro/zoom.
 *
 * Formato Inmovilla: `;lat1+lng1,lat2+lng2,...`
 * El polígono debe cerrarse (último vértice = primero).
 */

import type { LatLng, BoundingBox, GeoPolygon, InmovillaGeoFields } from "./types";

export function serializePolygon(vertices: LatLng[]): string {
  if (vertices.length === 0) return "";
  const closed = ensureClosed(vertices);
  const pairs = closed.map((v) => `${v.lat}+${v.lng}`);
  return `;${pairs.join(",")}`;
}

function ensureClosed(vertices: LatLng[]): LatLng[] {
  if (vertices.length < 2) return vertices;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (first.lat === last.lat && first.lng === last.lng) return vertices;
  return [...vertices, first];
}

export function calculateCenter(vertices: LatLng[]): LatLng {
  if (vertices.length === 0) return { lat: 0, lng: 0 };
  const sum = vertices.reduce(
    (acc, v) => ({ lat: acc.lat + v.lat, lng: acc.lng + v.lng }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: sum.lat / vertices.length,
    lng: sum.lng / vertices.length,
  };
}

/**
 * Estima un nivel de zoom adecuado para Google Maps / Leaflet
 * basado en el span del bounding box del polígono.
 */
export function estimateZoom(vertices: LatLng[]): number {
  if (vertices.length < 2) return 15;
  const bbox = vertexBounds(vertices);
  const latSpan = bbox.north - bbox.south;
  const lngSpan = bbox.east - bbox.west;
  const maxSpan = Math.max(latSpan, lngSpan);

  if (maxSpan > 1.0) return 10;
  if (maxSpan > 0.5) return 11;
  if (maxSpan > 0.2) return 12;
  if (maxSpan > 0.1) return 13;
  if (maxSpan > 0.05) return 14;
  if (maxSpan > 0.02) return 15;
  return 16;
}

export function vertexBounds(vertices: LatLng[]): BoundingBox {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const v of vertices) {
    if (v.lat < south) south = v.lat;
    if (v.lat > north) north = v.lat;
    if (v.lng < west) west = v.lng;
    if (v.lng > east) east = v.lng;
  }
  return { south, west, north, east };
}

export function bboxToPolygon(bbox: BoundingBox): GeoPolygon {
  const vertices: LatLng[] = [
    { lat: bbox.south, lng: bbox.west },
    { lat: bbox.north, lng: bbox.west },
    { lat: bbox.north, lng: bbox.east },
    { lat: bbox.south, lng: bbox.east },
  ];
  return {
    vertices,
    center: calculateCenter(vertices),
    zoom: estimateZoom(vertices),
  };
}

export function polygonToInmovillaFields(polygon: GeoPolygon): InmovillaGeoFields {
  const serialized = serializePolygon(polygon.vertices);
  return {
    "selpoli-selpoli": serialized,
    poli: serialized,
    "demandas-centrolatitud": String(polygon.center.lat),
    "demandas-centroaltitud": String(polygon.center.lng),
    "demandas-zoom": String(polygon.zoom),
    "demandas-porarea": "1",
  };
}
