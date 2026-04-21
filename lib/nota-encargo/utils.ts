/**
 * Utility functions for the Nota de Encargo flow.
 *
 * `extractDireccionFromRaw` derives the street address from a
 * PropertySnapshot's `raw` JSON blob combined with PropertyCurrent city/zone.
 *
 * `extractPropertyDataFromRaw` is kept for backward compatibility but
 * callers should prefer `extractDireccionFromRaw` + PropertyCurrent.precio
 * to avoid the 0-price bug when `raw` lacks `precioinmo`/`precioalq`.
 */

export function extractDireccionFromRaw(
  raw: Record<string, unknown>,
  propertyCurrent: { ciudad: string; zona: string },
): string {
  const calle = String(raw.calle ?? "").trim();
  const numero = String(raw.numero ?? "").trim();
  const cp = String(raw.cp ?? "").trim();

  return [
    calle && numero
      ? `Calle ${calle}, ${numero}`
      : calle
        ? `Calle ${calle}`
        : "",
    propertyCurrent.zona,
    propertyCurrent.ciudad,
    cp,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Maps Inmovilla `tipoOfer` (e.g. "Venta", "Alquiler", "Venta y Alquiler")
 * to the canonical operation type used by NotaEncargoSession.
 */
export function resolveOperationType(
  tipoOfer: string,
): "VENTA" | "ALQUILER" {
  const lower = (tipoOfer ?? "").toLowerCase();
  if (lower.includes("alquiler") && !lower.includes("venta")) return "ALQUILER";
  return "VENTA";
}

/**
 * @deprecated Use `extractDireccionFromRaw` + `PropertyCurrent.precio` instead.
 * This function reads price from `raw.precioinmo`/`raw.precioalq` which may
 * be absent depending on the Inmovilla sync endpoint used.
 */
export function extractPropertyDataFromRaw(
  raw: Record<string, unknown>,
  propertyCurrent: { ciudad: string; zona: string },
): {
  direccion: string;
  tipoOperacion: "VENTA" | "ALQUILER";
  precio: number;
} {
  const direccion = extractDireccionFromRaw(raw, propertyCurrent);

  const precioinmo = Number(raw.precioinmo) || 0;
  const precioalq = Number(raw.precioalq) || 0;
  const tipoOperacion: "VENTA" | "ALQUILER" =
    precioalq > 0 && precioinmo === 0 ? "ALQUILER" : "VENTA";
  const precio = tipoOperacion === "ALQUILER" ? precioalq : precioinmo;

  return { direccion, tipoOperacion, precio };
}
