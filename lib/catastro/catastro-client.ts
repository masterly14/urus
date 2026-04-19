/**
 * Client for Spain's Catastro REST API (OVCCallejero.asmx).
 * Resolves address components → referencia catastral via 3 sequential GET calls.
 *
 * API base: https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx
 * All endpoints return XML; we parse with fast-xml-parser.
 */

import { XMLParser } from "fast-xml-parser";
import type { CatastroLookupParams, CatastroResult } from "./types";

const BASE_URL =
  "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx";

const TIMEOUT_MS = 15_000;

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
});

function buildUrl(
  endpoint: string,
  params: Record<string, string | number>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qs.set(k, String(v));
  }
  return `${BASE_URL}/${endpoint}?${qs.toString()}`;
}

async function fetchXml<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Catastro HTTP ${res.status}: ${res.statusText}`);
    }
    const text = await res.text();
    return xmlParser.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 1. ConsultaMunicipio — get municipality code
// ---------------------------------------------------------------------------

interface MunicipioXml {
  consulta_municipiero: {
    control?: { cumun?: number };
    municipiero?: {
      muni?:
        | Array<{ nm: string; locat: { cd: number; cmc: number } }>
        | { nm: string; locat: { cd: number; cmc: number } };
    };
    lerr?: { err?: { cod?: number; des?: string } };
  };
}

export async function consultaMunicipio(
  provincia: string,
  municipio: string,
): Promise<{ cd: number; cmc: number } | null> {
  const url = buildUrl("ConsultaMunicipio", {
    Provincia: provincia,
    Municipio: municipio,
  });

  const data = await fetchXml<MunicipioXml>(url);
  const root = data.consulta_municipiero;

  if (root.lerr?.err) {
    console.warn(
      `[catastro] ConsultaMunicipio error: ${root.lerr.err.des ?? root.lerr.err.cod}`,
    );
    return null;
  }

  const munis = root.municipiero?.muni;
  if (!munis) return null;

  const list = Array.isArray(munis) ? munis : [munis];

  const exact = list.find(
    (m) => m.nm.toUpperCase() === municipio.toUpperCase(),
  );
  if (exact) return exact.locat;

  return list.length > 0 ? list[0].locat : null;
}

// ---------------------------------------------------------------------------
// 2. ConsultaVia — get street code (optional, ConsultaNumero works without it)
// ---------------------------------------------------------------------------

interface ViaXml {
  consulta_callejero: {
    control?: { cuca?: number };
    callejero?: {
      calle?:
        | Array<{ dir: { cv: number; tv: string; nv: string } }>
        | { dir: { cv: number; tv: string; nv: string } };
    };
    lerr?: { err?: { cod?: number; des?: string } };
  };
}

export async function consultaVia(
  provincia: string,
  municipio: string,
  tipoVia: string,
  nombreVia: string,
): Promise<{ cv: number; tv: string; nv: string } | null> {
  const url = buildUrl("ConsultaVia", {
    Provincia: provincia,
    Municipio: municipio,
    TipoVia: tipoVia,
    NombreVia: nombreVia,
  });

  const data = await fetchXml<ViaXml>(url);
  const root = data.consulta_callejero;

  if (root.lerr?.err) {
    console.warn(
      `[catastro] ConsultaVia error: ${root.lerr.err.des ?? root.lerr.err.cod}`,
    );
    return null;
  }

  const calles = root.callejero?.calle;
  if (!calles) return null;

  const list = Array.isArray(calles) ? calles : [calles];
  const upper = nombreVia.toUpperCase();

  const exact = list.find((c) => c.dir.nv.toUpperCase() === upper);
  if (exact) return exact.dir;

  return list.length > 0 ? list[0].dir : null;
}

// ---------------------------------------------------------------------------
// 3. ConsultaNumero — get referencia catastral
// ---------------------------------------------------------------------------

interface NumeroXml {
  consulta_numerero: {
    control?: { cunum?: number };
    numerero?: {
      nump?:
        | Array<{ pc: { pc1: string; pc2: string }; num?: { pnp: number } }>
        | { pc: { pc1: string; pc2: string }; num?: { pnp: number } };
    };
    lerr?: { err?: { cod?: number; des?: string } };
  };
}

export async function consultaNumero(
  provincia: string,
  municipio: string,
  tipoVia: string,
  nomVia: string,
  numero: number,
  planta?: string,
  puerta?: string,
): Promise<{ rc: string; numero: number } | null> {
  const url = buildUrl("ConsultaNumero", {
    Provincia: provincia,
    Municipio: municipio,
    TipoVia: tipoVia,
    NomVia: nomVia,
    Numero: numero,
    Bloque: "",
    Escalera: "",
    Planta: planta ?? "",
    Puerta: puerta ?? "",
  });

  const data = await fetchXml<NumeroXml>(url);
  const root = data.consulta_numerero;

  if (root.lerr?.err) {
    console.warn(
      `[catastro] ConsultaNumero error: ${root.lerr.err.des ?? root.lerr.err.cod}`,
    );
    return null;
  }

  const numps = root.numerero?.nump;
  if (!numps) return null;

  const list = Array.isArray(numps) ? numps : [numps];
  if (list.length === 0) return null;

  const exact = list.find((n) => n.num?.pnp === numero);
  const best = exact ?? list[0];

  return {
    rc: `${best.pc.pc1}${best.pc.pc2}`,
    numero: best.num?.pnp ?? numero,
  };
}

// ---------------------------------------------------------------------------
// Main lookup — orchestrates the 3 calls
// ---------------------------------------------------------------------------

export async function lookupReferenciaCatastral(
  params: CatastroLookupParams,
): Promise<CatastroResult> {
  const { provincia, municipio, tipoVia, nomVia, numero, planta, puerta } =
    params;

  console.log(
    `[catastro] Looking up: ${provincia} / ${municipio} / ${tipoVia} ${nomVia} ${numero}`,
  );

  try {
    // Step 1: verify municipality exists
    const muni = await consultaMunicipio(provincia, municipio);
    if (!muni) {
      return {
        found: false,
        error: `Municipio no encontrado: ${provincia} / ${municipio}`,
      };
    }
    console.log(`[catastro] Municipio: cd=${muni.cd}, cmc=${muni.cmc}`);

    // Step 2: get catastral reference directly (ConsultaNumero works without via code)
    const result = await consultaNumero(
      provincia,
      municipio,
      tipoVia,
      nomVia,
      numero,
      planta,
      puerta,
    );

    if (!result) {
      return {
        found: false,
        error: `No se encontró referencia catastral para ${tipoVia} ${nomVia} ${numero}, ${municipio} (${provincia})`,
      };
    }

    console.log(
      `[catastro] Referencia catastral encontrada: ${result.rc} (número ${result.numero})`,
    );

    return {
      found: true,
      referenciaCatastral: result.rc,
      direccion: `${tipoVia} ${nomVia} ${numero}, ${municipio}, ${provincia}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[catastro] Error: ${msg}`);
    return { found: false, error: msg };
  }
}
