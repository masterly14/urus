/**
 * Aplana un objeto payload anidado en filas path → valor para UI de solo lectura.
 */

export interface PayloadFlatRow {
  /** Ruta tipo `property.addressLine` o `buyers[0].fullName` */
  path: string;
  value: string;
  /** Primer segmento del path (grupo lógico) */
  group: string;
}

function inferGroup(path: string): string {
  const m = path.match(/^([^.\[]+)/);
  return (m?.[1] ?? path) || "—";
}

export function flattenContractPayloadForDisplay(payload: unknown): PayloadFlatRow[] {
  const rows: PayloadFlatRow[] = [];

  function walk(node: unknown, path: string, group: string): void {
    if (node === null || node === undefined) {
      const p = path || "(raíz)";
      rows.push({
        path: p,
        value: node === null ? "null" : "undefined",
        group: group || inferGroup(p),
      });
      return;
    }

    const t = typeof node;
    if (t === "string" || t === "number" || t === "boolean") {
      rows.push({ path, value: String(node), group: group || inferGroup(path) });
      return;
    }

    if (Array.isArray(node)) {
      if (node.length === 0) {
        rows.push({ path, value: "—", group: group || inferGroup(path) });
        return;
      }
      node.forEach((item, i) => {
        const p = `${path}[${i}]`;
        walk(item, p, group || inferGroup(p));
      });
      return;
    }

    if (t === "object") {
      const o = node as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length === 0) {
        rows.push({ path, value: "—", group: group || inferGroup(path) });
        return;
      }
      for (const k of keys) {
        const p = path ? `${path}.${k}` : k;
        const g = path ? group : k;
        walk(o[k]!, p, g || inferGroup(p));
      }
    }
  }

  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    walk(payload, "", "");
  } else {
    walk(payload, "payload", "payload");
  }

  return rows;
}
