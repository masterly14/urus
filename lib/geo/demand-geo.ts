/**
 * Helper para construir los campos geográficos de una demanda Inmovilla.
 *
 * Une la resolución de polígonos con el payload de createDemand del Egestion Worker.
 * Sin polígono válido, las demandas creadas programáticamente son inútiles para
 * el cruce automático de Inmovilla.
 */

import type { InmovillaGeoFields } from "./types";
import { resolveGeoFields, emptyGeoFields, type ResolveGeoOptions } from "./resolver";

export type BuildDemandGeoOptions = {
  /** Zona o barrio (texto libre, ej. "Centro", "Villarrubia") */
  zone?: string;
  /** Ciudad (ej. "Córdoba", "Málaga", "Sevilla") */
  city?: string;
  /** Provincia */
  province?: string;
  /** IDs de tipos de propiedad con labels (ej. ",2799,Apartamento,3399,Piso") */
  seltipos?: string;
  /** IDs de tipos de propiedad (ej. "2799,3399") */
  tipos?: string;
  /** Si true, solo usa polígonos predefinidos (sin Nominatim) */
  offlineOnly?: boolean;
};

export type DemandGeoResult = {
  fields: Record<string, string>;
  hasPolygon: boolean;
  source: "predefined" | "nominatim" | "fallback-bbox" | "none";
  label: string;
};

/**
 * Construye todos los campos geográficos + tipos para el body de guardar.php.
 *
 * @example
 * const geo = await buildDemandGeoFields({
 *   zone: "Centro",
 *   city: "Córdoba",
 *   seltipos: ",2799,Apartamento,3399,Piso",
 *   tipos: "2799,3399",
 * });
 *
 * // geo.fields contiene: selpoli-selpoli, poli, demandas-centrolatitud,
 * // demandas-centroaltitud, demandas-zoom, demandas-porarea,
 * // seltipos-seltipos, tipos, zonas
 */
export async function buildDemandGeoFields(
  options: BuildDemandGeoOptions,
): Promise<DemandGeoResult> {
  const resolveOpts: ResolveGeoOptions = {
    zoneText: options.zone,
    city: options.city,
    province: options.province,
    offlineOnly: options.offlineOnly,
  };

  const resolution = await resolveGeoFields(resolveOpts);

  let geoFields: InmovillaGeoFields;
  let hasPolygon: boolean;
  let source: DemandGeoResult["source"];
  let label: string;

  if (resolution) {
    geoFields = resolution.fields;
    hasPolygon = true;
    source = resolution.resolution.source;
    label = resolution.resolution.label;
  } else {
    geoFields = emptyGeoFields();
    hasPolygon = false;
    source = "none";
    label = options.zone ?? options.city ?? "desconocido";
  }

  const fields: Record<string, string> = {
    ...geoFields,
    "seltipos-seltipos": options.seltipos ?? "",
    tipos: options.tipos ?? "",
    zonas: "",
  };

  return { fields, hasPolygon, source, label };
}
