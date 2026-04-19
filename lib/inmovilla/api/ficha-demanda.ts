/**
 * Carga de ficha de demanda vía fichacliente.php (campos que no vienen en paginación):
 * - Ref consultada (cruce)
 * - Zonas de búsqueda (extraídas del polígono `selpoli`)
 * - Coordenadas geográficas (centrolatitud, centroaltitud)
 *
 * El endpoint devuelve JS evaluable con pares 'tabla.','campo','valor'.
 * Las áreas geográficas están en la sección `selpoli` codificadas:
 *   - Polígonos con coordenadas: `lat lng,lat lng,...`
 *   - Metadatos por área: `{pol_data}<base64 JSON>` con nombre, plataforma, etc.
 */

import type { InmovillaSession } from "../auth/types";
import { createInmovillaClient, type InmovillaClient } from "./client";

export type SelpoliArea = {
  id?: number;
  nombre: string;
  nombrePadre?: string;
  plataforma?: string;
  latitud?: number;
  longitud?: number;
  zoom?: number;
};

export type FichaResult = {
  fields: Record<string, string>;
  areas: SelpoliArea[];
  /** Zone names joined from selpoli areas (e.g. "Brillante, El Patriarca") */
  zonasFromAreas: string;
};

/**
 * Extrae pares campo→valor de la sección demandas. en la respuesta JS de fichacliente.php.
 * Formato: 'demandas.','nombre_campo','valor'
 */
export function parseDemandasFieldsFromFichaCliente(
  responseText: string,
): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /'demandas\.','([^']+)','([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(responseText)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

/**
 * Extrae datos de áreas geográficas de los bloques {pol_data} dentro de selpoli.
 * Cada bloque contiene un JSON codificado en base64 con `nombre`, `nombrePadre`, etc.
 */
export function parseSelpoliAreas(responseText: string): SelpoliArea[] {
  const selpoliRe = /'selpoli','([^']*)'/;
  const selpoliMatch = selpoliRe.exec(responseText);
  if (!selpoliMatch?.[1]) return [];

  const raw = selpoliMatch[1];
  const areas: SelpoliArea[] = [];

  const polDataRe = /\{pol_data\}([A-Za-z0-9+/=]+)/g;
  let pm: RegExpExecArray | null;
  while ((pm = polDataRe.exec(raw)) !== null) {
    try {
      const json = Buffer.from(pm[1], "base64").toString("utf-8");
      const data = JSON.parse(json) as Record<string, unknown>;

      const nombre =
        typeof data.nombre === "string" ? data.nombre.trim() : "";
      if (!nombre) continue;

      areas.push({
        id: typeof data.id === "number" ? data.id : undefined,
        nombre,
        nombrePadre:
          typeof data.nombrePadre === "string" && data.nombrePadre.trim()
            ? data.nombrePadre.trim()
            : undefined,
        plataforma:
          typeof data.plataforma === "string" ? data.plataforma : undefined,
        latitud:
          typeof data.latitud === "number" ? data.latitud : undefined,
        longitud:
          typeof data.longitud === "number" ? data.longitud : undefined,
        zoom: typeof data.zoom === "number" ? data.zoom : undefined,
      });
    } catch {
      // Malformed base64 or JSON — skip
    }
  }

  return areas;
}

/**
 * Builds a comma-separated zone string from selpoli areas.
 * Uses `nombre` and falls back to `nombrePadre` if available.
 */
export function buildZonasFromAreas(areas: SelpoliArea[]): string {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const a of areas) {
    const key = a.nombre.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(a.nombre);
  }

  return names.join(", ");
}

function buildFichaClientePath(numAgencia: string): string {
  const cache = `${numAgencia}.${Date.now()}.2`;
  const q = new URLSearchParams({ eS: "0", cache }).toString();
  return `/new/app/cargas/fichacliente/fichacliente.php?${q}`;
}

/**
 * POST fichacliente.php y devuelve los campos `demandas.*` parseados.
 */
export async function fetchDemandasFichaMap(
  client: InmovillaClient,
  session: InmovillaSession,
  codDem: string,
): Promise<Record<string, string>> {
  const path = buildFichaClientePath(session.numAgencia);
  const text = await client.postText(path, {
    crwhere: `demandas.cod_dem;=;${codDem};`,
    otraagencia: "",
  });
  return parseDemandasFieldsFromFichaCliente(text);
}

/**
 * Full ficha fetch: returns both demandas.* fields AND zone areas from selpoli.
 */
export async function fetchDemandasFichaFull(
  client: InmovillaClient,
  session: InmovillaSession,
  codDem: string,
): Promise<FichaResult> {
  const path = buildFichaClientePath(session.numAgencia);
  const text = await client.postText(path, {
    crwhere: `demandas.cod_dem;=;${codDem};`,
    otraagencia: "",
  });

  const fields = parseDemandasFieldsFromFichaCliente(text);
  const areas = parseSelpoliAreas(text);
  const zonasFromAreas = buildZonasFromAreas(areas);

  return { fields, areas, zonasFromAreas };
}
