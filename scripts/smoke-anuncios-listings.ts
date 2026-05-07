/**
 * Smoke: lib/market/listings.listOpportunityListings contra la BD real.
 *
 * Objetivo: detectar fallos de configuracion/contrato antes del deploy.
 * Llama al servicio sin poligono y con un poligono pequeño centrado en
 * Cordoba para verificar que:
 *  1. El filtro bbox SQL no tira ni el plan de query.
 *  2. El post-filter point-in-polygon descarta candidatos del bbox que
 *     caen fuera del poligono.
 *  3. La cursor pagination encadena correctamente.
 *
 * Variables: DATABASE_URL (lectura, sin escritura).
 *
 * Uso:
 *   npx tsx scripts/smoke-anuncios-listings.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { listOpportunityListings } from "../lib/market/listings";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    console.log("[smoke-anuncios] === conteo por source/status (DB real) ===");
    const grouped = await prisma.marketListing.groupBy({
      by: ["source", "status"],
      _count: { _all: true },
      where: { city: "cordoba" },
      orderBy: [{ source: "asc" }, { status: "asc" }],
    });
    for (const row of grouped) {
      console.log(`  ${row.source}/${row.status}: ${row._count._all}`);
    }

    console.log("[smoke-anuncios] === sin poligono ===");
    const all = await listOpportunityListings({
      city: "cordoba",
      limit: 5,
    });
    console.log(
      `  totalEstimated=${all.meta.totalEstimated} returned=${all.items.length} cursor=${all.cursor ? "yes" : "no"}`,
    );
    if (all.items[0]) {
      const it = all.items[0];
      console.log(
        `  sample: ${it.source} ${it.city}/${it.zone ?? "-"} price=${it.price} ppm=${it.pricePerMeter} hab=${it.rooms} phone=${it.phoneCanonical ?? "-"} lat=${it.lat ?? "-"} lng=${it.lng ?? "-"}`,
      );
    }

    console.log("[smoke-anuncios] === con poligono pequeno (centro Cordoba) ===");
    const polygon: Array<[number, number]> = [
      [-4.795, 37.875],
      [-4.77, 37.875],
      [-4.77, 37.9],
      [-4.795, 37.9],
    ];
    const inArea = await listOpportunityListings({
      city: "cordoba",
      polygon,
      limit: 5,
    });
    console.log(
      `  totalEstimated(bbox)=${inArea.meta.totalEstimated} returned=${inArea.items.length} polygonApplied=${inArea.meta.polygonApplied} sourcesWithoutCoords=${inArea.meta.sourcesWithoutCoords.join(",")}`,
    );
    if (inArea.items[0]) {
      const it = inArea.items[0];
      console.log(
        `  sample: ${it.source} lat=${it.lat} lng=${it.lng} (deberia caer dentro del cuadrado)`,
      );
    }

    if (all.cursor) {
      console.log("[smoke-anuncios] === pagina 2 (sin poligono) ===");
      const page2 = await listOpportunityListings({
        city: "cordoba",
        limit: 5,
        cursor: all.cursor,
      });
      console.log(
        `  returned=${page2.items.length} (deberia ser >0 si total > 5)`,
      );
    }

    console.log("[smoke-anuncios] OK");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[smoke-anuncios] FAIL:", err);
  process.exit(1);
});
