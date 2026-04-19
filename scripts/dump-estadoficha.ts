/**
 * Descarga los valores del enum "estadoficha" (Estado de la propiedad) de Inmovilla.
 *
 * Requiere: INMOVILLA_API_TOKEN en .env
 * Ejecutar: npx tsx scripts/dump-estadoficha.ts
 *
 * Opción:
 *   --persist   Guarda los resultados en InmovillaEnumTipo (Neon) además de imprimirlos.
 */

import "dotenv/config";
import { createInmovillaRestClient, getTiposByTipo } from "@/lib/inmovilla/rest";
import { prisma } from "@/lib/prisma";

const ENUM_NAME = "estadoficha";

async function main() {
  const token = process.env.INMOVILLA_API_TOKEN;
  if (!token) {
    console.error("Configura INMOVILLA_API_TOKEN en .env");
    process.exit(1);
  }

  const persist = process.argv.includes("--persist");
  const client = createInmovillaRestClient({ token });

  console.log(`Descargando enum "${ENUM_NAME}" desde Inmovilla...`);
  const items = await getTiposByTipo(client, ENUM_NAME);

  if (items.length === 0) {
    console.warn("La API no devolvió valores para estadoficha.");
    console.warn("Verifica que el token es válido y que el tipo existe.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\nResultados (${items.length} valores):\n`);
  console.log("valor | nombre");
  console.log("------|-------");
  for (const item of items.sort((a, b) => a.valor - b.valor)) {
    console.log(`${String(item.valor).padStart(5)} | ${item.nombre}`);
  }

  if (persist) {
    console.log("\nPersistiendo en InmovillaEnumTipo...");
    for (const item of items) {
      const existing = await prisma.inmovillaEnumTipo.findFirst({
        where: { tipo: ENUM_NAME, valor: item.valor },
      });
      if (existing) {
        await prisma.inmovillaEnumTipo.update({
          where: { id: existing.id },
          data: { nombre: item.nombre },
        });
      } else {
        await prisma.inmovillaEnumTipo.create({
          data: { tipo: ENUM_NAME, nombre: item.nombre, valor: item.valor },
        });
      }
    }
    console.log(`${items.length} registros persistidos con tipo="${ENUM_NAME}".`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
