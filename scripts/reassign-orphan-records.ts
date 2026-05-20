/**
 * reassign-orphan-records.ts
 *
 * Reasigna las propiedades y demandas con comercialId=null a los comerciales
 * activos correctos, usando dos criterios en cascada:
 *
 *   1. extractRefCode(ref) → mapa explícito de refCode histórico → comercial activo
 *   2. agente (nombre textual) → mapa explícito de nombre → comercial activo
 *
 * Por qué no basta el backfill genérico:
 *   El FEDE activo tiene inmovillaRefCode="FJ", pero los registros históricos
 *   que le pertenecen tienen extractRefCode="FEDE" (emitidos por FEDERICO JESÚS).
 *   Los registros "SF" pertenecen a otro ex-comercial no vinculado y se asignan
 *   a Miguel por defecto según decisión del negocio.
 *
 * Mapa de asignación configurado:
 *   refCode FEDE → FEDE activo  (fedejraos@gmail.com)
 *   refCode SF   → Miguel       (miguelangelcarrilloramos@gmail.com)
 *   agente "FEDERICO JESÚS" → FEDE activo
 *   agente "Samuel"         → Miguel
 *   agente "" / desconocido → Miguel (catch-all)
 *
 * Ejecución (dry-run):  npx tsx scripts/reassign-orphan-records.ts
 * Ejecución (real):     npx tsx scripts/reassign-orphan-records.ts --apply
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { extractRefCode } from "../lib/routing/parse-ref-code";

const APPLY = process.argv.includes("--apply");
const SEP = "─".repeat(72);

function h(s: string) { console.log(`\n${SEP}\n  ${s}\n${SEP}`); }
function ok(s: string) { console.log(`  ✅  ${s}`); }
function tag(s: string) { console.log(`  ${APPLY ? "→" : "  [dry]"}  ${s}`); }

// ── Mapa de decisión de negocio ──────────────────────────────────────────────

/**
 * refCode (de extractRefCode) → id del comercial activo al que se asigna.
 * Añadir más entradas si aparecen nuevos refCodes históricos.
 */
const REF_CODE_MAP: Record<string, "fede" | "miguel"> = {
  FEDE: "fede",  // registros de FEDERICO JESÚS (ex-comercial)
  FJ:   "fede",  // registros del FEDE actual (por si hubiera alguno huérfano)
  SF:   "miguel", // ex-comercial sin User, catch-all → Miguel
};

/**
 * agente (nombre textual) → id del comercial activo.
 * Se usa cuando ref no tiene patrón URUS (ej. demandas con ref numérico).
 */
const AGENTE_MAP: Record<string, "fede" | "miguel"> = {
  "FEDERICO JESÚS": "fede",
  "FEDE":           "fede",
  "Samuel":         "miguel",
  "SERGIO":         "miguel",
};

/** Catch-all: qué comercial recibe los registros que no encajan en ningún mapa. */
const FALLBACK: "fede" | "miguel" = "miguel";

