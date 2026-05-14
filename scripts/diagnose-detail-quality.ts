/**
 * Diagnostico de calidad del detalle por portal.
 *
 * Despues de un sync (market:sync-local) con la nueva politica de
 * captura interactiva, mide en porcentaje cuantos listings de cada
 * portal tienen telefono, descripcion, fotos y referencias.
 *
 * Uso: npx tsx scripts/diagnose-detail-quality.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

interface Bucket {
  source: string;
  total: number;
  withPhone: number;
  withDescription: number;
  withImages: number; // imageUrls.length > 0
  withMultipleImages: number; // imageUrls.length >= 5
  withListingReference: number;
  withCadastralRef: number;
  detailFetched: number;
  detailNotFetched: number;
}

function pct(numerator: number, denom: number): string {
  if (denom === 0) return "—";
  return `${Math.round((numerator / denom) * 100)}%`;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const sources = ["source_a", "source_b", "source_c", "source_d"] as const;
    const buckets: Bucket[] = [];

    for (const source of sources) {
      const total = await prisma.marketListing.count({ where: { source } });
      if (total === 0) continue;

      const [
        withPhone,
        withDescription,
        withImages,
        withMultipleImages,
        withListingReference,
        withCadastralRef,
        detailFetched,
      ] = await Promise.all([
        prisma.marketListing.count({
          where: { source, phones: { isEmpty: false } },
        }),
        prisma.marketListing.count({
          where: { source, description: { not: null } },
        }),
        prisma.marketListing.count({
          where: { source, imageUrls: { isEmpty: false } },
        }),
        prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `select count(*)::bigint as count from market_listings
           where source = $1 and array_length("imageUrls", 1) >= 5`,
          source,
        ).then((rows) => Number(rows[0]?.count ?? 0)),
        prisma.marketListing.count({
          where: { source, listingReference: { not: null } },
        }),
        prisma.marketListing.count({
          where: { source, cadastralRef: { not: null } },
        }),
        prisma.marketListing.count({
          where: { source, detailFetchedAt: { not: null } },
        }),
      ]);

      buckets.push({
        source,
        total,
        withPhone,
        withDescription,
        withImages,
        withMultipleImages,
        withListingReference,
        withCadastralRef,
        detailFetched,
        detailNotFetched: total - detailFetched,
      });
    }

    console.log("=".repeat(90));
    console.log("DIAGNOSTICO DE CALIDAD DEL DETALLE — por portal");
    console.log("=".repeat(90));

    if (buckets.length === 0) {
      console.log("(BD vacia — nada que diagnosticar)");
      return;
    }

    for (const b of buckets) {
      console.log("");
      console.log(`${b.source} — total: ${b.total} listings`);
      console.log(`  detail enriquecido: ${b.detailFetched} / ${b.total} (${pct(b.detailFetched, b.total)})`);
      console.log(`  con telefono:       ${b.withPhone} (${pct(b.withPhone, b.total)})`);
      console.log(`  con descripcion:    ${b.withDescription} (${pct(b.withDescription, b.total)})`);
      console.log(`  con imagenes (>=1): ${b.withImages} (${pct(b.withImages, b.total)})`);
      console.log(`  con galeria (>=5):  ${b.withMultipleImages} (${pct(b.withMultipleImages, b.total)})`);
      console.log(`  con ref. anuncio:   ${b.withListingReference} (${pct(b.withListingReference, b.total)})`);
      console.log(`  con ref. catastral: ${b.withCadastralRef} (${pct(b.withCadastralRef, b.total)})`);
    }

    console.log("");
    console.log("=".repeat(90));
    console.log("OBJETIVOS (politica nueva, mayo 2026):");
    console.log(
      "  Idealista:  phones>=70%, description>=95%, images>=95%, ref.anuncio>=95%",
    );
    console.log(
      "  Pisos.com:  phones>=70%, description>=95%, images>=95%",
    );
    console.log(
      "  Fotocasa:   phones>=60%, description>=95%, images>=90%",
    );
    console.log("=".repeat(90));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
