/**
 * Forzar envío inmediato del Parte de Visita (rescate).
 *
 * Llama `sendParteVisitaForSession` directamente en el proceso, sin pasar por
 * QStash ni por la cola. Útil cuando una visita ya pasó y nunca llegó el
 * mensaje en su momento, o para diagnóstico local.
 *
 * Uso:
 *   npx tsx scripts/force-send-parte-visita.ts --visit-session-id <id>
 *   npx tsx scripts/force-send-parte-visita.ts --parte-session-id <id>
 *   npx tsx scripts/force-send-parte-visita.ts --phone 34xxxxxxxxx        (la más reciente PENDING)
 *
 * Flags:
 *   --confirm     Aplica el envío real (sin él, dry-run).
 *   --force       Resetea estado a PENDING si la sesión ya pasó de PENDING
 *                 (p. ej. para reenviar tras un fallo).
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { sendParteVisitaForSession } from "../lib/parte-visita/send";

type Opts = {
  visitSessionId?: string;
  parteSessionId?: string;
  phone?: string;
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
    else if (arg === "--visit-session-id") opts.visitSessionId = argv[++i];
    else if (arg === "--parte-session-id") opts.parteSessionId = argv[++i];
    else if (arg === "--phone") opts.phone = argv[++i];
    else console.warn(`[force-send-parte-visita] flag desconocido: ${arg}`);
  }
  return opts;
}

function usage() {
  console.log(
    [
      "Forzar envío del Parte de Visita (rescate).",
      "",
      "Uso:",
      "  npx tsx scripts/force-send-parte-visita.ts --visit-session-id <id> [--confirm] [--force]",
      "  npx tsx scripts/force-send-parte-visita.ts --parte-session-id <id> [--confirm] [--force]",
      "  npx tsx scripts/force-send-parte-visita.ts --phone <e164>          [--confirm] [--force]",
    ].join("\n"),
  );
}

async function resolveSessionId(opts: Opts): Promise<string | null> {
  if (opts.parteSessionId) return opts.parteSessionId;
  if (opts.visitSessionId) {
    const s = await prisma.parteVisitaSession.findUnique({
      where: { visitSessionId: opts.visitSessionId },
      select: { id: true },
    });
    return s?.id ?? null;
  }
  if (opts.phone) {
    const s = await prisma.parteVisitaSession.findFirst({
      where: { buyerPhone: opts.phone },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return s?.id ?? null;
  }
  return null;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    process.exit(0);
  }
  if (!opts.visitSessionId && !opts.parteSessionId && !opts.phone) {
    usage();
    process.exit(1);
  }

  const sessionId = await resolveSessionId(opts);
  if (!sessionId) {
    console.error("[force-send-parte-visita] No se encontró ninguna ParteVisitaSession para los criterios dados.");
    process.exit(2);
  }

  const session = await prisma.parteVisitaSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      visitSessionId: true,
      buyerPhone: true,
      state: true,
      visitDateTime: true,
      propertyRef: true,
      direccion: true,
    },
  });

  console.log("\n=== Force Send Parte de Visita ===");
  console.log(`ParteVisitaSession : ${session.id}`);
  console.log(`VisitSession       : ${session.visitSessionId}`);
  console.log(`Buyer phone        : ${session.buyerPhone}`);
  console.log(`State              : ${session.state}`);
  console.log(`Visit datetime     : ${session.visitDateTime.toISOString()}`);
  console.log(`Property ref       : ${session.propertyRef}`);
  console.log(`Modo               : ${opts.confirm ? "APPLY" : "DRY-RUN"}`);
  console.log(`Force reset state  : ${opts.force}`);

  if (!opts.confirm) {
    console.log("\nDry-run: no se envía nada. Re-ejecuta con --confirm para aplicar.");
    await prisma.$disconnect();
    return;
  }

  if (session.state !== "PENDING") {
    if (!opts.force) {
      console.error(
        `\n[force-send-parte-visita] state=${session.state} (≠ PENDING). Usa --force para resetear y reenviar.`,
      );
      await prisma.$disconnect();
      process.exit(3);
    }
    await prisma.parteVisitaSession.update({
      where: { id: session.id },
      data: { state: "PENDING" },
    });
    console.log(`[force-send-parte-visita] Estado reseteado a PENDING (--force).`);
  }

  const result = await sendParteVisitaForSession(session.id);
  if (!result.ok) {
    console.error(
      `\n[force-send-parte-visita] FALLÓ: ${result.error} (permanent=${result.permanent})`,
    );
    await prisma.$disconnect();
    process.exit(4);
  }

  console.log(`\n[force-send-parte-visita] OK status=${result.status}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[force-send-parte-visita] ERROR:", err instanceof Error ? err.message : err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(99);
});
