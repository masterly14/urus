import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api/cron-auth";
import { scanAndSendSignatureReminders } from "@/lib/signaturit/reminder-scanner";
import { withObservedRoute } from "@/lib/observability";


/**
 * Cron de recordatorios de firma digital.
 * Ejecutar cada 12h (Upstash QStash schedule).
 *
 * Revisa SignatureRequests pendientes, envía recordatorios WhatsApp
 * según cadencia D+1/D+3/D+5 y escala por SLA (5 días por defecto).
 */
const postHandler = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanAndSendSignatureReminders();

    console.log(
      `[cron/signature-reminders] scanned=${result.scanned} reminders=${result.reminders} escalations=${result.escalations} errors=${result.errors}`,
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/signature-reminders] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al procesar recordatorios de firma" },
      { status: 500 },
    );
  }
}

export const POST = withObservedRoute({ method: "POST", route: "/api/cron/signature-reminders" }, postHandler);

export const maxDuration = 60;
