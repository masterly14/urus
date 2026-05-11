// ---------------------------------------------------------------------------
// Utilidades para combinar datos resueltos (Neon + Inmovilla) con datos
// manuales que el comercial introduce desde el formulario.
//
// El formulario de "Avanzar operación" envía las claves de `manualData` con
// la misma notación que `STAGE_REQUIREMENTS` (`buyer.fullName`,
// `buyers[].fiscalAddress`, etc.). El validador, en cambio, espera un objeto
// anidado. Estas funciones traducen la notación plana a anidada y combinan
// el resultado con los datos ya resueltos, dándole prioridad a la entrada
// manual cuando el comercial introduce un valor explícito.
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

/**
 * Convierte un objeto con claves en notación de punto en un objeto anidado.
 *
 * Soporta:
 *  - `"a.b.c"`         → `{ a: { b: { c: value } } }`
 *  - `"items[].name"`  → `{ items: [{ name: value }] }`
 *
 * Los valores `undefined`, `null` y cadenas vacías se ignoran: si el
 * comercial deja un campo en blanco, no debe "sobrescribir" un valor
 * ya resuelto desde Inmovilla.
 */
export function expandDottedKeys(flat: AnyRecord | undefined | null): AnyRecord {
  if (!flat || typeof flat !== "object") return {};
  const out: AnyRecord = {};
  for (const [rawKey, rawValue] of Object.entries(flat)) {
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue === "string" && rawValue.trim() === "") continue;
    setDottedPath(out, rawKey, rawValue);
  }
  return out;
}

function setDottedPath(target: AnyRecord, path: string, value: unknown): void {
  const normalized = path.replace(/\[\]/g, ".0");
  const parts = normalized.split(".");

  let current: AnyRecord | unknown[] = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    const nextIsIndex = /^\d+$/.test(nextPart);
    const existing = (current as AnyRecord)[part];

    if (existing === undefined || existing === null) {
      const fresh: AnyRecord | unknown[] = nextIsIndex ? [] : {};
      (current as AnyRecord)[part] = fresh;
      current = fresh;
    } else if (typeof existing !== "object") {
      // El path entra en conflicto con un valor escalar previo: lo descartamos.
      return;
    } else {
      current = existing as AnyRecord | unknown[];
    }
  }

  const lastPart = parts[parts.length - 1];
  (current as AnyRecord)[lastPart] = value;
}

/**
 * Fusión profunda de dos objetos. Los valores no `undefined` de `override`
 * pisan a los de `base`. Los arrays se fusionan elemento a elemento (útil
 * para `buyers[]` / `sellers[]`, donde sólo hay una entrada por operación
 * pero el override del formulario suele venir parcial).
 */
export function deepMerge<A extends AnyRecord, B extends AnyRecord>(
  base: A,
  override: B,
): AnyRecord {
  return mergeValues(base, override) as AnyRecord;
}

function mergeValues(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (base === undefined) return override;

  if (Array.isArray(base) && Array.isArray(override)) {
    const max = Math.max(base.length, override.length);
    const out: unknown[] = [];
    for (let i = 0; i < max; i++) {
      out.push(mergeValues(base[i], override[i]));
    }
    return out;
  }

  if (
    base &&
    override &&
    typeof base === "object" &&
    typeof override === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(override)
  ) {
    const out: AnyRecord = { ...(base as AnyRecord) };
    for (const [key, value] of Object.entries(override as AnyRecord)) {
      if (value === undefined) continue;
      out[key] = mergeValues(out[key], value);
    }
    return out;
  }

  return override;
}
