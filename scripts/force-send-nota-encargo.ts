/**
 * Forzar el envío inmediato de un paso de la Nota de Encargo (rescate).
 *
 * Ejecuta el handler en caliente sin pasar por QStash ni la cola. Útil cuando
 * un paso no llegó en su momento por un fallo del programador o para reenviar
 * tras una corrección.
 *
 * Uso:
 *   npx tsx scripts/force-send-nota-encargo.ts --session-id <id> --step <step> [--confirm] [--force]
 *
 * Steps:
 *   recordatorio          recordatorio al propietario (2h antes)
 *   check-confirmacion    aviso al comercial si no confirmó (30 min antes)
 *   formulario            WhatsApp Flow del formulario (a la hora de la visita)
 *   matching-check        deadline si no hay propiedad vinculada (N días después)
 *
 * Flags:
 *   --confirm   Aplica el envío real (sin él, dry-run).
 *   --force     Resetea el estado al previo esperado por el step si la sesión
 *               ya pasó de ese estado (sólo aplicable a recordatorio/formulario).
 */

import "dotenv/config";
import type { NotaEncargoState } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  sendNotaEncargoRecordatorioForSession,
  checkNotaEncargoConfirmacionForSession,
  sendNotaEncargoFormularioForSession,
  runNotaEncargoMatchingCheckForSession,
  type NotaEncargoSendResult,
} from "../lib/nota-encargo/send";

type Step =
  | "recordatorio"
  | "check-confirmacion"
  | "formulario"
  | "matching-check";

type Opts = {
  sessionId?: string;
  step?: Step;
  confirm: boolean;
  force: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): Opts {
  const opts: Opts = { confirm: false, force: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--confirm") opts.confirm = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--session-id") opts.sessionId = argv[++i];
    else if (arg === "--step") opts.step = argv[++i] as Step;
    else console.warn(`[force-send-nota-encargo] flag desconocido: ${arg}`);
  }
  return opts;
}

function usage() {
  console.log(
    [
      "Forzar el envío de un paso de la Nota de Encargo.",
      "",
      "Uso:",
      "  npx tsx scripts/force-send-nota-encargo.ts --session-id <id> --step <recordatorio|check-confirmacion|formulario|matching-check> [--confirm] [--force]",
    ].join("\n"),
  );
}

const STEP_TO_PREV_STATE: Record<Step, NotaEncargoState | null> = {
  recordatorio: "PENDING",
  "check-confirmacion": "RECORDATORIO_ENVIADO",
  formulario: "CONFIRMADA",
  "matching-check": null,
};

async function runStep(
  step: Step,
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  switch (step) {
    case "recordatorio":
      return sendNotaEncargoRecordatorioForSession(sessionId);
    case "check-confirmacion":
      return checkNotaEncargoConfirmacionForSession(sessionId);
    case "formulario":
      return sendNotaEncargoFormularioForSession(sessionId);
    case "matching-check":
      return runNotaEncargoMatchingCheckForSession(sessionId);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    process.exit(0);
  }
  if (!opts.sessionId || !opts.step) {
    usage();
    process.exit(1);
  }
  if (!STEP_TO_PREV_STATE.hasOwnProperty(opts.step)) {
    console.error(`[force-send-nota-encargo] step inválido: ${opts.step}`);
    process.exit(1);
  }

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: opts.sessionId },
    select: {
      id: true,
      state: true,
      visitDateTime: true,
      propietarioPhone: true,
      propertyRef: true,
      refCatastral: true,
      direccion: true,
      comercialId: true,
      propertyCode: true,
    },
  });

  if (!session) {
    console.error(`[force-send-nota-encargo] sesión ${opts.sessionId} no encontrada`);
    process.exit(2);
  }

  console.log("\n=== Force Send Nota de Encargo ===");
  console.log(`Session ID         : ${session.id}`);
  console.log(`State              : ${session.state}`);
  console.log(`Visit datetime     : ${session.visitDateTime.toISOString()}`);
  console.log(`Owner phone        : ${session.propietarioPhone}`);
  console.log(`Property ref       : ${session.propertyRef ?? "—"}`);
  console.log(`Step               : ${opts.step}`);
  console.log(`Modo               : ${opts.confirm ? "APPLY" : "DRY-RUN"}`);
  console.log(`Force reset state  : ${opts.force}`);

  if (!opts.confirm) {
    console.log("\nDry-run: no se envía nada. Re-ejecuta con --confirm para aplicar.");
    await prisma.$disconnect();
    return;
  }

  const requiredPrev = STEP_TO_PREV_STATE[opts.step];
  if (requiredPrev && session.state !== requiredPrev) {
    if (!opts.force) {
      console.error(
        `\n[force-send-nota-encargo] state=${session.state} (≠ ${requiredPrev}). Usa --force para resetear.`,
      );
      await prisma.$disconnect();
      process.exit(3);
    }
    await prisma.notaEncargoSession.update({
      where: { id: session.id },
      data: { state: requiredPrev },
    });
    console.log(`[force-send-nota-encargo] Estado reseteado a ${requiredPrev} (--force).`);
  }

  const result = await runStep(opts.step, session.id);
  if (!result.ok) {
    console.error(
      `\n[force-send-nota-encargo] FALLÓ: ${result.error} (permanent=${result.permanent})`,
    );
    await prisma.$disconnect();
    process.exit(4);
  }

  console.log(`\n[force-send-nota-encargo] OK status=${result.status}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(
    "[force-send-nota-encargo] ERROR:",
    err instanceof Error ? err.message : err,
  );
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(99);
});
