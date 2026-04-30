import { NextResponse } from "next/server";
import { forbidden, getSessionFromRequest, isCeoOrAdmin, unauthorized } from "@/lib/auth/session";
import { withObservedRoute } from "@/lib/observability";
import { syncWhatsAppTemplates } from "@/lib/whatsapp/templates/sync";

const postHandler = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorized();
  if (!isCeoOrAdmin(session.role)) return forbidden();

  try {
    const result = await syncWhatsAppTemplates();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[POST /api/admin/whatsapp/templates/sync]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error sincronizando plantillas WhatsApp",
      },
      { status: 500 },
    );
  }
};

export const POST = withObservedRoute(
  { method: "POST", route: "/api/admin/whatsapp/templates/sync" },
  postHandler,
);

export const maxDuration = 60;
