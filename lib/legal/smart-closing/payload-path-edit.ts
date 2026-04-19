/**
 * Lectura/escritura por ruta estilo `buyers[0].fullName` sobre el objeto `payload`.
 */

export type PayloadPathSegment = string | number;

export function parsePayloadPath(path: string): PayloadPathSegment[] {
  const segs: PayloadPathSegment[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === "." || path[i] === "]") {
      i++;
      continue;
    }
    if (path[i] === "[") {
      const end = path.indexOf("]", i);
      if (end === -1) throw new Error(`Ruta de campo inválida: ${path}`);
      const n = Number(path.slice(i + 1, end));
      if (!Number.isInteger(n) || n < 0) throw new Error(`Índice inválido en ruta: ${path}`);
      segs.push(n);
      i = end + 1;
    } else {
      let j = i;
      while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
      const key = path.slice(i, j);
      if (!key) throw new Error(`Ruta de campo inválida: ${path}`);
      segs.push(key);
      i = j;
    }
  }
  return segs;
}

export function getValueAtPath(root: unknown, segments: PayloadPathSegment[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof seg === "number") {
      cur = Array.isArray(cur) ? cur[seg] : undefined;
    } else {
      cur = typeof cur === "object" && cur !== null && !Array.isArray(cur) ? (cur as Record<string, unknown>)[seg] : undefined;
    }
  }
  return cur;
}

export function setValueAtPath(root: unknown, segments: PayloadPathSegment[], value: unknown): void {
  if (segments.length === 0) return;
  let cur: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) throw new Error("Estructura inválida en ruta");
      cur = cur[seg];
    } else {
      if (typeof cur !== "object" || cur === null || Array.isArray(cur)) {
        throw new Error("Estructura inválida en ruta");
      }
      cur = (cur as Record<string, unknown>)[seg];
    }
    if (cur === undefined) throw new Error(`Ruta incompleta: falta ${String(seg)}`);
  }
  const last = segments[segments.length - 1]!;
  if (typeof last === "number") {
    if (!Array.isArray(cur)) throw new Error("Estructura inválida en ruta");
    cur[last] = value;
  } else {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) {
      throw new Error("Estructura inválida en ruta");
    }
    (cur as Record<string, unknown>)[last] = value;
  }
}

export function coerceEditedValue(raw: string, previous: unknown): unknown {
  const t = trimmed(raw);

  if (previous === null) {
    if (t === "" || t.toLowerCase() === "null") return null;
    return t;
  }

  const prevType = typeof previous;

  if (prevType === "number") {
    const normalized = t.replace(/\s/g, "").replace(",", ".");
    const n = Number(normalized);
    if (Number.isNaN(n)) throw new Error("No es un número válido");
    return n;
  }

  if (prevType === "boolean") {
    const low = t.toLowerCase();
    if (low === "true" || low === "1" || low === "sí" || low === "si") return true;
    if (low === "false" || low === "0" || low === "no") return false;
    throw new Error('Usa "true" o "false"');
  }

  if (prevType === "string") {
    return raw;
  }

  return raw;
}

function trimmed(s: string): string {
  return s.trim();
}

export function valuesEqualForPayload(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Solo hojas editables (no objetos ni arrays). */
export function isEditablePayloadPath(payload: unknown, path: string): boolean {
  try {
    const v = getValueAtPath(payload, parsePayloadPath(path));
    if (v === undefined) return false;
    if (v === null) return true;
    const t = typeof v;
    return t === "string" || t === "number" || t === "boolean";
  } catch {
    return false;
  }
}
