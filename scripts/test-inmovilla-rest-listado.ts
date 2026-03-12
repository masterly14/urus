/**
 * Prueba del cliente REST de Inmovilla: GET /propiedades/?listado.
 * Requiere INMOVILLA_API_TOKEN en .env
 *
 * Ejecutar: npx tsx scripts/test-inmovilla-rest-listado.ts
 */

import "dotenv/config";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest";
import type { PropiedadListadoItem } from "@/lib/inmovilla/rest";

function isListadoItem(value: unknown): value is PropiedadListadoItem {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.cod_ofer === "number" &&
    typeof o.ref === "string" &&
    typeof o.nodisponible === "boolean" &&
    typeof o.prospecto === "boolean" &&
    typeof o.fechaact === "string"
  );
}

async function main() {
  const token = process.env.INMOVILLA_API_TOKEN;
  if (!token) {
    console.error("Configura INMOVILLA_API_TOKEN en .env");
    process.exit(1);
  }

  const client = createInmovillaRestClient({ token });
  const data = await client.get<PropiedadListadoItem[]>("/propiedades/", {
    listado: true,
  });

  if (!Array.isArray(data)) {
    console.error("Respuesta inesperada: se esperaba un array", data);
    process.exit(1);
  }

  console.log(`Listado propiedades: ${data.length} ítems`);
  if (data.length > 0) {
    const first = data[0];
    if (!isListadoItem(first)) {
      console.error("Primer ítem no cumple PropiedadListadoItem:", first);
      process.exit(1);
    }
    console.log("Primer ítem:", {
      cod_ofer: first.cod_ofer,
      ref: first.ref,
      nodisponible: first.nodisponible,
      prospecto: first.prospecto,
      fechaact: first.fechaact,
    });
  }
  console.log("OK — cliente REST tipado y listado verificado.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
