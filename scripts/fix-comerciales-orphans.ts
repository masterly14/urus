/**
 * fix-comerciales-orphans.ts
 *
 * Remediación de datos: Comerciales activos sin User vinculado.
 *
 * Acciones:
 *   1. Marca activo=false en los 4 Comerciales sin User.
 *   2. Libera PropertyCurrent.comercialId (→ null) para sus propiedades.
 *   3. Libera DemandCurrent.comercialId (→ null) para sus demandas.
 *   4. Imprime un resumen de reasignación pendiente (manual o backfill).
 *
 * Ejecución (dry-run):   npx tsx scripts/fix-comerciales-orphans.ts
 * Ejecución (real):      npx tsx scripts/fix-comerciales-orphans.ts --apply
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const SEP = "─".repeat(72);

function h(s: string) { console.log(`\n${SEP}\n  ${s}\n${SEP}`); }
function ok(s: string) { console.log(`  ✅  ${s}`); }
function warn(s: string) { console.log(`  ⚠️   ${s}`); }
function action(s: string) { console.log(`  ${APPLY ? "→" : "  [dry-run]"}  ${s}`); }

async function main() {
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║   Remediación: Comerciales huérfanos — Urus Capital   ║`);
  console.log(`║   Modo: ${APPLY ? "APPLY (escribe en BD)           " : "DRY RUN (solo lectura)          "}   ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);

  if (!APPLY) {
    console.log("  ⚠️  Pasa --apply para ejecutar los cambios reales.\n");
  }

  // ── PASO 1: Localizar todos los Comerciales activos sin User ──────────────
  h("PASO 1 — Localizar Comerciales activos sin User");

  const huerfanos = await prisma.comercial.findMany({
    where: { activo: true, user: { is: null } },
    select: {
      id: true,
      nombre: true,
      email: true,
      waId: true,
      inmovillaRefCode: true,
    },
    orderBy: { nombre: "asc" },
  });

  if (huerfanos.length === 0) {
    ok("No hay Comerciales activos sin User. Nada que hacer.");
    return;
  }

  console.log(`  Encontrados ${huerfanos.length} Comercial(es) a desactivar:\n`);
  for (const c of huerfanos) {
    console.log(`    • "${c.nombre}"  id=${c.id}  refCode=${c.inmovillaRefCode ?? "—"}  waId=${c.waId ?? "null"}`);
  }

  const ids = huerfanos.map((c) => c.id);

  // ── PASO 2: Liberar PropertyCurrent.comercialId ───────────────────────────
  h("PASO 2 — Liberar PropertyCurrent.comercialId");

  const props = await prisma.propertyCurrent.findMany({
    where: { comercialId: { in: ids } },
    select: { codigo: true, agente: true, comercialId: true },
  });

  console.log(`  ${props.length} propiedad(es) afectadas:`);
  for (const p of props) {
    const nombre = huerfanos.find((c) => c.id === p.comercialId)?.nombre ?? p.comercialId;
    console.log(`    • ${p.codigo}  agente="${p.agente}"  comercialId=${p.comercialId} ("${nombre}")`);
  }

  if (APPLY && props.length > 0) {
    await prisma.propertyCurrent.updateMany({
      where: { comercialId: { in: ids } },
      data: { comercialId: null },
    });
    ok(`${props.length} propiedad(es) liberadas (comercialId → null)`);
  } else {
    action(`updateMany PropertyCurrent: comercialId → null para ${props.length} filas`);
  }

  // ── PASO 3: Liberar DemandCurrent.comercialId ─────────────────────────────
  h("PASO 3 — Liberar DemandCurrent.comercialId");

  const dems = await prisma.demandCurrent.findMany({
    where: { comercialId: { in: ids } },
    select: { codigo: true, nombre: true, comercialId: true },
  });

  console.log(`  ${dems.length} demanda(s) afectadas:`);

  // Agrupar por comercial para legibilidad
  const demsByComercial: Record<string, typeof dems> = {};
  for (const d of dems) {
    const cId = d.comercialId ?? "null";
    if (!demsByComercial[cId]) demsByComercial[cId] = [];
    demsByComercial[cId].push(d);
  }
  for (const [cId, group] of Object.entries(demsByComercial)) {
    const nombre = huerfanos.find((c) => c.id === cId)?.nombre ?? cId;
    console.log(`    → ${group.length} demanda(s) de "${nombre}":`);
    for (const d of group.slice(0, 5)) {
      console.log(`       • ${d.codigo} "${d.nombre}"`);
    }
    if (group.length > 5) {
      console.log(`       … y ${group.length - 5} más`);
    }
  }

  if (APPLY && dems.length > 0) {
    await prisma.demandCurrent.updateMany({
      where: { comercialId: { in: ids } },
      data: { comercialId: null },
    });
    ok(`${dems.length} demanda(s) liberadas (comercialId → null)`);
  } else {
    action(`updateMany DemandCurrent: comercialId → null para ${dems.length} filas`);
  }

  // ── PASO 4: Marcar activo=false en los Comerciales huérfanos ─────────────
  h("PASO 4 — Marcar activo=false en Comerciales sin User");

  if (APPLY) {
    await prisma.comercial.updateMany({
      where: { id: { in: ids } },
      data: { activo: false },
    });
    ok(`${ids.length} Comercial(es) marcados activo=false. El resolver los ignorará.`);
  } else {
    for (const c of huerfanos) {
      action(`UPDATE comerciales SET activo=false WHERE id='${c.id}'; -- "${c.nombre}"`);
    }
  }

  // ── PASO 5: Resumen post-remediación ─────────────────────────────────────
  h("PASO 5 — Próximos pasos (reasignación manual)");

  const activos = await prisma.comercial.findMany({
    where: { activo: true, user: { isNot: null } },
    select: {
      id: true,
      nombre: true,
      inmovillaAgentId: true,
      inmovillaRefCode: true,
      user: { select: { email: true } },
    },
    orderBy: { nombre: "asc" },
  });

  console.log(`\n  Comerciales activos CON User tras la remediación:`);
  for (const c of activos) {
    console.log(`    • "${c.nombre}"  id=${c.id}  agentId=${c.inmovillaAgentId ?? "null"}  refCode=${c.inmovillaRefCode ?? "—"}  user=${c.user?.email ?? "—"}`);
  }

  console.log(`
  Las ${props.length + dems.length} propiedades/demandas liberadas tienen ahora comercialId=null.
  Para reasignarlas automáticamente ejecuta:

    npx tsx scripts/backfill-comercial-relations.ts --dry-run
    npx tsx scripts/backfill-comercial-relations.ts

  Esto usará inmovillaAgentId/inmovillaRefCode/nombre para resolverlas
  contra los ${activos.length} Comerciales activos con User.
`);

  if (!APPLY) {
    warn("DRY RUN finalizado — ejecuta con --apply para persistir los cambios.");
  } else {
    ok("Remediación completada. Ejecuta el diagnóstico para verificar:");
    console.log("    npx tsx scripts/diagnose-comerciales-orphans.ts\n");
  }
}

main()
  .catch((e) => {
    console.error("[fix-comerciales-orphans] Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
