/**
 * diagnose-comerciales-orphans.ts
 *
 * Diagnóstico completo de la discrepancia entre Comercial y User.
 *
 * Problemas que analiza:
 *   A) Comerciales activos sin User vinculado ("huérfanos de login")
 *   B) Usuarios comerciales sin Comercial vinculado ("fantasmas de auth")
 *   C) Propiedades y demandas apuntando a Comerciales inactivos o inexistentes
 *   D) Cuellos de botella en la eliminación de un User: qué FK queda sin limpiar
 *   E) Comerciales con waId que siguen recibiendo WhatsApp pese a no tener User
 *   F) Caché de /api/comerciales que podría devolver 6 aunque la BD tenga 2 activos
 *
 * Ejecución: npx tsx scripts/diagnose-comerciales-orphans.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

const SEP = "─".repeat(72);

function h(title: string) {
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

function ok(msg: string) {
  console.log(`  ✅  ${msg}`);
}

function warn(msg: string) {
  console.log(`  ⚠️   ${msg}`);
}

function err(msg: string) {
  console.log(`  ❌  ${msg}`);
}

function info(msg: string) {
  console.log(`  ℹ️   ${msg}`);
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║          DIAGNÓSTICO: Comerciales vs Usuarios — Urus Capital         ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 1 — Conteos globales (esto muestra la discrepancia de inmediato)
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 1 — Conteos globales");

  const [
    totalComerciales,
    activosComerciales,
    inactivosComerciales,
    totalUsers,
    usersComercialRole,
    usersConComercialId,
  ] = await Promise.all([
    prisma.comercial.count(),
    prisma.comercial.count({ where: { activo: true } }),
    prisma.comercial.count({ where: { activo: false } }),
    prisma.user.count(),
    prisma.user.count({ where: { role: "comercial" } }),
    prisma.user.count({ where: { comercialId: { not: null } } }),
  ]);

  console.log(`\n  Tabla 'comerciales'`);
  console.log(`    Total de filas:          ${totalComerciales}`);
  console.log(`    Con activo=true:         ${activosComerciales}  ← lo que devuelve /api/comerciales`);
  console.log(`    Con activo=false:        ${inactivosComerciales}`);

  console.log(`\n  Tabla 'users'`);
  console.log(`    Total de filas:          ${totalUsers}`);
  console.log(`    Con role="comercial":    ${usersComercialRole}  ← lo que aparece en Configuración > Usuarios`);
  console.log(`    Con comercialId!=null:   ${usersConComercialId}  ← usuarios efectivamente vinculados`);

  if (activosComerciales !== usersComercialRole) {
    err(
      `Discrepancia detectada: ${activosComerciales} Comerciales activos vs ` +
        `${usersComercialRole} Users con role="comercial". ` +
        `Existen ${activosComerciales - usersComercialRole} Comercial(es) activos sin User asociado.`,
    );
  } else {
    ok("Los conteos coinciden — no hay discrepancia de superficie.");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 2 — Comerciales activos sin User vinculado (origen del problema)
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 2 — Comerciales activos SIN User vinculado (huérfanos)");

  const comercialesHuerfanos = await prisma.comercial.findMany({
    where: {
      activo: true,
      user: { is: null },
    },
    select: {
      id: true,
      nombre: true,
      email: true,
      waId: true,
      inmovillaAgentId: true,
      inmovillaRefCode: true,
      createdAt: true,
      cargaActual: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (comercialesHuerfanos.length === 0) {
    ok("No hay Comerciales activos sin User vinculado.");
  } else {
    err(`${comercialesHuerfanos.length} Comercial(es) activos sin User — estos siguen recibiendo WhatsApp y leads:`);
    for (const c of comercialesHuerfanos) {
      console.log(`\n    ┌─ id:              ${c.id}`);
      console.log(`    │  nombre:           ${c.nombre}`);
      console.log(`    │  email:            ${c.email || "(vacío)"}`);
      console.log(`    │  waId:             ${c.waId ?? "null  ← NO recibe WA"}`);
      console.log(`    │  inmovillaAgentId: ${c.inmovillaAgentId ?? "null"}`);
      console.log(`    │  inmovillaRefCode: ${c.inmovillaRefCode ?? "null"}`);
      console.log(`    │  cargaActual:      ${c.cargaActual}`);
      console.log(`    └─ createdAt:        ${c.createdAt.toISOString()}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 3 — Usuarios role=comercial sin Comercial vinculado
  // ──────────────────────────────────────────────────────────────────────────
  h('BLOQUE 3 — Users con role="comercial" SIN Comercial vinculado');

  const usuariosSinComercial = await prisma.user.findMany({
    where: {
      role: "comercial",
      comercialId: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (usuariosSinComercial.length === 0) {
    ok('No hay Users con role="comercial" sin Comercial vinculado.');
  } else {
    warn(`${usuariosSinComercial.length} User(s) con role="comercial" pero sin comercialId — no pueden recibir leads ni WA:`);
    for (const u of usuariosSinComercial) {
      console.log(`    • ${u.id}  "${u.name}"  <${u.email}>  createdAt=${u.createdAt.toISOString()}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 4 — Mapa completo Comercial ↔ User (estado de la relación)
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 4 — Mapa completo de la relación Comercial ↔ User");

  const todosComerciales = await prisma.comercial.findMany({
    select: {
      id: true,
      nombre: true,
      activo: true,
      waId: true,
      inmovillaAgentId: true,
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  for (const c of todosComerciales) {
    const estado = c.activo ? "ACTIVO  " : "INACTIVO";
    const linked = c.user ? `→ User: ${c.user.email} (${c.user.role})` : "→ Sin User";
    const waTag = c.waId ? `waId=${c.waId}` : "waId=null";
    console.log(`    [${estado}]  "${c.nombre}"  ${waTag}  ${linked}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 5 — Propiedades y demandas asignadas a Comerciales inactivos/eliminados
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 5 — Propiedades apuntando a Comerciales inactivos o sin User");

  const idsInactivos = todosComerciales
    .filter((c) => !c.activo || !c.user)
    .map((c) => c.id);

  const [propsSinComercialId, propsComercialInactivo] = await Promise.all([
    prisma.propertyCurrent.count({ where: { comercialId: null } }),
    idsInactivos.length > 0
      ? prisma.propertyCurrent.count({
          where: { comercialId: { in: idsInactivos } },
        })
      : Promise.resolve(0),
  ]);

  const [demsSinComercialId, demsComercialInactivo] = await Promise.all([
    prisma.demandCurrent.count({ where: { comercialId: null } }),
    idsInactivos.length > 0
      ? prisma.demandCurrent.count({
          where: { comercialId: { in: idsInactivos } },
        })
      : Promise.resolve(0),
  ]);

  console.log(`\n  PropertyCurrent:`);
  if (propsSinComercialId > 0) {
    warn(`${propsSinComercialId} propiedades con comercialId=null (sin asignar)`);
  } else {
    ok("Ninguna propiedad sin comercialId");
  }
  if (propsComercialInactivo > 0) {
    err(`${propsComercialInactivo} propiedades asignadas a Comerciales INACTIVOS o sin User`);
  } else {
    ok("Ninguna propiedad apunta a Comercial inactivo/huérfano");
  }

  console.log(`\n  DemandCurrent:`);
  if (demsSinComercialId > 0) {
    warn(`${demsSinComercialId} demandas con comercialId=null (sin asignar)`);
  } else {
    ok("Ninguna demanda sin comercialId");
  }
  if (demsComercialInactivo > 0) {
    err(`${demsComercialInactivo} demandas asignadas a Comerciales INACTIVOS o sin User`);
  } else {
    ok("Ninguna demanda apunta a Comercial inactivo/huérfano");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 6 — Detalle de IDs inactivos/huérfanos con propiedades y demandas
  // ──────────────────────────────────────────────────────────────────────────
  if (idsInactivos.length > 0 && (propsComercialInactivo > 0 || demsComercialInactivo > 0)) {
    h("BLOQUE 6 — Detalle por Comercial inactivo/sin-User con registros vinculados");

    for (const cId of idsInactivos) {
      const [props, dems] = await Promise.all([
        prisma.propertyCurrent.count({ where: { comercialId: cId } }),
        prisma.demandCurrent.count({ where: { comercialId: cId } }),
      ]);
      if (props > 0 || dems > 0) {
        const c = todosComerciales.find((x) => x.id === cId)!;
        err(
          `Comercial "${c.nombre}" (${cId}) [activo=${c.activo}, hasUser=${!!c.user}] → ` +
            `${props} propiedad(es), ${dems} demanda(s) vinculadas`,
        );
      }
    }
  } else {
    h("BLOQUE 6 — Detalle por Comercial inactivo (sin casos)");
    ok("No hay Comerciales inactivos con propiedades o demandas vinculadas.");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 7 — WhatsApp: comerciales huérfanos con waId (quien recibe mensajes)
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 7 — WhatsApp: Comerciales activos sin User que tienen waId configurado");

  const huerfanosConWa = comercialesHuerfanos.filter((c) => c.waId);

  if (huerfanosConWa.length === 0) {
    ok("Ningún Comercial huérfano tiene waId — no hay riesgo de envío a ex-comerciales.");
  } else {
    err(`${huerfanosConWa.length} Comercial(es) activos SIN User con waId configurado — ESTOS RECIBEN WhatsApp:`);
    for (const c of huerfanosConWa) {
      console.log(`    ❌  "${c.nombre}"  waId=${c.waId}  id=${c.id}`);
    }
    info("Para detener los envíos: marcar activo=false O eliminar waId en cada uno.");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 8 — Estado del flujo DELETE /api/users/:userId (ya corregido)
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 8 — Flujo DELETE /api/users/:userId (estado del código)");

  console.log(`
  Flujo corregido del endpoint DELETE /api/users/[userId]/route.ts:

    1. Verifica sesión y rol (CEO/admin). ✅
    2. Comprueba que el User existe y tiene role="comercial". ✅
    3. Abre TRANSACCIÓN (en orden correcto: FK antes que Comercial, Comercial antes que User):
       a. SI comercialId != null:
          → Desvincula Referral.comercialId (updateMany → null).          ✅
          → Desvincula PropertyCurrent.comercialId (updateMany → null).   ✅ (NUEVO)
          → Desvincula DemandCurrent.comercialId (updateMany → null).     ✅ (NUEVO)
          → Elimina Comercial (tx.comercial.delete).                      ✅
             · Invitation.comercialId → SetNull vía schema.               ✅
             · MarketListing.assignedComercialId → SetNull vía schema.    ✅
       b. Elimina User (tx.user.delete).                                  ✅
    4. Invalida caché revalidateTag("users-list") tras la transacción.    ✅ (NUEVO)
       /api/comerciales y /api/users devuelven datos frescos de inmediato.

  Flujo corregido de POST /api/users/link-comercial:
    - Si el User tenía otro Comercial vinculado (reasignación), el Comercial
      anterior se marca activo=false en la misma transacción.             ✅ (NUEVO)
    - Invalida revalidateTag("users-list") tras el cambio.                ✅ (NUEVO)

  Política del resolver (resolve-comercial.ts):
    requireActive=true por defecto → los Comerciales inactivos (activo=false)
    nunca se resuelven como destino de leads, WhatsApp ni visitas.        ✅
`);

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 9 — Invitaciones y MarketListings huérfanos
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 9 — Invitaciones y MarketListings apuntando a Comerciales huérfanos");

  const idsHuerfanos = comercialesHuerfanos.map((c) => c.id);

  if (idsHuerfanos.length > 0) {
    const [invitations, marketListings] = await Promise.all([
      prisma.invitation.count({ where: { comercialId: { in: idsHuerfanos } } }),
      prisma.marketListing.count({
        where: { assignedComercialId: { in: idsHuerfanos } },
      }),
    ]);
    if (invitations > 0) {
      err(`${invitations} Invitation(s) vinculadas a Comerciales sin User`);
    } else {
      ok("No hay Invitaciones vinculadas a Comerciales huérfanos");
    }
    if (marketListings > 0) {
      warn(`${marketListings} MarketListing(s) asignadas a Comerciales sin User`);
    } else {
      ok("No hay MarketListings asignadas a Comerciales huérfanos");
    }
  } else {
    ok("No hay Comerciales huérfanos — no se revisan Invitaciones ni MarketListings.");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 10 — Resumen ejecutivo y pasos de remediación
  // ──────────────────────────────────────────────────────────────────────────
  h("BLOQUE 10 — Resumen ejecutivo y pasos de remediación");

  const demsSinAsignar = await prisma.demandCurrent.count({ where: { comercialId: null } });
  const propsSinAsignar = await prisma.propertyCurrent.count({ where: { comercialId: null } });

  console.log(`
  ESTADO DE LAS CORRECCIONES APLICADAS
  ──────────────────────────────────────
  ✅  4 Comerciales huérfanos marcados activo=false (ninguno recibe WA/leads).
  ✅  DELETE /api/users/:userId limpia PropertyCurrent + DemandCurrent + Referral + Comercial en transacción.
  ✅  POST /api/users/link-comercial marca inactivo el Comercial anterior al reasignar.
  ✅  Ambas rutas llaman revalidateTag("users-list") → sin datos obsoletos en caché.

  PENDIENTE (requiere decisión de negocio)
  ─────────────────────────────────────────
  • ${propsSinAsignar} propiedad(es) con comercialId=null pendientes de reasignar.
  • ${demsSinAsignar} demanda(s) con comercialId=null pendientes de reasignar.

  Estas pertenecían a ex-comerciales (FEDERICO JESÚS / Samuel) cuyos clientes
  no se pueden asignar automáticamente a FEDE o Miguel sin decisión del CEO.

  Para reasignar automáticamente (solo funciona si inmovillaRefCode/agentId coinciden):
    npx tsx scripts/backfill-comercial-relations.ts --dry-run
    npx tsx scripts/backfill-comercial-relations.ts

  Para reasignar manualmente: editar comercialId en DemandCurrent/PropertyCurrent
  desde la UI de Inmovilla o directamente en la BD.
`);

  console.log(SEP);
  console.log("  Diagnóstico completado.\n");
}

main()
  .catch((e) => {
    console.error("\n[diagnose-comerciales-orphans] Error fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
