/**
 * Migrar sesiones del flujo legacy (confirmación del propietario) al envío
 * directo al comercial.
 *
 * Para sesiones futuras aún no enviadas:
 *   - Normaliza estado a PENDING o PENDIENTE_PROPIEDAD
 *   - Publica formulario en QStash a visitDateTime
 *
 * Uso:
 *   npx tsx scripts/migrate-nota-encargo-drop-confirmacion.ts
 *   npx tsx scripts/migrate-nota-encargo-drop-confirmacion.ts --confirm
 */

import "dotenv/config";
import type { NotaEncargoState } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { publishNotaEncargoFormularioSchedule } from "../lib/nota-encargo/schedule";

const CONFIRM = process.argv.includes("--confirm");

const LEGACY_PRE_SEND: NotaEncargoState[] = [
  "RECORDATORIO_ENVIADO",
  "CONFIRMADA",
  "NO_CONFIRMADA",
];

const READY: NotaEncargoState[] = ["PENDING", "PENDIENTE_PROPIEDAD"];

const POST_SEND: NotaEncargoState[] = [
  "FORMULARIO_ENVIADO",
  "FORMULARIO_COMPLETADO",
  "FIRMA_ENVIADA",
  "FIRMADA",
  "DOCUMENTO_ENVIADO",
];

function targetReadyState(session: {
  propertyCode: string | null;
}): NotaEncargoState {
  return session.propertyCode ? "PENDING" : "PENDIENTE_PROPIEDAD";
}

async function main() {
  const now = new Date();
  console.log(`\n=== Migrar Nota de Encargo: eliminar confirmación ===`);
  console.log(`Now  : ${now.toISOString()}`);
  console.log(`Mode : ${CONFIRM ? "APPLY" : "DRY-RUN"}\n`);

  const future = await prisma.notaEncargoSession.findMany({
    where: {
      visitDateTime: { gte: now },
      state: { notIn: ["CANCELADA", ...POST_SEND] },
    },
    orderBy: { visitDateTime: "asc" },
  });

  let normalized = 0;
  let scheduled = 0;
  let skipped = 0;
  let errors = 0;

  for (const session of future) {
    const readyState = targetReadyState(session);
    const needsNormalize =
      LEGACY_PRE_SEND.includes(session.state) || !READY.includes(session.state);

    if (POST_SEND.includes(session.state)) {
      skipped++;
      continue;
    }

    if (!CONFIRM) {
      console.log(
        `  · ${session.id} state=${session.state} visit=${session.visitDateTime.toISOString()} → would set ${readyState} + schedule formulario`,
      );
      continue;
    }

    try {
      if (needsNormalize) {
        await prisma.notaEncargoSession.update({
          where: { id: session.id },
          data: { state: readyState },
        });
        normalized++;
      }

      if (!POST_SEND.includes(session.state)) {
        await publishNotaEncargoFormularioSchedule({
          sessionId: session.id,
          sendAt: session.visitDateTime,
        });
        scheduled++;
        console.log(
          `  ✓ ${session.id} → ${readyState}, formulario @ ${session.visitDateTime.toISOString()}`,
        );
      }
    } catch (err) {
      errors++;
      console.error(
        `  ✗ ${session.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const pastStuck = await prisma.notaEncargoSession.findMany({
    where: {
      visitDateTime: { lt: now },
      state: { in: [...READY, ...LEGACY_PRE_SEND] },
    },
    orderBy: { visitDateTime: "desc" },
    take: 20,
    select: { id: true, state: true, visitDateTime: true, propietarioPhone: true },
  });

  console.log(`\n=== Resumen futuras ===`);
  console.log(`  Revisadas   : ${future.length}`);
  console.log(`  Normalizadas: ${normalized}`);
  console.log(`  Programadas : ${scheduled}`);
  console.log(`  Errores     : ${errors}`);

  if (pastStuck.length > 0) {
    console.log(`\n=== Pasadas stuck (rescate manual) ===`);
    for (const s of pastStuck) {
      console.log(
        `  npm run nota-encargo:force-send -- --session-id ${s.id} --step formulario --confirm --force  # ${s.state} ${s.propietarioPhone}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[migrate-nota-encargo-drop-confirmacion] ERROR:", err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
