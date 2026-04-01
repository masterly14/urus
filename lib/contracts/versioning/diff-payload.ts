/**
 * Diff estructural entre dos `ContractTemplateInput` del mismo `kind` (M8).
 */

import type { ContractTemplateInput } from "@/types/contracts";

export interface PayloadDiffEntry {
  path: string;
  before: unknown;
  after: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  if (!keysA.every((k, i) => k === keysB[i])) return false;
  return keysA.every((k) => deepEqual(a[k], b[k]));
}

function diffRecursive(
  basePath: string,
  left: unknown,
  right: unknown,
  out: PayloadDiffEntry[],
): void {
  if (deepEqual(left, right)) return;

  if (
    !isPlainObject(left) ||
    !isPlainObject(right) ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    if (Array.isArray(left) && Array.isArray(right)) {
      const max = Math.max(left.length, right.length);
      for (let i = 0; i < max; i++) {
        const p = `${basePath}[${i}]`;
        if (i >= left.length) {
          out.push({ path: p, before: undefined, after: right[i] });
        } else if (i >= right.length) {
          out.push({ path: p, before: left[i], after: undefined });
        } else {
          diffRecursive(p, left[i], right[i], out);
        }
      }
      return;
    }
    out.push({ path: basePath || "(root)", before: left, after: right });
    return;
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const k of keys) {
    const p = basePath ? `${basePath}.${k}` : k;
    if (!(k in left)) {
      out.push({ path: p, before: undefined, after: right[k] });
    } else if (!(k in right)) {
      out.push({ path: p, before: left[k], after: undefined });
    } else {
      diffRecursive(p, left[k], right[k], out);
    }
  }
}

/**
 * Compara los `payload` de dos entradas con el mismo `kind`.
 * Si `kind` difiere, devuelve un único cambio en `kind`.
 */
export function diffContractTemplatePayload(
  previous: ContractTemplateInput,
  next: ContractTemplateInput,
): PayloadDiffEntry[] {
  if (previous.kind !== next.kind) {
    return [
      {
        path: "kind",
        before: previous.kind,
        after: next.kind,
      },
    ];
  }
  const out: PayloadDiffEntry[] = [];
  diffRecursive(
    "payload",
    previous.payload as Record<string, unknown>,
    next.payload as Record<string, unknown>,
    out,
  );
  return out;
}