// ── Resolución ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  Reasignación de registros huérfanos — Urus Capital    ║`);
  console.log(`║  Modo: ${APPLY ? "APPLY (escribe en BD)           " : "DRY RUN (solo lectura)           "}  ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  if (!APPLY) console.log("  Pasa --apply para persistir los cambios.\n");

  // Cargar los dos comerciales activos con User
  h("Cargando comerciales activos");

  const activos = await prisma.comercial.findMany({
    where: { activo: true, user: { isNot: null } },
    select: {
      id: true,
      nombre: true,
      inmovillaRefCode: true,
      user: { select: { email: true } },
    },
    orderBy: { nombre: "asc" },
  });

  if (activos.length === 0) {
    console.error("  ❌  No hay comerciales activos con User. Abortar.");
    process.exit(1);
  }

  for (const c of activos) {
    console.log(`    • "${c.nombre}"  refCode=${c.inmovillaRefCode ?? "—"}  email=${c.user?.email}`);
  }

  // Construir lookup local: "fede" | "miguel" → Comercial
  const byKey = (key: "fede" | "miguel") => {
    // "fede" → el que tiene refCode=FJ o nombre empiece por FEDE
    if (key === "fede") {
      return activos.find(
        (c) =>
          c.inmovillaRefCode?.toUpperCase() === "FJ" ||
          c.nombre.toUpperCase().startsWith("FEDE"),
      );
    }
    // "miguel" → el que tiene refCode=MA o nombre empiece por MIGU
    return activos.find(
      (c) =>
        c.inmovillaRefCode?.toUpperCase() === "MA" ||
        c.nombre.toUpperCase().startsWith("MIGU"),
    );
  };

  const COMERCIAL: Record<"fede" | "miguel", (typeof activos)[0] | undefined> = {
    fede:   byKey("fede"),
    miguel: byKey("miguel"),
  };

  if (!COMERCIAL.fede || !COMERCIAL.miguel) {
    console.error(
      `  ❌  No se pudo resolver ambos comerciales.\n` +
        `     FEDE:   ${COMERCIAL.fede?.nombre ?? "NO ENCONTRADO"}\n` +
        `     Miguel: ${COMERCIAL.miguel?.nombre ?? "NO ENCONTRADO"}\n` +
        `  Verifica que existen comerciales activos con refCode=FJ y MA.`,
    );
    process.exit(1);
  }

  console.log(`\n  Resolución:`);
  console.log(`    fede   → "${COMERCIAL.fede.nombre}"  (${COMERCIAL.fede.id})`);
  console.log(`    miguel → "${COMERCIAL.miguel.nombre}"  (${COMERCIAL.miguel.id})`);

  // ── PROPIEDADES ──────────────────────────────────────────────────────────
  h("PROPIEDADES con comercialId=null");

  const props = await prisma.propertyCurrent.findMany({
    where: { comercialId: null },
    select: { codigo: true, ref: true, agente: true },
    orderBy: { codigo: "asc" },
  });

  console.log(`  Total: ${props.length}\n`);

  const propStats = { fede: 0, miguel: 0, unresolved: 0 };

  for (const p of props) {
    const refCode = extractRefCode(p.ref);
    let destKey: "fede" | "miguel" | null = null;
    let reason = "";

    if (refCode && REF_CODE_MAP[refCode.toUpperCase()]) {
      destKey = REF_CODE_MAP[refCode.toUpperCase()];
      reason = `refCode=${refCode}`;
    } else {
      const agenteNorm = p.agente?.trim() ?? "";
      if (agenteNorm && AGENTE_MAP[agenteNorm]) {
        destKey = AGENTE_MAP[agenteNorm];
        reason = `agente="${agenteNorm}"`;
      } else {
        destKey = FALLBACK;
        reason = `fallback (agente="${p.agente ?? ""}", refCode=${refCode ?? "—"})`;
      }
    }

    const dest = COMERCIAL[destKey]!;
    const label = `${p.codigo}  ref="${p.ref}"  → ${reason}  → "${dest.nombre}"`;

    if (APPLY) {
      await prisma.propertyCurrent.update({
        where: { codigo: p.codigo },
        data: { comercialId: dest.id, agente: dest.nombre },
      });
    }

    tag(label);
    propStats[destKey]++;
  }

  console.log(`\n  Resumen propiedades:`);
  console.log(`    → "${COMERCIAL.fede.nombre}":   ${propStats.fede}`);
  console.log(`    → "${COMERCIAL.miguel.nombre}": ${propStats.miguel}`);

  // ── DEMANDAS ─────────────────────────────────────────────────────────────
  h("DEMANDAS con comercialId=null");

  const dems = await prisma.demandCurrent.findMany({
    where: { comercialId: null },
    select: { codigo: true, ref: true, agente: true },
    orderBy: { codigo: "asc" },
  });

  console.log(`  Total: ${dems.length}\n`);

  const demStats = { fede: 0, miguel: 0, unresolved: 0 };

  for (const d of dems) {
    const refCode = extractRefCode(d.ref);
    let destKey: "fede" | "miguel" | null = null;
    let reason = "";

    // Las refs de demandas son números de demanda (ej. "1062"), no patrón URUS.
    // El criterio principal es el agente; refCode como primer intento igualmente.
    if (refCode && REF_CODE_MAP[refCode.toUpperCase()]) {
      destKey = REF_CODE_MAP[refCode.toUpperCase()];
      reason = `refCode=${refCode}`;
    } else {
      const agenteNorm = d.agente?.trim() ?? "";
      if (agenteNorm && AGENTE_MAP[agenteNorm]) {
        destKey = AGENTE_MAP[agenteNorm];
        reason = `agente="${agenteNorm}"`;
      } else {
        destKey = FALLBACK;
        reason = `fallback (agente="${d.agente ?? ""}", refCode=${refCode ?? "—"})`;
      }
    }

    const dest = COMERCIAL[destKey]!;
    const label = `${d.codigo}  agente="${d.agente}"  → ${reason}  → "${dest.nombre}"`;

    if (APPLY) {
      await prisma.demandCurrent.update({
        where: { codigo: d.codigo },
        data: { comercialId: dest.id, agente: dest.nombre },
      });
    }

    tag(label);
    demStats[destKey]++;
  }

  console.log(`\n  Resumen demandas:`);
  console.log(`    → "${COMERCIAL.fede.nombre}":   ${demStats.fede}`);
  console.log(`    → "${COMERCIAL.miguel.nombre}": ${demStats.miguel}`);

  // ── Resumen final ────────────────────────────────────────────────────────
  h("Resumen final");

  const total = props.length + dems.length;
  const totalFede = propStats.fede + demStats.fede;
  const totalMiguel = propStats.miguel + demStats.miguel;

  console.log(`
  Total registros procesados: ${total}
    → "${COMERCIAL.fede.nombre}":   ${totalFede} (${Math.round((totalFede / total) * 100)}%)
    → "${COMERCIAL.miguel.nombre}": ${totalMiguel} (${Math.round((totalMiguel / total) * 100)}%)

  Lógica aplicada:
    1. extractRefCode(ref) → REF_CODE_MAP  (FEDE→fede, SF→miguel)
    2. agente textual     → AGENTE_MAP    (FEDERICO JESÚS→fede, Samuel→miguel)
    3. Catch-all          → Miguel

  ${APPLY ? "✅  Cambios persistidos en BD." : "⚠️  DRY RUN — ejecuta con --apply para persistir."}
`);

  if (APPLY) {
    console.log("  Verifica con: npx tsx scripts/diagnose-comerciales-orphans.ts\n");
  }
}

main()
  .catch((e) => { console.error("[reassign-orphan-records] Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
