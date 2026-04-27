import { prisma } from "@/lib/prisma";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import {
  getOwnerByPropertyCode,
  mapOwnerToPropertyOwnerPatch,
} from "@/lib/inmovilla/rest/owners";
import type { PropertyOwnerPatch } from "@/lib/inmovilla/rest/types";

const CHECKPOINT_KEY = "backfill:owners:lastCodigo";
const DEFAULT_BATCH_SIZE = 50;
const OWNER_REQUEST_INTERVAL_MS = Number(
  process.env.OWNERS_BACKFILL_DELAY_MS || "3500",
);

type CliOptions = {
  dryRun: boolean;
  resume: boolean;
  limit: number | null;
  fromCodigo: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    resume: true,
    limit: null,
    fromCodigo: null,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--no-resume") options.resume = false;
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (Number.isFinite(value) && value > 0) options.limit = Math.floor(value);
    }
    if (arg.startsWith("--from-codigo=")) {
      options.fromCodigo = arg.slice("--from-codigo=".length).trim() || null;
    }
  }

  return options;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCheckpoint(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT "value" FROM "kv_store" WHERE "key" = ${CHECKPOINT_KEY} LIMIT 1
  `;
  return rows[0]?.value ?? null;
}

async function saveCheckpoint(codigo: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "kv_store" ("key", "value", "updatedAt")
    VALUES (${CHECKPOINT_KEY}, ${codigo}, NOW())
    ON CONFLICT ("key")
    DO UPDATE SET "value" = ${codigo}, "updatedAt" = NOW()
  `;
}

function hasPatch(patch: PropertyOwnerPatch): boolean {
  return Object.keys(patch).length > 0;
}

async function applyOwnerPatch(
  codigo: string,
  patch: PropertyOwnerPatch,
  dryRun: boolean,
): Promise<boolean> {
  if (!hasPatch(patch)) return false;
  if (dryRun) return true;

  await prisma.propertyCurrent.update({
    where: { codigo },
    data: patch,
  });
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = createInmovillaRestClient();
  const checkpoint = options.resume ? await loadCheckpoint() : null;
  let cursor = options.fromCodigo ?? checkpoint;
  let processed = 0;
  let found = 0;
  let updated = 0;
  let missing = 0;
  let errors = 0;

  console.log("[owners:backfill] inicio", {
    dryRun: options.dryRun,
    resume: options.resume,
    fromCodigo: cursor,
    limit: options.limit,
    delayMs: OWNER_REQUEST_INTERVAL_MS,
  });

  while (options.limit == null || processed < options.limit) {
    const remaining =
      options.limit == null
        ? DEFAULT_BATCH_SIZE
        : Math.min(DEFAULT_BATCH_SIZE, options.limit - processed);
    const batch = await prisma.propertyCurrent.findMany({
      where: cursor ? { codigo: { gt: cursor } } : {},
      select: { codigo: true, ref: true },
      orderBy: { codigo: "asc" },
      take: remaining,
    });

    if (batch.length === 0) break;

    for (const property of batch) {
      try {
        const owner = await getOwnerByPropertyCode(client, property.codigo);
        const patch = mapOwnerToPropertyOwnerPatch(owner);
        if (hasPatch(patch)) {
          found++;
          if (await applyOwnerPatch(property.codigo, patch, options.dryRun)) {
            updated++;
          }
        } else {
          missing++;
        }

        cursor = property.codigo;
        processed++;
        if (!options.dryRun) await saveCheckpoint(property.codigo);

        console.log("[owners:backfill] propiedad procesada", {
          codigo: property.codigo,
          ref: property.ref,
          hasOwner: hasPatch(patch),
          processed,
        });
      } catch (err) {
        errors++;
        console.warn("[owners:backfill] error procesando propiedad", {
          codigo: property.codigo,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (options.limit != null && processed >= options.limit) break;
      await delay(OWNER_REQUEST_INTERVAL_MS);
    }
  }

  console.log("[owners:backfill] fin", {
    processed,
    found,
    updated,
    missing,
    errors,
    lastCodigo: cursor,
    dryRun: options.dryRun,
  });
}

main()
  .catch((err) => {
    console.error("[owners:backfill] fallo", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
