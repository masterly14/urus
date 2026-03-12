import { InmovillaWriteError } from "./types";
import type { ParsedWriteResponse } from "./types";

const TMP_RECIBIDO_REGEX = /tmprecibido='(\d+)'/;
const HAY_ERRORES_REGEX = /hayerrores=(\d)/;
const HAY_ERRORES_TXT_REGEX = /hayerrorestxt='([^']*)'/;
const SUCCESS_CODE_REGEX = /\/\/exito;(\d+)/;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseGuardarResponse(responseText: string): ParsedWriteResponse {
  const demandIdMatch = responseText.match(TMP_RECIBIDO_REGEX);
  const hayErroresMatch = responseText.match(HAY_ERRORES_REGEX);
  const errorTxtMatch = responseText.match(HAY_ERRORES_TXT_REGEX);
  const successCodeMatch = responseText.match(SUCCESS_CODE_REGEX);

  const demandId = demandIdMatch?.[1];
  const hayErrores = hayErroresMatch?.[1] === "1";
  const errorText = safeDecode(errorTxtMatch?.[1] ?? "");
  const successCode = successCodeMatch?.[1];

  const success = !hayErrores && Boolean(demandId);

  return {
    success,
    demandId,
    errorText: errorText || undefined,
    successCode,
  };
}

export function assertParsedSuccess(
  parsed: ParsedWriteResponse,
  responseText: string,
): { demandId: string } {
  if (!parsed.success || !parsed.demandId) {
    throw new InmovillaWriteError(
      "INMOVILLA_WRITE_ERROR",
      "Inmovilla respondió error al guardar la ficha",
      {
        parsed,
        responsePreview: responseText.slice(0, 500),
      },
    );
  }

  return { demandId: parsed.demandId };
}

export function parseFichaFieldValue(
  fichaResponseText: string,
  table: "demandas" | "clientes",
  field: string,
): string | null {
  if (!fichaResponseText.includes(`'${table}.'`)) {
    return null;
  }

  const fieldRegex = new RegExp(`'${field}','([^']*)'`);
  const match = fichaResponseText.match(fieldRegex);
  return match?.[1] ?? null;
}

