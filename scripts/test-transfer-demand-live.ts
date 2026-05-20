/**
 * Test live de la operación legacy `updateDemandAgent` contra Inmovilla
 * (vía writeToInmovilla → guardar.php → verify interno).
 *
 * Estrategia "minimal risk":
 *  1. Selecciona la demanda MÁS ANTIGUA (`lastSeenAt` ascendente) cuyo
 *     `DemandSnapshot.raw` tenga `keycli` y `keyagente` válidos.
 *  2. Encola/ejecuta `writeToInmovilla("updateDemandAgent", ...)` con
 *     `agentId === newAgentId === keyagente actual` (cambio neutro).
 *  3. Activa `verify: true` para que el operation-registry consulte la ficha
 *     después y confirme que `keyagente` no cambió.
 *
 * No modifica BD local. No usa job_queue. Una sola "escritura" en Inmovilla
 * (legacy guardar.php) + un GET de verificación.
 *
 * Requiere: DATABASE_URL, sesión Inmovilla en DB
 * (INMOVILLA_USER/PASSWORD para fallback Playwright).
 *
 * Uso:
 *   npm run test:transfer:demand:live
 *   npx tsx scripts/test-transfer-demand-live.ts --codigo=XXXXX
 *   npx tsx scripts/test-transfer-demand-live.ts --dry-run
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { writeToInmovilla, InmovillaWriteError } from "../lib/inmovilla/write";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type Candidate = {
  codigo: string;
  ref: string;
  nombre: string;
  agente: string;
  keycli: string;
  keyagente: string;
  tipos: string;
  comercialNombre: string | null;
};

async function selectOldestCandidate(forcedCodigo?: string): Promise<Candidate> {
  const where = forcedCodigo ? { codigo: forcedCodigo } : { ref: { not: "" } };

  const snapshots = await prisma.demandSnapshot.findMany({
    where,
    orderBy: { lastSeenAt: "asc" },
    select: { codigo: true, ref: true, nombre: true, agente: true, raw: true, tipos: true },
    take: 100,
  });

  if (snapshots.length === 0) {
    throw new Error("No hay DemandSnapshot en BD.");
  }

  for (const snap of snapshots) {
    const raw = (snap.raw ?? {}) as Record<string, unknown>;
    const keycli = raw.keycli;
    const keyagente = raw.keyagente;
    const keycliStr = keycli != null ? String(keycli).trim() : "";
    const keyagenteStr = keyagente != null ? String(keyagente).trim() : "";

    if (!keycliStr || !keyagenteStr || keycliStr === "0" || keyagenteStr === "0") continue;
    if (!snap.ref.trim()) continue;

    const current = await prisma.demandCurrent.findUnique({
      where: { codigo: snap.codigo },
      select: { comercialId: true },
    });
    let comercialNombre: string | null = null;
    if (current?.comercialId) {
      const com = await prisma.comercial.findUnique({
        where: { id: current.comercialId },
        select: { nombre: true },
      });
      comercialNombre = com?.nombre ?? null;
    }

    return {
      codigo: snap.codigo,
      ref: snap.ref,
      nombre: snap.nombre,
      agente: snap.agente,
      keycli: keycliStr,
      keyagente: keyagenteStr,
      tipos: snap.tipos,
      comercialNombre,
    };
  }

  throw new Error(
    "Ninguno de los snapshots más antiguos tiene keycli/keyagente válidos. Aumenta el LIMIT o pasa --codigo=XXX.",
  );
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const forcedCodigo = readArg("codigo");

  console.log("\n=== Live test: updateDemandAgent (legacy guardar.php) ===\n");
  if (dryRun) console.log("Modo DRY-RUN: no se llamará a Inmovilla.\n");

  const target = await selectOldestCandidate(forcedCodigo);

  console.log("Demanda candidata (más antigua con keycli/keyagente válidos):");
  console.log(`  codigo:         ${target.codigo}`);
  console.log(`  ref:            ${target.ref}`);
  console.log(`  nombre:         ${target.nombre.slice(0, 60)}`);
  console.log(`  agente snap:    ${target.agente}`);
  console.log(`  comercial loc:  ${target.comercialNombre ?? "—"}`);
  console.log(`  keycli:         ${target.keycli}`);
  console.log(`  keyagente:      ${target.keyagente}`);
  console.log(`  tipos:          ${target.tipos}`);

  if (dryRun) {
    console.log("\nDRY-RUN: no se ejecuta writeToInmovilla.\n");
    return;
  }

  console.log("\nLlamando writeToInmovilla('updateDemandAgent', ...) con agentId === newAgentId");
  try {
    const result = await writeToInmovilla(
      "updateDemandAgent",
      {
        demandId: target.codigo,
        demandRef: target.ref,
        clientId: target.keycli,
        agentId: target.keyagente,
        newAgentId: target.keyagente,
        propertyTypes: target.tipos,
      },
      {
        headless: true,
        retryOnSessionExpired: true,
        verify: true,
      },
    );

    console.log("\n--- WriteResult ---");
    console.log(`  operation:   ${result.operation}`);
    console.log(`  success:     ${result.success}`);
    console.log(`  demandId:    ${result.demandId}`);
    if (result.verification) {
      console.log(`  verify:      checked=${result.verification.checked}`);
      console.log(`  verify:      field=${result.verification.field}`);
      console.log(
        `  verify:      expected=${result.verification.expected} actual=${result.verification.actual}`,
      );
    } else {
      console.log("  verify:      (no ejecutado)");
    }

    if (
      result.verification?.checked &&
      String(result.verification.expected) === String(result.verification.actual)
    ) {
      console.log("\nOK — verify confirma que keyagente sigue siendo " + target.keyagente + ".\n");
    } else if (!result.verification) {
      console.warn("\nWARN — sin verify, no podemos confirmar el resultado.\n");
    } else {
      console.error(
        `\nFAIL — verify dice expected ≠ actual (` +
          `${result.verification.expected} vs ${result.verification.actual}).\n`,
      );
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof InmovillaWriteError) {
      console.error(`\nInmovillaWriteError code=${err.code}: ${err.message}`);
      if (err.details) console.error("  details:", err.details);
    } else {
      console.error("\nError inesperado:", err);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("\nERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
