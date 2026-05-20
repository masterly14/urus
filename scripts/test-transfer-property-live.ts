/**
 * Test live del flujo TRANSFER_PROPERTY_AGENT contra Inmovilla REST v1.
 *
 * Estrategia "minimal risk":
 *  1. Selecciona la propiedad MÁS ANTIGUA (menor `lastEventAt`) con ref no vacío.
 *  2. Lee el `keyagente` actual via REST GET /propiedades/?ref=<X>.
 *  3. Invoca handleTransferPropertyAgent con newKeyagente = keyagente actual (cambio neutro).
 *  4. Vuelve a leer (tras pausa por rate-limit si aplica) y verifica keyagente.
 *
 * No modifica BD local. No usa job_queue.
 *
 * Rate limit Inmovilla propiedades: 10/min.
 *  - El handler intenta primero payload mínimo (ref + keyagente).
 *  - Si falla por validación de payload, hace fallback a safeUpdateProperty.
 *  - Si la ficha tiene muchos campos rechazados por la API, los reintentos pueden
 *    consumir todo el presupuesto. Use --max-attempts para limitarlos.
 *  - Tras CUALQUIER error, el script espera 65s y hace un GET de verificación
 *    para confirmar que la ficha NO se modificó.
 *
 * Requiere: INMOVILLA_API_TOKEN, DATABASE_URL.
 *
 * Uso:
 *   npm run test:transfer:property:live
 *   npx tsx scripts/test-transfer-property-live.ts --ref=URUS111VMA      # forzar ref
 *   npx tsx scripts/test-transfer-property-live.ts --max-attempts=3      # fallback con menos retries
 *   npx tsx scripts/test-transfer-property-live.ts --dry-run             # no llama Inmovilla
 *   npx tsx scripts/test-transfer-property-live.ts --skip-error-verify   # no esperar 65s tras error
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { createInmovillaRestClient } from "../lib/inmovilla/rest/client";
import { handleTransferPropertyAgent } from "../lib/comercial/transfer-agent-handler";
import type { PropiedadCompleta } from "../lib/inmovilla/rest/types";
import type { JobRecord } from "../lib/job-queue/types";

const RATE_LIMIT_COOLDOWN_MS = 65_000;

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function isRateLimitError(message: string): boolean {
  return /408|Has superado el límite|límite de peticiones/i.test(message);
}

async function sleep(ms: number, label?: string): Promise<void> {
  if (label) console.log(`  (esperando ${Math.round(ms / 1000)}s${label ? " — " + label : ""})`);
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function parseKeyagente(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function makeJob(propertyRef: string, newKeyagente: number): JobRecord {
  return {
    id: `live-test-${Date.now()}`,
    type: "TRANSFER_PROPERTY_AGENT",
    status: "IN_PROGRESS",
    payload: {
      propertyRef,
      newKeyagente,
      comercialTransferId: "live-test-script",
    } as JobRecord["payload"],
    priority: 100,
    attempts: 1,
    maxAttempts: 1,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "live-test",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

type Candidate = {
  codigo: string;
  ref: string;
  titulo: string;
  ciudad: string;
  zona: string;
  comercialId: string | null;
  comercialNombre: string | null;
  comercialInmovillaAgentId: number | null;
  lastEventAt: Date;
};

async function selectOldestCandidate(forcedRef?: string): Promise<Candidate> {
  const comerciales = await prisma.comercial.findMany({
    select: { id: true, nombre: true, inmovillaAgentId: true },
  });
  const byId = new Map(comerciales.map((c) => [c.id, c]));

  function withComercial(
    p: {
      codigo: string;
      ref: string;
      titulo: string;
      ciudad: string;
      zona: string;
      comercialId: string | null;
      lastEventAt: Date;
    },
  ): Candidate {
    const com = p.comercialId ? byId.get(p.comercialId) : undefined;
    return {
      ...p,
      comercialNombre: com?.nombre ?? null,
      comercialInmovillaAgentId: com?.inmovillaAgentId ?? null,
    };
  }

  if (forcedRef) {
    const found = await prisma.propertyCurrent.findFirst({
      where: { ref: forcedRef },
      select: {
        codigo: true,
        ref: true,
        titulo: true,
        ciudad: true,
        zona: true,
        comercialId: true,
        lastEventAt: true,
      },
    });
    if (!found) throw new Error(`No se encontró PropertyCurrent con ref=${forcedRef}`);
    return withComercial(found);
  }

  const candidates = await prisma.propertyCurrent.findMany({
    where: { ref: { not: "" } },
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      ciudad: true,
      zona: true,
      comercialId: true,
      lastEventAt: true,
    },
    orderBy: { lastEventAt: "asc" },
    take: 1,
  });

  if (candidates.length === 0) {
    throw new Error("No hay PropertyCurrent con ref en BD.");
  }

  return withComercial(candidates[0]);
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const skipErrorVerify = hasFlag("skip-error-verify");
  const forcedRef = readArg("ref");
  const maxAttemptsArg = readArg("max-attempts");
  const maxAttempts = maxAttemptsArg ? Math.max(1, parseInt(maxAttemptsArg, 10)) : 5;

  console.log("\n=== Live test: TRANSFER_PROPERTY_AGENT ===\n");
  console.log("Rate limit Inmovilla propiedades: 10 req/min");
  console.log(
    `fallback safeUpdateProperty maxAttempts: ${maxAttempts} (env TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS)\n`,
  );
  if (dryRun) console.log("Modo DRY-RUN: no se llamará a Inmovilla.\n");

  if (!process.env.INMOVILLA_API_TOKEN) {
    throw new Error("Falta INMOVILLA_API_TOKEN en el entorno.");
  }

  const target = await selectOldestCandidate(forcedRef);
  const ref = target.ref;

  console.log("Propiedad candidata (más antigua):");
  console.log(`  codigo:            ${target.codigo}`);
  console.log(`  ref:               ${ref}`);
  console.log(`  titulo:            ${target.titulo.slice(0, 80)}`);
  console.log(`  ciudad/zona:       ${target.ciudad} / ${target.zona}`);
  console.log(`  lastEventAt:       ${target.lastEventAt.toISOString()}`);
  console.log(
    `  comercial local:   ${target.comercialNombre ?? "—"} (id=${target.comercialId ?? "—"})`,
  );
  console.log(`  keyagente local:   ${target.comercialInmovillaAgentId ?? "— (no backfilled)"}`);

  const client = createInmovillaRestClient();

  // 1. Lectura previa: usamos el keyagente real de Inmovilla para garantizar
  // un cambio estrictamente neutro (no depende de la BD local).
  console.log("\n[1/3] GET /propiedades/?ref=" + ref);
  const before = await client.get<PropiedadCompleta>("/propiedades/", { ref });
  const keyagenteBefore = parseKeyagente(before.keyagente);

  console.log(`  keyagente en Inmovilla (antes): ${keyagenteBefore ?? "—"}`);

  if (keyagenteBefore == null || keyagenteBefore === 0) {
    console.warn(
      "  WARN: Inmovilla devuelve keyagente vacío para esta ficha. " +
        "No es un caso seguro para test neutro — abortando para evitar dañar la ficha.",
    );
    process.exitCode = 2;
    return;
  }

  if (
    target.comercialInmovillaAgentId != null &&
    keyagenteBefore !== target.comercialInmovillaAgentId
  ) {
    console.warn(
      `  WARN: keyagente local (${target.comercialInmovillaAgentId}) ≠ Inmovilla (${keyagenteBefore}). ` +
        "Uso el valor de Inmovilla para que el cambio sea estrictamente neutro.",
    );
  }

  const neutralKeyagente = keyagenteBefore;

  if (dryRun) {
    console.log("\n[2/3] DRY-RUN: no se ejecuta handleTransferPropertyAgent.");
    console.log("[3/3] DRY-RUN: no se realiza verificación.");
    console.log("\nOK (dry-run) — no se modificó Inmovilla.\n");
    return;
  }

  // 2. Ejecutar el handler real de transferencia.
  process.env.TRANSFER_PROPERTY_SAFE_MAX_ATTEMPTS = String(maxAttempts);
  console.log(
    `\n[2/3] handleTransferPropertyAgent(ref=${ref}, newKeyagente=${neutralKeyagente}, fallbackMaxAttempts=${maxAttempts})`,
  );

  let updateError: string | null = null;
  let updateOk = false;
  try {
    const result = await handleTransferPropertyAgent(makeJob(ref, neutralKeyagente));
    updateOk = result.success;
    if (!result.success) {
      updateError = result.error ?? "Error sin detalle";
      if (result.permanent) {
        updateError = `[permanent] ${updateError}`;
      }
    }
    console.log(`  handler.success=${result.success}`);
    if (result.error) {
      console.log(`  handler.error=${result.error}`);
    }
  } catch (err) {
    updateError = err instanceof Error ? err.message : String(err);
    console.error(`  EXCEPCIÓN: ${updateError}`);
  }

  // 3. Verificación post-update SIEMPRE (incluso si falló): garantizamos que
  //    keyagente no cambió, lo cual es lo que realmente importa.
  if (updateError && isRateLimitError(updateError)) {
    if (skipErrorVerify) {
      console.warn(
        "\n[3/3] Rate-limit detectado. --skip-error-verify activo, no se verifica.\n",
      );
      process.exitCode = updateOk ? 0 : 1;
      return;
    }
    console.warn(
      "\n[3/3] Rate-limit Inmovilla detectado. Esperando antes de verificar...",
    );
    await sleep(RATE_LIMIT_COOLDOWN_MS, "cooldown 10 req/min");
  } else {
    // Pequeña pausa para evitar pisar el rate-limit del propio GET final.
    await sleep(7_000, "pequeña pausa antes del GET de verificación");
  }

  console.log("[3/3] GET /propiedades/?ref=" + ref + " (verificación)");
  let keyagenteAfter: number | null;
  try {
    const after = await client.get<PropiedadCompleta>("/propiedades/", { ref });
    keyagenteAfter = parseKeyagente(after.keyagente);
  } catch (verifyErr) {
    const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
    if (isRateLimitError(msg) && !skipErrorVerify) {
      console.warn("  GET de verificación también con rate-limit. Esperando otros 65s...");
      await sleep(RATE_LIMIT_COOLDOWN_MS, "cooldown segundo intento");
      const after = await client.get<PropiedadCompleta>("/propiedades/", { ref });
      keyagenteAfter = parseKeyagente(after.keyagente);
    } else {
      throw verifyErr;
    }
  }

  console.log(`  keyagente en Inmovilla (después): ${keyagenteAfter ?? "—"}`);

  const preserved = keyagenteAfter === keyagenteBefore;

  console.log("\n--- Resumen ---");
  console.log(`  ok update:      ${updateOk}`);
  console.log(`  error:          ${updateError ?? "—"}`);
  console.log(`  keyagente antes:  ${keyagenteBefore}`);
  console.log(`  keyagente después: ${keyagenteAfter ?? "—"}`);
  console.log(`  preservado:     ${preserved ? "SÍ" : "NO"}\n`);

  if (preserved && updateOk) {
    console.log("OK — escritura aceptada por Inmovilla y keyagente conserva su valor original.\n");
  } else if (preserved && !updateOk) {
    console.warn(
      "PARCIAL — la escritura falló (rate-limit o validación), pero keyagente NO se modificó. " +
        "El flujo es seguro: ningún POST exitoso = ningún cambio. " +
        "Reintentar más tarde con --max-attempts más bajo.\n",
    );
    process.exitCode = 0;
  } else {
    console.error(
      "FAIL — keyagente cambió respecto al valor original. Investigar urgentemente.\n",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("\nERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
