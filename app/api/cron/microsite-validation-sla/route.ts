import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/microsite/app-url";
import { sendMicrositeValidationEscalation } from "@/lib/whatsapp/send";
import { withObservedRoute } from "@/lib/observability";


/**
 * Cron: selecciones pendientes de validación con SLA vencido → escalado (WhatsApp).
 * Idempotente vía `escalatedAt`.
 */
const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const escalationTo = process.env.MICROSITE_VALIDATION_ESCALATION_TO?.trim();
  const now = new Date();

  const overdue = await prisma.micrositeSelection.findMany({
    where: {
      status: "PENDING_VALIDATION",
      validationDueAt: { lt: now },
      escalatedAt: null,
    },
    select: {
      id: true,
      validationToken: true,
      demandId: true,
      demandNombre: true,
      validationDueAt: true,
    },
    take: 50,
  });

  let escalated = 0;
  const errors: string[] = [];

  for (const row of overdue) {
    const base = getPublicAppUrl();
    const validationUrl = `${base}/validar-seleccion/${row.validationToken}`;
    const dueIso = row.validationDueAt?.toISOString() ?? "";

    try {
      if (escalationTo && escalationTo.length >= 9) {
        const digits = escalationTo.replace(/\D/g, "");
        await sendMicrositeValidationEscalation(digits, {
          demandId: row.demandId,
          demandNombre: row.demandNombre,
          validationUrl,
          validationDueAtIso: dueIso,
        });
      } else {
        console.warn(
          "[cron:microsite-validation-sla] MICROSITE_VALIDATION_ESCALATION_TO no configurado — solo marcamos escalado",
        );
      }

      await prisma.micrositeSelection.update({
        where: { id: row.id },
        data: { escalatedAt: now },
      });
      escalated += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${row.id}: ${msg}`);
      console.error(`[cron:microsite-validation-sla] ${row.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: overdue.length,
    escalated,
    errors: errors.length ? errors : undefined,
  });
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/microsite-validation-sla" }, postHandler);

export const maxDuration = 60;
