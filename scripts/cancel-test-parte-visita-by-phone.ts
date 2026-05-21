/**
 * Cancela visitas de test por teléfono de comprador y evita cualquier envío.
 *
 * Acciones por cada ParteVisitaSession/VisitSchedulingSession encontrada:
 * - ParteVisitaSession.state = CANCELADA
 * - DELETE del mensaje QStash si hay qstashMessageId
 * - qstashMessageId = null si el DELETE respondió OK
 * - VisitSchedulingSession.state = VISIT_CANCELLED
 * - PropertyVisitSlot.cancelled = true
 * - VisitWorkItem.status = CANCELLED cuando apunte a la sesión
 *
 * Uso:
 *   npx tsx scripts/cancel-test-parte-visita-by-phone.ts --phone 346... --phone 346... --confirm
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

type Args = { phones: string[]; confirm: boolean };

function parseArgs(argv: string[]): Args {
  const phones: string[] = [];
  let confirm = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--phone") phones.push(argv[++i]);
    else if (arg === "--confirm") confirm = true;
    else console.warn(`[cancel-test] argumento ignorado: ${arg}`);
  }
  return { phones, confirm };
}

function digitsLast9(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9);
}

async function deleteQstashMessage(messageId: string): Promise<boolean> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.warn(`[cancel-test] QSTASH_TOKEN no configurado; no borro ${messageId}`);
    return false;
  }
  const res = await fetch(`https://qstash.upstash.io/v2/messages/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) return true;
  const body = await res.text().catch(() => "");
  console.warn(`[cancel-test] DELETE QStash ${messageId} => HTTP ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  return false;
}

async function main() {
  const { phones, confirm } = parseArgs(process.argv);
  if (phones.length === 0) {
    console.error("Uso: npx tsx scripts/cancel-test-parte-visita-by-phone.ts --phone <e164> [--phone ...] --confirm");
    process.exit(1);
  }

  console.log(`Modo: ${confirm ? "APPLY" : "DRY-RUN"}`);
  console.log(`Phones: ${phones.join(", ")}`);

  for (const phone of phones) {
    const last9 = digitsLast9(phone);
    console.log(`\n=== ${phone} (last9=${last9}) ===`);

    const partes = await prisma.parteVisitaSession.findMany({
      where: {
        OR: [
          { buyerPhone: phone },
          { buyerPhone: { endsWith: last9 } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (partes.length === 0) {
      console.log("  Sin ParteVisitaSession");
      continue;
    }

    for (const parte of partes) {
      if (!["PENDING", "CANCELADA"].includes(parte.state)) {
        console.log(
          `  SKIP Parte=${parte.id} state=${parte.state} visit=${parte.visitDateTime.toISOString()} (ya no es una visita pendiente de envío)`,
        );
        continue;
      }

      const visit = await prisma.visitSchedulingSession.findUnique({
        where: { id: parte.visitSessionId },
      });
      const workItems = await prisma.visitWorkItem.findMany({
        where: { scheduledSessionId: parte.visitSessionId },
        select: { id: true, status: true },
      });

      console.log(
        `  Parte=${parte.id} state=${parte.state} visit=${parte.visitDateTime.toISOString()} qstash=${parte.qstashMessageId ?? "(null)"}`,
      );
      console.log(
        `    Visit=${visit?.id ?? "(missing)"} state=${visit?.state ?? "(missing)"} calendar=${visit?.calendarEventId ?? "(null)"}`,
      );
      console.log(
        `    WorkItems=${workItems.map((w) => `${w.id}:${w.status}`).join(", ") || "(none)"}`,
      );

      if (!confirm) continue;

      let qstashDeleted = false;
      if (parte.qstashMessageId) {
        qstashDeleted = await deleteQstashMessage(parte.qstashMessageId);
      }

      await prisma.parteVisitaSession.update({
        where: { id: parte.id },
        data: {
          state: "CANCELADA",
          ...(qstashDeleted ? { qstashMessageId: null } : {}),
        },
      });

      if (visit) {
        await prisma.visitSchedulingSession.update({
          where: { id: visit.id },
          data: { state: "VISIT_CANCELLED" },
        });
        await prisma.propertyVisitSlot.updateMany({
          where: { sessionId: visit.id },
          data: { cancelled: true },
        });
      }

      await prisma.visitWorkItem.updateMany({
        where: { scheduledSessionId: parte.visitSessionId },
        data: { status: "CANCELLED" },
      });

      console.log(`    APPLY OK qstashDeleted=${qstashDeleted}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("[cancel-test] ERROR", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
