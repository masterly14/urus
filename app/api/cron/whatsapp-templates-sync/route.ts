import { NextResponse } from "next/server";
import { isQstashAuthorized } from "@/lib/api/cron-auth";
import { withObservedRoute } from "@/lib/observability";
import { syncWhatsAppTemplates } from "@/lib/whatsapp/templates/sync";

/**
 * Cron para mantener fresca la cache local de plantillas WABA.
 * Recomendado: 1x/dia mediante Upstash QStash.
 */
const postHandler = async (request: Request) => {
  if (!(await isQstashAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncWhatsAppTemplates();
    console.log(
      `[cron/whatsapp-templates-sync] fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped} syncedAt=${result.syncedAt}`,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/whatsapp-templates-sync] Error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Error al sincronizar plantillas de WhatsApp" },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/cron/whatsapp-templates-sync" },
  postHandler,
);

export const maxDuration = 60;
