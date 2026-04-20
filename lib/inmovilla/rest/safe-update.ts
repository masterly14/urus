/**
 * Safe property update para la API REST v1 de Inmovilla (POST /propiedades/).
 *
 * La API REST v1 usa POST /propiedades/ tanto para crear como para actualizar:
 * si se envía `ref` existente actualiza, si no, crea. Pero la API:
 *
 *   1. Rechaza campos generados por el servidor si se reenvían (p.ej. `cod_ofer`).
 *   2. Rechaza FKs con valor 0 / "" con 406 "El parametro X no es valido".
 *   3. Rechaza cualquier otro parámetro inesperado con el mismo 406.
 *
 * `safeUpdateProperty` resuelve esto:
 *   - Parte de un GET de la propiedad actual.
 *   - Mezcla con el patch que nos pasa el caller.
 *   - Filtra campos read-only y FKs vacías.
 *   - Hace POST con retry adaptativo: al primer 406 "no es valido" elimina ese
 *     campo y reintenta hasta `maxAttempts`.
 *
 * Esta utilidad se usa desde:
 *   - `createProspecto` (CRM v2) para parchear tituloes/descripciones que el
 *     endpoint CRM v2 no persiste correctamente.
 *   - `scripts/cleanup-test-prospectos-inmovilla.ts` para desactivar prospectos
 *     de prueba.
 */

import type { InmovillaRestClient } from "./client";
import type {
  PropiedadCompleta,
  CreatePropertyResponse,
  PropiedadListadoItem,
} from "./types";

/**
 * Campos que el servidor de Inmovilla gestiona automáticamente y que no
 * deben reenviarse en el POST de update.
 */
export const READONLY_PROPERTY_FIELDS: ReadonlySet<string> = new Set<string>([
  "cod_ofer",
  "fecha",
  "fechaact",
  "fecha_alta",
  "fecha_modif",
  "usernombre",
  "keyagencia",
  "numagencia",
  "lisestado",
  "localidad",
  "zona",
  "fotos",
  "videos",
  "virtualTour",
]);

/**
 * Foreign keys que la API REST valida como referencias existentes.
 * Si vienen a 0 / "" desde el GET (sin relación), el POST devuelve
 * 406 "El parametro X no es valido". Se omiten del payload.
 */
export const OPTIONAL_FK_FIELDS: ReadonlySet<string> = new Set<string>([
  "keycli",
  "keyori",
  "keymedio",
  "keyagente",
  "keycaptador",
  "keycomercial",
  "keyagentedemanda",
]);

export type SafeUpdateOptions = {
  /** Máximo de reintentos adaptativos ante 406 "no es valido". Default 12. */
  maxAttempts?: number;
  /**
   * Campos adicionales a marcar como read-only (además de READONLY_PROPERTY_FIELDS).
   * Útil p.ej. para evitar sobrescribir `prospecto` al desactivar.
   */
  extraReadonly?: ReadonlySet<string>;
  /** Si true, no hace el POST y retorna el payload que enviaría. */
  dryRun?: boolean;
  /** Logger opcional; por defecto usa console.warn/log. */
  logger?: {
    log?: (msg: string) => void;
    warn?: (msg: string) => void;
  };
};

export type SafeUpdateResult = {
  ok: boolean;
  response?: CreatePropertyResponse & Partial<PropiedadCompleta>;
  payload: Record<string, unknown>;
  removedFields: string[];
};

function buildUpdatePayload(
  current: PropiedadCompleta,
  patch: Record<string, unknown>,
  extraReadonly?: ReadonlySet<string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    if (READONLY_PROPERTY_FIELDS.has(k)) continue;
    if (extraReadonly?.has(k)) continue;
    if (v === null) continue;
    if (OPTIONAL_FK_FIELDS.has(k)) {
      if (v === 0 || v === "0" || v === "" || v === undefined) continue;
    }
    payload[k] = v;
  }

  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    payload[k] = v;
  }

  payload.ref = String(current.ref ?? patch.ref ?? "");
  return payload;
}

/**
 * Actualiza una propiedad/prospecto ya existente aplicando `patch` sobre los
 * valores actuales. Reintenta adaptativamente ante 406 eliminando campos
 * rechazados por la API.
 */
export async function safeUpdateProperty(
  client: InmovillaRestClient,
  refOrCodOfer: { ref?: string; codOfer?: number },
  patch: Record<string, unknown>,
  options: SafeUpdateOptions = {},
): Promise<SafeUpdateResult> {
  const maxAttempts = options.maxAttempts ?? 12;
  const log = options.logger?.log ?? ((m: string) => console.log(m));
  const warn = options.logger?.warn ?? ((m: string) => console.warn(m));

  let current: PropiedadCompleta | null = null;
  if (refOrCodOfer.codOfer != null) {
    current = await client.get<PropiedadCompleta>("/propiedades/", {
      cod_ofer: String(refOrCodOfer.codOfer),
    });
  } else if (refOrCodOfer.ref) {
    current = await client.get<PropiedadCompleta>("/propiedades/", {
      ref: refOrCodOfer.ref,
    });
  }

  if (!current || typeof current !== "object") {
    throw new Error(
      `safeUpdateProperty: no se pudo obtener la propiedad ${JSON.stringify(refOrCodOfer)}.`,
    );
  }

  const ref = current.ref ? String(current.ref) : "";
  if (!ref) {
    throw new Error(
      `safeUpdateProperty: la ficha no tiene 'ref'; la API REST no permite update sin ref.`,
    );
  }

  const payload = buildUpdatePayload(current, patch, options.extraReadonly);

  if (options.dryRun) {
    log(
      `[safe-update] dry-run ref=${ref} campos=${Object.keys(payload).length}`,
    );
    return { ok: true, payload, removedFields: [] };
  }

  const removedFields: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await client.post<
        CreatePropertyResponse & Partial<PropiedadCompleta>
      >("/propiedades/", payload);
      return { ok: true, response, payload, removedFields };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const match = message.match(/El parametro ([\w-]+) no es valido/i);
      if (!match || attempt === maxAttempts) {
        throw err;
      }
      const badField = match[1];
      if (!(badField in payload)) {
        throw err;
      }
      delete payload[badField];
      removedFields.push(badField);
      warn(
        `[safe-update] intento ${attempt}/${maxAttempts}: API rechazó "${badField}". Reintentando sin ese campo...`,
      );
    }
  }

  return { ok: false, payload, removedFields };
}

/** Resuelve un `ref` a su `cod_ofer` consultando el listado. */
export async function resolveCodOferByRef(
  client: InmovillaRestClient,
  ref: string,
): Promise<number | null> {
  const list = await client.get<PropiedadListadoItem[]>("/propiedades/", {
    listado: true,
  });
  if (!Array.isArray(list)) return null;
  const hit = list.find((item) => item?.ref === ref);
  return hit?.cod_ofer ?? null;
}
