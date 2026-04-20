/**
 * Utility functions for the Nota de Encargo flow.
 *
 * `extractPropertyDataFromRaw` derives address, operation type and price
 * from a PropertySnapshot's `raw` JSON blob combined with the PropertyCurrent
 * city/zone data.  Originally lived in the tasks-ingestion parser; moved here
 * because the ingestion worker was removed in favour of a local platform trigger.
 */

export function extractPropertyDataFromRaw(
  raw: Record<string, unknown>,
  propertyCurrent: { ciudad: string; zona: string },
): {
  direccion: string;
  tipoOperacion: "VENTA" | "ALQUILER";
  precio: number;
} {
  const calle = String(raw.calle ?? "").trim();
  const numero = String(raw.numero ?? "").trim();
  const cp = String(raw.cp ?? "").trim();

  const direccion = [
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

  const precioinmo = Number(raw.precioinmo) || 0;
  const precioalq = Number(raw.precioalq) || 0;
  const tipoOperacion: "VENTA" | "ALQUILER" =
    precioalq > 0 && precioinmo === 0 ? "ALQUILER" : "VENTA";
  const precio = tipoOperacion === "ALQUILER" ? precioalq : precioinmo;

  return { direccion, tipoOperacion, precio };
}
