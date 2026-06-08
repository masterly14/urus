/**
 * Forzar el envío inmediato de un paso de la Nota de Encargo (rescate).
 *
 * Uso:
 *   npx tsx scripts/force-send-nota-encargo.ts --session-id <id> --step formulario [--confirm] [--force]
 *   npx tsx scripts/force-send-nota-encargo.ts --session-id <id> --step matching-check [--confirm]
 */

import "dotenv/config";
import type { NotaEncargoState } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  sendNotaEncargoFormularioForSession,
  runNotaEncargoMatchingCheckForSession,
  type NotaEncargoSendResult,
} from "../lib/nota-encargo/send";

type Step = "formulario" | "matching-check";

const READY_FOR_FORMULARIO: NotaEncargoState[] = [
  "PENDING",
  "PENDIENTE_PROPIEDAD",
];

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
      "  npx tsx scripts/force-send-nota-encargo.ts --session-id <id> --step formulario [--confirm] [--force]",
      "  npx tsx scripts/force-send-nota-encargo.ts --session-id <id> --step matching-check [--confirm]",
    ].join("\n"),
  );
}

async function runStep(
  step: Step,
  sessionId: string,
): Promise<NotaEncargoSendResult> {
  switch (step) {
    case "formulario":
      return sendNotaEncargoFormularioForSession(sessionId);
    case "matching-check":
      return runNotaEncargoMatchingCheckForSession(sessionId);
  }
}

function resetStateForFormulario(session: {
  propertyCode: string | null;
}): NotaEncargoState {
  return session.propertyCode ? "PENDING" : "PENDIENTE_PROPIEDAD";
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

  const session = await prisma.notaEncargoSession.findUnique({
    where: { id: opts.sessionId },
    select: {
      id: true,
      state: true,
      visitDateTime: true,
      propietarioPhone: true,
      propertyRef: true,
      refCatastral: true,
      propertyCode: true,
      comercialId: true,
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

  if (opts.step === "formulario") {
    const canSend = READY_FOR_FORMULARIO.includes(session.state);
    if (!canSend) {
      if (!opts.force) {
        console.error(
          `\n[force-send-nota-encargo] state=${session.state} (≠ PENDING|PENDIENTE_PROPIEDAD). Usa --force para resetear y reenviar.`,
        );
        await prisma.$disconnect();
        process.exit(3);
      }
      const resetState = resetStateForFormulario(session);
      await prisma.notaEncargoSession.update({
        where: { id: session.id },
        data: { state: resetState },
      });
      console.log(`[force-send-nota-encargo] Estado reseteado a ${resetState} (--force).`);
    }
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
