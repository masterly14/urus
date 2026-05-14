/**
 * Backfill de calidad para listings Idealista (`source_d`).
 *
 * Objetivos:
 *  1) Encolar `MARKET_FETCH_DETAIL` para listings sin telefono.
 *  2) Limpiar `zone` contaminada con prefijos tipo "Piso en ...".
 *  3) Opcionalmente poblar `addressApprox` cuando la zona limpiada parece calle.
 *
 * Seguridad:
 *  - DRY RUN por defecto (`MARKET_BACKFILL_DRY_RUN=1`).
 *  - Para aplicar cambios reales, usar `MARKET_BACKFILL_DRY_RUN=0`.
 *
 * Uso:
 *  - Preview:
 *      npx tsx scripts/backfill-idealista-listings.ts
 *  - Ejecutar:
 *      $env:MARKET_BACKFILL_DRY_RUN="0"; npx tsx scripts/backfill-idealista-listings.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/lib/job-queue";

const DEFAULT_BATCH_SIZE = Number(process.env.MARKET_BACKFILL_BATCH_SIZE ?? 300);
const DRY_RUN = String(process.env.MARKET_BACKFILL_DRY_RUN ?? "1") !== "0";
const ENQUEUE_DETAIL = String(process.env.MARKET_BACKFILL_ENQUEUE_DETAIL ?? "1") !== "0";
const CLEAN_ZONE = String(process.env.MARKET_BACKFILL_CLEAN_ZONE ?? "1") !== "0";
const PATCH_ADDRESS = String(process.env.MARKET_BACKFILL_PATCH_ADDRESS ?? "1") !== "0";

// Mismos prefijos que el parser (workers/market-worker/.../parser.ts).
// Cubre titulos tipo "Casa o chalet independiente en ...", "Chalet adosado
// en ...", etc. Mantener sincronizado con el parser.
const HOUSING_TERM =
  "(?:piso|casa|chalet|d[uú]plex|[áa]tico|estudio|loft|vivienda|apartamento|finca|terreno)";
const HOUSING_QUALIFIER =
  "(?:\\s+(?:independiente|adosad[oa]|pareado|unifamiliar|de\\s+pueblo|r[úu]stic[oa]))?";
const LOCATION_PREFIX_RE = new RegExp(
  `^(?:${HOUSING_TERM}(?:\\s+(?:o|y)\\s+${HOUSING_TERM})?${HOUSING_QUALIFIER})\\s+en\\s+`,
  "i",
);

function cleanZone(value: string): string {
  return value.replace(LOCATION_PREFIX_RE, "").replace(/\s+/g, " ").trim();
}

function looksLikeStreet(value: string): boolean {
  const v = value.toLowerCase();
  return (
    /(?:calle|avenida|av\.|plaza|paseo|camino|carretera|ronda|pasaje)\b/i.test(v) ||
    /,\s*\d{1,4}\b/.test(v)
  );
}

async function main(): Promise<void> {
  console.log(
    `[backfill-idealista] start dryRun=${DRY_RUN} batchSize=${DEFAULT_BATCH_SIZE} enqueueDetail=${ENQUEUE_DETAIL} cleanZone=${CLEAN_ZONE} patchAddress=${PATCH_ADDRESS}`,
  );

  // Para detalle: solo particulares sin telefono. Las agencias en Idealista
  // saturan la cola sin aportar telefonos.
  const detailTargets = await prisma.marketListing.findMany({
    where: {
      source: "source_d",
      advertiserType: "particular",
      phones: { isEmpty: true },
    },
    orderBy: { lastSeenAt: "desc" },
    take: DEFAULT_BATCH_SIZE,
    select: { id: true },
  });

  // Para limpieza de zone/address: cualquier listing source_d con zone sucia.
  const cleanupCandidates = await prisma.marketListing.findMany({
    where: { source: "source_d" },
    orderBy: { lastSeenAt: "desc" },
    take: DEFAULT_BATCH_SIZE,
    select: {
      id: true,
      zone: true,
      addressApprox: true,
      phones: true,
    },
  });

  let detailCandidates = 0;
  let detailEnqueued = 0;
  let zoneCandidates = 0;
  let zoneUpdated = 0;
  let addressPatched = 0;

  const minuteBucket = Math.floor(Date.now() / 60_000);

  if (ENQUEUE_DETAIL) {
    for (const row of detailTargets) {
      detailCandidates++;
      const idempotencyKey = `market:fetch-detail:backfill:${row.id}:${minuteBucket}`;
      if (!DRY_RUN) {
        try {
          await enqueueJob({
            type: "MARKET_FETCH_DETAIL",
            payload: { listingId: row.id },
            idempotencyKey,
            priority: 280,
          });
          detailEnqueued++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (/Unique constraint|P2002/i.test(message)) {
            // Ya encolado con la misma key.
          } else {
            console.warn(
              `[backfill-idealista] no se pudo encolar detalle listing=${row.id}: ${message}`,
            );
          }
        }
      }
    }
  }

  if (CLEAN_ZONE) {
    for (const row of cleanupCandidates) {
      if (row.zone && LOCATION_PREFIX_RE.test(row.zone)) {
        const cleaned = cleanZone(row.zone);
        if (cleaned && cleaned !== row.zone) {
          zoneCandidates++;
          const nextAddress =
            PATCH_ADDRESS && !row.addressApprox && looksLikeStreet(cleaned) ? cleaned : null;
          if (!DRY_RUN) {
            await prisma.marketListing.update({
              where: { id: row.id },
              data: {
                zone: cleaned,
                addressApprox: nextAddress ?? undefined,
              },
            });
            zoneUpdated++;
            if (nextAddress) addressPatched++;
          }
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        detailTargets: detailTargets.length,
        cleanupCandidates: cleanupCandidates.length,
        detailCandidates,
        detailEnqueued: DRY_RUN ? detailCandidates : detailEnqueued,
        zoneCandidates,
        zoneUpdated: DRY_RUN ? zoneCandidates : zoneUpdated,
        addressPatched: DRY_RUN ? "preview" : addressPatched,
        dryRun: DRY_RUN,
      },
      null,
      2,
    ),
  );
  console.log("[backfill-idealista] done");
}

main()
  .catch((err) => {
    console.error("[backfill-idealista] fatal", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
