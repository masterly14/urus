import { parseFichaFieldValue } from "./parsers";

type VerifyResult = {
  ok: boolean;
  field?: string;
  expected?: string;
  actual?: string;
};

export function verifyDemandEmail(
  fichaResponseText: string,
  expectedEmail: string,
): VerifyResult {
  const actual = parseFichaFieldValue(fichaResponseText, "clientes", "email");
  if (actual === null) {
    return { ok: false, field: "clientes.email", expected: expectedEmail };
  }

  return {
    ok: actual.toLowerCase() === expectedEmail.toLowerCase(),
    field: "clientes.email",
    expected: expectedEmail,
    actual,
  };
}

export function verifyDemandPriority(
  fichaResponseText: string,
  expectedPriority: string,
): VerifyResult {
  const actual = parseFichaFieldValue(fichaResponseText, "demandas", "prioridad");
  if (actual === null) {
    return { ok: false, field: "demandas.prioridad", expected: expectedPriority };
  }

  return {
    ok: actual === expectedPriority,
    field: "demandas.prioridad",
    expected: expectedPriority,
    actual,
  };
}

/**
 * Post-write verification for updateDemandCriteria.
 * Checks `presupuestoMax` (ventahasta) when present in the patch,
 * as it is the most commonly updated and reliably parseable field.
 */
export function verifyDemandCriteria(
  fichaResponseText: string,
  patch: Record<string, unknown>,
): VerifyResult {
  if (typeof patch.presupuestoMax === "number") {
    const expected = String(Math.round(patch.presupuestoMax as number));
    const actual = parseFichaFieldValue(fichaResponseText, "demandas", "ventahasta");
    if (actual === null) {
      return { ok: false, field: "demandas.ventahasta", expected };
    }
    const normalizedActual = actual.replace(/[^0-9]/g, "");
    return {
      ok: normalizedActual === expected,
      field: "demandas.ventahasta",
      expected,
      actual,
    };
  }

  return { ok: true, field: "none", expected: "n/a", actual: "n/a" };
}
