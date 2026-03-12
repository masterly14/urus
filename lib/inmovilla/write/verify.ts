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
